import * as THREE from 'three';
import { G, Physics } from '../physics/physics';

// Authored walkable graph with explicit door links (docs/plan/08 Navigation).
export interface NavNode {
  id: string;
  x: number;
  z: number;
}
export interface PathStep {
  x: number;
  z: number;
  /** Door that must be open before walking to this step. */
  door?: string;
  node?: string;
}
interface Edge {
  to: string;
  cost: number;
  door?: string;
}

export class Nav {
  readonly nodes = new Map<string, NavNode>();
  private adj = new Map<string, Edge[]>();

  add(id: string, x: number, z: number): void {
    this.nodes.set(id, { id, x, z });
    this.adj.set(id, []);
  }

  link(a: string, b: string, door?: string): void {
    const na = this.nodes.get(a), nb = this.nodes.get(b);
    if (!na || !nb) throw new Error(`Nav link references missing node: ${a} / ${b}`);
    const cost = Math.hypot(na.x - nb.x, na.z - nb.z);
    this.adj.get(a)!.push({ to: b, cost, door });
    this.adj.get(b)!.push({ to: a, cost, door });
  }

  chain(...ids: string[]): void {
    for (let i = 0; i + 1 < ids.length; i++) this.link(ids[i], ids[i + 1]);
  }

  /** Closest node that can be walked to in a straight line. */
  nearest(pos: { x: number; z: number }, phys: Physics, y = 0.12): NavNode {
    const from = new THREE.Vector3(pos.x, y + 0.5, pos.z);
    const to = new THREE.Vector3();
    const sorted = [...this.nodes.values()]
      .map((n) => ({ n, d: Math.hypot(n.x - pos.x, n.z - pos.z) }))
      .sort((a, b) => a.d - b.d);
    for (const { n, d } of sorted.slice(0, 8)) {
      if (d < 0.3) return n;
      to.set(n.x, y + 0.5, n.z);
      if (!phys.raycast(from, to, G.STATIC | G.GLASS | G.VEHICLE)) return n;
    }
    return sorted[0].n;
  }

  /**
   * A* between nodes. `avoid` adds cost near a position (used by fleeing
   * suspects to pick a route away from the officer's perceived position).
   */
  route(from: string, to: string, avoid?: { x: number; z: number; radius: number; penalty: number }, blockedDoors?: Set<string>): string[] | null {
    const open = new Set<string>([from]);
    const g = new Map<string, number>([[from, 0]]);
    const came = new Map<string, string>();
    const goal = this.nodes.get(to)!;
    const h = (id: string): number => {
      const n = this.nodes.get(id)!;
      return Math.hypot(n.x - goal.x, n.z - goal.z);
    };
    while (open.size) {
      let cur = '';
      let best = Infinity;
      for (const id of open) {
        const f = g.get(id)! + h(id);
        if (f < best) { best = f; cur = id; }
      }
      if (cur === to) {
        const out = [cur];
        while (came.has(cur)) { cur = came.get(cur)!; out.unshift(cur); }
        return out;
      }
      open.delete(cur);
      for (const e of this.adj.get(cur)!) {
        if (e.door && blockedDoors?.has(e.door)) continue;
        let c = e.cost;
        if (avoid) {
          const n = this.nodes.get(e.to)!;
          const d = Math.hypot(n.x - avoid.x, n.z - avoid.z);
          if (d < avoid.radius) c += avoid.penalty * (1 - d / avoid.radius);
        }
        const ng = g.get(cur)! + c;
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, cur);
          open.add(e.to);
        }
      }
    }
    return null;
  }

  routeCost(ids: string[]): number {
    let c = 0;
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = this.nodes.get(ids[i])!, b = this.nodes.get(ids[i + 1])!;
      c += Math.hypot(a.x - b.x, a.z - b.z);
    }
    return c;
  }

  doorBetween(a: string, b: string): string | undefined {
    return this.adj.get(a)?.find((e) => e.to === b)?.door;
  }

  /**
   * Can a person walk this straight line? Two rays a shoulder-width apart, and
   * door leaves count as obstacles whether open or shut.
   */
  clearWalk(a: { x: number; z: number }, b: { x: number; z: number }, phys: Physics, y = 0.12): boolean {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return true;
    const px = (-dz / len) * 0.26, pz = (dx / len) * 0.26;
    const mask = G.STATIC | G.GLASS | G.VEHICLE | G.DOOR;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const s of [1, -1]) {
      p.set(a.x + px * s, y + 0.5, a.z + pz * s);
      q.set(b.x + px * s, y + 0.5, b.z + pz * s);
      if (phys.raycast(p, q, mask)) return false;
    }
    return true;
  }

  /** Walkable steps from a position to a target node or free position. */
  path(
    from: { x: number; z: number }, target: string | { x: number; z: number }, phys: Physics,
    avoid?: { x: number; z: number; radius: number; penalty: number }, blockedDoors?: Set<string>,
  ): PathStep[] | null {
    const endNode = typeof target === 'string' ? this.nodes.get(target) : this.nearest(target, phys);
    if (!endNode) return null;
    // candidate start nodes: the few closest that can be walked to directly
    const near = [...this.nodes.values()]
      .map((n) => ({ n, d: Math.hypot(n.x - from.x, n.z - from.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .filter(({ n, d }) => d < 0.3 || (d < 7 && this.clearWalk(from, n, phys)));
    let ids: string[] | null = null;
    let best = Infinity;
    for (const { n, d } of near.length ? near : [{ n: this.nearest(from, phys), d: 0 }]) {
      const r = this.route(n.id, endNode.id, avoid, blockedDoors);
      if (!r) continue;
      const cost = d + this.routeCost(r);
      if (cost < best) { best = cost; ids = r; }
    }
    if (!ids) return null;
    const steps: PathStep[] = [];
    for (let i = 0; i < ids.length; i++) {
      const n = this.nodes.get(ids[i])!;
      steps.push({ x: n.x, z: n.z, node: n.id, door: i > 0 ? this.doorBetween(ids[i - 1], ids[i]) : undefined });
    }
    // skip the first node if we are already past it towards the second
    if (steps.length >= 2 && !steps[1].door) {
      const a = steps[0], b = steps[1];
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const pb = Math.hypot(b.x - from.x, b.z - from.z);
      if (pb < ab && !phys.raycast(new THREE.Vector3(from.x, 0.6, from.z), new THREE.Vector3(b.x, 0.6, b.z), G.STATIC | G.GLASS | G.VEHICLE)) steps.shift();
    }
    if (typeof target !== 'string') steps.push({ x: target.x, z: target.z });
    return steps;
  }
}
