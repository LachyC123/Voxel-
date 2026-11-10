import * as THREE from 'three';
import { G, Physics, RAPIER, groups } from '../physics/physics';
import { EventBus } from '../simulation/events';
import { Character } from '../characters/character';
import { Doors } from './doors';
import { Nav } from './nav';
import { spawnProp } from './props';
import { VoxelBuilder, makeSign } from './voxel';

// The first playable block (M2 slice): police station (reception + locker
// room) with its yard, the corner shop (sales floor + stockroom), Cobb's
// Passage, the service lane, the shop garden, Mill Cut and the green. All
// measurements are metres; +X is east, +Z is south, floors sit at y = F.
export const F = 0.12;
const H = 3.25;

export interface Room {
  id: string;
  name: string;
  x1: number; z1: number; x2: number; z2: number;
  indoor: boolean;
}
export interface Anchor { x: number; z: number; yaw: number }

const C = {
  brick: 0xa5553e, brickStation: 0x94583f, brickYard: 0x8f5a44, stone: 0xd8d0bd, cream: 0xe9dcc0,
  plaster: 0xe9e3d3, plasterBlue: 0xcdd8dd, slate: 0x4a5560, slate2: 0x3f4852,
  pavement: 0xb7b2a8, kerb: 0x8e8a82, asphalt: 0x3d4046, cobble: 0x7c7770, concrete: 0x9a9993,
  grass: 0x6f9a55, hedge: 0x47743f, soil: 0x5b4331, wood: 0x8a6a45, woodDark: 0x5a4027,
  navy: 0x1f3a6b, green: 0x2f5d4a, white: 0xf2f0e8, steel: 0x8a8f96, dark: 0x202227,
};

interface Opening { at: number; w: number; kind: 'door' | 'window' | 'gap'; bottom?: number; top?: number }
interface WallStyle { color: number; thick?: number; brick?: boolean; inner?: number; innerSide?: 1 | -1; frame?: number }

export class Van {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  x: number;
  readonly z = 4.2;
  targetX: number;
  speed = 0;
  readonly bayX = 21.4;
  readonly startX = 3.0;

  constructor(private phys: Physics, scene: THREE.Object3D) {
    this.x = this.startX;
    this.targetX = this.x;
    const b = new VoxelBuilder();
    // forward is +X
    b.box(-0.5, 1.25, 0, 3.6, 1.9, 2.0, 0xf1f1ec); // cargo box
    b.box(1.85, 0.95, 0, 1.1, 1.3, 2.0, 0xf1f1ec); // cab
    b.box(1.95, 1.72, 0, 0.9, 0.3, 1.9, 0xe2e2dc);
    b.box(2.38, 1.3, 0, 0.06, 0.5, 1.7, 0x6f8fa3); // windscreen
    b.box(1.9, 1.3, 1.005, 0.7, 0.45, 0.01, 0x6f8fa3);
    b.box(1.9, 1.3, -1.005, 0.7, 0.45, 0.01, 0x6f8fa3);
    b.box(-0.5, 1.3, 1.005, 3.4, 0.36, 0.012, 0x2a7a6e); // livery stripe
    b.box(-0.5, 1.3, -1.005, 3.4, 0.36, 0.012, 0x2a7a6e);
    b.box(-2.305, 1.2, 0.5, 0.012, 1.7, 0.95, 0xe2e2dc); // rear doors
    b.box(-2.305, 1.2, -0.5, 0.012, 1.7, 0.95, 0xe2e2dc);
    b.box(-2.31, 1.2, 0, 0.014, 1.7, 0.04, 0x8a8f96);
    b.box(0, 0.36, 0, 4.9, 0.2, 2.0, 0x2b2d33); // chassis
    b.box(2.42, 0.55, 0.7, 0.04, 0.16, 0.3, 0xffe9a3);
    b.box(2.42, 0.55, -0.7, 0.04, 0.16, 0.3, 0xffe9a3);
    b.box(-2.31, 0.6, 0.8, 0.02, 0.2, 0.2, 0xb0302a);
    b.box(-2.31, 0.6, -0.8, 0.02, 0.2, 0.2, 0xb0302a);
    b.box(2.44, 0.42, 0, 0.03, 0.12, 0.5, 0xf1d24a); // plate
    for (const wx of [1.6, -1.5]) for (const wz of [0.95, -0.95]) {
      b.box(wx, 0.33, wz, 0.66, 0.66, 0.24, 0x16171a);
      b.box(wx, 0.33, wz + Math.sign(wz) * 0.125, 0.3, 0.3, 0.01, 0x8a8f96);
    }
    this.group.add(b.mesh());
    const sign = makeSign('GD COURIERS', 2.2, 0.3, '#2a7a6e', '#f4f4f0', 'bold 40px Arial, sans-serif');
    sign.position.set(-0.6, 1.3, -1.014);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    const sign2 = sign.clone();
    sign2.position.z = 1.014;
    sign2.rotation.y = 0;
    this.group.add(sign2);
    scene.add(this.group);
    this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, 1.15, this.z));
    const col = phys.world.createCollider(RAPIER.ColliderDesc.cuboid(2.42, 1.1, 1.02).setCollisionGroups(groups(G.VEHICLE, 0xffff)), this.body);
    phys.owners.set(col.handle, { kind: 'vehicle', id: 'van_glen' });
    this.group.position.set(this.x, 0, this.z);
  }

  get atBay(): boolean {
    return Math.abs(this.x - this.bayX) < 0.05;
  }
  get moving(): boolean {
    return Math.abs(this.targetX - this.x) > 0.02;
  }
  rearSpot(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.x - 3.25, 0, this.z - 0.2);
  }
  cabSpot(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.x + 1.5, F, 2.45);
  }

  step(dt: number, chars: Iterable<Character>): void {
    const d = this.targetX - this.x;
    if (Math.abs(d) < 0.02) {
      this.speed = 0;
      return;
    }
    // never drive into a person: wait if anyone is in the lane ahead
    let blocked = false;
    for (const c of chars) {
      if (c.hidden) continue;
      const ahead = (c.pos.x - this.x) * Math.sign(d);
      if (ahead > 0 && ahead < 5.2 && Math.abs(c.pos.z - this.z) < 1.6) blocked = true;
    }
    const want = blocked ? 0 : Math.min(3.4, Math.abs(d) * 1.2 + 0.3);
    this.speed += THREE.MathUtils.clamp(want - this.speed, -6 * dt, 1.6 * dt);
    this.x += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
    this.body.setNextKinematicTranslation({ x: this.x, y: 1.15, z: this.z });
    this.group.position.x = this.x;
  }
}

export class Town {
  readonly group = new THREE.Group();
  readonly rooms: Room[] = [];
  readonly anchors: Record<string, Anchor> = {};
  readonly nav = new Nav();
  readonly doors: Doors;
  readonly van: Van;
  readonly mapRects: { x1: number; z1: number; x2: number; z2: number; color: string; label?: string }[] = [];
  readonly lights: THREE.PointLight[] = [];

  constructor(private phys: Physics, scene: THREE.Scene, events: EventBus) {
    scene.add(this.group);
    this.doors = new Doors(phys, this.group, events);
    this.build();
    this.van = new Van(phys, this.group);
    this.buildNav();
  }

  roomAt(x: number, z: number): Room {
    for (const r of this.rooms) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
    return OUTSIDE;
  }

  /** Coarse sound transmission between two points (docs/plan/04 Perception). */
  hearingFactor(ax: number, az: number, bx: number, bz: number): number {
    const ra = this.roomAt(ax, az), rb = this.roomAt(bx, bz);
    if (ra === rb) return 1;
    if (!ra.indoor && !rb.indoor) return 0.85;
    const from = new THREE.Vector3(ax, 1.4, az), to = new THREE.Vector3(bx, 1.4, bz);
    // an open doorway in the straight line carries sound; walls and shut doors muffle it
    return this.phys.los(from, to) ? 0.75 : 0.3;
  }

