// W19 «Кампанія», stage E1 (plan-W19-campaign.md §2): the ladder of levels over the contracts (level 0
// «Репетиція», level 3 «Шафа»), the mechanics one level at a time (cans, devices, traps, Шафник), the
// rehearsal's round (Petrovych in his armchair, the clock stands, two items = one star), the board's
// note «pp.» and «Далі: рівень N». These pages run the campaign (`campaign: true`); the other tests
// keep the classic game (config/campaign.js CLASSIC) — checked here too.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview } from './runner.mjs';

// a page of the campaign (what a player gets), the harness's other settings as usual
async function camp(url = base, { stars = null, wallet = null } = {}) {
  const ctx = await newContext(browser, {}, { menu: true });
  await ctx.addInitScript(([stars, wallet]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (stars && !sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('nocturne.stars', JSON.stringify(stars));
      if (wallet) localStorage.setItem('nocturne.wallet', JSON.stringify(wallet));
    }
  }, [stars, wallet]);
  const { page, errors } = await open(ctx, url);
  return { ctx, page, errors };
}
const S1 = { medium: 1 };
const WALLET = { cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [], trialSoap: true, stock: { soap: 1, marbles: 1, bucket: 1 } };   // the free soap of contract 7 already given

test('the ladder (campaign v2): a new player starts at level 0 «Репетиція»; the dacha goes 0–5 («Скриня» 2, «Бляшанка» 3, «Шафа» 4); a star opens the next; an old player is not sent back (the levels put in count as passed by a later star); the mansion after a star on 5; the classic test game keeps the old list', async () => {
  const { ctx, page, errors } = await camp();
  const fresh = await page.evaluate(async () => {
    const g = window.__game, Cm = await import('./src/game/campaign.js'), E = await import('./src/game/economy.js');
    return {
      contract: g.contract.id, current: Cm.currentLevel().n,
      list: [...document.querySelectorAll('#contract option')].map((o) => o.textContent),
      ladder: Cm.levels().map((l) => `${l.n}:${l.id}`).join(' '),
      firstLock: !!E.lockOf(g.CFG.contracts.find((c) => c.id === 'first')),
      board: g.board.buttons.map((b) => b.id),
    };
  });
  assert.equal(fresh.contract, 'rehearsal', 'a new player starts at the rehearsal');
  assert.equal(fresh.current, 0);
  assert.equal(fresh.ladder, '0:rehearsal 1:first 2:chest 3:quiet 4:wardrobe 5:clock 6:m8 7:m10 8:m12');
  assert.match(fresh.list[0], /^0\. Репетиція$/);
  assert.match(fresh.list[3], /🔒.*3\. Бляшанка/);
  assert.match(fresh.list[4], /🔒.*4\. Шафа/);
  assert.equal(fresh.list.length, 6);
  assert.ok(fresh.firstLock, 'level 1 waits for a star on the rehearsal');
  const after = await page.evaluate(async () => {
    const Cm = await import('./src/game/campaign.js'), E = await import('./src/game/economy.js'), C = await import('./src/game/contracts.js');
    const out = {};
    C.recordStars('rehearsal', 'medium', 1, 'pc');
    out.firstOpen = Cm.isOpenLevel(Cm.levelOf('first')); out.current = Cm.currentLevel().n;
    // an old player: stars on 1, 2 and 4 (the old chain), none on 0 and 3
    localStorage.setItem('nocturne.stars', JSON.stringify({ first: { medium: 2 }, clock: { medium: 1 }, quiet: { medium: 1 } }));
    out.old = Cm.levels().filter((l) => l.act === 1).map((l) => `${l.n}${Cm.isOpenLevel(l) ? 'o' : 'x'}${Cm.passed(l) ? 'p' : ''}`).join(' ');
    out.oldCurrent = Cm.currentLevel().n;
    // the mansion: a star on level 5 («Годинник»), not a count of stars
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { hard: 3 }, chest: { hard: 3 }, quiet: { hard: 3 }, wardrobe: { medium: 1 } }));
    out.mansion4 = E.mapOpen('mansion');
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, clock: { medium: 1 } }));
    out.mansion5 = E.mapOpen('mansion');
    return out;
  });
  assert.equal(after.firstOpen, true, 'a star on the rehearsal opens level 1');
  assert.equal(after.current, 1);
  assert.equal(after.old, '0op 1op 2op 3op 4op 5op', 'the old player: the levels put in (0, «Скриня», «Шафа») are passed by the later stars');
  assert.equal(after.oldCurrent, 6, 'the old player goes on in the mansion');
  assert.deepEqual([after.mansion4, after.mansion5], [false, true], 'the mansion after a star on level 5');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the tests' classic game (no `campaign`): the old list, contract 1 first, every mechanic there
  const c2 = await newContext(browser);
  const p2 = await open(c2, base);
  const classic = await p2.page.evaluate(async () => {
    const g = window.__game, Cm = await import('./src/game/campaign.js');
    return { ids: g.CFG.contracts.map((c) => c.id).join(' '), contract: g.contract.id, cans: g.loot.items.filter((i) => i.throwable && !i.trap && i.mesh.visible).length, dev: g.devices.enabled, traps: Cm.unlocked('trap:bucket', g.contract) };
  });
  assert.equal(classic.ids, 'first clock quiet silent rush evening');
  assert.equal(classic.contract, 'first');
  assert.ok(classic.cans > 0 && classic.dev && classic.traps, 'classic: cans, devices, traps');
  await c2.close();
});

