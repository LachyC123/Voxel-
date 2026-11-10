// Small synthesised sound set (no external assets). Audio starts only after a
// user gesture; impacts vary with severity and overlapping clatter is limited.
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<string, number>();
  volume = 0.6;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    void this.ctx?.resume();
  }

  private noise(dur: number, freq: number, q: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(ctx.currentTime + delay);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, slide = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const t0 = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  play(name: string, vol = 1): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.09) return; // voice limiting
    this.last.set(name, now);
    switch (name) {
      case 'bump': this.noise(0.12, 180, 1.2, 0.5 * vol); break;
      case 'thud': this.noise(0.28, 90, 0.9, 0.9 * vol); this.tone(70, 0.2, 0.3 * vol); break;
      case 'clatter': for (let i = 0; i < 3; i++) this.noise(0.09, 900 + i * 500, 2, 0.3 * vol, i * 0.07); break;
      case 'drop': this.noise(0.1, 420, 1.5, 0.45 * vol); this.noise(0.08, 300, 1.5, 0.25 * vol, 0.16); break;
      case 'door': this.noise(0.25, 320, 4, 0.22 * vol); this.tone(160, 0.2, 0.05 * vol, 'sawtooth', 0, 60); break;
      case 'radio': this.noise(0.12, 2400, 1, 0.14 * vol); this.tone(1320, 0.07, 0.12 * vol, 'square', 0.1); this.tone(990, 0.09, 0.12 * vol, 'square', 0.19); break;
      case 'beep': this.tone(1760, 0.09, 0.14 * vol, 'square'); break;
      case 'pickup': this.tone(520, 0.08, 0.14 * vol, 'triangle'); this.tone(780, 0.1, 0.12 * vol, 'triangle', 0.07); break;
      case 'cuffs': this.noise(0.04, 3200, 6, 0.4 * vol); this.noise(0.04, 2800, 6, 0.4 * vol, 0.12); break;
      case 'ui': this.tone(660, 0.05, 0.08 * vol, 'triangle'); break;
      case 'unlock': this.tone(523, 0.14, 0.14 * vol, 'triangle'); this.tone(659, 0.14, 0.14 * vol, 'triangle', 0.12); this.tone(784, 0.26, 0.14 * vol, 'triangle', 0.24); break;
      case 'engine': this.tone(58, 1.6, 0.2 * vol, 'sawtooth', 0, 24); this.noise(1.2, 120, 0.8, 0.2 * vol); break;
      case 'step': this.noise(0.05, 240, 1.1, 0.12 * vol); break;
    }
  }
}
