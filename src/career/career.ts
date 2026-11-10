import { BELT_ITEMS, ITEM_DEFS } from '../content/items';
import type { Memory } from '../ai/npc';

// Career record and local save. Career XP, training credits and public trust
// are distinct. Rewards are applied once per stable transaction id.
export const SCHEMA = 1;
const KEY = 'borough-watch.save.v1';
const BACKUP = 'borough-watch.save.v1.bak';

export interface Settings {
  sensitivity: number;
  reducedMotion: boolean;
  cameraDistance: number;
  volume: number;
  textScale: number;
  shadows: boolean;
  bindings: Record<string, string>;
}

export interface CareerData {
  schema: number;
  xp: number;
  credits: number;
  trust: number;
  shiftsCompleted: number;
  owned: string[];
  belt: (string | null)[];
  rewardTx: string[];
  memories: Record<string, Memory[]>;
  openLeads: string[];
  settings: Settings;
  savedAt: string;
}

export const DEFAULT_BINDINGS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', walk: 'KeyC',
  interact: 'KeyE', notebook: 'Tab', radio: 'KeyR', pause: 'Escape',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5',
  use: 'KeyF', debug: 'F3',
};

export const BINDING_LABELS: Record<string, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Sprint', walk: 'Walk (hold)',
  interact: 'Interact / talk', notebook: 'Notebook', radio: 'Radio menu', pause: 'Pause',
  slot1: 'Belt slot 1', slot2: 'Belt slot 2', slot3: 'Belt slot 3', slot4: 'Belt slot 4', slot5: 'Belt slot 5',
  use: 'Use selected item', debug: 'Diagnostics overlay',
};

function fresh(): CareerData {
  return {
    schema: SCHEMA, xp: 0, credits: 0, trust: 50, shiftsCompleted: 0,
    owned: BELT_ITEMS.filter((d) => d.unlock === 'initial').map((d) => d.id),
    belt: [null, null, null, null, null],
    rewardTx: [], memories: {}, openLeads: [],
    settings: { sensitivity: 1, reducedMotion: false, cameraDistance: 3.3, volume: 0.6, textScale: 1, shadows: true, bindings: { ...DEFAULT_BINDINGS } },
    savedAt: '',
  };
}

function validate(raw: unknown): CareerData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<CareerData>;
  if (d.schema !== SCHEMA) return null; // no older schemas exist yet; migrations slot in here
  if (typeof d.xp !== 'number' || !Array.isArray(d.owned) || !Array.isArray(d.belt)) return null;
  const base = fresh();
  const out: CareerData = { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}), bindings: { ...DEFAULT_BINDINGS, ...(d.settings?.bindings ?? {}) } } } as CareerData;
  out.owned = out.owned.filter((id) => ITEM_DEFS[id]?.belt);
  out.belt = [0, 1, 2, 3, 4].map((i) => (out.belt[i] && out.owned.includes(out.belt[i]!) ? out.belt[i] : null));
  return out;
}

export class Career {
  data: CareerData;
  loadedFrom: 'save' | 'backup' | 'new' = 'new';

  constructor() {
    this.data = fresh();
    try {
      const main = validate(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
      if (main) {
        this.data = main;
        this.loadedFrom = 'save';
      } else {
        const bak = validate(JSON.parse(localStorage.getItem(BACKUP) ?? 'null'));
        if (bak) {
          this.data = bak;
          this.loadedFrom = 'backup';
        }
      }
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
  }

  get hasProgress(): boolean {
    return this.data.shiftsCompleted > 0 || this.data.xp > 0;
  }

  get rank(): string {
    if (this.data.shiftsCompleted === 0) return 'Probationary officer';
    return this.data.xp >= 300 ? 'Patrol officer' : 'Probationary officer';
  }

  get nextUnlock(): string {
    if (this.data.shiftsCompleted === 0) return 'Evidence kit — complete your first shift.';
    if (this.data.xp < 300) return `Patrol officer at 300 career XP (${Math.max(0, 300 - this.data.xp)} to go): independent shifts and vehicle training.`;
    return 'Vehicle training (arrives with the next milestone).';
  }

  /** Apply a reward exactly once. Returns the XP actually granted. */
  grant(txId: string, xp: number): number {
    if (this.data.rewardTx.includes(txId)) return 0;
    this.data.rewardTx.push(txId);
    if (this.data.rewardTx.length > 400) this.data.rewardTx.splice(0, 100);
    this.data.xp = Math.max(0, this.data.xp + xp);
    return xp;
  }

  adjustTrust(txId: string, delta: number): number {
    if (this.data.rewardTx.includes(txId)) return 0;
    this.data.rewardTx.push(txId);
    this.data.trust = Math.max(0, Math.min(100, this.data.trust + delta));
    return delta;
  }

  /** Unlocks earned by finishing a shift. Returns newly unlocked item ids. */
  completeShift(): string[] {
    this.data.shiftsCompleted++;
    const unlocked: string[] = [];
    if (this.grant('tutorial_complete', 100) > 0) this.data.credits += 1;
    for (const d of BELT_ITEMS) {
      const ok = d.unlock === 'initial' || (d.unlock === 'first_shift' && this.data.shiftsCompleted >= 1);
      if (ok && !this.data.owned.includes(d.id)) {
        this.data.owned.push(d.id);
        unlocked.push(d.id);
      }
    }
    return unlocked;
  }

  save(): boolean {
    try {
      this.data.savedAt = new Date().toISOString();
      const next = JSON.stringify(this.data);
      const prev = localStorage.getItem(KEY);
      if (prev && validate(JSON.parse(prev))) localStorage.setItem(BACKUP, prev); // keep last valid checkpoint
      localStorage.setItem(KEY, next);
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BACKUP);
    } catch { /* ignore */ }
  }
}