  private build(): void {
    const phys = this.phys;
    const ground = new VoxelBuilder();
    const ext = new VoxelBuilder();
    const int = new VoxelBuilder();
    const glass = new VoxelBuilder();

    const solid = (b: VoxelBuilder, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, jitter = 0): void => {
      b.span(x1, y1, z1, x2, y2, z2, color, jitter);
      phys.addStaticBox((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, Math.abs(z2 - z1) / 2);
    };

    const wall = (axis: 'x' | 'z', fixed: number, a1: number, a2: number, h: number, st: WallStyle, openings: Opening[] = [], y0 = F): void => {
      const thick = st.thick ?? 0.25;
      const b = st.brick === false ? int : ext;
      const piece = (s: number, e: number, yb: number, yt: number): void => {
        if (e - s < 0.01 || yt - yb < 0.01) return;
        // collider
        if (axis === 'x') phys.addStaticBox((s + e) / 2, (yb + yt) / 2, fixed, (e - s) / 2, (yt - yb) / 2, thick / 2);
        else phys.addStaticBox(fixed, (yb + yt) / 2, (s + e) / 2, thick / 2, (yt - yb) / 2, (e - s) / 2);
        const put = (bb: VoxelBuilder, u1: number, u2: number, v1: number, v2: number, off: number, t: number, color: number, jit: number): void => {
          if (axis === 'x') bb.span(u1, v1, fixed + off - t / 2, u2, v2, fixed + off + t / 2, color, jit);
          else bb.span(fixed + off - t / 2, v1, u1, fixed + off + t / 2, v2, u2, color, jit);
        };
        if (st.brick === false) {
          put(int, s, e, yb, yt, 0, thick, st.color, 0);
          if (yb <= y0 + 0.01) {
            put(int, s, e, yb, yb + 0.12, 0, thick + 0.03, 0xf4f1e8, 0);
          }
          return;
        }
        const hasInner = st.inner !== undefined;
        const to = hasInner ? thick / 2 : thick;
        const off = hasInner ? -(st.innerSide ?? 1) * (thick / 4) : 0;
        const BL = 0.75, BH = 0.25;
        for (let y = yb; y < yt - 0.001; y += BH) {
          const row = Math.round(y / BH);
          const shift = (row % 2) * (BL / 2);
          let u = Math.floor((s - shift) / BL) * BL + shift;
          for (; u < e - 0.001; u += BL) {
            const u1 = Math.max(s, u), u2 = Math.min(e, u + BL);
            if (u2 - u1 < 0.02) continue;
            put(b, u1, u2, y, Math.min(yt, y + BH), off, to, st.color, 0.13);
          }
        }
        if (hasInner) {
          put(int, s, e, yb, yt, (st.innerSide ?? 1) * (thick / 4), thick / 2, st.inner!, 0);
          if (yb <= y0 + 0.01) put(int, s, e, yb, yb + 0.12, (st.innerSide ?? 1) * (thick / 4 + 0.015), thick / 2, 0xf4f1e8, 0);
        }
      };
      const sorted = [...openings].sort((p, q) => p.at - q.at);
      let cur = a1;
      const top = y0 + h;
      for (const o of sorted) {
        const s = o.at - o.w / 2, e = o.at + o.w / 2;
        piece(cur, s, y0, top);
        if (o.kind !== 'gap') {
          const ob = y0 + (o.bottom ?? (o.kind === 'door' ? 0 : 0.95));
          const ot = y0 + (o.top ?? (o.kind === 'door' ? 2.25 : 2.15));
          piece(s, e, ot, top);
          if (o.kind === 'window') piece(s, e, y0, ob);
          const fc = st.frame ?? C.white;
          const fr = (u1: number, u2: number, v1: number, v2: number, t = thick + 0.06): void => {
            if (axis === 'x') ext.span(u1, v1, fixed - t / 2, u2, v2, fixed + t / 2, fc);
            else ext.span(fixed - t / 2, v1, u1, fixed + t / 2, v2, u2, fc);
          };
          fr(s - 0.06, s + 0.03, ob, ot + 0.08);
          fr(e - 0.03, e + 0.06, ob, ot + 0.08);
          fr(s - 0.06, e + 0.06, ot, ot + 0.1);
          if (o.kind === 'window') {
            fr(s - 0.1, e + 0.1, ob - 0.07, ob, thick + 0.16);
            const mull = Math.max(1, Math.round(o.w / 1.3));
            for (let k = 1; k < mull; k++) fr(s + (o.w * k) / mull - 0.025, s + (o.w * k) / mull + 0.025, ob, ot, 0.08);
            if (axis === 'x') {
              glass.span(s, ob, fixed - 0.02, e, ot, fixed + 0.02, 0xa9cfe0);
              phys.addStaticBox(o.at, (ob + ot) / 2, fixed, o.w / 2, (ot - ob) / 2, 0.04, { group: G.GLASS });
            } else {
              glass.span(fixed - 0.02, ob, s, fixed + 0.02, ot, e, 0xa9cfe0);
              phys.addStaticBox(fixed, (ob + ot) / 2, o.at, 0.04, (ot - ob) / 2, o.w / 2, { group: G.GLASS });
            }
          }
        }
        cur = e;
      }
      piece(cur, a2, y0, top);
    };

    const tiles = (x1: number, z1: number, x2: number, z2: number, size: number, c1: number, c2: number | null, jitter: number): void => {
      for (let x = x1, i = 0; x < x2 - 0.001; x += size, i++) {
        for (let z = z1, j = 0; z < z2 - 0.001; z += size, j++) {
          const col = c2 !== null && (i + j) % 2 ? c2 : c1;
          ground.span(x + 0.012, F - 0.02, z + 0.012, Math.min(x2, x + size) - 0.012, F, Math.min(z2, z + size) - 0.012, col, jitter);
        }
      }
    };

    const roof = (x1: number, z1: number, x2: number, z2: number, color: number, ceilColor: number): void => {
      // ceiling slab (blocks the camera) and stepped slate roof
      phys.addStaticBox((x1 + x2) / 2, F + H + 0.12, (z1 + z2) / 2, (x2 - x1) / 2, 0.12, (z2 - z1) / 2);
      int.span(x1 + 0.1, F + H, z1 + 0.1, x2 - 0.1, F + H + 0.05, z2 - 0.1, ceilColor);
      ext.span(x1 - 0.25, F + H + 0.05, z1 - 0.25, x2 + 0.25, F + H + 0.3, z2 + 0.25, C.stone);
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const inset = 0.15 + k * ((z2 - z1) / 2 / (steps + 0.4));
        ext.span(x1 - 0.1, F + H + 0.3 + k * 0.42, z1 + inset, x2 + 0.1, F + H + 0.3 + (k + 1) * 0.42, z2 - inset, k % 2 ? color : shadeC(color, 0.92), 0.05);
      }
    };

    // ------------------------------------------------------------ ground
    phys.addStaticBox(-6, -1, -5, 70, 1, 70); // road level, y = 0
    phys.addStaticBox(-6, F / 2, -18.5, 70, F / 2, 21.5); // everything north of the kerb
    phys.addStaticBox(-6, F / 2, 11.75, 70, F / 2, 1.75); // south pavement
    ground.span(-60, -0.4, -45, 50, F - 0.02, 3, 0x8d8a82); // base slab north
    ground.span(-60, -0.4, 3, 50, 0, 10, C.asphalt, 0);
    ground.span(-60, -0.4, 10, 50, F - 0.02, 13.5, 0x8d8a82);
    for (let x = -44; x < 30; x += 3) ground.span(x, 0, 6.42, x + 1.5, 0.012, 6.58, 0xe6e2d6);
    ground.span(-44, 0, 3.22, 17.5, 0.012, 3.3, 0xe0b23a); // double yellows
    ground.span(-44, 0, 3.42, 17.5, 0.012, 3.5, 0xe0b23a);
    ground.span(25.5, 0, 3.22, 30, 0.012, 3.3, 0xe0b23a);
    for (let x = 18; x < 25; x += 0.9) ground.span(x, 0, 5.4, x + 0.5, 0.012, 5.5, 0xe6e2d6); // loading bay
    ground.span(18, 0, 3.1, 18.1, 0.012, 5.5, 0xe6e2d6);
    ground.span(24.9, 0, 3.1, 25, 0.012, 5.5, 0xe6e2d6);
    tiles(-46, -2, 34, 3, 1.25, C.pavement, null, 0.07);
    tiles(-46, 10, 34, 13.5, 1.25, C.pavement, null, 0.07);
    ground.span(-46, 0, 2.9, 34, F + 0.005, 3.06, C.kerb, 0.05);
    ground.span(-46, 0, 9.94, 34, F + 0.005, 10.1, C.kerb, 0.05);
    this.mapRects.push({ x1: -44, z1: 3, x2: 30, z2: 10, color: '#4b4f57' });

    // canal and far bank (outside the playable boundary)
    ground.span(-60, -0.5, 13.5, 50, -0.45, 26, 0x3f6f7f);
    ground.span(-60, -0.4, 13.5, 50, F, 13.9, 0x7f7a72);
    ground.span(-60, -0.4, 26, 50, 0.3, 46, C.grass, 0.06);
    for (let x = -52; x < 46; x += 7.5) tree(ext, x + (x % 2), 0.3, 30 + ((x * 7) % 9), 1.3);
    for (let x = -44; x < 30; x += 2) {
      ext.box(x, F + 0.55, 13.6, 0.08, 1.1, 0.08, C.dark);
    }
    ext.span(-44, F + 1.02, 13.56, 30, F + 1.1, 13.64, C.dark);
    ext.span(-44, F + 0.5, 13.57, 30, F + 0.56, 13.63, C.dark);
    phys.addStaticBox(-7, F + 0.7, 13.6, 37.5, 0.9, 0.08);
    this.mapRects.push({ x1: -44, z1: 13.6, x2: 30, z2: 18, color: '#3f6f7f' });

    // ------------------------------------------------------------ station
    const stn: WallStyle = { color: C.brickStation, inner: C.plasterBlue, innerSide: 1 };
    const stnN: WallStyle = { ...stn, innerSide: -1 };
    wall('x', -2.125, -22, -8, H, { ...stn, innerSide: -1 }, [
      { at: -17, w: 1.3, kind: 'door' },
      { at: -20, w: 1.6, kind: 'window' },
      { at: -14.6, w: 1.5, kind: 'window' },
      { at: -10.5, w: 1.6, kind: 'window', bottom: 1.3 },
    ]);
    wall('x', -12.875, -22, -8, H, { ...stnN, innerSide: 1 }, [{ at: -18, w: 1.4, kind: 'window', bottom: 1.4 }]);
    wall('z', -21.875, -12.75, -2.25, H, { ...stn, innerSide: 1 }, [{ at: -5, w: 1.2, kind: 'door' }]);
    wall('z', -8.125, -12.75, -2.25, H, { ...stn, innerSide: -1 }, [{ at: -9.5, w: 1.2, kind: 'window', bottom: 1.5 }]);
    wall('z', -13, -12.75, -2.25, H, { color: C.plasterBlue, brick: false, thick: 0.18 }, [{ at: -8, w: 1.2, kind: 'door' }]);
    roof(-22, -13, -8, -2, C.slate, 0xf1eee6);
    tiles(-21.75, -12.75, -13.1, -2.25, 1.0, 0x8a94a1, 0x7b8693, 0.03);
    tiles(-12.9, -12.75, -8.25, -2.25, 1.0, 0x566b63, 0x4f635b, 0.03);
    ext.span(-22.1, F, -2.2, -17.72, F + 0.5, -1.95, C.stone, 0.03); // stone plinth
    ext.span(-16.28, F, -2.2, -7.9, F + 0.5, -1.95, C.stone, 0.03);
    ext.span(-22.3, F + H - 0.1, -2.3, -7.7, F + H + 0.05, -1.9, C.stone);
    // entrance: steps-free porch, blue lamp, clock (landmark)
    ext.span(-18.1, F + 2.35, -2.05, -15.9, F + 2.55, -1.5, C.stone);
    ext.box(-18.0, F + 1.2, -1.6, 0.16, 2.4, 0.16, C.stone);
    ext.box(-16.0, F + 1.2, -1.6, 0.16, 2.4, 0.16, C.stone);
    ext.box(-15.4, F + 2.3, -1.85, 0.3, 0.42, 0.3, 0x2a5fd0);
    ext.box(-15.4, F + 2.56, -1.85, 0.36, 0.08, 0.36, C.dark);
    ext.box(-15.4, F + 2.05, -1.85, 0.08, 0.1, 0.3, C.dark);
    ext.box(-15, F + H + 1.1, -1.9, 1.5, 1.5, 0.3, C.stone);
    ext.box(-15, F + H + 1.1, -1.74, 1.2, 1.2, 0.04, 0xf4f1e8);
    ext.box(-15, F + H + 1.32, -1.71, 0.06, 0.5, 0.02, C.dark);
    ext.box(-14.84, F + H + 1.1, -1.71, 0.36, 0.06, 0.02, C.dark);
    addSign(this.group, 'BOROUGH POLICE', 3.4, 0.5, -19.6, F + 2.75, -1.98, 0, '#16284a', '#f1eee6');
    this.doors.add('station_front', 'Station front door', -17.65, -2.125, F, 1.3, 0, C.navy, { glass: true });
    this.doors.add('station_inner', 'Locker room door', -13, -7.4, F, 1.2, Math.PI / 2, 0x6a7f8e, { open: -1.6 });
    this.doors.add('station_yard', 'Yard door', -21.875, -4.4, F, 1.2, Math.PI / 2, C.navy);
    // reception
    solid(int, -19.5, F, -9.2, -15.5, F + 1.05, -8.5, 0x5a4027);
    int.span(-19.6, F + 1.05, -9.3, -15.4, F + 1.1, -8.4, 0x7a5a37);
    int.box(-18.2, F + 1.24, -8.9, 0.5, 0.3, 0.06, C.dark); // monitor
    int.box(-18.2, F + 1.12, -8.9, 0.1, 0.06, 0.1, C.dark);
    int.box(-16.4, F + 1.14, -8.8, 0.4, 0.05, 0.3, 0xf4f1e8); // paperwork
    int.box(-17.1, F + 1.17, -8.75, 0.1, 0.12, 0.1, 0xb0302a); // mug
    solid(int, -21.6, F, -12.6, -18.9, F + 1.4, -12.1, 0x6b7078); // filing cabinets
    for (let x = -21.4; x < -19; x += 0.67) int.box(x + 0.3, F + 1.0, -12.08, 0.5, 0.04, 0.02, C.steel);
    for (let x = -21.4; x < -19; x += 0.67) int.box(x + 0.3, F + 0.5, -12.08, 0.5, 0.04, 0.02, C.steel);
    int.span(-16.6, F + 1.3, -2.33, -15.0, F + 2.3, -2.28, 0x9a7a4a); // noticeboard
    int.box(-16.2, F + 1.9, -2.36, 0.3, 0.4, 0.01, 0xf4f1e8);
    int.box(-15.6, F + 1.75, -2.36, 0.4, 0.3, 0.01, 0xf1d24a);
    int.box(-15.5, F + 2.1, -2.36, 0.25, 0.18, 0.01, 0xd95c8a);
    int.span(-17.6, F, -3.2, -16.4, F + 0.02, -2.4, 0x3a3f4a); // doormat
    spawnProp(phys, this.group, 'chair_rec1', 'chair', -21.2, F, -7.3, Math.PI / 2);
    spawnProp(phys, this.group, 'chair_rec2', 'chair', -21.2, F, -8.1, Math.PI / 2);
    spawnProp(phys, this.group, 'chair_rec3', 'chair', -21.2, F, -8.9, Math.PI / 2);
    spawnProp(phys, this.group, 'plant_rec', 'plant', -13.7, F, -2.9);
    // locker room
    for (let z = -12.4, i = 0; z < -4.2; z += 0.62, i++) {
      const mine = i === 10;
      int.span(-8.82, F, z, -8.27, F + 1.95, z + 0.58, mine ? 0x2a4f8f : i % 2 ? 0x5b6f7f : 0x66798a);
      int.box(-8.84, F + 1.5, z + 0.29, 0.02, 0.2, 0.36, 0x3a4854);
      int.box(-8.84, F + 1.0, z + 0.48, 0.03, 0.1, 0.04, C.steel);
      if (mine) int.box(-8.84, F + 1.72, z + 0.29, 0.02, 0.07, 0.3, 0xf4f1e8);
    }
    phys.addStaticBox(-8.55, F + 1, -8.3, 0.28, 1, 4.15);
    solid(int, -11.3, F + 0.4, -11.6, -10.7, F + 0.48, -8.9, C.wood);
    int.box(-11, F + 0.2, -11.3, 0.5, 0.4, 0.08, C.steel);
    int.box(-11, F + 0.2, -9.2, 0.5, 0.4, 0.08, C.steel);
    int.span(-12.88, F + 1.0, -5.2, -12.84, F + 2.0, -4.0, 0xbfd6e0); // mirror
    int.span(-12.9, F + 1.5, -11.8, -12.6, F + 1.55, -10.2, C.wood); // kit shelf
    int.box(-12.72, F + 1.66, -11.4, 0.2, 0.2, 0.2, 0x16284a);
    int.box(-12.72, F + 1.62, -10.8, 0.22, 0.12, 0.3, 0xd8e12a);
    int.box(-12.75, F + 0.2, -11, 0.3, 0.4, 0.9, 0x3a3f4a); // boot rack
    this.addLight(-17.5, F + 2.85, -7, 0xfff1d6, 28);
    this.addLight(-10.6, F + 2.85, -8, 0xeaf2ff, 20);
    this.rooms.push({ id: 'station_reception', name: 'Station reception', x1: -22, z1: -13, x2: -13, z2: -2, indoor: true });
    this.rooms.push({ id: 'station_locker', name: 'Locker room', x1: -13, z1: -13, x2: -8, z2: -2, indoor: true });
    this.mapRects.push({ x1: -22, z1: -13, x2: -8, z2: -2, color: '#2c4470', label: 'Station' });

    // ------------------------------------------------------------ station yard
    const yw: WallStyle = { color: C.brickYard };
    wall('z', -35.875, -13, -2, 2.25, yw);
    wall('x', -12.875, -36, -22, 2.25, yw);
    wall('x', -2.125, -36, -22, 2.25, yw, [{ at: -29, w: 3.2, kind: 'gap' }]);
    for (const x of [-30.75, -27.25]) ext.box(x, F + 1.25, -2.125, 0.4, 2.5, 0.4, C.stone);
    tiles(-35.75, -12.75, -22, -2.25, 2.0, C.concrete, null, 0.05);
    ground.span(-27.6, F, -12.4, -27.5, F + 0.006, -7.6, 0xe6e2d6);
    ground.span(-24.0, F, -12.4, -23.9, F + 0.006, -7.6, 0xe6e2d6);
    // steps and loading platform
    solid(ext, -35.75, F, -12.75, -32, F + 0.75, -10.2, 0x8f8d86, 0.04);
    solid(ext, -32, F, -12.75, -31.6, F + 0.5, -10.2, 0x9a9892, 0.04);
    solid(ext, -31.6, F, -12.75, -31.2, F + 0.25, -10.2, 0xa3a19b, 0.04);
    ext.box(-33.9, F + 1.25, -10.25, 3.7, 0.06, 0.06, 0xd9b23a); // handrail
    ext.box(-35.6, F + 1.0, -10.25, 0.06, 0.5, 0.06, 0xd9b23a);
    ext.box(-32.1, F + 1.0, -10.25, 0.06, 0.5, 0.06, 0xd9b23a);
    // store and bike shed forming a narrow passage (1.25 m)
    solid(ext, -34.5, F, -8.2, -31.5, F + 2.3, -6.2, 0x41607a, 0.03);
    ext.span(-34.6, F + 2.3, -8.3, -31.4, F + 2.4, -6.1, 0x34495c);
    ext.box(-33, F + 1.1, -6.18, 1.0, 2.0, 0.03, 0x34495c);
    solid(ext, -34.5, F, -4.95, -31.5, F + 2.1, -3.2, 0x6b7a5a, 0.03);
    ext.span(-34.6, F + 2.1, -5.05, -31.4, F + 2.2, -3.1, 0x55634a);
    addSign(this.group, 'EVIDENCE STORE', 1.6, 0.26, -33, F + 2.05, -6.16, 0, '#f1eee6', '#16284a', 'bold 34px Arial, sans-serif');
    // parked patrol car (set dressing until vehicle training, M4)
    patrolCar(ext, -25.7, F, -10);
    phys.addStaticBox(-25.7, F + 0.7, -10, 0.95, 0.7, 2.15);
    spawnProp(phys, this.group, 'yard_chair', 'chair', -28.3, F, -7.4, 0.4);
    spawnProp(phys, this.group, 'yard_bin', 'bin', -26.5, F, -6.2);
    spawnProp(phys, this.group, 'yard_cone1', 'cone', -29.4, F, -9.9);
    spawnProp(phys, this.group, 'yard_cone2', 'cone', -28.0, F, -3.6);
    spawnProp(phys, this.group, 'yard_cone3', 'cone', -24.2, F, -5.6);
    spawnProp(phys, this.group, 'yard_crate', 'crate', -33.5, F + 0.75, -11.4, 0.2, 1);
    this.rooms.push({ id: 'station_yard', name: 'Station yard', x1: -36, z1: -13, x2: -22, z2: -2, indoor: false });
    this.mapRects.push({ x1: -36, z1: -13, x2: -22, z2: -2, color: '#6d6c68', label: 'Yard' });

    // ------------------------------------------------------------ corner shop
    const shp: WallStyle = { color: C.brick, inner: C.plaster, innerSide: 1 };
    wall('x', -2.125, -4, 10, H, { color: C.cream, inner: C.plaster, innerSide: -1, frame: C.green }, [
      { at: 0, w: 1.4, kind: 'door', top: 2.3 },
      { at: 4.7, w: 5.0, kind: 'window', bottom: 0.6, top: 2.4 },
      { at: -2.5, w: 1.4, kind: 'window', bottom: 0.6, top: 2.4 },
    ]);
    wall('x', -12.875, -4, 10, H, { ...shp, innerSide: 1 }, [{ at: -1, w: 1.2, kind: 'door' }]);
    wall('z', -3.875, -12.75, -2.25, H, { ...shp, innerSide: 1 });
    wall('z', 9.875, -12.75, -2.25, H, { ...shp, innerSide: -1 }, [{ at: -11.3, w: 1.0, kind: 'window', bottom: 1.6, top: 2.3 }]);
    wall('x', -9.5, -3.75, 9.75, H, { color: C.plaster, brick: false, thick: 0.18 }, [{ at: 7, w: 1.2, kind: 'door' }]);
    roof(-4, -13, 10, -2, C.slate2, 0xf4f1e8);
    tiles(-3.75, -9.4, 9.75, -2.25, 0.75, 0xd7d0bb, 0xa9b8a6, 0.02);
    tiles(-3.75, -12.75, 9.75, -9.6, 1.5, 0x8f8b84, null, 0.05);
    // shop front: fascia, awning, stall riser, propped-open door
    ext.span(-4.1, F + 2.6, -2.2, 10.1, F + 3.25, -1.92, C.green);
    addSign(this.group, "MARA'S CORNER STORE", 6.4, 0.5, 3, F + 2.93, -1.9, 0, '#2f5d4a', '#f1e6c8');
    for (let x = -3.9, i = 0; x < 9.9; x += 0.5, i++) ext.span(x, F + 2.42, -1.95, x + 0.5, F + 2.52, -0.9, i % 2 ? 0xf1e6c8 : 0x9c3b34);
    for (let x = -3.9, i = 0; x < 9.9; x += 0.5, i++) ext.span(x, F + 2.3, -0.95, x + 0.5, F + 2.44, -0.87, i % 2 ? 0xf1e6c8 : 0x9c3b34);
    ext.span(1.9, F, -2.3, 7.5, F + 0.6, -1.95, C.green);
    ext.span(-3.4, F, -2.3, -1.6, F + 0.6, -1.95, C.green);
    this.doors.add('shop_front', 'Shop door', -0.7, -2.125, F, 1.4, 0, C.green, { open: -1.72, glass: true });
    this.doors.add('shop_stock', 'Stockroom door', 7.6, -9.5, F, 1.2, Math.PI, 0xb9a887, { open: -1.72 });
    this.doors.add('shop_rear', 'Shop rear door', -1.6, -12.875, F, 1.2, 0, 0x5a4027);
    // fruit and veg stand outside (static, part of the frontage)
    solid(ext, 2.2, F, -1.9, 4.6, F + 0.7, -1.2, C.wood, 0.05);
    for (let i = 0; i < 4; i++) ext.box(2.5 + i * 0.6, F + 0.8, -1.55, 0.5, 0.2, 0.55, [0xd9462f, 0xe8a42a, 0x5a9a3f, 0xc9d24a][i], 0.1);
    // counter, till and card reader
    solid(int, 7.0, F, -6.6, 7.7, F + 1.0, -3.4, 0x6a4a2a);
    int.span(6.94, F + 1.0, -6.66, 7.76, F + 1.05, -3.34, 0xd7c7a0);
    int.box(7.38, F + 1.22, -5.2, 0.42, 0.34, 0.4, 0x2b2d33); // till
    int.box(7.3, F + 1.42, -5.2, 0.3, 0.1, 0.36, 0x3a3f4a);
    int.box(7.5, F + 1.5, -5.2, 0.04, 0.24, 0.3, 0x7fd0c0);
    int.box(7.2, F + 1.1, -4.05, 0.12, 0.1, 0.18, 0x1c1e24); // card reader
    int.box(7.2, F + 1.16, -4.05, 0.09, 0.02, 0.1, 0x7fd0c0);
    int.box(7.35, F + 1.12, -6.2, 0.3, 0.14, 0.3, 0xd95c8a); // sweets jar
    int.box(7.35, F + 1.12, -5.8, 0.26, 0.12, 0.2, 0xf1d24a);
    shelf(int, phys, 9.3, -7.0, 9.75, -3.0, 2.2, 'z', 11);
    // gondolas, wall shelving
    shelf(int, phys, 0.85, -7.7, 1.55, -4.7, 1.5, 'z', 3);
    shelf(int, phys, 3.85, -7.7, 4.55, -4.7, 1.5, 'z', 7);
    shelf(int, phys, -3.75, -8.8, -3.3, -3.4, 2.1, 'z', 5);
    shelf(int, phys, -3.0, -9.38, 5.6, -8.95, 2.1, 'x', 9);
    solid(int, 2.6, F, -2.72, 4.5, F + 1.3, -2.42, 0x4a5560); // magazine rack
    for (let i = 0; i < 6; i++) int.box(2.85 + i * 0.28, F + 0.95, -2.74, 0.22, 0.3, 0.02, [0xd9462f, 0x2f7fd9, 0xf1d24a, 0x3aa35a, 0xd95c8a, 0xf4f1e8][i]);
    for (let i = 0; i < 6; i++) int.box(2.85 + i * 0.28, F + 0.5, -2.74, 0.22, 0.3, 0.02, [0x2f7fd9, 0xf4f1e8, 0xd9462f, 0xe8a42a, 0x3aa35a, 0x7a4fb0][i]);
    solid(int, 0.9, F, -2.8, 1.5, F + 0.6, -2.4, 0xb0302a); // baskets
    int.box(1.2, F + 0.66, -2.6, 0.5, 0.04, 0.34, 0x8a8f96);
    // crisps display by the door: loose boxes that can be knocked over
    let n = 0;
    for (let lvl = 0; lvl < 2; lvl++) for (const dx of [0, 0.4]) {
      spawnProp(phys, this.group, `crisps_${n}`, 'crisps', -1.9 + dx, F + lvl * 0.29, -3.1, 0, n);
      n++;
    }
    // stockroom
    shelf(int, phys, 9.2, -12.6, 9.75, -10.0, 2.2, 'z', 2, true);
    shelf(int, phys, -3.75, -12.6, -3.2, -10.2, 2.2, 'z', 4, true);
    solid(int, 7.8, F, -12.75, 9.1, F + 0.78, -12.15, C.woodDark); // office nook desk
    int.box(8.1, F + 0.85, -12.4, 0.1, 0.12, 0.1, 0xf4f1e8); // Mara's mug
    int.box(8.6, F + 0.8, -12.45, 0.4, 0.03, 0.3, 0xf4f1e8);
    int.box(8.95, F + 0.9, -12.5, 0.2, 0.22, 0.2, 0x3a3f4a); // cash box
    int.box(8.4, F + 1.7, -12.84, 0.6, 0.45, 0.02, 0xf1d24a); // calendar
    solid(int, 0.8, F, -12.7, 2.6, F + 0.9, -12.0, 0xb98b56, 0.07);
    int.box(1.3, F + 1.1, -12.35, 0.7, 0.4, 0.6, 0xb98b56, 0.07);
    this.addLight(1, F + 2.85, -5.4, 0xfff4dc, 30);
    this.addLight(6.6, F + 2.85, -6.2, 0xfff4dc, 26);
    this.addLight(3, F + 2.7, -11.3, 0xffd9a0, 5);
    this.rooms.push({ id: 'shop_sales', name: 'Corner shop', x1: -4, z1: -9.5, x2: 10, z2: -2, indoor: true });
    this.rooms.push({ id: 'shop_stock', name: 'Shop stockroom', x1: -4, z1: -13, x2: 10, z2: -9.5, indoor: true });
    this.mapRects.push({ x1: -4, z1: -13, x2: 10, z2: -2, color: '#6f5a43', label: 'Shop' });

    // ------------------------------------------------------------ passages, lane
    tiles(-7.9, -17, -4.1, -2, 0.75, C.cobble, 0x86817a, 0.08); // Cobb's Passage
    tiles(-4.1, -17, 13, -13, 0.75, C.cobble, 0x86817a, 0.08); // service lane
    tiles(10.1, -27.4, 13, -17, 0.75, 0x9a8f7c, null, 0.09); // towpath link
    tiles(10.1, -13, 13, -2, 0.75, C.cobble, 0x86817a, 0.08); // Mill Cut
    const lw: WallStyle = { color: C.brickYard };
    wall('z', -8.125, -17, -13, 2.6, lw);
    wall('x', -17.125, -8, -4, 2.6, lw);
    addSign(this.group, "COBB'S PASSAGE", 1.5, 0.24, -7.98, F + 2.4, -2.6, Math.PI / 2, '#f4f1e8', '#202227', 'bold 30px Arial, sans-serif');
    addSign(this.group, 'MILL CUT', 1.1, 0.24, 10.02, F + 2.4, -2.6, Math.PI / 2, '#f4f1e8', '#202227', 'bold 30px Arial, sans-serif');
    spawnProp(phys, this.group, 'cp_wheelie1', 'wheelie', -6.85, F, -5.2, 0.1, 0);
    spawnProp(phys, this.group, 'cp_wheelie2', 'wheelie', -5.15, F, -9.2, -0.15, 1);
    spawnProp(phys, this.group, 'cp_crate1', 'crate', -7.4, F, -11.2, 0.3, 0);
    spawnProp(phys, this.group, 'cp_crate2', 'crate', -7.4, F + 0.36, -11.2, 0.1, 2);
    spawnProp(phys, this.group, 'cp_cone', 'cone', -4.7, F, -3.4);
    spawnProp(phys, this.group, 'ln_binbag1', 'binbag', 1.4, F, -13.5);
    spawnProp(phys, this.group, 'ln_binbag2', 'binbag', 1.95, F, -13.45);
    spawnProp(phys, this.group, 'ln_wheelie', 'wheelie', 8.2, F, -13.6, 0, 2);
    spawnProp(phys, this.group, 'ln_crate', 'crate', 5.6, F, -16.4, 0.5, 1);
    spawnProp(phys, this.group, 'mc_bin', 'bin', 12.4, F, -6.5);
    this.rooms.push({ id: 'cobbs_passage', name: "Cobb's Passage", x1: -8, z1: -13, x2: -4, z2: -2, indoor: false });
    this.rooms.push({ id: 'service_lane', name: 'Service lane', x1: -8, z1: -17, x2: 13, z2: -13, indoor: false });
    this.rooms.push({ id: 'mill_cut', name: 'Mill Cut', x1: 10, z1: -13, x2: 13, z2: -2, indoor: false });
    this.rooms.push({ id: 'towpath', name: 'Towpath link', x1: 10, z1: -28, x2: 13, z2: -17, indoor: false });

    // ------------------------------------------------------------ garden
    const gw: WallStyle = { color: 0x9a6a50 };
    wall('x', -17.125, -4, 10.25, 2.0, gw, [{ at: 3, w: 1.3, kind: 'gap' }]);
    wall('z', 10.125, -27.25, -17, 2.0, gw, [{ at: -23, w: 1.3, kind: 'gap' }]);
    wall('z', -3.875, -27.25, -17, 2.0, gw);
    wall('x', -27.375, -4, 10.25, 2.0, gw);
    ground.span(-3.75, F - 0.02, -27.25, 10, F, -17.25, C.grass, 0);
    for (let x = -3.5; x < 9.5; x += 1.6) for (let z = -27; z < -17.6; z += 1.7) ground.box(x + ((z * 7) % 1), F + 0.03, z + ((x * 5) % 1), 0.5, 0.06, 0.4, 0x7fae60, 0.1);
    for (const [px, pz] of [[3, -17.9], [3.2, -19], [4, -20], [5.1, -21], [6.3, -22], [7.6, -22.8], [8.9, -23]]) ground.box(px, F + 0.01, pz, 0.7, 0.03, 0.6, 0xb7b2a8, 0.08);
    solid(ext, -3.2, F, -22.5, 0.6, F + 0.3, -19.2, C.soil, 0.05); // veg bed
    for (let x = -2.9; x < 0.5; x += 0.55) for (let z = -22.2; z < -19.4; z += 0.7) ext.box(x, F + 0.42, z, 0.3, 0.26, 0.3, 0x4c8a45, 0.15);
    solid(ext, 5.5, F, -26.9, 9.6, F + 0.3, -25.2, C.soil, 0.05);
    for (let x = 5.9; x < 9.5; x += 0.6) ext.box(x, F + 0.5, -26, 0.25, 0.5, 0.25, [0xd95c8a, 0xf1d24a, 0xe8642a, 0xf4f1e8][Math.round(x * 3) % 4], 0.1);
    // open-fronted lean-to (not an enterable building)
    solid(ext, -3.7, F, -27.2, -1.0, F + 1.9, -27.0, C.woodDark, 0.06);
    solid(ext, -3.7, F, -27.0, -3.5, F + 1.9, -24.8, C.woodDark, 0.06);
    solid(ext, -1.2, F, -27.0, -1.0, F + 1.9, -24.8, C.woodDark, 0.06);
    ext.span(-3.9, F + 1.9, -27.3, -0.8, F + 2.0, -24.5, 0x3f4852);
    ext.box(-2.6, F + 0.5, -26.6, 0.1, 1.0, 0.1, C.steel); // spade
    ext.box(-2.0, F + 0.3, -26.5, 0.5, 0.6, 0.5, 0x3a6ea5); // water butt
    tree(ext, 8.3, F, -19.2, 1.0);
    phys.addStaticBox(8.3, F + 1, -19.2, 0.22, 1, 0.22);
    ext.box(0.5, F + 1.0, -24.5, 0.08, 2.0, 0.08, C.wood); // washing line
    ext.box(4.5, F + 1.0, -24.5, 0.08, 2.0, 0.08, C.wood);
    ext.box(2.5, F + 1.95, -24.5, 4.0, 0.02, 0.02, 0xf4f1e8);
    ext.box(1.6, F + 1.55, -24.5, 0.9, 0.8, 0.02, 0xf1eee6);
    ext.box(3.2, F + 1.65, -24.5, 0.5, 0.6, 0.02, 0x6fa3c9);
    spawnProp(phys, this.group, 'gd_deckchair', 'deckchair', 5.6, F, -20.0, 0.6);
    spawnProp(phys, this.group, 'gd_pot1', 'pot', 3.95, F, -18.0, 0, 0);
    spawnProp(phys, this.group, 'gd_pot2', 'pot', 9.2, F, -23.95, 0, 1);
    spawnProp(phys, this.group, 'gd_pot3', 'pot', 2.1, F, -18.0, 0, 2);
    this.rooms.push({ id: 'garden', name: 'Shop garden', x1: -4, z1: -27.4, x2: 10, z2: -17, indoor: false });
    this.mapRects.push({ x1: -4, z1: -27.4, x2: 10, z2: -17, color: '#5d8748', label: 'Garden' });

    // ------------------------------------------------------------ green
    wall('z', 13.125, -27.4, -2, 2.0, gw);
    ground.span(13.25, F - 0.02, -13, 30, F, -2, C.grass, 0);
    for (let x = 13.6; x < 29.6; x += 1.9) for (let z = -12.6; z < -2.4; z += 1.8) ground.box(x + ((z * 3) % 1), F + 0.03, z + ((x * 5) % 1), 0.5, 0.06, 0.4, 0x7fae60, 0.1);
    for (const [a, bq] of [[13.25, 16.2], [17.8, 24.2], [25.8, 30]]) solid(ext, a, F, -2.25, bq, F + 0.75, -2.0, C.stone, 0.05);
    solid(ext, 13.25, F, -13.4, 30.2, F + 1.7, -12.9, C.hedge, 0.08);
    solid(ext, 29.8, F, -13, 30.3, F + 1.7, -2, C.hedge, 0.08);
    tree(ext, 16, F, -9.5, 1.3); phys.addStaticBox(16, F + 1, -9.5, 0.25, 1, 0.25);
    tree(ext, 26.5, F, -6, 1.5); phys.addStaticBox(26.5, F + 1, -6, 0.25, 1, 0.25);
    tree(ext, 23, F, -11, 1.1); phys.addStaticBox(23, F + 1, -11, 0.25, 1, 0.25);
    bench(ext, phys, 20.5, F, -6.5, 0);
    for (const [px, pz] of [[17, -2.1], [17.3, -3.4], [18.1, -4.6], [19.2, -5.5]]) ground.box(px, F + 0.01, pz, 0.8, 0.03, 0.7, 0xb7b2a8, 0.08);
    this.rooms.push({ id: 'green', name: "St Olave's Green", x1: 13, z1: -13, x2: 30.3, z2: -2, indoor: false });
    this.mapRects.push({ x1: 13.2, z1: -13, x2: 30, z2: -2, color: '#5d8748', label: 'Green' });

    // ------------------------------------------------------------ street furniture
    for (const x of [-25, -10.5, 8.5, 22]) lamp(ext, phys, x, F, 2.4);
    solid(ext, -9.9, F, 1.5, -9.3, F + 1.25, 2.1, 0xb0251f); // pillar box
    ext.box(-9.6, F + 1.32, 1.8, 0.7, 0.12, 0.7, 0xb0251f);
    ext.box(-9.6, F + 1.0, 1.49, 0.3, 0.06, 0.02, C.dark);
    bench(ext, phys, -12.2, F, 11.6, Math.PI);
    bench(ext, phys, 15, F, 11.6, Math.PI);
    spawnProp(phys, this.group, 'st_bin', 'bin', 0.32, F, 1.1);
    spawnProp(phys, this.group, 'st_bin2', 'bin', -19.2, F, 2.2);
    addSign(this.group, 'HIGH STREET', 1.4, 0.24, -6.9, F + 2.5, -1.98, 0, '#f4f1e8', '#202227', 'bold 30px Arial, sans-serif');

    // ------------------------------------------------------------ boundaries
    // railway viaduct to the west, with a pedestrian arch NPCs can leave through
    for (let k = 0; k < 2; k++) {
      const zc = k ? 6.5 : 0.5;
      const half = k ? 3.2 : 1.6;
      ext.span(-45.5, F + 3.4, zc - half - 0.6, -44, F + 6.5, zc + half + 0.6, 0x7d4a38, 0.07);
    }
    solid(ext, -45.5, -0.2, 9.7, -44, 6.6, 14, 0x7d4a38, 0.07);
    solid(ext, -45.5, -0.2, 2.1, -44, 6.6, 3.3, 0x7d4a38, 0.07);
    solid(ext, -45.5, -0.2, -3, -44, 6.6, -1.1, 0x7d4a38, 0.07);
    ext.span(-45.7, 6.6, -3, -43.8, 7.0, 14, C.stone, 0.04);
    solid(ext, -44.4, 0, 3.4, -44.2, 1.1, 9.6, 0xf4f1e8); // road closed boards
    for (let z = 3.6; z < 9.5; z += 1.0) ext.box(-44.18, 0.75, z + 0.25, 0.02, 0.4, 0.5, 0xd9462f);
    addSign(this.group, 'ROAD CLOSED', 2.4, 0.5, -44.15, 1.6, 6.5, Math.PI / 2, '#d9462f', '#f4f1e8', 'bold 44px Arial, sans-serif');
    solid(ext, -52, F, -14, -36, F + 2.6, -2, 0x587f47, 0.05); // embankment by the viaduct
    solid(ext, -52, F, -40, -8.2, F + 2.6, -13.1, 0x587f47, 0.05); // railway embankment behind station
    solid(ext, -8.2, F, -40, -4, F + 2.6, -17.25, 0x587f47, 0.05);
    solid(ext, -4, F, -40, 10.1, F + 2.6, -27.6, 0x587f47, 0.05);
    // gap for the towpath: stile posts
    solid(ext, 13.2, F, -40, 40, F + 2.6, -13.4, 0x587f47, 0.05);
    solid(ext, 10.1, F, -40, 13.2, F + 2.6, -31, 0x587f47, 0.05);
    ext.box(10.5, F + 0.6, -27.5, 0.14, 1.2, 0.14, C.wood);
    ext.box(12.7, F + 0.6, -27.5, 0.14, 1.2, 0.14, C.wood);
    addSign(this.group, 'TOWPATH', 0.9, 0.22, 11.6, F + 1.35, -27.5, 0, '#2f5d4a', '#f4f1e8', 'bold 30px Arial, sans-serif');
    for (let x = -50; x < 40; x += 2.2) ext.box(x, F + 3.0, -33, 0.1, 0.9, 0.1, C.woodDark);
    ext.span(-50, F + 3.2, -33.03, 40, F + 3.28, -32.97, C.woodDark);
    // east: barrier at the canal bridge
    solid(ext, 30.2, 0, 3.2, 30.4, 1.1, 14, 0xf4f1e8);
    for (let z = 3.4; z < 13.6; z += 1.0) ext.box(30.18, 0.75, z + 0.25, 0.02, 0.4, 0.5, 0xd9462f);
    solid(ext, 30.3, F, -2.4, 40, F + 1.7, -1.9, C.hedge, 0.08);
    addSign(this.group, 'BRIDGE WORKS', 2.4, 0.5, 30.15, 1.6, 6.5, -Math.PI / 2, '#d9462f', '#f4f1e8', 'bold 44px Arial, sans-serif');
    // edge-of-beat walls (player only)
    phys.addStaticBox(-44.7, 2, 0.5, 0.2, 3, 1.7, { group: G.BOUNDARY, id: 'beat_w' });
    phys.addStaticBox(30.4, 2, 0.5, 0.2, 3, 2.7, { group: G.BOUNDARY, id: 'beat_e' });
    phys.addStaticBox(11.6, 2, -27.7, 1.6, 3, 0.2, { group: G.BOUNDARY, id: 'beat_n' });

    // ------------------------------------------------------------ finish meshes
    const gm = ground.mesh({ shadows: false });
    const em = ext.mesh();
    const im = int.mesh({ shadows: false });
    this.group.add(gm, em, im);
    const glassMesh = new THREE.Mesh(glass.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }));
    glassMesh.renderOrder = 2;
    this.group.add(glassMesh);

    // ------------------------------------------------------------ anchors
    const A = (id: string, x: number, z: number, yaw: number): void => { this.anchors[id] = { x, z, yaw }; };
    A('player_start', -10.0, -4.4, Math.PI);
    A('locker', -9.2, -6.0, Math.PI / 2);
    A('sgt_desk', -17.5, -10.3, 0);
    A('brief_spot', -17.5, -7.95, Math.PI);
    A('mara_till', 8.6, -5.2, -Math.PI / 2);
    A('mara_door', 1.6, -0.9, 0.3);
    A('mara_stock', 5.0, -10.6, Math.PI / 2);
    A('mara_restock', -2.7, -6.0, -Math.PI / 2);
    A('customer_pay', 6.35, -4.1, Math.PI / 2);
    A('tin_shelf', 3.2, -8.3, Math.PI);
    A('june_mags', 3.5, -3.4, 0);
    A('june_cards', 2.1, -6.6, Math.PI);
    A('june_outside', -2.6, -1.0, 0);
    A('browse_a', -1.3, -6.4, -Math.PI / 2);
    A('browse_b', -1.2, -8.2, Math.PI);
    A('browse_c', 5.8, -6.5, -Math.PI / 2);
    A('stock_drop', 4.4, -11.4, Math.PI);
    A('green_bench', 20.5, -5.8, 0);
    A('green_stroll', 24, -8.5, Math.PI);
    A('yard_spawn', -27, -4.2, Math.PI);
  }

  private addLight(x: number, y: number, z: number, color: number, intensity: number): void {
    const l = new THREE.PointLight(color, intensity, 14, 1.6);
    l.position.set(x, y, z);
    this.group.add(l);
    this.lights.push(l);
    const b = new VoxelBuilder();
    b.box(x, y + 0.2, z, 0.9, 0.05, 0.25, 0xfffbe8);
    const m = new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.group.add(m);
  }

  private buildNav(): void {
    const n = this.nav;
    const N = (id: string, x: number, z: number): void => n.add(id, x, z);
    // high street pavement
    N('exit_w_out', -48.5, 0.5); N('exit_w', -44.6, 0.5); N('pv_w', -40, 0.5); N('pv_yard', -29, 0.5);
    N('pv_st', -17, 0.3); N('pv_cp', -6, 0.5); N('pv_shop', 0, 0.4); N('pv_e1', 6, 0.5);
    N('pv_mc', 11.5, 0.5); N('pv_gr', 17, 0.5); N('pv_e2', 25, 0.5); N('exit_e', 30.4, 0.5); N('exit_e_out', 34.5, 0.5);
    n.chain('exit_w_out', 'exit_w', 'pv_w', 'pv_yard', 'pv_st', 'pv_cp', 'pv_shop', 'pv_e1', 'pv_mc', 'pv_gr', 'pv_e2', 'exit_e', 'exit_e_out');
    N('van_rear', -0.25, 4.0); n.link('van_rear', 'pv_shop');
    N('van_cab', 4.5, 2.45); n.link('van_cab', 'pv_e1'); n.link('van_cab', 'pv_shop');
    N('bay_cab', 22.9, 2.45); n.link('bay_cab', 'pv_e2'); n.link('bay_cab', 'pv_gr');
    // station
    N('st_out', -17, -1.3); N('st_door', -17, -2.125); N('st_rec', -17, -5.2); N('st_brief', -17.5, -7.95);
    N('st_e', -14.4, -7.8); N('st_behind', -14.4, -10.2); N('st_desk', -17.5, -10.3);
    N('st_idoor', -13, -8); N('st_lock', -12, -8); N('st_lock2', -9.9, -7.6); N('st_lock3', -10.0, -4.4);
    N('st_ydoor_in', -20.9, -5); N('st_ydoor', -21.875, -5); N('yd_in', -23, -5);
    n.link('pv_st', 'st_out'); n.link('st_out', 'st_door', 'station_front'); n.link('st_door', 'st_rec', 'station_front');
    n.chain('st_rec', 'st_brief'); n.chain('st_rec', 'st_e', 'st_behind', 'st_desk'); n.link('st_brief', 'st_e');
    n.link('st_e', 'st_idoor', 'station_inner'); n.link('st_idoor', 'st_lock', 'station_inner'); n.chain('st_lock', 'st_lock2', 'st_lock3');
    n.link('st_rec', 'st_ydoor_in'); n.link('st_ydoor_in', 'st_ydoor', 'station_yard'); n.link('st_ydoor', 'yd_in', 'station_yard');
    // yard loop
    N('yd_gate', -29, -2.1); N('y1', -27, -4.3); N('y2', -27.2, -9.4); N('y3', -30.4, -9.4);
    N('y4', -35.15, -9.3); N('y5', -35.15, -5.57); N('y6', -31.0, -5.57); N('y7', -30.3, -5.0);
    n.link('pv_yard', 'yd_gate'); n.link('yd_gate', 'y1'); n.link('yd_in', 'y1');
    n.chain('y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y1');
    // shop
    N('sh_door', 0, -2.125); N('sh_a', 0, -3.6); N('sh_a2', -1.3, -3.9); N('sh_mid', 2.7, -3.8); N('sh_b', 5.8, -3.7);
    N('sh_pay', 6.35, -4.1); N('sh_wa', -1.3, -6.4); N('sh_n0', -1.2, -8.3); N('sh_ma', 2.7, -6.4); N('sh_n1', 2.7, -8.3);
    N('sh_tin', 3.2, -8.3); N('sh_c', 5.8, -8.2); N('sh_e', 5.8, -6.5); N('sh_ctr', 8.5, -7.7); N('sh_till', 8.6, -5.2);
    N('sh_idoor', 7, -9.5); N('sr_a', 7, -10.7); N('sr_drop', 4.4, -11.2); N('sr_b', -1, -11.3); N('sr_door', -1, -12.875);
    n.link('pv_shop', 'sh_door'); n.link('sh_door', 'sh_a');
    n.chain('sh_a2', 'sh_a', 'sh_mid', 'sh_b', 'sh_e', 'sh_c');
    n.link('sh_b', 'sh_pay'); n.chain('sh_a2', 'sh_wa', 'sh_n0', 'sh_n1', 'sh_tin'); n.chain('sh_mid', 'sh_ma', 'sh_n1'); n.link('sh_n1', 'sh_c'); n.link('sh_tin', 'sh_c');
    n.chain('sh_c', 'sh_ctr', 'sh_till');
    n.link('sh_c', 'sh_idoor', 'shop_stock'); n.link('sh_idoor', 'sr_a', 'shop_stock'); n.chain('sr_a', 'sr_drop', 'sr_b'); n.link('sr_b', 'sr_door', 'shop_rear');
    // passages and lane
    N('cp_s', -6, -1.6); N('cp_m', -6, -7.5); N('cp_n', -6, -13.2); N('ln_w', -6, -15); N('ln_rear', -1, -14.6);
    N('ln_gate', 3, -15.4); N('ln_e', 11.5, -15); N('mc_m', 11.5, -8); N('mc_s', 11.5, -1.6);
    n.chain('pv_cp', 'cp_s', 'cp_m', 'cp_n', 'ln_w', 'ln_rear', 'ln_gate', 'ln_e', 'mc_m', 'mc_s', 'pv_mc');
    n.link('sr_door', 'ln_rear', 'shop_rear');
    // garden and towpath
    N('gd_gate_s', 3, -17.125); N('gd_a', 3.3, -19.2); N('gd_b', 7.2, -22.7); N('gd_gate_e', 10.125, -23); N('fp_m', 11.5, -23);
    N('fp_s', 11.5, -18.5); N('exit_n', 11.5, -27.6); N('exit_n_out', 11.6, -30.4);
    n.chain('ln_gate', 'gd_gate_s', 'gd_a', 'gd_b', 'gd_gate_e', 'fp_m', 'exit_n', 'exit_n_out');
    n.chain('ln_e', 'fp_s', 'fp_m');
    // green
    N('gr_gate', 17, -2.1); N('gr_a', 18.4, -4.9); N('gr_bench', 20.5, -5.7); N('gr_b', 24, -8.5); N('gr_gate2', 25, -2.1);
    n.chain('pv_gr', 'gr_gate', 'gr_a', 'gr_bench', 'gr_b', 'gr_gate2', 'pv_e2'); n.link('gr_a', 'gr_b');
  }
}

