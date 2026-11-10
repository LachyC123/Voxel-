import { keyLabel } from '../app/input';
import type { LedgerEntry } from '../app/shift';
import { BINDING_LABELS, Career, DEFAULT_BINDINGS } from '../career/career';
import { BELT_ITEMS, ITEM_DEFS } from '../content/items';
import type { Note } from '../incidents/casebook';
import type { DialogueNode, IncidentReport } from '../incidents/types';
import { esc } from './hud';

export interface ReviewData {
  shiftNo: number;
  reports: IncidentReport[];
  ledger: LedgerEntry[];
  xpGained: number;
  trustDelta: number;
  unlocked: string[];
  saved: boolean;
}

export interface ScreenHost {
  career: Career;
  icons: Map<string, string>;
  startShift(): void;
  startYard(): void;
  newCareer(): void;
  resume(): void;
  restartShift(): void;
  toMenu(): void;
  closeOverlay(): void;
  applySettings(): void;
  captureKey(cb: (code: string) => void): void;
  chooseDialogue(index: number): void;
  sound(name: string): void;
}

// Menus and full-screen panels. All are plain DOM: keyboard focus is visible
// and every panel has an explicit way out.
export class Screens {
  private layer: HTMLElement;
  private dialogueEl: HTMLElement;
  private radioEl: HTMLElement;
  current: string | null = null;

  constructor(parent: HTMLElement, private host: ScreenHost) {
    this.dialogueEl = document.createElement('div');
    this.dialogueEl.className = 'dialogue hidden';
    parent.appendChild(this.dialogueEl);
    this.radioEl = document.createElement('div');
    this.radioEl.className = 'radio hidden';
    parent.appendChild(this.radioEl);
    this.layer = document.createElement('div');
    parent.appendChild(this.layer);
  }

  close(): void {
    this.layer.innerHTML = '';
    this.current = null;
  }

