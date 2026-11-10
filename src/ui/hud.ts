import type { Shift } from '../app/shift';
import { keyLabel } from '../app/input';
import { ITEM_DEFS } from '../content/items';

const el = (tag: string, cls: string, parent?: HTMLElement): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
};
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Sub { who: string; text: string; until: number }

// HUD composition (docs/plan/07): dispatch card top-left, modest minimap
// top-right, five-slot belt bottom-centre, one target prompt, subtitles above
// the belt, vitals only while relevant.
export class Hud {
  readonly root: HTMLElement;
  private card: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private belt: HTMLElement;
  private beltName: HTMLElement;
  private prompt: HTMLElement;
  private subsEl: HTMLElement;
  private vitals: HTMLElement;
  private carry: HTMLElement;
  private toastsEl: HTMLElement;
  private debugEl: HTMLElement;
  private hintEl: HTMLElement;
  private subs: Sub[] = [];
  private toasts: { el: HTMLElement; until: number }[] = [];
  private lastCard = '';
  private lastBelt = '';
  private lastPrompt = '';
  private lastCarry = '';
  private beltNameUntil = 0;
  private clock = 0;

  constructor(parent: HTMLElement, private icons: Map<string, string>) {
    this.root = el('div', 'hud', parent);
    this.card = el('div', 'card', this.root);
    const mm = el('div', 'minimap', this.root);
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 176;
    this.mapCanvas.height = 116;
    mm.appendChild(this.mapCanvas);
    el('div', 'north', mm).textContent = 'N';
    el('div', 'dot', this.root);
    this.prompt = el('div', 'prompt hidden', this.root);
    this.subsEl = el('div', 'subs', this.root);
    this.beltName = el('div', 'beltname hidden', this.root);
    this.belt = el('div', 'belt', this.root);
    this.vitals = el('div', 'vitals', this.root);
    this.vitals.innerHTML = 'Stamina<div class="bar"><i></i></div>';
    this.carry = el('div', 'carry hidden', this.root);
    this.toastsEl = el('div', 'toasts', this.root);
    this.debugEl = el('div', 'debug hidden', this.root);
    this.hintEl = el('div', 'hint', this.root);
  }

