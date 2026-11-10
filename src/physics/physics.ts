import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/** Collision group bits. */
export const G = {
  STATIC: 1,
  CHAR: 2,
  PROP: 4,
  DOOR: 8,
  DOWNED: 16,
  /** Edge-of-beat walls: only the player collides with these. */
  BOUNDARY: 32,
  VEHICLE: 64,
  /** Window glass: blocks movement but not sight. */
  GLASS: 128,
} as const;

export const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

export const SOLID = G.STATIC | G.PROP | G.DOOR | G.VEHICLE | G.GLASS;
export const SIGHT_BLOCKERS = G.STATIC | G.DOOR | G.VEHICLE;

export type OwnerKind = 'static' | 'char' | 'prop' | 'item' | 'door' | 'vehicle';
export interface ColliderOwner {
  kind: OwnerKind;
  id: string;
  /** How hard this thing is to walk into (props). */
  tripFactor?: number;
}

export interface DynBody {
  id: string;
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
}

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export class Physics {
  readonly world: RAPIER.World;
  readonly staticBody: RAPIER.RigidBody;
  readonly owners = new Map<number, ColliderOwner>();
  readonly dyn = new Map<string, DynBody>();
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  /** Static axis-aligned (optionally yawed) box given by centre and half extents. */
  addStaticBox(
    cx: number, cy: number, cz: number, hx: number, hy: number, hz: number,
    opts: { yaw?: number; group?: number; id?: string } = {},
  ): RAPIER.Collider {
    const member = opts.group ?? G.STATIC;
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setCollisionGroups(groups(member, 0xffff))
      .setFriction(0.9);
    if (opts.yaw) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    const c = this.world.createCollider(desc, this.staticBody);
    this.owners.set(c.handle, { kind: 'static', id: opts.id ?? 'static' });
    return c;
  }

  /** Sloped static box (for stair ramps). Pitch about X axis after yaw. */
  addRamp(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, quat: THREE.Quaternion): void {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCollisionGroups(groups(G.STATIC, 0xffff))
      .setFriction(1);
    const c = this.world.createCollider(desc, this.staticBody);
    this.owners.set(c.handle, { kind: 'static', id: 'ramp' });
  }

  addDynamicBox(
    id: string, mesh: THREE.Object3D, pos: THREE.Vector3, half: THREE.Vector3,
    opts: { mass?: number; kind?: OwnerKind; tripFactor?: number; yaw?: number; friction?: number; angDamp?: number; cylinder?: boolean } = {},
  ): DynBody {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.25)
      .setAngularDamping(opts.angDamp ?? 0.9)
      .setCcdEnabled(false);
    if (opts.yaw) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    const body = this.world.createRigidBody(desc);
    const shape = opts.cylinder
      ? RAPIER.ColliderDesc.cylinder(half.y, Math.max(half.x, half.z))
      : RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z);
    shape
      .setMass(opts.mass ?? 5)
      .setFriction(opts.friction ?? 0.8)
      .setRestitution(0.05)
      // props and evidence stay on the beat: they collide with the edge walls that stop the officer
      .setCollisionGroups(groups(G.PROP, G.STATIC | G.PROP | G.CHAR | G.DOOR | G.DOWNED | G.VEHICLE | G.GLASS | G.BOUNDARY));
    const col = this.world.createCollider(shape, body);
    this.owners.set(col.handle, { kind: opts.kind ?? 'prop', id, tripFactor: opts.tripFactor ?? 0.6 });
    const d: DynBody = { id, body, mesh };
    this.dyn.set(id, d);
    return d;
  }

  removeDynamic(id: string): void {
    const d = this.dyn.get(id);
    if (!d) return;
    for (let i = 0; i < d.body.numColliders(); i++) this.owners.delete(d.body.collider(i).handle);
    this.world.removeRigidBody(d.body);
    this.dyn.delete(id);
  }

  /** First hit distance along the segment, or null. */
  raycast(from: THREE.Vector3, to: THREE.Vector3, mask: number, exclude?: RAPIER.Collider): { dist: number; collider: RAPIER.Collider } | null {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return null;
    this.ray.origin = { x: from.x, y: from.y, z: from.z };
    this.ray.dir = { x: dx / len, y: dy / len, z: dz / len };
    const hit = this.world.castRay(this.ray, len, true, undefined, groups(0xffff, mask), exclude);
    return hit ? { dist: hit.timeOfImpact, collider: hit.collider } : null;
  }

  /** Line of sight between two points (eye heights supplied by caller). */
  los(a: THREE.Vector3, b: THREE.Vector3): boolean {
    return this.raycast(a, b, SIGHT_BLOCKERS) === null;
  }

  groundY(x: number, z: number, fromY = 3): number {
    const hit = this.raycast(new THREE.Vector3(x, fromY, z), new THREE.Vector3(x, -2, z), G.STATIC);
    return hit ? fromY - hit.dist : 0;
  }

  step(): void {
    this.world.step();
  }

  syncMeshes(): void {
    for (const d of this.dyn.values()) {
      if (d.body.isSleeping()) continue;
      const t = d.body.translation();
      const r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  counts(): { bodies: number; awake: number; colliders: number } {
    let awake = 0;
    for (const d of this.dyn.values()) if (!d.body.isSleeping()) awake++;
    return { bodies: this.world.bodies.len(), awake, colliders: this.world.colliders.len() };
  }

  dispose(): void {
    this.owners.clear();
    this.dyn.clear();
    this.world.free();
  }
}