test('mechanics one level at a time (campaign v2): no cans before 3, Шафник asleep before 4 (the box shut), no devices and no traps on this ladder yet (they come with «Кабінет» and «Мило»); the shop shows no traps; «Відкрити все» on a preview opens all', async () => {
  const all = { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1, clock: S1 };
  const { ctx, page, errors } = await camp(base, { stars: all, wallet: WALLET });
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/systems/economy.js');
    localStorage.setItem('nocturne.wallet2', JSON.stringify({ cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [], stock: { soap: 1, marbles: 1, bucket: 1 } }));
    g.patrol.update = () => null;
    const W = g.level.wardrobe, out = {};
    const at = (id) => {
      g.newRound(); g.setContract(id); g.playing = true; g.sim(0.1);
      const cans = g.loot.items.filter((i) => i.throwable && !i.trap);
      const van = g.loot.items.filter((i) => i.trap && i.inVan).map((i) => i.trap).sort().join(',');
      // stand in front of the wardrobe for 2 s
      g.lurker.reset(); g.player.teleport(W.x - 0.9, W.z, Math.PI / 2); g.sim(2);
      const box = g.loot.items.find((i) => i.inWardrobe);
      const o = { box: !!(box && box.shut), cans: cans.filter((i) => i.mesh.visible && !i.gone).length + '/' + cans.length, dev: g.devices.enabled && g.devices.group.visible, lurker: g.lurker.state, van };
      g.player.teleport(g.level.spawn.x, g.level.spawn.z, g.level.spawn.yaw);
      return o;
    };
    for (const id of ['rehearsal', 'first', 'chest', 'quiet', 'wardrobe', 'clock']) out[id] = at(id);
    out.rows = E.shopRows().filter((x) => x.consumable).length;
    return out;
  });
  const n = r.rehearsal.cans.split('/')[1];
  for (const id of ['rehearsal', 'first', 'chest']) assert.equal(r[id].cans, `0/${n}`, `${id}: no cans`);
  for (const id of ['quiet', 'wardrobe', 'clock']) assert.equal(r[id].cans, `${n}/${n}`, `${id}: the cans are there`);
  for (const id of ['rehearsal', 'first', 'chest', 'quiet', 'wardrobe', 'clock']) assert.equal(r[id].dev, false, `${id}: no devices`);
  for (const id of ['rehearsal', 'first', 'chest', 'quiet']) assert.deepEqual([r[id].lurker, r[id].box], ['dormant', true], `${id}: Шафник sleeps, the box shut`);
  assert.notEqual(r.wardrobe.lurker, 'dormant', 'level 4: Шафник wakes');
  for (const id of ['rehearsal', 'first', 'chest', 'quiet', 'wardrobe', 'clock']) assert.equal(r[id].van, '', `${id}: no traps in the van (even with some in stock)`);
  assert.equal(r.rows, 0, 'no traps in the shop');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a preview with «Відкрити все»: level 0 has everything
  const pv = await camp(preview);
  const open = await pv.page.evaluate(() => {
    localStorage.setItem('nocturne.preview.openAll', 'true'); localStorage.setItem('nocturne.openAll', 'true');
    return true;
  });
  assert.ok(open);
  await pv.page.reload(); await pv.page.waitForFunction(() => window.__game);
  const o = await pv.page.evaluate(async () => {
    const g = window.__game; g.newRound(); g.setContract('rehearsal'); g.sim(0.1);
    return { contract: g.contract.id, cans: g.loot.items.some((i) => i.throwable && !i.trap && i.mesh.visible), dev: g.devices.enabled };
  });
  assert.deepEqual(o, { contract: 'rehearsal', cans: true, dev: true }, '«Відкрити все»: every mechanic on level 0');
  await pv.ctx.close();
});

