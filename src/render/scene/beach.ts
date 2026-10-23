// The beach: one shared cross-section (sand height along z) used by both the sand mesh and the sea,
// so the sea knows its depth everywhere without a depth pass.
//
// Sand material: a CC0 PBR texture used as a gradient map: its light/dark detail (plus AO cavities and a
// large-scale copy against tiling) picks a color between LOOK.SAND_DARK (orange) and LOOK.SAND_LIGHT (yellow), a large-scale copy of the same texture to break
// up tiling, and a wet-sand texture blended in along the waterline.
import * as THREE from 'three';
import { LOOK } from '../look.ts';
import type { Manifest, SandAsset } from './assets.ts';

export const SEA_LEVEL = -0.12;
/** Flat dry sand ends here (behind the court, toward the sea, which is -z). */
export const BERM_Z = -6;
const SLOPE_LIN = 0.05; // foreshore slope (1:20)
const SLOPE_QUAD = 0.004; // gets steeper offshore

/** Sand height (m) at depth z. */
export function sandHeight(z: number): number {
  const t = Math.max(0, BERM_Z - z);
  return -(SLOPE_LIN * t + SLOPE_QUAD * t * t);
}

/** Same as sandHeight, for shaders. */
export const SAND_HEIGHT_GLSL = `
float sandHeight(float z) {
  float t = max(0.0, ${BERM_Z.toFixed(3)} - z);
  return -(${SLOPE_LIN.toFixed(4)} * t + ${SLOPE_QUAD.toFixed(4)} * t * t);
}`;

/** z of the still waterline (sandHeight = SEA_LEVEL). */
export const WATERLINE_Z = (() => {
  // solve SLOPE_QUAD t^2 + SLOPE_LIN t + SEA_LEVEL = 0
  const t = (-SLOPE_LIN + Math.sqrt(SLOPE_LIN * SLOPE_LIN - 4 * SLOPE_QUAD * SEA_LEVEL)) / (2 * SLOPE_QUAD);
  return BERM_Z - t;
})();

export interface Beach {
  /** Wet band reach above the waterline (m along -z); the sea's swash drives it. */
  setWetReach(meters: number): void;
  update(): void;
}

