// Campaign v2 (the live test's ladder; plan «кампанія, зірки й економіка» of 2026-11-15, the owner's
// decisions of 15.11): the ladder 0–8 with its goals and round times, three stars per level (★ goal,
// ★★ «Тихо», ★★★ the level's own) on any difficulty, the money (each star once, the loot only above the
// level's record, never the rehearsal's; the new prices; the traps out of the van lost when caught), the
// mansion after a star on level 5, the level card and the board's note with the stars and their money,
// the summary's checklist with «Ще раз» and «Далі», a big item and a door on a phone / PC, the price
// in hand. These pages run the campaign (`campaign: true`); the classic test game keeps the old rules.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, LAND, preview } from './runner.mjs';

async function camp(url = base, { stars = null, stars2 = null, wallet = null, phone = false } = {}) {
  const ctx = await newContext(browser, phone ? LAND : {}, { menu: true });
  await ctx.addInitScript(([stars, stars2, wallet]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      if (stars) localStorage.setItem('nocturne.stars', JSON.stringify(stars));
      if (stars2) localStorage.setItem('nocturne.stars2', JSON.stringify(stars2));
      if (wallet) localStorage.setItem('nocturne.wallet2', JSON.stringify(wallet));
    }
  }, [stars, stars2, wallet]);
  const { page, errors } = await open(ctx, url);
  return { ctx, page, errors };
}
const S1 = { medium: 1 };

test('campaign v2: the ladder 0–9 (dacha 0–5, mansion 6–9), its goals and round times by difficulty; the left-out levels are not there; the mansion opens after a star on level 5', async () => {
  const { ctx, page, errors } = await camp();
  const r = await page.evaluate(async () => {
    const g = window.__game, Cm = await import('./src/game/campaign.js'), E = await import('./src/game/economy.js');
    const out = { ladder: Cm.levels().map((l) => `${l.n}:${l.id}`).join(' '), dacha: g.CFG.contracts.map((c) => c.id).join(' ') };
    const M = await import('./src/config/mansion.js');
    out.mansion = M.mansion.contracts.map((c) => c.id).join(' ');
    out.goals = g.CFG.contracts.map((c) => `${c.id}=${g.goalText(c, g.loot.items)}`);
    const time = (id, d) => { g.newRound(); g.setContract(id); g.setDifficulty(d); return g.CFG.round.time; };
    out.times = ['first', 'chest', 'quiet', 'wardrobe', 'clock'].map((id) => [time(id, 'easy'), time(id, 'medium'), time(id, 'hard')].join('/'));
    out.warn = g.CFG.round.warnAt;
    g.setDifficulty('medium');
    out.mansionClosed = E.mapOpen('mansion');
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 1 }, chest: { medium: 1 }, quiet: { medium: 1 }, wardrobe: { medium: 1 } }));
    out.mansion4 = E.mapOpen('mansion');
    const C = await import('./src/game/contracts.js');
    C.recordBits('clock', [true, false, false]);
    out.mansion5 = E.mapOpen('mansion');
    return out;
  });
  assert.equal(r.ladder, '0:rehearsal 1:first 2:chest 3:quiet 4:wardrobe 5:clock 6:m8 7:m10 8:m9 9:m12');
  assert.equal(r.dacha, 'rehearsal first chest quiet wardrobe clock');
  assert.equal(r.mansion, 'm8 m10 m9 m12');
  assert.deepEqual(r.goals, ['rehearsal=винеси 2 будь-які речі', 'first=винеси щонайменше $500', 'chest=винеси: Скриня', 'quiet=винеси щонайменше $700', 'wardrobe=винеси: Шкатулка, винеси щонайменше $1,000', 'clock=винеси: Годинник']);
  assert.deepEqual(r.times, ['375/300/240', '375/300/240', '450/360/288', '450/360/288', '525/420/336']);
  assert.equal(r.warn, 336 - 60, 'the lights flicker a minute before the end');
  assert.deepEqual([r.mansionClosed, r.mansion4, r.mansion5], [false, false, true], 'the mansion: a star on level 5');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// one round of a level: the guards frozen, inside the gate, `fn` delivers / misbehaves, then `kind`
const PLAY = `(id, diff, fn, kind = 'left') => {
  const g = window.__game;
  g.newRound(); g.setDifficulty(diff); g.setContract(id); g.playing = true;
  for (const p of g.guards) { p.update = () => null; p.doubts = 0; }
  g.player.teleport(0, 2, 0); g.sim(0.3);
  fn(g); g.sim(0.5);   // the items fly into the van
  g.round.finish(kind); g.sim(0.3);
}`;

