// Keyboard/mouse input with remappable bindings. Mouse look uses pointer lock
// when available; dragging or the arrow keys rotate the camera otherwise.
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  /** Set while a menu deliberately releases the pointer. */
  expectUnlock = false;
  onLockLost: (() => void) | null = null;
  onFirstGesture: (() => void) | null = null;
  private capture: ((code: string) => void) | null = null;
  private dragging = false;
  private gestured = false;
  private off: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, public bindings: Record<string, string>) {
    const on = <K extends keyof DocumentEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      this.gesture();
      if (this.capture) {
        e.preventDefault();
        const c = this.capture;
        this.capture = null;
        c(e.code);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Tab' || e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.down.delete(e.code));
    on(window, 'blur', () => this.down.clear());
    on(canvas, 'mousedown', (e: MouseEvent) => {
      this.gesture();
      this.dragging = true;
      this.pressed.add(`Mouse${e.button}`);
    });
    on(window, 'mouseup', () => (this.dragging = false));
    on(window, 'mousemove', (e: MouseEvent) => {
      if (this.locked || this.dragging) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    on(canvas, 'wheel', (e: WheelEvent) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && !this.expectUnlock) this.onLockLost?.();
      this.expectUnlock = false;
    });
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture?.();
  }

  isDown(action: string): boolean {
    return this.down.has(this.bindings[action]);
  }
  hit(action: string): boolean {
    return this.pressed.has(this.bindings[action]);
  }
  hitCode(code: string): boolean {
    return this.pressed.has(code);
  }
  downCode(code: string): boolean {
    return this.down.has(code);
  }
  /** First digit key pressed this frame (1–9), or 0. */
  digit(): number {
    for (let i = 1; i <= 9; i++) if (this.pressed.has(`Digit${i}`) || this.pressed.has(`Numpad${i}`)) return i;
    return 0;
  }

  endFrame(): void {
    this.pressed.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch { /* pointer lock unavailable: drag-to-look still works */ }
  }

  exitLock(): void {
    if (!this.locked) return;
    this.expectUnlock = true;
    document.exitPointerLock();
  }

  captureNext(cb: (code: string) => void): void {
    this.capture = cb;
  }

  dispose(): void {
    this.off.forEach((f) => f());
  }
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', Escape: 'Esc', Space: 'Space', Mouse0: 'LMB', Mouse2: 'RMB' };
  return map[code] ?? code;
}
