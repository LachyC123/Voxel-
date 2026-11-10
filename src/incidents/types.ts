export type IncidentState = 'staged' | 'reported' | 'active' | 'stabilised' | 'resolved' | 'escaped' | 'handed_over' | 'unattended';

export interface DispatchCard {
  title: string;
  location: string;
  status: string;
  urgent: boolean;
  marker?: { x: number; z: number };
}

export interface IncidentReport {
  id: string;
  title: string;
  outcomeLabel: string;
  lines: string[];
  open: boolean;
}

export interface DialogueOption {
  label: string;
  run: () => DialogueNode | null;
  /** Marks an option that commits to an action (styled differently). */
  action?: boolean;
}

export interface DialogueNode {
  speaker: string;
  text: string;
  options: DialogueOption[];
}

export interface Incident {
  id: string;
  title: string;
  state: IncidentState;
  card(): DispatchCard | null;
  update(dt: number): void;
  options(npcId: string): DialogueOption[];
  report(): IncidentReport | null;
  /** True while the incident still needs the officer (used by clock-off warning). */
  isLive(): boolean;
}
