// Full first-shift playthrough: kit → briefing → parking → shoplifting → review → second shift.
// Usage: node tools/qa-shift.cjs [mode] [extraQuery]   mode: chase (default) | innocent | escape
const { launch } = require('./qa-lib.cjs');
const mode = process.argv[2] || 'chase';
const extra = process.argv[3] || '';
const log = (...a) => console.log(`[${mode}]`, ...a);

async function kitUp(q, ids) {
  await q.interact(-8.6, -5.9, 'Open locker', 0.1);
  await q.wait(300);
  for (const id of ids) { await q.page.click(`[data-gear="${id}"]`); await q.wait(150); }
  await q.shot(`${mode}-locker`);
  await q.page.click('[data-a="done"]');
  await q.wait(300);
}

async function briefing(q) {
  await q.goto('st_brief');
  const d = await q.talk('sgt');
  log('sgt greets:', d.text);
  const r = await q.say('Ready for briefing');
  log('briefing:', r.text.slice(0, 90));
  await q.shot(`${mode}-briefing`);
  await q.leave();
}

async function clockOff(q) {
  await q.goto('st_brief');
  await q.talk('sgt');
  let r = await q.say('clock off');
  log('sgt:', r.text.slice(0, 100));
  const opts = r.opts;
  await q.say(opts.find((o) => o.includes('End the shift')) ? 'End the shift' : 'Clock off anyway');
  await q.until(() => window.__bw.state === 'review');
  await q.wait(400);
}

