// The sea: one custom shader instead of three's Water (no mirror re-render of the scene).
//   - Depth comes from the shared beach cross-section (sandHeight), no depth pass needed.
//   - Water body color: Beer-Lambert absorption per color channel over the depth, between the lit
//     seabed (shallow -> turquoise) and the scattered deep color (deep -> dark blue).
//   - Sky reflection: the sky HDRI sampled in the reflected direction (same grade as the sky dome), Fresnel weighted.
//   - Small waves: the water normal map at three scales/directions, so it does not visibly repeat.
//   - Sun glints: a sharp specular of the sun on those normals (bloom and depth of field soften them).
import * as THREE from 'three';
import { LOOK } from '../look.ts';
import { SAND_HEIGHT_GLSL, SEA_LEVEL } from './beach.ts';

export interface Sea {
  /** The visible sky (equirect HDR) and its yaw, to reflect the same sky as the dome. */
  setSky(tex: THREE.Texture, rot: number): void;
  update(dt: number, sky: { exposure: number; saturation: number; zenith: number }): void;
}

const lin = (hex: number) => new THREE.Color(hex); // three converts sRGB hex to linear

export function createSea(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  sunDir: THREE.Vector3,
  onLoaded: (what: string, ok: boolean) => void,
): Sea {
  const normals = new THREE.TextureLoader().load(
    'assets/textures/waternormals.jpg',
    () => onLoaded('waterNormals', true),
    undefined,
    () => onLoaded('waterNormals', false),
  );
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const uniforms = {
    time: { value: 0 },
    normalMap: { value: normals },
    sunDir: { value: sunDir.clone() },
    sunColor: { value: new THREE.Color(0xfff6e5) },
    skyMap: { value: null as THREE.Texture | null },
    hasSky: { value: 0 },
    skyRot: { value: 0 },
    skyExposure: { value: 1 },
    skySat: { value: 1 },
    skyZenith: { value: 0 },
    skyFallback: { value: lin(0x9ccbf0) },
    bedColor: { value: new THREE.Color() },
    deepColor: { value: new THREE.Color() },
    absorb: { value: new THREE.Vector3() },
    viewPath: { value: 0 },
    reflectAmt: { value: 0 },
    normalStrength: { value: 1 },
    waveScale: { value: 1 },
    glint: { value: 0 },
    glintPower: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      ${SAND_HEIGHT_GLSL}
      uniform float time, hasSky, skyRot, skyExposure, skySat, skyZenith;
      uniform float viewPath, reflectAmt, normalStrength, waveScale, glint, glintPower;
      uniform sampler2D normalMap, skyMap;
      uniform vec3 sunDir, sunColor, skyFallback, bedColor, deepColor, absorb;
      varying vec3 vWorld;

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

      // Three scales of the normal map, each drifting its own way (texture xy -> world xz).
      vec3 waterNormal(vec2 p) {
        vec2 s = p / waveScale;
        vec3 a = texture2D(normalMap, s / 7.0 + vec2(0.021, 0.013) * time).xyz * 2.0 - 1.0;
        vec3 b = texture2D(normalMap, mat2(0.8, -0.6, 0.6, 0.8) * s / 19.0 + vec2(-0.011, 0.017) * time).xyz * 2.0 - 1.0;
        vec3 c = texture2D(normalMap, mat2(-0.5, 0.87, -0.87, -0.5) * s / 47.0 + vec2(0.006, -0.008) * time).xyz * 2.0 - 1.0;
        vec2 xy = (a.xy + b.xy + c.xy) * normalStrength;
        return normalize(vec3(xy.x, 1.0, xy.y));
      }

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec3 N = waterNormal(vWorld.xz);

        // Water body: light from the seabed, absorbed per channel on its way down and up through the water.
        float depth = max(${SEA_LEVEL.toFixed(3)} - sandHeight(vWorld.z), 0.0);
        float path = depth * (1.0 + viewPath / max(V.y, 0.05));
        vec3 T = exp(-absorb * path);
        vec3 body = bedColor * T + deepColor * (1.0 - T);

        // Sky reflection (Schlick Fresnel, F0 = 0.02), scaled for the stylized look.
        float cosV = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
        vec3 R = reflect(-V, N);
        vec3 col = mix(body, sky(R), clamp(F * reflectAmt, 0.0, 1.0));

        // Sun glints
        col += sunColor * glint * pow(max(dot(R, sunDir), 0.0), glintPower);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA_LEVEL;
  scene.add(mesh);

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
    },
  };
}
