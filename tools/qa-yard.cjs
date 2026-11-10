// M1 gate: 20 automated bump / stumble / fall / recovery sequences in the yard,
// plus a real door interaction and a reduced-motion check.
const { launch } = require('./qa-lib.cjs');
(async () => {
  const q = await launch('http://localhost:5173/?scenario=yard&autotest=1&seed=5&shadows=0', { timeScale: 4, keepAutopilot: true, viewport: { width: 960, height: 540 } });
  let shots = 0, lastDiag = Date.now();
  const t0 = Date.now();
  while (Date.now() - t0 < 1500000) {
    const r = await q.ev(() => window.__bwTest || null);
    if (r && r.done) break;
    const pip = await q.ev(() => { const c = window.__bw.shift.chars.get('pip'); window.__qa.lookAtChar('pip', 0.25); return c.motion; });
    if ((pip === 'down' || pip === 'stumbling' || pip === 'gettingUp') && shots < 6) { shots++; await q.shot(`yard-${pip}-${shots}`); await q.wait(700); }
    await q.wait(400);
    if (Date.now() - lastDiag > 20000) {
      lastDiag = Date.now();
      console.log('DIAG', JSON.stringify(await q.ev(() => { const sh = window.__bw.shift, n = sh.npcs.get('pip'), c = n.char, it = sh.items.get('pip_box'), bp = sh.items.worldPos('pip_box'); const pl = sh.player; return { test: window.__bwTestState, t: Math.round(sh.time), plan: n.planName, step: n.plan ? n.plan.i + ':' + (n.plan.steps[n.plan.i] && n.plan.steps[n.plan.i].t) : '-', susp: n.suspended.map((p) => p.name), motion: c.motion, pos: [c.pos.x.toFixed(1), c.pos.y.toFixed(2), c.pos.z.toFixed(1)], box: it.state, boxPos: [bp.x.toFixed(1), bp.y.toFixed(2), bp.z.toFixed(1)], dropped: n.dropped, player: [pl.pos.x.toFixed(1), pl.pos.z.toFixed(1)], pmotion: pl.motion }; })));
    }
  }
  const r = await q.ev(() => window.__bwTest);
  console.log('AUTOTEST', JSON.stringify(r, null, 1));
  await q.done();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
