import * as THREE from 'three';
import type { Game } from '../app/game';
import { G } from '../physics/physics';

// M1 acceptance gate, automated: 20 repeated bump / stumble / fall / recovery
// sequences against the cadet in the yard. Development builds only
// (?scenario=yard&autotest=1). Results land on window.__bwTest.
interface Run {
  i: number;
  speed: number;
  tier: string;
  recovered: boolean;
  seconds: number;
  boxBack: boolean;
  issue?: string;
}

export function runYardAutotest(game: Game): void {
  const sh = game.shift;
  if (!sh || sh.opts.scenario !== 'yard') {
    console.warn('autotest needs ?scenario=yard');
    return;
  }
  const pip = sh.npc('pip');
  const player = sh.player;
  const runs: Run[] = [];
  const speeds = [5.8, 3.5, 5.8, 1.6, 5.8];
  const TOTAL = 20;
  let phase: 'setup' | 'ram' | 'observe' | 'done' = 'setup';
  let t = 0;
  let wait = 0;
  let tier = 'none';
  let maxVel = 0;
  let rescues = 0;
  let explosive = 0;
  let misses = 0;
  sh.events.on('Reaction', (e) => {
    if (e.actor === 'pip' && phase === 'ram' && e.data?.causeId === 'player') {
      tier = String(e.data?.tier);
      phase = 'observe';
      t = 0;
    }
  });
  sh.events.on('PhysicsRescue', () => rescues++);

  const settled = (): boolean => pip.char.motion === 'animated' && !['acknowledge', 'gather', 'gather_loop'].includes(pip.planName);
  const from = new THREE.Vector3(), to = new THREE.Vector3();

  const place = (): boolean => {
    const c = pip.char.pos;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + runs.length;
      const x = c.x + Math.cos(a) * 4.2, z = c.z + Math.sin(a) * 4.2;
      if (x < -35 || x > -22.8 || z < -12 || z > -3) continue;
      from.set(c.x, c.y + 0.5, c.z);
      to.set(x, c.y + 0.5, z);
      if (sh.phys.raycast(from, to, G.STATIC | G.PROP | G.VEHICLE | G.DOOR)) continue;
      if (Math.abs(sh.phys.groundY(x, z) - c.y) > 0.05) continue;
      player.teleport(new THREE.Vector3(x, c.y, z), Math.atan2(c.x - x, c.z - z));
      return true;
    }
    return false;
  };

  game.autopilot = () => {
    if (phase !== 'ram') return null;
    const dx = pip.char.pos.x - player.pos.x, dz = pip.char.pos.z - player.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, speed: speeds[runs.length % speeds.length] };
  };

  game.devTick = (dt) => {
    t += dt;
    for (const d of sh.phys.dyn.values()) {
      const v = d.body.linvel();
      const m = Math.hypot(v.x, v.y, v.z);
      if (m > maxVel) maxVel = m;
      if (m > 25) explosive++;
    }
    if (phase === 'setup') {
      wait += dt;
      if ((settled() && wait > 1.2) || wait > 30) {
        if (place()) {
          phase = 'ram';
          t = 0;
          tier = 'none';
        }
        wait = Math.min(wait, 1.0);
      }
    } else if (phase === 'ram') {
      if (t > 5) {
        misses++;
        phase = 'setup';
        wait = 0;
      }
    } else if (phase === 'observe') {
      const done = settled() && t > 1.0;
      if (done || t > 30) {
        const errors = sh.items.audit(sh.chars);
        const p = pip.char.pos;
        const sane = Number.isFinite(p.x) && p.y > -0.5 && p.y < 2 && p.x > -36 && p.x < -22 && p.z > -13 && p.z < -2;
        runs.push({
          i: runs.length + 1, speed: speeds[runs.length % speeds.length], tier, recovered: done, seconds: Number(t.toFixed(2)),
          boxBack: pip.char.stack.includes('pip_box'),
          issue: !done ? 'not recovered in 30 s' : errors.length ? errors.join('; ') : !sane ? 'out of bounds' : undefined,
        });
        console.log('BW_RUN ' + JSON.stringify(runs[runs.length - 1]));
        if (runs.length >= TOTAL) {
          phase = 'done';
          const tiers: Record<string, number> = {};
          runs.forEach((r) => (tiers[r.tier] = (tiers[r.tier] ?? 0) + 1));
          const result = {
            done: true, runs, tiers, misses, rescues, explosive, maxPropSpeed: Number(maxVel.toFixed(2)),
            pipStats: pip.char.stats, itemAudit: sh.items.audit(sh.chars),
            pass: runs.every((r) => r.recovered && !r.issue) && rescues === 0 && explosive === 0,
          };
          (window as unknown as { __bwTest: unknown }).__bwTest = result;
          console.log('BW_AUTOTEST ' + JSON.stringify(result));
          game.autopilot = null;
          game.devTick = null;
        } else {
          phase = 'setup';
          wait = 0;
        }
      }
    }
  };
}
