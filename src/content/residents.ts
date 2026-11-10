import type { ResidentDef } from '../ai/npc';
import type { Outfit } from '../characters/rig';

export const POLICE_OUTFIT: Outfit = {
  skin: 0xd9a57e, hair: 0x3a2a1c, hairStyle: 'short', top: 0x1b2236, topAccent: 0x1b2236, bottom: 0x14161c, shoes: 0x0d0d10,
  hat: 'police', police: true,
};

// Named residents (docs/plan/04). Anyone may have an ordinary, non-incident
// day; nobody is permanently "the criminal NPC".
export const RESIDENTS: ResidentDef[] = [
  {
    id: 'mara', name: 'Mara', role: 'Shop owner', start: 'mara_door', speed: 1.4,
    outfit: { skin: 0xc48a5e, hair: 0x241a16, hairStyle: 'bun', top: 0x7a4b6a, bottom: 0x3b3f52, shoes: 0x2a2422, apron: 0x2f5d4a },
    traits: { confidence: 0.75, patience: 0.45, honesty: 0.85, sociability: 0.6, impulsiveness: 0.3 },
  },
  {
    id: 'glen', name: 'Glen', role: 'Delivery driver', start: 'van_rear', speed: 1.5,
    outfit: { skin: 0xe8b796, hair: 0x6b4a2f, hairStyle: 'short', top: 0x3a4a5a, bottom: 0x2b2d33, shoes: 0x5a4027, hat: 'cap', hatColor: 0x2a7a6e, hiVis: true, beard: 0x6b4a2f, build: 1.1 },
    traits: { confidence: 0.7, patience: 0.3, honesty: 0.7, sociability: 0.5, impulsiveness: 0.6 },
  },
  {
    id: 'june', name: 'June', role: 'Upstairs resident', start: 'june_mags', speed: 1.1,
    outfit: { skin: 0xf0c8a8, hair: 0xdcdcdc, hairStyle: 'curly', top: 0x4f7fb0, topAccent: 0xe6d5a8, bottom: 0x6b5a4a, shoes: 0x3a2f2a, glasses: true, height: 0.95 },
    traits: { confidence: 0.6, patience: 0.7, honesty: 0.9, sociability: 0.95, impulsiveness: 0.4 },
  },
  {
    id: 'toby', name: 'Toby', role: 'Student', start: 'browse_a', speed: 1.35,
    outfit: { skin: 0x8d5a3b, hair: 0x1c1410, hairStyle: 'curly', top: 0xd8a53a, topAccent: 0xb8872a, bottom: 0x35415a, shoes: 0xe8e6e0, glasses: true, build: 0.94 },
    traits: { confidence: 0.25, patience: 0.5, honesty: 0.85, sociability: 0.4, impulsiveness: 0.5 },
  },
  {
    id: 'rhys', name: 'Rhys', role: 'Regular', start: 'green_bench', speed: 1.4,
    outfit: { skin: 0xe2b08c, hair: 0xb5652a, hairStyle: 'short', top: 0x4a4f58, topAccent: 0x2b2d33, bottom: 0x23252b, shoes: 0x2b2b2b, hat: 'beanie', hatColor: 0x8a2f2f },
    traits: { confidence: 0.6, patience: 0.3, honesty: 0.35, sociability: 0.5, impulsiveness: 0.8 },
  },
  {
    id: 'sgt', name: 'Sgt Bell', role: 'Desk sergeant', start: 'sgt_desk', speed: 1.3,
    outfit: { ...POLICE_OUTFIT, skin: 0x9a6a48, hair: 0x8a8a8a, hat: undefined, beard: 0x8a8a8a, build: 1.08 },
    traits: { confidence: 0.9, patience: 0.8, honesty: 0.95, sociability: 0.5, impulsiveness: 0.1 },
  },
  {
    id: 'pip', name: 'Cadet Pip', role: 'Police cadet', start: 'yard_spawn', speed: 1.3,
    outfit: { ...POLICE_OUTFIT, skin: 0xf0c8a8, hair: 0xc9a23a, hairStyle: 'bob', hiVis: true, height: 0.96 },
    traits: { confidence: 0.4, patience: 0.8, honesty: 0.9, sociability: 0.7, impulsiveness: 0.4 },
  },
];
