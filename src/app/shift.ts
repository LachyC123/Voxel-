import * as THREE from 'three';
import { Npc, ResidentDef } from '../ai/npc';
import { Career } from '../career/career';
import { CharEnv, Character, Reactions } from '../characters/character';
import { POLICE_OUTFIT, RESIDENTS } from '../content/residents';
import { Casebook } from '../incidents/casebook';
import { ShiftFlow } from '../incidents/flow';
import { ParkingIncident } from '../incidents/parking';
import { ShopliftingIncident } from '../incidents/shoplifting';
import { DialogueNode, DialogueOption, Incident } from '../incidents/types';
import { Physics } from '../physics/physics';
import { EventBus, SimEvent } from '../simulation/events';
import { Rng } from '../simulation/rng';
import { Items } from '../world/items';
import { F, Town } from '../world/town';
import { disposeTree } from '../world/voxel';

export interface ShiftHost {
  subtitle(speaker: string, text: string, seconds: number): void;
  toast(text: string, kind?: 'info' | 'radio' | 'good' | 'warn'): void;
  openLocker(): void;
  endShift(): void;
  sound(name: string, vol?: number): void;
}

export interface ShiftOptions {
  seed: number;
  shiftNo: number;
  scenario: 'shift' | 'yard';
  variant?: 'guilty' | 'innocent';
  who?: 'toby' | 'rhys';
}

export interface Interactable {
  id: string;
  name: string;
  range: number;
  pos(out: THREE.Vector3): THREE.Vector3;
  /** Current primary action, or null when nothing can be done. */
  action(): { label: string; run: () => void } | null;
}

export interface LedgerEntry {
  key: string;
  xp: number;
  trust: number;
  reason: string;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// Everything that exists for one playable shift. Disposing a Shift releases
// its physics world, meshes and subscriptions, so repeated shifts do not
// multiply listeners or duplicate citizens.
export class Shift {
  readonly scene = new THREE.Scene();
  readonly phys = new Physics();
  readonly events = new EventBus();
  readonly rng: Rng;
  readonly town: Town;
  readonly items: Items;
  readonly reactions = new Reactions();
  readonly chars = new Map<string, Character>();
  readonly npcs = new Map<string, Npc>();
  readonly player: Character;
  readonly casebook: Casebook;
  readonly incidents: Incident[] = [];
  readonly flow: ShiftFlow;
  readonly interactables: Interactable[] = [];
  readonly npcAction = new Map<string, () => { label: string; run: () => void } | null>();
  readonly ledger: LedgerEntry[] = [];
  readonly env: CharEnv;
  readonly shiftNo: number;
  readonly parking: ParkingIncident | null = null;
  readonly shoplifting: ShopliftingIncident | null = null;
  time = 0;
  torchOn = false;
  readonly torch: THREE.SpotLight;
  readonly sun: THREE.DirectionalLight;
  /** Recovered property / evidence the officer is carrying (item ids). */
  readonly carried: string[] = [];
  private helpers: { x: number; z: number; until: number; id: string }[] = [];
  private playerKnockdowns = 0;
  disposed = false;

  constructor(readonly opts: ShiftOptions, readonly host: ShiftHost, readonly career: Career) {
    this.shiftNo = opts.shiftNo;
    this.rng = new Rng(opts.seed);
    this.scene.background = new THREE.Color(0xa9cfe6);
    this.scene.fog = new THREE.Fog(0xa9cfe6, 60, 140);
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x7d735f, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    this.sun.position.set(18, 30, 22);
    this.sun.castShadow = career.data.settings.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.torch = new THREE.SpotLight(0xfff2cc, 0, 16, 0.5, 0.45, 1.2);
    this.scene.add(this.torch, this.torch.target);

    this.town = new Town(this.phys, this.scene, this.events);
    this.items = new Items(this.phys, this.scene);
    this.casebook = new Casebook(this.events);
    this.env = { phys: this.phys, events: this.events, items: this.items, chars: this.chars, reactions: this.reactions, reducedMotion: career.data.settings.reducedMotion };
    this.reactions.env = this.env;

    this.phys.step(); // build the query structures so ground heights can be sampled
    const yard = opts.scenario === 'yard';
    const start = this.town.anchors[yard ? 'yard_spawn' : 'player_start'];
    this.player = this.addChar('player', 'You', POLICE_OUTFIT, yard ? start.x + 2 : start.x, yard ? start.z + 0.5 : start.z, start.yaw, true);
    this.player.staminaTime = 16;

    for (const def of RESIDENTS) {
      if (yard && def.id !== 'pip') continue;
      const a = this.town.anchors[def.start] ?? { x: this.town.van.rearSpot().x - 0.6, z: 2.2, yaw: 0 };
      const c = this.addChar(def.id, def.name, def.outfit, a.x, a.z, a.yaw, false);
      const mem = (career.data.memories[def.id] ??= []);
      this.npcs.set(def.id, new Npc(def, c, this, mem));
    }

    this.flow = new ShiftFlow(this);
    if (!yard) {
      this.parking = new ParkingIncident(this);
      this.shoplifting = new ShopliftingIncident(this);
      this.incidents.push(this.parking, this.shoplifting);
    }
    this.setupRoutines(yard);
    this.setupInteractables();
    this.events.on('*', (e) => this.onEvent(e));
  }

