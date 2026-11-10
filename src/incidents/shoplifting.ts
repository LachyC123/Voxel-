import * as THREE from 'three';
import type { Npc } from '../ai/npc';
import type { Shift } from '../app/shift';
import { F } from '../world/town';
import { DialogueNode, DialogueOption, DispatchCard, Incident, IncidentReport, IncidentState } from './types';

// Corner-shop theft (docs/plan/05 detailed slice). The facts are fixed when the
// scenario is staged: either a tin is taken without payment, or it is bought
// by card while the owner is in the stockroom and she mistakes it for theft.
// Witness accounts come from what each person actually perceived.
type Phase = 'browse' | 'await_mara' | 'taking' | 'inside' | 'leaving' | 'outside' | 'fleeing' | 'stopped' | 'arrested' | 'custody' | 'released' | 'escaped';

const EXITS = ['exit_w_out', 'exit_e_out', 'exit_n_out'];
const TIN = 'tin_01';
const tmp = new THREE.Vector3();

export class ShopliftingIncident implements Incident {
  readonly id = 'shoplifting';
  readonly title = 'Shop theft report';
  state: IncidentState = 'staged';
  readonly variant: 'guilty' | 'innocent';
  readonly who: string;
  phase: Phase = 'browse';
  /** Ground truth, fixed at staging. Dialogue never reads this directly for witnesses. */
  readonly truth = { paid: false, payTime: '', taken: false };
  // what the officer has established
  readonly k = { maraAccount: false, tillChecked: false, receiptSeen: false, juneAsked: false, challenged: false, tinSeen: false };
  propertyReturned = false;
  arrestedOnce = false;
  wrongfulArrest = false;
  handedOver = false;
  cautioned = false;
  explainedToMara = false;
  private sus: Npc;
  private mara: Npc;
  private june: Npc;
  private reportedAt = -1;
  private thinkT = 0;
  private closeT = 0;
  private lastSeen = new THREE.Vector3();
  private fleeExit = '';
  private escortT = 0;
  private tinDropPos: THREE.Vector3 | null = null;
  private susHome = '';
  private maraSaw = false;
  private leaveAt = -1;

  constructor(private shift: Shift) {
    const rng = shift.rng;
    // first shift is the guided one: a clear theft so the chase can be learned
    this.variant = shift.opts.variant ?? (shift.shiftNo === 1 ? 'guilty' : rng.chance(0.5) ? 'guilty' : 'innocent');
    this.who = shift.opts.who ?? (shift.shiftNo === 1 ? 'rhys' : rng.chance(0.5) ? 'toby' : 'rhys');
    this.sus = shift.npc(this.who);
    this.mara = shift.npc('mara');
    this.june = shift.npc('june');
    const other = shift.npc(this.who === 'toby' ? 'rhys' : 'toby');
    other.char.teleport(new THREE.Vector3(shift.town.anchors.green_bench.x, F, shift.town.anchors.green_bench.z), 0);
    shift.ordinaryDay(other);
    // reservation: the involved person is in the shop from the start of the shift
    const A = shift.town.anchors;
    this.sus.char.teleport(new THREE.Vector3(A.browse_a.x, F, A.browse_a.z), A.browse_a.yaw);
    this.sus.setPlan('browse', [
      { t: 'goto', to: { x: A.browse_a.x, z: A.browse_a.z } }, { t: 'face', yaw: A.browse_a.yaw }, { t: 'wait', s: 9 }, { t: 'wait', s: 2.5, gesture: 'reach' },
      { t: 'goto', to: { x: A.browse_b.x, z: A.browse_b.z } }, { t: 'face', yaw: A.browse_b.yaw }, { t: 'wait', s: 8 }, { t: 'wait', s: 4, gesture: 'phone' },
      { t: 'loop' },
    ]);
    shift.items.create(TIN, 'shortbread_tin', { owner: 'mara', price: 6.5 });
    shift.items.place(TIN, 'shop_shelf', new THREE.Vector3(A.tin_shelf.x, F + 1.02, A.tin_shelf.z - 0.78), shift.chars);

    // contextual actions on the involved person while a pursuit is possible
    shift.npcAction.set(this.who, () => {
      if (this.phase !== 'fleeing') return null;
      if (!this.sus.char.upright) return null;
      return { label: 'Detain', run: () => this.detain() };
    });
    shift.interactables.push({
      id: 'callout', name: `${this.sus.def.name}`, range: 18,
      pos: (o) => this.sus.char.centre(o).setY(this.sus.char.pos.y + 1.3),
      action: () => {
        if (this.state !== 'reported' && this.state !== 'active') return null;
        if (this.phase !== 'fleeing' && this.phase !== 'outside') return null;
        const d = this.sus.char.pos.distanceTo(shift.player.pos);
        if (d < (this.phase === 'fleeing' ? 1.8 : 2.8) || !shift.playerCanSee(this.sus.char.pos)) return null;
        return { label: 'Call out: “Police — stop there!”', run: () => this.callOut() };
      },
    });
    shift.interactables.push({
      id: 'tin', name: 'Tin of shortbread', range: 2.2,
      pos: (o) => shift.items.worldPos(TIN, o),
      action: () => {
        if (shift.items.get(TIN).state !== 'world') return null;
        const kit = shift.career.data.belt.includes('evidence_kit');
        return { label: kit ? 'Bag and tag' : 'Pick up', run: () => this.collectTin(kit) };
      },
    });
    this.sus.onRecovered = (from) => this.susRecovered(from);
    shift.events.on('ItemDropped', (e) => {
      if (e.target !== TIN) return;
      this.tinDropPos = shift.items.worldPos(TIN).clone();
      if (shift.playerCanSee(shift.items.worldPos(TIN, tmp))) {
        const room = shift.town.roomAt(tmp.x, tmp.z).name;
        shift.casebook.add('shop_drop', this.id, 'lead', `${this.sus.def.name} dropped a tin in ${room}.`);
      }
    });
  }

