// Players and ball. Players are plain capsules until character models are chosen.
import * as THREE from 'three';
import { BALL_RADIUS } from '../../sim/constants.ts';
import type { World } from '../../sim/types.ts';

const CAPSULE_R = 0.3;
const CAPSULE_H = 1.6;
const TEAM_COLORS = [0xf3f3f3, 0xd9362f];

export interface Actors {
  players: THREE.Mesh[];
  ball: THREE.Mesh;
  /** Render-only depth of the ball (the sim is 2D). */
  ballZ(): number;
  update(world: World): void;
}

export function createActors(scene: THREE.Scene, world: World): Actors {
  const geo = new THREE.CapsuleGeometry(CAPSULE_R, CAPSULE_H - CAPSULE_R * 2, 8, 20);
  const players = world.players.map((p) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.55 }));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  });

  // Marks the human-controlled player on the sand.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 1.2, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.45 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  let bz = 0;
  return {
    players,
    ball,
    ballZ: () => bz,
    update(world) {
      world.players.forEach((p, i) => {
        players[i].position.set(p.x, p.y + CAPSULE_H / 2, p.z);
      });
      const me = world.players[0];
      ring.position.set(me.x, 0.02, me.z);
      ring.visible = me.y < 0.05;

      // The ball drifts toward the depth of whoever plays it next, so contacts line up.
      const id = world.plan && world.plan.receiver >= 0 ? world.plan.receiver : world.lastHitter >= 0 ? world.lastHitter : world.server;
      const targetZ = world.players[id]?.z ?? 0;
      bz += (targetZ - bz) * 0.06;
      const b = world.ball;
      ball.position.set(b.x, b.y, bz);
      ball.rotation.z -= b.vx * 0.012;
      ball.rotation.x += 0.02;
    },
  };
}
