import type { Npc, Step } from '../ai/npc';
import type { Shift } from '../app/shift';
import { F } from '../world/town';
import { DialogueOption, DispatchCard, Incident, IncidentReport, IncidentState } from './types';
import * as THREE from 'three';

// Blocked shopfront (docs/plan/05 catalogue row 1). Hear both accounts, inspect
// the obstruction, then settle it. Glen is genuinely delivering: he carries an
// unstable stack past a litter bin, and whether he clips it is down to physics.
type Outcome = 'settled' | 'ordered' | 'mediated' | 'self_resolved' | 'unresolved';

export class ParkingIncident implements Incident {
  readonly id = 'parking';
  readonly title = 'Parking complaint';
  state: IncidentState = 'staged';
  heardMara = false;
  heardGlen = false;
  inspected = false;
  engaged = false;
  engagedAt = -1;
  moveRequested: null | 'agreed' | 'ordered' | 'self' = null;
  waitAgreed = false;
  outcome: Outcome | null = null;
  private inVan: string[] = [];
  private delivered = 0;
  private glen: Npc;
  private mara: Npc;
  private idleSince = -1;
  maraAtTillSince = -1;
  private reportedAt = -1;

  constructor(private shift: Shift) {
    this.glen = shift.npc('glen');
    this.mara = shift.npc('mara');
    for (let i = 0; i < 9; i++) {
      const id = `parcel_${i + 1}`;
      shift.items.create(id, 'parcel', { owner: 'mara', addressedTo: "Mara's Corner Store" });
      shift.items.store(id, 'van', shift.chars);
      this.inVan.push(id);
    }
    this.glen.onRecovered = (from, e) => this.glenRecovered(from, e.data?.cause as { kind: string; id: string } | null);
    // until the complaint is phoned in he is sorting the load at the back of the van
    const rear = shift.town.van.rearSpot();
    this.glen.setPlan('sorting', [
      { t: 'goto', to: { x: rear.x, z: rear.z } },
      { t: 'faceAt', x: shift.town.van.x, z: shift.town.van.z },
      { t: 'until', cond: () => this.state !== 'staged', gesture: 'load' },
      { t: 'do', fn: () => this.glenNext() },
    ]);
    this.maraStart();
    const van = shift.town.van;
    shift.interactables.push({
      id: 'van', name: 'GD Couriers van', range: 3.4,
      pos: (o) => o.set(van.x - 0.4, 1.3, van.z - 1.1),
      action: () => (van.moving ? null : { label: this.inspected ? 'Inspect again' : 'Inspect', run: () => this.inspect() }),
    });
  }

  // ------------------------------------------------------------ routines
  private maraStart(): void {
    const A = this.shift.town.anchors;
    const m = this.mara;
    m.setPlan('watch_van', [
      { t: 'face', yaw: A.mara_door.yaw },
      { t: 'until', cond: () => this.heardMara || (this.reportedAt > 0 && this.shift.time - this.reportedAt > 80) || this.state === 'resolved', gesture: 'fold' },
      { t: 'do', fn: () => this.maraWork() },
    ]);
  }

  /** Mara's ordinary working loop: till, a bit of restocking, back to the till. */
  maraWork(): void {
    const A = this.shift.town.anchors;
    this.mara.setPlan('work_till', [
      { t: 'goto', to: 'sh_till' }, { t: 'face', yaw: A.mara_till.yaw },
      { t: 'do', fn: () => { this.maraAtTillSince = this.shift.time; } },
      { t: 'wait', s: 10, gesture: 'type' }, { t: 'wait', s: 14 }, { t: 'wait', s: 6, gesture: 'type' }, { t: 'wait', s: 16 },
      { t: 'do', fn: () => { this.maraAtTillSince = -1; } },
      { t: 'goto', to: { x: A.mara_restock.x, z: A.mara_restock.z } }, { t: 'face', yaw: A.mara_restock.yaw },
      { t: 'wait', s: 7, gesture: 'restock' },
      { t: 'loop' },
    ]);
  }