  // ------------------------------------------------------------ staging
  update(dt: number): void {
    const sh = this.shift;
    const sus = this.sus;
    const pl = sh.player;
    switch (this.phase) {
      case 'browse': {
        const p = sh.parking!;
        const ready = sh.flow.stage === 'patrol' && ((p.engaged && sh.time - p.engagedAt > 30) || sh.time - sh.flow.briefedAt > 170);
        const maraSettled = p.maraAtTillSince > 0 && sh.time - p.maraAtTillSince > 3;
        const glenClear = sh.town.roomAt(sh.npc('glen').char.pos.x, sh.npc('glen').char.pos.z).id !== 'shop_sales';
        if (ready && maraSettled && glenClear && !this.mara.inConversation && this.mara.planName === 'work_till') {
          const A = sh.town.anchors;
          // Mara steps into the back to check the delivery: she cannot see the till from there
          this.mara.interrupt('check_delivery', [
            { t: 'goto', to: { x: A.mara_stock.x, z: A.mara_stock.z } }, { t: 'face', yaw: A.mara_stock.yaw },
            { t: 'wait', s: 13, gesture: 'restock' },
            { t: 'goto', to: 'sh_till' }, { t: 'face', yaw: A.mara_till.yaw },
          ]);
          this.phase = 'await_mara';
        }
        break;
      }
      case 'await_mara':
        if (sh.town.roomAt(this.mara.char.pos.x, this.mara.char.pos.z).id === 'shop_stock') {
          const A = sh.town.anchors;
          sus.busy = true;
          sus.setPlan('take', [
            { t: 'goto', to: 'sh_tin' }, { t: 'face', yaw: A.tin_shelf.yaw },
            { t: 'wait', s: 1.2, gesture: 'reach' },
            { t: 'do', fn: () => this.take() },
          ]);
          this.phase = 'taking';
        }
        break;
      case 'inside':
        // leaves once the owner is back on the shop floor (or after a while regardless)
        if (this.leaveAt < 0 && sh.town.roomAt(this.mara.char.pos.x, this.mara.char.pos.z).id === 'shop_sales' && !this.mara.hasPlan('check_delivery')) this.leaveAt = sh.time + 1.5;
        if (this.leaveAt < 0 && sh.time - this.reportedAtOrStart() > 40) this.leaveAt = sh.time;
        if (this.leaveAt > 0 && sh.time >= this.leaveAt && sus.planName === 'linger') {
          this.phase = 'leaving';
          sus.setPlan('leave', [
            { t: 'goto', to: 'sh_door', speed: 1.5 }, { t: 'goto', to: 'pv_shop', speed: 1.5 },
            { t: 'do', fn: () => this.outside() },
          ]);
        }
        break;
      case 'leaving':
      case 'outside':
        this.maraWatch();
        if (this.phase === 'outside') this.outsideThink(dt);
        break;
      case 'fleeing':
        this.fleeThink(dt);
        break;
      case 'arrested':
        this.escort(dt);
        break;
    }
    // evidence must stay recoverable: restore a tin that has left the playable floor
    const tin = sh.items.get(TIN);
    if (tin.state === 'world') {
      const p = sh.items.worldPos(TIN, tmp);
      if (p.y < -1 || !Number.isFinite(p.y)) {
        const at = this.tinDropPos ?? pl.pos;
        sh.items.drop(TIN, sh.chars, undefined, new THREE.Vector3(at.x, F + 0.4, at.z));
        sh.events.emit({ type: 'EvidenceRestored', target: TIN });
      }
    }
  }

  private reportedAtOrStart(): number {
    return this.takeTime;
  }
  private takeTime = 0;

  private take(): void {
    const sh = this.shift;
    const sus = this.sus;
    const A = sh.town.anchors;
    sh.items.giveHeld(TIN, sus.char, sh.chars);
    sus.char.dropChance = 0.65;
    this.truth.taken = true;
    this.takeTime = sh.time;
    sh.events.emit({ type: 'TookItem', actor: sus.id, target: TIN, pos: sus.char.pos.clone(), visible: true, data: { place: 'shelf' } });
    if (this.variant === 'innocent') {
      sus.setPlan('pay', [
        { t: 'goto', to: 'sh_pay' }, { t: 'face', yaw: A.customer_pay.yaw },
        { t: 'wait', s: 2.6, gesture: 'tap' },
        {
          t: 'do', fn: () => {
            this.truth.paid = true;
            this.truth.payTime = '14:02';
            sh.items.get(TIN).meta.paid = true;
            sh.host.sound('beep', 0.4);
            sh.events.emit({ type: 'PaidAtTill', actor: sus.id, target: TIN, pos: sus.char.pos.clone(), visible: true, loud: 5, data: { method: 'card', amount: 6.5 } });
          },
        },
        { t: 'wait', s: 1.0 },
        { t: 'do', fn: () => this.linger() },
      ]);
    } else {
      this.linger();
    }
    this.phase = 'inside';
  }

  private linger(): void {
    const A = this.shift.town.anchors;
    this.sus.setPlan('linger', [
      { t: 'goto', to: { x: A.browse_c.x, z: A.browse_c.z } }, { t: 'face', yaw: A.browse_c.yaw },
      { t: 'wait', s: 2.5, gesture: this.variant === 'guilty' ? 'lookAround' : 'phone' },
      { t: 'until', cond: () => false },
    ]);
  }

  /** The owner only raises the alarm if she actually sees the tin leaving. */
  private maraWatch(): void {
    if (this.maraSaw || this.state !== 'staged') return;
    const sh = this.shift;
    const sus = this.sus;
    if (sus.char.held !== TIN) return;
    const d = sus.char.pos.distanceTo(this.mara.char.pos);
    if (d > 15) {
      // she never noticed: no report is generated from information nobody had
      if (this.phase === 'outside' && d > 22) this.state = 'unattended';
      return;
    }
    if (!this.mara.canSee(sus.char.pos, 15) || this.mara.inConversation) return;
    this.maraSaw = true;
    this.mara.busy = true;
    this.mara.beliefs.push({ type: 'LeftWithItem', time: sh.time, how: 'saw', actor: sus.id, target: TIN });
    this.mara.interrupt('raise_alarm', [
      { t: 'goto', to: { x: 0, z: -2.7 }, speed: 2.6, timeout: 7 },
      { t: 'faceAt', x: sus.char.pos.x, z: sus.char.pos.z },
      { t: 'say', text: 'Oi! Excuse me! That has not been paid for!', loud: 20, s: 2.2 },
      { t: 'wait', s: 0.8, gesture: 'point' },
      { t: 'do', fn: () => this.raiseReport() },
      { t: 'until', cond: () => this.k.maraAccount || this.shift.time - this.reportedAt > 50, gesture: 'fold' },
      { t: 'do', fn: () => { this.mara.busy = false; } },
    ]);
  }

