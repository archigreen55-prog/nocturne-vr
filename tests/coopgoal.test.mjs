// The co-op campaign (plan 2026-11-22-coop-campaign, parts А–Б): the money goal by the number of thieves (§1), the
// money in «solo dollars» (decision Р1 А), the way to a level that a friend's room does not shorten (§2: a star won on
// a closed level opens nothing; what was open stays open: `opened2`), the guest's lines.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

// a campaign page (what a player gets); stars: seeded before the first load, as an old player's save
async function camp({ stars = null, wallet = null, url = base, seed = null } = {}) {
  const ctx = await newContext(browser, {}, { menu: true });
  await ctx.addInitScript(([stars, wallet, seed]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      if (stars) localStorage.setItem('nocturne.stars', JSON.stringify(stars));
      if (wallet) localStorage.setItem('nocturne.wallet2', JSON.stringify(wallet));
      for (const [k, v] of Object.entries(seed || {})) localStorage.setItem('nocturne.' + k, JSON.stringify(v));
    }
  }, [stars, wallet, seed]);
  const { page, errors } = await open(ctx, url);
  return { ctx, page, errors };
}
const wait = (page, ms) => page.waitForTimeout(ms);
async function run(pages, seconds) {
  for (let t = 0; t < seconds; t += 0.1) {
    for (const p of pages) await p.evaluate(() => window.__game.sim(0.1));
    await wait(pages[0], 30);
  }
}