test('campaign v2: three stars on any difficulty (★ goal, ★★ «Тихо», ★★★ the level\'s own: a «?» from a thief breaks «👂», a can does not); each star pays once ($200 / $300 / $500), the loot only above the level\'s record, the rehearsal\'s never, caught nothing and the traps out of the van are lost; the shop\'s new prices', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1 }, wallet: { cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [], stock: { soap: 2 } } });
  const r = await page.evaluate(async (PLAY) => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), E = await import('./src/game/economy.js'), SE = await import('./src/systems/economy.js');
    const play = eval(PLAY), by = (id) => g.loot.items.find((i) => i.id === id), out = {};
    const snap = () => ({ stars: G.verdict.stars, bits: G.verdict.bits.map(Number).join(''), why: G.verdict.whyStar.slice(), loot: G.income.loot, bonus: G.income.bonus, cash: E.wallet().cash, lines: SE.incomeLines() });
    play('first', 'hard', (g) => { g.loot.deliver(by('painting')); g.loot.deliver(by('candelabrum')); });
    out.hard3 = snap();
    play('first', 'medium', (g) => { g.loot.deliver(by('painting')); g.alert.setFull('test', 0, 0); g.sim(0.1); });
    out.alarm = snap();
    play('first', 'easy', (g) => { g.loot.deliver(by('painting')); g.loot.deliver(by('candelabrum')); g.loot.deliver(by('statuette')); });
    out.record = snap();
    play('first', 'medium', (g) => {
      g.loot.deliver(by('painting'));
      const P = g.guards[0]; P.state = 'task'; P.reactTo({ kind: 'can', x: 0, z: -3, radius: 6, source: 'world' });
      out.afterCan = P.doubts; P.state = 'task'; P.reactTo({ kind: 'step', x: 0, z: -3, radius: 6, source: 'player' });
    });
    out.doubt = snap();
    play('rehearsal', 'medium', (g) => { g.loot.deliver(by('painting')); g.loot.deliver(by('candelabrum')); });
    out.practice = snap();
    play('chest', 'medium', (g) => {
      const t = g.loot.items.find((i) => i.trap === 'soap'); Object.assign(t, { gone: false, inVan: false }); t.mesh.visible = true; t.mesh.position.set(0, 0, -3);
    }, 'caught');
    out.caught = { ...snap(), stock: E.wallet().stock.soap, confiscated: G.income.confiscated };
    out.rows = SE.shopRows().map((x) => `${x.id}:${x.price}`).join(' ');
    out.classicKey = localStorage.getItem('nocturne.wallet');
    return out;
  }, PLAY);
  assert.deepEqual([r.hard3.stars, r.hard3.bits, r.hard3.loot, r.hard3.bonus, r.hard3.cash], [3, '111', 750, 1000, 1750], `hard: all three, paid once: ${JSON.stringify(r.hard3)}`);
  assert.deepEqual([r.alarm.bits, r.alarm.why[1], r.alarm.loot, r.alarm.bonus, r.alarm.cash], ['101', 'тривога', 0, 0, 1750], `an alarm: no ★★; nothing new to pay; $500 under the record: ${JSON.stringify(r.alarm)}`);
  assert.match(r.alarm.lines[0], /рекорд \$750 не побито/);
  assert.deepEqual([r.record.loot, r.record.cash], [300, 2050], 'easy, $1,050: the $300 over the record');
  assert.match(r.record.lines[0], /новий рекорд \$1,050 → \+\$300/);
  assert.equal(r.afterCan, 0, 'a can is not a doubt');
  assert.deepEqual([r.doubt.bits, r.doubt.why[2]], ['110', '«?» ×1'], 'a step heard: ★★★ «👂» is gone');
  assert.deepEqual([r.practice.stars, r.practice.bits, r.practice.loot, r.practice.bonus, r.practice.cash], [1, '100', 0, 200, 2250], 'the rehearsal: its one star paid, its loot never');
  assert.match(r.practice.lines[0], /репетиції не платиться/);
  assert.deepEqual([r.caught.stars, r.caught.loot, r.caught.bonus, r.caught.cash, r.caught.stock], [0, 0, 0, 2250, 1], 'caught: nothing, one soap lost');
  assert.deepEqual(r.caught.confiscated, ['Мило']);
  assert.equal(r.rows, 'gloves:$1,000 thermos:$1,200 mask:$1,500 sneakers:$2,500 boots:$4,500', 'the new prices, no «незабаром», no traps before their level');
  assert.equal(r.classicKey, null, 'the campaign keeps its own wallet');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2: the level card (menu «Грати») and the board\'s note show the three stars with their money (✓ the won ones), what is new, the round\'s time on this difficulty; the difficulty is in the settings; the summary (phone and board): the checklist, «Ще раз» and «Далі: рівень 2»; the last dacha level says «Далі: Маєток»', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1 } });
  const r = await page.evaluate(async (PLAY) => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), { board } = await import('./src/systems/board.js');
    const PP = await import('./src/systems/playPage.js'), P = await import('./src/systems/phone.js'), { Summary } = await import('./src/ui/summary.js');
    const play = eval(PLAY), by = (id) => g.loot.items.find((i) => i.id === id), out = {};
    const said = () => { const t = [], c2 = g.board.g, orig = c2.fillText; c2.fillText = function (s, ...a) { t.push(String(s)); return orig.call(this, s, ...a); }; G.lastBoardSig = null; G.boardDirty = true; board.present(0.1); c2.fillText = orig; return t; };
    g.newRound(); g.setDifficulty('medium'); g.setContract('first'); g.sim(0.1); PP.renderPlayPage();
    const rows = () => [...document.querySelectorAll('#lvinfostars .st3')].map((x) => [...x.children].map((c) => c.textContent).join('|'));
    out.card = rows(); out.meta = document.getElementById('lvinfometa').textContent;
    out.diff = { play: document.getElementById('diffpick').hidden, settings: document.querySelectorAll('#diffpick2 button').length, box: document.getElementById('diffbox').hidden };
    document.querySelector('#diffpick2 [data-diff="hard"]').click();
    out.hard = { d: g.difficulty, meta: document.getElementById('lvinfometa').textContent };
    document.querySelector('#diffpick2 [data-diff="medium"]').click();
    out.note = said();
    play('first', 'medium', (g) => { g.loot.deliver(by('painting')); g.guards[0].doubts = 2; });
    out.board = said(); out.buttons = g.board.buttons.map((b) => b.id + ':' + b.label);
    const st = P.summaryState(); out.sum = { checklist: st.checklist, again: st.againLabel, next: st.nextLabel };
    const div = document.createElement('div'); document.body.append(div);
    new Summary(div, { play() {}, again() {}, next() {}, menu() {}, report() {} }).show(st);
    out.dom = { checks: [...div.querySelectorAll('.sm-check')].map((x) => x.textContent), buttons: [...div.querySelectorAll('.sm-buttons2 button')].map((b) => b.textContent + (b.classList.contains('primary') ? '*' : '')) };
    div.remove();
    PP.renderPlayPage(); out.card2 = rows();
    // the last dacha level: its next is the mansion
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 1 }, chest: { medium: 1 }, quiet: { medium: 1 }, wardrobe: { medium: 1 } }));
    play('clock', 'medium', (g) => { g.loot.deliver(by('clock')); });
    out.clock = { next: P.summaryState().nextLabel, nextN: P.summaryState().next };
    return out;
  }, PLAY);
  assert.deepEqual(r.card, ['★|винеси щонайменше $500|+$200|', '★★|тихо: без тривоги й крику|+$300|', '★★★|👂 жодного «?» від сторожа|+$500|'], JSON.stringify(r.card));
  assert.equal(r.meta, 'Нове: сторож ходить · 5:00 на раунд');
  assert.deepEqual(r.diff, { play: true, settings: 3, box: false }, 'the difficulty: in the settings, not on the card');
  assert.deepEqual(r.hard, { d: 'hard', meta: 'Нове: сторож ходить · 4:00 на раунд' });
  for (const t of ['винеси щонайменше $500', 'тихо: без тривоги й крику', '+$200', '+$300', '+$500', 'Нове: сторож ходить']) assert.ok(r.note.includes(t), `the note: ${t} — ${r.note.join(' | ')}`);
  assert.ok(r.board.some((t) => t === '✓ +$200 нова') && r.board.some((t) => t === '✗ «?» ×2'), r.board.join(' | '));
  assert.deepEqual(r.buttons.filter((b) => !b.startsWith('play')), ['again:Ще раз', 'nextlvl:Далі: рівень 2']);
  assert.deepEqual(r.sum.checklist.map((c) => [c.n, c.got, c.note]), [[1, true, '+$200 нова'], [2, true, '+$300 нова'], [3, false, '«?» ×2']]);
  assert.deepEqual([r.sum.again, r.sum.next], ['Ще раз', 'Далі: рівень 2']);
  assert.equal(r.dom.checks.length, 3);
  assert.deepEqual(r.dom.buttons, ['Ще раз', 'Далі: рівень 2*'], 'two buttons, «Далі» the primary');
  assert.ok(r.card2[0].endsWith('✓') && r.card2[1].endsWith('✓') && !r.card2[2].endsWith('✓'), `the card ticks the won stars: ${JSON.stringify(r.card2)}`);
  assert.equal(r.clock.next, 'Далі: Маєток');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2: a big item in hand on a PC opens no door (as in VR; the classic game still does); the price in hand; «★★ втрачено: тривога» the moment it is lost', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1, first: S1 } });
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {};
    g.newRound(); g.setContract('chest'); g.playing = true;
    for (const p of g.guards) p.update = () => null;
    const chest = g.loot.items.find((i) => i.id === 'chest');
    const door = g.nearestDoor(6.5, -5.4, 1.5);
    g.player.teleport(6.5, -5.8, 0); g.sim(0.2);
    g.hands.desk = chest; const a0 = door.angle;
    g.useDoor(door); g.sim(0.6);
    out.blocked = { moved: Math.abs(door.angle - a0) > 0.05, flash: g.flashText };
    out.hold = document.querySelector('.hold') ? document.querySelector('.hold').textContent : null;
    g.hands.desk = null; g.useDoor(door); g.sim(0.6);
    out.opened = Math.abs(door.angle - a0) > 0.05;
    g.player.teleport(0, 2, 0); g.sim(0.3);
    g.alert.setFull('test', 0, 0); g.sim(0.2);
    out.lost = g.flashText;
    return out;
  });
  assert.deepEqual(r.blocked, { moved: false, flash: 'З великою річчю двері не відчиниш: постав її («Покласти») і відчини' });
  if (r.hold !== null) assert.equal(r.hold, 'У руках: Скриня · $1,200');
  assert.equal(r.opened, true, 'with empty hands it opens');
  assert.equal(r.lost, '★★ втрачено: тривога');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the classic test game: the old rule on a PC
  const c2 = await newContext(browser);
  const p2 = await open(c2, base);
  const opened = await p2.page.evaluate(() => {
    const g = window.__game; g.newRound(); g.playing = true;
    const door = g.nearestDoor(6.5, -5.4, 1.5); g.player.teleport(6.5, -5.8, 0); g.sim(0.2);
    g.hands.desk = g.loot.items.find((i) => i.id === 'chest'); const a0 = door.angle; g.useDoor(door); g.sim(0.6);
    return Math.abs(door.angle - a0) > 0.05;
  });
  assert.equal(opened, true, 'classic: a big item on the desk still opens doors');
  assert.deepEqual(p2.errors, []);
  await c2.close();
});

