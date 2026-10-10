// W2b: traps and mischief. The five traps (soap, marbles, the bucket on a door, the alarm clock, the
// rope across a doorway) bought in the shop and lying in the van; what each does to the guard (knocked
// out, then suspicious and angry; the same kind again: «Не цього разу»), the mischief points and the
// combos, contract 7 «Довгий вечір Петровича» (stars from the points, the customer's and the crew's
// lines), «Без тривоги» without traps; both maps; the phone, the PC and the VR emulator.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview, playPhone, standFacing, keepFor, tp, touchT, touchEndAt } from './runner.mjs';

// a short tap on the phone's action button («Покласти»)
async function pressAct(page, cdp) {
  const b = await page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('#touch .act').getBoundingClientRect())));
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t = touchT();
  await tp(cdp, 'touchStart', [pt], t); await page.waitForTimeout(120);
  await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.12));
  await keepFor(page, 200);
}
async function pressEl(page, cdp, sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 5000 });
  if (sel.startsWith('#pausemenu')) await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(100);
  const b = await page.locator(sel).first().boundingBox();
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t = touchT();
  await tp(cdp, 'touchStart', [pt], t); await page.waitForTimeout(120);
  await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.12));
  await page.waitForTimeout(200);   // real time: in the pause the game's clock stands
}
const KEY = (url) => (url.includes('/preview/') ? 'nocturne.preview.wallet' : 'nocturne.wallet');
// A page with a wallet ({ cash, stock }) saved before the game starts; a round with the clock running.
async function round(url = base, { guard = true, stock = {}, cash = 0, openAll = false, trial = true, ctxOpts, limit = 3 } = {}) {
  const ctx = await newContext(browser, ctxOpts);
  await ctx.addInitScript(([key, w, openAll]) => {
    try {
      if (!sessionStorage.getItem('w2b.once')) { localStorage.setItem(key, JSON.stringify(w)); sessionStorage.setItem('w2b.once', '1'); }
      if (openAll) localStorage.setItem('nocturne.preview.openAll', 'true');
    } catch { /* opaque */ }
  }, [KEY(url), { cash, earned: 0, spent: 0, owned: [], paid: {}, log: [], stock, trialSoap: trial }, openAll]);
  const { page, errors } = await open(ctx, url);
  await page.evaluate(([guard, limit]) => {
    const g = window.__game;
    g.CFG.traps.limit = limit;
    window.__said = [];
    for (const p of g.guards) { const s = p.env.say; p.env.say = (t) => { window.__said.push(t); s(t); }; }
    g.sim(0.1);   // the van is loaded (phase «ready»)
    window.__van = g.loot.items.filter((i) => i.trap && !i.gone).map((i) => ({ kind: i.trap, inVan: i.inVan, y: +i.mesh.position.y.toFixed(2), z: +i.mesh.position.z.toFixed(2) }));
    g.newRound(); g.playing = true;
    if (!guard) for (const p of g.guards) p.update = () => null;
    for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);
  }, [guard, limit]);
  return { ctx, page, errors };
}
// in the page: helpers
const HELPERS = `
  window.__h = (() => {
    const g = window.__game;
    const park = (P, x, z, f) => { P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.x = x; P.z = z; P.y = f ? 3 : 0; P.queue.push({ type: 'wait', t: 999, label: 'test' }); };
    const until = (fn, s = 60) => { for (let t = 0; t < s && !fn(); t += 0.25) g.sim(0.25); return fn(); };
    const trap = (kind) => g.loot.items.find((i) => i.trap === kind && !i.gone && !i.armed);
    // put a floor trap down at (x, z) on the floor y (as if let go there)
    const put = (kind, x, z, y = 0) => { const it = trap(kind); it.inVan = false; it.held = false; it.state = 'rest'; it.vel.set(0, 0, 0); it.mesh.position.set(x, y, z); g.sim(0.05); return it; };
    return { g, park, until, trap, put };
  })();`;