  private raiseReport(): void {
    if (this.state !== 'staged') return;
    const sh = this.shift;
    this.state = 'reported';
    this.reportedAt = sh.time;
    sh.events.emit({ type: 'IncidentReported', target: this.id });
    // dispatch relays only what was reported
    sh.radio(`Control to four-one-seven: Mara’s Corner Store reports a customer has just left with goods she did not ring up. Owner is at the shop door.`);
    // the person hears the shout (if in earshot) and reacts in character
    const sus = this.sus;
    const heard = sus.knows('Shout', (b) => b.actor === 'mara');
    if (!heard) return;
    if (this.variant === 'innocent' && this.phase === 'outside') {
      sus.setPlan('confused', [
        { t: 'faceAt', x: 0, z: -2 },
        { t: 'wait', s: 1.6, gesture: 'shrug' },
        { t: 'say', text: 'Me? I — I paid for this!', loud: 14 },
        { t: 'until', cond: () => sus.inConversation, timeout: 28, gesture: 'lookAround' },
        { t: 'do', fn: () => this.wanderOff() },
      ]);
    }
  }

  private outside(): void {
    const sh = this.shift;
    this.phase = 'outside';
    sh.events.emit({ type: 'LeftWithItem', actor: this.sus.id, target: TIN, pos: this.sus.char.pos.clone(), visible: true });
    if (this.variant === 'innocent') this.wanderOff();
    else this.briskAway();
  }

  /** Innocent: an ordinary walk to the green. */
  private wanderOff(): void {
    const A = this.shift.town.anchors;
    if (this.phase !== 'outside') return;
    this.sus.setPlan('walk_home', [
      { t: 'goto', to: { x: A.green_bench.x, z: A.green_bench.z } }, { t: 'face', yaw: 0 },
      { t: 'wait', s: 20, gesture: 'phone' }, { t: 'wait', s: 6 }, { t: 'loop' },
    ]);
  }

  /**
   * Guilty: act casual out of the door, duck into Cobb's Passage to check nobody
   * is following, then slip out by the back way. Bolts if an officer closes in.
   */
  private briskAway(): void {
    const pace = (): number => (this.state === 'staged' ? 1.3 : 2.0);
    const leg = (to: string): { t: 'goto'; to: string; speed: number; arrive: number } => ({ t: 'goto' as const, to, get speed() { return pace(); }, arrive: 0.5 });
    this.fleeExit = 'exit_n_out';
    this.sus.setPlan('brisk', [
      leg('pv_cp'), leg('cp_s'), leg('cp_m'),
      { t: 'wait', s: 4, gesture: 'lookAround' },
      { t: 'wait', s: 5, gesture: 'phone' },
      { t: 'wait', s: 3, gesture: 'lookAround' },
      {
        t: 'do', fn: () => {
          const exit = this.pickExit();
          this.fleeExit = exit;
          const nav = this.shift.town.nav;
          const start = nav.nearest(this.sus.char.pos, this.shift.phys);
          const ids = nav.route(start.id, exit) ?? [exit];
          this.sus.setPlan('brisk', [...ids.slice(1).map((id) => leg(id)), { t: 'do', fn: () => this.escapedNow() }]);
        },
      },
    ]);
  }

  private outsideThink(dt: number): void {
    if (this.variant !== 'guilty' || this.state === 'staged') return;
    const sh = this.shift;
    const sus = this.sus;
    if (sus.inConversation) return;
    // bolts when an officer is plainly coming for them
    const d = sus.char.pos.distanceTo(sh.player.pos);
    if (d < 8 && sus.canSeeAround(sh.player.pos)) {
      this.closeT += dt;
      if (this.closeT > 0.5 || d < 4) this.startFlee(false);
    } else this.closeT = 0;
  }

  // ------------------------------------------------------------ pursuit
  private pickExit(): string {
    const sh = this.shift;
    const nav = sh.town.nav;
    const pl = this.lastSeen.lengthSq() ? this.lastSeen : sh.player.pos;
    const start = nav.nearest(this.sus.char.pos, sh.phys);
    let best = EXITS[0];
    let bestScore = Infinity;
    for (const ex of EXITS) {
      const r = nav.route(start.id, ex, { x: pl.x, z: pl.z, radius: 9, penalty: 60 });
      if (!r) continue;
      let cost = 0;
      // route cost including the penalty for passing near the officer's last known position
      for (let i = 0; i + 1 < r.length; i++) {
        const a = nav.nodes.get(r[i])!, b = nav.nodes.get(r[i + 1])!;
        cost += Math.hypot(a.x - b.x, a.z - b.z);
        const dd = Math.hypot(b.x - pl.x, b.z - pl.z);
        if (dd < 9) cost += 60 * (1 - dd / 9);
      }
      const en = nav.nodes.get(ex)!;
      const officerToExit = Math.hypot(en.x - pl.x, en.z - pl.z);
      const score = cost - officerToExit * 0.6 + (ex === this.fleeExit ? -6 : 0);
      if (score < bestScore) { bestScore = score; best = ex; }
    }
    return best;
  }