(async () => {
  const variant = mode === 'innocent' ? '&variant=innocent&who=toby' : '&variant=guilty&who=rhys';
  const q = await launch(`http://localhost:5173/?autostart=1&seed=11&shadows=0${variant}${extra}`, { timeScale: 4, viewport: { width: 960, height: 540 } });
  global.__q = q;
  const S = () => q.ev(() => { const s = window.__bw.shift.shoplifting; return { state: s.state, phase: s.phase, k: s.k }; });
  await q.wait(800);
  await kitUp(q, ['torch_basic', 'radio', 'notebook']);
  log('card:', await q.ev(() => window.__qa.card()));
  await briefing(q);
  log('card:', await q.ev(() => window.__qa.card()));

  // ---------------- arrive at the shop, take the owner's complaint
  await q.goto('pv_cp');
  await q.goto({ x: -3.2, z: 0.9 });
  await q.ev(() => window.__qa.look(1.5, 0.5, 0.1));
  await q.wait(1200);
  await q.shot(`${mode}-street`);
  await q.goto({ x: 0.3, z: -0.4 });
  let d = await q.talk('mara');
  log('mara greets:', d.text);
  d = await q.say('What is the problem');
  log('mara:', d.text.slice(0, 80));
  await q.shot(`${mode}-mara-talk`);
  await q.leave();
  // stand back and watch the street: Glen working, and whatever develops
  await q.goto({ x: 8.5, z: 1.4 });
  await q.ev(() => { window.__qa.look(0, -0.5, 0.1); window.__bw.timeScale = 2; });
  let seen = 0;
  while ((await S()).state === 'staged') {
    await q.sim(2);
    const g = await q.ev(() => window.__qa.npc('glen'));
    if ((g.motion !== 'animated' || g.plan === 'gather' || g.plan === 'acknowledge') && seen < 4) { seen++; await q.shot(`${mode}-glen-mishap-${seen}`); log('glen mishap:', g.plan, g.motion, 'stack', g.stack, JSON.stringify(await q.ev(() => window.__qa.subs()))); }
  }
  log('glen so far:', JSON.stringify((await q.ev(() => window.__qa.npc('glen'))).stats));

  // ---------------- shop theft
  log('shop:', JSON.stringify(await S()), 'subs', JSON.stringify(await q.ev(() => window.__qa.subs())));
  await q.shot(`${mode}-shout`);
  const who = mode === 'innocent' ? 'toby' : 'rhys';
  log('june beliefs:', JSON.stringify(await q.ev(() => window.__bw.shift.npcs.get('june').beliefs.filter((b) => ['TookItem', 'PaidAtTill', 'LeftWithItem', 'Shout'].includes(b.type)).map((b) => b.type + ':' + b.how))));

  if (mode === 'innocent') {
    // do it properly: account, till roll, then the customer
    await q.ev(() => window.__qa.chase('mara', 3.5));
    await q.until(() => window.__bw.shift.npcs.get('mara').char.pos.distanceTo(window.__bw.shift.player.pos) < 2.2);
    await q.ev(() => window.__qa.stop());
    d = await q.talk('mara');
    d = await q.say('What did you see');
    log('mara:', d.text.slice(0, 120));
    d = await q.say('till roll');
    log('till:', d.text.slice(0, 120));
    await q.leave();
    await q.ev((w) => window.__qa.chase(w, 3.5), who);
    await q.until((w) => window.__bw.shift.npcs.get(w).char.pos.distanceTo(window.__bw.shift.player.pos) < 2.0, who);
    await q.ev(() => window.__qa.stop());
    d = await q.talk(who);
    log(who, 'greets:', d.text);
    d = await q.say('Can I see your receipt');
    log(who + ':', d.text);
    await q.shot(`${mode}-receipt`);
    d = await q.say('That clears it up');
    log(who + ':', d && d.text);
    await q.leave();
    d = await q.talk('june');
    d = await q.say('Did you see what happened');
    log('june:', d.text);
    await q.leave();
    await q.ev(() => window.__qa.chase('mara', 3.5));
    await q.until(() => window.__bw.shift.npcs.get('mara').char.pos.distanceTo(window.__bw.shift.player.pos) < 2.2);
    await q.ev(() => window.__qa.stop());
    d = await q.talk('mara');
    d = await q.say('misunderstanding');
    log('mara:', d.text);
    await q.leave();
  } else {
    // pursue (or, in escape mode, hesitate and lose them)
    if (mode === 'chase') await q.ev((w) => window.__qa.chase(w, 5.8), who);
    let called = false, shots = 0, n = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 900000) {
      const st = await S();
      if (['stopped', 'escaped'].includes(st.phase)) break;
      await q.ev((w) => window.__qa.lookAtChar(w, 0.1), who);
      const p = await q.ev(() => window.__qa.prompt());
      if (mode === 'chase' && p && p.includes('Detain')) { await q.page.keyboard.press('e'); log('pressed Detain'); }
      else if (p && p.includes('Call out') && !called) { await q.key('e'); called = true; log('called out'); await q.shot(`${mode}-callout`); }
      if (st.phase === 'fleeing' && shots < 4 && ++n % 6 === 0) { shots++; await q.shot(`${mode}-chase-${shots}`); log('chase:', JSON.stringify(await q.ev((w) => ({ sus: window.__qa.npc(w), me: window.__qa.pos(), stamina: Number(window.__bw.shift.player.stamina.toFixed(2)) }), who)).slice(0, 330)); }
      await q.wait(120);
    }
    await q.ev(() => window.__qa.stop());
    const st = await S();
    log('pursuit ended:', JSON.stringify(st), 'sus', JSON.stringify(await q.ev((w) => window.__qa.npc(w), who)));
    await q.wait(600);
    await q.shot(`${mode}-pursuit-end`);
    await q.ev(() => { window.__bw.timeScale = 4; });
    if (st.phase === 'stopped') {
      d = await q.talk(who);
      log(who + ':', d.text, JSON.stringify(d.opts));
      d = await q.say('What have you got there');
      log(who + ':', d.text);
      if (d.opts.find((o) => o.includes('Hand over the tin'))) { d = await q.say('Hand over the tin'); log(who + ':', d.text); }
      d = await q.say('I am arresting you');
      log(who + ':', d.text);
      await q.shot(`${mode}-arrest`);
      await q.leave();
      // escort back to the station
      await q.goto('st_brief', 3.0, 600000);
      await q.until((w) => window.__bw.shift.npcs.get(w).char.pos.distanceTo(window.__bw.shift.npcs.get('sgt').char.pos) < 7, who, 600000);
      await q.ev(() => window.__qa.look(-15, -7, 0.15));
      await q.wait(800);
      await q.shot(`${mode}-escort`);
      d = await q.talk('sgt');
      d = await q.say('Detainee for you');
      log('sgt:', d.text);
      await q.leave();
    }
    // recover a dropped tin if there is one
    const tin = await q.ev(() => { const it = window.__bw.shift.items.get('tin_01'); const p = window.__bw.shift.items.worldPos('tin_01'); return { state: it.state, place: it.place, pos: [p.x, p.y, p.z] }; });
    log('tin:', JSON.stringify(tin), 'carried', JSON.stringify(await q.ev(() => window.__bw.shift.carried)));
    if (tin.state === 'world') {
      await q.goto({ x: tin.pos[0] + 0.6, z: tin.pos[2] + 0.6 }, 3.5, 600000);
      await q.interact(tin.pos[0], tin.pos[2], 'Pick up', 0.8);
      await q.key('e'); // idempotency: a second press must not collect it again
      log('carried after pickup:', JSON.stringify(await q.ev(() => window.__bw.shift.carried)));
    }
    if (mode === 'escape' && (await q.ev(() => window.__bw.shift.carried.length)) === 0) {
      d = await q.talk('mara');
      d = await q.say('What did you see');
      log('mara account:', d.text.slice(0, 100));
      await q.leave();
    }
    if ((await q.ev(() => window.__bw.shift.carried.length)) > 0) {
      await q.goto({ x: 0.2, z: -1.4 }, 3.5, 600000);
      await q.ev(() => window.__qa.chase('mara', 3.5));
      await q.until(() => window.__bw.shift.npcs.get('mara').char.pos.distanceTo(window.__bw.shift.player.pos) < 2.2, null, 600000);
      await q.ev(() => window.__qa.stop());
      d = await q.talk('mara');
      d = await q.say('What did you see');
      d = await q.say('Here is your shortbread tin');
      log('mara:', d.text);
      await q.shot(`${mode}-returned`);
      await q.leave();
    }
  }

  // ---------------- back to the parking complaint, if it is still live
  await q.ev(() => { window.__bw.timeScale = 4; });
  if (await q.ev(() => window.__bw.shift.parking.isLive() && !window.__bw.shift.parking.moveRequested)) {
    const near = () => q.until(() => { const n = window.__bw.shift.npcs.get('glen'); return n.char.pos.distanceTo(window.__bw.shift.player.pos) < 2.0 && n.char.motion === 'animated' && !n.char.hidden; }, null, 600000);
    await q.goto('pv_shop', 3.5, 600000);
    await q.ev(() => window.__qa.chase('glen', 3.5));
    await near();
    await q.ev(() => window.__qa.stop());
    d = await q.talk('glen');
    log('glen greets:', d.text);
    d = await q.say('Is this your van');
    log('glen:', d.text.slice(0, 80));
    await q.leave();
    if (!(await q.ev(() => window.__bw.shift.town.van.atBay))) {
      await q.goto({ x: 2.4, z: 2.2 });
      await q.interact(2.6, 3.4, 'Inspect', 0.05);
      await q.shot(`${mode}-van-inspect`);
    }
    await q.ev(() => window.__qa.chase('glen', 3.5));
    await near();
    await q.ev(() => window.__qa.stop());
    d = await q.talk('glen');
    if (d.opts.find((o) => o.includes('Please move the van'))) {
      d = await q.say('Please move the van');
      log('glen on move:', d.text);
    }
    await q.leave();
    log('card:', await q.ev(() => window.__qa.card()));
    await q.goto({ x: 9, z: 1.2 });
    await q.ev(() => window.__qa.look(16, 3.5, 0.1));
  }
  // by now the van should have gone to the bay
  await q.until(() => window.__bw.shift.parking.outcome, null, 900000);
  await q.wait(800);
  await q.shot(`${mode}-van-moved`);
  log('parking outcome:', await q.ev(() => window.__bw.shift.parking.outcome), 'ledger', JSON.stringify(await q.ev(() => window.__bw.shift.ledger.map((l) => `${l.key}:${l.xp || l.trust}`))));
  // notebook
  await q.key('Tab');
  await q.wait(400);
  await q.shot(`${mode}-notebook`);
  log('notebook:', JSON.stringify(await q.ev(() => window.__bw.shift.casebook.notes.map((n) => `${n.kind}: ${n.text.slice(0, 70)}`))));
  await q.key('Tab');
  await q.wait(300);
  await clockOff(q);
  await q.shot(`${mode}-review`);
  log('review:', await q.ev(() => document.querySelector('.panel').innerText.replace(/\n+/g, ' | ').slice(0, 900)));
  log('career:', JSON.stringify(await q.ev(() => { const d = window.__bw.career.data; return { xp: d.xp, trust: d.trust, owned: d.owned, shifts: d.shiftsCompleted, mem: d.memories }; })));

  // ---------------- second shift without reloading
  await q.page.click('[data-a="next"]');
  await q.until(() => window.__bw.state === 'playing' && window.__bw.shift);
  await q.ev(() => { window.__bw.timeScale = 4; });
  await q.wait(800);
  log('shift 2 started: shiftNo', await q.ev(() => window.__bw.shift.shiftNo), 'chars', await q.ev(() => window.__bw.shift.chars.size), 'bodies', JSON.stringify(await q.ev(() => window.__bw.shift.phys.counts())));
  await kitUp(q, ['evidence_kit']);
  log('belt:', JSON.stringify(await q.ev(() => window.__bw.career.data.belt)));
  await q.shot(`${mode}-shift2-start`);
  await briefing(q);
  await q.goto('pv_cp'); await q.goto({ x: 0.3, z: -0.4 });
  d = await q.talk('mara');
  log('shift 2 mara greets:', d.text);
  await q.leave();
  await q.shot(`${mode}-shift2-mara`);
  await q.done();
})().catch(async (e) => {
  console.error('FAILED', e.message.split('\n')[0], e.stack.split('\n').slice(1, 4).join(' | '));
  try {
    const q = global.__q;
    await q.shot(`${mode}-FAIL`);
    console.log('fail state:', JSON.stringify(await q.ev(() => ({ state: window.__bw.state, pos: window.__bw.shift && window.__qa.pos(), prompt: window.__qa.prompt(), dlg: window.__qa.dialogue(), card: window.__qa.card(), arrived: window.__qa.arrived, path: window.__qa.path && window.__qa.path.length, screen: window.__bw.screens.current }))));
    await q.done();
  } catch (e2) { console.error(e2.message); }
  process.exit(1);
});
