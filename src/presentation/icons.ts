import * as THREE from 'three';
import { BELT_ITEMS, ITEM_DEFS } from '../content/items';
import { buildItemMesh } from '../world/items';

// Item icon pipeline (docs/plan/07): render the actual in-game item model in a
// dedicated orthographic studio — consistent three-quarter view, normalised
// scale, neutral lighting, transparent background. No emoji or clipart.
const cache = new Map<string, string>();

export function renderItemIcons(size = 128): Map<string, string> {
  if (cache.size) return cache;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  cam.position.set(2.2, 2.0, 3.2);
  cam.lookAt(0, 0, 0);
  const ids = [...BELT_ITEMS.map((d) => d.id), 'shortbread_tin', 'parcel'];
  for (const id of ids) {
    const mesh = buildItemMesh(ITEM_DEFS[id]);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const holder = new THREE.Group();
    mesh.position.copy(c).multiplyScalar(-1);
    holder.add(mesh);
    holder.rotation.y = id === 'torch_basic' ? -0.9 : 0.3;
    if (id === 'torch_basic') holder.rotation.x = -0.35;
    // project the rotated bounds into camera space and scale to a consistent fill
    holder.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    const view = cam.matrixWorldInverse;
    let ex = 0, ey = 0;
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
      const p = new THREE.Vector3(sx * s.x, sy * s.y, sz * s.z).applyEuler(holder.rotation).applyMatrix4(view);
      ex = Math.max(ex, Math.abs(p.x));
      ey = Math.max(ey, Math.abs(p.y));
    }
    const k = 0.82 / Math.max(ex, ey);
    holder.scale.setScalar(k);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -ey * k * 0.78;
    shadow.scale.set(1, 0.7, 1);
    scene.add(holder, shadow);
    renderer.render(scene, cam);
    cache.set(id, canvas.toDataURL('image/png'));
    scene.remove(holder, shadow);
    mesh.geometry.dispose();
    shadow.geometry.dispose();
    (shadow.material as THREE.Material).dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return cache;
}
