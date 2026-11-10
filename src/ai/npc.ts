import * as THREE from 'three';
import { Character } from '../characters/character';
import type { Gesture, Outfit } from '../characters/rig';
import { SimEvent } from '../simulation/events';
import { PathStep } from '../world/nav';
import type { Shift } from '../app/shift';

// NPC brain: plans (routines), interrupts, perception → beliefs, a small
// utility scorer for bystander reactions, and persistent memories.
export interface Traits {
  confidence: number;
  patience: number;
  honesty: number;
  sociability: number;
  impulsiveness: number;
}

export interface ResidentDef {
  id: string;
  name: string;
  role: string;
  outfit: Outfit;
  traits: Traits;
  speed: number;
  start: string;
}

export type MemoryCategory = 'helped' | 'wrongly_accused' | 'property_recovered' | 'frightened' | 'knocked_over' | 'ordered_about' | 'trustworthy_witness' | 'let_down';
export interface Memory {
  cat: MemoryCategory;
  shift: number;
  weight: number;
}

export interface Belief {
  type: string;
  time: number;
  how: 'saw' | 'heard';
  actor?: string;
  target?: string;
  data?: Record<string, unknown>;
}

export type Step =
  | { t: 'goto'; to: string | { x: number; z: number }; speed?: number; wobble?: number; arrive?: number; blind?: boolean; timeout?: number }
  | { t: 'face'; yaw: number }
  | { t: 'faceAt'; x: number; z: number }
  | { t: 'wait'; s: number; gesture?: Gesture }
  | { t: 'say'; text: string; s?: number; loud?: number }
  | { t: 'do'; fn: () => void }
  | { t: 'until'; cond: () => boolean; gesture?: Gesture; timeout?: number }
  | { t: 'loop' };

