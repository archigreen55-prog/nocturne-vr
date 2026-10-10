// W7: the story in the game (story-bible.md, story-texts-uk.md). The customer's and the crew's lines
// before / after a contract (board, the phone's menu and summary, the start screen), Petrovych by name,
// the crew's subtitles from the thief you play, Тихарник and «Папери» (game/story.js, no DOM), the
// notes on the dacha (this device only), the wardrobe lurker (the breath, the box inside), the
// headphones line, the privacy line about Шепотун. Шепотун itself: tests/whisperer.test.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, preview, playPhone, keepFor, tp, touchT, touchEndAt, standFacing } from './runner.mjs';

const dbg = (r) => { if (process.env.DBG) console.log(JSON.stringify(r)); };
// a page in a round (the clock running), the guard and the lurkers optionally still
async function round(url = base, { guard = false, lurker = false, init, ctxOpts } = {}) {
  const ctx = await newContext(browser, ctxOpts);
  if (init) await ctx.addInitScript(init);
  const { page, errors } = await open(ctx, url);
  await page.evaluate(([guard, lurker]) => {
    const g = window.__game;
    window.__said = [];
    for (const p of g.guards) { const s = p.env.say; p.env.say = (t) => { window.__said.push(t); s(t); }; }
    g.newRound(); g.playing = true;
    if (!guard) for (const p of g.guards) p.update = () => null;
    if (!lurker) for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);
  }, [guard, lurker]);
  return { ctx, page, errors };
}

test('texts: every customer / crew / card line ≤ 48 characters, the notes ≤ 60; every dacha contract has its lines; the crew\'s «who» are the crew', async () => {
  const S = (await import(join(ROOT, 'src/i18n/uk.js'))).default;
  const bad = [];
  const walk = (o, p, lim) => { for (const k in o) { const v = o[k], q = `${p}.${k}`;
    if (typeof v === 'string') { if (v.length > lim) bad.push(`${q} (${v.length})`); }
    else if (Array.isArray(v)) v.forEach((s, i) => { if (typeof s === 'string' && s.length > lim) bad.push(`${q}[${i}] (${s.length})`); });
    else if (v && typeof v === 'object') walk(v, q, lim); } };
  walk(S.story.before, 'story.before', 48); walk(S.story.after, 'story.after', 48); walk(S.story.crew, 'story.crew', 48);
  walk(S.crew.lines, 'crew.lines', 48); walk(S.lurkers.cards, 'lurkers.cards', 48); walk(S.guard.say, 'guard.say', 48);
  for (const [id, n] of Object.entries(S.notes.items)) if (n.text.length > 60) bad.push(`notes.${id} (${n.text.length})`);
  assert.deepEqual(bad, [], 'too long for a phone');
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const ids = await page.evaluate(() => window.__game.CFG.contracts.filter((c) => !c.locked).map((c) => c.id));
  await ctx.close();
  assert.deepEqual(errors, []);
  for (const id of ids) assert.ok(S.story.before[id], `story.before.${id}`);
  for (const [id, c] of Object.entries(S.story.crew)) for (const k of ['before', 'after']) if (c[k]) assert.ok(S.crew.names[c[k].who], `story.crew.${id}.${k}.who`);
  for (const t of Object.keys(S.crew.names)) for (const s of ['start', 'take', 'guardNear', 'lurker', 'scared', 'damaged', 'heavy', 'alarm', 'caught', 'clean']) assert.ok(S.crew.lines[t][s], `crew.lines.${t}.${s}`);
});