test('the rehearsal: Petrovych sits down in his armchair and stays; the clock stands («Годинник стоїть»); two items in the van = the goal, one star, no bonus; the result: «Ще раз» and «Далі: рівень 1», which starts level 1', async () => {
  const { ctx, page, errors } = await camp();
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {}, { G } = await import('./src/systems/state.js'), { board } = await import('./src/systems/board.js');
    g.newRound(); g.playing = true;
    g.sim(40, 1 / 30);                                  // he walks to the armchair
    out.sitting = g.patrol.sitting;
    out.goal = g.goalText(g.contract, g.loot.items);
    g.player.teleport(0, 2, 0); g.sim(0.5);             // away from the van: the round begins
    out.phase = g.round.phase; out.flash = g.flashText;
    g.sim(20, 1 / 30);
    out.t = g.round.t; out.clock = Math.round(g.round.clock); out.time = g.CFG.round.time;
    out.stillSitting = g.patrol.sitting;
    const two = g.loot.items.filter((i) => !i.throwable && !i.trap && !i.heavy && !i.prop && !i.twoHanded && !i.crystal).slice(0, 2);
    for (const it of two) g.loot.deliver(it);
    g.sim(0.5);
    out.progress = g.progress(g.contract, g.loot.tally(), g.loot);
    g.round.finish('left'); g.sim(0.5);
    const said = [], c2 = g.board.g, orig = c2.fillText;
    c2.fillText = function (t, ...a) { said.push(String(t)); return orig.call(this, t, ...a); };
    G.lastBoardSig = null; G.boardDirty = true; board.present(0.1);
    c2.fillText = orig; out.checks = said.filter((t) => /^[✓✗]( \+\$|$)/.test(t));   // the stars' lines, not the items'
    out.verdict = { goal: g.verdict.goal, bonus: g.verdict.bonus, stars: g.verdict.stars };
    out.buttons = g.board.buttons.map((b) => b.id + ':' + b.label);
    const P = await import('./src/systems/phone.js'), sm = P.summaryState();   // the phone's summary: the same button
    out.summary = { next: sm.next && sm.next.n, practice: sm.practice };
    g.pressBoard('nextlvl'); g.sim(0.2);
    out.next = { contract: g.contract.id, phase: g.round.phase };
    return out;
  });
  assert.equal(r.sitting, true, 'in the armchair');
  assert.equal(r.goal, 'винеси 2 будь-які речі');
  assert.equal(r.phase, 'heist');
  assert.equal(r.flash, 'Годинник стоїть: це репетиція');
  assert.equal(r.t, 0, 'the clock does not run');
  assert.equal(r.clock, r.time);
  assert.equal(r.stillSitting, true, 'he stays in the chair');
  assert.equal(r.progress.done, true);
  assert.deepEqual(r.verdict, { goal: true, bonus: false, stars: 1 });
  assert.deepEqual(r.checks, ['✓ +$200 нова'], `one star on the checklist: ${JSON.stringify(r.checks)}`);
  assert.ok(r.buttons.includes('nextlvl:Далі: рівень 1'), r.buttons.join(' | '));
  assert.ok(r.buttons.includes('again:Ще раз'), 'and «Ще раз» next to it (campaign v2)');
  assert.deepEqual(r.summary, { next: 1, practice: true }, 'the phone\'s summary: «Далі: рівень 1»');
  assert.deepEqual(r.next, { contract: 'first', phase: 'ready' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the board at the van on a PC: the note «pp.» — «Рівень 1 · Тихий Кут», the customer\'s lines, the goal, «Нове: сторож ходить», «Поїхали» (turns you to the house, says the clock starts outside) and «Карта…» (the menu\'s «Грати»); no ◀ ▶, no difficulty on it', async () => {
  const { ctx, page, errors } = await camp(base, { stars: { rehearsal: S1 } });
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), { board } = await import('./src/systems/board.js');
    g.newRound(); g.setContract('first'); g.playing = true; g.sim(0.2);
    G.boardDirty = true; G.lastBoardSig = null; board.present(0.1);
    const out = { buttons: g.board.buttons.map((b) => b.id), yaw0: g.player.yaw };
    // the text drawn: catch fillText while drawing the page again
    const said = [], ctx2 = g.board.g, orig = ctx2.fillText;
    ctx2.fillText = function (t, ...a) { said.push(String(t)); return orig.call(this, t, ...a); };
    G.lastBoardSig = null; G.boardDirty = true; board.present(0.1);
    ctx2.fillText = orig;
    out.said = said;
    g.pressBoard('go'); g.sim(0.1);
    out.flash = g.flashText; out.yaw1 = g.player.yaw; out.spawnYaw = g.level.spawn.yaw;
    g.pressBoard('levels');
    await new Promise((res) => setTimeout(res, 100));
    out.overlay = document.getElementById('overlay').style.display;
    out.page = new URL(location.href).searchParams.get('page');
    return out;
  });
  assert.deepEqual(r.buttons.filter((b) => b !== 'lurkers' && b !== 'papers'), ['go', 'levels'], r.buttons.join(' '));
  assert.ok(r.said.includes('РІВЕНЬ 1 · ТИХИЙ КУТ'), r.said.join(' | '));
  assert.ok(r.said.includes('винеси щонайменше $500'), 'the goal: the first star\'s row');
  assert.ok(r.said.includes('Нове: сторож ходить'), 'what is new');
  assert.ok(r.said.some((t) => /pp\.$/.test(t)), 'the customer\'s «pp.»');
  assert.equal(r.flash, 'Вийди з фургона — годинник піде');
  assert.ok(Math.abs(Math.abs(r.yaw1 - r.spawnYaw) - Math.PI) < 0.01, 'turned to the house');
  assert.equal(r.overlay, 'flex', '«Карта…»: the menu');
  assert.equal(r.page, 'play', 'on its «Грати» page');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// menu design stage 1 + T1: the «Грати» page is level cards 0–14 by house whatever the remembered map;
