// Reference shot (?scene=ref): the camera of docs/reference/concept-beach.webp and a blockout
// of its scenery, so the 3D view can be compared with the picture side by side.
//
// The camera was solved from the court lines and net posts in the picture (it is AI-made, so
// the perspective is only roughly consistent: lines fit within ~10-20 px, the horizon is exact).
// Blockout pieces are placed by "pixel in the reference + distance from the camera", so they line
// up with the picture by construction. They are flat-colored placeholders for layout and values
// only, to be replaced by real assets.
import * as THREE from 'three';

/** Size of the reference picture (px). */
export const REF_W = 1672;
export const REF_H = 941;
const FOCAL_PX = 1776; // focal length in reference pixels

export const REF_CAMERA = {
  position: new THREE.Vector3(-0.64, 1.72, 12.89),
  yaw: THREE.MathUtils.degToRad(7.96), // turned a little to the left (toward -x)
  pitch: THREE.MathUtils.degToRad(-0.15),
  vfov: THREE.MathUtils.radToDeg(2 * Math.atan(REF_H / 2 / FOCAL_PX)), // ~29.7°
};

export function applyRefCamera(camera: THREE.PerspectiveCamera): void {
  camera.position.copy(REF_CAMERA.position);
  camera.rotation.set(REF_CAMERA.pitch, REF_CAMERA.yaw, 0, 'YXZ');
  camera.fov = REF_CAMERA.vfov;
  camera.updateProjectionMatrix();
}

const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(REF_CAMERA.pitch, REF_CAMERA.yaw, 0, 'YXZ'));

/** World point `dist` meters from the camera along the ray through reference pixel (u, v). */
function at(u: number, v: number, dist: number): THREE.Vector3 {
  const dir = new THREE.Vector3((u - REF_W / 2) / FOCAL_PX, -(v - REF_H / 2) / FOCAL_PX, -1).normalize();
  return dir.applyQuaternion(camQuat).multiplyScalar(dist).add(REF_CAMERA.position);
}
/** Meters covered by `px` reference pixels at `dist` meters. */
const m = (px: number, dist: number) => (px * dist) / FOCAL_PX;

const C = {
  island: 0x3f7f5c,
  rock: 0x7f7567,
  jungle: 0x3e8a3c,
  crown: 0x4f9a3a,
  trunk: 0x8a6f4e,
  hut: 0x9a7a52,
  roof: 0xb89a62,
  board: 0xdcecf4,
  bush: 0x4c8f3c,
};

/**
 * Half-ellipsoid ("mound") whose silhouette covers reference pixels [u0, u1] x [vTop, vBase]
 * at `dist` meters. The base sits at `baseY` (sea level / sand), depth = width * depthRatio.
 */
function mound(u0: number, u1: number, vTop: number, vBase: number, dist: number, color: number, baseY: number, depthRatio = 0.5) {
  const base = at((u0 + u1) / 2, vBase, dist);
  const w = m(u1 - u0, dist);
  const h = at((u0 + u1) / 2, vTop, dist).y - baseY;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  );
  mesh.scale.set(w / 2, h, (w / 2) * depthRatio);
  mesh.position.set(base.x, baseY, base.z);
  mesh.rotation.y = REF_CAMERA.yaw; // face the camera
  return mesh;
}

/** Full ellipsoid centered on reference pixel (u, v) with pixel size (wPx, hPx). */
function blob(u: number, v: number, wPx: number, hPx: number, dist: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  mesh.scale.set(m(wPx, dist) / 2, m(hPx, dist) / 2, m(wPx, dist) / 2);
  mesh.position.copy(at(u, v, dist));
  return mesh;
}

/** Palm placeholder: trunk from the sand to the crown center, crown as a flat ellipsoid. */
function palm(baseU: number, crownU: number, crownV: number, crownWPx: number, dist: number) {
  const g = new THREE.Group();
  const crown = at(crownU, crownV, dist);
  // Base: where the sand (y = 0) is at this distance, under baseU.
  const foot = at(baseU, REF_H / 2, dist);
  foot.y = 0;
  const trunkLen = foot.distanceTo(crown);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, trunkLen, 10),
    new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 0.9 }),
  );
  trunk.position.copy(foot).lerp(crown, 0.5);
  trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), crown.clone().sub(foot).normalize());
  const w = m(crownWPx, dist);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), new THREE.MeshStandardMaterial({ color: C.crown, roughness: 0.85 }));
  leaves.scale.set(w / 2, w * 0.18, w / 2);
  leaves.position.copy(crown);
  g.add(trunk, leaves);
  return g;
}

export function createRefBlockout(scene: THREE.Scene, seaLevel: number): void {
  const items: THREE.Object3D[] = [];

  // --- Far: island on the right (~1.5 km). Long low tail + main body + peak.
  items.push(
    mound(1060, 1660, 448, 463, 1500, C.island, seaLevel, 0.3),
    mound(1235, 1575, 398, 463, 1500, C.island, seaLevel, 0.4),
    mound(1330, 1420, 374, 463, 1500, C.island, seaLevel, 0.6),
  );

  // --- Mid-far: rocky headland on the left (~90 m), jungle on top, rocks at the waterline.
  items.push(
    mound(110, 340, 300, 505, 90, C.rock, seaLevel, 0.7),
    mound(240, 450, 420, 505, 90, C.rock, seaLevel, 0.6),
    mound(0, 230, 280, 505, 80, C.jungle, seaLevel, 0.7),
  );

  // --- Mid: palms, hut, surfboard, fence and bushes on the left beach (25-45 m).
  items.push(
    palm(-80, 110, 110, 300, 30),
    palm(40, 150, 270, 130, 45),
    palm(-20, 40, 250, 140, 50),
  );
  const hutD = 34;
  const hutBody = new THREE.Mesh(
    new THREE.BoxGeometry(m(120, hutD), m(155, hutD), m(120, hutD)),
    new THREE.MeshStandardMaterial({ color: C.hut, roughness: 0.9 }),
  );
  hutBody.position.copy(at(20, 478, hutD));
  hutBody.position.y = m(155, hutD) / 2;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(m(110, hutD), m(40, hutD), 4),
    new THREE.MeshStandardMaterial({ color: C.roof, roughness: 0.9 }),
  );
  roof.position.set(hutBody.position.x, m(155, hutD) + m(20, hutD), hutBody.position.z);
  roof.rotation.y = Math.PI / 4;
  items.push(hutBody, roof);

  const board = new THREE.Mesh(
    new THREE.CapsuleGeometry(m(16, 32), m(100, 32), 4, 12),
    new THREE.MeshStandardMaterial({ color: C.board, roughness: 0.5 }),
  );
  board.scale.z = 0.2;
  board.position.copy(at(64, 484, 32));
  board.position.y = m(66, 32);
  items.push(board);

  const fenceMat = new THREE.MeshStandardMaterial({ color: C.hut, roughness: 0.9 });
  for (const [v, h] of [
    [500, 8],
    [530, 8],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(m(170, 33), m(h, 33), 0.08), fenceMat);
    rail.position.copy(at(80, v, 33));
    rail.rotation.y = REF_CAMERA.yaw;
    items.push(rail);
  }

  items.push(blob(70, 575, 190, 50, 25, C.bush), blob(10, 545, 80, 60, 30, C.bush));

  // --- Near: a plant poking into the bottom-right corner (~6 m).
  items.push(blob(1650, 935, 140, 90, 6, C.bush));

  for (const o of items) {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    scene.add(o);
  }
}
