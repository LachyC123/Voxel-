// Movement matrix: steps, platform, narrow passage, a real door prompt, tight interior camera, torch.
const { launch } = require('./qa-lib.cjs');
(async () => {
  const q = await launch('http://localhost:5173/?scenario=yard&seed=9&shadows=0', { timeScale: 2, viewport: { width: 1280, height: 720 } });
  const P = () => q.ev(() => { const p = window.__bw.shift.player.pos; return [Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))]; });
  await q.wait(500);
  // up the three steps onto the loading platform
  await q.goto('y3');
  await q.direct(-30.4, -11.5);
  console.log('at foot of steps', JSON.stringify(await P()));
  await q.direct(-33.6, -11.5, 2.5);
  const top = await P();
  console.log('on platform', JSON.stringify(top), 'climbed:', top[1] > 0.8);
  await q.ev(() => window.__qa.look(-33.5, -11.4, 0.5));
  await q.wait(800);
  await q.shot('walk-platform');
  // shove the crate about, then come back down
  await q.direct(-33.5, -11.0, 3.0).catch(() => null);
  await q.direct(-33.6, -11.5, 2.5);
  await q.direct(-30.4, -11.5, 2.5);
  const down = await P();
  console.log('back down', JSON.stringify(down), 'crate', JSON.stringify(await q.ev(() => { const t = window.__bw.shift.phys.dyn.get('yard_crate').body.translation(); return [t.x.toFixed(2), t.y.toFixed(2), t.z.toFixed(2)]; })));
  // through the 1.25 m passage between the store and the bike shed
  await q.goto('y3'); await q.goto('y4'); await q.goto('y5');
  await q.goto('y6', 3.5);
  const through = await P();
  console.log('through narrow passage', JSON.stringify(through), 'ok:', through[0] > -31.5);
  await q.ev(() => window.__qa.look(-36, -5.57, 0.1));
  await q.wait(600);
  await q.shot('walk-passage');
  // the yard door, opened with the on-screen prompt
  await q.goto({ x: -23.3, z: -5 });
  await q.interact(-21.9, -5, 'Open', 0.1);
  await q.until(() => window.__bw.shift.town.doors.isOpen('station_yard'), null, 60000);
  console.log('yard door open via prompt:', await q.ev(() => window.__bw.shift.town.doors.isOpen('station_yard')));
  await q.goto({ x: -20.6, z: -5 }, 2.5);
  const inside = await P();
  console.log('inside reception', JSON.stringify(inside), await q.ev(() => window.__bw.shift.town.roomAt(window.__bw.shift.player.pos.x, window.__bw.shift.player.pos.z).id));
  // tight interior framing: camera must stay inside the room (never above the ceiling or through a wall)
  await q.ev(() => window.__qa.look(-17, -8, 0.3));
  await q.wait(800);
  const cam = await q.ev(() => { const c = window.__bw.rig.camera.position; return [Number(c.x.toFixed(2)), Number(c.y.toFixed(2)), Number(c.z.toFixed(2))]; });
  console.log('camera', JSON.stringify(cam), 'inside room:', cam[0] > -21.9 && cam[0] < -13 && cam[1] < 3.37 && cam[2] > -12.9 && cam[2] < -2.1);
  await q.shot('walk-reception-from-yard');
  // closing with someone in the swing: the leaf must stop against them, not force through
  await q.interact(-21.9, -5, 'Close', 0.1);
  await q.sim(3);
  const blocked = await q.ev(() => Math.abs(window.__bw.shift.town.doors.get('station_yard').angle) > 0.3);
  console.log('door held open by the officer standing in its swing:', blocked, 'officer still at', JSON.stringify(await P()));
  // step clear and it finishes closing
  await q.direct(-20.5, -6.0, 2.0);
  await q.until(() => window.__bw.shift.town.doors.isClosed('station_yard') || Math.abs(window.__bw.shift.town.doors.get('station_yard').angle) < 0.05, null, 60000);
  console.log('yard door closed via prompt:', await q.ev(() => Math.abs(window.__bw.shift.town.doors.get('station_yard').angle) < 0.05));
  // corner squeeze against the cabinets, sprinting: must not trap
  await q.direct(-18.5, -11.2, 5.8, 15000).catch(() => null);
  await q.goto('st_rec', 5.8);
  console.log('sprint round furniture ok', JSON.stringify(await P()));
  await q.done();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
