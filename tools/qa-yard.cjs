// M1 gate: 20 automated bump / stumble / fall / recovery sequences in the yard,
// plus a real door interaction and a reduced-motion check.
const { launch } = require('./qa-lib.cjs');
(async () => {
  const q = await launch('http://localhost:5173/?scenario=yard&autotest=1&seed=5&shadows=0', { timeScale: 4, keepAutopilot: true, viewport: { width: 960, height: 540 } });
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 1500000) {
    const r = await q.ev(() => window.__bwTest || null);
    if (r && r.done) break;
    const pip = await q.ev(() => { const c = window.__bw.shift.chars.get('pip'); window.__qa.lookAtChar('pip', 0.25); return c.motion; });
    if ((pip === 'down' || pip === 'stumbling' || pip === 'gettingUp') && shots < 6) { shots++; await q.shot(`yard-${pip}-${shots}`); await q.wait(700); }
    await q.wait(400);
  }
  const r = await q.ev(() => window.__bwTest);
  console.log('AUTOTEST', JSON.stringify(r, null, 1));
  await q.done();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
