// 3D view (Three.js). The game is still 2D: sim x -> three x, sim y -> three y,
// and Player.z (render-only depth) -> three z. The camera looks across the court from the side.
//
// Quality tiers: 'high' = shadows 2048 + MSAA + bloom + depth of field, 'low' = plain render.
// ?quality=high|low forces a tier; otherwise it starts high and drops to low if the frame rate is poor.
// refShot (?scene=ref): camera and scenery blockout of docs/reference/concept-beach.webp, for comparison.
import * as THREE from 'three';
import type { World } from '../sim/types.ts';
import { LOOK } from './look.ts';
import { loadManifest } from './scene/assets.ts';
import { createActors, type Actors } from './scene/actors.ts';
import { createCourt } from './scene/court.ts';
import { createEnvironment, SEA_LEVEL, type Environment } from './scene/environment.ts';
import { createPost, type Post } from './scene/post.ts';
import { createProps } from './scene/props.ts';
import { applyRefCamera, createRefBlockout } from './scene/ref-shot.ts';
import type { ProbeItem, Renderer } from './types.ts';

export type Quality = 'high' | 'low';

const VIEW_HALF_WIDTH = 11.6; // meters of court (x) that must fit across the screen
const VFOV = 30;
const CAM_HEIGHT = 2.3;
const LOOK_HEIGHT = 3.7;

export function createThreeRenderer(
  canvas: HTMLCanvasElement,
  world: World,
  forced: Quality | null,
  refShot = false,
): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, 4000);

  const loaded: Record<string, boolean> = {};
  const pending = new Set(['manifest', 'props', 'waterNormals']);
  const done = (what: string, ok: boolean) => {
    loaded[what] = ok;
    pending.delete(what);
  };

  let env: Environment | null = null;
  let post: Post | null = null;
  const actors: Actors = createActors(scene, world);
  createCourt(scene);
  let props: { update(t: number): void } = { update() {} };
  if (refShot) {
    createRefBlockout(scene, SEA_LEVEL);
    done('props', true);
  } else {
    props = createProps(scene, (ok) => done('props', ok));
  }
  loadManifest().then((m) => {
    if (m.sky) pending.add('sky');
    if (m.sand) pending.add('sand');
    if (m.foam) pending.add('foam');
    env = createEnvironment(scene, renderer, m, done);
    env.sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
    done('manifest', true);
  });

  let quality: Quality = forced ?? 'high';
  let w = 1;
  let h = 1;
  let dpr = 1;
  let humanZ = world.players[0].z;

  const applyQuality = () => {
    const ratio = quality === 'high' ? Math.min(dpr, 1.5) : 1;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    if (quality === 'high') {
      post ??= createPost(renderer, scene, camera);
      post.setSize(w, h, ratio);
    }
    if (env) {
      env.sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
      env.sun.shadow.map?.dispose();
      env.sun.shadow.map = null;
      }
  };

  // Frame-rate watch for the automatic tier
  const fpsSamples: number[] = [];
  let lastNow = 0;
  let startedAt = 0;
  let fps = 60;
  const clock = new THREE.Clock();

  const v = new THREE.Vector3();
  const project = (x: number, y: number, z: number) => {
    v.set(x, y, z).project(camera);
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h, behind: v.z > 1 };
  };
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  return {
    resize(width, height, ratio) {
      w = width;
      h = height;
      dpr = ratio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      camera.aspect = w / h;
      if (refShot) {
        applyRefCamera(camera);
        post?.setFocus(20);
        applyQuality();
        post?.setFocus(20);
        return;
      }
      // Fit the court width at the human player's depth
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(VFOV / 2)) * camera.aspect);
      const dist = VIEW_HALF_WIDTH / Math.tan(hfov / 2);
      camera.position.set(0, CAM_HEIGHT, humanZ + dist);
      camera.lookAt(0, LOOK_HEIGHT, humanZ);
      camera.updateProjectionMatrix();
      post?.setFocus(dist);
      applyQuality();
      post?.setFocus(dist);
    },
    render(world) {
      const now = performance.now();
      if (lastNow) {
        const dt = now - lastNow;
        fps = fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1;
        if (!forced && quality === 'high' && pending.size === 0) {
          if (!startedAt) startedAt = now;
          if (now - startedAt > 1000) fpsSamples.push(dt);
          if (fpsSamples.length >= 90) {
            const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
            if (avg > 1000 / 42) {
              quality = 'low';
              applyQuality();
            }
            fpsSamples.length = 0;
            startedAt = Infinity; // decide once
          }
        }
      }
      lastNow = now;

      const dt = Math.min(0.1, clock.getDelta());
      const t = clock.elapsedTime;
      humanZ = world.players[0].z;
      plane.constant = -humanZ;
      actors.update(world);
      props.update(t);
      renderer.toneMappingExposure = LOOK.EXPOSURE;
      env?.update(dt);
      if (quality === 'high' && post) post.render();
      else renderer.render(scene, camera);
    },
    screenToCourtX(sx, sy) {
      ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), camera);
      return ray.ray.intersectPlane(plane, hit) ? hit.x : 0;
    },
    courtToScreen(x, y) {
      const p = project(x, y, humanZ);
      return { x: p.x, y: p.y };
    },
    probe(world) {
      const items: ProbeItem[] = [];
      const add = (name: string, x: number, y: number, z: number) => {
        const p = project(x, y, z);
        items.push({
          name,
          simX: x,
          simY: y,
          screenX: p.x,
          screenY: p.y,
          onScreen: !p.behind && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h,
        });
      };
      add('ball', world.ball.x, world.ball.y, actors.ballZ());
      for (const p of world.players) add(p.name, p.x, p.y, p.z);
      return items;
    },
    info() {
      return {
        view: '3d',
        scene: refShot ? 'ref' : 'game',
        quality,
        forced: forced !== null,
        fps: Math.round(fps),
        ready: pending.size === 0,
        pending: [...pending],
        loaded,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