test('campaign v2 (a): the phone\'s pause shows the level\'s three stars with their money — ✓ the ones won, ✗ the one this round has just lost', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1 }, stars2: { first: [1, 0, 0] }, phone: true });
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js');
    g.newRound(); g.setContract('first'); g.playing = true;
    for (const p of g.guards) p.update = () => null;
    g.player.teleport(0, 2, 0); g.sim(0.3);
    const rows = () => { G.menu.page = 'main'; G.menu.render(); return [...document.querySelectorAll('#pausemenu .pm-star')].map((x) => [...x.children].map((c) => c.textContent).join('|')); };
    const before = rows();
    g.alert.setFull('test', 0, 0); g.sim(0.2);
    return { before, after: rows() };
  });
  assert.deepEqual(r.before, ['★|винеси щонайменше $500|+$200|✓', '★★|тихо: без тривоги й крику|+$300|', '★★★|👂 жодного «?» від сторожа|+$500|']);
  assert.deepEqual(r.after.map((x) => x.split('|').pop()), ['✓', '✗', ''], 'the alarm: ★★ lost in this round');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2 (b): «Як це?» — once per mechanic at the van (not on the rehearsal), three steps, «Зрозуміло» closes it for good; again from the level card, the phone\'s pause and the board (its page «how»); the classic game has none', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1, first: S1 } });
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), { board } = await import('./src/systems/board.js'), PP = await import('./src/systems/playPage.js');
    const card = () => { const el = document.getElementById('howcard'); return el.hidden ? null : { title: document.getElementById('howtitle').textContent, steps: [...document.querySelectorAll('#howsteps li')].map((x) => x.textContent), ok: document.getElementById('howok').textContent }; };
    const out = {};
    g.newRound(); g.setContract('rehearsal'); g.playing = true; g.sim(0.2); out.rehearsal = card(); document.getElementById('howok').click(); g.sim(0.1);
    g.newRound(); g.setContract('first'); g.sim(0.2); out.first = card();
    document.getElementById('howok').click(); g.sim(0.2);
    out.closed = card(); out.seen = JSON.parse(localStorage.getItem('nocturne.howSeen'));
    g.newRound(); g.setContract('first'); g.sim(0.2); out.again = card();
    PP.renderPlayPage(); out.btn = !document.getElementById('lvinfohow').hidden;
    document.getElementById('lvinfohow').click(); out.fromCard = card() && card().title;
    document.getElementById('howok').click();
    g.newRound(); g.setContract('chest'); g.sim(0.2); out.chest = card() && card().steps[1]; document.getElementById('howok').click();
    G.boardPage = 'contract'; G.lastBoardSig = null; G.boardDirty = true; board.present(0.1);
    out.boardBtn = g.board.buttons.some((b) => b.id === 'how');
    g.pressBoard('how'); G.lastBoardSig = null; G.boardDirty = true; board.present(0.1);
    out.howPage = G.boardPage; out.howOk = g.board.buttons.map((b) => b.id).join(',');
    g.pressBoard('howok'); out.back = G.boardPage;
    return out;
  });
  assert.deepEqual(r.rehearsal && r.rehearsal.steps[0], 'У дім можна зайти дверима або вікном', 'the rehearsal: the window card (the controls are the first-run tutorial\'s)');
  assert.deepEqual(r.first, { title: 'Як це: сторож ходить', steps: ['Промінь ліхтаря — його погляд: не стій у ньому', 'Присядь за меблями — і ти схований', '«?» над ним — він щось почув. Замри'], ok: 'Зрозуміло' });
  assert.equal(r.closed, null);
  assert.deepEqual(r.seen, ['windowIn', 'guard']);
  assert.equal(r.again, null, 'once per mechanic');
  assert.equal(r.btn, true);
  assert.equal(r.fromCard, 'Як це: сторож ходить', 'the level card\'s button opens it again');
  assert.equal(r.chest, 'З нею в руках двері не відчиниш');
  assert.equal(r.boardBtn, true);
  assert.deepEqual([r.howPage, r.howOk, r.back], ['how', 'howok', 'contract']);
  assert.deepEqual(errors, []);
  await ctx.close();
  // the phone's pause has the button
  const ph = await camp(base, { stars: { rehearsal: S1 }, phone: true });
  const pause = await ph.page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js');
    g.newRound(); g.setContract('first'); G.menu.page = 'main'; G.menu.render();
    const b = [...document.querySelectorAll('#pausemenu button')].find((x) => x.textContent === 'Як це?');
    if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { has: !!b, open: !document.getElementById('howcard').hidden };
  });
  assert.deepEqual(pause, { has: true, open: true });
  assert.deepEqual(ph.errors, []);
  await ph.ctx.close();
  // the classic test game: no cards
  const c2 = await newContext(browser);
  const p2 = await open(c2, base);
  assert.equal(await p2.page.evaluate(() => { const g = window.__game; g.newRound(); g.playing = true; g.sim(0.3); return document.getElementById('howcard').hidden; }), true);
  await c2.close();
});

