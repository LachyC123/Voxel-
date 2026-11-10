import type { Shift } from '../app/shift';
import { DialogueOption, DispatchCard } from './types';

// The shape of a shift: kit up → briefing → patrol and calls → clock off.
export class ShiftFlow {
  stage: 'kit' | 'briefing' | 'patrol' | 'ended' = 'kit';
  briefedAt = -1;

  constructor(private shift: Shift) {
    if (shift.opts.scenario === 'yard') this.stage = 'patrol';
  }

  private kitted(): boolean {
    const belt = this.shift.career.data.belt;
    return belt.includes('torch_basic') && belt.includes('radio');
  }

  update(_dt: number): void {
    if (this.stage === 'kit' && this.kitted()) this.stage = 'briefing';
    else if (this.stage === 'briefing' && !this.kitted()) this.stage = 'kit';
  }

  /** The card shown top-left: the most urgent live call, else the current objective. */
  card(): DispatchCard & { more: number } {
    const sh = this.shift;
    const cards = [...sh.incidents].reverse().map((i) => i.card()).filter((c): c is DispatchCard => c !== null);
    cards.sort((a, b) => Number(b.urgent) - Number(a.urgent)); // stable: later incidents stay ahead
    if (cards.length) return { ...cards[0], more: cards.length - 1 };
    const A = sh.town.anchors;
    if (sh.opts.scenario === 'yard') return { title: 'Training yard', location: 'Station yard', status: 'Physics test area. Bump into things. Nothing here is on the record.', urgent: false, more: 0 };
    if (this.stage === 'kit') return { title: 'Start of shift', location: 'Locker room', status: 'Open your locker and put your torch and radio on your belt.', urgent: false, marker: { x: A.locker.x, z: A.locker.z }, more: 0 };
    if (this.stage === 'briefing') return { title: 'Briefing', location: 'Station reception', status: 'Report to Sgt Bell at the front desk.', urgent: false, marker: { x: A.brief_spot.x, z: A.brief_spot.z }, more: 0 };
    return { title: 'Patrol', location: 'High Street', status: 'No calls waiting. Patrol, or see Sgt Bell to clock off.', urgent: false, marker: { x: A.brief_spot.x, z: A.brief_spot.z }, more: 0 };
  }

  sgtGreeting(): string {
    const sh = this.shift;
    if (this.stage === 'kit') return 'Morning. You will want your kit before anything else.';
    if (this.stage === 'briefing') return sh.shiftNo === 1 ? 'There you are. First day. Ready?' : 'Morning. Ready for it?';
    return 'Yes, constable?';
  }

  options(npcId: string): DialogueOption[] {
    if (npcId !== 'sgt') return [];
    const sh = this.shift;
    const out: DialogueOption[] = [];
    if (this.stage === 'kit') {
      out.push({
        label: 'Reporting for duty, Sergeant.',
        run: () => sh.node('sgt', 'Kit first. Torch and radio on your belt — your locker is through that door, the blue one with your name on. Then come and see me.'),
      });
    } else if (this.stage === 'briefing') {
      out.push({
        label: 'Ready for briefing, Sergeant.', action: true,
        run: () => {
          this.stage = 'patrol';
          this.briefedAt = sh.time;
          sh.parking?.reportCall();
          sh.events.emit({ type: 'BriefingGiven', actor: 'sgt' });
          const first = sh.shiftNo === 1;
          return sh.node('sgt', first
            ? 'Right. Nothing dramatic for a first day. Mara at the corner shop has rung in: delivery van parked across her front and the driver is not shifting. Go and have a word with both of them. Listen first, then decide. Shop is left out of the door and along the High Street.'
            : 'Mara has rung in again — a van across her shopfront. You know the two of them by now. Go and see what the story is this time.');
        },
      });
    } else if (this.stage === 'patrol') {
      out.push({
        label: 'Any advice, Sergeant?',
        run: () => {
          const s = sh.shoplifting, p = sh.parking;
          let tip = 'Walk your beat. Learn the alleys. People tell you more when they have seen you before.';
          if (s && s.isLive()) tip = 'If the owner says someone did not pay, the till roll will tell you whether she is right. Check before you put cuffs on anybody.';
          else if (p && p.isLive()) tip = 'Hear both sides before you start giving orders. People move vans for officers who listened.';
          return sh.node('sgt', tip);
        },
      });
      out.push({
        label: 'I would like to clock off, Sergeant.',
        run: () => {
          const live = sh.incidents.filter((i) => i.isLive());
          if (!live.length) return this.confirmEnd('Go on, then. Let us see how you did.');
          const names = live.map((i) => i.title.toLowerCase()).join(' and the ');
          return sh.node('sgt', `You have still got the ${names} open. Clock off now and I pass it to the late turn — it will show as unfinished on your review.`, [
            { label: 'Clock off anyway.', action: true, run: () => { this.end(); return null; } },
            { label: 'I will finish it first.', run: () => sh.node('sgt', 'Good. Off you go.') },
          ], true);
        },
      });
    }
    return out;
  }

  private confirmEnd(text: string): ReturnType<Shift['node']> {
    const sh = this.shift;
    return sh.node('sgt', text, [
      { label: 'End the shift.', action: true, run: () => { this.end(); return null; } },
      { label: 'Not yet.', run: () => sh.node('sgt', 'Carry on, then.') },
    ], true);
  }

  private end(): void {
    if (this.stage === 'ended') return;
    this.stage = 'ended';
    this.shift.host.endShift();
  }
}
