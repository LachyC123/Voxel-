import { VoxelBuilder } from '../world/voxel';

// Item definitions. Belt gear is owned through the career record; parcels and
// goods are world item instances with stable IDs (see world/items.ts).
export interface ItemDef {
  id: string;
  name: string;
  role: string;
  /** Full size in metres (collision box when loose in the world). */
  size: [number, number, number];
  mass: number;
  belt: boolean;
  unlock: 'initial' | 'first_shift' | 'patrol_officer';
  unlockHint: string;
  tripFactor: number;
  build: (b: VoxelBuilder) => void;
}

const defs: ItemDef[] = [
  {
    id: 'torch_basic', name: 'Patrol torch', role: 'Lights dim rooms. Use to switch on or off.',
    size: [0.06, 0.06, 0.24], mass: 0.4, belt: true, unlock: 'initial', unlockHint: 'Issued on day one.', tripFactor: 0.2,
    build: (b) => {
      b.box(0, 0, -0.03, 0.045, 0.045, 0.17, 0x1c1e24);
      b.box(0, 0, -0.07, 0.05, 0.05, 0.03, 0x2e323b);
      b.box(0, 0, 0.075, 0.07, 0.07, 0.06, 0x2a2d35);
      b.box(0, 0, 0.11, 0.058, 0.058, 0.012, 0xffe9a3);
      b.box(0, 0.027, 0.0, 0.016, 0.01, 0.03, 0xd9462f);
    },
  },
  {
    id: 'radio', name: 'Airwave radio', role: 'Dispatch and handover requests. Use to open the radio menu.',
    size: [0.07, 0.14, 0.04], mass: 0.3, belt: true, unlock: 'initial', unlockHint: 'Issued on day one.', tripFactor: 0.2,
    build: (b) => {
      b.box(0, 0, 0, 0.07, 0.13, 0.04, 0x17191e);
      b.box(-0.022, 0.1, 0, 0.014, 0.09, 0.014, 0x0d0e11);
      b.box(0.018, 0.075, 0, 0.022, 0.022, 0.022, 0x3a3f4a);
      b.box(0, 0.03, 0.021, 0.05, 0.035, 0.004, 0x7fd0c0);
      b.box(0, -0.025, 0.021, 0.05, 0.045, 0.004, 0x2b2f38);
      b.box(0.02, 0.066, 0.021, 0.012, 0.012, 0.004, 0xe0a62a);
    },
  },
  {
    id: 'notebook', name: 'Pocket notebook', role: 'Case facts, claims and leads. Use to open.',
    size: [0.1, 0.14, 0.02], mass: 0.1, belt: true, unlock: 'initial', unlockHint: 'Issued on day one.', tripFactor: 0.1,
    build: (b) => {
      b.box(0, 0, 0, 0.1, 0.14, 0.018, 0x14233f);
      b.box(0.004, 0, 0, 0.094, 0.132, 0.012, 0xf1ead8);
      b.box(0, 0, 0.0095, 0.1, 0.14, 0.003, 0x14233f);
      b.box(0, 0.068, 0, 0.1, 0.008, 0.024, 0xbfc4cc);
      b.box(0, 0.01, 0.0115, 0.05, 0.03, 0.002, 0xcfd3da);
      b.box(0.058, 0, 0.004, 0.012, 0.13, 0.012, 0xe0a62a);
    },
  },
  {
    id: 'evidence_kit', name: 'Evidence kit', role: 'Bag and tag items properly. Evidence you bag counts in your review.',
    size: [0.18, 0.12, 0.08], mass: 0.5, belt: true, unlock: 'first_shift', unlockHint: 'Complete your first shift.', tripFactor: 0.2,
    build: (b) => {
      b.box(0, 0, 0, 0.18, 0.1, 0.08, 0x23324f);
      b.box(0, 0.052, 0, 0.19, 0.012, 0.09, 0x182238);
      b.box(0, 0.07, 0, 0.07, 0.025, 0.02, 0x10151f);
      b.box(0, 0.0, 0.041, 0.1, 0.05, 0.004, 0xf1ead8);
      b.box(0, 0.0, 0.044, 0.06, 0.012, 0.002, 0xd9462f);
      b.box(0.07, 0.03, 0.041, 0.02, 0.02, 0.004, 0xe0a62a);
    },
  },
  {
    id: 'traffic_cones', name: 'Traffic cones', role: 'Mark a temporary hazard. (Arrives with vehicle training.)',
    size: [0.3, 0.45, 0.3], mass: 1, belt: true, unlock: 'patrol_officer', unlockHint: 'Reach Patrol Officer (300 career XP).', tripFactor: 0.4,
    build: (b) => {
      b.box(0, -0.2, 0, 0.3, 0.04, 0.3, 0x24262c);
      b.box(0, -0.12, 0, 0.2, 0.12, 0.2, 0xe8642a);
      b.box(0, 0.0, 0, 0.15, 0.12, 0.15, 0xf4f4f0);
      b.box(0, 0.12, 0, 0.1, 0.12, 0.1, 0xe8642a);
      b.box(0, 0.21, 0, 0.06, 0.06, 0.06, 0xe8642a);
    },
  },
  {
    id: 'parcel', name: 'Parcel', role: 'Delivery for the corner shop.',
    size: [0.42, 0.26, 0.34], mass: 2.5, belt: false, unlock: 'initial', unlockHint: '', tripFactor: 0.45,
    build: (b) => {
      b.box(0, 0, 0, 0.42, 0.26, 0.34, 0xb98b56, 0.06);
      b.box(0, 0.131, 0, 0.42, 0.004, 0.06, 0xd9c9a3);
      b.box(0, 0, 0.171, 0.06, 0.26, 0.004, 0xd9c9a3);
      b.box(0.1, 0.02, 0.172, 0.12, 0.08, 0.004, 0xf4f4f0);
    },
  },
  {
    id: 'shortbread_tin', name: 'Tin of shortbread', role: 'Stock from the corner shop (£6.50).',
    size: [0.2, 0.09, 0.2], mass: 0.6, belt: false, unlock: 'initial', unlockHint: '', tripFactor: 0.2,
    build: (b) => {
      b.box(0, 0, 0, 0.2, 0.08, 0.2, 0xa3202a);
      b.box(0, 0.042, 0, 0.21, 0.014, 0.21, 0xc9a23a);
      b.box(0, 0.05, 0, 0.12, 0.004, 0.12, 0x1f4a37);
      b.box(0, 0, 0.101, 0.12, 0.04, 0.004, 0xf1ead8);
    },
  },
];

export const ITEM_DEFS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const BELT_ITEMS = defs.filter((d) => d.belt);