  private startFlee(replanOnly: boolean): void {
    const sh = this.shift;
    const sus = this.sus;
    if (!replanOnly) {
      if (this.phase === 'fleeing') return;
      this.phase = 'fleeing';
      if (this.state === 'reported') this.state = 'active';
      sus.busy = true;
      sus.char.staminaTime = 11;
      sus.char.accel = 14;
      sh.events.emit({ type: 'SuspectFled', actor: sus.id, pos: sus.char.pos.clone(), visible: true, loud: 6 });
      sh.casebook.add('shop_fled', this.id, 'fact', `${sus.def.name} ran when approached.`);
    }
    this.lastSeen.copy(sh.player.pos);
    const exit = this.pickExit();
    this.fleeExit = exit;
    const nav = sh.town.nav;
    const pl = this.lastSeen;
    // the route itself avoids the officer's perceived position
    const start = nav.nearest(sus.char.pos, sh.phys);
    const ids = nav.route(start.id, exit, { x: pl.x, z: pl.z, radius: 9, penalty: 60 }) ?? [exit];
    const steps = ids.slice(1).map((id) => ({ t: 'goto' as const, to: id, speed: 5.0, wobble: 0.5, arrive: 0.6 }));
    sus.setPlan('flee', [...steps, { t: 'do', fn: () => this.escapedNow() }]);
  }

  private fleeThink(dt: number): void {
    const sh = this.shift;
    const sus = this.sus;
    const pl = sh.player;
    if (!sus.char.upright || sus.char.motion !== 'animated') return;
    const d = sus.char.pos.distanceTo(pl.pos);
    const sees = sus.canSeeAround(pl.pos);
    if (sees) this.lastSeen.copy(pl.pos);
    // out of puff with the officer on top of them: gives up
    if (sus.char.tired > 0.5 && d < 5 && sees) {
      this.surrender('I can’t— okay. Okay. I’m stopping.');
      return;
    }
    // ditch the goods if the officer is right behind
    if (sus.char.held === TIN && d < 4.2 && sees) {
      this.closeT += dt;
      if (this.closeT > 1.3) {
        const f = sus.char.forward(tmp);
        sh.items.drop(TIN, sh.chars, new THREE.Vector3(-f.z * 2.2, 1.2, f.x * 2.2));
        sh.events.emit({ type: 'ItemDropped', actor: sus.id, target: TIN, pos: sus.char.pos.clone(), visible: true, loud: 6, data: { deliberate: true } });
        sus.say('Have it, then!', 1.6, 14, true);
        this.closeT = 0;
      }
    } else this.closeT = Math.max(0, this.closeT - dt);
    // reconsider the route every so often, or when the plan was lost to an interruption
    this.thinkT -= dt;
    if (sus.planName !== 'flee' && sus.planName !== 'acknowledge') this.startFlee(true);
    else if (this.thinkT <= 0) {
      this.thinkT = 2.5;
      if (sees && this.pickExit() !== this.fleeExit) this.startFlee(true);
    }
  }

  private susRecovered(from: string): boolean {
    if (this.phase !== 'fleeing') return false;
    const sh = this.shift;
    const d = this.sus.char.pos.distanceTo(sh.player.pos);
    this.sus.dropped = []; // abandons whatever fell: stopping for it means getting caught
    if (sh.items.get(TIN).state === 'world') sh.events.emit({ type: 'ItemAbandoned', actor: this.sus.id, target: TIN, data: { reason: 'fleeing' } });
    if ((from === 'fall' && d < 4.5) || (from === 'stumble' && d < 2.2)) {
      this.surrender(from === 'fall' ? 'All right! All right. I’m done. Ow.' : 'Okay! Okay. You got me.');
      return true;
    }
    this.startFlee(true);
    return true;
  }

  private callOut(): void {
    const sh = this.shift;
    sh.say('player', 'Police! Stop there!', 2, 22);
    sh.player.playGesture('point', 1);
    this.k.challenged = true;
    const sus = this.sus;
    if (!sus.canHearShout(sh.player.pos, 22)) return;
    if (this.variant === 'innocent') {
      if (this.phase === 'outside') {
        sus.setPlan('wait_for_officer', [
          { t: 'faceAt', x: sh.player.pos.x, z: sh.player.pos.z },
          { t: 'wait', s: 1.2, gesture: 'handsUp' },
          { t: 'say', text: 'Me?! What — what did I do?' },
          { t: 'until', cond: () => sus.inConversation, timeout: 40 },
          { t: 'do', fn: () => this.wanderOff() },
        ]);
      }
      return;
    }
    if (this.phase === 'outside') this.startFlee(false);
    else if (this.phase === 'fleeing' && sus.char.stamina < 0.3 && sus.char.pos.distanceTo(sh.player.pos) < 7) this.surrender('Fine! Fine. Stopping.');
  }

  private detain(): void {
    const sh = this.shift;
    const sus = this.sus;
    if (sus.char.pos.distanceTo(sh.player.pos) > 2.0) return;
    sh.player.playGesture('reach', 0.6);
    const dir = tmp.subVectors(sus.char.pos, sh.player.pos).setY(0).normalize();
    sus.char.flinch(dir, 1.2);
    sh.host.sound('bump', 0.6);
    this.surrender('Okay! Okay! Get off — I’m stopping.');
  }

  private surrender(line: string): void {
    if (this.phase !== 'fleeing') return;
    const sus = this.sus;
    this.phase = 'stopped';
    this.state = 'stabilised';
    sus.char.accel = 9;
    // gave up past the edge of the beat? come back within reach of the officer
    const p = sus.char.pos;
    const back = p.x < -43.6 ? 'pv_w' : p.x > 29.4 ? 'pv_e2' : p.z < -26.6 ? 'fp_m' : null;
    sus.setPlan('stopped', [
      { t: 'say', text: line, loud: 12 },
      ...(back ? [{ t: 'goto' as const, to: back, speed: 1.6, timeout: 12 }] : []),
      { t: 'faceAt', x: this.shift.player.pos.x, z: this.shift.player.pos.z },
      { t: 'until', cond: () => false, gesture: 'handsUp', timeout: 3 },
      { t: 'until', cond: () => false },
    ]);
    this.shift.events.emit({ type: 'SuspectStopped', actor: sus.id, pos: sus.char.pos.clone(), visible: true });
    this.shift.casebook.add('shop_stopped', this.id, 'fact', `${sus.def.name} was stopped after a chase.`);
  }

