// Court lines, net and posts. Sizes come from the sim constants (net at x = 0).
import * as THREE from 'three';
import { COURT_HALF, NET_HEIGHT } from '../../sim/constants.ts';

export const COURT_WIDTH = 8; // across the court (three z); render-only
const POST_Z = COURT_WIDTH / 2 + 0.7;
const NET_DEPTH = 1.0; // height of the net mesh

export function createCourt(scene: THREE.Scene): void {
  const tape = new THREE.MeshStandardMaterial({ color: 0x2747c9, roughness: 0.7 });
  const line = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), tape);
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  const L = COURT_HALF * 2;
  const T = 0.07;
  line(L + T, T, 0, COURT_WIDTH / 2);
  line(L + T, T, 0, -COURT_WIDTH / 2);
  line(T, COURT_WIDTH, -COURT_HALF, 0);
  line(T, COURT_WIDTH, COURT_HALF, 0);

  // Posts with blue padding
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1e2f8f, roughness: 0.55 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4, metalness: 0.3 });
  for (const z of [-POST_Z, POST_Z]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, NET_HEIGHT + 0.1, 24), postMat);
    pad.position.set(0, (NET_HEIGHT + 0.1) / 2, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 16), capMat);
    cap.position.set(0, NET_HEIGHT + 0.25, z);
    for (const m of [pad, cap]) {
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Net: translucent dark mesh with a white top band (a net texture can replace this later).
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x0d1530,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.9,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(POST_Z * 2, NET_DEPTH), netMat);
  net.rotation.y = Math.PI / 2;
  net.position.set(0, NET_HEIGHT - NET_DEPTH / 2, 0);
  net.castShadow = true;
  scene.add(net);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.07, POST_Z * 2),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 }),
  );
  band.position.set(0, NET_HEIGHT - 0.035, 0);
  band.castShadow = true;
  scene.add(band);

  // Antennas (red/white) above the sidelines
  const antMat = new THREE.MeshStandardMaterial({ color: 0xd8312b, roughness: 0.5 });
  for (const z of [-COURT_WIDTH / 2, COURT_WIDTH / 2]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.8, 8), antMat);
    a.position.set(0, NET_HEIGHT - NET_DEPTH + 0.9, z);
    a.castShadow = true;
    scene.add(a);
  }
}
