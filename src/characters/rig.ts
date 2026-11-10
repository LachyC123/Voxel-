import * as THREE from 'three';
import { VoxelBuilder } from '../world/voxel';

// Voxel-style segmented character rig: head, chest, pelvis, upper/lower arms,
// hands, upper/lower legs and feet. Character forward is +Z, left is +X.
export interface Outfit {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'bob' | 'bun' | 'curly' | 'bald' | 'long';
  top: number;
  topAccent?: number;
  bottom: number;
  shoes: number;
  hat?: 'police' | 'beanie' | 'cap';
  hatColor?: number;
  apron?: number;
  hiVis?: boolean;
  police?: boolean;
  glasses?: boolean;
  beard?: number;
  shortSleeves?: boolean;
  build?: number;
  height?: number;
}

/** Pose channel indices. Pitches are "forward positive"; shoulder roll is "outward positive". */
export const P = {
  rootY: 0, rootPitch: 1, rootRoll: 2,
  hipsPitch: 3, hipsRoll: 4, hipsYaw: 5,
  chestPitch: 6, chestRoll: 7, chestYaw: 8,
  headPitch: 9, headYaw: 10, headRoll: 11,
  shLP: 12, shLR: 13, elL: 14,
  shRP: 15, shRR: 16, elR: 17,
  hipLP: 18, kneeL: 19, hipRP: 20, kneeR: 21,
  brow: 22, hipLR: 23, hipRR: 24,
} as const;
export const POSE_N = 25;
export type Pose = Float32Array;
export const newPose = (): Pose => new Float32Array(POSE_N);

export class Rig {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private brows = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elL = new THREE.Group();
  private elR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  /** Attach held items here. */
  readonly handR = new THREE.Group();
  readonly handL = new THREE.Group();
  /** Carried stack rests here (in front of chest). */
  readonly carry = new THREE.Group();
  readonly headAnchor = this.head;
  readonly hipHeight: number;
  readonly cur = newPose();
  private vel = newPose();