  private escapedNow(): void {
    if (this.phase !== 'fleeing' && this.phase !== 'outside') return;
    const sh = this.shift;
    const sus = this.sus;
    const wasReported = this.state !== 'staged' && this.state !== 'unattended';
    this.phase = 'escaped';
    sus.char.setHidden(true);
    sus.setPlan('gone', [{ t: 'until', cond: () => false }]);
    if (!wasReported) {
      this.state = 'unattended';
      return;
    }
    this.state = 'escaped';
    sh.events.emit({ type: 'SuspectEscaped', actor: sus.id });
    sh.casebook.add('shop_escaped', this.id, 'lead', `${sus.def.name} left the beat on foot. Description circulated.`);
    sh.radio('Four-one-seven, received. Suspect lost off your beat. Recover what you can and update the owner.');
  }

  private collectTin(bagged: boolean): void {
    const sh = this.shift;
    if (sh.items.get(TIN).state !== 'world') return; // idempotent: cannot collect twice
    sh.player.playGesture('pickup', 0.9);
    sh.items.store(TIN, 'officer', sh.chars);
    if (!sh.carried.includes(TIN)) sh.carried.push(TIN);
    sh.events.emit({ type: 'EvidenceCollected', actor: 'player', target: TIN, data: { bagged } });
    sh.casebook.add('shop_tin', this.id, 'fact', `Recovered a tin of shortbread${bagged ? ' (bagged and tagged)' : ''}.`);
    if (bagged) sh.grant('shop_bagged', 5, 'Evidence bagged and tagged');
    sh.host.sound('pickup');
  }

  private takeTinFromSuspect(): void {
    const sh = this.shift;
    if (this.sus.char.held !== TIN) return;
    sh.items.store(TIN, 'officer', sh.chars);
    if (!sh.carried.includes(TIN)) sh.carried.push(TIN);
    sh.events.emit({ type: 'EvidenceCollected', actor: 'player', target: TIN, data: { from: this.sus.id } });
    sh.casebook.add('shop_tin', this.id, 'fact', `Took possession of a tin of shortbread from ${this.sus.def.name}.`);
  }

  private escort(dt: number): void {
    const sh = this.shift;
    const sus = this.sus;
    this.escortT -= dt;
    if (this.escortT > 0 || sus.inConversation) return;
    this.escortT = 0.45;
    const d = sus.char.pos.distanceTo(sh.player.pos);
    if (d > 2.0) {
      const sp = Math.min(3.6, Math.max(1.4, sh.player.speed + 0.6 + (d > 5 ? 1 : 0)));
      sus.setPlan('escort', [{ t: 'goto', to: { x: sh.player.pos.x, z: sh.player.pos.z }, arrive: 1.5, speed: sp, timeout: 4 }]);
    }
  }

  // ------------------------------------------------------------ outcomes
  private arrest(): DialogueNode | null {
    const sh = this.shift;
    const sus = this.sus;
    this.arrestedOnce = true;
    if (this.variant === 'innocent') this.wrongfulArrest = true;
    this.takeTinFromSuspect();
    sus.char.restrained = true;
    sus.busy = true;
    this.phase = 'arrested';
    this.state = 'stabilised';
    sus.setPlan('escort', [{ t: 'wait', s: 0.5 }]);
    sh.events.emit({ type: 'PersonRestrained', actor: 'player', target: sus.id, pos: sus.char.pos.clone(), visible: true });
    sh.casebook.add('shop_arrest', this.id, 'fact', `${sus.def.name} arrested on suspicion of theft. Escort to the station and hand over to Sgt Bell.`);
    sh.host.sound('cuffs');
    return sh.node(sus.id, this.variant === 'innocent'
      ? 'What?! I have the receipt! Please — just look at the till!'
      : 'Fine. Fine. It was only biscuits.');
  }

  private release(apology: boolean): DialogueNode | null {
    const sh = this.shift;
    const sus = this.sus;
    const wasArrested = this.phase === 'arrested';
    sus.char.restrained = false;
    sus.busy = false;
    this.phase = 'released';
    if (this.variant === 'innocent') {
      // their property goes back with them
      if (sh.items.get(TIN).state === 'stored' && sh.items.get(TIN).place === 'officer') {
        sh.items.giveHeld(TIN, sus.char, sh.chars);
        sh.carried.splice(sh.carried.indexOf(TIN), 1);
      }
      if (wasArrested) sus.remember('wrongly_accused');
      else if (this.k.receiptSeen || this.k.tillChecked) sus.remember('helped', 0.5);
      this.phase = 'outside';
      this.wanderOff();
      this.phase = 'released';
      return sh.node(sus.id, wasArrested ? 'Can I go? Can I… have my biscuits back?' : apology ? 'Oh. Good. Okay. Thanks. I thought I was going to prison.' : 'Right. Okay. Bye.', [], true);
    }
    // guilty
    const recovered = sus.char.held !== TIN;
    this.cautioned = recovered;
    const exit = this.pickExit();
    sus.setPlan('slope_off', [{ t: 'goto', to: exit, speed: 1.9 }, { t: 'do', fn: () => sus.char.setHidden(true) }]);
    if (recovered) {
      this.state = 'resolved';
      sh.grant('shop_resolve', 40, 'Theft dealt with by words of advice; property recovered');
      this.evidenceBonus();
      sh.casebook.add('shop_caution', this.id, 'fact', `${sus.def.name} admitted taking the tin and was released with words of advice.`);
      return sh.node(sus.id, 'Yeah. All right. Won’t happen again. Probably.', [], true);
    }
    this.state = 'resolved';
    sh.casebook.add('shop_released', this.id, 'fact', `${sus.def.name} was released still holding the tin.`);
    return sh.node(sus.id, 'Cheers, officer. Very understanding.', [], true);
  }

  private evidenceBonus(): void {
    const k = this.k;
    const n = Number(k.tillChecked) + Number(k.juneAsked) + Number(k.maraAccount);
    if (n >= 2) this.shift.grant('shop_evidence', 10, 'Outcome supported by evidence');
  }