const OUTSIDE: Room = { id: 'high_street', name: 'High Street', x1: -1e9, z1: -1e9, x2: 1e9, z2: 1e9, indoor: false };

// ---------------------------------------------------------------- set dressing
function addSign(parent: THREE.Object3D, text: string, w: number, h: number, x: number, y: number, z: number, rotY: number, bg: string, fg: string, font?: string): void {
  const m = makeSign(text, w, h, bg, fg, font);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  parent.add(m);
}

function shelf(b: VoxelBuilder, phys: Physics, x1: number, z1: number, x2: number, z2: number, h: number, along: 'x' | 'z', seed: number, boxes = false): void {
  phys.addStaticBox((x1 + x2) / 2, F + h / 2, (z1 + z2) / 2, (x2 - x1) / 2, h / 2, (z2 - z1) / 2);
  const frame = boxes ? 0x6b7078 : 0xd9d4c4;
  b.span(x1, F, z1, x2, F + 0.12, z2, 0x5a5f66);
  const levels = Math.floor((h - 0.2) / 0.42);
  const palette = [0xd9462f, 0x2f7fd9, 0xf1d24a, 0x3aa35a, 0xd95c8a, 0xf4f1e8, 0xe8642a, 0x7a4fb0, 0x3ab0a0, 0xa3202a];
  let s = seed * 9301 + 49297;
  const rnd = (): number => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let l = 0; l <= levels; l++) {
    const y = F + 0.12 + l * 0.42;
    b.span(x1, y, z1, x2, y + 0.03, z2, frame);
    if (l === levels) break;
    const len = along === 'x' ? x2 - x1 : z2 - z1;
    for (let u = 0.05; u < len - 0.2; ) {
      const w = boxes ? 0.4 + rnd() * 0.3 : 0.14 + rnd() * 0.16;
      const hh = boxes ? 0.2 + rnd() * 0.16 : 0.18 + rnd() * 0.18;
      const col = boxes ? 0xb98b56 : palette[Math.floor(rnd() * palette.length)];
      if (rnd() > 0.12) {
        if (along === 'x') b.box(x1 + u + w / 2, y + 0.03 + hh / 2, (z1 + z2) / 2, w - 0.02, hh, (z2 - z1) * 0.8, col, 0.08);
        else b.box((x1 + x2) / 2, y + 0.03 + hh / 2, z1 + u + w / 2, (x2 - x1) * 0.8, hh, w - 0.02, col, 0.08);
      }
      u += w;
    }
  }
  // end posts
  if (along === 'x') {
    b.span(x1, F, z1, x1 + 0.04, F + h, z2, frame);
    b.span(x2 - 0.04, F, z1, x2, F + h, z2, frame);
  } else {
    b.span(x1, F, z1, x2, F + h, z1 + 0.04, frame);
    b.span(x1, F, z2 - 0.04, x2, F + h, z2, frame);
  }
}