interface Plan {
  name: string;
  steps: Step[];
  i: number;
  stepT: number;
  path: PathStep[] | null;
  pi: number;
  started: boolean;
  stallT: number;
  stallPos: THREE.Vector3;
  stalls: number;
  sideT: number;
  side: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Npc {
  plan: Plan | null = null;
  private suspended: Plan[] = [];
  readonly beliefs: Belief[] = [];
  readonly transient = { fear: 0, frustration: 0, embarrassment: 0 };
  inConversation = false;
  /** Incident role flag: bystander reactions are suppressed while set. */
  busy = false;
  intent = 'idle';
  private commitUntil = 0;
  private recentLines: string[] = [];
  private lineReadyAt = 0;
  private lastLineAt = -99;
  asked = new Map<string, number>();
  playerBumps = 0;
  /** Custom handler for recovering from a stumble/fall (incidents override). */
  onRecovered: ((from: string, e: SimEvent) => boolean) | null = null;
  /** Items this NPC dropped and still means to collect. */
  dropped: string[] = [];
  /** Items left behind for now ("I will come back for that one") and when to try again. */
  deferred: string[] = [];
  retryAt = 0;
  readonly retries = new Map<string, number>();
  private excuseAt = 0;

  constructor(readonly def: ResidentDef, readonly char: Character, private shift: Shift, readonly memories: Memory[]) {
    char.accel = 9;
  }

  get id(): string {
    return this.def.id;
  }

  // ------------------------------------------------------------ plans
  private mk(name: string, steps: Step[]): Plan {
    return { name, steps, i: 0, stepT: 0, path: null, pi: 0, started: false, stallT: 0, stallPos: new THREE.Vector3(), stalls: 0, sideT: 0, side: 1 };
  }

  setPlan(name: string, steps: Step[]): void {
    this.plan = this.mk(name, steps);
    this.suspended.length = 0;
    this.intent = name;
  }

  /** Push the current plan and run this one first, then resume. */
  interrupt(name: string, steps: Step[]): void {
    if (this.plan) {
      this.plan.path = null;
      this.plan.started = false;
      this.plan.stepT = 0;
      this.suspended.push(this.plan);
    }
    this.plan = this.mk(name, steps);
    this.intent = name;
  }

  get planName(): string {
    return this.plan?.name ?? 'none';
  }
  hasPlan(name: string): boolean {
    return this.plan?.name === name || this.suspended.some((p) => p.name === name);
  }

  private nextStep(): void {
    const p = this.plan!;
    p.i++;
    p.stepT = 0;
    p.path = null;
    p.started = false;
    p.stalls = 0;
    if (p.i >= p.steps.length) {
      this.plan = this.suspended.pop() ?? null;
      this.intent = this.plan?.name ?? 'idle';
    }
  }

  // ------------------------------------------------------------ speech
  /** Speak a line; returns false if it was suppressed by cooldown or repetition. */
  say(text: string, seconds?: number, loud = 9, force = false): boolean {
    const now = this.shift.time;
    if (!force && (now < this.lineReadyAt || this.recentLines.includes(text))) return false;
    this.recentLines.push(text);
    if (this.recentLines.length > 4) this.recentLines.shift();
    const dur = seconds ?? Math.max(2.2, 1.2 + text.length * 0.055);
    this.lineReadyAt = now + dur * 0.8;
    this.lastLineAt = now;
    this.shift.say(this.id, text, dur, loud);
    if (!this.char.gesture) this.char.playGesture('talk', Math.min(dur, 2.5));
    return true;
  }

  /** Say one of these, preferring lines not used recently; stays quiet rather than repeating itself. */
  sayOne(lines: string[], loud = 9): void {
    if (this.shift.time < this.lineReadyAt) return; // let the last line be read first
    const fresh = lines.filter((l) => !this.recentLines.includes(l));
    if (!fresh.length && this.shift.time - this.lastLineAt < 12) return;
    const pool = fresh.length ? fresh : lines;
    this.say(pool[Math.floor(this.shift.rng.next() * pool.length)], undefined, loud, true);
  }

  // ------------------------------------------------------------ memory
  remember(cat: MemoryCategory, weight = 1): void {
    const m = this.memories.find((x) => x.cat === cat && x.shift === this.shift.shiftNo);
    if (m) m.weight = Math.min(3, m.weight + weight * 0.5);
    else this.memories.push({ cat, shift: this.shift.shiftNo, weight });
    if (this.memories.length > 12) this.memories.shift();
  }

  /** Decayed, capped strength of a memory category from earlier shifts and this one. */
  recall(cat: MemoryCategory): number {
    let s = 0;
    for (const m of this.memories) {
      if (m.cat !== cat) continue;
      const age = this.shift.shiftNo - m.shift;
      s += m.weight * Math.pow(0.6, Math.max(0, age));
    }
    return Math.min(2, s);
  }
  recalledFromEarlier(cat: MemoryCategory): boolean {
    return this.memories.some((m) => m.cat === cat && m.shift < this.shift.shiftNo && this.shift.shiftNo - m.shift <= 3);
  }

  // ------------------------------------------------------------ perception
  canSee(pos: THREE.Vector3, range = 18): boolean {
    const c = this.char;
    if (c.hidden || !c.upright) return false;
    const dx = pos.x - c.pos.x, dz = pos.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 1.2) {
      const f = c.forward(tmp);
      const dot = (dx * f.x + dz * f.z) / d;
      const fov = c.stack.length >= 2 ? 0.75 : 0.12; // a tall stack blocks most of the view
      if (dot < fov) return false;
    }
    return this.shift.phys.los(c.eye(tmp), tmp2.set(pos.x, pos.y + 1.2, pos.z));
  }

  /** Line of sight in any direction (someone checking over their shoulder). */
  canSeeAround(pos: THREE.Vector3, range = 26): boolean {
    const c = this.char;
    if (Math.hypot(pos.x - c.pos.x, pos.z - c.pos.z) > range) return false;
    return this.shift.phys.los(c.eye(tmp), tmp2.set(pos.x, pos.y + 1.2, pos.z));
  }

  canHearShout(from: THREE.Vector3, loud: number): boolean {
    const c = this.char;
    const d = Math.hypot(from.x - c.pos.x, from.z - c.pos.z);
    return d < loud * this.shift.town.hearingFactor(from.x, from.z, c.pos.x, c.pos.z);
  }

