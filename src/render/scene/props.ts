// Scenery from CC0 model kits (Kenney Nature Kit): palms, rocks, plants, a distant island.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = 'assets/models/kenney-nature/';

interface Placement {
  model: string;
  x: number;
  z: number;
  scale: number | [number, number, number];
  rotY?: number;
  y?: number;
  shadow?: boolean;
}

// Left: palms, rocks and bushes like the reference picture. Right: a few palms far behind.
const PLACEMENTS: Placement[] = [
  // Big palm at the left edge, in front of the court (partly off screen)
  { model: 'tree_palmDetailedTall', x: -13.2, z: 4.5, scale: 7.5, rotY: 0.4, shadow: true },
  { model: 'plant_bushLarge', x: -13.5, z: 7, scale: 3 },
  { model: 'grass_leafsLarge', x: -11.8, z: 7.5, scale: 4 },
  // Grove behind the court on the left
  { model: 'tree_palmBend', x: -14.5, z: -4, scale: 6.5, rotY: 2.2, shadow: true },
  { model: 'tree_palmTall', x: -17, z: -8, scale: 7.5, rotY: 1.1 },
  { model: 'tree_palmDetailedShort', x: -20, z: -3, scale: 6, rotY: 3.6 },
  { model: 'tree_palm', x: -22, z: -9, scale: 8, rotY: 5 },
  { model: 'tree_palmShort', x: -27, z: -6, scale: 7, rotY: 0.2 },
  { model: 'plant_bushDetailed', x: -15.5, z: -1, scale: 3, rotY: 1 },
  { model: 'rock_largeA', x: -19, z: -12, scale: 6, rotY: 0.6 },
  { model: 'rock_tallA', x: -25, z: -13, scale: 8, rotY: 2 },
  { model: 'rock_largeD', x: -15, z: -11.5, scale: 4, rotY: 4 },
  // A couple of palms far behind on the right
  { model: 'tree_palmTall', x: 30, z: -30, scale: 7, rotY: 2.5 },
  { model: 'tree_palmBend', x: 36, z: -26, scale: 6.5, rotY: 4.4 },
  { model: 'grass_large', x: 13, z: 7, scale: 4, rotY: 1.5 },
];

export function createProps(scene: THREE.Scene, onLoaded: (ok: boolean) => void): { update(t: number): void } {
  const loader = new GLTFLoader();
  const palms: THREE.Object3D[] = [];
  const names = [...new Set(PLACEMENTS.map((p) => p.model))];
  Promise.all(names.map((n) => loader.loadAsync(`${DIR}${n}.glb`).then((g) => [n, g.scene] as const)))
    .then((loaded) => {
      const byName = new Map(loaded);
      for (const root of byName.values()) fixKenneyMaterials(root);
      for (const p of PLACEMENTS) {
        const obj = byName.get(p.model)!.clone();
        if (Array.isArray(p.scale)) obj.scale.set(...p.scale);
        else obj.scale.setScalar(p.scale);
        obj.position.set(p.x, p.y ?? 0, p.z);
        obj.rotation.y = p.rotY ?? 0;
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = !!p.shadow;
            o.receiveShadow = true;
          }
        });
        if (p.model.startsWith('tree_palm')) palms.push(obj);
        scene.add(obj);
      }
      onLoaded(true);
    })
    .catch(() => onLoaded(false));

  return {
    update(t) {
      // Gentle sway in the sea breeze
      palms.forEach((p, i) => {
        p.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.015;
      });
    },
  };
}

/** Kenney's glTF exports store sRGB colors as linear factors and mark everything metallic; fix both once per material. */
function fixKenneyMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial;
      if (mat.userData.fixed) continue;
      mat.color.convertSRGBToLinear();
      mat.metalness = 0;
      mat.roughness = 0.85;
      mat.userData.fixed = true;
    }
  });
}
