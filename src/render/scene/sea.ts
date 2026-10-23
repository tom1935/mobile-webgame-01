// The sea: one custom shader instead of three's Water (no mirror re-render of the scene).
//   - Depth comes from the shared beach cross-section (sandHeight), no depth pass needed.
//   - Water body color: Beer-Lambert absorption per color channel over the depth, between the lit
//     seabed (shallow -> turquoise) and the scattered deep color (deep -> dark blue).
//   - Sky reflection: the sky HDRI sampled in the reflected direction (same grade as the sky dome), Fresnel weighted.
//   - Small waves: the water normal map at three scales/directions, so it does not visibly repeat.
//   - Sun glints: a sharp specular of the sun on those normals (bloom and depth of field soften them).
//   - Breaking waves: a dense strip of water along the shore (the surf zone) is lifted by a looping,
//     scripted wave (no physics): it rises while it travels in, steepens, breaks into whitewater (the
//     CC0 foam texture as a mask) and runs up to the shore. Two waves are in the loop, half a cycle apart,
//     and the timing drifts along the shore so the crest is not one straight line.
//     The far sea is a big flat plane that leaves a hole where the strip is.
import * as THREE from 'three';
import { LOOK } from '../look.ts';
import type { Manifest } from './assets.ts';
import { SAND_HEIGHT_GLSL, SEA_LEVEL, WATERLINE_Z } from './beach.ts';

export interface Sea {
  /** The visible sky (equirect HDR) and its yaw, to reflect the same sky as the dome. */
  setSky(tex: THREE.Texture, rot: number): void;
  update(dt: number, sky: { exposure: number; saturation: number; zenith: number }): void;
}

/** Surf zone strip: x in [-STRIP_HALF, STRIP_HALF], z from STRIP_Z0 (offshore) to STRIP_Z1 (up the beach). */
const STRIP_HALF = 150;
const STRIP_Z0 = WATERLINE_Z - 24;
const STRIP_Z1 = WATERLINE_Z + 4;

const f = (n: number) => n.toFixed(3);

/** Scripted breaking wave (vertex and fragment shaders). */
const WAVE_GLSL = /* glsl */ `
uniform float time, wavePeriod, waveH, zShore, zBreak, zStart;
// Along the shore the timing and the height drift a little, so the crest is not one straight line.
float alongPhase(float x) { return 0.05 * sin(x * 0.043 + 1.3) + 0.03 * sin(x * 0.11 + 4.1) + 0.015 * sin(x * 0.29 + 0.7); }
float alongHeight(float x) { return 1.0 + 0.2 * sin(x * 0.05 + 2.0) + 0.1 * sin(x * 0.15 + 5.0); }

const float U_BREAK = 0.45; // share of the cycle spent rising and travelling in, before it breaks
const float U_SHORE = 0.75; // the broken wave (bore) reaches the shore; then it settles

// One wave at lifecycle u (0..1). Returns the height above sea level; whitewater 0..1; lift 0..1 (thin lit crest).
float waveAt(float x, float z, float u, out float white, out float lift) {
  float zc, hh, wf, wb, broken, lip;
  if (u < U_BREAK) {
    float s = u / U_BREAK;
    zc = mix(zStart, zBreak, s);
    hh = waveH * s * s;
    wf = mix(3.5, 0.6, s * s * s); // the front steepens
    wb = mix(5.0, 3.0, s);
    broken = 0.0;
    lip = pow(s, 10.0); // a thin spill at the top just before it breaks
  } else if (u < U_SHORE) {
    float s = (u - U_BREAK) / (U_SHORE - U_BREAK);
    zc = mix(zBreak, zShore, s);
    hh = waveH * mix(0.75, 0.15, s);
    wf = mix(0.6, 1.2, s);
    wb = mix(3.0, 5.0, s);
    broken = 1.0 - 0.4 * s;
    lip = 0.0;
  } else {
    float s = (u - U_SHORE) / (1.0 - U_SHORE);
    zc = zShore + 0.5 * s;
    hh = waveH * 0.15 * (1.0 - s);
    wf = 1.2;
    wb = 5.0;
    broken = 0.6 * (1.0 - s);
    lip = 0.0;
  }
  hh *= alongHeight(x);
  float d = z - zc; // > 0: shoreward of the crest
  float w = d > 0.0 ? wf : wb;
  float shape = exp(-d * d / (w * w));
  lift = shape * (u < U_BREAK ? u / U_BREAK : 1.0 - (u - U_BREAK) / (1.0 - U_BREAK));
  // Whitewater rides on the crest and trails behind it (the back of the broken wave stays churned up).
  float behind = d < 0.0 ? exp(d / 3.0) : exp(-pow(d / 0.8, 2.0));
  white = broken * behind + lip * exp(-pow((d - 0.1) / 0.6, 2.0));
  return hh * shape;
}

float surfHeight(float x, float z, out float white, out float lift) {
  float u0 = fract(time / (2.0 * wavePeriod) + alongPhase(x));
  float w0, l0, w1, l1;
  float h = waveAt(x, z, u0, w0, l0) + waveAt(x, z, fract(u0 + 0.5), w1, l1);
  white = clamp(max(w0, w1), 0.0, 1.0);
  lift = clamp(max(l0, l1), 0.0, 1.0);
  return h;
}
`;

