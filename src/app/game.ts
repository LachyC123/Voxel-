import * as THREE from 'three';
import { Career } from '../career/career';
import { ITEM_DEFS } from '../content/items';
import type { DialogueNode } from '../incidents/types';
import { G, initRapier } from '../physics/physics';
import { Sound } from '../presentation/audio';
import { CameraRig } from '../presentation/camera';
import { renderItemIcons } from '../presentation/icons';
import { Hud } from '../ui/hud';
import { ReviewData, ScreenHost, Screens } from '../ui/screens';
import { buildItemMesh } from '../world/items';
import { Input } from './input';
import { Interactable, Shift, ShiftHost, ShiftOptions } from './shift';

type State = 'boot' | 'menu' | 'playing' | 'paused' | 'locker' | 'notebook' | 'review';
const FIXED = 1 / 60;
const MAX_STEPS = 4;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

// Application lifecycle: owns the renderer, input, UI and the current Shift.
// Update order per frame: input → intentions → fixed simulation steps →
// presentation (poses, camera) → UI → render.
export class Game implements ShiftHost, ScreenHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig = new CameraRig();
  readonly input: Input;
  readonly career = new Career();
  readonly audio = new Sound();
  icons = new Map<string, string>();
  hud!: Hud;
  screens!: Screens;
  shift: Shift | null = null;
  state: State = 'boot';
  private scenario: 'shift' | 'yard' = 'shift';
  private dialogue: { npcId: string; node: DialogueNode } | null = null;
  private radioOpen = false;
  private selected = -1;
  private tools = new Map<string, THREE.Object3D>();
  private acc = 0;
  private last = 0;
  private frameTimes: number[] = [];
  private debug = false;
  private target: Interactable | null = null;
  private targetRun: (() => void) | null = null;
  private promptKey = '';
  private promptAt = 0;
  private clock = 0;
  private stepDist = 0;
  private xpAtStart = 0;
  private trustAtStart = 0;
  private emptyScene = new THREE.Scene();
  private params = new URLSearchParams(location.search);
  private dev = import.meta.env.DEV;
  /** Dev/test: overrides player movement input. */
  autopilot: (() => { x: number; z: number; speed: number } | null) | null = null;
  /** Dev/test: simulation speed multiplier for automated playthroughs. */
  timeScale = 1;
  /** Dev/test: called every fixed step. */
  devTick: ((dt: number) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.emptyScene.background = new THREE.Color(0x0c1220);
    this.input = new Input(canvas, this.career.data.settings.bindings);
    this.input.onFirstGesture = () => this.audio.unlock();
    this.input.onLockLost = () => {
      if (this.state === 'playing') this.pause();
    };
    canvas.addEventListener('click', () => {
      if (this.state === 'playing') this.input.requestLock();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // never fast-forward an unattended chase: pause, and resume only on clear input
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      } else this.audio.resume();
    });
    this.resize();
  }

  async start(): Promise<void> {
    const hudRoot = document.createElement('div');
    const screenRoot = document.createElement('div');
    this.ui.append(hudRoot, screenRoot); // screens always sit above the HUD
    this.screens = new Screens(screenRoot, this);
    this.screens.loading('Loading Borough Watch…');
    try {
      await initRapier();
      this.icons = renderItemIcons();
    } catch (err) {
      this.screens.error(`The physics engine or item renderer failed to load (${String(err)}). Check that WebGL and WebAssembly are enabled.`, () => location.reload());
      return;
    }
    this.hud = new Hud(hudRoot, this.icons);
    this.hud.setVisible(false);
    this.applySettings();
    if (this.dev) (window as unknown as { __bw: Game }).__bw = this;
    this.state = 'menu';
    this.screens.menu();
    if (this.dev && this.params.get('scenario') === 'yard') this.startYard();
    else if (this.dev && this.params.has('autostart')) this.startShift();
    if (this.dev && this.params.has('autotest')) void import('../dev/autotest').then((m) => m.runYardAutotest(this));
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ ScreenHost
  applySettings(): void {
    const s = this.career.data.settings;
    this.audio.setVolume(s.volume);
    this.rig.distance = s.cameraDistance;
    document.documentElement.style.setProperty('--scale', String(s.textScale));
    this.input.bindings = s.bindings;
    if (this.shift) this.shift.env.reducedMotion = s.reducedMotion;
  }

  captureKey(cb: (code: string) => void): void {
    this.input.captureNext(cb);
  }

  sound(name: string, vol = 1): void {
    this.audio.play(name, vol);
  }

  startShift(): void {
    this.scenario = 'shift';
    this.begin();
  }

  startYard(): void {
    this.scenario = 'yard';
    this.begin();
  }

  newCareer(): void {
    this.career.reset();
    this.applySettings();
  }

  restartShift(): void {
    this.begin();
  }

  toMenu(): void {
    this.disposeShift();
    this.state = 'menu';
    this.hud.setVisible(false);
    this.screens.dialogue(null);
    this.screens.radio(null);
    this.screens.menu();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.screens.close();
    this.state = 'playing';
    this.acc = 0;
    this.input.requestLock();
  }

  closeOverlay(): void {
    if (this.state === 'locker') {
      // holster anything that is no longer on the belt
      if (this.selected >= 0 && !this.career.data.belt[this.selected]) this.select(-1);
      this.refreshTools();
      this.career.save();
    }
    this.screens.close();
    this.state = 'playing';
    this.acc = 0;
    this.input.requestLock();
  }

  // ------------------------------------------------------------ ShiftHost
  subtitle(speaker: string, text: string, seconds: number): void {
    this.hud.subtitle(speaker, text, seconds);
  }

  toast(text: string, kind: 'info' | 'radio' | 'good' | 'warn' = 'info'): void {
    this.hud.toast(text, kind);
    if (kind === 'good') this.audio.play('pickup', 0.6);
  }

  openLocker(): void {
    if (this.state !== 'playing') return;
    this.state = 'locker';
    this.input.exitLock();
    this.screens.locker();
  }

  endShift(): void {
    const sh = this.shift;
    if (!sh) return;
    this.closeDialogue();
    const reports = sh.incidents.map((i) => i.report()).filter((r): r is NonNullable<typeof r> => r !== null);
    const ledger = [...sh.ledger];
    const xpBefore = this.career.data.xp;
    const unlocked = this.career.completeShift();
    if (this.career.data.xp > xpBefore) ledger.unshift({ key: 'tutorial', xp: this.career.data.xp - xpBefore, trust: 0, reason: 'Completed your first guided shift (+1 training credit)' });
    this.career.data.openLeads = reports.filter((r) => r.open).map((r) => r.title);
    const saved = this.career.save();
    const data: ReviewData = {
      shiftNo: sh.shiftNo, reports, ledger,
      xpGained: this.career.data.xp - this.xpAtStart,
      trustDelta: this.career.data.trust - this.trustAtStart,
      unlocked, saved,
    };
    this.state = 'review';
    this.input.exitLock();
    this.hud.setVisible(false);
    this.screens.review(data);
    if (unlocked.length) this.audio.play('unlock');
    this.disposeShift();
  }

  // ------------------------------------------------------------ shift lifecycle
  private begin(): void {
    this.disposeShift();
    const p = this.params;
    const opts: ShiftOptions = {
      seed: this.dev && p.has('seed') ? Number(p.get('seed')) : (Date.now() ^ (this.career.data.xp * 7919)) >>> 0,
      shiftNo: this.career.data.shiftsCompleted + 1,
      scenario: this.scenario,
      variant: this.dev ? ((p.get('variant') as 'guilty' | 'innocent' | null) ?? undefined) : undefined,
      who: this.dev ? ((p.get('who') as 'toby' | 'rhys' | null) ?? undefined) : undefined,
    };
    if (this.dev && p.get('shadows') === '0') this.career.data.settings.shadows = false;
    try {
      this.shift = new Shift(opts, this, this.career);
    } catch (err) {
      console.error(err);
      this.screens.error(`The town failed to load: ${String(err)}`, () => this.begin());
      return;
    }
    const sh = this.shift;
    sh.events.on('TalkRequested', (e) => this.openDialogue(e.target!));
    sh.events.on('Reaction', (e) => {
      // brief camera response to impacts on the officer (off with reduced motion)
      if (e.actor === 'player') this.rig.impact(e.data?.tier === 'brush' ? 0.02 : 0.07);
    });
    this.xpAtStart = this.career.data.xp;
    this.trustAtStart = this.career.data.trust;
    this.selected = -1;
    this.refreshTools();
    this.rig.snapBehind(sh.player);
    this.rig.pitch = 0.28;
    this.hud.clear();
    this.hud.setVisible(true);
    this.screens.close();
    this.screens.dialogue(null);
    this.screens.radio(null);
    this.radioOpen = false;
    this.state = 'playing';
    this.acc = 0;
    this.input.requestLock();
    if (this.scenario === 'shift' && sh.shiftNo === 1) {
      this.hud.toast('Look at something and press the interact key to use it.', 'info');
    } else if (this.scenario === 'shift' && this.career.data.openLeads.length) {
      this.hud.toast(`Open from last shift: ${this.career.data.openLeads.join(', ')}.`, 'info');
    }
  }

  private disposeShift(): void {
    if (!this.shift) return;
    this.closeDialogue();
    this.tools.forEach((m) => m.removeFromParent());
    this.tools.clear();
    this.shift.dispose();
    this.shift = null;
    this.target = null;
    this.targetRun = null;
    this.autopilot = null;
    this.devTick = null;
    this.renderer.renderLists.dispose();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.screens.pause(this.scenario === 'yard');
  }

  // ------------------------------------------------------------ belt and tools
  private refreshTools(): void {
    const sh = this.shift;
    if (!sh) return;
    this.tools.forEach((m) => m.removeFromParent());
    this.tools.clear();
    for (const id of this.career.data.belt) {
      if (!id || this.tools.has(id)) continue;
      const m = buildItemMesh(ITEM_DEFS[id]);
      m.visible = false;
      m.position.set(0, -0.03, 0.05);
      if (id === 'torch_basic') m.rotation.x = 0;
      else m.rotation.x = -1.2;
      sh.player.rig.handR.add(m);
      this.tools.set(id, m);
    }
    this.select(this.selected);
  }

  private select(slot: number): void {
    const sh = this.shift;
    const belt = this.career.data.belt;
    this.selected = slot >= 0 && belt[slot] ? slot : -1;
    const id = this.selected >= 0 ? belt[this.selected] : null;
    this.tools.forEach((m, k) => (m.visible = k === id));
    if (sh) {
      sh.player.toolOut = !!id;
      if (id !== 'torch_basic') sh.torchOn = false;
    }
    if (id) this.hud.showBeltName(ITEM_DEFS[id].name);
  }

  private useSelected(): void {
    const sh = this.shift!;
    const id = this.selected >= 0 ? this.career.data.belt[this.selected] : null;
    if (!id) {
      this.hud.toast('Select a belt item first (number keys).', 'info');
      return;
    }
    switch (id) {
      case 'torch_basic':
        sh.torchOn = !sh.torchOn;
        this.audio.play('ui');
        break;
      case 'radio':
        this.toggleRadio();
        break;
      case 'notebook':
        this.openNotebook();
        break;
      case 'evidence_kit':
        this.hud.toast('Evidence kit: look at a loose item of evidence and interact to bag and tag it.', 'info');
        break;
      default:
        this.hud.toast(`${ITEM_DEFS[id].name} has no use yet.`, 'info');
    }
  }

  private toggleRadio(): void {
    if (!this.career.data.belt.includes('radio')) {
      this.hud.toast('Your radio is still in your locker.', 'warn');
      return;
    }
    this.radioOpen = !this.radioOpen;
    this.screens.radio(this.radioOpen ? ['Control, repeat my current call.', 'Control, anything else outstanding?', 'Cancel'] : null);
    if (this.radioOpen) this.audio.play('radio', 0.6);
  }

  private radioChoose(i: number): void {
    const sh = this.shift!;
    this.radioOpen = false;
    this.screens.radio(null);
    if (i === 1) {
      const c = sh.flow.card();
      sh.say('player', 'Control, four-one-seven. Repeat my current, over.', 2.4, 6);
      sh.radio(`Four-one-seven: ${c.title}, ${c.location}. ${c.status}`);
    } else if (i === 2) {
      const live = sh.incidents.filter((x) => x.isLive());
      sh.say('player', 'Control, four-one-seven. Anything else showing for me?', 2.4, 6);
      sh.radio(live.length ? `Four-one-seven, you are showing ${live.length} open: ${live.map((x) => x.title).join('; ')}.` : 'Four-one-seven, nothing outstanding. Enjoy the quiet.');
    }
  }

  private openNotebook(): void {
    const sh = this.shift;
    if (!sh || this.state !== 'playing') return;
    this.closeDialogue();
    this.state = 'notebook';
    this.input.exitLock();
    const titles: Record<string, string> = {};
    for (const i of sh.incidents) titles[i.id] = i.title;
    const people: string[] = [];
    for (const n of sh.npcs.values()) {
      const cats = [...new Set(n.memories.map((m) => m.cat))];
      if (cats.length) people.push(`${n.def.name} (${n.def.role}) remembers: ${cats.map((c) => c.replace(/_/g, ' ')).join(', ')}.`);
    }
    this.screens.notebook(sh.casebook.notes, titles, people);
  }

  // ------------------------------------------------------------ dialogue
  private openDialogue(npcId: string): void {
    const sh = this.shift;
    if (!sh || this.dialogue || this.state !== 'playing') return;
    const npc = sh.npc(npcId);
    npc.inConversation = true;
    sh.player.stop();
    sh.player.faceYaw = Math.atan2(npc.char.pos.x - sh.player.pos.x, npc.char.pos.z - sh.player.pos.z);
    sh.player.lookAt(npc.char.eye(), 30);
    this.dialogue = { npcId, node: sh.talk(npcId) };
    this.radioOpen = false;
    this.screens.radio(null);
    this.screens.dialogue(this.dialogue.node);
    sh.player.playGesture('talk', 1.2);
  }

  chooseDialogue(index: number): void {
    const d = this.dialogue;
    const sh = this.shift;
    if (!d || !sh || this.state !== 'playing') return;
    const opt = d.node.options[index];
    if (!opt) return;
    this.audio.play('ui', 0.6);
    const next = opt.run();
    if (!this.dialogue) return; // ended as a side effect (e.g. shift finished)
    if (next) {
      d.node = next;
      this.screens.dialogue(next);
      const npc = sh.npcs.get(d.npcId);
      npc?.char.playGesture('talk', Math.min(3, 1 + next.text.length * 0.03));
    } else this.closeDialogue();
  }

  private closeDialogue(): void {
    const d = this.dialogue;
    if (!d) return;
    this.dialogue = null;
    this.screens?.dialogue(null);
    const sh = this.shift;
    if (!sh) return;
    const npc = sh.npcs.get(d.npcId);
    if (npc) npc.inConversation = false;
    sh.player.faceYaw = null;
    sh.player.lookTarget = null;
    this.promptAt = this.clock; // brief guard so the closing key press cannot trigger a new action
  }

  // ------------------------------------------------------------ frame
  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.1, Math.max(0, rawDt)); // cap frame delta
    this.frameTimes.push(rawDt * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.clock += dt;
    const sh = this.shift;
    if (this.input.hit('debug')) this.debug = !this.debug;

    if (sh && this.state === 'playing') {
      this.handleInput(dt, sh);
      if (this.state === 'playing' && this.shift === sh) {
        const scale = this.dev ? this.timeScale : 1;
        const maxSteps = MAX_STEPS * scale;
        this.acc += dt * scale;
        let steps = 0;
        while (this.acc >= FIXED && steps < maxSteps && this.shift === sh && !sh.disposed) {
          this.devTick?.(FIXED);
          if (this.autopilot && !this.dialogue) {
            const auto = this.autopilot();
            if (auto) sh.player.wishDir.set(auto.x, 0, auto.z);
            sh.player.wishSpeed = auto ? auto.speed : 0;
          }
          sh.step(FIXED);
          this.acc -= FIXED;
          steps++;
        }
        if (steps === maxSteps) this.acc = 0; // limit catch-up after a stall
      }
    } else if (sh && (this.state === 'notebook' || this.state === 'locker' || this.state === 'paused')) {
      if (this.state === 'notebook' && (this.input.hit('notebook') || this.input.hit('pause'))) this.closeOverlay();
      else if (this.state === 'locker' && this.input.hit('pause')) this.closeOverlay();
      else if (this.state === 'paused' && this.input.hit('pause') && this.screens.current === 'pause') this.resume();
    }

    const cur = this.shift;
    if (cur && !cur.disposed) {
      const playing = this.state === 'playing';
      cur.updateVisual(playing ? dt : 0.0001, playing ? this.acc / FIXED : 1);
      this.rig.update(dt, cur.player, cur.phys, this.career.data.settings.reducedMotion);
      if (playing && cur.player.grounded) {
        // footsteps keyed to distance travelled, so they match the gait
        this.stepDist += cur.player.speed * dt;
        const stride = 0.62 + 0.13 * cur.player.speed;
        if (this.stepDist > stride) {
          this.stepDist = 0;
          this.audio.play('step', 0.5 + cur.player.speed * 0.08);
        }
      }
      if (playing) this.updateTarget(cur);
      this.hud.update(dt, cur, this.career.data.belt, this.selected, this.input.bindings, cur.shiftNo === 1 && !this.debug);
      this.hud.setTalking(this.dialogue !== null);
      this.hud.setDebug(this.debug ? this.debugText(cur) : null);
      this.renderer.render(cur.scene, this.rig.camera);
    } else {
      this.renderer.render(this.emptyScene, this.rig.camera);
    }
    this.input.endFrame();
  }

  private handleInput(dt: number, sh: Shift): void {
    const inp = this.input;
    const s = this.career.data.settings;
    // camera
    this.rig.look(inp.dx, inp.dy, s.sensitivity);
    const kx = (inp.downCode('ArrowRight') ? 1 : 0) - (inp.downCode('ArrowLeft') ? 1 : 0);
    const ky = (inp.downCode('ArrowDown') ? 1 : 0) - (inp.downCode('ArrowUp') ? 1 : 0);
    if (kx || ky) this.rig.look(kx * dt * 900, ky * dt * 500, 1);
    if (inp.wheel) {
      s.cameraDistance = THREE.MathUtils.clamp(s.cameraDistance + inp.wheel * 0.3, 1.8, 5);
      this.rig.distance = s.cameraDistance;
    }
    if (inp.hit('pause')) {
      if (this.radioOpen) this.toggleRadio();
      else if (this.dialogue) this.closeDialogue();
      else this.pause();
      return;
    }
    const p = sh.player;
    // conversation: number keys pick replies; never mapped to belt or tools here
    if (this.dialogue) {
      p.wishSpeed = 0;
      const npc = sh.npcs.get(this.dialogue.npcId);
      const gone = !npc || npc.char.hidden || !npc.char.upright || npc.char.pos.distanceTo(p.pos) > 5.5;
      if (gone) this.closeDialogue();
      else {
        const dgt = inp.digit();
        if (dgt) this.chooseDialogue(dgt - 1);
      }
      return;
    }
    if (this.radioOpen) {
      const dgt = inp.digit();
      if (dgt >= 1 && dgt <= 3) this.radioChoose(dgt);
    } else {
      for (let i = 0; i < 5; i++) if (inp.hit(`slot${i + 1}`)) this.select(this.selected === i ? -1 : i);
    }
    // movement, relative to the camera
    if (!this.autopilot) {
      const f = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0);
      const r = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
      if (f || r) {
        const fw = this.rig.forward(tmp), rt = this.rig.right(tmp2);
        p.wishDir.set(fw.x * f + rt.x * r, 0, fw.z * f + rt.z * r).normalize();
        const sprint = inp.isDown('sprint') && p.tired < 0.5;
        p.wishSpeed = inp.isDown('walk') ? 1.6 : sprint ? 5.8 : 3.5;
      } else p.wishSpeed = 0;
    }
    if (inp.hit('notebook')) this.openNotebook();
    else if (inp.hit('radio')) this.toggleRadio();
    else if (inp.hit('use') || (inp.locked && inp.hitCode('Mouse0'))) this.useSelected();
    else if (inp.hit('interact') && this.targetRun && this.clock - this.promptAt > 0.2) {
      // the prompt has been stable on screen: act on exactly what it said
      const run = this.targetRun;
      this.targetRun = null;
      run();
    }
  }

  /** Context targeting: the thing being looked at, in range and in line of sight. */
  private updateTarget(sh: Shift): void {
    let best: Interactable | null = null;
    let bestAct: { label: string; run: () => void } | null = null;
    let bestScore = Infinity;
    if (!this.dialogue) {
      const cam = this.rig.camera;
      const fwd = cam.getWorldDirection(tmp3);
      const eye = sh.player.eye(tmp2);
      for (const it of sh.interactables) {
        const a = it.action();
        if (!a) continue;
        const pos = it.pos(tmp);
        const d = Math.hypot(pos.x - sh.player.pos.x, pos.z - sh.player.pos.z);
        if (d > it.range || Math.abs(pos.y - eye.y) > 2.2) continue;
        const to = pos.clone().sub(cam.position);
        const ang = fwd.angleTo(to);
        const limit = it.range > 10 ? 0.3 : d < 1.4 ? 1.2 : 0.55;
        if (ang > limit) continue;
        if (!it.id.startsWith('door_')) {
          const hit = sh.phys.raycast(eye, pos, G.STATIC | G.GLASS | G.VEHICLE | G.DOOR);
          if (hit && hit.dist < eye.distanceTo(pos) - 0.45 && it.id !== 'van') continue;
        }
        const score = ang * 2 + d * 0.12 + (it.range > 10 ? 0.6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = it;
          bestAct = a;
        }
      }
    }
    const key = best && bestAct ? `${best.id}|${bestAct.label}` : '';
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.promptAt = this.clock;
    }
    this.target = best;
    this.targetRun = bestAct ? bestAct.run : null;
    this.hud.setPrompt(best ? best.name : null, bestAct?.label ?? '', this.input.bindings.interact);
  }

  private debugText(sh: Shift): string {
    const ft = [...this.frameTimes].sort((a, b) => a - b);
    const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length);
    const p95 = ft[Math.floor(ft.length * 0.95)] ?? 0;
    const pc = sh.phys.counts();
    const info = this.renderer.info.render;
    const p = sh.player;
    const lines = [
      `fps ${(1000 / avg).toFixed(0)}  frame avg ${avg.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms`,
      `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k`,
      `bodies ${pc.bodies}  awake props ${pc.awake}  colliders ${pc.colliders}`,
      `player ${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)}  ${sh.town.roomAt(p.pos.x, p.pos.z).id}  ${p.motion}  seed ${sh.opts.seed}`,
    ];
    for (const n of sh.npcs.values()) {
      lines.push(`${n.id.padEnd(5)} ${n.intent.padEnd(14)} ${n.char.motion.padEnd(9)} ${n.char.hidden ? 'hidden' : sh.town.roomAt(n.char.pos.x, n.char.pos.z).id}`);
    }
    return lines.join('\n');
  }
}
