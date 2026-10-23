// Sky, sun, sea and sand.
// Sky: a CC0 HDRI from the manifest when present (also used for image-based lighting),
// otherwise three's physical Sky shader. Sea: three's Water with the three.js water normal map.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import type { Manifest } from './assets.ts';

/** Where we want the sun: high, behind the court and to the right, so the sea glitters and shadows fall toward the camera. */
export const SUN_DIR = new THREE.Vector3(0.5, 0.82, -0.28).normalize();

const SEA_LEVEL = -0.12;
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
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0xd9b27a, 0.35));

  scene.fog = new THREE.Fog(0xbcdcf0, 200, 2500);

  // --- Sky ------------------------------------------------------------------------
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
        scene.background = bg;
        scene.backgroundRotation.set(0, rot, 0);
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
    fog: true,
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
    },
    setWaterResolution(px) {
      waterTargetSize(water, px);
    },
  };
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