export function createBeach(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  manifest: Manifest,
  onLoaded: (what: string, ok: boolean) => void,
  sunDir: THREE.Vector3,
): Beach {
  const W = 400;
  const zNear = 45;
  const zFar = -75;
  const geo = new THREE.PlaneGeometry(W, zNear - zFar, 200, 240);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (zNear + zFar) / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, sandHeight(pos.getZ(i)));
    uv.setXY(i, pos.getX(i), -pos.getZ(i)); // uv in world meters; textures repeat every tileMeters
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    wetReach: { value: 1.2 },
    waterlineZ: { value: WATERLINE_Z },
    macroScale: { value: 0.11 },
    macroStrength: { value: 0.35 },
    wetDarken: { value: 0.62 },
    wetMap: { value: null as THREE.Texture | null },
    wetNormal: { value: null as THREE.Texture | null },
    wetRough: { value: null as THREE.Texture | null },
    dryMean: { value: new THREE.Color(1, 1, 1) },
    aoMap2: { value: null as THREE.Texture | null },
    cavity: { value: 0 },
    contrast: { value: 1 },
    sandGamma: { value: 1 },
    sandLight: { value: new THREE.Color(LOOK.SAND_LIGHT) },
    sandDark: { value: new THREE.Color(LOOK.SAND_DARK) },
    wetMean: { value: new THREE.Color(1, 1, 1) },
    heightMap: { value: null as THREE.Texture | null },
    heightScale: { value: 0 },
    uvRepeat: { value: 0.5 },
    sunDir: { value: sunDir.clone() },
  };

  if (manifest.sand) {
    const s = manifest.sand;
    const dry = loadSet(s, renderer, () => onLoaded('sand', true));
    mat.map = dry.color;
    mat.normalMap = dry.normal;
    mat.normalScale.set(1, 1);
    if (dry.rough) mat.roughnessMap = dry.rough;
    uniforms.aoMap2.value = dry.ao ?? whiteTexture();
    dry.mean.then((c) => uniforms.dryMean.value.copy(c));
    if (manifest.wetSand) {
      const wet = loadSet(manifest.wetSand, renderer, () => {});
      uniforms.wetMap.value = wet.color;
      uniforms.wetNormal.value = wet.normal;
      uniforms.wetRough.value = wet.rough;
      wet.mean.then((c) => uniforms.wetMean.value.copy(c));
    }
    const hasWet = manifest.wetSand ? '1.0' : '0.0';
    uniforms.heightMap.value = dry.height ?? whiteTexture();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSandWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      // The sun's direct light is dimmed by the relief's own shadow (computed in map_fragment below).
      const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sandSelfShadow;',
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vSandWorld;
uniform float wetReach, waterlineZ, macroScale, macroStrength, wetDarken;
uniform vec3 dryMean, wetMean, sunDir, sandLight, sandDark;
uniform sampler2D wetMap, wetNormal, wetRough, aoMap2, heightMap;
uniform float cavity, contrast, heightScale, uvRepeat, sandGamma;
float sandWet;
float sandSelfShadow = 1.0;
vec2 sandUv, sandDx, sandDy;
// Depth (m) below the top of the relief at uv.
float sandDepth(vec2 uv) { return heightScale * (1.0 - textureGrad(heightMap, uv, sandDx, sandDy).r); }`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  sandDx = dFdx(vMapUv);
  sandDy = dFdy(vMapUv);
  sandUv = vMapUv;
  // Parallax occlusion: march the view ray down into the height map, so the relief holds up at the
  // low camera angle, then march toward the sun for the relief's own shadows. Near the camera only.
  vec3 toFrag = vSandWorld - cameraPosition;
  float camDist = length(toFrag);
  float pomFade = 1.0 - smoothstep(25.0, 40.0, camDist);
  if (heightScale > 0.0 && pomFade > 0.0) {
    vec3 V = toFrag / camDist;
    vec2 viewStep = vec2(V.x, -V.z) / max(-V.y, 0.08) * uvRepeat * pomFade; // uv shift per meter of descent
    const int N = 16;
    float layer = heightScale / float(N);
    float d = 0.0;
    vec2 uv = vMapUv;
    float surf = sandDepth(uv);
    float prevSurf = surf;
    float prevD = 0.0;
    vec2 prevUv = uv;
    for (int i = 0; i < N; i++) {
      if (d >= surf) break;
      prevUv = uv; prevD = d; prevSurf = surf;
      d += layer;
      uv = vMapUv + viewStep * d;
      surf = sandDepth(uv);
    }
    float after = surf - d;
    float before = prevSurf - prevD;
    float w = after / (after - before + 1e-6);
    sandUv = mix(uv, prevUv, w);
    float hit = mix(d, prevD, w);
    vec2 sunStep = vec2(sunDir.x, -sunDir.z) / max(sunDir.y, 0.1) * uvRepeat; // uv shift per meter of rise
    float occ = 0.0;
    for (int k = 1; k <= 6; k++) {
      float rise = hit * float(k) / 6.0;
      float above = (hit - rise) - sandDepth(sandUv + sunStep * rise); // > 0: relief above the sun ray
      occ = max(occ, above / max(heightScale * 0.15, 1e-4));
    }
    sandSelfShadow = 1.0 - clamp(occ, 0.0, 1.0) * pomFade;
  }
  // Wetness: 1 below the swash line, fading out over a ragged edge above it.
  float edgeNoise = texture2D(map, vSandWorld.xz * 0.05).g / max(dryMean.g, 1e-3);
  sandWet = ${hasWet} * (1.0 - smoothstep(0.0, 0.6, (vSandWorld.z - waterlineZ) - wetReach + (edgeNoise - 1.0) * 0.8));
  // Gradient map: the texture's detail (relative to its average), darkened in AO cavities and varied by a
  // large-scale copy against tiling, picks a color between sandDark (orange) and sandLight (yellow).
  float v = dot(textureGrad(map, sandUv, sandDx, sandDy).rgb / dryMean, vec3(0.2126, 0.7152, 0.0722));
  v *= mix(1.0, textureGrad(aoMap2, sandUv, sandDx, sandDy).r, cavity);
  v *= mix(1.0, dot(texture2D(map, vMapUv * macroScale + vec2(0.37, 0.71)).rgb / dryMean, vec3(0.2126, 0.7152, 0.0722)), macroStrength);
  // Tone curve: gamma < 1 pushes the midtones toward sandLight, > 1 toward sandDark.
  vec3 dryC = mix(sandDark, sandLight, pow(clamp(0.5 + (v - 1.0) * contrast, 0.0, 1.0), sandGamma));
  vec3 wetC = textureGrad(wetMap, sandUv, sandDx, sandDy).rgb / wetMean * wetDarken;
  diffuseColor.rgb *= mix(dryC, wetC, sandWet);
#endif`,
        )
        .replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec3 mapN = mix(textureGrad( normalMap, sandUv, sandDx, sandDy ).xyz, textureGrad( wetNormal, sandUv, sandDx, sandDy ).xyz, sandWet) * 2.0 - 1.0;',
        )
        .replace(
          'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );',
          'vec4 texelRoughness = textureGrad( roughnessMap, sandUv, sandDx, sandDy );',
        )
        .replace(
          'roughnessFactor *= texelRoughness.g;',
          'roughnessFactor *= mix(texelRoughness.g, textureGrad( wetRough, sandUv, sandDx, sandDy ).g * 0.55, sandWet);',
        )
        .replace('#include <lights_fragment_begin>', lights);
    };
  }

  // All sand maps share one uv transform (three uses the color map's), kept in sync with LOOK.SAND_TILE.
  const tileMeters = manifest.sand?.tileMeters ?? 2;
  const textures = [mat.map, mat.normalMap, mat.roughnessMap, uniforms.aoMap2.value, uniforms.heightMap.value, uniforms.wetMap.value, uniforms.wetNormal.value, uniforms.wetRough.value].filter(
    (t): t is THREE.Texture => !!t,
  );

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  return {
    setWetReach(m) {
      uniforms.wetReach.value = m;
    },
    update() {
      uniforms.sandLight.value.set(LOOK.SAND_LIGHT);
      uniforms.sandDark.value.set(LOOK.SAND_DARK);
      uniforms.macroStrength.value = LOOK.SAND_MACRO;
      uniforms.cavity.value = LOOK.SAND_CAVITY;
      uniforms.contrast.value = LOOK.SAND_CONTRAST;
      uniforms.sandGamma.value = LOOK.SAND_GAMMA;
      mat.normalScale.setScalar(LOOK.SAND_NORMAL);
      const repeat = 1 / (tileMeters * LOOK.SAND_TILE);
      for (const t of textures) t.repeat.setScalar(repeat);
      uniforms.uvRepeat.value = repeat;
      uniforms.heightScale.value = LOOK.SAND_HEIGHT * LOOK.SAND_TILE;
    },
  };
}

