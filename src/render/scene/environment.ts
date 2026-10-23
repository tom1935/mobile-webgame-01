// Sky, sun, sea and sand.
// Sky: a CC0 HDRI from the manifest when present. Lighting uses it as is; the visible sky is drawn by a
// dome that grades it (saturation, darker zenith) toward the reference's anime-blue sky. Without the HDRI,
// three's physical Sky shader. Sea: three's Water with the three.js water normal map.
// Haze (fog) applies to land and props only, with a cap so far islands stay visible (see LOOK.FOG_*).
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { LOOK } from '../look.ts';
import type { Manifest } from './assets.ts';

/**
 * Sun: measured from the net post's shadow in the reference picture: ~51° up, behind the court and
 * ~35° to the right of straight back (-z), so shadows fall toward the camera and to the left.
 */
export const SUN_DIR = new THREE.Vector3(0.361, 0.777, -0.515).normalize();

export const SEA_LEVEL = -0.12;
const SHORE_Z = -11; // sand starts sloping into the sea behind the court

export interface Environment {
  sun: THREE.DirectionalLight;
  water: Water;
  update(dt: number): void;
  setWaterResolution(px: number): void;
}

export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  manifest: Manifest,
  onLoaded: (what: string, ok: boolean) => void,
): Environment {
  // --- Lights ---------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -18;
  sc.right = 18;
  sc.top = 14;
  sc.bottom = -14;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.position.copy(SUN_DIR).multiplyScalar(70);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  // Sand bounce + sky fill on top of the IBL.
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0xd9b27a, 0.35);
  scene.add(hemi);

  installCappedFog(LOOK.FOG_MAX);
  const fog = new THREE.Fog(LOOK.FOG_COLOR, LOOK.FOG_START, LOOK.FOG_START + LOOK.FOG_LENGTH);
  scene.fog = fog;

  // --- Sky ------------------------------------------------------------------------
  let skyDome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const useSkyShader = () => {
    const sky = new Sky();
    sky.scale.setScalar(5000);
    const u = sky.material.uniforms;
    u.turbidity.value = 1.2;
    u.rayleigh.value = 2.6;
    u.mieCoefficient.value = 0.0008;
    u.mieDirectionalG.value = 0.7;
    u.sunPosition.value.copy(SUN_DIR);
    scene.add(sky);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(5000);
    envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envSky.material.uniforms.turbidity.value = 1.2;
    envSky.material.uniforms.rayleigh.value = 2.6;
    envScene.add(envSky);
    scene.environment = pmrem.fromScene(envScene, 0, 1, 6000).texture;
    scene.environmentIntensity = 0.8;
  };

  if (manifest.sky) {
    const sky = manifest.sky;
    const loader = new HDRLoader();
    Promise.all([loader.loadAsync(sky.background), loader.loadAsync(sky.env)])
      .then(([bg, env]) => {
        bg.mapping = THREE.EquirectangularReflectionMapping;
        // Turn the HDRI so its sun sits where our shadow-casting sun is.
        const rot = yawToMatch(findSunDirection(env), SUN_DIR);
        skyDome = createSkyDome(bg, rot);
        scene.add(skyDome);
        // The HDRI's sun would light everything without shadows; the DirectionalLight is the sun instead.
        clampSun(env);
        scene.environment = pmrem.fromEquirectangular(env).texture;
        scene.environmentRotation.set(0, rot, 0);
        scene.environmentIntensity = 1;
        env.dispose();
        onLoaded('sky', true);
      })
      .catch(() => {
        useSkyShader();
        onLoaded('sky', false);
      });
  } else {
    useSkyShader();
  }

  // --- Sea ------------------------------------------------------------------------
  const normals = new THREE.TextureLoader().load('assets/textures/waternormals.jpg', () => onLoaded('waterNormals', true));
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: SUN_DIR.clone(),
    sunColor: 0xfff6e5,
    waterColor: 0x0b6f8c,
    distortionScale: 2.2,
    fog: false, // the reference keeps the far sea a clear deep blue; only land is hazed
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA_LEVEL;
  water.material.uniforms.size.value = 6;
  // Tropical sea: tint the sky reflection turquoise and keep the sun glints white.
  const wm = water.material as THREE.ShaderMaterial;
  wm.uniforms.seaTint = { value: new THREE.Color(0x3fb8c9) };
  wm.fragmentShader = wm.fragmentShader
    .replace('uniform vec3 waterColor;', 'uniform vec3 waterColor;\nuniform vec3 seaTint;')
    .replace(
      '( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight )',
      '( vec3( 0.02, 0.08, 0.1 ) + reflectionSample * seaTint + specularLight * sunColor * 1.5 )',
    );
  scene.add(water);

  // --- Sand -----------------------------------------------------------------------
  // One big subdivided plane; behind the court it slopes under the sea to make the shoreline.
  const sandGeo = new THREE.PlaneGeometry(400, 120, 200, 80);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(0, 0, -15 + 60); // z from -75 to 45
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < SHORE_Z) pos.setY(i, -Math.pow(SHORE_Z - z, 1.3) * 0.06);
  }
  sandGeo.computeVertexNormals();
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xdcb57e, roughness: 0.95, metalness: 0 });
  if (manifest.sand) {
    const s = manifest.sand;
    const tl = new THREE.TextureLoader();
    const repeat = (t: THREE.Texture) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(400 / s.tileMeters, 120 / s.tileMeters);
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    const color = repeat(tl.load(s.color, () => onLoaded('sand', true)));
    color.colorSpace = THREE.SRGBColorSpace;
    sandMat.map = color;
    sandMat.color.set(0xffffff);
    sandMat.normalMap = repeat(tl.load(s.normal));
    sandMat.normalScale.set(1.2, 1.2);
    if (s.roughness) sandMat.roughnessMap = repeat(tl.load(s.roughness));
  }
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.receiveShadow = true;
  scene.add(sand);

  return {
    sun,
    water,
    update(dt) {
      water.material.uniforms.time.value += dt * 0.6;
      sun.intensity = LOOK.SUN_INTENSITY;
      hemi.intensity = LOOK.HEMI_INTENSITY;
      if (manifest.sky) scene.environmentIntensity = LOOK.ENV_INTENSITY;
      fog.color.set(LOOK.FOG_COLOR);
      fog.near = LOOK.FOG_START;
      fog.far = LOOK.FOG_START + LOOK.FOG_LENGTH;
      if (skyDome) {
        const u = skyDome.material.uniforms;
        u.exposure.value = LOOK.SKY_EXPOSURE;
        u.saturation.value = LOOK.SKY_SAT;
        u.zenith.value = LOOK.SKY_ZENITH;
      }
    },
    setWaterResolution(px) {
      waterTargetSize(water, px);
    },
  };
}