  /** While a conversation is open the belt and prompts step aside. */
  setTalking(v: boolean): void {
    this.root.classList.toggle('talking', v);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  subtitle(who: string, text: string, seconds: number): void {
    const same = this.subs.find((s) => s.who === who && s.text === text);
    if (same) {
      same.until = this.clock + seconds; // never stack the same line twice
      return;
    }
    this.subs.push({ who, text, until: this.clock + seconds });
    if (this.subs.length > 2) this.subs.shift(); // maximum two readable lines
    this.renderSubs();
  }

  toast(text: string, kind = 'info'): void {
    const t = el('div', `toast ${kind}`, this.toastsEl);
    t.textContent = text;
    this.toasts.push({ el: t, until: this.clock + 4.5 });
    while (this.toasts.length > 3) this.toasts.shift()!.el.remove();
  }

  clear(): void {
    this.subs = [];
    this.renderSubs();
    this.toasts.forEach((t) => t.el.remove());
    this.toasts = [];
    this.lastCard = this.lastBelt = this.lastPrompt = this.lastCarry = '';
  }

  private renderSubs(): void {
    this.subsEl.innerHTML = this.subs.map((s) => `<div class="line"><span class="who">${esc(s.who)}</span>${esc(s.text)}</div>`).join('');
  }

  setPrompt(name: string | null, label: string, key: string): void {
    const k = name ? `${name}|${label}|${key}` : '';
    if (k === this.lastPrompt) return;
    this.lastPrompt = k;
    this.prompt.classList.toggle('hidden', !name);
    if (name) this.prompt.innerHTML = `<div class="name">${esc(name)}</div><div class="act"><kbd>${esc(keyLabel(key))}</kbd>${esc(label)}</div>`;
  }

  showBeltName(text: string): void {
    this.beltName.textContent = text;
    this.beltName.classList.remove('hidden');
    this.beltNameUntil = this.clock + 2.2;
  }

  update(dt: number, shift: Shift, belt: (string | null)[], selected: number, bindings: Record<string, string>, showHints: boolean): void {
    this.clock += dt;
    // subtitles and toasts expire
    const before = this.subs.length;
    this.subs = this.subs.filter((s) => s.until > this.clock);
    if (this.subs.length !== before) this.renderSubs();
    this.toasts = this.toasts.filter((t) => {
      if (t.until > this.clock) return true;
      t.el.remove();
      return false;
    });
    if (this.beltNameUntil && this.clock > this.beltNameUntil) {
      this.beltName.classList.add('hidden');
      this.beltNameUntil = 0;
    }
    // dispatch card
    const c = shift.flow.card();
    const ck = `${c.title}|${c.location}|${c.status}|${c.urgent}|${c.more}`;
    if (ck !== this.lastCard) {
      this.lastCard = ck;
      this.card.className = `card${c.urgent ? ' urgent' : ''}`;
      this.card.innerHTML = `<div class="kicker">${c.urgent ? '◆ Dispatch — urgent' : 'Dispatch'}</div><div class="title">${esc(c.title)}</div><div class="loc">${esc(c.location)}</div><div class="status">${esc(c.status)}</div>${c.more > 0 ? `<div class="more">+${c.more} other call${c.more > 1 ? 's' : ''} open — see notebook</div>` : ''}`;
    }
    // belt
    const bk = `${belt.join(',')}|${selected}|${shift.torchOn}`;
    if (bk !== this.lastBelt) {
      this.lastBelt = bk;
      this.belt.innerHTML = belt.map((id, i) => {
        const img = id ? `<img src="${this.icons.get(id) ?? ''}" alt="${esc(ITEM_DEFS[id].name)}">` : '';
        const on = id === 'torch_basic' && shift.torchOn ? '<span class="on" title="On"></span>' : '';
        return `<div class="slot${i === selected ? ' sel' : ''}"><span class="key">${esc(keyLabel(bindings[`slot${i + 1}`]))}</span>${img}${on}</div>`;
      }).join('');
    }
    // vitals: only while changing or relevant
    const st = shift.player.stamina;
    this.vitals.style.opacity = st < 0.98 ? '1' : '0';
    const bar = this.vitals.querySelector('.bar') as HTMLElement;
    bar.classList.toggle('low', st < 0.3);
    (bar.firstElementChild as HTMLElement).style.width = `${Math.round(st * 100)}%`;
    // carried property
    const ck2 = shift.carried.join(',');
    if (ck2 !== this.lastCarry) {
      this.lastCarry = ck2;
      this.carry.classList.toggle('hidden', !shift.carried.length);
      this.carry.innerHTML = shift.carried.map((id) => {
        const it = shift.items.get(id);
        return `<img src="${this.icons.get(it.def.id) ?? ''}" alt=""><span>Carrying: ${esc(it.def.name)}</span>`;
      }).join('');
    }
    this.hintEl.classList.toggle('hidden', !showHints);
    if (showHints) this.hintEl.innerHTML = `${keyLabel(bindings.notebook)} notebook · ${keyLabel(bindings.radio)} radio · ${keyLabel(bindings.use)} use item · ${keyLabel(bindings.pause)} pause`;
    this.drawMap(shift, c.marker);
  }

  private drawMap(shift: Shift, marker?: { x: number; z: number }): void {
    const g = this.mapCanvas.getContext('2d')!;
    const W = this.mapCanvas.width, H = this.mapCanvas.height;
    const x0 = -46, z0 = -29, sx = W / 78, sz = H / 48;
    const X = (x: number): number => (x - x0) * sx;
    const Z = (z: number): number => (z - z0) * sz;
    g.fillStyle = '#7d8b6c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#b5b0a6';
    g.fillRect(X(-44), Z(-17), X(30) - X(-44), Z(13.5) - Z(-17));
    for (const r of shift.town.mapRects) {
      g.fillStyle = r.color;
      g.fillRect(X(r.x1), Z(r.z1), X(r.x2) - X(r.x1), Z(r.z2) - Z(r.z1));
      if (r.label) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = '9px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(r.label, X((r.x1 + r.x2) / 2), Z((r.z1 + r.z2) / 2) + 3);
      }
    }
    const van = shift.town.van;
    g.fillStyle = '#f1f1ec';
    g.fillRect(X(van.x - 2.4), Z(van.z - 1), 4.8 * sx, 2 * sz);
    if (marker) {
      const mx = Math.max(6, Math.min(W - 6, X(marker.x))), mz = Math.max(6, Math.min(H - 6, Z(marker.z)));
      g.fillStyle = '#f0b03a';
      g.strokeStyle = '#101a2e';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(mx, mz - 6); g.lineTo(mx + 5, mz); g.lineTo(mx, mz + 6); g.lineTo(mx - 5, mz);
      g.closePath();
      g.fill();
      g.stroke();
    }
    const p = shift.player;
    g.save();
    g.translate(X(p.pos.x), Z(p.pos.z));
    g.rotate(-p.yaw + Math.PI);
    g.fillStyle = '#4f8ff0';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  setDebug(text: string | null): void {
    this.debugEl.classList.toggle('hidden', text === null);
    if (text !== null) this.debugEl.textContent = text;
    if (text !== null) this.hintEl.classList.add('hidden');
  }
}
