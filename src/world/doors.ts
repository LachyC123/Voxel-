import * as THREE from 'three';
import { G, Physics, RAPIER, groups } from '../physics/physics';
import { Character, RADIUS, Reactions } from '../characters/character';
import { EventBus } from '../simulation/events';
import { VoxelBuilder } from './voxel';

// Doors swing on a controlled, bounded rotation with obstruction checks. A door
// stops against a person (and nudges them once) rather than forcing through.
export interface Door {
  id: string;
  name: string;
  hinge: THREE.Vector3;
  width: number;
  /** Yaw of the closed leaf: it extends from the hinge along (cos, 0, -sin). */
  closedYaw: number;
  angle: number;
  target: number;
  locked: boolean;
  body: RAPIER.RigidBody;
  pivot: THREE.Group;
  nudgeT: number;
}

const MAX = 1.72;
const SPEED = 2.8;

export class Doors {
  readonly all = new Map<string, Door>();
  constructor(private phys: Physics, private scene: THREE.Object3D, private events: EventBus) {}

  add(id: string, name: string, hx: number, hz: number, y: number, width: number, closedYaw: number, color: number, opts: { open?: number; locked?: boolean; glass?: boolean } = {}): Door {
    const pivot = new THREE.Group();
    const b = new VoxelBuilder();
    const h = 2.2;
    b.box(width / 2, h / 2, 0, width - 0.04, h, 0.07, color);
    b.box(width / 2, h * 0.72, 0.04, width - 0.3, h * 0.36, 0.012, opts.glass ? 0x9fc4d8 : shade(color, 1.18));
    b.box(width / 2, h * 0.25, 0.04, width - 0.3, h * 0.3, 0.012, shade(color, 1.18));
    b.box(width / 2, h * 0.72, -0.04, width - 0.3, h * 0.36, 0.012, opts.glass ? 0x9fc4d8 : shade(color, 1.18));
    b.box(width / 2, h * 0.25, -0.04, width - 0.3, h * 0.3, 0.012, shade(color, 1.18));
    b.box(width - 0.12, 1.02, 0.06, 0.05, 0.05, 0.08, 0xc9a23a);
    b.box(width - 0.12, 1.02, -0.06, 0.05, 0.05, 0.08, 0xc9a23a);
    pivot.add(b.mesh());
    pivot.position.set(hx, y, hz);
    this.scene.add(pivot);
    const body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hx, y, hz));
    const col = this.phys.world.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2 - 0.03, h / 2, 0.04).setTranslation(width / 2, h / 2, 0).setCollisionGroups(groups(G.DOOR, 0xffff)),
      body,
    );
    this.phys.owners.set(col.handle, { kind: 'door', id });
    const d: Door = { id, name, hinge: new THREE.Vector3(hx, y, hz), width, closedYaw, angle: opts.open ?? 0, target: opts.open ?? 0, locked: !!opts.locked, body, pivot, nudgeT: 0 };
    this.all.set(id, d);
    this.applyPose(d, true);
    return d;
  }

  get(id: string): Door {
    const d = this.all.get(id);
    if (!d) throw new Error(`Unknown door ${id}`);
    return d;
  }

  isOpen(id: string): boolean {
    return Math.abs(this.get(id).angle) > 1.15;
  }
  isClosed(id: string): boolean {
    const d = this.get(id);
    return Math.abs(d.angle) < 0.05 && d.target === 0;
  }

  /** Centre of the doorway, for prompts and reach checks. */
  centre(id: string, out = new THREE.Vector3()): THREE.Vector3 {
    const d = this.get(id);
    return out.set(d.hinge.x + Math.cos(d.closedYaw) * d.width * 0.5, d.hinge.y + 1.05, d.hinge.z - Math.sin(d.closedYaw) * d.width * 0.5);
  }

  /** Open away from the user. Returns false if locked. */
  open(id: string, user: THREE.Vector3, actor?: string): boolean {
    const d = this.get(id);
    if (d.locked) return false;
    if (Math.abs(d.target) > 0.1) return true;
    const nx = Math.sin(d.closedYaw), nz = Math.cos(d.closedYaw);
    const side = (user.x - d.hinge.x) * nx + (user.z - d.hinge.z) * nz;
    d.target = side > 0 ? MAX : -MAX;
    this.events.emit({ type: 'DoorStateChanged', actor, target: id, pos: this.centre(id), loud: 5, visible: true, data: { open: true } });
    return true;
  }

  close(id: string, actor?: string): void {
    const d = this.get(id);
    if (d.target === 0) return;
    d.target = 0;
    this.events.emit({ type: 'DoorStateChanged', actor, target: id, pos: this.centre(id), loud: 4, visible: true, data: { open: false } });
  }

  toggle(id: string, user: THREE.Vector3, actor?: string): boolean {
    const d = this.get(id);
    if (Math.abs(d.target) > 0.1) {
      this.close(id, actor);
      return true;
    }
    return this.open(id, user, actor);
  }

  private applyPose(d: Door, snap = false): void {
    const yaw = d.closedYaw + d.angle;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (snap) d.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    else d.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    d.pivot.quaternion.copy(q);
  }

  step(dt: number, chars: Iterable<Character>, reactions: Reactions): void {
    for (const d of this.all.values()) {
      d.nudgeT -= dt;
      const diff = d.target - d.angle;
      if (Math.abs(diff) < 1e-4) continue;
      const next = d.angle + Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
      // obstruction: would the leaf at `next` overlap someone?
      const yaw = d.closedYaw + next;
      const dx = Math.cos(yaw), dz = -Math.sin(yaw);
      let blocked = false;
      for (const c of chars) {
        if (c.hidden || !c.upright) continue;
        if (Math.abs(c.pos.y - d.hinge.y) > 1.5) continue;
        const px = c.pos.x - d.hinge.x, pz = c.pos.z - d.hinge.z;
        const t = THREE.MathUtils.clamp(px * dx + pz * dz, 0, d.width);
        const dist = Math.hypot(px - dx * t, pz - dz * t);
        if (dist < RADIUS + 0.1) {
          blocked = true;
          if (d.nudgeT <= 0) {
            d.nudgeT = 1.5;
            const away = new THREE.Vector3(px - dx * t, 0, pz - dz * t);
            if (away.lengthSq() < 1e-6) away.set(-dz, 0, dx);
            reactions.push(c, 1.2, away.normalize(), { kind: 'door', id: d.id });
          }
        }
      }
      if (!blocked) {
        d.angle = next;
        this.applyPose(d);
      }
    }
  }
}

function shade(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}