/**
 * Background sky: the equirect HDRI on a huge inverted sphere, graded in the shader.
 * `rot` turns the HDRI so its sun sits at SUN_DIR (sampling longitude = world longitude + rot,
 * the same as three's environmentRotation for the lighting).
 */
function createSkyDome(tex: THREE.Texture, rot: number): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      rot: { value: rot },
      exposure: { value: 1 },
      saturation: { value: 1 },
      zenith: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: `
      #include <common>
      uniform sampler2D map;
      uniform float rot, exposure, saturation, zenith;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec2 uv = vec2((atan(d.z, d.x) + rot) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
        vec3 c = texture2D(map, uv).rgb * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, saturation), 0.0);
        c *= 1.0 - zenith * smoothstep(0.0, 0.9, d.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false, // drawn first (renderOrder -1) at the far plane; everything else covers it
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

/**
 * Replace three's fog with a capped exponential haze that starts at fog.near:
 * factor = maxFactor * (1 - exp(-(depth - near) / (far - near))). Must run before materials compile.
 */
function installCappedFog(maxFactor: number): void {
  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = ${maxFactor.toFixed(4)} * ( 1.0 - exp( - max( vFogDepth - fogNear, 0.0 ) / max( fogFar - fogNear, 1e-3 ) ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}

/**
 * Cap the brightest pixels (the sun disk and its glow) of an equirect HDR in place, so image-based
 * lighting keeps only the sky's soft light. Cap = 99th percentile of luminance (sky and clouds).
 */
function clampSun(tex: THREE.DataTexture): void {
  const data = tex.image.data as Uint16Array | Float32Array;
  const half = data instanceof Uint16Array;
  const get = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const set = (i: number, v: number) => {
    data[i] = half ? THREE.DataUtils.toHalfFloat(v) : v;
  };
  const n = data.length / 4;
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) lum[p] = get(p * 4) * 0.2126 + get(p * 4 + 1) * 0.7152 + get(p * 4 + 2) * 0.0722;
  const cap = Float32Array.from(lum).sort()[Math.floor(n * 0.99)];
  for (let p = 0; p < n; p++) {
    if (lum[p] <= cap) continue;
    const k = cap / lum[p];
    for (let c = 0; c < 3; c++) set(p * 4 + c, get(p * 4 + c) * k);
  }
  tex.needsUpdate = true;
}

/** Brightest pixel of an equirect HDR as a world direction (three's equirect convention). */
function findSunDirection(tex: THREE.DataTexture): THREE.Vector3 {
  const { data, width, height } = tex.image as { data: Uint16Array | Float32Array; width: number; height: number };
  const half = data instanceof Uint16Array;
  const val = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = val(i) * 0.2126 + val(i + 1) * 0.7152 + val(i + 2) * 0.0722;
      if (l > best) {
        best = l;
        bx = x;
        by = y;
      }
    }
  }
  // Row 0 is the top of the image (zenith).
  const u = (bx + 0.5) / width;
  const v = 1 - (by + 0.5) / height;
  const lon = (u - 0.5) * 2 * Math.PI;
  const lat = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
}

/** Yaw (radians) for scene.backgroundRotation that moves direction `from` (in the HDRI) to `to` (in the world). */
function yawToMatch(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(from.z, from.x) - Math.atan2(to.z, to.x);
}

function waterTargetSize(water: Water, px: number): void {
  // Water's mirror target is created inside the constructor; find it through the material's sampler.
  const tex = (water.material as THREE.ShaderMaterial).uniforms.mirrorSampler.value as THREE.Texture & {
    renderTarget?: THREE.WebGLRenderTarget;
  };
  const rt = tex.renderTarget;
  if (rt) rt.setSize(px, px);
}
