// Campaign v2 (the live test's ladder; plan «кампанія, зірки й економіка» of 2026-11-15, the owner's
// decisions of 15.11): the ladder 0–8 with its goals and round times, three stars per level (★ goal,
// ★★ «Тихо», ★★★ the level's own) on any difficulty, the money (each star once, the loot only above the
// level's record, never the rehearsal's; the new prices; the traps out of the van lost when caught), the
// mansion after a star on level 5, the level card and the board's note with the stars and their money,
// the summary's checklist with «Ще раз за ★★★» and «Далі», a big item and a door on a phone / PC, the price
// in hand. These pages run the campaign (`campaign: true`); the classic test game keeps the old rules.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, LAND } from './runner.mjs';

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

test('campaign v2: the ladder 0–8 (dacha 0–5, mansion 6–8), its goals and round times by difficulty; the left-out levels are not there; the mansion opens after a star on level 5', async () => {
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
  assert.equal(r.ladder, '0:rehearsal 1:first 2:chest 3:quiet 4:wardrobe 5:clock 6:m8 7:m10 8:m12');
  assert.equal(r.dacha, 'rehearsal first chest quiet wardrobe clock');
  assert.equal(r.mansion, 'm8 m10 m12');
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

test('campaign v2: the level card (menu «Грати») and the board\'s note show the three stars with their money (✓ the won ones), what is new, the round\'s time on this difficulty; the difficulty is in the settings; the summary (phone and board): the checklist, «Ще раз за ★★★ (+$500)» and «Далі: рівень 2»; the last dacha level says «Далі: Маєток»', async () => {
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
  assert.deepEqual(r.buttons.filter((b) => !b.startsWith('play')), ['again:Ще раз за ★★★ (+$500)', 'nextlvl:Далі: рівень 2']);
  assert.deepEqual(r.sum.checklist.map((c) => [c.n, c.got, c.note]), [[1, true, '+$200 нова'], [2, true, '+$300 нова'], [3, false, '«?» ×2']]);
  assert.deepEqual([r.sum.again, r.sum.next], ['Ще раз за ★★★ (+$500)', 'Далі: рівень 2']);
  assert.equal(r.dom.checks.length, 3);
  assert.deepEqual(r.dom.buttons, ['Ще раз за ★★★ (+$500)', 'Далі: рівень 2*'], 'two buttons, «Далі» the primary');
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
    g.newRound(); g.setContract('rehearsal'); g.playing = true; g.sim(0.2); out.rehearsal = card();
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
  assert.equal(r.rehearsal, null, 'the rehearsal: the first-run tutorial, no card');
  assert.deepEqual(r.first, { title: 'Як це: сторож ходить', steps: ['Промінь ліхтаря — його погляд: не стій у ньому', 'Присядь за меблями — і ти схований', '«?» над ним — він щось почув. Замри'], ok: 'Зрозуміло' });
  assert.equal(r.closed, null);
  assert.deepEqual(r.seen, ['guard']);
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