  canHear(e: SimEvent): boolean {
    if (!e.loud || !e.pos) return false;
    const c = this.char;
    const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
    return d < e.loud * this.shift.town.hearingFactor(e.pos.x, e.pos.z, c.pos.x, c.pos.z);
  }

  /** Called by the shift for every simulation event this NPC actually perceived. */
  perceive(e: SimEvent, how: 'saw' | 'heard'): void {
    if (e.actor === this.id && e.type !== 'Recovered' && e.type !== 'Reaction') return;
    this.beliefs.push({ type: e.type, time: e.time, how, actor: e.actor, target: e.target, data: e.data });
    if (this.beliefs.length > 60) this.beliefs.shift();
    this.consider(e, how);
  }

  knows(type: string, pred?: (b: Belief) => boolean): Belief | undefined {
    return this.beliefs.find((b) => b.type === type && (!pred || pred(b)));
  }

  // ------------------------------------------------------------ bystander utility scorer
  private consider(e: SimEvent, how: 'saw' | 'heard'): void {
    if (e.actor === this.id || e.target === this.id) return;
    if (this.busy || this.inConversation || !this.char.upright || this.char.restrained) return;
    if (this.shift.time < this.commitUntil) return; // commitment window: no frame-by-frame dithering
    const tier = e.data?.tier as string | undefined;
    const notable = (e.type === 'Reaction' && (tier === 'stumble' || tier === 'knockdown')) || e.type === 'Shout';
    if (!notable || !e.pos) return;
    const t = this.def.traits;
    const d = Math.hypot(e.pos.x - this.char.pos.x, e.pos.z - this.char.pos.z);
    const working = this.planName.includes('work') || this.char.carrying;
    const fall = tier === 'knockdown';
    const helpers = this.shift.helpersAt(e.pos);
    const scores: Record<string, number> = {
      continue: 0.45 + (working ? 0.3 : 0) + (how === 'heard' ? 0.15 : 0),
      look: 0.55 + t.sociability * 0.3,
      help: fall && how === 'saw' && helpers < 1 ? 0.35 + t.sociability * 0.5 - d / 14 - (working ? 0.25 : 0) : 0,
      moveAway: d < 2.5 ? 0.3 + (1 - t.confidence) * 0.5 : 0,
    };
    let best = 'continue';
    for (const k of Object.keys(scores)) if (scores[k] > scores[best]) best = k;
    this.commitUntil = this.shift.time + 4;
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z);
    const subject = e.actor ? this.shift.npcs.get(e.actor) : undefined;
    if (best === 'look') {
      this.char.lookAt(p, 3);
      if (fall && this.shift.rng.chance(0.6)) this.sayOne(['Ooh. That looked sore.', 'Mind yourself!', 'Oof.']);
    } else if (best === 'help' && subject) {
      this.shift.registerHelper(e.pos, this.id);
      this.interrupt('help', [
        { t: 'goto', to: { x: e.pos.x + (this.char.pos.x > e.pos.x ? 1.2 : -1.2), z: e.pos.z + 0.4 }, speed: 2.2, timeout: 6 },
        { t: 'faceAt', x: e.pos.x, z: e.pos.z },
        { t: 'say', text: `You all right, ${subject.def.name}?` },
        { t: 'wait', s: 2.2, gesture: 'reach' },
      ]);
    } else if (best === 'moveAway') {
      const ax = this.char.pos.x - e.pos.x, az = this.char.pos.z - e.pos.z;
      const l = Math.hypot(ax, az) || 1;
      this.transient.fear = Math.min(1, this.transient.fear + 0.3);
      this.interrupt('step_back', [
        { t: 'goto', to: { x: this.char.pos.x + (ax / l) * 1.6, z: this.char.pos.z + (az / l) * 1.6 }, speed: 2, timeout: 2 },
        { t: 'faceAt', x: e.pos.x, z: e.pos.z },
        { t: 'wait', s: 1.5 },
      ]);
    }
  }

  // ------------------------------------------------------------ update
  update(dt: number): void {
    const c = this.char;
    const tr = this.transient;
    tr.fear = Math.max(0, tr.fear - dt * 0.03);
    tr.frustration = Math.max(0, tr.frustration - dt * 0.012);
    tr.embarrassment = Math.max(0, tr.embarrassment - dt * 0.03);
    // a hidden person (e.g. sat in a van) cannot move, but their plan still runs
    if (!c.hidden && c.motion !== 'animated') {
      // physics/reaction owns the body; planning is paused, not advanced
      c.wishSpeed = 0;
      return;
    }
    if (this.inConversation) {
      c.wishSpeed = 0;
      const pl = this.shift.player;
      c.faceYaw = Math.atan2(pl.pos.x - c.pos.x, pl.pos.z - c.pos.z);
      c.lookAt(pl.eye(tmp), 0.5);
      return;
    }
    const p = this.plan;
    if (!p) {
      c.wishSpeed = 0;
      return;
    }
    const s = p.steps[p.i];
    if (!s) {
      this.nextStep();
      return;
    }
    p.stepT += dt;
    switch (s.t) {
      case 'goto':
        this.stepGoto(p, s, dt);
        break;
      case 'face':
        c.wishSpeed = 0;
        c.faceYaw = s.yaw;
        if (p.stepT > 0.5) this.nextStep();
        break;
      case 'faceAt':
        c.wishSpeed = 0;
        c.faceYaw = Math.atan2(s.x - c.pos.x, s.z - c.pos.z);
        if (p.stepT > 0.5) this.nextStep();
        break;
      case 'wait':
        c.wishSpeed = 0;
        if (s.gesture && !c.gesture) c.playGesture(s.gesture, Math.max(0.3, s.s - p.stepT));
        if (p.stepT >= s.s) {
          if (s.gesture && c.gesture === s.gesture) c.playGesture(null);
          this.nextStep();
        }
        break;
      case 'say':
        c.wishSpeed = 0;
        if (!p.started) {
          p.started = true;
          this.say(s.text, s.s, s.loud ?? 9, true);
        }
        if (p.stepT > (s.s ?? Math.max(1.6, 0.9 + s.text.length * 0.045))) this.nextStep();
        break;
      case 'do':
        s.fn();
        if (this.plan === p && p.steps[p.i] === s) this.nextStep();
        break;
      case 'until':
        c.wishSpeed = 0;
        if (s.gesture && !c.gesture) c.playGesture(s.gesture, 2);
        if (s.cond() || (s.timeout !== undefined && p.stepT > s.timeout)) {
          if (s.gesture && c.gesture === s.gesture) c.playGesture(null);
          this.nextStep();
        }
        break;
      case 'loop':
        p.i = 0;
        p.stepT = 0;
        p.path = null;
        p.started = false;
        break;
    }
  }

  private stepGoto(p: Plan, s: Extract<Step, { t: 'goto' }>, dt: number): void {
    const c = this.char;
    const sh = this.shift;
    if (!p.path) {
      p.path = sh.town.nav.path(c.pos, s.to, sh.phys);
      p.pi = 0;
      p.stallT = 0;
      p.stallPos.copy(c.pos);
      if (!p.path || !p.path.length) {
        sh.events.emit({ type: 'RouteFailed', actor: this.id });
        this.nextStep();
        return;
      }
    }
    if (s.timeout !== undefined && p.stepT > s.timeout) {
      c.wishSpeed = 0;
      this.nextStep();
      return;
    }
    const step = p.path[p.pi];
    const last = p.pi === p.path.length - 1;
    // doors: request access, wait for the leaf to clear
    if (step.door && !sh.town.doors.isOpen(step.door)) {
      const dc = sh.town.doors.centre(step.door, tmp);
      const dd = Math.hypot(dc.x - c.pos.x, dc.z - c.pos.z);
      if (dd < 1.5) {
        c.wishSpeed = 0;
        c.faceYaw = Math.atan2(dc.x - c.pos.x, dc.z - c.pos.z);
        if (!sh.town.doors.open(step.door, c.pos, this.id)) {
          // locked: never path through it; give up this leg
          sh.events.emit({ type: 'RouteFailed', actor: this.id, target: step.door });
          this.nextStep();
          return;
        }
        if (!c.gesture) c.playGesture('reach', 0.5);
        return;
      }
    }
    const dx = step.x - c.pos.x, dz = step.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const arrive = last ? s.arrive ?? 0.3 : 0.45;
    if (dist < arrive) {
      p.pi++;
      if (p.pi >= p.path.length) {
        c.wishSpeed = 0;
        this.nextStep();
      }
      return;
    }
    const speed = s.speed ?? this.def.speed;
    tmp.set(dx / dist, 0, dz / dist);
    // lateral wobble (hurrying, or peering round a stack of parcels)
    if (s.wobble && dist > 1.2) {
      const w = Math.sin(sh.time * 2.3 + this.def.id.length) * s.wobble;
      tmp.x += -tmp.z * w * 0.5;
      tmp.z += tmp.x * w * 0.5;
    }
    // local avoidance of other people — unless the view ahead is blocked
    if (!s.blind && c.stack.length < 2) {
      for (const o of sh.chars.values()) {
        if (o === c || o.hidden || !o.upright) continue;
        const ox = o.pos.x - c.pos.x, oz = o.pos.z - c.pos.z;
        const od = Math.hypot(ox, oz);
        if (od > 1.3 || od < 1e-3) continue;
        const ahead = (ox * tmp.x + oz * tmp.z) / od;
        if (ahead < 0.2) continue;
        const sideSign = ox * -tmp.z + oz * tmp.x > 0 ? -1 : 1;
        const k = (1.3 - od) * 1.1;
        tmp.x += -tmp.z * sideSign * k;
        tmp.z += tmp.x * sideSign * k;
      }
    }
    // stall recovery: sidestep, then replan
    p.stallT += dt;
    if (p.stallT > 1.4) {
      const moved = Math.hypot(c.pos.x - p.stallPos.x, c.pos.z - p.stallPos.z);
      p.stallPos.copy(c.pos);
      p.stallT = 0;
      if (moved < 0.25 * Math.min(1, speed)) {
        p.stalls++;
        p.side = -p.side;
        p.sideT = 0.7;
        if (p.stalls === 3) p.path = null; // replan from here
        if (p.stalls === 2 && sh.time > this.excuseAt) {
          // someone standing in the way? ask, rather than shoving
          const pl = sh.player;
          const bx = pl.pos.x - c.pos.x, bz = pl.pos.z - c.pos.z;
          if (Math.hypot(bx, bz) < 1.3 && bx * (step.x - c.pos.x) + bz * (step.z - c.pos.z) > 0) {
            this.excuseAt = sh.time + 8;
            this.sayOne(['Excuse me, officer — could I get past?', 'Sorry, can I squeeze through?', 'Mind if I come by?']);
          }
        }
        if (p.stalls >= 7) {
          sh.events.emit({ type: 'RouteFailed', actor: this.id });
          this.nextStep();
          return;
        }
      } else if (p.stalls > 0) p.stalls--;
    }
    if (p.sideT > 0) {
      p.sideT -= dt;
      const px = -tmp.z * p.side, pz = tmp.x * p.side;
      tmp.x = tmp.x * 0.4 + px;
      tmp.z = tmp.z * 0.4 + pz;
    }
    c.wishDir.copy(tmp).normalize();
    c.wishSpeed = last ? Math.min(speed, Math.max(0.8, dist * 3)) : speed;
    c.faceYaw = null;
  }

  /** Estimated walking distance to a nav node (for route choices). */
  routeLength(to: string): number {
    const nav = this.shift.town.nav;
    const start = nav.nearest(this.char.pos, this.shift.phys);
    const r = nav.route(start.id, to);
    return r ? nav.routeCost(r) + Math.hypot(start.x - this.char.pos.x, start.z - this.char.pos.z) : Infinity;
  }
}