function tree(b: VoxelBuilder, x: number, y: number, z: number, s: number): void {
  b.box(x, y + 1.1 * s, z, 0.34 * s, 2.2 * s, 0.34 * s, 0x5a4027, 0.08);
  b.box(x, y + 2.9 * s, z, 2.2 * s, 1.5 * s, 2.2 * s, 0x4c8a45, 0.08);
  b.box(x + 0.3 * s, y + 3.9 * s, z - 0.2 * s, 1.5 * s, 0.9 * s, 1.5 * s, 0x5a9a4f, 0.08);
  b.box(x - 0.8 * s, y + 2.5 * s, z + 0.5 * s, 1.1 * s, 0.9 * s, 1.1 * s, 0x437a3d, 0.08);
  b.box(x + 0.9 * s, y + 2.4 * s, z + 0.3 * s, 0.9 * s, 0.8 * s, 1.0 * s, 0x4c8a45, 0.08);
}

function bench(b: VoxelBuilder, phys: Physics, x: number, y: number, z: number, yaw: number): void {
  const s = Math.cos(yaw) >= 0 ? 1 : -1;
  b.box(x, y + 0.45, z, 1.7, 0.07, 0.5, 0x8a6a45, 0.05);
  b.box(x, y + 0.8, z - 0.24 * s, 1.7, 0.5, 0.06, 0x8a6a45, 0.05);
  b.box(x - 0.75, y + 0.22, z, 0.08, 0.45, 0.45, 0x2b2d33);
  b.box(x + 0.75, y + 0.22, z, 0.08, 0.45, 0.45, 0x2b2d33);
  phys.addStaticBox(x, y + 0.3, z, 0.85, 0.3, 0.28);
}