  private addChar(id: string, name: string, outfit: ResidentDef['outfit'], x: number, z: number, yaw: number, isPlayer: boolean): Character {
    const y = this.phys.groundY(x, z);
    const c = new Character(id, name, outfit, this.env, new THREE.Vector3(x, y, z), yaw, isPlayer);
    this.scene.add(c.rig.root);
    this.chars.set(id, c);
    return c;
  }

  npc(id: string): Npc {
    const n = this.npcs.get(id);
    if (!n) throw new Error(`Unknown NPC ${id}`);
    return n;
  }

  // ------------------------------------------------------------ routines
  private setupRoutines(yard: boolean): void {
    const A = this.town.anchors;
    const pip = this.npcs.get('pip');
    if (pip) {
      // Cadet drill: carry an evidence box round the yard. A living demonstration
      // of the carry / bump / drop / recover loop.
      this.items.create('pip_box', 'parcel', { owner: 'station' });
      this.items.pushStack('pip_box', pip.char, this.chars);
      const lap = (): void => {
        pip.setPlan('work_drill', [
          // came back without the box last time? fetch it before the next lap
          { t: 'do', fn: () => { if (!pip.char.carrying && this.items.get('pip_box').state === 'world') { pip.dropped = ['pip_box']; this.gatherDropped(pip); } } },
          { t: 'goto', to: 'y2', wobble: 0.25 }, { t: 'goto', to: 'y3' }, { t: 'goto', to: 'y4' }, { t: 'goto', to: 'y5' },
          { t: 'goto', to: 'y6' }, { t: 'goto', to: 'y7' }, { t: 'goto', to: 'y1', wobble: 0.25 },
          { t: 'wait', s: 2.5, gesture: 'lookAround' },
          { t: 'do', fn: () => { if (this.rng.chance(0.3) && !pip.char.carrying) pip.interrupt('lace', [{ t: 'wait', s: 2.4, gesture: 'lace' }]); } },
          { t: 'loop' },
        ]);
      };
      lap();
      pip.onRecovered = () => false;
    }
    if (yard) return;
    const sgt = this.npc('sgt');
    sgt.setPlan('work_desk', [
      { t: 'face', yaw: 0 },
      { t: 'wait', s: 9, gesture: 'type' }, { t: 'wait', s: 3 },
      { t: 'wait', s: 4, gesture: 'phone' }, { t: 'wait', s: 2 }, { t: 'loop' },
    ]);
    const june = this.npc('june');
    const jm = A.june_mags, jc = A.june_cards;
    const juneFirst = this.rng.chance(0.5);
    const spots = juneFirst ? [jm, jc] : [jc, jm];
    june.setPlan('browse', [
      { t: 'goto', to: { x: spots[0].x, z: spots[0].z } }, { t: 'face', yaw: spots[0].yaw }, { t: 'wait', s: 26, gesture: undefined },
      { t: 'wait', s: 3, gesture: 'reach' }, { t: 'wait', s: 14 },
      { t: 'goto', to: { x: spots[1].x, z: spots[1].z } }, { t: 'face', yaw: spots[1].yaw }, { t: 'wait', s: 24 },
      { t: 'wait', s: 3, gesture: 'reach' }, { t: 'wait', s: 12 }, { t: 'loop' },
    ]);
  }

