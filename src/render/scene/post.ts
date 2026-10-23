// Post-processing for the high quality tier: MSAA scene render -> bloom -> depth of field -> tone mapping.
import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export interface Post {
  render(): void;
  setSize(w: number, h: number, dpr: number): void;
  setFocus(distance: number): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Only the brightest highlights (sun glitter on the sea, clouds) bloom.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.5, 2.5);
  composer.addPass(bloom);
  // Background (sea, island, far palms) goes soft like a photo; the court stays sharp.
  const bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.00006, maxblur: 0.0025 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    },
    setFocus(distance) {
      (bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = distance;
    },
  };
}
