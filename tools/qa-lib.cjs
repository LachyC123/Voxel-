// Play-test driver for Borough Watch (development builds only).
// Movement goes through the real character controller via the dev autopilot
// hook; interactions use real key presses against the on-screen prompt.
const { chromium } = require('playwright');

async function launch(url, opts = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.text().startsWith('BW_')) console.log(m.text().slice(0, 400)); else if (m.type() === 'error') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__bw && window.__bw.state !== 'boot', null, { timeout: 60000 });
  await page.evaluate(([ts, keep]) => {
    const g = window.__bw;
    g.timeScale = ts;
    const qa = (window.__qa = { path: null, speed: 3.5, arrived: true, stuckT: 0, last: null });
    // follow nav steps with the real controller; open doors on the way (door prompts are tested separately)
    qa.goto = (target, speed = 3.5) => {
      const sh = g.shift;
      qa.path = sh.town.nav.path(sh.player.pos, target, sh.phys) || [];
      qa.speed = speed;
      qa.arrived = false;
      qa.t0 = sh.time;
    };
    qa.chase = (id, speed = 5.8) => { qa.chaseId = id; qa.speed = speed; qa.arrived = false; qa.path = null; };
    qa.stop = () => { qa.path = null; qa.chaseId = null; qa.arrived = true; };
    qa.look = (x, z, pitch = 0.2) => {
      const p = g.shift.player.pos;
      g.rig.yaw = Math.atan2(p.x - x, p.z - z);
      g.rig.pitch = pitch;
    };
    qa.lookAtChar = (id, pitch = 0.12) => { const c = g.shift.chars.get(id); qa.look(c.pos.x, c.pos.z, pitch); };
    qa.pos = () => { const p = g.shift.player.pos; return [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]; };
    qa.prompt = () => document.querySelector('.prompt:not(.hidden) .act')?.textContent ?? null;
    // the game ignores presses until a prompt has been on screen for a moment; mirror that here
    qa.promptReady = (expect) => { const p = qa.prompt() || ''; return p.includes(expect) && g.clock - g.promptAt > 0.3; };
    qa.dialogue = () => { const d = document.querySelector('.dialogue:not(.hidden)'); return d ? { text: d.querySelector('.text').textContent, opts: [...d.querySelectorAll('.opt span')].map((e) => e.textContent) } : null; };
    qa.promptName = () => document.querySelector('.prompt:not(.hidden) .name')?.textContent ?? '';
    qa.card = () => document.querySelector('.card .title')?.textContent + ' | ' + document.querySelector('.card .status')?.textContent;
    qa.subs = () => [...document.querySelectorAll('.subs .line')].map((e) => e.textContent);
    qa.npc = (id) => { const n = g.shift.npcs.get(id); const c = n.char; return { plan: n.planName, motion: c.motion, pos: [Number(c.pos.x.toFixed(1)), Number(c.pos.z.toFixed(1))], stack: c.stack.length, held: c.held, hidden: c.hidden, stats: c.stats }; };
    if (!keep) g.autopilot = () => {
      const sh = g.shift;
      if (!sh) return null;
      const p = sh.player.pos;
      if (qa.chaseId) {
        const c = sh.chars.get(qa.chaseId);
        const dx = c.pos.x - p.x, dz = c.pos.z - p.z, d = Math.hypot(dx, dz);
        // run straight at them when visible, otherwise follow the nav graph
        if (d < 1.2) return null;
        if (sh.playerCanSee(c.pos)) { qa.path = null; return { x: dx / d, z: dz / d, speed: qa.speed }; }
        if (!qa.path || !qa.path.length || sh.time - (qa.t0 || 0) > 1.5) { qa.path = sh.town.nav.path(p, { x: c.pos.x, z: c.pos.z }, sh.phys) || []; qa.t0 = sh.time; }
      }
      if (!qa.path || !qa.path.length) { if (!qa.chaseId) qa.arrived = true; return null; }
      const s = qa.path[0];
      if (s.door && !sh.town.doors.isOpen(s.door)) sh.town.doors.open(s.door, p, 'player');
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { qa.path.shift(); return qa.path.length ? { x: dx / (d || 1), z: dz / (d || 1), speed: qa.speed } : null; }
      return { x: dx / d, z: dz / d, speed: qa.path.length === 1 ? Math.min(qa.speed, Math.max(1.2, d * 3)) : qa.speed };
    };
  }, [opts.timeScale || 1, !!opts.keepAutopilot]);
  const api = {
    browser, page, logs,
    ev: (fn, arg) => page.evaluate(fn, arg),
    shot: (name) => page.screenshot({ path: `qa-out/${name}.png`, timeout: 180000 }),
    wait: (ms) => page.waitForTimeout(ms),
    // wait in simulation seconds (independent of how fast the test machine renders)
    async sim(seconds) {
      const t = await page.evaluate(() => window.__bw.shift.time);
      await page.waitForFunction((until) => !window.__bw.shift || window.__bw.shift.time >= until, t + seconds, { timeout: 600000 });
    },
    until: (fn, arg, timeout = 300000) => page.waitForFunction(fn, arg, { timeout }),
    key: async (k) => { await page.keyboard.press(k); await page.waitForTimeout(120); },
    async goto(target, speed = 3.5, timeout = 90000) {
      await page.evaluate(([t, s]) => window.__qa.goto(t, s), [target, speed]);
      await page.waitForFunction(() => window.__qa.arrived, null, { timeout });
    },
    // real interaction: look at a point, wait for the expected prompt, press E
    async interact(lookX, lookZ, expect, pitch = 0.15) {
      await page.evaluate(([x, z, p]) => window.__qa.look(x, z, p), [lookX, lookZ, pitch]);
      await page.waitForFunction((e) => window.__qa.promptReady(e), expect, { timeout: 30000 });
      await page.keyboard.press('e');
      await page.waitForTimeout(250);
    },
    // talk to a specific person: aim at them, make sure the prompt names them, then press E
    async talk(id) {
      const name = await page.evaluate((i) => window.__bw.shift.npcs.get(i).def.name, id);
      for (let attempt = 0; attempt < 12; attempt++) {
        await page.evaluate((i) => window.__qa.lookAtChar(i), id);
        const ok = await page.waitForFunction((n) => window.__qa.promptReady('Talk') && window.__qa.promptName().startsWith(n), name, { timeout: 4000 }).then(() => true, () => false);
        if (ok) break;
        // not targeted: step closer, as a player would
        await page.evaluate((i) => window.__qa.chase(i, 2.2), id);
        await page.waitForFunction((i) => window.__bw.shift.npcs.get(i).char.pos.distanceTo(window.__bw.shift.player.pos) < 2.3, id, { timeout: 60000 }).catch(() => null);
        await page.evaluate(() => window.__qa.stop());
        if (attempt === 11) throw new Error(`could not target ${id}; prompt is "${await page.evaluate(() => window.__qa.promptName())}"`);
      }
      await page.keyboard.press('e');
      await page.waitForFunction((n) => { const d = document.querySelector('.dialogue:not(.hidden) .speaker'); return d && d.textContent === n; }, name, { timeout: 15000 });
      return page.evaluate(() => window.__qa.dialogue());
    },
    // choose a dialogue option by (partial) label; returns the reply once it has changed
    async say(label) {
      const d = await page.evaluate(() => window.__qa.dialogue());
      if (!d) throw new Error('no dialogue open for: ' + label);
      const i = d.opts.findIndex((o) => o.includes(label));
      if (i < 0) throw new Error(`option "${label}" not in ${JSON.stringify(d.opts)}`);
      await page.keyboard.press(String(i + 1));
      await page.waitForFunction((prev) => { const x = window.__qa.dialogue(); return !x || x.text !== prev; }, d.text, { timeout: 8000 }).catch(() => null);
      return page.evaluate(() => window.__qa.dialogue());
    },
    async leave() {
      const d = await page.evaluate(() => window.__qa.dialogue());
      if (d) { await page.keyboard.press(String(d.opts.length)); await page.waitForTimeout(250); }
    },
    async done() { console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'CONSOLE: clean'); await browser.close(); },
  };
  return api;
}
module.exports = { launch };