test('co-op goal (22.11 §1): k = 1 / 1.5 / 2 / 2.5; the money goals and the ★★★ «$» grow, items, counts, floor items and times do not', async () => {
  const { ctx, page, errors } = await camp();
  const r = await page.evaluate(async () => {
    const g = window.__game, C = await import('./src/game/contracts.js'), M = await import('./src/config/mansion.js');
    const all = g.CFG.contracts.concat(M.mansion.contracts), by = (id) => all.find((c) => c.id === id);
    const out = { k: [1, 2, 3, 4].map((n) => C.goalK(n)) };
    out.sums = {};
    for (const id of ['first', 'quiet', 'wardrobe', 'm8']) out.sums[id] = [1, 2, 3, 4].map((n) => { const c = C.scaledGoal(by(id), n); return [c.goal.sum, c.star3 && c.star3.sum]; });
    // what must not change: the item, the count, the floor items, the time ★★★
    out.same = ['chest', 'clock', 'rehearsal', 'm10', 'm9', 'm12'].map((id) => { const c = by(id); return C.scaledGoal(c, 4) === c; });
    out.timeStar = C.scaledGoal(by('m8'), 4).star3;
    out.items = C.scaledGoal(by('wardrobe'), 3).goal.item;
    // the text, the progress, the stars: all follow the number the game was given
    C.setGoalPlayers(2);
    out.text = C.goalText(by('first'), g.loot.items); out.label = C.goalLabel(by('first'), g.loot.items); out.solo = C.goalText(by('chest'), g.loot.items);
    out.progress = C.progress(by('first'), { sum: 300, inVan: 0 }, g.loot).text;
    out.rows = C.starRows(by('quiet'), g.loot.items).map((x) => x.text);
    const R = (sum) => ({ kind: 'left', sum, shouts: 0, damaged: 0, broken: 0, inVan: 3, time: 100 }), ctx = { alarmed: false, noMic: false, difficulty: 'medium', loot: g.loot, guards: [] };
    out.firstEdge = [749, 750].map((s) => C.evaluate(by('first'), R(s), ctx).bits[0]);
    out.star3Edge = [2099, 2100].map((s) => C.evaluate(by('quiet'), R(s), ctx).bits[2]);   // level 3: ★★★ $1,400 x 1.5
    C.setGoalPlayers(1);
    out.soloEdge = [499, 500].map((s) => C.evaluate(by('first'), R(s), ctx).bits[0]);
    out.back = C.goalText(by('first'), g.loot.items);
    C.setGoalPlayers(9); out.cap = C.goalPlayers(); C.setGoalPlayers(0); out.floor = C.goalPlayers(); C.setGoalPlayers(1);
    return out;
  });
  assert.deepEqual(r.k, [1, 1.5, 2, 2.5]);
  assert.deepEqual(r.sums.first.map((x) => x[0]), [500, 750, 1000, 1250], 'level 1 «Перша справа»');
  assert.deepEqual(r.sums.quiet, [[700, 1400], [1050, 2100], [1400, 2800], [1750, 3500]], 'level 3 «Тихо»: the goal and the ★★★');
  assert.deepEqual(r.sums.wardrobe.map((x) => x[0]), [1000, 1500, 2000, 2500]);
  assert.deepEqual(r.sums.m8.map((x) => x[0]), [1500, 2250, 3000, 3750]);
  assert.deepEqual(r.same, [true, true, true, true, true, true], 'item / count / floor items: the same contract, untouched');
  assert.deepEqual(r.timeStar, { time: 240 }, 'a time ★★★ is the same');
  assert.equal(r.items, 'jewelbox');
  assert.equal(r.text, 'винеси щонайменше $750');
  assert.equal(r.label, 'винеси щонайменше $750 (2 злодії)');
  assert.equal(r.solo, 'винеси: Скриня', 'no money: no suffix, no change');
  assert.equal(r.progress, '$300 / $750');
  assert.ok(r.rows[0].includes('$1,050') && r.rows[2].includes('$2,100'), r.rows.join(' | '));
  assert.deepEqual(r.firstEdge, [false, true]); assert.deepEqual(r.star3Edge, [false, true]);
  assert.deepEqual(r.soloEdge, [false, true]); assert.equal(r.back, 'винеси щонайменше $500');
  assert.deepEqual([r.cap, r.floor], [4, 1], 'between 1 and 4 thieves');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('co-op goal (22.11 §1.4, Р1 А): the record and the pay are in «solo dollars» (the brigade\'s loot ÷ k); a solo round is as before; the summary shows both numbers', async () => {
  const { ctx, page, errors } = await camp();
  const r = await page.evaluate(async () => {
    const E = await import('./src/game/economy.js'), X = await import('./src/systems/economy.js');
    const out = {};
    const round = (loot, players, bits = [false, false, false]) => E.creditRound({ contractId: 'first', difficulty: 'medium', loot, stars: 0, bits, practice: false, players });
    out.four = round(3500, 4);                          // 3500 ÷ 2.5 = 1400 solo dollars
    out.record1 = E.lootRecord('first');
    out.fourAgain = round(3000, 4);                     // 1200 < the record: nothing
    out.cash1 = E.wallet().cash;
    out.two = round(2250, 2);                           // 2250 ÷ 1.5 = 1500: beats 1400 by 100
    out.solo = round(1600, 1);                          // alone: the loot as it is, beats 1500 by 100
    out.record2 = E.lootRecord('first');
    out.lines = X.incomeLines({ ...out.four, got: true, fresh: [false, false, false] });
    out.soloLines = X.incomeLines({ ...out.solo, got: true, fresh: [false, false, false] });
    return out;
  });
  assert.deepEqual([r.four.sum, r.four.team, r.four.loot, r.four.players], [1400, 3500, 1400, 4]);
  assert.equal(r.record1, 1400);
  assert.deepEqual([r.fourAgain.loot, r.fourAgain.sum], [0, 1200], 'worse than the record: no money');
  assert.equal(r.cash1, 1400);
  assert.deepEqual([r.two.sum, r.two.loot], [1500, 100]);
  assert.deepEqual([r.solo.sum, r.solo.loot], [1600, 100]);
  assert.equal(r.record2, 1600);
  assert.ok(r.lines.includes('Бригада: $3,500 · тобі як соло: $1,400'), r.lines.join(' | '));
  assert.ok(!r.soloLines.some((l) => l.includes('Бригада')), 'alone: no second number');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// two tabs: the host and a guest (?net=local), both in the campaign; the host has level 1 open
async function room(code, hostStars) {
  const ctx = await newContext(browser, { viewport: { width: 900, height: 700 } }, { menu: true });
  await ctx.addInitScript(([stars]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (stars && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('nocturne.stars', JSON.stringify(stars)); }
  }, [hostStars]);
  const host = await open(ctx, base + '?net=local');
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  return { ctx, host };
}
const joinGuest = async (ctx, code) => {
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  return guest;
};

test('co-op goal (22.11 §1.2): n is counted before the clock — the host and the friends who are there; fixed at the start (a friend leaves: the same goal); the guest sees the host\'s number, goal and stars', async () => {
  const { ctx, host } = await room('161803', { rehearsal: { medium: 1 } });
  await host.page.evaluate(() => { const g = window.__game; g.setContract('first'); });
  const alone = await host.page.evaluate(async () => (await import('./src/game/contracts.js')).goalPlayers());
  assert.equal(alone, 1, 'alone in the room: one thief');
  const guest = await joinGuest(ctx, '161803');
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { window.__game.playing = true; });
  await run(pages, 1.0);
  const view = (p) => p.evaluate(async () => { const C = await import('./src/game/contracts.js'), g = window.__game; return { n: C.goalPlayers(), text: C.goalText(g.contract, g.loot.items), id: g.contract.id, line: document.querySelector('#netgoal').textContent }; });
  const [h1, g1] = [await view(host.page), await view(guest.page)];
  assert.equal(h1.n, 2, 'the host and one friend'); assert.equal(g1.n, 2, 'the guest takes the host\'s number');
  assert.equal(h1.text, 'винеси щонайменше $750'); assert.equal(g1.text, h1.text, 'the same goal on both');
  assert.equal(h1.line, 'Мета: винеси щонайменше $750 (2 злодії)'); assert.equal(g1.line, h1.line, 'the room says it to the guest too');
  // the clock starts: the number is fixed; the friend leaves, the goal stays
  await host.page.evaluate(() => { window.__game.round.phase = 'heist'; });
  await run(pages, 0.4);
  await guest.page.evaluate(async () => (await import('./src/systems/net.js')).netLeave());
  await run([host.page], 2.5);
  const frozen = await host.page.evaluate(async () => { const C = await import('./src/game/contracts.js'), g = window.__game; return { n: C.goalPlayers(), text: C.goalText(g.contract, g.loot.items) }; });
  assert.deepEqual(frozen, { n: 2, text: 'винеси щонайменше $750' }, 'a friend that left in the middle changes nothing');
  // the verdict: the host's sum $800 = the goal met on both (the guest evaluates the same event with the host's number)
  assert.equal(await host.page.evaluate(async () => { const C = await import('./src/game/contracts.js'), g = window.__game; return C.evaluate(g.contract, { kind: 'left', sum: 740, shouts: 0, damaged: 0, broken: 0 }, { alarmed: false, noMic: false, difficulty: 'medium', loot: g.loot, guards: [] }).goal; }), false, '$740 is under $750');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('co-op goal (22.11 §1.2): a friend who is the guard (W15) or lost is not a thief; a new round counts again; alone again after leaving the room', async () => {
  const { ctx, host } = await room('141421', { rehearsal: { medium: 1 } });
  await host.page.evaluate(() => window.__game.setContract('first'));
  const guest = await joinGuest(ctx, '141421');
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { window.__game.playing = true; });
  await run(pages, 0.8);
  const n = (p) => p.evaluate(async () => (await import('./src/game/contracts.js')).goalPlayers());
  assert.equal(await n(host.page), 2);
  // the guest plays the guard: one thief again
  await guest.page.evaluate(async () => (await import('./src/systems/net.js')).netRole(true));
  await run(pages, 1.0);
  assert.equal(await n(host.page), 1, 'a guard is not a thief');
  assert.equal(await n(guest.page), 1);
  await guest.page.evaluate(async () => (await import('./src/systems/net.js')).netRole(false));
  await run(pages, 1.0);
  assert.equal(await n(host.page), 2, 'a thief again');
  // the host leaves the room: the goal as in solo
  await host.page.evaluate(async () => (await import('./src/systems/net.js')).netLeave());
  assert.equal(await n(host.page), 1, 'alone: ×1');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('way to a level (22.11 §2): a star won on a closed level is kept but opens nothing — not the next level, not the mansion; it opens at once when the player gets there', async () => {
  const { ctx, page, errors } = await camp();   // a new player
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/game/economy.js'), C = await import('./src/game/contracts.js'), Cm = await import('./src/game/campaign.js');
    const open = () => Cm.levels().filter((l) => Cm.isOpenLevel(l)).map((l) => l.n).join(',');
    const out = { start: open() };
    // a friend's room: stars on level 3 and on «Годинник» (5) with levels 1–2 not played
    C.recordBits('quiet', [true, true, false]); C.recordBits('clock', [true, false, false]);
    out.guest = open(); out.mansion = E.mapOpen('mansion');
    out.lockQuiet = (() => { const L = E.lockOf(g.CFG.contracts.find((c) => c.id === 'quiet')); return L && L.after && L.after.id; })();   // «спершу»: the first level on the way
    out.stars = [Cm.stars(Cm.levelOf('quiet')), Cm.stars(Cm.levelOf('clock'))];
    out.shop = Cm.reached('throw');                         // the cans from level 3: not reached
    // the player gets there itself: 0 → 1 → 2, and 3, 4 (with its stars from the room), 5, the mansion are open at once
    C.recordBits('rehearsal', [true, false, false]); out.s0 = open();
    C.recordBits('first', [true, false, false]); C.recordBits('chest', [true, false, false]);
    out.after = open(); out.mansionAfter = E.mapOpen('mansion');
    return out;
  });
  assert.equal(r.start, '0');
  assert.equal(r.guest, '0', 'stars on levels 3 and 5 open nothing');
  assert.equal(r.mansion, false, 'not the mansion');
  assert.equal(r.lockQuiet, 'rehearsal', 'the lock names the first level still to be passed');
  assert.deepEqual(r.stars, [2, 1], 'the stars are kept');
  assert.equal(r.shop, false, 'the shop\'s rows of level 3 are not reached');
  assert.equal(r.s0, '0,1');
  assert.equal(r.after, '0,1,2,3,4', 'level 3 is open and has the star it won with friends: level 4 opens at once (the reward is not lost); 4 has no star, so 5 stays shut');
  assert.equal(r.mansionAfter, false, 'level 5 has a star, but it is not open yet (4 has none): the mansion waits');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('way to a level (22.11 §2.2, Р3 А): what was open at the first start of this version stays open (opened2): an old player is not sent back, the mansion stays; a level opened later by the old rule does not appear', async () => {
  // an old player: stars on 1, 4, 5 (by the old rule everything up to the mansion is open) and none on 0, 2, 3
  const { ctx, page, errors } = await camp({ stars: { first: { medium: 1 }, wardrobe: { medium: 1 }, clock: { medium: 1 } } });
  const r = await page.evaluate(async () => {
    const E = await import('./src/game/economy.js'), Cm = await import('./src/game/campaign.js'), C = await import('./src/game/contracts.js');
    const snap = JSON.parse(localStorage.getItem('nocturne.opened2') || 'null');
    const out = { snap, open: Cm.levels().filter((l) => Cm.isOpenLevel(l)).map((l) => l.n).join(','), mansion: E.mapOpen('mansion') };
    // a star won later on a level the snapshot does not hold: the new rule decides (the chain)
    C.recordBits('m8', [true, false, false]);
    out.m10 = Cm.isOpenLevel(Cm.levelOf('m10'));
    C.recordBits('m9', [true, false, false]);   // «Кабінет» is level 8: m10 (7) has no star: 8 stays closed unless the snapshot has it
    out.m9 = Cm.isOpenLevel(Cm.levelOf('m9'));
    return out;
  });
  assert.ok(r.snap && r.snap.levels.includes('quiet') && r.snap.levels.includes('clock') && r.snap.maps.includes('mansion'), JSON.stringify(r.snap));
  assert.equal(r.open, '0,1,2,3,5,6', 'as the old rule left it: 0–3 (the levels put in count as passed by a later star), 4 shut (3 has no star), 5 and the mansion\'s first level open');
  assert.equal(r.mansion, true);
  assert.equal(r.m10, true, 'a star on m8 opens m10 by the chain');
  assert.equal(r.m9, false, 'but a star on m9 (closed) opens nothing after it');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a new player: the snapshot holds only level 0 and the dacha; «Відкрити все» still opens everything
  const c2 = await camp({ url: base + '?debug=1' });   // «Відкрити все» works on a preview or with ?debug
  const n = await c2.page.evaluate(async () => {
    const E = await import('./src/game/economy.js'), Cm = await import('./src/game/campaign.js');
    const out = { snap: JSON.parse(localStorage.getItem('nocturne.opened2') || 'null'), open: Cm.levels().filter((l) => Cm.isOpenLevel(l)).map((l) => l.n).join(',') };
    localStorage.setItem('nocturne.openAll', 'true');
    out.all = Cm.levels().filter((l) => Cm.isOpenLevel(l)).length; out.allMansion = E.mapOpen('mansion');
    return out;
  });
  assert.deepEqual(n.snap, { levels: ['rehearsal'], maps: ['dacha'] });
  assert.equal(n.open, '0');
  assert.equal(n.all, 10, '«Відкрити все» (preview / ?debug)'); assert.equal(n.allMansion, true);
  assert.deepEqual(c2.errors, []);
  await c2.ctx.close();
});

test('way to a level (22.11 §2.2): a guest whose level is closed gets the line under «Хост обрав…»; the host\'s own level has none; the card of a closed level with stars says «з друзями · 🔒 після рівня N»', async () => {
  const { ctx, host } = await room('173205', { rehearsal: { medium: 1 }, first: { medium: 1 }, chest: { medium: 1 } });   // the host: levels 0–3 open
  await host.page.evaluate(() => window.__game.setContract('quiet'));
  const guest = await joinGuest(ctx, '173205');
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { window.__game.playing = true; });
  // two tabs of one browser share one storage: the guest gets the progress of a new player (nothing won, level 0 only)
  await guest.page.evaluate(() => { localStorage.setItem('nocturne.stars', '{}'); localStorage.setItem('nocturne.opened2', JSON.stringify({ levels: ['rehearsal'], maps: ['dacha'] })); });
  await run(pages, 1.2);
  await guest.page.waitForFunction(() => !document.querySelector('#netlock').hidden, null, { timeout: 8000 });   // the lobby redraws a few times a second
  const lock = (p) => p.evaluate(() => { const e = document.querySelector('#netlock'); return { text: e.textContent, hidden: e.hidden }; });
  const gl = await lock(guest.page), hl = await lock(host.page);
  assert.equal(gl.hidden, false);
  assert.equal(gl.text, '🔒 У тебе цей рівень ще закритий. Зірки й гроші — тобі, а в соло він відкриється після рівня 0.', 'the guest has nothing yet: the first level on the way is 0');
  assert.equal(hl.hidden, true, 'the host has the level open: no line');
  // the guest gets the star on the closed level; its solo map shows it with the lock
  const card = await guest.page.evaluate(async () => {
    const C = await import('./src/game/contracts.js'), L = await import('./src/systems/levels.js');
    C.recordBits('quiet', [true, true, false]); C.recordStars('quiet', 'medium', 2, 'coop');   // what the end of a round does (systems/world.js)
    const l = L.levelGroups().flatMap((g) => g.levels).find((x) => x.id === 'quiet');
    return { stars: l.stars, locked: l.locked, after: l.after };
  });
  assert.deepEqual(card, { stars: 2, locked: true, after: 0 });
  await guest.page.evaluate(() => { window.__game.net.leave(); });
  const text = await guest.page.evaluate(async () => {
    const { LevelPick } = await import('./src/ui/levelPick.js'), L = await import('./src/systems/levels.js');
    const root = document.createElement('div'); document.body.append(root);
    new LevelPick(root, () => {}).show(L.levelGroups());
    return root.querySelector('[data-level="quiet"] .lv-stars').textContent;
  });
  assert.equal(text, '★★ з друзями · 🔒 після рівня 0');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});