interface TexSet {
  color: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture | null;
  ao: THREE.Texture | null;
  height: THREE.Texture | null;
  /** Average color of the color map in linear space. */
  mean: Promise<THREE.Color>;
}

function loadSet(s: SandAsset, renderer: THREE.WebGLRenderer, onColor: () => void): TexSet {
  const tl = new THREE.TextureLoader();
  const prep = (t: THREE.Texture) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / s.tileMeters, 1 / s.tileMeters); // uv = world meters (see below)
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  let resolveMean: (c: THREE.Color) => void = () => {};
  const mean = new Promise<THREE.Color>((r) => (resolveMean = r));
  const color = prep(
    tl.load(s.color, (t) => {
      resolveMean(averageColor(t.image as HTMLImageElement));
      onColor();
    }),
  );
  color.colorSpace = THREE.SRGBColorSpace;
  return {
    color,
    normal: prep(tl.load(s.normal)),
    rough: s.roughness ? prep(tl.load(s.roughness)) : null,
    ao: s.ao ? prep(tl.load(s.ao)) : null,
    height: s.height ? prep(tl.load(s.height)) : null,
    mean,
  };
}

/** Average color of an sRGB image, in linear space. */
function averageColor(img: HTMLImageElement): THREE.Color {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += srgbToLinear(d[i + k] / 255);
  const n = d.length / 4;
  return new THREE.Color(sum[0] / n, sum[1] / n, sum[2] / n);
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function whiteTexture(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}