export function createSea(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  manifest: Manifest,
  sunDir: THREE.Vector3,
  onLoaded: (what: string, ok: boolean) => void,
): Sea {
  const loader = new THREE.TextureLoader();
  const repeat = (t: THREE.Texture) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const normals = repeat(
    loader.load('assets/textures/waternormals.jpg', () => onLoaded('waterNormals', true), undefined, () => onLoaded('waterNormals', false)),
  );
  const foamMask = manifest.foam
    ? repeat(loader.load(manifest.foam.opacity, () => onLoaded('foam', true), undefined, () => onLoaded('foam', false)))
    : null;

  const uniforms = {
    time: { value: 0 },
    normalMap: { value: normals },
    foamMap: { value: foamMask },
    hasFoam: { value: foamMask ? 1 : 0 },
    sunDir: { value: sunDir.clone() },
    sunColor: { value: new THREE.Color(0xfff6e5) },
    skyMap: { value: null as THREE.Texture | null },
    hasSky: { value: 0 },
    skyRot: { value: 0 },
    skyExposure: { value: 1 },
    skySat: { value: 1 },
    skyZenith: { value: 0 },
    skyFallback: { value: new THREE.Color(0x9ccbf0) },
    bedColor: { value: new THREE.Color() },
    deepColor: { value: new THREE.Color() },
    absorb: { value: new THREE.Vector3() },
    viewPath: { value: 0 },
    reflectAmt: { value: 0 },
    normalStrength: { value: 1 },
    waveScale: { value: 1 },
    glint: { value: 0 },
    glintPower: { value: 0 },
    glintTilt: { value: 1 },
    // breaking waves
    wavePeriod: { value: 9 },
    waveH: { value: 0.5 },
    zShore: { value: WATERLINE_Z },
    zBreak: { value: WATERLINE_Z - 8 },
    zStart: { value: WATERLINE_Z - 20 },
    crestColor: { value: new THREE.Color() },
    crestGlow: { value: 0 },
    foamTile: { value: 4 },
  };

  const vertexShader = /* glsl */ `
    ${WAVE_GLSL}
    varying vec3 vWorld;
    varying vec3 vGeoNormal;
    varying float vWhite, vLift;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vGeoNormal = vec3(0.0, 1.0, 0.0);
      vWhite = 0.0;
      vLift = 0.0;
      #ifdef SURF
        float wh, li, a, b;
        float h = surfHeight(w.x, w.z, wh, li);
        // Normal from the height's slope (finite differences).
        const float e = 0.12;
        float hx = surfHeight(w.x + e, w.z, a, b);
        float hz = surfHeight(w.x, w.z + e, a, b);
        vGeoNormal = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
        w.y += h;
        vWhite = wh;
        vLift = li;
      #endif
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;

  const fragmentShader = /* glsl */ `
    #include <common>
    ${SAND_HEIGHT_GLSL}
    uniform float time, hasSky, skyRot, skyExposure, skySat, skyZenith, hasFoam, foamTile;
    uniform float viewPath, reflectAmt, normalStrength, waveScale, glint, glintPower, glintTilt, crestGlow;
    uniform sampler2D normalMap, skyMap, foamMap;
    uniform vec3 sunDir, sunColor, skyFallback, bedColor, deepColor, absorb, crestColor;
    varying vec3 vWorld;
    varying vec3 vGeoNormal;
    varying float vWhite, vLift;

    // Same mapping and grade as the sky dome (environment.ts), so the reflection matches the visible sky.
    vec3 sky(vec3 d) {
      if (hasSky < 0.5) return skyFallback;
      d.y = max(d.y, 0.0);
      vec2 uv = vec2((atan(d.z, d.x) + skyRot) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
      vec3 c = texture2D(skyMap, uv).rgb * skyExposure;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, skySat), 0.0);
      return c * (1.0 - skyZenith * smoothstep(0.0, 0.9, d.y));
    }

    // Three scales of the normal map, each drifting its own way (texture xy -> world xz), on top of the wave's own slope.
    vec3 waterNormal(vec2 p, float strength) {
      vec2 s = p / waveScale;
      vec3 a = texture2D(normalMap, s / 7.0 + vec2(0.021, 0.013) * time).xyz * 2.0 - 1.0;
      vec3 b = texture2D(normalMap, mat2(0.8, -0.6, 0.6, 0.8) * s / 19.0 + vec2(-0.011, 0.017) * time).xyz * 2.0 - 1.0;
      vec3 c = texture2D(normalMap, mat2(-0.5, 0.87, -0.87, -0.5) * s / 47.0 + vec2(0.006, -0.008) * time).xyz * 2.0 - 1.0;
      vec2 xy = (a.xy + b.xy + c.xy) * strength;
      vec3 g = normalize(vGeoNormal);
      return normalize(vec3(g.x / g.y + xy.x, 1.0, g.z / g.y + xy.y));
    }

    void main() {
      #ifndef SURF
        // The surf strip draws this part.
        if (abs(vWorld.x) < ${f(STRIP_HALF)} && vWorld.z > ${f(STRIP_Z0)}) discard;
      #endif
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      vec3 N = waterNormal(vWorld.xz, normalStrength);

      // Water body: light from the seabed, absorbed per channel on its way down and up through the water.
      float depth = max(vWorld.y - sandHeight(vWorld.z), 0.0);
      float path = depth * (1.0 + viewPath / max(V.y, 0.05));
      vec3 T = exp(-absorb * path);
      vec3 body = bedColor * T + deepColor * (1.0 - T);
      // The thin top of a wave lets the sunlight through: brighter blue-green.
      body += crestColor * crestGlow * vLift * vLift;

      // Sky reflection (Schlick Fresnel, F0 = 0.02), scaled for the stylized look.
      float cosV = clamp(dot(N, V), 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
      vec3 R = reflect(-V, N);
      vec3 col = mix(body, sky(R), clamp(F * reflectAmt, 0.0, 1.0));

      // Sun glints: the sun is high (~51°), so only steep wave facets reflect it toward the camera;
      // the glints use the same small waves, tilted more (glintTilt).
      vec3 Rg = reflect(-V, waterNormal(vWorld.xz, normalStrength * glintTilt));
      col += sunColor * glint * pow(max(dot(Rg, sunDir), 0.0), glintPower);

      // Whitewater: the foam texture's lace as a mask; more of it shows as the whitewater gets thicker.
      if (vWhite > 0.001) {
        float pattern = hasFoam > 0.5 ? texture2D(foamMap, vWorld.xz / foamTile + vec2(0.0, -0.05) * time).r : 0.5;
        float mask = clamp((pattern - (1.0 - vWhite) * 0.9) / 0.15, 0.0, 1.0) * smoothstep(0.0, 0.15, vWhite);
        vec3 lit = sunColor * (0.55 + 0.6 * max(dot(normalize(vGeoNormal), sunDir), 0.0));
        col = mix(col, lit, mask);
      }

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: false }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.y = SEA_LEVEL;
  scene.add(far);

  // Surf strip: ~1 m vertex spacing along the shore, ~0.2 m across it (the breaking front is steep).
  const len = STRIP_Z1 - STRIP_Z0;
  const stripGeo = new THREE.PlaneGeometry(STRIP_HALF * 2, len, 300, Math.round(len / 0.2));
  stripGeo.rotateX(-Math.PI / 2);
  stripGeo.translate(0, 0, (STRIP_Z0 + STRIP_Z1) / 2);
  const strip = new THREE.Mesh(
    stripGeo,
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, defines: { SURF: '' }, fog: false }),
  );
  strip.position.y = SEA_LEVEL;
  strip.frustumCulled = false; // vertices move up in the shader
  scene.add(strip);

  return {
    setSky(tex, rot) {
      uniforms.skyMap.value = tex;
      uniforms.skyRot.value = rot;
      uniforms.hasSky.value = 1;
    },
    update(dt, sky) {
      uniforms.time.value = LOOK.SEA_FREEZE >= 0 ? LOOK.SEA_FREEZE : uniforms.time.value + dt;
      uniforms.skyExposure.value = sky.exposure;
      uniforms.skySat.value = sky.saturation;
      uniforms.skyZenith.value = sky.zenith;
      uniforms.bedColor.value.set(LOOK.SEA_BED).multiplyScalar(LOOK.SEA_BED_GAIN);
      uniforms.deepColor.value.set(LOOK.SEA_DEEP);
      uniforms.absorb.value.set(LOOK.SEA_ABSORB_R, LOOK.SEA_ABSORB_G, LOOK.SEA_ABSORB_B);
      uniforms.viewPath.value = LOOK.SEA_VIEW_PATH;
      uniforms.reflectAmt.value = LOOK.SEA_REFLECT;
      uniforms.normalStrength.value = LOOK.SEA_NORMAL;
      uniforms.waveScale.value = LOOK.SEA_WAVE_SCALE;
      uniforms.glint.value = LOOK.SEA_GLINT;
      uniforms.glintPower.value = LOOK.SEA_GLINT_POWER;
      uniforms.glintTilt.value = LOOK.SEA_GLINT_TILT;
      uniforms.wavePeriod.value = LOOK.SEA_WAVE_PERIOD;
      uniforms.waveH.value = LOOK.SEA_WAVE_H;
      uniforms.zBreak.value = WATERLINE_Z - LOOK.SEA_BREAK_DIST;
      uniforms.zStart.value = WATERLINE_Z - LOOK.SEA_BREAK_DIST - 12;
      uniforms.crestColor.value.set(LOOK.SEA_CREST_COLOR);
      uniforms.crestGlow.value = LOOK.SEA_CREST_GLOW;
      uniforms.foamTile.value = LOOK.SEA_FOAM_TILE;
    },
  };
}