  /** An ordinary, non-incident day for whoever is not involved. */
  ordinaryDay(npc: Npc): void {
    const A = this.town.anchors;
    npc.setPlan('stroll', [
      { t: 'goto', to: { x: A.green_bench.x, z: A.green_bench.z } }, { t: 'face', yaw: 0 },
      { t: 'wait', s: 16, gesture: 'phone' }, { t: 'wait', s: 4 },
      { t: 'goto', to: 'gr_b' }, { t: 'wait', s: 6, gesture: 'lookAround' },
      { t: 'goto', to: 'pv_e2' }, { t: 'goto', to: 'pv_gr' }, { t: 'wait', s: 5 },
      { t: 'loop' },
    ]);
  }

  // ------------------------------------------------------------ interaction registry
  private setupInteractables(): void {
    for (const d of this.town.doors.all.values()) {
      this.interactables.push({
        id: `door_${d.id}`, name: d.name, range: 2.1,
        pos: (o) => this.town.doors.centre(d.id, o),
        action: () => ({
          label: d.locked ? 'Locked' : Math.abs(d.target) > 0.1 ? 'Close' : 'Open',
          run: () => {
            if (!this.town.doors.toggle(d.id, this.player.pos, 'player')) this.host.toast('It is locked.', 'info');
            else {
              this.player.playGesture('reach', 0.45);
              this.host.sound('door');
            }
          },
        }),
      });
    }
    for (const n of this.npcs.values()) {
      this.interactables.push({
        id: `npc_${n.id}`, name: `${n.def.name} — ${n.def.role}`, range: 3.0,
        pos: (o) => n.char.centre(o).setY(n.char.centre(tmp2).y + (n.char.upright ? 0.45 : 0)),
        action: () => {
          if (n.char.hidden) return null;
          const over = this.npcAction.get(n.id)?.();
          if (over) return over;
          if (!n.char.upright || n.char.motion === 'stumbling') return null;
          return { label: 'Talk', run: () => this.events.emit({ type: 'TalkRequested', actor: 'player', target: n.id }) };
        },
      });
    }
    const L = this.town.anchors.locker;
    this.interactables.push({
      id: 'locker', name: 'Your locker', range: 2.2,
      pos: (o) => o.set(L.x + 0.6, F + 1.3, L.z + 0.1),
      action: () => ({ label: 'Open locker', run: () => this.host.openLocker() }),
    });
  }

  // ------------------------------------------------------------ events and perception
  private onEvent(e: SimEvent): void {
    if (e.type === 'NoteAdded') {
      this.host.toast(`Notebook: ${String(e.data?.kind)} recorded`, 'info');
      return;
    }
    // each NPC perceives through their own senses; nothing is broadcast
    if (e.pos && (e.visible || e.loud)) {
      tmp.set(e.pos.x, e.pos.y, e.pos.z);
      for (const n of this.npcs.values()) {
        if (n.char.hidden) continue;
        if (e.visible && n.canSee(tmp)) n.perceive(e, 'saw');
        else if (n.canHear(e)) n.perceive(e, 'heard');
      }
    }
    if (e.type === 'Reaction') this.onReaction(e);
    if (e.type === 'Recovered' && e.actor && e.actor !== 'player') this.onRecovered(e);
    if (e.type === 'ContactObserved') {
      const tier = e.data?.tier as string;
      this.host.sound(tier === 'knockdown' ? 'thud' : tier === 'stumble' ? 'clatter' : 'bump', tier === 'brush' ? 0.3 : 0.7);
    }
    if (e.type === 'ItemDropped') this.host.sound('drop', 0.5);
  }