  constructor(o: Outfit) {
    const hs = o.height ?? 1;
    const bw = o.build ?? 1;
    this.hipHeight = 0.88 * hs;
    this.root.add(this.tilt);
    this.tilt.add(this.hips);
    this.hips.position.y = this.hipHeight;
    this.root.scale.setScalar(1);

    const seg = (parent: THREE.Object3D, fn: (b: VoxelBuilder) => void): void => {
      const b = new VoxelBuilder();
      fn(b);
      parent.add(b.mesh({ receive: false }));
    };
    const top = o.top, acc = o.topAccent ?? o.top;
    const sleeve = o.shortSleeves ? o.skin : top;

    // Pelvis
    seg(this.hips, (b) => {
      b.box(0, 0.05, 0, 0.34 * bw, 0.2, 0.21, o.bottom);
      b.box(0, 0.13, 0, 0.35 * bw, 0.05, 0.22, o.police ? 0x15171c : 0x3b2e25); // belt
      if (o.police) {
        b.box(0.15 * bw, 0.1, 0.1, 0.07, 0.09, 0.06, 0x101114); // pouch
        b.box(-0.16 * bw, 0.08, 0.05, 0.05, 0.14, 0.07, 0x101114); // baton holder
        b.box(0, 0.13, 0.115, 0.06, 0.05, 0.02, 0xbfc4cc); // buckle
      }
    });

    // Chest
    this.chest.position.set(0, 0.15, 0);
    this.hips.add(this.chest);
    seg(this.chest, (b) => {
      b.box(0, 0.21, 0, 0.38 * bw, 0.44, 0.23, top);
      b.box(0, 0.4, 0, 0.3 * bw, 0.06, 0.2, acc); // shoulders yoke
      if (o.police) {
        b.box(0, 0.39, 0.11, 0.1, 0.08, 0.02, 0xf2f2ee); // collar
        b.box(0, 0.27, 0.118, 0.04, 0.2, 0.012, 0x0c0f18); // tie
        b.box(0.11 * bw, 0.3, 0.118, 0.06, 0.06, 0.012, 0xcfd3da); // badge
        b.box(-0.1 * bw, 0.31, 0.125, 0.07, 0.1, 0.04, 0x16181d); // chest radio
        b.box(-0.1 * bw, 0.38, 0.125, 0.015, 0.06, 0.015, 0x16181d);
        b.box(0.17 * bw, 0.435, 0, 0.08, 0.02, 0.1, 0xcfd3da); // epaulettes
        b.box(-0.17 * bw, 0.435, 0, 0.08, 0.02, 0.1, 0xcfd3da);
      }
      if (o.hiVis) {
        b.box(0, 0.22, 0, 0.395 * bw, 0.36, 0.245, 0xd8e12a);
        b.box(0, 0.2, 0, 0.4 * bw, 0.04, 0.25, 0xb9bcc0);
        b.box(0, 0.3, 0, 0.4 * bw, 0.04, 0.25, 0xb9bcc0);
      }
      if (o.apron !== undefined) {
        b.box(0, 0.14, 0.118, 0.3 * bw, 0.36, 0.015, o.apron);
        b.box(0, 0.36, 0.118, 0.14, 0.1, 0.015, o.apron);
        b.box(0, 0.12, 0.128, 0.16, 0.1, 0.012, (o.apron & 0xfefefe) >> 1); // pocket
      }
      if (!o.police && !o.hiVis && o.apron === undefined && acc !== top) {
        b.box(0, 0.24, 0.117, 0.05, 0.36, 0.01, acc); // zip / stripe
      }
    });

    // Head
    this.head.position.set(0, 0.44, 0);
    this.chest.add(this.head);
    seg(this.head, (b) => {
      b.box(0, 0.02, 0, 0.11, 0.06, 0.11, o.skin); // neck
      b.box(0, 0.18, 0, 0.27, 0.27, 0.26, o.skin);
      b.box(0.068, 0.2, 0.131, 0.045, 0.05, 0.012, 0x1d1b22); // eyes
      b.box(-0.068, 0.2, 0.131, 0.045, 0.05, 0.012, 0x1d1b22);
      b.box(0.075, 0.213, 0.138, 0.016, 0.016, 0.004, 0xffffff);
      b.box(-0.061, 0.213, 0.138, 0.016, 0.016, 0.004, 0xffffff);
      b.box(0, 0.155, 0.14, 0.05, 0.05, 0.03, shade(o.skin, 0.93)); // nose
      b.box(0, 0.095, 0.131, 0.08, 0.018, 0.01, shade(o.skin, 0.6)); // mouth
      b.box(0.142, 0.18, 0, 0.02, 0.07, 0.06, shade(o.skin, 0.92)); // ears
      b.box(-0.142, 0.18, 0, 0.02, 0.07, 0.06, shade(o.skin, 0.92));
      if (o.beard !== undefined) {
        b.box(0, 0.085, 0.06, 0.28, 0.1, 0.16, o.beard);
        b.box(0, 0.12, 0.134, 0.12, 0.02, 0.012, o.beard);
      }
      if (o.glasses) {
        b.box(0.068, 0.2, 0.14, 0.085, 0.07, 0.008, 0x20242c);
        b.box(-0.068, 0.2, 0.14, 0.085, 0.07, 0.008, 0x20242c);
        b.box(0, 0.21, 0.14, 0.05, 0.012, 0.008, 0x20242c);
      }
      const h = o.hair;
      switch (o.hairStyle) {
        case 'short':
          b.box(0, 0.325, -0.01, 0.29, 0.06, 0.27, h);
          b.box(0, 0.25, -0.115, 0.29, 0.15, 0.06, h);
          b.box(0.04, 0.345, 0.07, 0.16, 0.04, 0.1, h);
          break;
        case 'bob':
          b.box(0, 0.325, 0, 0.3, 0.07, 0.29, h);
          b.box(0, 0.19, -0.12, 0.3, 0.26, 0.07, h);
          b.box(0.145, 0.2, -0.02, 0.03, 0.24, 0.2, h);
          b.box(-0.145, 0.2, -0.02, 0.03, 0.24, 0.2, h);
          b.box(0, 0.295, 0.125, 0.27, 0.035, 0.03, h);
          break;
        case 'bun':
          b.box(0, 0.325, 0, 0.29, 0.06, 0.28, h);
          b.box(0, 0.24, -0.12, 0.29, 0.16, 0.06, h);
          b.box(0, 0.39, -0.08, 0.13, 0.11, 0.13, h);
          break;
        case 'curly':
          b.box(0, 0.335, 0, 0.32, 0.09, 0.3, h);
          b.box(0.1, 0.39, 0.02, 0.1, 0.05, 0.12, h);
          b.box(-0.08, 0.385, -0.05, 0.12, 0.05, 0.12, h);
          b.box(0, 0.24, -0.13, 0.31, 0.18, 0.07, h);
          b.box(0.155, 0.26, -0.02, 0.04, 0.14, 0.16, h);
          b.box(-0.155, 0.26, -0.02, 0.04, 0.14, 0.16, h);
          break;
        case 'long':
          b.box(0, 0.325, 0, 0.3, 0.07, 0.29, h);
          b.box(0, 0.12, -0.125, 0.3, 0.42, 0.07, h);
          b.box(0.145, 0.2, -0.03, 0.03, 0.26, 0.16, h);
          b.box(-0.145, 0.2, -0.03, 0.03, 0.26, 0.16, h);
          break;
        case 'bald':
          b.box(0, 0.2, -0.125, 0.28, 0.08, 0.03, h);
          break;
      }
      const hc = o.hatColor ?? 0x12141c;
      if (o.hat === 'police') {
        b.box(0, 0.345, 0, 0.3, 0.07, 0.3, hc);
        b.box(0, 0.385, -0.005, 0.32, 0.04, 0.32, hc);
        b.box(0, 0.33, 0.03, 0.31, 0.035, 0.3, 0x1b1d24);
        for (let i = -3; i <= 3; i++) b.box(i * 0.04, 0.33, 0.152, 0.02, 0.03, 0.008, i % 2 ? 0xf4f4f0 : 0x1b1d24); // chequer band
        b.box(0, 0.32, 0.2, 0.26, 0.018, 0.1, 0x0d0e12); // peak
        b.box(0, 0.375, 0.158, 0.045, 0.045, 0.01, 0xcfd3da); // cap badge
      } else if (o.hat === 'beanie') {
        b.box(0, 0.335, 0, 0.29, 0.1, 0.28, hc);
        b.box(0, 0.295, 0, 0.3, 0.045, 0.29, shade(hc, 0.8));
        b.box(0, 0.4, 0, 0.07, 0.05, 0.07, shade(hc, 1.25));
      } else if (o.hat === 'cap') {
        b.box(0, 0.335, 0, 0.29, 0.07, 0.28, hc);
        b.box(0, 0.31, 0.19, 0.24, 0.02, 0.12, shade(hc, 0.8));
      }
    });
    const browB = new VoxelBuilder();
    browB.box(0.068, 0, 0, 0.07, 0.018, 0.012, shade(o.hair, 0.7));
    browB.box(-0.068, 0, 0, 0.07, 0.018, 0.012, shade(o.hair, 0.7));
    this.brows.add(browB.mesh({ shadows: false, receive: false }));
    this.brows.position.set(0, 0.246, 0.133);
    this.head.add(this.brows);

    // Arms
    const arm = (sh: THREE.Group, el: THREE.Group, hand: THREE.Group, side: number): void => {
      sh.position.set(side * 0.235 * bw, 0.385, 0);
      this.chest.add(sh);
      seg(sh, (b) => {
        b.box(0, -0.14, 0, 0.115, 0.31, 0.12, top);
        if (o.hiVis) b.box(0, -0.06, 0, 0.12, 0.04, 0.125, 0xd8e12a);
      });
      el.position.set(0, -0.29, 0);
      sh.add(el);
      seg(el, (b) => {
        b.box(0, -0.12, 0, 0.1, 0.26, 0.105, sleeve);
        if (o.police) b.box(0, -0.23, 0, 0.105, 0.04, 0.11, 0xf2f2ee);
        b.box(0, -0.305, 0.005, 0.1, 0.11, 0.115, o.skin); // hand
        b.box(side * -0.055, -0.3, 0.03, 0.02, 0.06, 0.04, o.skin); // thumb
      });
      hand.position.set(0, -0.33, 0.02);
      el.add(hand);
    };
    arm(this.shL, this.elL, this.handL, 1);
    arm(this.shR, this.elR, this.handR, -1);
    this.carry.position.set(0, 0.02, 0.34);
    this.chest.add(this.carry);

    // Legs
    const leg = (hip: THREE.Group, knee: THREE.Group, side: number): void => {
      hip.position.set(side * 0.092 * bw, -0.02, 0);
      this.hips.add(hip);
      seg(hip, (b) => b.box(0, -0.2, 0, 0.155, 0.42, 0.17, o.bottom));
      knee.position.set(0, -0.41 * hs, 0);
      hip.add(knee);
      seg(knee, (b) => {
        b.box(0, -0.2, 0, 0.14, 0.4, 0.155, o.bottom);
        b.box(0, -0.4 * hs - 0.01, 0.045, 0.15, 0.09, 0.27, o.shoes);
        b.box(0, -0.4 * hs - 0.045, 0.045, 0.155, 0.02, 0.28, shade(o.shoes, 0.6));
      });
    };
    leg(this.hipL, this.kneeL, 1);
    leg(this.hipR, this.kneeR, -1);
  }

