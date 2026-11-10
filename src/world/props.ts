import * as THREE from 'three';
import { Physics } from '../physics/physics';
import { VoxelBuilder } from './voxel';

// Movable physical props. Tables do not fly because a sleeve brushed them:
// each kind has a believable mass and a "trip factor" (how much walking into
// it upsets a person).
export type PropKind = 'bin' | 'wheelie' | 'chair' | 'crate' | 'cone' | 'crisps' | 'pot' | 'deckchair' | 'binbag' | 'plant';

interface PropSpec {
  half: [number, number, number];
  mass: number;
  trip: number;
  build: (b: VoxelBuilder, v: number) => void;
}

const SPECS: Record<PropKind, PropSpec> = {
  bin: {
    half: [0.24, 0.45, 0.24], mass: 8, trip: 0.9,
    build: (b) => {
      b.box(0, 0, 0, 0.44, 0.84, 0.44, 0x24402f);
      b.box(0, 0.43, 0, 0.48, 0.05, 0.48, 0x1a2d22);
      b.box(0, 0.25, 0.221, 0.3, 0.1, 0.01, 0x0d0f0e);
      b.box(0, 0.05, 0.224, 0.2, 0.1, 0.006, 0xc9a23a);
      b.box(0, -0.43, 0, 0.4, 0.04, 0.4, 0x151a17);
    },
  },
  wheelie: {
    half: [0.29, 0.52, 0.34], mass: 13, trip: 0.95,
    build: (b, v) => {
      const c = [0x3a5a40, 0x2f4f6f, 0x5a5a5a][v % 3];
      b.box(0, -0.04, 0, 0.56, 0.88, 0.62, c);
      b.box(0, 0.44, 0.02, 0.6, 0.08, 0.7, shade(c, 0.8));
      b.box(0, 0.42, -0.34, 0.5, 0.05, 0.06, 0x1a1c1e);
      b.box(0.24, -0.47, -0.28, 0.06, 0.1, 0.1, 0x111);
      b.box(-0.24, -0.47, -0.28, 0.06, 0.1, 0.1, 0x111);
      b.box(0, 0.1, 0.312, 0.2, 0.2, 0.006, 0xe6e0d2);
    },
  },
  chair: {
    half: [0.22, 0.44, 0.22], mass: 4.5, trip: 0.9,
    build: (b) => {
      const c = 0x2f5d8a;
      b.box(0, 0.0, 0, 0.42, 0.05, 0.42, c);
      b.box(0, 0.24, -0.19, 0.42, 0.4, 0.05, c);
      for (const [x, z] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) b.box(x, -0.23, z, 0.04, 0.42, 0.04, 0x8a8f96);
    },
  },
  crate: {
    half: [0.26, 0.17, 0.2], mass: 3.5, trip: 0.8,
    build: (b, v) => {
      const c = [0xb0483a, 0x3a6ea5, 0xd8a53a][v % 3];
      b.box(0, -0.14, 0, 0.52, 0.05, 0.4, c);
      b.box(0, 0, 0.18, 0.52, 0.34, 0.04, c);
      b.box(0, 0, -0.18, 0.52, 0.34, 0.04, c);
      b.box(0.24, 0, 0, 0.04, 0.34, 0.4, c);
      b.box(-0.24, 0, 0, 0.04, 0.34, 0.4, c);
      for (let i = -1; i <= 1; i++) b.box(i * 0.14, 0.02, 0, 0.09, 0.26, 0.09, i ? 0x4b6b3a : 0x6a4a2a);
    },
  },
  cone: {
    half: [0.15, 0.25, 0.15], mass: 1.4, trip: 0.55,
    build: (b) => {
      b.box(0, -0.23, 0, 0.3, 0.04, 0.3, 0x24262c);
      b.box(0, -0.13, 0, 0.2, 0.16, 0.2, 0xe8642a);
      b.box(0, 0.02, 0, 0.15, 0.14, 0.15, 0xf4f4f0);
      b.box(0, 0.15, 0, 0.1, 0.12, 0.1, 0xe8642a);
      b.box(0, 0.23, 0, 0.06, 0.04, 0.06, 0xe8642a);
    },
  },
  crisps: {
    half: [0.18, 0.14, 0.14], mass: 0.5, trip: 0.3,
    build: (b, v) => {
      const c = [0xd9462f, 0x2f7fd9, 0x3aa35a, 0xe0a62a][v % 4];
      b.box(0, 0, 0, 0.36, 0.28, 0.28, c);
      b.box(0, 0.03, 0.141, 0.22, 0.12, 0.004, 0xf4f4f0);
      b.box(0, 0.141, 0, 0.36, 0.004, 0.05, 0xd9c9a3);
    },
  },
  pot: {
    half: [0.17, 0.2, 0.17], mass: 5, trip: 0.75,
    build: (b, v) => {
      b.box(0, -0.06, 0, 0.3, 0.28, 0.3, 0xb5633c);
      b.box(0, 0.09, 0, 0.34, 0.05, 0.34, 0xa1532f);
      b.box(0, 0.16, 0, 0.2, 0.1, 0.2, 0x3f7a3a);
      b.box(0.05, 0.19, 0.03, 0.08, 0.06, 0.08, [0xd95c8a, 0xf1d24a, 0xe8642a][v % 3]);
    },
  },
  plant: {
    half: [0.2, 0.5, 0.2], mass: 7, trip: 0.8,
    build: (b) => {
      b.box(0, -0.33, 0, 0.36, 0.34, 0.36, 0x6b6f78);
      b.box(0, -0.05, 0, 0.06, 0.3, 0.06, 0x5a4027);
      b.box(0, 0.22, 0, 0.36, 0.3, 0.36, 0x3f7a3a, 0.1);
      b.box(0.08, 0.42, -0.05, 0.2, 0.16, 0.2, 0x4c8a45);
    },
  },
  deckchair: {
    half: [0.28, 0.3, 0.42], mass: 3.5, trip: 0.85,
    build: (b) => {
      b.box(0, -0.05, 0, 0.5, 0.04, 0.8, 0xd9c9a3);
      for (let i = -3; i <= 3; i += 2) b.box(i * 0.07, -0.025, 0, 0.07, 0.01, 0.8, 0xd9462f);
      b.box(0, 0.12, -0.36, 0.5, 0.36, 0.05, 0xd9c9a3);
      b.box(0.25, -0.17, 0, 0.04, 0.26, 0.84, 0x8a6a45);
      b.box(-0.25, -0.17, 0, 0.04, 0.26, 0.84, 0x8a6a45);
    },
  },
  binbag: {
    half: [0.25, 0.2, 0.25], mass: 3, trip: 0.6,
    build: (b) => {
      b.box(0, -0.03, 0, 0.5, 0.34, 0.5, 0x1b1c20, 0.15);
      b.box(0, 0.16, 0, 0.14, 0.08, 0.14, 0x24262c);
    },
  },
};

export function spawnProp(phys: Physics, scene: THREE.Object3D, id: string, kind: PropKind, x: number, y: number, z: number, yaw = 0, variant = 0): void {
  const s = SPECS[kind];
  const b = new VoxelBuilder();
  s.build(b, variant);
  const mesh = b.mesh({ receive: false });
  scene.add(mesh);
  const pos = new THREE.Vector3(x, y + s.half[1] + 0.01, z);
  mesh.position.copy(pos);
  mesh.rotation.y = yaw;
  phys.addDynamicBox(id, mesh, pos, new THREE.Vector3(...s.half), { mass: s.mass, tripFactor: s.trip, yaw, kind: 'prop' });
}

function shade(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}