// a new player starts at level 0 on the dacha; a closed level never starts (cards, the old select, a
// remembered value, the board's ◀ ▶, «Грати»); a level of the other house reloads the page there
const STARS8 = { rehearsal: { medium: 1 }, first: { medium: 3 }, chest: { medium: 3 }, quiet: { medium: 1 }, wardrobe: { medium: 1 }, clock: { medium: 1 } };   // campaign v2: the mansion after a star on 5
const cards = (page) => page.evaluate(() => [...document.querySelectorAll('#levelpick .lv-card')].map((b) => ({ id: b.dataset.level, n: b.querySelector('.lv-n').textContent, off: b.disabled, on: b.classList.contains('on') })));
test('«Грати» (T1): a new player — level 0 on the dacha, «Грати» on; every level 0–8 in the ladder order, the closed ones 🔒 and not pressable', async () => {
  const { ctx, page, errors } = await camp();
  const c = await cards(page);
  assert.deepEqual(c.map((x) => x.id), ['rehearsal', 'first', 'chest', 'quiet', 'wardrobe', 'clock', 'm8', 'm10', 'm12']);
  assert.deepEqual(c.filter((x) => !x.off).map((x) => x.id), ['rehearsal'], 'only level 0 is open');
  assert.ok(c.filter((x) => x.off).every((x) => x.n.includes('🔒')));
  const st = await page.evaluate(() => ({ map: window.__game.level.id, c: window.__game.contract.id, start: document.getElementById('start').disabled, note: document.querySelector('.lv-house[data-house="mansion"] .lv-note').textContent }));
  assert.deepEqual([st.map, st.c, st.start], ['dacha', 'rehearsal', false]);
  assert.match(st.note, /^Маєток: спершу ★ на рівні 5$/);
  // a closed card, the old select, the board's ▶: nothing changes; «Грати» stays on the open level
  await page.click('#levelpick [data-level="clock"]', { force: true });
  await page.selectOption('#contract', 'clock');
  await page.evaluate(() => window.__game.pressBoard('cnext'));
  assert.equal(await page.evaluate(() => window.__game.contract.id), 'rehearsal');
  // the engine forced onto a closed level (an old remembered value would be the same): «Грати» is off
  await page.evaluate(() => window.__game.setContract('clock'));
  assert.equal(await page.evaluate(() => document.getElementById('start').disabled), true, 'a closed level does not start');
  assert.match(await page.textContent('#lvinfowhy'), /Спершу ★/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
test('«Грати» (T1): a remembered closed level and a remembered mansion — the page opens on an open level; all 9 cards whatever the map; a dacha card reloads the page on the dacha with that level', async () => {
  // a remembered closed level: back to where the ladder stands
  {
    const { ctx, page, errors } = await camp(base, { stars: { rehearsal: { medium: 1 } } });
    await page.evaluate(() => { localStorage.setItem('nocturne.contract', '"wardrobe"'); });
    await page.reload(); await page.waitForFunction(() => window.__game);
    assert.equal(await page.evaluate(() => window.__game.contract.id), 'first', 'the remembered closed level 4 is not where it opens');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // a star on 5: the mansion is open; it is remembered (the bug: the list showed only the mansion's levels)
  const { ctx, page, errors } = await camp(base + '?map=mansion', { stars: STARS8 });
  assert.equal(await page.evaluate(() => window.__game.level.id), 'mansion');
  const c = await cards(page);
  assert.equal(c.length, 9, 'every level, not only the mansion’s');
  assert.deepEqual(c.filter((x) => !x.off).map((x) => x.id), ['rehearsal', 'first', 'chest', 'quiet', 'wardrobe', 'clock', 'm8'], JSON.stringify(c));
  assert.equal(c.find((x) => x.on).id, 'm8');
  // a dacha card from the mansion page: the page reloads on the dacha with that level
  await page.click('#levelpick [data-level="clock"]');
  await page.waitForURL((u) => u.search.includes('map=dacha'), { timeout: 15000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__game && window.__game.level, null, { timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => [window.__game.level.id, window.__game.contract.id]), ['dacha', 'clock']);
  assert.deepEqual(errors, []);
  await ctx.close();
});