  private onReaction(e: SimEvent): void {
    const npc = e.actor ? this.npcs.get(e.actor) : undefined;
    const tier = e.data?.tier as string;
    const dropped = (e.data?.dropped as string[]) ?? [];
    if (!npc) return;
    for (const id of dropped) if (!npc.dropped.includes(id)) npc.dropped.push(id);
    const byPlayer = e.data?.causeKind === 'char' && e.data?.causeId === 'player';
    if (byPlayer) {
      npc.playerBumps++;
      npc.transient.frustration = Math.min(1, npc.transient.frustration + (tier === 'brush' ? 0.05 : 0.25));
      if (tier === 'knockdown') {
        this.playerKnockdowns++;
        npc.remember('knocked_over');
        // never XP for provoking citizens; a readable, capped trust penalty instead
        if (this.playerKnockdowns <= 3 && this.opts.scenario === 'shift') this.trust(`knock_${npc.id}_${this.playerKnockdowns}`, -2, `Knocked ${npc.def.name} over while running.`);
      }
    }
    npc.transient.embarrassment = Math.min(1, npc.transient.embarrassment + (tier === 'knockdown' ? 0.6 : tier === 'stumble' ? 0.35 : 0.05));
    if (tier === 'brush' && byPlayer && !npc.inConversation && !npc.busy) {
      npc.sayOne(npc.playerBumps > 2 ? ['Mind out, officer.', 'Again?'] : ['Sorry — after you.', 'Oop. Excuse me, officer.', 'Mind how you go.']);
    } else if (tier === 'bump' && !npc.busy) {
      npc.sayOne(byPlayer ? ['Steady on!', 'Oi — easy.', 'Careful, officer!'] : ['Oof.', 'Whoops.']);
    } else if (tier === 'stumble' || tier === 'knockdown') {
      npc.sayOne(['Whoa—!', 'Woah woah woah—', 'Aah!'], 12);
    }
  }

  private onRecovered(e: SimEvent): void {
    const npc = this.npcs.get(e.actor!);
    if (!npc) return;
    const from = String(e.data?.from);
    if (npc.onRecovered && npc.onRecovered(from, e)) return;
    const cause = e.data?.cause as { kind: string; id: string } | null;
    const byPlayer = cause?.kind === 'char' && cause.id === 'player';
    const steps: import('../ai/npc').Step[] = [];
    if (from === 'fall') {
      steps.push({ t: 'wait', s: 0.9, gesture: 'lookAround' }, { t: 'wait', s: 1.3, gesture: 'dust' });
      steps.push({ t: 'do', fn: () => npc.sayOne(byPlayer
        ? ['You want to watch where you are going, officer!', 'Was that strictly necessary?', 'I am fine. No thanks to you.']
        : ['I am fine. I am fine. Do not fuss.', 'Right. That happened.', 'Nobody saw that. Good.']) });
      steps.push({ t: 'wait', s: 1.4 });
    } else {
      steps.push({ t: 'wait', s: 0.8, gesture: 'lookAround' });
      steps.push({ t: 'do', fn: () => npc.sayOne(byPlayer
        ? ['Steady on, officer.', 'Bit of room, please!']
        : cause?.kind === 'prop' ? ['Who put that there?', 'Nobody saw that. Good.', 'That bin came out of nowhere.'] : ['Whoops.', 'Pardon me.']) });
      steps.push({ t: 'wait', s: 0.8 });
    }
    npc.interrupt('acknowledge', steps);
    this.gatherDropped(npc);
  }

  /** Retrieve dropped belongings one at a time, or say why one is being left. */
  gatherDropped(npc: Npc, after?: () => void): void {
    let finished = false;
    const loop = (): void => {
      const id = npc.dropped.find((i) => this.items.get(i).state === 'world');
      npc.dropped = npc.dropped.filter((i) => i !== id && this.items.get(i).state === 'world');
      if (!id) {
        if (!finished) {
          finished = true;
          after?.();
        }
        return; // the looping step completes and the suspended plan resumes
      }
      const p = this.items.worldPos(id);
      // this interrupt suspends the looping step; when it ends the loop runs again
      npc.interrupt('gather', [
        { t: 'goto', to: { x: p.x, z: p.z }, arrive: 0.75, timeout: 9 },
        { t: 'wait', s: 0.9, gesture: 'pickup' },
        {
          t: 'do', fn: () => {
            const it = this.items.get(id);
            const ip = this.items.worldPos(id, tmp);
            const near = Math.hypot(ip.x - npc.char.pos.x, ip.z - npc.char.pos.z) < 1.5 && Math.abs(ip.y - npc.char.pos.y) < 1.2;
            if (it.state === 'world' && near) {
              this.items.pushStack(id, npc.char, this.chars);
              this.events.emit({ type: 'ItemRetrieved', actor: npc.id, target: id, pos: npc.char.pos.clone(), visible: true });
            } else if (it.state === 'world') {
              npc.sayOne(['I will come back for that one.', 'That one can stay there for now.']);
              this.events.emit({ type: 'ItemAbandoned', actor: npc.id, target: id, data: { reason: 'unreachable' } });
            }
          },
        },
      ]);
    };
    const cur = npc.plan;
    if (cur && cur.name === 'acknowledge') cur.steps.push({ t: 'do', fn: loop });
    else npc.interrupt('gather_loop', [{ t: 'do', fn: loop }]);
  }