  private handover(): DialogueNode | null {
    const sh = this.shift;
    const sus = this.sus;
    if (this.variant === 'innocent') {
      // custody check uses records the officer could have checked too
      sus.char.restrained = false;
      this.handedOver = true;
      this.phase = 'released';
      this.state = 'resolved';
      sus.remember('wrongly_accused', 2);
      this.mara.remember('wrongly_accused', 0.5);
      sh.trust('shop_wrongful', -8, `Arrested ${sus.def.name} without checking the receipt or the till roll.`);
      if (sh.items.get(TIN).place === 'officer') {
        sh.items.giveHeld(TIN, sus.char, sh.chars);
        sh.carried.splice(sh.carried.indexOf(TIN), 1);
      }
      sus.busy = false;
      const A = sh.town.anchors;
      sus.setPlan('walk_home', [
        { t: 'wait', s: 2 }, { t: 'say', text: 'Can I go? I have a lecture.' },
        { t: 'goto', to: { x: A.green_bench.x, z: A.green_bench.z } }, { t: 'until', cond: () => false, gesture: 'phone' },
      ]);
      sh.casebook.add('shop_custody', this.id, 'fact', `Custody check: the till roll shows a card payment at ${this.truth.payTime} for one shortbread tin. ${sus.def.name} released without charge.`);
      return sh.node('sgt', `Hold on. Did you check the till? …I have just rung the shop. Card payment, ${this.truth.payTime}, one shortbread tin. He paid. Take those cuffs off him, apologise, and next time look before you leap.`, [], true);
    }
    this.handedOver = true;
    this.phase = 'custody';
    this.state = 'handed_over';
    sus.setPlan('custody', [{ t: 'goto', to: 'st_e' }, { t: 'face', yaw: -Math.PI / 2 }, { t: 'until', cond: () => false }]);
    sh.events.emit({ type: 'PersonHandedOver', actor: 'player', target: sus.id });
    sh.grant('shop_resolve', 40, 'Suspect arrested and handed over');
    this.evidenceBonus();
    const supported = this.k.maraAccount || this.k.tillChecked || sh.casebook.has('shop_tin');
    return sh.node('sgt', supported
      ? `Shop theft? Right, ${sus.def.name}, through here. Good work, constable. ${this.propertyReturned ? '' : 'Get that tin back to the owner if you have not already.'}`
      : 'I will take him — but you have brought me a body and not much else. Go and get the owner’s account and check that till roll.', [], true);
  }

  private returnTin(): DialogueNode | null {
    const sh = this.shift;
    if (this.propertyReturned || !sh.carried.includes(TIN)) return null;
    this.propertyReturned = true; // once: no repeated reward for the same item
    sh.carried.splice(sh.carried.indexOf(TIN), 1);
    const A = sh.town.anchors;
    sh.items.place(TIN, 'shop_shelf', new THREE.Vector3(A.tin_shelf.x, F + 1.02, A.tin_shelf.z - 0.78), sh.chars);
    this.mara.remember('property_recovered');
    sh.events.emit({ type: 'PropertyReturned', actor: 'player', target: TIN });
    sh.casebook.add('shop_returned', this.id, 'fact', 'Shortbread tin returned to the shop.');
    const escaped = this.phase === 'escaped';
    sh.grant('shop_property', escaped ? 25 : 10, 'Property returned to its owner');
    sh.trust('shop_property_trust', 2, 'Returned stolen property.');
    if (escaped && this.state === 'escaped') this.state = 'resolved';
    return sh.node('mara', escaped
      ? 'You got it back! Dented, but back. Shame about him, but thank you.'
      : 'Oh, well done. Back on the shelf it goes. Thank you, officer.');
  }