  private glenNext(): void {
    const sh = this.shift;
    const g = this.glen;
    const van = sh.town.van;
    if (g.char.carrying) {
      // finish the drop in hand before anything else
      g.setPlan('work_delivery', this.deliverSteps());
      return;
    }
    if (this.moveRequested && !van.atBay) {
      const cab = van.cabSpot();
      g.setPlan('move_van', [
        { t: 'goto', to: { x: cab.x, z: cab.z }, speed: 1.8 },
        { t: 'wait', s: 0.6, gesture: 'reach' },
        { t: 'do', fn: () => { g.char.setHidden(true); van.targetX = van.bayX; sh.host.sound('engine'); } },
        { t: 'until', cond: () => van.atBay, timeout: 60 },
        {
          t: 'do', fn: () => {
            const c = van.cabSpot();
            g.char.teleport(new THREE.Vector3(c.x, F, c.z), Math.PI);
            g.char.setHidden(false);
            sh.events.emit({ type: 'VanMoved', actor: 'glen', pos: { x: van.x, y: 0, z: van.z }, visible: true, loud: 10 });
            this.onVanMoved();
          },
        },
        { t: 'do', fn: () => this.glenNext() },
      ]);
      return;
    }
    if (this.inVan.length) {
      const rear = van.rearSpot();
      g.setPlan('work_delivery', [
        { t: 'goto', to: { x: rear.x, z: rear.z } },
        { t: 'faceAt', x: van.x, z: van.z },
        { t: 'wait', s: 1.8, gesture: 'load' },
        {
          t: 'do', fn: () => {
            for (let i = 0; i < 3 && this.inVan.length; i++) sh.items.pushStack(this.inVan.shift()!, g.char, sh.chars);
          },
        },
        ...this.deliverSteps(),
      ]);
      return;
    }
    // round finished: paperwork at the cab, then he leaves of his own accord
    const cab = van.cabSpot();
    this.idleSince = sh.time;
    g.setPlan('paperwork', [
      { t: 'goto', to: { x: cab.x, z: cab.z } },
      { t: 'faceAt', x: van.x, z: van.z },
      { t: 'until', cond: () => sh.time - this.idleSince > 45 || this.moveRequested !== null, gesture: 'tap' },
      {
        t: 'do', fn: () => {
          if (!van.atBay && !this.moveRequested) {
            this.moveRequested = 'self';
            this.glenNext();
          } else if (!van.atBay) this.glenNext();
          else g.setPlan('break', [{ t: 'wait', s: 8, gesture: 'phone' }, { t: 'wait', s: 6 }, { t: 'loop' }]);
        },
      },
    ]);
  }

  private deliverSteps(): Step[] {
    const sh = this.shift;
    const g = this.glen;
    const A = sh.town.anchors.stock_drop;
    return [
      // he cannot see past the stack, so he does not steer round things
      { t: 'goto', to: 'pv_shop', wobble: 0.55, blind: true, speed: 1.5, arrive: 0.5 },
      { t: 'goto', to: 'sr_drop', blind: true, speed: 1.5 },
      { t: 'goto', to: { x: A.x, z: A.z }, speed: 1.2 },
      { t: 'wait', s: 1.0, gesture: 'pickup' },
      {
        t: 'do', fn: () => {
          for (const id of [...g.char.stack]) {
            const k = this.delivered++;
            sh.items.place(id, 'stockroom', new THREE.Vector3(A.x - 0.9 + (k % 3) * 0.5, F + 0.13 + Math.floor(k / 3) * 0.26, A.z - 0.75), sh.chars);
          }
          sh.events.emit({ type: 'DeliveryDropped', actor: 'glen', pos: g.char.pos.clone(), visible: true });
        },
      },
      { t: 'wait', s: 5, gesture: 'tap' }, // ticks the drop off on his handheld
      { t: 'do', fn: () => this.glenNext() },
    ];
  }

  private glenRecovered(from: string, cause: { kind: string; id: string } | null): boolean {
    const g = this.glen;
    const byPlayer = cause?.kind === 'char' && cause.id === 'player';
    const spilled = g.dropped.length > 0;
    // goal → complication → reaction → follow-through → back to work
    g.interrupt('acknowledge', [
      { t: 'wait', s: 1.0, gesture: 'lookAround' }, // did anyone see that?
      {
        t: 'do', fn: () => g.sayOne(
          byPlayer ? ['Oi! These are fragile. Probably.', 'Do you mind? I am working here.']
            : spilled ? ['That one was already damaged.', 'They pack these too light. That is the problem.', 'Nobody touch them. I have a system.']
              : ['That bin is in a stupid place.', 'I meant to do that.']),
      },
      { t: 'wait', s: from === 'fall' ? 1.4 : 0.7, gesture: from === 'fall' ? 'dust' : undefined },
    ]);
    this.shift.gatherDropped(g, () => {
      if (spilled && this.shift.rng.chance(0.7)) g.sayOne(['Right. Where was I.', 'Second trips are for amateurs.', 'No harm done. Mostly.']);
    });
    return true;
  }

