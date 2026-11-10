import * as THREE from 'three';
import { ITEM_DEFS, ItemDef } from '../content/items';
import { Physics } from '../physics/physics';
import { VoxelBuilder, disposeTree } from './voxel';
import type { Character } from '../characters/character';

// World item instances. This registry is the single authority on where an item
// is: exactly one of held / stack / world / stored / gone. Meshes are created
// once per instance, so dropping and picking up can never duplicate an item.
export type ItemState = 'held' | 'stack' | 'world' | 'stored' | 'gone';

export interface ItemInst {
  id: string;
  def: ItemDef;
  state: ItemState;
  holder: string | null;
  place: string | null;
  mesh: THREE.Object3D;
  /** Free-form case links (owner, evidence tags). */
  meta: Record<string, unknown>;
}

export function buildItemMesh(def: ItemDef): THREE.Mesh {
  const b = new VoxelBuilder();
  def.build(b);
  return b.mesh({ receive: false });
}

export class Items {
  readonly all = new Map<string, ItemInst>();

  constructor(private phys: Physics, private scene: THREE.Scene) {}

  create(id: string, defId: string, meta: Record<string, unknown> = {}): ItemInst {
    if (this.all.has(id)) throw new Error(`Duplicate item id ${id}`);
    const def = ITEM_DEFS[defId];
    if (!def) throw new Error(`Unknown item definition ${defId}`);
    const inst: ItemInst = { id, def, state: 'gone', holder: null, place: null, mesh: buildItemMesh(def), meta };
    inst.mesh.visible = false;
    this.all.set(id, inst);
    return inst;
  }

  get(id: string): ItemInst {
    const i = this.all.get(id);
    if (!i) throw new Error(`Unknown item ${id}`);
    return i;
  }

  private detach(inst: ItemInst, chars: Map<string, Character>): void {
    if (inst.state === 'world') this.phys.removeDynamic(inst.id);
    if (inst.holder) {
      const c = chars.get(inst.holder);
      if (c) {
        if (c.held === inst.id) c.held = null;
        const k = c.stack.indexOf(inst.id);
        if (k >= 0) {
          c.stack.splice(k, 1);
          this.restack(c);
        }
      }
    }
    inst.mesh.removeFromParent();
    inst.holder = null;
    inst.place = null;
  }

  private restack(c: Character): void {
    let y = 0;
    for (const id of c.stack) {
      const it = this.get(id);
      it.mesh.position.set(0, y + it.def.size[1] / 2 - 0.12, 0);
      it.mesh.quaternion.identity();
      y += it.def.size[1];
    }
  }

  giveHeld(id: string, c: Character, chars: Map<string, Character>): void {
    const inst = this.get(id);
    this.detach(inst, chars);
    if (c.held) throw new Error(`${c.id} already holds ${c.held}`);
    inst.state = 'held';
    inst.holder = c.id;
    c.held = id;
    inst.mesh.visible = true;
    inst.mesh.position.set(0, -0.04, 0.06);
    inst.mesh.quaternion.identity();
    c.rig.handR.add(inst.mesh);
  }

  pushStack(id: string, c: Character, chars: Map<string, Character>): void {
    const inst = this.get(id);
    this.detach(inst, chars);
    inst.state = 'stack';
    inst.holder = c.id;
    c.stack.push(id);
    inst.mesh.visible = true;
    c.rig.carry.add(inst.mesh);
    this.restack(c);
  }

  /** Release into the world as a dynamic body with bounded velocity. */
  drop(id: string, chars: Map<string, Character>, vel?: THREE.Vector3, at?: THREE.Vector3): void {
    const inst = this.get(id);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    if (at) p.copy(at);
    else {
      inst.mesh.updateWorldMatrix(true, false);
      inst.mesh.getWorldPosition(p);
      inst.mesh.getWorldQuaternion(q);
    }
    this.detach(inst, chars);
    inst.state = 'world';
    inst.mesh.visible = true;
    inst.mesh.position.copy(p);
    inst.mesh.quaternion.copy(q);
    this.scene.add(inst.mesh);
    const [sx, sy, sz] = inst.def.size;
    const d = this.phys.addDynamicBox(id, inst.mesh, p, new THREE.Vector3(sx / 2, sy / 2, sz / 2), {
      mass: inst.def.mass, kind: 'item', tripFactor: inst.def.tripFactor, angDamp: 1.2,
    });
    d.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    if (vel) {
      const v = vel.clone().clampLength(0, 3.5);
      d.body.setLinvel({ x: v.x, y: Math.min(2, Math.max(-1, v.y)), z: v.z }, true);
      d.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 }, true);
    }
  }

  dropAllFrom(c: Character, chars: Map<string, Character>, vel: THREE.Vector3, includeHeld: boolean): string[] {
    const dropped: string[] = [];
    for (const id of [...c.stack].reverse()) {
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2);
      this.drop(id, chars, vel.clone().add(jitter));
      dropped.push(id);
    }
    if (includeHeld && c.held) {
      const id = c.held;
      this.drop(id, chars, vel.clone().multiplyScalar(0.6));
      dropped.push(id);
    }
    return dropped;
  }

  /** Put somewhere out of play (van, shelf, till, officer's evidence pocket). */
  store(id: string, place: string, chars: Map<string, Character>): void {
    const inst = this.get(id);
    this.detach(inst, chars);
    inst.state = 'stored';
    inst.place = place;
    inst.mesh.visible = false;
  }

  /** Stored but visibly placed (e.g. parcel put down in the stockroom). */
  place(id: string, place: string, pos: THREE.Vector3, chars: Map<string, Character>): void {
    this.store(id, place, chars);
    const inst = this.get(id);
    inst.mesh.visible = true;
    inst.mesh.position.copy(pos);
    inst.mesh.quaternion.identity();
    this.scene.add(inst.mesh);
  }

  worldPos(id: string, out = new THREE.Vector3()): THREE.Vector3 {
    const inst = this.get(id);
    inst.mesh.updateWorldMatrix(true, false);
    return inst.mesh.getWorldPosition(out);
  }

  /** Free every instance mesh, including stored ones that are not in the scene. */
  dispose(): void {
    for (const it of this.all.values()) {
      it.mesh.removeFromParent();
      disposeTree(it.mesh);
    }
    this.all.clear();
  }

  /** Consistency audit used by the automated yard test. */
  audit(chars: Map<string, Character>): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const c of chars.values()) {
      for (const id of [...c.stack, ...(c.held ? [c.held] : [])]) {
        if (seen.has(id)) errors.push(`item ${id} referenced twice`);
        seen.add(id);
        const it = this.all.get(id);
        if (!it) errors.push(`holder ${c.id} references missing ${id}`);
        else if (it.holder !== c.id) errors.push(`item ${id} holder mismatch`);
      }
    }
    for (const it of this.all.values()) {
      const inWorld = this.phys.dyn.has(it.id);
      if ((it.state === 'world') !== inWorld) errors.push(`item ${it.id} state ${it.state} but body=${inWorld}`);
      if ((it.state === 'held' || it.state === 'stack') && !seen.has(it.id)) errors.push(`item ${it.id} ${it.state} without holder`);
    }
    return errors;
  }
}