  helpersAt(pos: { x: number; z: number }): number {
    this.helpers = this.helpers.filter((h) => h.until > this.time);
    return this.helpers.filter((h) => Math.hypot(h.x - pos.x, h.z - pos.z) < 4).length;
  }
  registerHelper(pos: { x: number; z: number }, id: string): void {
    this.helpers.push({ x: pos.x, z: pos.z, until: this.time + 10, id });
  }

  // ------------------------------------------------------------ speech
  say(speakerId: string, text: string, seconds: number, loud: number): void {
    const c = this.chars.get(speakerId);
    if (!c) return;
    const pos = c.pos.clone();
    this.events.emit({ type: loud >= 14 ? 'Shout' : 'Speech', actor: speakerId, pos, loud, data: { text } });
    const pl = this.player.pos;
    const d = Math.hypot(pos.x - pl.x, pos.z - pl.z);
    if (speakerId === 'player' || d < loud * this.town.hearingFactor(pos.x, pos.z, pl.x, pl.z)) {
      this.host.subtitle(c.name, text, seconds);
    }
  }

  /** Radio traffic is always heard by the officer. */
  radio(text: string): void {
    this.host.sound('radio');
    this.host.subtitle('Control', text, Math.max(4, 1.5 + text.length * 0.05));
  }

  playerCanSee(pos: THREE.Vector3, range = 30): boolean {
    const e = this.player.eye(tmp);
    if (Math.hypot(pos.x - e.x, pos.z - e.z) > range) return false;
    return this.phys.los(e, tmp2.set(pos.x, pos.y + 1.1, pos.z));
  }

  // ------------------------------------------------------------ rewards
  grant(key: string, xp: number, reason: string): void {
    if (this.ledger.some((l) => l.key === key)) return;
    const got = this.career.grant(`s${this.shiftNo}_${key}`, xp);
    this.ledger.push({ key, xp: got, trust: 0, reason });
    if (got > 0) {
      this.events.emit({ type: 'RewardGranted', data: { key, xp: got, reason } });
      this.host.toast(`+${got} career XP — ${reason}`, 'good');
    }
  }

  trust(key: string, delta: number, reason: string): void {
    if (this.ledger.some((l) => l.key === key)) return;
    const got = this.career.adjustTrust(`s${this.shiftNo}_${key}`, delta);
    this.ledger.push({ key, xp: 0, trust: got, reason });
    if (got < 0) this.host.toast(`Public trust ${got}: ${reason}`, 'warn');
  }

  // ------------------------------------------------------------ dialogue
  private greeting(n: Npc): string {
    if (n.playerBumps >= 3) return 'You have walked into me three times now. Is this an official visit?';
    switch (n.id) {
      case 'mara':
        if (n.recalledFromEarlier('wrongly_accused')) return 'Officer. I hope today goes better than last time.';
        if (n.recalledFromEarlier('helped') || n.recalledFromEarlier('property_recovered')) return 'Morning, officer. Kettle is on if you are passing later.';
        if (n.recalledFromEarlier('let_down')) return 'Oh. It is you.';
        return 'Officer. Good — someone has come.';
      case 'glen':
        if (n.recalledFromEarlier('ordered_about')) return 'Here we go again. Yes, officer?';
        if (n.recalledFromEarlier('knocked_over')) return 'Careful — last time you nearly put me through a bin.';
        if (n.recalledFromEarlier('helped')) return 'Morning. Fair copper, you. What is it?';
        return 'Yeah? I am on the clock, mate.';
      case 'june':
        if (n.recalledFromEarlier('trustworthy_witness')) return 'Hello again, dear. Did what I told you help at all?';
        return 'Hello, dear. Lovely to see a uniform about.';
      case 'toby':
        if (n.recalledFromEarlier('wrongly_accused')) return 'Am I… am I under arrest again?';
        if (n.recalledFromEarlier('helped')) return 'Oh, hi! It is you. Thanks again for the other day.';
        return 'Oh! Hi. Hello. Is something wrong?';
      case 'rhys':
        if (n.recalledFromEarlier('wrongly_accused')) return 'Not me. Whatever it is. Ask your sergeant how last time went.';
        return 'All right.';
      case 'pip':
        return 'Morning! Sarge has me carrying boxes round cones. For "spatial awareness".';
      default:
        return this.flow.sgtGreeting();
    }
  }

