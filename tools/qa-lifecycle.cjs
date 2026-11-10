// Lifecycle soak: ten shift restarts, pause/resume, tab-hide pause, save/reload.
const { launch } = require('./qa-lib.cjs');
(async () => {
  const q = await launch('http://localhost:5173/?autostart=1&seed=3&shadows=0', { timeScale: 2, viewport: { width: 960, height: 540 } });
  const snap = () => q.ev(() => {
    const g = window.__bw, sh = g.shift;
    return {
      chars: sh.chars.size, npcs: sh.npcs.size, bodies: sh.phys.counts().bodies, colliders: sh.phys.counts().colliders,
      items: sh.items.all.size, interactables: sh.interactables.length,
      geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
    };
  });
  await q.sim(2);
  const first = await snap();
  console.log('restart 0', JSON.stringify(first));
  let last = first;
  for (let i = 1; i <= 10; i++) {
    await q.ev(() => window.__bw.restartShift());
    await q.until(() => window.__bw.state === 'playing' && window.__bw.shift && window.__bw.shift.time < 1);
    await q.sim(2);
    last = await snap();
    console.log('restart', i, JSON.stringify(last));
  }
  const stable = ['chars', 'npcs', 'bodies', 'colliders', 'items', 'interactables', 'textures'].every((k) => first[k] === last[k]) && Math.abs(first.geometries - last.geometries) <= 2;
  console.log('RESOURCE COUNTS STABLE ACROSS 10 RESTARTS:', stable);

  // retry path: restart through the pause menu, as a player would
  await q.key('Escape');
  await q.wait(400);
  await q.page.click('[data-a="restart"]');
  await q.until(() => window.__bw.state === 'playing' && window.__bw.shift && window.__bw.shift.time < 1);
  await q.sim(1);
  console.log('restart via pause menu:', JSON.stringify(await snap()));

  // torch: equip at the locker, select with the belt key, toggle with the use key
  await q.interact(-8.6, -5.9, 'Open locker', 0.1);
  await q.page.click('[data-gear="torch_basic"]');
  await q.page.click('[data-a="done"]');
  await q.wait(300);
  await q.key('1');
  await q.key('f');
  await q.wait(600);
  console.log('torch on after belt key + use key:', await q.ev(() => window.__bw.shift.torchOn));
  await q.ev(() => window.__qa.look(-10, -12, 0.2));
  await q.wait(800);
  await q.shot('life-torch');
  await q.key('f');

  // pause via Escape, resume via the button
  await q.key('Escape');
  await q.wait(300);
  const paused = await q.ev(() => ({ state: window.__bw.state, t: window.__bw.shift.time }));
  await q.wait(1500);
  const still = await q.ev(() => window.__bw.shift.time);
  console.log('pause: state', paused.state, 'time frozen:', still === paused.t);
  await q.shot('life-pause');
  await q.page.click('[data-a="resume"]');
  await q.wait(600);
  console.log('resumed:', await q.ev(() => window.__bw.state));

  // tab hide → paused, not fast-forwarded
  await q.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await q.wait(300);
  const hid = await q.ev(() => ({ state: window.__bw.state, t: window.__bw.shift.time }));
  await q.wait(2000);
  await q.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await q.wait(300);
  const back = await q.ev(() => ({ state: window.__bw.state, t: window.__bw.shift.time }));
  console.log('tab hide: state', hid.state, '→ on return', back.state, 'time unchanged:', hid.t === back.t);
  await q.page.click('[data-a="resume"]');

  // settings: reduced motion + rebinding survive a reload
  await q.key('Escape');
  await q.wait(300);
  await q.page.click('[data-a="settings"]');
  await q.page.check('#s-rm');
  await q.page.click('[data-bind="interact"]');
  await q.page.keyboard.press('g');
  await q.wait(300);
  await q.shot('life-settings');
  await q.page.click('[data-a="back"]');
  await q.page.click('[data-a="resume"]');
  await q.wait(300);
  console.log('rebinding applied:', await q.ev(() => ({ interact: window.__bw.input.bindings.interact, reduced: window.__bw.shift.env.reducedMotion })));
  await q.page.reload();
  await q.page.waitForFunction(() => window.__bw && window.__bw.state !== 'boot');
  console.log('after reload:', await q.ev(() => ({ interact: window.__bw.career.data.settings.bindings.interact, reduced: window.__bw.career.data.settings.reducedMotion, loadedFrom: window.__bw.career.loadedFrom })));
  await q.done();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