  // ------------------------------------------------------------ officer actions
  reportCall(): void {
    if (this.state !== 'staged') return;
    this.state = 'reported';
    this.reportedAt = this.shift.time;
    this.shift.events.emit({ type: 'IncidentReported', target: this.id });
  }

  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.engagedAt = this.shift.time;
    if (this.state === 'reported') this.state = 'active';
  }

  private inspect(): void {
    const sh = this.shift;
    this.engage();
    this.inspected = true;
    sh.player.playGesture('lookAround', 1.2);
    const van = sh.town.van;
    if (van.atBay) {
      sh.casebook.add('park_van_bay', this.id, 'fact', 'The GD Couriers van (GD21 KXR) is now in the marked loading bay.');
      sh.host.toast('The van is parked legally in the loading bay.', 'info');
      return;
    }
    const left = this.inVan.length;
    sh.casebook.add('park_van', this.id, 'fact', `Van GD21 KXR is on double yellow lines directly across the shopfront, rear doors open. ${left ? `${left} parcels inside addressed to Mara's Corner Store.` : 'The load bay is empty.'} The marked loading bay is about twenty metres east and is free.`);
    sh.host.toast('Van inspected: on double yellows across the shopfront. Loading bay to the east is free.', 'info');
  }

  private resolve(outcome: Outcome): void {
    if (this.outcome) return;
    const sh = this.shift;
    this.outcome = outcome;
    this.state = 'resolved';
    sh.events.emit({ type: 'IncidentResolved', target: this.id, data: { outcome } });
    if (outcome === 'self_resolved') return;
    sh.grant('parking_resolve', 40, 'Parking complaint settled');
    if (this.heardMara && this.heardGlen) sh.grant('parking_listen', 10, 'Heard both accounts before deciding');
    if (this.inspected) sh.grant('parking_inspect', 10, 'Inspected the obstruction');
    this.mara.remember('helped');
    if (outcome === 'ordered') this.glen.remember('ordered_about');
    else {
      this.glen.remember('helped');
      sh.trust('parking_fair', 2, 'Handled the parking dispute fairly.');
    }
  }

  private onVanMoved(): void {
    const sh = this.shift;
    if (this.moveRequested === 'self') {
      if (!this.outcome) this.resolve(this.waitAgreed ? 'mediated' : 'self_resolved');
      return;
    }
    this.resolve(this.moveRequested === 'ordered' ? 'ordered' : 'settled');
    const g = this.glen;
    g.interrupt('remark', [{ t: 'say', text: this.moveRequested === 'ordered' ? 'There. Happy now? Twenty metres further to carry everything.' : 'There you go. Bay it is. Fair enough.' }]);
    if (this.mara.canSee(new THREE.Vector3(0, F, 1), 20) || sh.town.roomAt(this.mara.char.pos.x, this.mara.char.pos.z).id === 'shop_sales') {
      this.mara.say('That is better. People can see I am open.', undefined, 12);
    }
  }

  // ------------------------------------------------------------ dialogue
  options(npcId: string): DialogueOption[] {
    const sh = this.shift;
    if (this.state === 'staged') return [];
    const out: DialogueOption[] = [];
    const live = this.state !== 'resolved';
    if (npcId === 'mara') {
      if (live) {
        out.push({
          label: this.heardMara ? 'Tell me again about the van.' : 'What is the problem with the van?',
          run: () => {
            this.engage();
            this.heardMara = true;
            sh.casebook.add('park_mara', this.id, 'claim', 'The van has been across her shopfront for twenty minutes. She asked the driver once to use the loading bay and he said "two minutes".', 'Mara');
            return sh.node('mara', sh.repeatable(this.mara, 'van', 'That van. Twenty minutes it has been across my front. Nobody can see I am open, and the loading bay is twenty metres that way, empty. I asked him nicely. "Two minutes," he says.'));
          },
        });
        if (this.waitAgreed) {
          out.push({
            label: 'He is on his last drop. He will be gone in a few minutes.',
            run: () => {
              if (!this.heardMara) return sh.node('mara', 'You have not even asked me what the problem is yet.');
              this.resolve('mediated');
              return sh.node('mara', 'Hm. A few minutes. I am counting. …Thank you for actually coming, though.');
            },
          });
        }
      } else if (this.outcome && this.outcome !== 'self_resolved') {
        out.push({ label: 'Is the front clear now?', run: () => sh.node('mara', sh.repeatable(this.mara, 'clear', sh.town.van.atBay ? 'It is. Thank you. I have sold two papers already.' : 'It will be. He is nearly done.')) });
      }
    }
    if (npcId === 'glen' && live) {
      out.push({
        label: this.heardGlen ? 'Run me through it again.' : 'Is this your van?',
        run: () => {
          this.engage();
          this.heardGlen = true;
          sh.casebook.add('park_glen', this.id, 'claim', 'It is his last drop of the round: nine parcels for the shop. He says the bay is too far to carry them from and he will be "two minutes".', 'Glen');
          return sh.node('glen', sh.repeatable(this.glen, 'van', 'It is, yeah. Last drop of the round, nine parcels, all for her. Bay is miles off when you are carrying three at a time. Two minutes and I am gone.'));
        },
      });
      if (!this.moveRequested) {
        out.push({
          label: 'Please move the van to the loading bay.', action: true,
          run: () => {
            this.engage();
            if (this.heardGlen && (this.heardMara || this.inspected)) return this.agreeMove();
            return sh.node('glen', this.heardGlen
              ? 'On whose say-so? You have not even looked at where I am parked. She is exaggerating.'
              : 'You have not even asked what I am doing here. I am working, mate.', [
              { label: 'I am not asking twice. Move it now.', action: true, run: () => this.orderMove() },
              { label: this.heardGlen ? 'Fair. Give me a minute to look into it.' : 'Go on, then. What is the situation?', run: () => (this.heardGlen ? null : this.options('glen')[0].run()) },
            ], true);
          },
        });
        if (this.heardGlen && !this.waitAgreed) {
          out.push({
            label: 'Finish this drop, but be quick about it.',
            run: () => {
              this.waitAgreed = true;
              return sh.node('glen', 'Cheers. See? Reasonable. You might tell her that — she listens to a uniform.');
            },
          });
        }
      }
    }
    return out;
  }

  private agreeMove(): ReturnType<Shift['node']> {
    this.moveRequested = 'agreed';
    this.nudgeGlen();
    return this.shift.node('glen', this.glen.char.carrying
      ? 'All right, all right. Fair enough. Let me put these down inside and I will shift it.'
      : 'Fair enough. You asked properly. Shifting it now.');
  }

  private orderMove(): ReturnType<Shift['node']> {
    this.moveRequested = 'ordered';
    this.glen.transient.frustration = 1;
    this.nudgeGlen();
    return this.shift.node('glen', 'Unbelievable. Fine. Moving it. I will remember this, though.');
  }

  private nudgeGlen(): void {
    // if he is idle or between trips, go now; otherwise glenNext picks it up after the drop
    if (!this.glen.char.carrying && (this.glen.planName === 'paperwork' || this.glen.planName === 'work_delivery')) this.glenNext();
  }

  // ------------------------------------------------------------ reporting
  isLive(): boolean {
    return this.state === 'reported' || this.state === 'active';
  }

  card(): DispatchCard | null {
    if (!this.isLive()) return null;
    const van = this.shift.town.van;
    let status = 'Speak to the shop owner and the driver. The shop is east along the High Street.';
    if (this.moveRequested) status = 'The driver has agreed to move the van.';
    else if (this.waitAgreed) status = 'You told the driver he can finish. Let the shop owner know.';
    else if (this.heardMara && this.heardGlen) status = 'You have both accounts. Ask him to move, or let him finish his drop.';
    else if (this.heardMara) status = 'You have the owner’s account. Hear the driver’s side.';
    else if (this.heardGlen) status = 'You have the driver’s account. Hear the owner’s side.';
    return { title: this.title, location: 'Corner shop, High Street', status, urgent: false, marker: { x: van.x - 3, z: 1 } };
  }

  update(_dt: number): void {
    // nothing forces an escalation: if the van moves peacefully, that is the end of it
  }

  report(): IncidentReport | null {
    if (this.state === 'staged') return null;
    const lines: string[] = [];
    let label = 'Unfinished';
    switch (this.outcome) {
      case 'settled':
        label = 'Settled';
        lines.push('Heard the complaint and got the van moved to the loading bay by agreement.');
        break;
      case 'ordered':
        label = 'Resolved by instruction';
        lines.push('The van was moved, but you ordered it before hearing the driver out. He will remember that.');
        break;
      case 'mediated':
        label = 'Mediated';
        lines.push('Let the driver finish his last drop and squared it with the shop owner.');
        break;
      case 'self_resolved':
        label = 'Resolved itself';
        lines.push('The driver finished and left before you dealt with the complaint. No credit taken.');
        break;
      default:
        lines.push('Passed to the late turn unfinished.');
    }
    if (this.outcome && this.outcome !== 'self_resolved') {
      if (this.heardMara && this.heardGlen) lines.push('Both accounts were heard.');
      if (this.inspected) lines.push('You inspected the obstruction yourself.');
    }
    return { id: this.id, title: this.title, outcomeLabel: label, lines, open: !this.outcome };
  }
}