  talk(npcId: string): DialogueNode {
    return this.node(npcId, this.greeting(this.npc(npcId)));
  }

  /** A reply plus every currently available option for that person. */
  node(npcId: string, text: string, extra: DialogueOption[] = [], only = false): DialogueNode {
    const n = this.npc(npcId);
    const options: DialogueOption[] = [...extra];
    if (!only) {
      for (const inc of this.incidents) options.push(...inc.options(npcId));
      options.push(...this.flow.options(npcId));
      const small = SMALL_TALK[npcId];
      if (small) {
        options.push({
          label: small.q,
          run: () => this.node(npcId, this.repeatable(n, 'small', small.a)),
        });
      }
    }
    const trimmed = options.slice(0, 7);
    trimmed.push({ label: only ? 'Never mind.' : 'Leave', run: () => null });
    return { speaker: n.def.name, text, options: trimmed };
  }

  /** Repeated questions get a shorter, wearier answer. */
  repeatable(n: Npc, key: string, text: string): string {
    const count = (n.asked.get(key) ?? 0) + 1;
    n.asked.set(key, count);
    if (count === 2) return n.def.traits.patience < 0.5 ? `Same answer as before, officer. ${text}` : `As I said — ${text}`;
    if (count > 2) return 'Same answer as before, officer.';
    return text;
  }

  // ------------------------------------------------------------ frame steps
  step(dt: number): void {
    this.time += dt;
    this.events.now = this.time;
    this.reactions.now = this.time;
    this.flow.update(dt);
    for (const inc of this.incidents) inc.update(dt);
    for (const n of this.npcs.values()) n.update(dt);
    for (const c of this.chars.values()) c.step(dt);
    this.town.doors.step(dt, this.chars.values(), this.reactions);
    this.town.van.step(dt, this.chars.values());
    this.phys.step();
  }

  updateVisual(dt: number, alpha: number): void {
    for (const c of this.chars.values()) c.updateVisual(dt, alpha);
    this.phys.syncMeshes();
    const p = this.player;
    // sun shadow frustum follows the player
    this.sun.target.position.set(p.pos.x, 0, p.pos.z);
    this.sun.position.set(p.pos.x + 18, 30, p.pos.z + 22);
    this.torch.intensity = this.torchOn ? 70 : 0;
    if (this.torchOn) {
      const f = p.forward(tmp);
      this.torch.position.set(p.pos.x + f.x * 0.3, p.pos.y + 1.25, p.pos.z + f.z * 0.3);
      this.torch.target.position.set(p.pos.x + f.x * 6, p.pos.y + 0.9, p.pos.z + f.z * 6);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.dispose();
    for (const c of this.chars.values()) c.dispose();
    this.chars.clear();
    this.npcs.clear();
    this.interactables.length = 0;
    disposeTree(this.scene);
    this.scene.clear();
    this.phys.dispose();
  }
}

const SMALL_TALK: Record<string, { q: string; a: string }> = {
  mara: { q: 'How is business?', a: 'Steady. It would be steadier if people could see the door.' },
  glen: { q: 'Busy round today?', a: 'Forty-one drops. Forty-one. And every one of them wants a chat.' },
  june: { q: 'How are you keeping?', a: 'Oh, mustn’t grumble. I do, obviously, but I mustn’t.' },
  toby: { q: 'Studying nearby?', a: 'Yeah, engineering. I mean — first year. I mostly study where the cheap biscuits are.' },
  rhys: { q: 'Local, are you?', a: 'Born on Mill Cut. Nothing happens here. That is the appeal.' },
  pip: { q: 'How is the drill going?', a: 'Brilliant. I have only walked into the bin twice. Today.' },
};