test('the van: the traps bought lie on the cargo floor (3 a round), not loot; soap — the guard slips, «Ой!.. Хто мило розлив?!», lies 6 s, lights the floor 5 s, then suspicious (+35) and angry (x1.1 for 60 s), never a full alarm; the same kind again: it sees it, «Не цього разу», picks it up; +100 points; the stock spent', async () => {
  const { ctx, page, errors } = await round(base, { stock: { soap: 2, marbles: 1, bucket: 1, clock: 1, rope: 1 } });
  const van = await page.evaluate(() => window.__van);
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, park, until, put } = window.__h, P = g.patrol, out = {};
    const { mischief } = await import('./src/game/mischief.js'), { stockOf } = await import('./src/game/economy.js');
    out.inRound = g.loot.items.filter((i) => i.trap && !i.gone).map((i) => i.trap);
    out.total = g.loot.tally().total; out.sum = g.loot.tally().sum;
    g.player.teleport(6, 4, 0);
    park(P, -6, -6.2);
    const s0 = g.alert.suspicion;
    const soap = put('soap', -6, -6.2);
    out.armed = soap.armed === false && soap.gone;   // sprung at once: the guard stands on it
    out.stun = { stunT: +P.stunT.toFixed(1), pose: P.pose, said: window.__said.slice(), score: mischief.score, stock: stockOf('soap') };
    g.sim(3); out.mid = { stunT: P.stunT > 0, audible: P.audible({ x: P.x, z: P.z, radius: 30, kind: 'drop' }, 0) };
    until(() => P.stunT <= 0, 10);
    g.sim(0.5);
    out.after = { label: P.queue[0] && P.queue[0].label, sightK: P.mods && P.mods.sightK };
    until(() => P.brain.angryT > 0, 10);
    out.angry = { angryT: Math.round(P.brain.angryT), dSusp: Math.round(g.alert.suspicion - s0), full: g.alert.full, k: +P.brain.speedK.toFixed(2) };
    // the second soap: it sees it
    until(() => !P.queue.some((s) => s.label && s.label.includes('злий')), 5);
    park(P, -4, -6.2); window.__said.length = 0;
    const soap2 = put('soap', -4.6, -6.2);
    g.sim(0.2);
    out.again = { stunT: P.stunT, said: window.__said.slice() };
    until(() => soap2.gone, 6);
    out.againGone = { gone: soap2.gone, score: mischief.score, stock: stockOf('soap') };
    return out;
  }, HELPERS);
  assert.deepEqual(van.map((v) => v.kind), ['soap', 'soap', 'marbles'], 'the first three in the shop order');
  assert.ok(van.every((v) => v.inVan && v.y > 0.3), 'on the cargo floor');
  assert.deepEqual(r.inRound, ['soap', 'soap', 'marbles']);
  assert.equal(r.total, 8, 'the traps are not loot');
  assert.equal(r.armed, true);
  assert.equal(Math.round(r.stun.stunT), 6); assert.equal(r.stun.pose, 'flip');
  assert.deepEqual(r.stun.said, ['Ой!.. Хто мило розлив?!']);
  assert.equal(r.stun.score, 100); assert.equal(r.stun.stock, 1);
  assert.deepEqual(r.mid, { stunT: true, audible: 0 }, 'knocked out: deaf');
  assert.equal(r.after.label, 'шукає ліхтарик'); assert.equal(r.after.sightK, 0.3);
  assert.equal(r.angry.angryT, 60); assert.equal(r.angry.dSusp, 35); assert.equal(r.angry.full, false); assert.equal(r.angry.k >= 1.1, true);
  assert.equal(r.again.stunT, 0, 'the same kind: no fall');
  assert.deepEqual(r.again.said, ['Не цього разу.']);
  assert.deepEqual(r.againGone, { gone: true, score: 100, stock: 0 }, 'picked up: gone, no points');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the other traps (dacha): marbles — falls 3 s, then kneels and picks them up 15 s (hearing x0.5, sight x0.3); the bucket on a door — the guard opens it: blind with the bucket on, then takes it off; you open it: it just falls; the rope across a doorway — it trips walking through; the alarm clock rings 30 s later, the guard goes to switch it off («Сьома?! Яка сьома…»); combos x2, x3 «Шедевр»; a device +50', async () => {
  const { ctx, page, errors } = await round(base, { stock: { marbles: 1, bucket: 2, clock: 1, rope: 1 }, limit: 5 });
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, park, until, put, trap } = window.__h, P = g.patrol, out = {};
    const { mischief } = await import('./src/game/mischief.js'), T = await import('./src/systems/traps.js'), { stockOf } = await import('./src/game/economy.js');
    out.van = g.loot.items.filter((i) => i.trap && !i.gone).map((i) => i.trap);
    const calm = () => { P.brain.angryT = 0; g.alert.suspicion = 0; P.brain.trapsHit.clear(); };
    g.player.teleport(6, 4, 0);
    // marbles
    park(P, -6, -6.2); window.__said.length = 0;
    put('marbles', -6.3, -6.2);
    out.marbles = { stunT: Math.round(P.stunT), pose: P.pose, said: window.__said.slice() };
    until(() => P.stunT <= 0, 5); g.sim(0.3);
    out.marblesAfter = { label: P.queue[0] && P.queue[0].label, pose: P.pose, mods: P.mods && { hearK: P.mods.hearK, fovK: P.mods.fovK } };
    until(() => P.brain.angryT > 0, 20); calm();
    // the bucket: on the door the guard opens
    const doors = g.level.doors.filter((d) => !d.locked && d.floor === 0 && !d.open).sort((a, b) => Math.hypot(a.cx, a.cz + 3) - Math.hypot(b.cx, b.cz + 3));
    const d = doors[0];
    g.player.teleport(d.cx, d.cz, 0); g.sim(0.05);
    const b1 = trap('bucket'); out.placed = T.placeAtDoor(b1); out.onDoor = b1.door === d && b1.armed;
    g.player.teleport(6, 4, 0);
    park(P, d.cx + 0.6, d.cz + 0.6); window.__said.length = 0;
    d.toggle(P.x, P.z); d.lastUser = 'patrol'; g.sim(0.5);
    out.bucket = { stunned: P.stunT > 0 || P.pose === 'bucket', pose: P.pose, mesh: !!(P.bucketMesh && P.bucketMesh.visible), said: window.__said.slice(), gone: b1.gone };
    until(() => P.stunT <= 0, 3); g.sim(0.3);
    out.blind = { label: P.queue[0] && P.queue[0].label, sightK: P.mods && P.mods.sightK, pose: P.pose };
    until(() => P.brain.angryT > 0, 15); out.bucketOff = P.pose; calm();
    // the second bucket: you open the door
    d.toggle(P.x, P.z); g.sim(1.5);   // closed again
    g.player.teleport(d.cx, d.cz, 0); g.sim(0.05);
    const b2 = trap('bucket'); T.placeAtDoor(b2);
    const s0 = mischief.score;
    d.toggle(d.cx + 1, d.cz + 1); d.lastUser = 'player'; g.sim(0.5);
    out.yours = { gone: b2.gone, msg: g.flashText, score: mischief.score - s0 };
    g.player.teleport(6, 4, 0);
    // the rope: across a doorway; the guard walks through
    d.toggle(P.x, P.z); g.sim(1.5);
    g.player.teleport(d.cx, d.cz, 0); g.sim(0.05);
    const rope = trap('rope'); T.placeAtDoor(rope); out.ropeArmed = rope.armed;
    g.player.teleport(6, 4, 0);
    const nx = Math.cos(d.base + Math.PI / 2), nz = -Math.sin(d.base + Math.PI / 2);
    park(P, d.cx + nx * 1.5, d.cz + nz * 1.5); P.queue.length = 0; window.__said.length = 0;
    P.queue.push({ type: 'walk', to: [d.cx - nx * 1.5, d.cz - nz * 1.5, 0], label: 'test' });
    out.tripped = until(() => P.stunT > 0, 15);
    out.rope = { pose: P.pose, said: window.__said.slice(), gone: rope.gone };
    until(() => P.brain.angryT > 0, 10); calm();
    // the alarm clock: rings 30 s later; the guard goes
    park(P, -2, -4); window.__said.length = 0;
    const clock = put('clock', 0, -4);
    g.sim(29); out.silent = !clock.dev;
    g.sim(1.5); out.ringing = !!(clock.dev && clock.dev.ringing);
    out.claimed = until(() => clock.dev && clock.dev.claimed === P, 5);
    const s1 = mischief.score;
    out.clockOff = until(() => clock.gone, 30);
    out.clock = { said: window.__said.slice(0, 1), score: mischief.score - s1 >= 0 };
    // combos: three tricks within 10 s; then a pause
    mischief.reset();
    T.score('throw'); const f1 = g.flashText; g.sim(2); T.score('hit'); const f2 = g.flashText; g.sim(2); T.score('trap'); const f3 = g.flashText;
    g.sim(11); T.score('device'); const f4 = g.flashText;
    out.combo = { f: [f1, f2, f3, f4], score: mischief.score, best: mischief.best, text: T.mischiefText() };
    out.stock = ['marbles', 'bucket', 'clock', 'rope'].map(stockOf);
    return out;
  }, HELPERS);
  assert.deepEqual(r.van, ['marbles', 'bucket', 'bucket', 'clock', 'rope']);
  assert.deepEqual(r.marbles, { stunT: 3, pose: 'flip', said: ['Горіхи?! У холі?!'] });
  assert.deepEqual(r.marblesAfter, { label: 'збирає кульки', pose: 'kneel', mods: { hearK: 0.5, fovK: 0.3 } });
  assert.equal(r.placed, true); assert.equal(r.onDoor, true);
  assert.equal(r.bucket.stunned, true); assert.equal(r.bucket.mesh, true); assert.deepEqual(r.bucket.said, ['Відро?! Серйозно?!']); assert.equal(r.bucket.gone, true);
  assert.equal(r.blind.label, 'знімає відро'); assert.equal(r.blind.sightK, 0); assert.equal(r.blind.pose, 'bucket');
  assert.equal(r.bucketOff, null, 'the bucket is off');
  assert.deepEqual(r.yours, { gone: true, msg: 'Відро впало. Не на того', score: 0 });
  assert.equal(r.ropeArmed, true); assert.equal(r.tripped, true);
  assert.equal(r.rope.pose, 'kneel'); assert.deepEqual(r.rope.said, ['Хто натягнув?!']); assert.equal(r.rope.gone, true);
  assert.equal(r.silent, true, 'quiet for 30 s'); assert.equal(r.ringing, true); assert.equal(r.claimed, true);
  assert.equal(r.clockOff, true); assert.deepEqual(r.clock.said, ['Сьома?! Яка сьома…']);
  assert.deepEqual(r.combo.f, ['+30', '+100 · комбо ×2', '+300 · комбо ×3 · Шедевр!', '+50']);
  assert.equal(r.combo.score, 480); assert.equal(r.combo.best, 3); assert.equal(r.combo.text, 'Шкода: 480 · комбо ×3');
  assert.deepEqual(r.stock, [0, 0, 0, 0], 'all spent');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a trap in a chase: the chase stops, it lies there, then it hunts where it saw you last; on a table: «Тут не можна», not armed; picked up again: back in the hand; the progress code carries the stock; easy: knocked out x1.2', async () => {
  const { ctx, page, errors } = await round(base, { stock: { soap: 2, marbles: 1 } });
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, park, until, put, trap } = window.__h, P = g.patrol, out = {};
    const { exportProgress, readCode } = await import('./src/game/progress.js');
    g.player.teleport(6, 4, 0);
    // a chase
    park(P, -6, -6.2); P.queue.length = 0; P.state = 'chase'; P.lastSeen = { x: -2, z: -4 };
    put('marbles', -6, -6.2);
    out.stopped = { state: P.state, stun: P.stunT > 0 };
    out.hunts = until(() => P.state === 'hunt', 30);
    out.goal = P.goal && P.goal.map((v) => +v.toFixed(1));
    // on a table (the kitchen): not armed, «Тут не можна»
    const tables = [[-5.5, -1.6], [-6, -2], [-5, -2.2]];
    let spot = null;
    for (const [x, z] of tables) { const y = g.level.surfaceAt(x, z, 1.2); if (y > 0.5) { spot = [x, z, y]; break; } }
    const s = trap('soap'); s.inVan = false; s.state = 'rest'; s.mesh.position.set(spot[0], spot[2], spot[1]); g.sim(0.1);
    out.table = { armed: s.armed, msg: g.flashText };
    // picked up from the floor: back in the hand, not armed
    s.mesh.position.set(0, 0, -3.2); s.warned = false; g.sim(0.1); out.floorArmed = s.armed;
    g.hands.deskAim = s; g.hands.toggleDesk(g.player.head, g.player.yaw, false); g.sim(0.1);
    out.picked = { held: g.hands.desk === s, armed: s.armed };
    // the progress code
    const code = exportProgress().code, data = readCode(code).data;
    out.codeStock = JSON.parse(data.wallet).stock;
    return out;
  }, HELPERS);
  assert.deepEqual(r.stopped, { state: 'task', stun: true });
  assert.equal(r.hunts, true, 'after: it hunts');
  assert.deepEqual(r.goal, [-2, -4], 'where it saw you last');
  assert.deepEqual(r.table, { armed: false, msg: 'Тут не можна' });
  assert.equal(r.floorArmed, true);
  assert.deepEqual(r.picked, { held: true, armed: false });
  assert.deepEqual(r.codeStock, { soap: 2, marbles: 0 });
  // easy: x1.2
  const e = await page.evaluate(async (H) => {
    eval(H);
    const g = window.__game; g.newRound(); g.setDifficulty('easy'); g.sim(0.1); g.playing = true;
    g.player.teleport(0, -2.5, 0); g.sim(0.3); g.player.teleport(6, 4, 0);
    const { park, put } = window.__h, P = g.patrol;
    park(P, -6, -6.2); put('soap', -6, -6.2);
    return Math.round(P.stunT * 10) / 10;
  }, HELPERS);
  assert.ok(Math.abs(e - 7.2) < 0.15, `easy soap ${e}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('contract 7 «Довгий вечір Петровича»: after «Ривок»; the customer\'s lines and Zoya\'s on the start screen and the board; 6 traps a round and one free soap (once); the loot does not count: 500 points = ★, 1000 or a x3 combo = ★★; under 500: not done; the crew after; «Без тривоги»: no traps; the shop: 5 traps, bought before the round only, the stock', async () => {
  const { ctx, page, errors } = await round(preview, { stock: { marbles: 3, rope: 3 }, cash: 1000, openAll: true, trial: false, guard: false });
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {};
    const { mischief } = await import('./src/game/mischief.js'), T = await import('./src/systems/traps.js'), E = await import('./src/systems/economy.js'), { stockOf, lockOf, buyTrap } = await import('./src/game/economy.js');
    const ev = g.CFG.contracts.find((c) => c.id === 'evening');
    out.order = g.CFG.contracts.map((c) => c.id).slice(-2);
    out.name = ev.name; out.goal = g.goalText(ev, g.loot.items);
    g.newRound(); g.setContract('evening'); g.sim(0.1);
    out.van = g.loot.items.filter((i) => i.trap && !i.gone).map((i) => i.trap);
    out.info = document.getElementById('contractinfo').textContent;
    out.before = T.storyBefore(ev);
    // the shop: the trap rows; buying one puts it in the van
    out.rows = E.shopRows().filter((x) => x.id.startsWith('trap:')).map((x) => x.name);
    E.buyUpgrade('trap:soap'); g.sim(0.1);
    out.bought = { cash: JSON.parse(localStorage.getItem('nocturne.preview.wallet')).cash, soap: stockOf('soap'), van: g.loot.items.filter((i) => i.trap && !i.gone).length };
    // a round: 500 points in single tricks (no combo) = ★
    g.player.teleport(0, -2.5, 0); g.sim(0.3);
    out.inRound = buyTrap('soap', g.round.phase).why;
    out.trialAgain = (await import('./src/game/economy.js')).trialSoap();
    for (let i = 0; i < 5; i++) mischief.add('trap', 100 + i * 20);
    g.sim(0.2);
    out.hud = g.progress(g.contract, g.loot.tally(), g.loot).text;
    g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('left'); g.sim(0.3);
    out.one = { stars: g.verdict.stars, goal: g.verdict.goal, after: T.storyAfter(g.contract, g.verdict), extra: T.mischiefText() };
    // ★★ by a x3 combo
    g.newRound(); g.player.teleport(0, -2.5, 0); g.sim(0.3);
    T.score('trap'); T.score('trap'); T.score('trap');
    g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('left'); g.sim(0.3);
    out.two = { stars: g.verdict.stars, bonus: g.verdict.bonus, score: mischief.score };
    // under 500: not done
    g.newRound(); g.player.teleport(0, -2.5, 0); g.sim(0.3);
    T.score('throw');
    g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('left'); g.sim(0.3);
    out.fail = { stars: g.verdict.stars, why: g.verdict.why, after: T.storyAfter(g.contract, g.verdict) };
    // «Без тривоги»: no traps in the van
    g.newRound(); g.setContract('quiet'); g.sim(0.1);
    out.quiet = { van: g.loot.items.filter((i) => i.trap && !i.gone).length, msg: g.flashText, limit: T.roundLimit() };
    out.lock = (() => { localStorage.removeItem('nocturne.preview.openAll'); const l = lockOf(ev); localStorage.setItem('nocturne.preview.openAll', 'true'); return l; })();
    return out;
  });
  assert.deepEqual(r.order, ['rush', 'evening'], 'contract 7 after «Ривок»');
  assert.equal(r.name, 'Довгий вечір Петровича');
  assert.equal(r.goal, '500 очок шкоди');
  assert.deepEqual(r.van, ['soap', 'marbles', 'marbles', 'marbles', 'rope', 'rope'], '6 a round, the free soap first');
  assert.ok(r.info.startsWith('Петрович має забути про спокій. Зробіть ніч найгучнішою в його житті. Не для вас. Для шафи. Без синців. pp. Зоя: Без синців. Фроле, це про тебе.'), r.info);
  assert.equal(r.before.crew, 'Зоя: Без синців. Фроле, це про тебе.');
  assert.deepEqual(r.rows, ['Мило · у запасі ×1', 'Кульки · у запасі ×3', 'Відро · у запасі ×0', 'Будильник · у запасі ×0', 'Мотузка · у запасі ×3']);
  assert.deepEqual(r.bought, { cash: 850, soap: 2, van: 6 }, 'the limit holds: still 6');
  assert.equal(r.inRound, 'phase'); assert.equal(r.trialAgain, false, 'the free soap only once');
  assert.equal(r.hud, 'Шкода: 500 / 500');
  assert.equal(r.one.goal, true); assert.equal(r.one.stars, 1);
  assert.deepEqual(r.one.after, { line: 'Чув із Пагорбів. Шафа теж. Акт перший. pp.', crew: 'Рита: pp — це піанісимо. Він музикант.' });
  assert.equal(r.one.extra, 'Шкода: 500');
  assert.deepEqual(r.two, { stars: 2, bonus: true, score: 600 });
  assert.equal(r.fail.stars, 0); assert.ok(r.fail.why.includes('шкода 30 з 500'), r.fail.why.join()); assert.equal(r.fail.after, null);
  assert.deepEqual(r.quiet, { van: 0, msg: 'У цьому контракті без пасток', limit: 0 });
  assert.ok(r.lock, 'closed until «Ривок» has a star');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the mansion: Valera on soap «Пункт сім: не ковзати.», Zhora on marbles «Кульки?! Я на них… ой.»; the other guard hears and comes; Valera\'s «Не цього разу. Пункт вісім.»', async () => {
  const { ctx, page, errors } = await round(preview + '?map=mansion', { stock: { soap: 2, marbles: 1 }, openAll: true });
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, park, until, put } = window.__h, [V, Z] = [g.patrol, g.patrol2], out = { id: g.level.id };
    g.player.teleport(18, -6, 0); g.sim(0.3);
    park(V, 0, -8.5, 0); park(Z, 4, -8.5, 1); window.__said.length = 0;
    put('soap', 0, -8.5, 0);
    out.valera = { stun: V.stunT > 0, said: window.__said.slice(), zhoraComes: Z.state === 'react' || Z.state === 'investigate' };
    until(() => V.brain.angryT > 0, 20);
    park(Z, 4, -8.5, 1); window.__said.length = 0;
    put('marbles', 4, -8.5, 3);
    out.zhora = { stun: Z.stunT > 0, said: window.__said.slice() };
    park(V, 2, -8.5, 0); window.__said.length = 0;
    put('soap', 2.6, -8.5, 0); g.sim(0.3);
    out.again = { stun: V.stunT > 0, said: window.__said.slice() };
    return out;
  }, HELPERS);
  assert.equal(r.id, 'mansion');
  assert.deepEqual(r.valera, { stun: true, said: ['Пункт сім: не ковзати.'], zhoraComes: true });
  assert.deepEqual(r.zhora, { stun: true, said: ['Кульки?! Я на них… ой.'] });
  assert.deepEqual(r.again, { stun: false, said: ['Не цього разу. Пункт вісім.'] });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the pause menu shop sells the traps by finger (into the van at once); the bucket — «Покласти» facing a door puts it on the door, away from doors «підійди до дверей»; the soap — «Покласти» puts it on the floor; you step on your own soap: «Ой! Своє ж…», a noise, a slide; the HUD goal line shows the points on any contract; PC: E the same', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  // the pause menu's shop: the traps by finger
  await page.evaluate(() => { const g = window.__game; for (const p of g.guards) p.update = () => null; localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 500, earned: 500, spent: 0, owned: [], paid: {}, log: [] })); g.menu.refresh(); });
  await pressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  await pressEl(page, cdp, '#pausemenu .pm-btn:text-is("Магазин")');
  await page.waitForSelector('#pausemenu [data-upgrade="trap:soap"]', { timeout: 5000 });
  await pressEl(page, cdp, '#pausemenu [data-upgrade="trap:soap"]');
  await page.waitForFunction(() => /×1/.test(document.querySelector('#pausemenu [data-upgrade="trap:soap"]').closest('.pm-shop').textContent), null, { timeout: 5000 });
  const menu = await page.evaluate(() => ({ wallet: document.querySelector('#pausemenu .pm-wallet').textContent, stock: JSON.parse(localStorage.getItem('nocturne.wallet')).stock, van: window.__game.loot.items.filter((i) => i.trap && !i.gone).map((i) => i.trap), rows: document.querySelectorAll('#pausemenu [data-upgrade^="trap:"]').length }));
  await pressEl(page, cdp, '#pausemenu .pm-btn:text-is("Назад")');
  await pressEl(page, cdp, '#pausemenu .pm-btn:text-is("Продовжити")');
  assert.match(menu.wallet, /\$350/); assert.deepEqual(menu.stock, { soap: 1 }); assert.deepEqual(menu.van, ['soap']); assert.equal(menu.rows, 5);
  const setup = () => page.evaluate(() => {
    const g = window.__game;
    const key = 'nocturne.wallet', w = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...w, cash: 0, owned: w.owned || [], paid: w.paid || {}, log: [], stock: { soap: 1, bucket: 1 } }));
    g.newRound(); g.playing = true; for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);
  });
  await setup();
  const hold = (kind) => page.evaluate((kind) => {
    const g = window.__game, it = g.loot.items.find((i) => i.trap === kind && !i.gone);
    g.hands.deskAim = it; g.hands.toggleDesk(g.player.head, g.player.yaw, false);
    return !!g.hands.desk;
  }, kind);
  const door = await page.evaluate(() => { const g = window.__game, d = g.level.doors.filter((d) => !d.locked && d.floor === 0).sort((a, b) => Math.hypot(a.cx, a.cz + 3) - Math.hypot(b.cx, b.cz + 3))[0]; return { cx: d.cx, cz: d.cz, i: g.level.doors.indexOf(d) }; });
  // away from doors: not put down
  await page.evaluate(() => window.__game.player.teleport(6, 4, 0));
  await hold('bucket'); await keepFor(page, 300);
  await pressAct(page, cdp);
  const far = await page.evaluate(() => ({ held: !!window.__game.hands.desk, msg: window.__game.flashText }));
  await standFacing(page, door.cx, door.cz, 0.8, 0); await keepFor(page, 300);
  await pressAct(page, cdp);
  const onDoor = await page.evaluate((i) => { const g = window.__game, it = g.loot.items.find((x) => x.trap === 'bucket' && !x.gone); return { held: !!g.hands.desk, door: it.door === g.level.doors[i], armed: it.armed, y: +(it.mesh.position.y - g.level.doors[i].y0).toFixed(2) }; }, door.i);
  // the soap on the floor; walk off, then onto it
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -3, 0); g.player.lookYaw = 0; g.player.lookPitch = -0.3; });
  await hold('soap'); await keepFor(page, 300);
  await pressAct(page, cdp);
  const soap = await page.evaluate(async () => {
    const g = window.__game, it = g.loot.items.find((x) => x.trap === 'soap' && !x.gone), T = await import('./src/systems/traps.js');
    g.sim(1.5);
    const armed = it.armed, p = it.mesh.position.clone();
    g.player.teleport(p.x + 2, p.z, 0); g.sim(0.2);
    const heard = []; const em = g.noise.emit.bind(g.noise); g.noise.emit = (x, z, r, k, o) => { heard.push(`${k}:${r}`); return em(x, z, r, k, o); };
    g.player.teleport(p.x + 0.1, p.z, 0); g.sim(0.1);
    const after = { msg: g.flashText, heard: heard.filter((h) => h.startsWith('drop')), moved: +Math.hypot(g.player.head.x - p.x, g.player.head.z - p.z).toFixed(2), still: !it.gone };
    T.score('trap');
    return { armed, ...after };
  });
  await keepFor(page, 400);
  soap.hud = await page.evaluate(() => document.querySelector('#hud .goal').textContent);
  assert.deepEqual(far, { held: true, msg: 'Це — на двері: підійди до дверей' });
  assert.deepEqual(onDoor, { held: false, door: true, armed: true, y: 2.08 });
  assert.equal(soap.armed, true);
  assert.equal(soap.msg, 'Ой! Своє ж…'); assert.deepEqual(soap.heard, ['drop:8']); assert.ok(soap.moved >= 0.5, `slid ${soap.moved}`); assert.equal(soap.still, true, 'it stays for the guard');
  assert.ok(soap.hud.includes('Шкода: 100'), soap.hud);
  assert.deepEqual(errors, []);
  await ctx.close();
  // PC: E with the bucket by a door
  const ctx2 = await newContext(browser);
  const { page: pc, errors: e2 } = await open(ctx2, base);
  await pc.click('#start'); await pc.waitForFunction(() => window.__game.playing);
  const r2 = await pc.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 0, owned: [], paid: {}, log: [], stock: { rope: 1 } }));
    g.newRound(); g.playing = true; for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);
    const it = g.loot.items.find((i) => i.trap === 'rope' && !i.gone);
    g.hands.deskAim = it; g.hands.toggleDesk(g.player.head, g.player.yaw, false);
    const d = g.level.doors.filter((d) => !d.locked && d.floor === 0).sort((a, b) => Math.hypot(a.cx, a.cz + 3) - Math.hypot(b.cx, b.cz + 3))[0];
    g.player.teleport(d.cx + 0.5 * Math.sin(0), d.cz + 0.5, 0); g.sim(0.05);
    return { i: g.level.doors.indexOf(d) };
  });
  await pc.keyboard.press('KeyE'); await pc.waitForTimeout(200);
  const rope = await pc.evaluate((i) => { const g = window.__game, it = g.loot.items.find((x) => x.trap === 'rope' && !x.gone); return { held: !!g.hands.desk, door: it.door === g.level.doors[i], armed: it.armed }; }, r2.i);
  assert.deepEqual(rope, { held: false, door: true, armed: true });
  assert.deepEqual(e2, []);
  await ctx2.close();
});

test('VR (IWER Quest 3): the bucket let go above a door (higher than 1.75 m) stays on it; the soap let go falls to the floor and is armed; your own soap: «Ой! Своє ж…» and no slide in VR', async () => {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./harness.mjs');
  const { UA } = await import('./runner.mjs');
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 0, owned: [], paid: {}, log: [], stock: { soap: 1, bucket: 1 } })); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, base);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  const r = await page.evaluate(async () => {
    const g = window.__game, c = window.__xrDevice.controllers.right, V = g.THREE.Vector3;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {};
    const d = g.level.doors.filter((d) => !d.locked && d.floor === 0).sort((a, b) => Math.hypot(a.cx, a.cz + 3) - Math.hypot(b.cx, b.cz + 3))[0];
    const grab = async (kind, x, y, z) => {
      const it = g.loot.items.find((i) => i.trap === kind && !i.gone);
      it.inVan = false; it.mesh.position.set(x, y, z); it.state = 'rest';
      const l = g.player.rig.worldToLocal(new V(x, y + 0.04, z));
      c.position.set(l.x, l.y, l.z); await wait(300);
      c.updateButtonValue('squeeze', 1); await wait(300);
      return it;
    };
    const moveTo = async (x, y, z) => { const l = g.player.rig.worldToLocal(new V(x, y, z)); c.position.set(l.x, l.y, l.z); await wait(300); };
    g.player.teleport(d.cx + 0.6, d.cz + 0.6, 0); await wait(400);
    const b = await grab('bucket', d.cx + 0.4, 1.0, d.cz + 0.4);
    const held = g.hands.heldItems().includes(b);
    await moveTo(d.cx, 1.95, d.cz);
    c.updateButtonValue('squeeze', 0); await wait(500);
    const bucket = { held, door: b.door === d, armed: b.armed, y: +b.mesh.position.y.toFixed(2) };
    // the soap
    g.player.teleport(0, -2.5, 0); await wait(400);
    let sx = 0.3, sz = -3.0;
    for (const [dx, dz] of [[0.3, -0.5], [-0.3, -0.5], [0.3, 0.3], [-0.3, 0.3], [0, -0.8]]) if (g.level.surfaceAt(dx, -2.5 + dz, 1.2) === 0) { sx = dx; sz = -2.5 + dz; break; }
    const s = await grab('soap', sx, 1.0, sz);
    c.updateButtonValue('squeeze', 0);
    for (let i = 0; i < 40 && !s.armed; i++) await wait(150);
    const soap = { armed: s.armed, y: +s.mesh.position.y.toFixed(2) };
    g.player.teleport(s.mesh.position.x + 2, s.mesh.position.z, 0); await wait(400);
    g.player.teleport(s.mesh.position.x + 0.1, s.mesh.position.z, 0);
    for (let i = 0; i < 20 && g.flashText !== 'Ой! Своє ж…'; i++) await wait(100);
    const self = { msg: g.flashText, x: +(g.player.head.x - s.mesh.position.x).toFixed(1) };
    return { bucket, soap, self };
  });
  assert.equal(r.bucket.held, true); assert.equal(r.bucket.door, true); assert.equal(r.bucket.armed, true);
  assert.deepEqual(r.soap, { armed: true, y: 0 });
  assert.equal(r.self.msg, 'Ой! Своє ж…');
  assert.ok(Math.abs(r.self.x) < 0.3, `no slide in VR (${r.self.x})`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