// level 5 and the back window (plan §7.2, the owner's decisions of 16.11)
const WIN = `(g) => g.level.doors.find((d) => d.window)`;
test('campaign v2 (в): the rehearsal shows the back window — a book by it in the living room (elsewhere on other levels), a small chalk «АБО СЮДИ», the card «У дім можна зайти дверима або вікном»; the window opens and you climb in', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1 } });
  const r = await page.evaluate(async (WIN) => {
    const g = window.__game, win = eval(WIN)(g), book = () => { const b = g.loot.items.find((i) => i.id === 'book'); return [+b.mesh.position.x.toFixed(2), +b.mesh.position.z.toFixed(2), b.takeable]; };
    const out = {};
    g.newRound(); g.setContract('rehearsal'); g.sim(0.2);
    out.book0 = book(); out.room = g.level.roomAt(out.book0[0], out.book0[1]);
    out.sign = g.scene.getObjectByName('level 0 guide').visible;
    g.newRound(); g.setContract('first'); g.sim(0.2); out.book1 = book();
    g.newRound(); g.setContract('rehearsal'); g.playing = true; g.sim(0.2);
    for (const p of g.guards) p.update = () => null;
    g.player.teleport(4.0, -14.75, Math.PI); g.sim(0.3);   // outside, under the window, facing it
    const { startClimb, windowAhead } = await import('./src/systems/backWindow.js');
    out.ahead = !!windowAhead(); startClimb(); g.sim(4);
    out.inside = +g.player.head.z.toFixed(2); out.open = Math.abs(win.angle) > 0.9;
    return out;
  }, WIN);
  assert.equal(r.room, 'Вітальня', `the book lies in the living room on level 0: ${r.book0}`);
  assert.ok(Math.hypot(r.book0[0] - 4.0, r.book0[1] + 14) < 1.3 && r.book0[2], `by the window, takeable: ${r.book0}`);
  assert.deepEqual(r.book1.slice(0, 2), [-6.75, -9.1], 'elsewhere it is on the library desk');
  assert.equal(r.sign, true, 'the chalk on level 0');
  assert.equal(r.ahead, true);
  assert.ok(r.inside > -13.9 && r.open, `climbed in through the window it opened: ${JSON.stringify(r)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2 (в): level 5 — Petrovych sits on his post in the hall (no habits) and goes back after a noise; the card teaches only the action; a shut sash with the clock in hand says so; open, «Спустити у вікно»: the clock flies over the sill onto the flowerbed unharmed, with a quiet rustle; VR: let go over the sill', async () => {
  const STARS = { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1 };
  const { ctx, page, errors } = await camp(base, { stars: STARS });
  const r = await page.evaluate(async (WIN) => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), B = await import('./src/systems/backWindow.js'), out = {};
    const win = eval(WIN)(g), clock = g.loot.items.find((i) => i.id === 'clock'), P = g.guards[0];
    g.newRound(); g.setContract('clock'); g.playing = true; g.sim(0.1);
    out.card = document.getElementById('howcard').hidden ? null : [...document.querySelectorAll('#howsteps li')].map((x) => x.textContent);
    if (out.card) document.getElementById('howok').click();
    out.brief = g.contract.brief; out.habits = g.CFG.run.habits.length;
    g.player.teleport(0, 2, 0); g.sim(0.3);
    g.player.teleport(-8, 3, 0);
    g.sim(25, 1 / 30);
    out.post = { sitting: P.sitting, x: +P.x.toFixed(1), z: +P.z.toFixed(1) };
    g.noise.emit(0.3, -4.0, 8, 'drop', { y: 0.1, source: 'world' }); g.sim(1);
    out.up = P.sitting; g.sim(40, 1 / 30); out.back = { sitting: P.sitting, x: +P.x.toFixed(1), z: +P.z.toFixed(1) };
    P.update = () => null;
    // the clock in hand at the shut window
    g.player.teleport(4.0, -13.3, 0); g.sim(0.2); G.hands.desk = clock; clock.holders.push('desk'); clock.state = 'held';
    out.label = B.climbLabel();
    B.startClimb(); g.sim(0.1); out.shut = { flash: g.flashText, still: G.hands.desk === clock };
    // open it (put the clock down first: big item, no doors) — here: the sash opened by the test
    win.openTo(4.0, -13.3, 1.2, 0.3); g.sim(0.6);
    const heard = []; const off = g.noise.on((e) => heard.push(e.radius));
    B.startClimb(); out.flying = { desk: G.hands.desk, takeable: clock.takeable };
    g.sim(2);
    const p = clock.mesh.position; out.landed = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), damaged: clock.damaged, state: clock.state, takeable: clock.takeable };
    out.heard = heard; if (typeof off === 'function') off();
    // VR: the vase let go over the open sill
    const vase = g.loot.items.find((i) => i.id === 'vase'); vase.mesh.position.set(4.0, 1.1, -13.9);
    out.vr = B.lowerAtRelease(vase); g.sim(2); out.vrAt = +vase.mesh.position.z.toFixed(2);
    vase.mesh.position.set(4.0, 1.1, -12.0); out.vrFar = B.lowerAtRelease(vase);
    return out;
  }, WIN);
  assert.deepEqual(r.card, ['Речі можна спускати у вікно', 'Стань біля відчиненого вікна з річчю в руках', '«Спустити у вікно» — і вона надворі'], 'the card: the action only');
  assert.match(r.brief, /Петрович у холі\. Двері під його носом\./);
  assert.equal(r.habits, 0, 'no habits on his post');
  assert.ok(r.post.sitting && Math.hypot(r.post.x - 2.4, r.post.z + 2.6) < 0.3, `on his post: ${JSON.stringify(r.post)}`);
  assert.equal(r.up, false, 'a noise gets him up');
  assert.ok(r.back.sitting && Math.hypot(r.back.x - 2.4, r.back.z + 2.6) < 0.3, `and back on his post: ${JSON.stringify(r.back)}`);
  assert.equal(r.label, 'Спустити у вікно');
  assert.deepEqual(r.shut, { flash: 'Вікно зачинене, а руки зайняті: спершу постав річ і відчини', still: true });
  assert.deepEqual(r.flying, { desk: null, takeable: false }, 'out of the hands, not takeable in the air');
  assert.ok(r.landed.x > 3.15 && r.landed.x < 4.85 && r.landed.z > -15.05 && r.landed.z < -14.2 && r.landed.y < 0.2, `on the flowerbed: ${JSON.stringify(r.landed)}`);
  assert.deepEqual([r.landed.damaged, r.landed.state, r.landed.takeable], [false, 'rest', true], 'unharmed, can be taken');
  assert.ok(r.heard.includes(3), `the flowerbed's quiet rustle: ${r.heard}`);
  assert.equal(r.vr, true); assert.ok(r.vrAt < -14.2, `VR: the vase went out: ${r.vrAt}`);
  assert.equal(r.vrFar, false, 'not from across the room');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2 (в): level 5\'s hints in steps — Зоя after 75 s with the clock still in the house (at once if he doubts while you hold it), the chalk ring and «В ОБХІД» after 150 s; after 2 failed rounds the chalk from the start; none once the clock is out', async () => {
  const STARS = { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1 };
  const { ctx, page, errors } = await camp(base, { stars: STARS });
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), out = {};
    localStorage.setItem('nocturne.howSeen', JSON.stringify(['windowDrop']));
    const chalk = () => g.scene.getObjectByName('level hints (chalk)').visible;
    const round = () => { g.newRound(); g.setContract('clock'); g.playing = true; for (const p of g.guards) p.update = () => null; g.player.teleport(0, 2, 0); g.sim(0.3); };
    round();
    g.sim(70, 1 / 20); out.at70 = { zoya: G.crewLineT > 0 && G.crewLine && G.crewLine.line, chalk: chalk() };
    g.sim(8, 1 / 20); out.at78 = { zoya: G.crewLine && G.crewLine.line, chalk: chalk() };
    g.sim(75, 1 / 20); out.at153 = chalk();
    g.round.finish('caught'); g.sim(0.3);
    round(); g.round.finish('caught'); g.sim(0.3);
    round(); out.fails = JSON.parse(localStorage.getItem('nocturne.levelFails')).clock; out.start = chalk();
    // the clock out of the house: no more hints
    G.crewLine = null; G.crewLineT = 0; localStorage.setItem('nocturne.levelFails', '{}');
    round(); const c = g.loot.items.find((i) => i.id === 'clock'); c.mesh.position.set(4, 0, -14.6);
    g.sim(80, 1 / 20); out.outside = { zoya: !!G.crewLine, chalk: chalk() };
    return out;
  });
  assert.deepEqual(r.at70, { zoya: false, chalk: false }, 'nothing before 75 s');
  assert.deepEqual(r.at78, { zoya: 'Петрович дивиться на двері. А вікна?', chalk: false });
  assert.equal(r.at153, true, 'the chalk after 150 s');
  assert.deepEqual([r.fails, r.start], [2, true], 'two failed rounds: the chalk from the start');
  assert.deepEqual(r.outside, { zoya: false, chalk: false });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2 (в): with friends the guest lowers the clock — the host decides and flies it, both see it on the flowerbed; the host\'s own lowering the guest sees too', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 1 }, chest: { medium: 1 }, quiet: { medium: 1 }, wardrobe: { medium: 1 } })); localStorage.setItem('nocturne.howSeen', '["windowDrop"]'); });
  const host = await open(ctx, preview + '?map=dacha&net=local');
  const code = '271828';
  await host.page.evaluate((code) => { window.__game.setContract('clock'); return window.__game.net.open(code, 'host', 'Аня', 'zoya'); }, code);
  const guest = await open(ctx, preview + '?map=dacha&net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'rita'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; for (const q of g.guards) q.update = () => null; });
  const run = async (secs) => { for (let t = 0; t < secs; t += 0.1) { for (const p of pages) await p.evaluate(() => window.__game.sim(0.1)); await host.page.waitForTimeout(30); } };
  await run(0.6);
  // the host opens the window; the guest goes to the clock and takes it (through the host)
  await host.page.evaluate(() => { const g = window.__game; g.level.doors.find((d) => d.window).openTo(4.0, -13.3, 1.2, 0.3); });
  await guest.page.evaluate(() => { const g = window.__game; g.player.teleport(2.4, -13.0, 0); g.sim(0.1); });
  await run(0.6);
  await guest.page.evaluate(async () => { const g = window.__game, { G } = await import('./src/systems/state.js'); G.netIntent('take', { i: g.loot.items.findIndex((i) => i.id === 'clock') }); });
  await run(0.8);
  const holds = await guest.page.evaluate(() => { const g = window.__game; return !!(g.hands.desk && g.hands.desk.id === 'clock'); });
  assert.equal(holds, true, 'the guest carries the clock');
  await guest.page.evaluate(() => { const g = window.__game; g.player.teleport(4.0, -13.3, 0); g.sim(0.1); });
  await run(0.6);
  await guest.page.keyboard.press('KeyE');
  await run(2.5);
  const at = await Promise.all(pages.map((p) => p.evaluate(() => { const c = window.__game.loot.items.find((i) => i.id === 'clock').mesh.position; return [+c.x.toFixed(1), +c.z.toFixed(1)]; })));
  for (const [x, z] of at) assert.ok(x > 3.1 && x < 4.9 && z > -15.1 && z < -14.15, `on the flowerbed for both: ${JSON.stringify(at)}`);
  // the host lowers the vase itself: the guest sees it go out
  await host.page.evaluate(async () => { const g = window.__game, B = await import('./src/systems/backWindow.js'); const v = g.loot.items.find((i) => i.id === 'vase'); v.mesh.position.set(4.0, 1.1, -13.9); B.lowerAtRelease(v); });
  await run(2.5);
  const vz = await guest.page.evaluate(() => +window.__game.loot.items.find((i) => i.id === 'vase').mesh.position.z.toFixed(1));
  assert.ok(vz < -14.15, `the guest sees the host's vase outside: ${vz}`);
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('campaign v2 (г): «Кабінет» (level 8) — the laptop is the goal, the devices come here («Як це: пристрої»), Valera sits at the study\'s desk all round; the breaker sends him to the boiler room and his desk is free; «Підміна» is level 9', async () => {
  const stars = { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1, clock: S1, m8: S1, m10: S1 };
  const { ctx, page, errors } = await camp(base + '?map=mansion', { stars });
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {}, Cm = await import('./src/game/campaign.js');
    g.newRound(); g.setContract('m9'); g.setDifficulty('medium'); g.playing = true; g.sim(0.1);
    out.card = document.getElementById('howcard').hidden ? null : document.getElementById('howtitle').textContent;
    if (out.card) document.getElementById('howok').click();
    out.goal = g.goalText(g.contract, g.loot.items); out.locked = !!g.contract.locked; out.dev = g.devices.enabled;
    out.open = Cm.isOpenLevel(Cm.levelOf('m9')); out.next = Cm.nextLevel('m9').n;
    g.player.teleport(15, -9, 0); g.sim(0.3);   // the alley, by the van: the round begins
    g.sim(25, 1 / 30);
    const V = g.guards[0], Z = g.guards[1];
    for (const z of g.guards.slice(1)) z.update = () => null;
    out.post = { sitting: V.sitting, x: +V.x.toFixed(1), z: +V.z.toFixed(1) };
    const br = g.devices.list.find((d) => d.kind === 'breaker');
    const { useDevice } = await import('./src/systems/distract.js');
    g.player.teleport(-0.2, -4.0, 0); g.sim(0.1); useDevice(br); g.player.teleport(15, -9, 0); g.sim(9, 1 / 30);   // flip it, step away to the alley
    out.away = { claimed: br.claimed === V, sitting: V.sitting, d: +Math.hypot(V.x - 9.6, V.z + 9.6).toFixed(1) };
    out.laptop = g.loot.items.find((i) => i.id === 'm_laptop').takeable;
    const trail = [];
    for (let i = 0; i < 16; i++) { g.sim(5, 1 / 30); trail.push(`${V.state}:${V.sitting ? "s" : ""}${V.x.toFixed(1)},${V.z.toFixed(1)}:${V.queue[0] ? V.queue[0].type + "/" + (V.queue[0].to || []).join("|") + "/" + V.timer.toFixed(0) : "-"}`); }
    out.trail = trail;
    out.back = { sitting: V.sitting, d: +Math.hypot(V.x - 9.6, V.z + 9.6).toFixed(1) };
    return out;
  });
  assert.equal(r.card, 'Як це: пристрої');
  assert.deepEqual([r.goal, r.locked, r.dev, r.open, r.next], ['винеси: Ноутбук з кабінету', false, true, true, 9]);
  assert.ok(r.post.sitting && Math.hypot(r.post.x - 9.6, r.post.z + 9.6) < 0.4, `Valera at the desk: ${JSON.stringify(r.post)}`);
  assert.ok(r.away.claimed && !r.away.sitting && r.away.d > 4, `the breaker took him away from the desk: ${JSON.stringify(r.away)}`);
  assert.equal(r.laptop, true);
  assert.ok(r.back.sitting && r.back.d < 0.5, `then back at the desk: ${JSON.stringify(r.back)} ${r.trail.join(' ')}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// the owner's test of 16.11
test('campaign v2 (16.11): the round\'s end has «Ще раз» and «Далі: рівень N» (only when that level is open) — after a success, caught and late alike, on the phone\'s summary and the board (PC, VR); no «Новий раунд»', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1, first: S1 } });
  const r = await page.evaluate(async (PLAY) => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), { board } = await import('./src/systems/board.js');
    const P = await import('./src/systems/phone.js'), { Summary } = await import('./src/ui/summary.js');
    const play = eval(PLAY), by = (id) => g.loot.items.find((i) => i.id === id), out = {};
    const look = () => {
      G.lastBoardSig = null; G.boardDirty = true; board.present(0.1);
      const div = document.createElement('div'); document.body.append(div);
      new Summary(div, { play() {}, again() {}, next() {}, menu() {}, report() {} }).show(P.summaryState());
      const phone = [...div.querySelectorAll('.sm-buttons2 button')].map((b) => b.textContent + (b.classList.contains('primary') ? '*' : ''));
      div.remove();
      return { board: g.board.buttons.filter((b) => b.id === 'again' || b.id === 'nextlvl').map((b) => b.label), phone, text: document.body.innerText.includes('Новий раунд') };
    };
    play('first', 'medium', (g) => { g.loot.deliver(by('painting')); }); out.ok = look();
    play('first', 'medium', () => {}, 'caught'); out.caught = look();
    play('first', 'medium', () => {}, 'late'); out.late = look();
    play('chest', 'medium', () => {}, 'caught'); out.fresh = look();   // level 2 failed: level 3 is not open
    g.pressBoard('again'); g.sim(0.1); out.flash = g.flashText; out.contract = g.contract.id;
    return out;
  }, PLAY);
  assert.deepEqual(r.ok, { board: ['Ще раз', 'Далі: рівень 2'], phone: ['Ще раз', 'Далі: рівень 2*'], text: false }, 'success: «Далі» the primary');
  assert.deepEqual(r.caught, { board: ['Ще раз', 'Далі: рівень 2'], phone: ['Ще раз*', 'Далі: рівень 2'], text: false }, 'caught: «Ще раз» the primary, «Далі» since level 2 is open');
  assert.deepEqual(r.late, r.caught, 'late: the same');
  assert.deepEqual(r.fresh, { board: ['Ще раз'], phone: ['Ще раз*'], text: false }, 'the next level closed: «Ще раз» only');
  assert.equal(r.flash, 'Ще раз. Годинник піде, щойно зайдеш у хвіртку');
  assert.equal(r.contract, 'chest', 'the same level again');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('campaign v2 (16.11, variant В): a change of house is «Їдемо в Маєток…» instead of the splash, then «Поїхали ▶» — after «Далі: Маєток» it starts the round on level 6; from a level card it opens the «Грати» page; a plain reload has no such line', async () => {
  const stars = { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1, clock: S1 };
  const ctx = await newContext(browser, {}, { menu: true });
  await ctx.addInitScript((stars) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('nocturne.stars', JSON.stringify(stars)); }
  }, stars);
  const { page, errors } = await open(ctx, base + '?map=dacha&splash=1');
  // the last dacha level won: the summary's «Далі: Маєток»
  await page.evaluate(async (PLAY) => {
    const g = window.__game, play = eval(PLAY);
    play('clock', 'medium', (g) => { g.loot.deliver(g.loot.items.find((i) => i.id === 'clock')); });
  }, PLAY);
  await page.evaluate(() => window.__game.pressBoard('nextlvl')).catch(() => {});   // the page goes away under it
  await page.waitForURL((u) => u.search.includes('map=mansion'), { timeout: 45000, waitUntil: 'commit' });
  await page.waitForFunction(() => !!document.getElementById('travel'), null, { timeout: 30000 });
  const first = await page.evaluate(() => ({ on: !document.getElementById('travel').hidden, text: document.getElementById('traveltext').textContent, splash: !!document.getElementById('splash') }));
  assert.deepEqual(first, { on: true, text: 'Їдемо в Маєток…', splash: false }, 'the line at once, no splash');
  await page.waitForFunction(() => window.__game && !document.getElementById('travelgo').hidden, null, { timeout: 60000 });
  await page.click('#travelgo');
  await page.waitForFunction(() => window.__game.playing, null, { timeout: 10000 });
  const after = await page.evaluate(() => ({ map: window.__game.level.id, c: window.__game.contract.id, on: !document.getElementById('travel').hidden }));
  assert.deepEqual(after, { map: 'mansion', c: 'm8', on: false }, '«Поїхали ▶»: the round of level 6 at the van');
  // from a level card (the menu): back to the dacha, the «Грати» page
  await page.evaluate(async () => {   // a level card of the other house (systems/levels.js pickLevel, as the menu's card does)
    const g = window.__game, L = await import('./src/systems/levels.js'), M = await import('./src/world/maps.js');
    setTimeout(() => L.pickLevel('quiet', { setContract: g.setContract, newRound: g.newRound, switchMap: M.switchMap }), 0);
  });
  await page.waitForURL((u) => u.search.includes('map=dacha'), { timeout: 45000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__game && document.getElementById('travelgo') && !document.getElementById('travelgo').hidden, null, { timeout: 60000 });
  assert.equal(await page.textContent('#traveltext'), 'Їдемо на Дачу…');
  await page.click('#travelgo');
  const menu = await page.evaluate(() => ({ c: window.__game.contract.id, page: new URL(location.href).searchParams.get('page'), on: !document.getElementById('travel').hidden }));
  assert.deepEqual(menu, { c: 'quiet', page: 'play', on: false }, 'the «Грати» page with that level');
  // a plain reload: the usual start (no line)
  await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => document.getElementById('travel').hidden), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
