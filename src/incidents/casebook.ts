import { EventBus } from '../simulation/events';

// The officer's notebook. It only ever holds what the player has actually been
// told or has observed, and labels each entry explicitly.
export type NoteKind = 'fact' | 'claim' | 'lead';
export interface Note {
  id: string;
  incident: string;
  kind: NoteKind;
  text: string;
  source?: string;
  time: number;
}

export class Casebook {
  readonly notes: Note[] = [];
  constructor(private events: EventBus) {}

  /** Idempotent: the same note id is recorded once. */
  add(id: string, incident: string, kind: NoteKind, text: string, source?: string): boolean {
    if (this.notes.some((n) => n.id === id)) return false;
    const note: Note = { id, incident, kind, text, source, time: this.events.now };
    this.notes.push(note);
    this.events.emit({ type: 'NoteAdded', target: id, data: { kind, text, incident } });
    return true;
  }

  has(id: string): boolean {
    return this.notes.some((n) => n.id === id);
  }
}