  /** Critically-ish damped spring towards the target pose; gives weight and overshoot. */
  update(target: Pose, dt: number, omega = 15, zeta = 0.72): void {
    const k = omega * omega, c = 2 * zeta * omega;
    const h = Math.min(dt, 1 / 30);
    for (let i = 0; i < POSE_N; i++) {
      const a = k * (target[i] - this.cur[i]) - c * this.vel[i];
      this.vel[i] += a * h;
      this.cur[i] += this.vel[i] * h;
    }
    this.apply();
  }

  kick(channel: number, v: number): void {
    this.vel[channel] += v;
  }

  snap(target: Pose): void {
    this.cur.set(target);
    this.vel.fill(0);
    this.apply();
  }

  private apply(): void {
    const p = this.cur;
    this.tilt.rotation.set(p[P.rootPitch], 0, p[P.rootRoll]);
    this.hips.position.y = this.hipHeight + p[P.rootY];
    this.hips.rotation.set(p[P.hipsPitch], p[P.hipsYaw], p[P.hipsRoll]);
    this.chest.rotation.set(p[P.chestPitch], p[P.chestYaw], p[P.chestRoll]);
    this.head.rotation.set(p[P.headPitch], p[P.headYaw], p[P.headRoll]);
    this.shL.rotation.set(-p[P.shLP], 0, p[P.shLR]);
    this.shR.rotation.set(-p[P.shRP], 0, -p[P.shRR]);
    this.elL.rotation.x = -Math.max(0, p[P.elL]);
    this.elR.rotation.x = -Math.max(0, p[P.elR]);
    this.hipL.rotation.set(-p[P.hipLP], 0, p[P.hipLR]);
    this.hipR.rotation.set(-p[P.hipRP], 0, -p[P.hipRR]);
    this.kneeL.rotation.x = Math.max(0, p[P.kneeL]);
    this.kneeR.rotation.x = Math.max(0, p[P.kneeR]);
    this.brows.position.y = 0.246 + p[P.brow] * 0.02;
    this.brows.rotation.z = 0;
  }
}