  // ------------------------------------------------------------ dialogue
  options(npcId: string): DialogueOption[] {
    const sh = this.shift;
    const out: DialogueOption[] = [];
    const reported = this.state !== 'staged' && this.state !== 'unattended';
    if (!reported) return out;
    const sus = this.sus;
    const name = sus.def.name;
    if (npcId === 'mara') {
      out.push({
        label: this.k.maraAccount ? 'Go over what you saw again.' : 'What did you see?',
        run: () => {
          this.k.maraAccount = true;
          sh.casebook.add('shop_mara', this.id, 'claim', `She saw ${name} walk out carrying a shortbread tin she had not rung up. She had been in the stockroom checking a delivery just before.`, 'Mara');
          return sh.node('mara', sh.repeatable(this.mara, 'saw', `${name}. Walked straight out with one of my shortbread tins, and I never rang it up. I had only been in the back two minutes checking Glen’s delivery.`));
        },
      });
      out.push({
        label: 'May I check the till roll?',
        run: () => {
          this.k.tillChecked = true;
          if (this.truth.paid) {
            sh.casebook.add('shop_till', this.id, 'fact', `Till roll: card payment at ${this.truth.payTime}, £6.50, one shortbread tin — made at the counter card reader while the owner was in the stockroom.`);
            return sh.node('mara', `Help yourself. …Oh. ${this.truth.payTime}, card, six-fifty, shortbread. That will be the card reader. I never hear it beep from the back.`);
          }
          sh.casebook.add('shop_till', this.id, 'fact', 'Till roll: no shortbread sale today. Last sale 13:47 — milk and a newspaper.');
          return sh.node('mara', 'Help yourself. See? Last sale thirteen forty-seven, milk and a paper. No shortbread.');
        },
      });
      if (sh.carried.includes(TIN) && !this.propertyReturned && this.variant === 'guilty') {
        out.push({ label: 'Here is your shortbread tin.', action: true, run: () => this.returnTin() });
      }
      if (this.variant === 'innocent' && (this.k.tillChecked || this.k.receiptSeen) && !this.explainedToMara) {
        out.push({
          label: 'It was a misunderstanding. He paid by card while you were in the back.', action: true,
          run: () => {
            this.explainedToMara = true;
            if (!this.wrongfulArrest || !this.handedOver) {
              this.state = 'resolved';
              sh.grant('shop_resolve', 40, 'Misunderstanding resolved');
              sh.grant('shop_evidence', this.k.tillChecked && this.k.receiptSeen ? 20 : 10, 'Checked the record before acting');
              if (!this.arrestedOnce) {
                sus.remember('helped');
                sh.trust('shop_fair', 3, 'Cleared an innocent customer.');
              }
            }
            this.mara.remember('helped', 0.5);
            return sh.node('mara', `Oh, the poor lad. And I shouted at him in the street. Tell ${name} the next tin is on me.`);
          },
        });
      }
    }
    if (npcId === 'june') {
      out.push({
        label: this.k.juneAsked ? 'Tell me again what you saw.' : 'Did you see what happened in the shop?',
        run: () => {
          this.k.juneAsked = true;
          return sh.node('june', sh.repeatable(this.june, 'saw', this.juneStatement()));
        },
      });
    }
    if (npcId === sus.id && this.phase !== 'custody' && this.phase !== 'escaped') {
      const arrested = this.phase === 'arrested';
      const holding = sus.char.held === TIN;
      if (!arrested && this.phase !== 'released') {
        out.push({
          label: 'The shop owner says you left without paying.',
          run: () => {
            this.k.challenged = true;
            if (this.variant === 'innocent') return sh.node(sus.id, sh.repeatable(sus, 'accuse', 'What? No! I paid — the card machine on the counter. There was nobody at the till. I have the receipt somewhere, hang on…'));
            if (this.phase === 'outside') {
              // talking range, not yet running: this is the moment they bolt
              sus.say('…Yeah, no.', 1.4, 12, true);
              this.startFlee(false);
              return null;
            }
            return sh.node(sus.id, sh.repeatable(sus, 'accuse', 'She is mistaken. I was going to go back in and pay. Obviously.'));
          },
        });
        out.push({
          label: 'What have you got there?',
          run: () => {
            if (holding) {
              this.k.tinSeen = true;
              sh.casebook.add('shop_possession', this.id, 'fact', `${name} is carrying a tin of shortbread.`);
              return sh.node(sus.id, this.variant === 'innocent' ? 'Shortbread. For my nan. It was six pounds fifty, which is honestly a bit steep.' : 'This? It is… a tin. Of biscuits. Found it.');
            }
            return sh.node(sus.id, this.variant === 'guilty' ? 'Nothing. See? Nothing.' : 'Nothing now. You have my biscuits.');
          },
        });
        out.push({
          label: 'Can I see your receipt?',
          run: () => {
            if (this.variant === 'innocent') {
              this.k.receiptSeen = true;
              sh.casebook.add('shop_receipt', this.id, 'fact', `${name} produced a card receipt: Mara’s Corner Store, ${this.truth.payTime}, £6.50, 1 × shortbread tin.`);
              sus.char.playGesture('reach', 1.2);
              return sh.node(sus.id, `Here — here. Look. ${this.truth.payTime}. Six-fifty. Shortbread tin. Card.`);
            }
            sh.casebook.add('shop_noreceipt', this.id, 'claim', 'Says the receipt was dropped.', name);
            return sh.node(sus.id, sh.repeatable(sus, 'receipt', 'Must have dropped it. Running. I mean walking.'));
          },
        });
        if (this.variant === 'guilty' && this.phase === 'stopped' && holding) {
          out.push({
            label: 'Hand over the tin, please.', action: true,
            run: () => {
              this.takeTinFromSuspect();
              return sh.node(sus.id, 'Take it. It is not even the good shortbread.');
            },
          });
        }
        out.push({ label: 'I am arresting you on suspicion of theft.', action: true, run: () => this.arrest() });
        if (this.phase === 'stopped' || this.variant === 'innocent') {
          out.push({ label: this.variant === 'innocent' && (this.k.receiptSeen || this.k.tillChecked) ? 'That clears it up. Sorry for the trouble.' : 'You are free to go.', run: () => this.release(true) });
        }
      } else if (arrested) {
        out.push({ label: 'I am de-arresting you. You are free to go.', action: true, run: () => this.release(false) });
        if (this.variant === 'innocent') {
          out.push({
            label: 'Show me this receipt, then.',
            run: () => {
              this.k.receiptSeen = true;
              sh.casebook.add('shop_receipt', this.id, 'fact', `${name} produced a card receipt: Mara’s Corner Store, ${this.truth.payTime}, £6.50, 1 × shortbread tin.`);
              return sh.node(sus.id, `Back pocket. There. ${this.truth.payTime}, six-fifty, shortbread. I told you!`);
            },
          });
        }
      }
    }
    if (npcId === 'sgt' && this.phase === 'arrested') {
      const near = sus.char.pos.distanceTo(sh.npc('sgt').char.pos) < 8;
      out.unshift({
        label: near ? `Detainee for you, Sergeant: ${name}, suspected shop theft.` : `(${name} must be with you to hand over.)`,
        action: near,
        run: () => (near ? this.handover() : sh.node('sgt', 'Where is your prisoner, constable? Bring them in with you.')),
      });
    }
    return out;
  }

  /** June reports only what she perceived, with her usual vagueness about time. */
  private juneStatement(): string {
    const sh = this.shift;
    const j = this.june;
    const name = this.sus.def.name;
    const sawTake = j.knows('TookItem', (b) => b.how === 'saw' && b.actor === this.sus.id);
    const sawPay = j.knows('PaidAtTill', (b) => b.how === 'saw');
    const heardPay = j.knows('PaidAtTill', (b) => b.how === 'heard');
    const sawLeave = j.knows('LeftWithItem', (b) => b.how === 'saw');
    const heardShout = j.knows('Shout', (b) => b.actor === 'mara');
    let text: string;
    if (sawPay) {
      text = `${name} tapped a card on Mara’s machine — I saw the little light go. Before the van man came through. Or just after. One of the two.`;
    } else if (sawTake && heardPay) {
      text = `I saw ${name} take a tin down, and a bit after I heard that card machine beep. I did not see who beeped it, mind.`;
    } else if (sawTake && sawLeave) {
      text = `${name} took a tin off the biscuit shelf and later walked out with it. I did not see anyone go to the till — but I was reading, dear, I will not swear to it.`;
    } else if (sawTake) {
      text = `I saw ${name} take a tin off the shelf. Whether it was paid for, I could not tell you. I was at the cards.`;
    } else if (heardPay && sawLeave) {
      text = `I heard the card machine beep at some point, and I saw ${name} go out with a tin. Whether those two things go together I could not say.`;
    } else if (sawLeave) {
      text = `I saw ${name} go out of the door with a tin under one arm. What happened before that I have no idea — I had my nose in the magazines.`;
    } else if (heardPay) {
      text = 'I heard that card machine of Mara’s beep, a little while before she started shouting. I did not turn round to see who it was.';
    } else if (heardShout) {
      text = 'I had my back to it all, love. First I knew was Mara shouting. I wrote the time down. On something I have since lost.';
    } else {
      text = 'I am afraid I saw nothing at all, dear. Has something happened?';
    }
    sh.casebook.add('shop_june', this.id, 'claim', text, 'June');
    // a statement that matches the record makes her a remembered, trusted witness
    if (sawPay || sawTake || sawLeave || heardPay) j.remember('trustworthy_witness', 0.5);
    return text;
  }