  private open(name: string, html: string, solid = false, wide = false): HTMLElement {
    this.layer.innerHTML = `<div class="screen${solid ? ' solid' : ''}"><div class="panel${wide ? ' wide' : ''}" role="dialog" aria-label="${name}">${html}</div></div>`;
    this.current = name;
    const panel = this.layer.querySelector('.panel') as HTMLElement;
    panel.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.host.sound('ui')));
    (panel.querySelector('button.primary') as HTMLElement | null)?.focus({ preventScroll: true });
    return panel;
  }

  private bind(panel: HTMLElement, id: string, fn: () => void): void {
    panel.querySelector(`[data-a="${id}"]`)?.addEventListener('click', fn);
  }

  loading(text: string): void {
    this.layer.innerHTML = `<div class="loading"><div>${esc(text)}</div></div>`;
    this.current = 'loading';
  }

  error(text: string, retry: () => void): void {
    const p = this.open('error', `<h2>Could not start</h2><p>${esc(text)}</p><div class="row"><button class="primary" data-a="retry">Retry</button></div>`, true);
    this.bind(p, 'retry', retry);
  }

  // ------------------------------------------------------------ menu
  menu(): void {
    const c = this.host.career;
    const d = c.data;
    const b = d.settings.bindings;
    const cont = c.hasProgress;
    const p = this.open('menu', `
      <h1>BOROUGH WATCH</h1>
      <p class="sub">A small town. A new constable. Mind the bins.</p>
      ${cont ? `<p>${esc(c.rank)} · ${d.xp} career XP · ${d.shiftsCompleted} shift${d.shiftsCompleted === 1 ? '' : 's'} completed · public trust ${d.trust}</p>` : ''}
      ${c.loadedFrom === 'backup' ? '<p class="sub">Your main save could not be read; the previous checkpoint was restored.</p>' : ''}
      <div class="col">
        <button class="primary" data-a="start">${cont ? `Continue — start shift ${d.shiftsCompleted + 1}` : 'Start first shift'}</button>
        ${cont ? '<button data-a="new" class="danger">New career (erase save)</button>' : ''}
        <button data-a="settings">Settings</button>
        <button data-a="yard">Training yard (physics test area)</button>
        <button data-a="credits">Credits</button>
      </div>
      <h3>Controls</h3>
      <div class="keys">
        <kbd>${keyLabel(b.forward)} ${keyLabel(b.left)} ${keyLabel(b.back)} ${keyLabel(b.right)}</kbd><span>Move (camera-relative)</span>
        <kbd>Mouse</kbd><span>Look — click the view to capture the pointer; drag or arrow keys also work</span>
        <kbd>${keyLabel(b.sprint)}</kbd><span>Sprint (uses stamina) · <kbd>${keyLabel(b.walk)}</kbd> walk</span>
        <kbd>${keyLabel(b.interact)}</kbd><span>Interact with what you are looking at</span>
        <kbd>1–5</kbd><span>Belt slots · <kbd>${keyLabel(b.use)}</kbd> use selected item · in conversation, number keys choose replies</span>
        <kbd>${keyLabel(b.notebook)}</kbd><span>Notebook · <kbd>${keyLabel(b.radio)}</kbd> radio · <kbd>${keyLabel(b.pause)}</kbd> pause</span>
      </div>
      <p class="sub" style="margin-top:1rem">Desktop browser, keyboard and mouse. Progress saves locally at the end of each shift.</p>`, true);
    this.bind(p, 'start', () => this.host.startShift());
    this.bind(p, 'yard', () => this.host.startYard());
    this.bind(p, 'settings', () => this.settings(() => this.menu()));
    this.bind(p, 'credits', () => this.credits());
    this.bind(p, 'new', () => {
      const q = this.open('confirm', `<h2>Start a new career?</h2><p>This erases your saved rank, equipment and what residents remember about you.</p><div class="row"><button class="danger" data-a="yes">Erase and start again</button><button class="primary" data-a="no">Keep my career</button></div>`, true);
      this.bind(q, 'yes', () => { this.host.newCareer(); this.menu(); });
      this.bind(q, 'no', () => this.menu());
    });
  }

  private credits(): void {
    const p = this.open('credits', `<h2>Credits</h2>
      <p>Borough Watch — first playable slice (milestones M0–M2).</p>
      <p class="sub">Built with Three.js (rendering) and Rapier (physics), both under permissive open-source licences. All models, icons and sounds are generated in code for this project; no external asset packs are used.</p>
      <p class="sub">Ranks, procedures and equipment are fictional game systems, not a depiction of real police procedure.</p>
      <div class="row"><button class="primary" data-a="back">Back</button></div>`, true);
    this.bind(p, 'back', () => this.menu());
  }

  // ------------------------------------------------------------ pause / settings
  pause(inYard: boolean): void {
    const p = this.open('pause', `<h2>Paused</h2>
      <p class="sub">The town waits while you are paused. Progress is saved at the end of a shift; leaving now discards this shift.</p>
      <div class="col">
        <button class="primary" data-a="resume">Resume</button>
        <button data-a="settings">Settings</button>
        <button data-a="restart">${inYard ? 'Reset the yard' : 'Restart this shift'}</button>
        <button data-a="menu" class="danger">Quit to main menu</button>
      </div>`);
    this.bind(p, 'resume', () => this.host.resume());
    this.bind(p, 'settings', () => this.settings(() => this.pause(inYard)));
    this.bind(p, 'restart', () => this.host.restartShift());
    this.bind(p, 'menu', () => this.host.toMenu());
  }

  settings(back: () => void): void {
    const s = this.host.career.data.settings;
    const binds = Object.keys(BINDING_LABELS).map((a) => `<div class="bind"><span>${esc(BINDING_LABELS[a])}</span><button data-bind="${a}">${esc(keyLabel(s.bindings[a]))}</button></div>`).join('');
    const p = this.open('settings', `<h2>Settings</h2>
      <div class="setting"><label for="s-sens">Camera sensitivity</label><input id="s-sens" type="range" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"></div>
      <div class="setting"><label for="s-dist">Camera distance</label><input id="s-dist" type="range" min="1.8" max="5" step="0.1" value="${s.cameraDistance}"></div>
      <div class="setting"><label for="s-vol">Volume</label><input id="s-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"></div>
      <div class="setting"><label for="s-text">Text size</label><input id="s-text" type="range" min="0.85" max="1.4" step="0.05" value="${s.textScale}"></div>
      <div class="setting"><label for="s-rm">Reduced motion (no camera shake, gentler reactions)</label><input id="s-rm" type="checkbox" ${s.reducedMotion ? 'checked' : ''}></div>
      <div class="setting"><label for="s-sh">Shadows (applies from the next shift)</label><input id="s-sh" type="checkbox" ${s.shadows ? 'checked' : ''}></div>
      <h3>Key bindings — click one, then press a key</h3>
      <div class="grid2">${binds}</div>
      <div class="row"><button class="primary" data-a="back">Done</button><button data-a="defaults">Reset bindings</button></div>`, this.current === 'menu' || this.current === 'credits');
    const num = (id: string): number => Number((p.querySelector(`#${id}`) as HTMLInputElement).value);
    const apply = (): void => {
      s.sensitivity = num('s-sens');
      s.cameraDistance = num('s-dist');
      s.volume = num('s-vol');
      s.textScale = num('s-text');
      s.reducedMotion = (p.querySelector('#s-rm') as HTMLInputElement).checked;
      s.shadows = (p.querySelector('#s-sh') as HTMLInputElement).checked;
      this.host.applySettings();
    };
    p.querySelectorAll('input').forEach((i) => i.addEventListener('input', apply));
    p.querySelectorAll('[data-bind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.bind!;
        btn.textContent = 'Press a key…';
        this.host.captureKey((code) => {
          if (code !== 'Escape' || action === 'pause') {
            // one action per key: swap with whatever already used it
            const other = Object.keys(s.bindings).find((k) => s.bindings[k] === code && k !== action);
            if (other) s.bindings[other] = s.bindings[action];
            s.bindings[action] = code;
          }
          this.host.applySettings();
          this.settings(back);
        });
      });
    });
    this.bind(p, 'defaults', () => {
      Object.assign(s.bindings, DEFAULT_BINDINGS);
      this.host.applySettings();
      this.settings(back);
    });
    this.bind(p, 'back', () => {
      apply();
      this.host.career.save();
      back();
    });
  }

  // ------------------------------------------------------------ locker
  locker(): void {
    const c = this.host.career;
    const d = c.data;
    const icons = this.host.icons;
    const slots = d.belt.map((id, i) => `<button class="slot${id ? '' : ' empty'}" data-slot="${i}" title="${id ? `Remove ${esc(ITEM_DEFS[id].name)}` : 'Empty slot'}"><span class="key">${i + 1}</span>${id ? `<img src="${icons.get(id)}" alt="${esc(ITEM_DEFS[id].name)}">` : ''}</button>`).join('');
    const gear = BELT_ITEMS.map((def) => {
      const owned = d.owned.includes(def.id);
      const on = d.belt.includes(def.id);
      return `<div class="gear${owned ? '' : ' locked'}"><img src="${icons.get(def.id)}" alt=""><div class="grow"><div class="gname">${esc(def.name)}</div><div class="grole">${esc(owned ? def.role : `Locked — ${def.unlockHint}`)}</div></div>${owned ? `<button data-gear="${def.id}">${on ? 'On belt ✓' : 'Add to belt'}</button>` : ''}</div>`;
    }).join('');
    const p = this.open('locker', `<h2>Your locker</h2>
      <p class="sub">${esc(c.rank)} · ${d.xp} career XP · ${d.credits} training credit${d.credits === 1 ? '' : 's'} · public trust ${d.trust}</p>
      <h3>Belt — five quick slots</h3>
      <div class="belt" style="position:static;transform:none;justify-content:flex-start">${slots}</div>
      <h3>Issued equipment</h3>
      ${gear}
      <p class="sub">Next: ${esc(c.nextUnlock)}</p>
      <div class="row"><button class="primary" data-a="done">Close locker</button></div>`, false, true);
    p.querySelectorAll('[data-gear]').forEach((b) => b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.gear!;
      const at = d.belt.indexOf(id);
      if (at >= 0) d.belt[at] = null;
      else {
        const free = d.belt.indexOf(null);
        if (free >= 0) d.belt[free] = id;
      }
      this.locker();
    }));
    p.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
      d.belt[Number((b as HTMLElement).dataset.slot)] = null;
      this.locker();
    }));
    this.bind(p, 'done', () => this.host.closeOverlay());
  }

  // ------------------------------------------------------------ notebook
  notebook(notes: Note[], titles: Record<string, string>, memoryLines: string[]): void {
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      if (!groups.has(n.incident)) groups.set(n.incident, []);
      groups.get(n.incident)!.push(n);
    }
    let body = '';
    for (const [inc, list] of groups) {
      body += `<h3>${esc(titles[inc] ?? inc)}</h3>`;
      body += list.map((n) => `<div class="note"><span class="tag ${n.kind}">${n.kind === 'fact' ? 'CONFIRMED FACT' : n.kind === 'claim' ? 'WITNESS CLAIM' : 'LEAD'}</span>${esc(n.text)}${n.source ? ` <span class="src">— ${esc(n.source)}</span>` : ''}</div>`).join('');
    }
    if (!notes.length) body = '<p class="sub">Nothing recorded yet. Facts you confirm, things people tell you and leads you spot are written here.</p>';
    const people = memoryLines.length ? `<h3>People</h3>${memoryLines.map((l) => `<div class="note">${esc(l)}</div>`).join('')}` : '';
    const p = this.open('notebook', `<h2>Pocket notebook</h2>${body}${people}<div class="row"><button class="primary" data-a="done">Close notebook</button></div>`, false, true);
    this.bind(p, 'done', () => this.host.closeOverlay());
  }

  // ------------------------------------------------------------ shift review
  review(r: ReviewData): void {
    const c = this.host.career;
    const icons = this.host.icons;
    const outcomes = r.reports.length
      ? r.reports.map((o) => `<div class="outcome"><div class="head"><span>${esc(o.title)}</span><span class="label">${esc(o.outcomeLabel)}${o.open ? ' · open' : ''}</span></div><ul>${o.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')
      : '<p class="sub">No calls were attended this shift.</p>';
    const ledger = r.ledger.filter((l) => l.xp || l.trust).map((l) => `<span>${esc(l.reason)}</span><span class="${l.xp < 0 || l.trust < 0 ? 'neg' : 'pos'}">${l.xp ? `${l.xp > 0 ? '+' : ''}${l.xp} XP` : `${l.trust > 0 ? '+' : ''}${l.trust} trust`}</span>`).join('');
    const unlocks = r.unlocked.map((id) => `<div class="gear"><img src="${icons.get(id)}" alt=""><div class="grow"><div class="gname"><span class="tag new">NEW</span>${esc(ITEM_DEFS[id].name)}</div><div class="grole">${esc(ITEM_DEFS[id].role)} Add it to your belt at your locker.</div></div></div>`).join('');
    const p = this.open('review', `<h2>Shift ${r.shiftNo} review</h2>
      <div class="stats">
        <div class="stat"><b>+${r.xpGained}</b><span>Career XP</span></div>
        <div class="stat"><b>${r.trustDelta >= 0 ? '+' : ''}${r.trustDelta}</b><span>Public trust</span></div>
        <div class="stat"><b>${c.data.xp}</b><span>Total XP</span></div>
        <div class="stat"><b>${esc(c.rank)}</b><span>Rank</span></div>
      </div>
      <h3>Incidents</h3>${outcomes}
      ${ledger ? `<h3>How that adds up</h3><div class="ledger">${ledger}</div>` : ''}
      ${unlocks ? `<h3>Unlocked</h3>${unlocks}` : ''}
      <p class="sub">Next: ${esc(c.nextUnlock)}</p>
      <p class="sub">${r.saved ? 'Checkpoint saved: end of shift.' : 'Could not write the save (browser storage unavailable). Progress lasts until you close this tab.'}</p>
      <div class="row"><button class="primary" data-a="next">Start shift ${r.shiftNo + 1}</button><button data-a="menu">Main menu</button></div>`, true, true);
    this.bind(p, 'next', () => this.host.startShift());
    this.bind(p, 'menu', () => this.host.toMenu());
  }

  // ------------------------------------------------------------ dialogue overlay
  dialogue(node: DialogueNode | null): void {
    this.dialogueEl.classList.toggle('hidden', !node);
    if (!node) {
      this.dialogueEl.innerHTML = '';
      return;
    }
    const last = node.options.length - 1;
    this.dialogueEl.innerHTML = `<div class="speaker">${esc(node.speaker)}</div><div class="text">${esc(node.text)}</div><div class="opts">${node.options.map((o, i) => `<button class="opt${o.action ? ' action' : ''}${i === last ? ' exit' : ''}" data-i="${i}"><b>${i + 1}</b><span>${esc(o.label)}</span></button>`).join('')}</div>`;
    this.dialogueEl.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => this.host.chooseDialogue(Number((b as HTMLElement).dataset.i))));
  }

  radio(options: string[] | null): void {
    this.radioEl.classList.toggle('hidden', !options);
    if (!options) return;
    this.radioEl.innerHTML = `<div class="speaker" style="color:var(--amber);font-weight:650;font-size:0.85rem">RADIO</div><div class="opts" style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.4rem">${options.map((o, i) => `<div class="opt" style="display:flex;gap:0.5rem;font-size:0.92rem"><b style="color:var(--blue)">${i + 1}</b><span>${esc(o)}</span></div>`).join('')}</div>`;
  }
}