function shade(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------- pose library
export type Gesture =
  | 'talk' | 'point' | 'fold' | 'shrug' | 'type' | 'restock' | 'pickup' | 'dust'
  | 'phone' | 'handsUp' | 'lookAround' | 'reach' | 'load' | 'wave' | 'tap' | 'lace';

export interface PoseInput {
  t: number;
  speed: number;
  phase: number;
  lean: number;
  carrying: boolean;
  holdingR: boolean;
  restrained: boolean;
  gesture: Gesture | null;
  gestureT: number;
  seed: number;
  tired: number;
}

export function poseLocomotion(out: Pose, i: PoseInput): void {
  out.fill(0);
  const s = Math.min(1, i.speed / 5.6);
  const moving = i.speed > 0.15;
  const ph = i.phase;
  if (moving) {
    const amp = 0.35 + 0.55 * s;
    const sn = Math.sin(ph), cs = Math.cos(ph);
    out[P.hipLP] = amp * sn;
    out[P.hipRP] = -amp * sn;
    out[P.kneeL] = Math.max(0, -cs) * (0.5 + 1.0 * s) + 0.08;
    out[P.kneeR] = Math.max(0, cs) * (0.5 + 1.0 * s) + 0.08;
    out[P.shLP] = -amp * 0.75 * sn;
    out[P.shRP] = amp * 0.75 * sn;
    out[P.elL] = 0.25 + 0.9 * s + 0.2 * Math.max(0, -sn);
    out[P.elR] = 0.25 + 0.9 * s + 0.2 * Math.max(0, sn);
    out[P.rootY] = -0.02 - 0.035 * s + Math.abs(cs) * (0.02 + 0.03 * s);
    out[P.chestPitch] = 0.04 + 0.22 * s;
    out[P.chestYaw] = -0.12 * amp * sn;
    out[P.hipsYaw] = 0.08 * amp * sn;
    out[P.hipsRoll] = 0.04 * cs;
    out[P.headPitch] = -0.1 * s;
    out[P.rootRoll] = clamp(i.lean, -0.16, 0.16);
  } else {
    // idle: breathing and weight shift
    const b = Math.sin(i.t * 1.6 + i.seed);
    const w = Math.sin(i.t * 0.37 + i.seed * 3);
    out[P.chestPitch] = 0.02 + 0.012 * b + 0.05 * i.tired;
    out[P.rootY] = -0.004 * b - 0.01;
    out[P.hipsRoll] = 0.03 * w;
    out[P.chestRoll] = -0.02 * w;
    out[P.shLR] = 0.05 + 0.01 * b;
    out[P.shRR] = 0.05 + 0.01 * b;
    out[P.elL] = 0.12;
    out[P.elR] = 0.12;
    out[P.kneeL] = 0.03 + Math.max(0, w) * 0.07;
    out[P.kneeR] = 0.03 + Math.max(0, -w) * 0.07;
  }
  if (i.tired > 0.5 && !moving) {
    // hands on knees, catching breath
    const k = (i.tired - 0.5) * 2;
    out[P.chestPitch] += 0.55 * k;
    out[P.shLP] = 0.5 * k; out[P.shRP] = 0.5 * k;
    out[P.elL] = 0.2; out[P.elR] = 0.2;
    out[P.kneeL] += 0.25 * k; out[P.kneeR] += 0.25 * k;
    out[P.hipLP] += 0.2 * k; out[P.hipRP] += 0.2 * k;
    out[P.rootY] -= 0.05 * k;
    out[P.headPitch] = 0.2 * k + 0.05 * Math.sin(i.t * 5);
  }
  if (i.carrying) {
    out[P.shLP] = 0.75; out[P.shRP] = 0.75;
    out[P.shLR] = 0.12; out[P.shRR] = 0.12;
    out[P.elL] = 1.15; out[P.elR] = 1.15;
    out[P.chestPitch] = -0.12 + (moving ? 0.03 * Math.sin(ph * 2) : 0);
    out[P.headPitch] = -0.12;
    out[P.headRoll] = 0.22; // peering round the stack
    out[P.headYaw] = -0.2;
  } else if (i.holdingR) {
    out[P.shRP] = moving ? out[P.shRP] * 0.4 + 0.25 : 0.3;
    out[P.elR] = 0.9;
    out[P.shRR] = 0.1;
  }
  if (i.restrained) {
    out[P.shLP] = -0.5; out[P.shRP] = -0.5;
    out[P.shLR] = -0.12; out[P.shRR] = -0.12;
    out[P.elL] = 0.55; out[P.elR] = 0.55;
    out[P.chestPitch] += 0.08;
    out[P.headPitch] += 0.18;
  }
  if (i.gesture) applyGesture(out, i.gesture, i.gestureT, i.seed);
}

function applyGesture(out: Pose, g: Gesture, t: number, seed: number): void {
  const beat = Math.sin(t * 6 + seed);
  switch (g) {
    case 'talk':
      out[P.shRP] = 0.45 + 0.12 * beat;
      out[P.elR] = 1.25 + 0.2 * Math.sin(t * 4.3);
      out[P.shRR] = 0.15;
      out[P.headPitch] += 0.05 * Math.sin(t * 3.1);
      out[P.headRoll] = 0.06 * Math.sin(t * 2.2);
      out[P.brow] = 0.5 + 0.5 * beat;
      break;
    case 'point':
      out[P.shRP] = 1.45; out[P.elR] = 0.05; out[P.shRR] = 0.05;
      out[P.chestYaw] = 0.15;
      break;
    case 'fold':
      out[P.shLP] = 0.5; out[P.shRP] = 0.55;
      out[P.shLR] = -0.35; out[P.shRR] = -0.35;
      out[P.elL] = 1.7; out[P.elR] = 1.65;
      out[P.chestPitch] -= 0.05;
      out[P.brow] = -1;
      break;
    case 'shrug':
      out[P.shLR] = 0.5; out[P.shRR] = 0.5;
      out[P.elL] = 1.5; out[P.elR] = 1.5;
      out[P.shLP] = 0.2; out[P.shRP] = 0.2;
      out[P.headRoll] = 0.15;
      out[P.brow] = 1;
      break;
    case 'type':
      out[P.shLP] = 0.55; out[P.shRP] = 0.55;
      out[P.elL] = 1.2 + 0.08 * Math.sin(t * 13);
      out[P.elR] = 1.2 + 0.08 * Math.sin(t * 11 + 1);
      out[P.headPitch] = 0.28;
      break;
    case 'tap':
      out[P.shRP] = 0.8; out[P.elR] = 0.9 + 0.15 * Math.sin(t * 9);
      out[P.headPitch] = 0.3;
      break;
    case 'restock':
      out[P.shLP] = 1.5 + 0.2 * Math.sin(t * 2.5);
      out[P.shRP] = 1.2 + 0.3 * Math.sin(t * 2.5 + 1.5);
      out[P.elL] = 0.5; out[P.elR] = 0.7;
      out[P.headPitch] = -0.15;
      break;
    case 'load':
      out[P.shLP] = 1.0; out[P.shRP] = 1.0; out[P.elL] = 0.6; out[P.elR] = 0.6;
      out[P.chestPitch] = 0.3;
      break;
    case 'pickup':
    case 'lace': {
      const k = Math.sin(Math.min(1, t / 0.9) * Math.PI);
      const d = g === 'lace' ? 1 : k;
      out[P.chestPitch] = 0.95 * d;
      out[P.hipLP] = 0.55 * d; out[P.hipRP] = 0.55 * d;
      out[P.kneeL] = 1.1 * d; out[P.kneeR] = 1.1 * d;
      out[P.rootY] = -0.33 * d;
      out[P.shLP] = 0.9 * d; out[P.shRP] = 0.9 * d;
      out[P.elL] = 0.3; out[P.elR] = 0.3 + (g === 'lace' ? 0.15 * Math.sin(t * 9) : 0);
      out[P.headPitch] = 0.3 * d;
      break;
    }
    case 'dust':
      out[P.shLP] = 0.3; out[P.shRP] = 0.3;
      out[P.shLR] = -0.2; out[P.shRR] = -0.2;
      out[P.elL] = 1.3 + 0.35 * Math.sin(t * 12);
      out[P.elR] = 1.3 + 0.35 * Math.sin(t * 12 + 2);
      out[P.headPitch] = 0.35;
      break;
    case 'lookAround':
      out[P.headYaw] = 1.0 * Math.sin(t * 3.2);
      out[P.chestYaw] = 0.25 * Math.sin(t * 3.2);
      out[P.brow] = 1;
      break;
    case 'phone':
      out[P.shRP] = 0.7; out[P.elR] = 1.9; out[P.shRR] = 0.1;
      out[P.headPitch] = 0.32;
      break;
    case 'handsUp':
      out[P.shLP] = 0.6; out[P.shRP] = 0.6;
      out[P.shLR] = 0.7; out[P.shRR] = 0.7;
      out[P.elL] = 1.9; out[P.elR] = 1.9;
      out[P.brow] = 1;
      break;
    case 'reach':
      out[P.shRP] = 1.15; out[P.elR] = 0.35;
      out[P.chestPitch] += 0.08;
      break;
    case 'wave':
      out[P.shRP] = 0.4; out[P.shRR] = 1.3;
      out[P.elR] = 1.5 + 0.4 * Math.sin(t * 9);
      break;
  }
}

export function poseStumble(out: Pose, t: number, phase: number, seed: number): void {
  out.fill(0);
  const sn = Math.sin(phase), cs = Math.cos(phase);
  out[P.chestPitch] = 0.55 + 0.15 * Math.sin(t * 9);
  out[P.rootPitch] = 0.16;
  out[P.hipLP] = 0.75 * sn; out[P.hipRP] = -0.75 * sn;
  out[P.kneeL] = 0.3 + Math.max(0, -cs) * 1.2;
  out[P.kneeR] = 0.3 + Math.max(0, cs) * 1.2;
  out[P.shLP] = 1.0 + 0.9 * Math.sin(t * 13 + seed);
  out[P.shRP] = 0.8 + 0.9 * Math.sin(t * 11 + 2 + seed);
  out[P.shLR] = 0.7; out[P.shRR] = 0.6;
  out[P.elL] = 0.5; out[P.elR] = 0.6;
  out[P.headPitch] = -0.3;
  out[P.rootY] = -0.08;
  out[P.brow] = 1;
}

export function poseDown(out: Pose, t: number, seed: number): void {
  out.fill(0);
  const a = seed % 1;
  out[P.shLP] = 0.4 + a; out[P.shRP] = 1.6 - a;
  out[P.shLR] = 1.0; out[P.shRR] = 0.8;
  out[P.elL] = 0.6; out[P.elR] = 0.9;
  out[P.hipLP] = 0.25 + 0.3 * a; out[P.hipRP] = -0.1;
  out[P.kneeL] = 0.7; out[P.kneeR] = 0.25;
  out[P.hipLR] = 0.2; out[P.hipRR] = 0.25;
  out[P.headYaw] = 0.3 * Math.sin(t * 0.8);
  out[P.brow] = 1;
}

/** k: 0 lying → 1 standing. Passes through a kneel / push-up shape. */
export function poseGetUp(out: Pose, k: number): void {
  out.fill(0);
  const mid = Math.sin(k * Math.PI);
  out[P.chestPitch] = 0.9 * mid;
  out[P.hipLP] = 1.2 * mid; out[P.kneeL] = 1.6 * mid;
  out[P.hipRP] = 0.3 * mid; out[P.kneeR] = 1.3 * mid;
  out[P.rootY] = -0.42 * mid;
  out[P.shLP] = 0.9 * mid; out[P.shRP] = 0.9 * mid;
  out[P.elL] = 0.3; out[P.elR] = 0.3;
  out[P.headPitch] = -0.25 * mid;
}

export function poseSeated(out: Pose, t: number): void {
  out.fill(0);
  out[P.hipLP] = 1.5; out[P.hipRP] = 1.5;
  out[P.kneeL] = 1.5; out[P.kneeR] = 1.5;
  out[P.rootY] = -0.4;
  out[P.shLP] = 0.5; out[P.shRP] = 0.5;
  out[P.elL] = 0.9; out[P.elR] = 0.9;
  out[P.chestPitch] = 0.03 * Math.sin(t * 1.4);
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