  // ------------------------------------------------------------ reporting
  isLive(): boolean {
    if (this.state === 'reported' || this.state === 'active' || this.state === 'stabilised') return true;
    return this.phase === 'arrested';
  }

  card(): DispatchCard | null {
    const sh = this.shift;
    const sus = this.sus;
    const name = sus.def.name;
    const here = (c: { pos: THREE.Vector3 }): { x: number; z: number } => ({ x: c.pos.x, z: c.pos.z });
    const shop = { x: 0, z: -2 };
    const base = { title: this.title, location: 'Corner shop, High Street' };
    if (this.variant === 'innocent' && this.phase === 'released') {
      if (this.explainedToMara || this.state === 'resolved') return null;
      return { ...base, status: 'Let the owner know what you found.', urgent: false, marker: shop };
    }
    if (this.state === 'reported') {
      return { ...base, status: this.variant === 'innocent' || this.phase !== 'fleeing'
        ? `Owner reports ${name} left with goods she did not ring up. Speak to her, or to ${name}.`
        : `${name} is making off.`, urgent: true, marker: shop };
    }
    if (this.state === 'active') return { ...base, status: `${name} is running. Get close to detain, or call out.`, urgent: true, marker: sh.playerCanSee(sus.char.pos) ? here(sus.char) : undefined };
    if (this.state === 'stabilised') {
      if (this.phase === 'arrested') return { ...base, status: `${name} is under arrest. Escort to the station and hand over to Sgt Bell.`, urgent: false, marker: { x: sh.town.anchors.brief_spot.x, z: sh.town.anchors.brief_spot.z } };
      return { ...base, status: `${name} has stopped. Establish what happened before deciding.`, urgent: false, marker: here(sus.char) };
    }
    if (this.state === 'escaped') {
      if (sh.items.get(TIN).state === 'world') return { ...base, status: 'Suspect lost. The tin was dropped — recover it.', urgent: false, marker: this.tinDropPos ? { x: this.tinDropPos.x, z: this.tinDropPos.z } : undefined };
      if (sh.carried.includes(TIN)) return { ...base, status: 'Suspect lost. Return the recovered tin to the owner.', urgent: false, marker: shop };
      return null;
    }
    if ((this.state === 'handed_over' || this.state === 'resolved') && sh.carried.includes(TIN) && this.variant === 'guilty' && !this.propertyReturned) {
      return { ...base, status: 'Return the recovered tin to the owner.', urgent: false, marker: shop };
    }
    if (this.variant === 'innocent' && this.phase === 'released' && !this.explainedToMara && this.state !== 'resolved') {
      return { ...base, status: 'Let the owner know what you found.', urgent: false, marker: shop };
    }
    return null;
  }

  report(): IncidentReport | null {
    if (this.state === 'staged' || this.state === 'unattended') return null;
    const name = this.sus.def.name;
    const lines: string[] = [];
    let label = 'Unfinished';
    let open = false;
    if (this.variant === 'innocent') {
      if (this.wrongfulArrest && this.handedOver) {
        label = 'Wrongful arrest';
        lines.push(`${name} had paid by card. The receipt and the till roll were both available before the arrest.`);
        lines.push('Public trust reduced. This is a judgement penalty, not a physics accident.');
      } else if (this.explainedToMara) {
        label = 'Misunderstanding resolved';
        lines.push(`Established that ${name} paid by card while the owner was in the stockroom, and told her so.`);
        if (this.arrestedOnce) lines.push('You arrested before checking; de-arresting put it right, but check first next time.');
      } else if (this.k.receiptSeen || this.k.tillChecked) {
        label = 'Partly resolved';
        lines.push(`You established that ${name} paid, but the owner was never told.`);
        this.shift.grant('shop_partial', 30, 'Established the facts of the shop report');
      } else {
        open = true;
        lines.push('The report was not looked into.');
      }
    } else if (this.handedOver) {
      label = 'Arrest and handover';
      lines.push(`${name} was arrested and handed over at the station.`);
      lines.push(this.propertyReturned ? 'The shortbread tin went back to the shop.' : 'The tin was not returned to the owner.');
    } else if (this.cautioned) {
      label = 'Words of advice';
      lines.push(`${name} gave the tin up and was sent on their way with words of advice.`);
      if (this.propertyReturned) lines.push('Property returned to the owner.');
    } else if (this.phase === 'escaped') {
      label = this.propertyReturned ? 'Property recovered, suspect lost' : 'Suspect escaped';
      open = true;
      lines.push(`${name} got off your beat on foot. The case stays open as a lead.`);
      if (this.propertyReturned) lines.push('You recovered the dropped tin and returned it.');
      else if (this.k.maraAccount) {
        lines.push('You took the owner’s account for the report.');
        this.shift.grant('shop_account', 5, 'Took the victim’s account');
      }
    } else if (this.phase === 'released') {
      label = 'Released';
      lines.push(`${name} was released still holding the tin. The owner is not impressed.`);
      this.mara.remember('let_down');
    } else {
      open = true;
      lines.push(this.phase === 'arrested' ? `${name} was still under arrest at clock-off; custody passed to the late turn.` : 'Passed to the late turn unfinished.');
    }
    if (this.k.juneAsked) lines.push('A witness statement was taken.');
    return { id: this.id, title: this.title, outcomeLabel: label, lines, open };
  }
}
