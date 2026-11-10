// Authoritative simulation events. Presentation and UI listen; they never grant
// rewards or change guilt themselves.
export interface SimEvent {
  id: string;
  type: string;
  time: number;
  actor?: string;
  target?: string;
  pos?: { x: number; y: number; z: number };
  /** Radius in metres at which the event can be heard in open air (0 = silent). */
  loud?: number;
  /** Whether the event can be perceived by sight. */
  visible?: boolean;
  data?: Record<string, unknown>;
}

type Handler = (e: SimEvent) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private seq = 0;
  readonly log: SimEvent[] = [];
  now = 0;

  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(e: Omit<SimEvent, 'id' | 'time'> & { id?: string }): SimEvent {
    const ev: SimEvent = { ...e, id: e.id ?? `ev${++this.seq}`, time: this.now };
    this.log.push(ev);
    if (this.log.length > 600) this.log.splice(0, 200);
    this.handlers.get(ev.type)?.forEach((h) => h(ev));
    this.handlers.get('*')?.forEach((h) => h(ev));
    return ev;
  }

  dispose(): void {
    this.handlers.clear();
    this.log.length = 0;
  }
}