test('the line after a round (story-texts §9.2): caught, late, fail, «clock» damaged, shout, alarm, clean; «Ні звуку» with a shout = «Фрол. Я навіть не питаю.»; the crew\'s line only when the goal was met', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate(async () => {
    const St = await import('./src/game/story.js'), g = window.__game, C = (id) => g.CFG.contracts.find((c) => c.id === id);
    const loot = { items: [{ id: 'clock', damaged: true }] }, intact = { items: [{ id: 'clock', damaged: false }] };
    const ok = { goal: true }, no = { goal: false };
    const a = (id, r, v, o) => St.storyAfter(C(id), r, v, o);
    return {
      caught: a('first', { kind: 'caught' }, no).line, late: a('first', { kind: 'late' }, no).line,
      fail: a('first', { kind: 'left', shouts: 0 }, no).line, clean1: a('first', { kind: 'left', shouts: 0 }, ok).line,
      alarm1: a('first', { kind: 'left', shouts: 0 }, ok, { alarmed: true }).line, shout1: a('first', { kind: 'left', shouts: 2 }, ok).line,
      clockDamaged: a('clock', { kind: 'left', shouts: 0 }, ok, { loot }).line, clockDone: a('clock', { kind: 'left', shouts: 0 }, ok, { loot: intact }).line,
      silentShout: a('silent', { kind: 'left', shouts: 1 }, no).line, silentClean: a('silent', { kind: 'left', shouts: 0 }, ok).line,
      evening: a('evening', { kind: 'escaped', shouts: 0 }, ok), eveningFail: a('evening', { kind: 'left', shouts: 0 }, no),
      before: St.storyBefore(C('first')),
    };
  });
  assert.equal(r.caught, 'Сторож отримав історію. Ви — ні. pp.');
  assert.equal(r.late, 'Годинник не чекає. Я теж. pp.');
  assert.equal(r.fail, 'Мети немає. Платні теж. pp.');
  assert.equal(r.clean1, 'Прийнято. Далі — годинник. pp.');
  assert.equal(r.alarm1, 'Сирена — це теж музика. Погана. pp.');
  assert.equal(r.shout1, 'Хто кричав — не питаю. Я чув. pp.');
  assert.equal(r.clockDamaged, 'Годинник зупинився. Платите ви. pp.');
  assert.equal(r.clockDone, 'Цокає. Добре. pp.');
  assert.equal(r.silentShout, 'Фрол. Я навіть не питаю. pp.');
  assert.equal(r.silentClean, 'Жодного крику. Браво. Без оплесків. pp.');
  assert.deepEqual(r.evening, { kind: 'clean', line: 'Чув із Пагорбів. Шафа теж. Акт перший. pp.', crew: 'Рита: pp — це піанісимо. Він музикант.' });
  assert.equal(r.eveningFail.crew, '', 'the crew only when the goal was met');
  assert.deepEqual(r.before, { lines: ['Дача на Тихому Куті. Сторож один, п\'є чай.', '$2,000. Будь-що. Не кричіть. pp.'], crew: 'Зоя: Хто такий «pp.»? Байдуже. Гроші справжні.' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the board and the start screen: the customer\'s lines and Zoya\'s on contract 1 (#storybefore, an element of its own), «Грай у навушниках» (#headphones); «Тихарник…» and «Папери…» open their pages; the result: the line after and the thief\'s signature under the scream', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const start = await page.evaluate(() => {
    const g = window.__game;
    window.__seen = [];
    const d = g.board.draw.bind(g.board); g.board.draw = (s) => { window.__seen.push(s); return d(s); };
    for (const p of g.guards) p.update = () => null;
    g.player.teleport(2.2, 6.8, 2.92); g.player.lookYaw = 2.92;   // at the van, facing the board (drawn only in view)
    return { story: document.getElementById('storybefore').textContent, crewColor: document.querySelector('#storybefore .crewline') && document.querySelector('#storybefore .crewline').textContent,
      hp: document.getElementById('headphones').textContent, info: document.getElementById('contractinfo').textContent.slice(0, 30), order: document.getElementById('storybefore').nextElementSibling.id };
  });
  // the newest drawn state after `fn` changed something
  const drawn = async (fn) => {
    await page.evaluate((fn) => { window.__seen.length = 0; if (fn) (0, eval)(fn)(); const g = window.__game; g.player.teleport(2.2, 6.8, 2.92); g.player.lookYaw = 2.92; }, fn ? fn.toString() : null);
    await page.waitForTimeout(400);   // the camera follows the teleport on the next frames (the board is drawn only in view)
    await page.evaluate(async () => { const B = await import('./src/systems/board.js'), { G } = await import('./src/systems/state.js'); G.boardDirty = true; G.lastBoardSig = null; B.board.present(0.3); });
    return page.evaluate(() => { const s = window.__seen.at(-1); return { ...s, ids: window.__game.board.buttons.map((b) => b.id), contract: null, mic: null, tally: null, verdict: s.verdict && { goal: s.verdict.goal }, result: s.result && { kind: s.result.kind } }; });
  };
  const b0 = await drawn();
  const L = await drawn(() => window.__game.pressBoard('lurkers'));
  const L2 = await drawn(() => window.__game.pressBoard('lnext'));
  const P = await drawn(() => { window.__game.pressBoard('back'); window.__game.pressBoard('papers'); });
  await page.evaluate(() => { const g = window.__game; g.pressBoard('back'); g.player.teleport(0, 2, 0); g.sim(0.3); g.player.teleport(2.2, 6.8, 2.92); g.player.lookYaw = 2.92; });
  const R = await drawn(() => { const g = window.__game; g.round.finish('left'); g.round.result.shouts = 1; });
  const r = { start, board: { story: b0.story, buttons: b0.ids }, lurkers: { page: L.page, cards: L.lurkers.cards.map((c) => c.name), met: L.lurkers.met, buttons: L.ids }, page2: L2.lurkers.page,
    papers: { page: P.page, rows: P.papers.rows.length, count: P.papers.count }, result: { after: R.storyAfter, by: R.screamBy } };
  assert.equal(r.start.story, 'Дача на Тихому Куті. Сторож один, п\'є чай. $2,000. Будь-що. Не кричіть. pp. Зоя: Хто такий «pp.»? Байдуже. Гроші справжні.');
  assert.equal(r.start.crewColor, ' Зоя: Хто такий «pp.»? Байдуже. Гроші справжні.');
  assert.equal(r.start.hp, 'Грай у навушниках. Твої сусіди — не Петрович.');
  assert.equal(r.start.order, 'contractinfo', 'right above the contract info');
  assert.ok(!r.start.info.startsWith('Дача'), 'the contract info is as before');
  assert.deepEqual(r.board.story.lines.length, 2);
  assert.ok(r.board.buttons.includes('lurkers') && r.board.buttons.includes('papers'), r.board.buttons.join());
  assert.equal(r.lurkers.page, 'lurkers');
  assert.deepEqual(r.lurkers.cards, ['???', '???', '???', '???', '???', '???', '???', '???', '???']);
  assert.deepEqual(r.lurkers.met, { n: 0, total: 9 });
  assert.ok(r.lurkers.buttons.includes('lnext') && r.lurkers.buttons.includes('back'));
  assert.equal(r.page2, 1);
  assert.deepEqual(r.papers, { page: 'papers', rows: 0, count: { n: 0, total: 5 } });
  assert.equal(r.result.after.line, 'Мети немає. Платні теж. pp.', 'nothing in the van: the goal not met');
  assert.equal(r.result.by, 'Зоя: «Це не я. Це Фрол.»');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Petrovych by name: «Петрович: «…»» and on easy «Петрович: …»; «Ну що, хато, подрімаємо?» once at the start; the second missing item: «Два предмети… Та що ж це…»; a yawn: «Ох-хо-хо…» (the mansion keeps «Валера: …»: tests/mansion.test.mjs)', async () => {
  const { ctx, page, errors } = await round(base, { guard: true });
  const r = await page.evaluate(async () => {
    const g = window.__game, P = g.patrol, out = {};
    const shown = []; const wd = g.wrist.draw.bind(g.wrist); g.wrist.draw = (s) => { shown.push(s.guardText); return wd(s); };
    g.player.teleport(6, 4, 0);
    P.interrupt(); P.state = 'task'; P.queue.length = 0; P.queue.push({ type: 'wait', t: 999, label: 'test' });
    for (let i = 0; i < 60 && !window.__said.includes('Ну що, хато, подрімаємо?'); i++) g.sim(0.25);
    out.house = window.__said.filter((t) => t === 'Ну що, хато, подрімаємо?').length;
    out.line = g.guardLine;
    for (let i = 0; i < 4; i++) { g.sim(0.1); }
    const { G } = await import('./src/systems/state.js'); G.wristTimer = 0; g.sim(0.15);
    out.wrist = shown.filter(Boolean).at(-1);
    g.sim(10); out.houseAgain = window.__said.filter((t) => t === 'Ну що, хато, подрімаємо?').length;
    // two items gone from their place, the guard sees both places
    window.__said.length = 0;
    const st = g.loot.items.find((i) => i.id === 'statuette'), can = g.loot.items.find((i) => i.id === 'candelabrum');
    for (const it of [st, can]) it.mesh.position.set(0, -10, 0);
    P.brain.canSee = () => true; g.CFG.run.noticeMissing = true; g.CFG.run.missingToAlarm = 9;
    P.brain.watch(0.1); P.brain.watch(0.1);
    out.missing = window.__said.slice(0, 2);
    // a yawn between rooms
    window.__said.length = 0; P.brain.cfg.yawnChance = 1; P.interrupt(); P.queue.length = 0; P.state = 'task'; P.brain.queueRoom();
    const y = P.queue.find((st) => st.label === 'позіхає'); if (y) y.onStart();
    out.yawn = window.__said.includes('Ох-хо-хо…');
    return out;
  });
  dbg(r);
  assert.equal(r.house, 1); assert.equal(r.houseAgain, 1, 'once a round');
  assert.equal(r.line, 'Петрович: Ну що, хато, подрімаємо?');
  assert.ok(/^Петрович: /.test(r.wrist || ''), r.wrist);
  assert.ok(/^Де .+\?!$/.test(r.missing[0]), r.missing[0]); assert.equal(r.missing[1], 'Два предмети… Та що ж це…');
  assert.equal(r.yawn, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the crew\'s subtitles from the thief you play (Рита from «Грати з друзями»; nobody chose: Зоя): the start, the first loot, a heavy one; one at most per 20 s; in a full alarm only «alarm»; the guard\'s line goes first; Назар spoke: «Назар заговорив!!!»', async () => {
  const { ctx, page, errors } = await round(base, { init: () => { try { if (!sessionStorage.getItem('t')) { localStorage.setItem('nocturne.netThief', '"rita"'); sessionStorage.setItem('t', '1'); } } catch { /* */ } } });
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {}, { G } = await import('./src/systems/state.js');
    out.start = G.crewLine && G.crewLine.line;
    // the first loot 5 s later: too soon (20 s)
    g.sim(5); const can = g.loot.items.find((i) => i.id === 'candelabrum');
    g.player.teleport(-5.2, -1.9, Math.PI); g.sim(0.1);
    g.hands.deskAim = can; g.hands.toggleDesk(g.player.head, g.player.yaw, false); g.sim(0.2);
    out.tooSoon = G.crewLine.line;
    g.hands.toggleDesk(g.player.head, g.player.yaw, false); g.sim(16);
    const vase = g.loot.items.find((i) => i.id === 'vase');
    g.hands.deskAim = vase; g.hands.toggleDesk(g.player.head, g.player.yaw, false); g.sim(0.2);
    out.heavy = G.crewLine.line;
    g.hands.toggleDesk(g.player.head, g.player.yaw, false);
    // the guard speaks: its line goes first
    const { panel } = await import('./src/systems/panel.js');
    const shown = []; const wd = g.wrist.draw.bind(g.wrist); g.wrist.draw = (s) => { shown.push([s.guardText, s.crewSpeech]); return wd(s); };
    if (g.hud) { const hu = g.hud.update.bind(g.hud); g.hud.update = (s, n) => { shown.push([s.guardText, s.crewSpeech]); return hu(s, n); }; }
    g.patrol.env.say('тест'); G.crewLine = { name: 'Рита', line: 'x' }; G.crewLineT = 3; G.wristTimer = 0; panel.frame(0.01, performance.now());
    out.guardFirst = shown.at(-1);
    G.guardLineT = 0; G.wristTimer = 0; panel.frame(0.01, performance.now());
    out.crewShown = shown.at(-1);
    // Назар
    localStorage.setItem('nocturne.netThief', '"nazar"'); G.speakT = 2; G.quietT = 0; g.sim(0.03);
    out.nazar = g.flashText; G.speakT = 0; localStorage.setItem('nocturne.netThief', '"rita"');
    // a full alarm: «alarm» at once
    g.alert.setFull('test', 0, 0); g.sim(0.2);
    out.alarm = G.crewLine.line;
    return out;
  });
  dbg(r);
  assert.equal(r.start, 'Увага, публіка в залі. Тобто в кухні.');
  assert.equal(r.tooSoon, 'Увага, публіка в залі. Тобто в кухні.', 'not before 20 s');
  assert.equal(r.heavy, 'Фокус із роялем. Без рояля.');
  assert.deepEqual(r.guardFirst, ['Петрович: «тест»', false]);
  assert.deepEqual(r.crewShown, ['Рита: «x»', true]);
  assert.equal(r.alarm, 'Оплесків не треба. Серйозно, не треба.');
  assert.equal(r.nazar, 'Назар заговорив!!!');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('notes (this device only): E facing the fridge reads «Блюдце не чіпати. Кіт.» (6 s), it is gone and in «Папери», not loot, the guard does not miss it; gone after a reload too; «Кричи в шафу.» shows only while the wardrobe lurker sleeps; after a star on contract 7 the second note lies on the fridge', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const prep = () => page.evaluate(() => { const g = window.__game; for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {}; g.player.teleport(0, -2.5, 0); g.sim(0.3); });
  await prep();
  await standFacing(page, -9.13, -0.75, 0.9, Math.PI / 2);
  await page.waitForTimeout(200);
  const before = await page.evaluate(async () => {
    const S = await import('./src/systems/story.js');
    return { aimed: S.aimedNote() && S.aimedNote().id, total: window.__game.loot.tally().total, label: document.querySelector('#touch .act') ? 'phone' : 'pc' };
  });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const after = await page.evaluate(async () => {
    const g = window.__game, St = await import('./src/game/story.js'), S = await import('./src/systems/story.js');
    const fridge = g.scene.getObjectByName('note: saucer');
    return { msg: g.flashText, visible: fridge.visible, papers: St.papers().map((p) => p.id), total: g.loot.tally().total, aimed: S.aimedNote() && S.aimedNote().id,
      inWardrobe: g.scene.getObjectByName('note: shout').visible };
  });
  // the wardrobe lurker sleeps (after a lunge): its doors ajar, the note inside shows
  const sleeping = await page.evaluate(() => { const g = window.__game, l = g.lurker; l.state = 'cooldown'; l.t = 0; l.setDoors(l.env.ajar); g.sim(0.1); return { note: g.scene.getObjectByName('note: shout').visible, ajar: +(-l.door1.rotation.y / 1.9).toFixed(2) }; });
  // a reload: the fridge note is gone; a star on contract 7: the second one is there
  await page.evaluate(() => { localStorage.setItem('nocturne.stars', JSON.stringify({ evening: { medium: 1 } })); });
  await page.reload(); await page.waitForFunction(() => window.__game);
  const reload = await page.evaluate(() => { const g = window.__game; g.sim(0.1); return { saucer: g.scene.getObjectByName('note: saucer').visible, saucer2: g.scene.getObjectByName('note: saucer2').visible, kettle: g.scene.getObjectByName('note: kettle').visible }; });
  assert.equal(before.aimed, 'saucer');
  assert.equal(after.msg, 'Записка: «Блюдце не чіпати. Кіт.»');
  assert.equal(after.visible, false);
  assert.deepEqual(after.papers, ['saucer']);
  assert.equal(after.total, before.total, 'not loot');
  assert.equal(after.aimed, null);
  assert.equal(after.inWardrobe, false, 'inside the shut wardrobe: not seen');
  assert.deepEqual(sleeping, { note: true, ajar: 0.3 });
  assert.deepEqual(reload, { saucer: false, saucer2: true, kettle: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the wardrobe lurker: holding the breath in its telegraph — it loses you («Затамував подих — воно тебе згубило»), sleeps 45 s with the doors ajar; the box inside: not taken while it is shut, taken while it sleeps and delivered as loot; its card opens on the telegraph you see («Тихарник: нова картка — Шафник»), «зустрів 1 з 9»; Тихарник survives a reload and goes into the progress code', async () => {
  const { ctx, page, errors } = await round(base, { lurker: true });
  const r = await page.evaluate(async () => {
    const g = window.__game, l = g.lurker, out = {}, St = await import('./src/game/story.js'), { G } = await import('./src/systems/state.js');
    const box = g.loot.items.find((i) => i.id === 'jewelbox');
    out.shut = { shut: box.shut, takeable: box.takeable };
    // stand in front of the wardrobe, facing it: the telegraph
    g.player.teleport(l.FRONT.x - 1.6, l.FRONT.z, -Math.PI / 2); g.sim(0.05);
    for (let i = 0; i < 40 && l.state === 'dormant'; i++) g.sim(0.05);
    const SS = await import('./src/systems/story.js');
    out.telegraph = l.state; out.card = SS.storyReport().cards; out.met = St.lurkersMet();
    // hold the breath: it loses you
    const B = g.breath, up = B.update.bind(B); B.update = () => null; B.state = 'holding'; B.t = 0; g.sim(0.2);
    out.lost = { state: l.state, msg: g.flashText, ajar: +(-l.door1.rotation.y / 1.9).toFixed(2), creature: l.creature.visible };
    B.update = up; B.state = 'ready'; g.sim(0.1);
    out.open = { shut: box.shut, takeable: box.takeable };
    g.hands.deskAim = box; g.hands.toggleDesk(g.player.head, g.player.yaw, false); g.sim(0.1);
    out.held = g.hands.desk === box;
    g.player.teleport(4.4, 9.6, 0); g.sim(0.1); g.hands.toggleDesk(g.player.head, g.player.yaw, true); g.sim(2);
    out.delivered = box.delivered;
    // 45 s later: shut again
    g.sim(46); out.after = { state: l.state, ajar: +(-l.door1.rotation.y / 1.9).toFixed(2) };
    const { exportProgress, readCode } = await import('./src/game/progress.js');
    out.code = JSON.parse(readCode(exportProgress().code).data.lurkers);
    return out;
  });
  await page.reload(); await page.waitForFunction(() => window.__game);
  const met = await page.evaluate(async () => (await import('./src/game/story.js')).lurkersMet());
  dbg(r);
  assert.deepEqual(r.shut, { shut: true, takeable: false });
  assert.equal(r.telegraph, 'telegraph');
  assert.deepEqual(r.card, ['wardrobe'], 'its card (HUD «Тихарник: нова картка — Шафник»)');
  assert.deepEqual(r.met, { n: 1, total: 9 });
  assert.deepEqual(r.lost, { state: 'cooldown', msg: 'Затамував подих — воно тебе згубило', ajar: 0.3, creature: false });
  assert.deepEqual(r.open, { shut: false, takeable: true });
  assert.equal(r.held, true); assert.equal(r.delivered, true);
  assert.deepEqual(r.after, { state: 'dormant', ajar: 0 });
  assert.deepEqual(r.code, ['wardrobe']);
  assert.deepEqual(met, { n: 1, total: 9 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the pause menu — «Контракт» with the customer\'s lines and Zoya\'s, «Тихарник» (9 rows, «???» until met), «Папери» (the notes found) by finger; the summary after a round has the line after; privacy.html has the line about Шепотун', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  const press = async (sel) => {
    await page.waitForSelector(sel, { state: 'visible', timeout: 5000 });
    await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = await page.locator(sel).first().boundingBox(), pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t = touchT();
    await tp(cdp, 'touchStart', [pt], t); await page.waitForTimeout(120); await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.12)); await page.waitForTimeout(200);
  };
  await page.evaluate(() => { localStorage.setItem('nocturne.notes', '["kettle"]'); const g = window.__game; for (const p of g.guards) p.update = () => null; });
  await press('#touch .pause');
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  await press('#pausemenu .pm-btn:text-is("Контракт і складність")');
  const contract = await page.evaluate(() => ({ story: document.querySelector('#pausemenu .pm-story i').textContent, crew: document.querySelector('#pausemenu .pm-crew').textContent }));
  await press('#pausemenu .pm-btn:text-is("Назад")');
  await press('#pausemenu .pm-btn:text-is("Тихарник")');
  const lurkers = await page.evaluate(() => ({ rows: document.querySelectorAll('#pausemenu [data-lurker]').length, names: [...document.querySelectorAll('#pausemenu [data-lurker] b')].map((b) => b.textContent), info: document.querySelector('#pausemenu .pm-info').textContent }));
  await press('#pausemenu .pm-btn:text-is("Назад")');
  await press('#pausemenu .pm-btn:text-is("Папери")');
  const papers = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#pausemenu [data-note] b')].map((b) => b.textContent), info: document.querySelector('#pausemenu .pm-info').textContent }));
  await press('#pausemenu .pm-btn:text-is("Назад")');
  await press('#pausemenu .pm-btn:text-is("Продовжити")');
  // a round and its summary
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -2.5, 0); g.sim(0.3); g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('left'); g.sim(0.3); });
  await page.waitForFunction(() => window.__game.summary && window.__game.summary.isOpen, null, { timeout: 20000 });
  const summary = await page.evaluate(() => document.querySelector('.sm-story') && document.querySelector('.sm-story').textContent);
  const privacy = await (await import('node:fs/promises')).readFile(join(ROOT, 'privacy.html'), 'utf8');
  const S = (await import(join(ROOT, 'src/i18n/uk.js'))).default;
  assert.equal(contract.story, 'Дача на Тихому Куті. Сторож один, п\'є чай. $2,000. Будь-що. Не кричіть. pp.');
  assert.equal(contract.crew, ' Зоя: Хто такий «pp.»? Байдуже. Гроші справжні.');
  assert.equal(lurkers.rows, 9); assert.ok(lurkers.names.every((n) => n === '???'), lurkers.names.join());
  assert.equal(lurkers.info, 'зустрів 0 з 9');
  assert.deepEqual(papers.rows, ['«Петровичу: чайник не лишати. Б.»']); assert.equal(papers.info, 'знайдено 1 з 5');
  assert.equal(summary, 'Мети немає. Платні теж. pp.');
  assert.ok(privacy.includes(S.privacy.whisper), 'privacy.html: the whisperer line');
  assert.deepEqual(errors, []);
  await ctx.close();
});