function lamp(b: VoxelBuilder, phys: Physics, x: number, y: number, z: number): void {
  b.box(x, y + 0.2, z, 0.26, 0.4, 0.26, 0x1c1e24);
  b.box(x, y + 2.0, z, 0.1, 3.4, 0.1, 0x1c1e24);
  b.box(x, y + 3.75, z, 0.4, 0.08, 0.4, 0x1c1e24);
  b.box(x, y + 3.95, z, 0.3, 0.34, 0.3, 0xfff1c2);
  b.box(x, y + 4.16, z, 0.42, 0.08, 0.42, 0x1c1e24);
  phys.addStaticBox(x, y + 1, z, 0.14, 1, 0.14);
}

function patrolCar(b: VoxelBuilder, x: number, y: number, z: number): void {
  b.box(x, y + 0.55, z, 1.8, 0.6, 4.2, 0xf4f4f0);
  b.box(x, y + 1.05, z - 0.2, 1.6, 0.5, 2.2, 0xf4f4f0);
  b.box(x, y + 1.05, z + 0.92, 1.5, 0.42, 0.04, 0x6f8fa3);
  b.box(x, y + 1.05, z - 1.32, 1.5, 0.42, 0.04, 0x6f8fa3);
  for (let i = -4; i < 4; i++) {
    b.box(x + 0.905, y + 0.55, z + i * 0.5 + 0.25, 0.01, 0.3, 0.5, i % 2 ? 0x2a5fd0 : 0xd8e12a);
    b.box(x - 0.905, y + 0.55, z + i * 0.5 + 0.25, 0.01, 0.3, 0.5, i % 2 ? 0xd8e12a : 0x2a5fd0);
  }
  b.box(x, y + 1.36, z - 0.2, 1.1, 0.1, 0.3, 0x2a5fd0);
  for (const wx of [0.85, -0.85]) for (const wz of [1.3, -1.3]) b.box(x + wx, y + 0.3, z + wz, 0.22, 0.6, 0.6, 0x16171a);
}

function shadeC(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}
