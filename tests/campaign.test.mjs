// W19 «Кампанія», stage E1 (plan-W19-campaign.md §2): the ladder of levels over the contracts (level 0
// «Репетиція», level 3 «Шафа»), the mechanics one level at a time (cans, devices, traps, Шафник), the
// rehearsal's round (Petrovych in his armchair, the clock stands, two items = one star), the board's
// note «pp.» and «Далі: рівень N». These pages run the campaign (`campaign: true`); the other tests
// keep the classic game (config/campaign.js CLASSIC) — checked here too.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview } from './runner.mjs';

// a page of the campaign (what a player gets), the harness's other settings as usual
async function camp(url = base, { stars = null, wallet = null, keys = null, ctxOpts = {} } = {}) {
  const ctx = await newContext(browser, ctxOpts, { menu: true });
  await ctx.addInitScript(([stars, wallet, keys]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if ((stars || keys) && !sessionStorage.getItem('seeded')) {   // once: a reload does not seed again
      sessionStorage.setItem('seeded', '1');
      const P = location.pathname.includes('/preview/') ? 'nocturne.preview.' : 'nocturne.';   // a preview keeps its own
      if (stars) localStorage.setItem(P + 'stars', JSON.stringify(stars));
      if (wallet) localStorage.setItem(P + 'wallet', JSON.stringify(wallet));
      for (const [k, v] of Object.entries(keys || {})) localStorage.setItem(P + k, JSON.stringify(v));   // map, contract, openAll… as an older preview left them
    }
  }, [stars, wallet, keys]);
  const { page, errors } = await open(ctx, url);
  return { ctx, page, errors };
}
const S1 = { medium: 1 };
const WALLET = { cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [], trialSoap: true, stock: { soap: 1, marbles: 1, bucket: 1 } };   // the free soap of contract 7 already given

test('the ladder: a new player starts at level 0 «Репетиція»; the list goes 0–7 with «Шафа» as 3; a star opens the next; an old player is not sent back (★ on 1 passes 0, ★ on 4 passes 3; other levels as before); the mansion\'s 8★ do not count the rehearsal; the classic test game keeps the old list', async () => {
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
  assert.equal(fresh.ladder, '0:rehearsal 1:first 2:clock 3:wardrobe 4:quiet 5:silent 6:rush 7:evening 8:m8 9:m9 10:m10 11:m11 12:m12 13:m13 14:m14');
  assert.match(fresh.list[0], /^0\. Репетиція$/);
  assert.match(fresh.list[3], /🔒.*3\. Шафа/);
  assert.equal(fresh.list.length, 15, 'the whole ladder 0–14, the dacha and the mansion');
  assert.match(fresh.list[8], /🔒 8\. Новий район/);
  assert.match(fresh.list[9], /🔒 9\. .* · Незабаром/);
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
    // the mansion: 8★ in the dacha, the rehearsal's star not among them
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { hard: 3 }, clock: { hard: 3 }, wardrobe: { medium: 1 } }));
    out.mansion7 = E.mapOpen('mansion'); out.stars7 = E.mapStars('dacha');
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { hard: 3 }, clock: { hard: 3 }, wardrobe: { medium: 1 }, quiet: { medium: 1 } }));
    out.mansion8 = E.mapOpen('mansion');
    return out;
  });
  assert.equal(after.firstOpen, true, 'a star on the rehearsal opens level 1');
  assert.equal(after.current, 1);
  assert.equal(after.old, '0op 1op 2op 3op 4op 5o 6x 7x', 'the old player: 0–3 passed, 5 open, 6 and 7 closed');
  assert.equal(after.oldCurrent, 5, 'the old player goes on from level 5');
  assert.deepEqual([after.mansion7, after.stars7, after.mansion8], [false, 7, true], 'the mansion at 8★ without the rehearsal');
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

test('mechanics one level at a time: no cans before 4, no devices before 7, Шафник asleep before 3 (the box shut), the van\'s traps — soap and marbles from 5, the rest from 7; the shop shows only the traps reached; «Відкрити все» on a preview opens all', async () => {
  const all = { rehearsal: S1, first: S1, clock: S1, wardrobe: S1, quiet: S1, silent: S1, rush: S1 };
  const { ctx, page, errors } = await camp(base, { stars: all, wallet: WALLET });
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/systems/economy.js');
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
    for (const id of ['rehearsal', 'first', 'clock', 'wardrobe', 'quiet', 'silent', 'evening']) out[id] = at(id);
    out.rows = E.shopRows().filter((x) => x.consumable).map((x) => x.id).join(',');
    return out;
  });
  const n = r.rehearsal.cans.split('/')[1];
  for (const id of ['rehearsal', 'first', 'clock', 'wardrobe']) assert.equal(r[id].cans, `0/${n}`, `${id}: no cans`);
  for (const id of ['quiet', 'silent', 'evening']) assert.equal(r[id].cans, `${n}/${n}`, `${id}: the cans are there`);
  for (const id of ['rehearsal', 'first', 'clock', 'wardrobe', 'quiet', 'silent']) assert.equal(r[id].dev, false, `${id}: no devices`);
  assert.equal(r.evening.dev, true, 'level 7: the devices');
  for (const id of ['rehearsal', 'first', 'clock']) assert.deepEqual([r[id].lurker, r[id].box], ['dormant', true], `${id}: Шафник sleeps, the box shut`);
  assert.notEqual(r.wardrobe.lurker, 'dormant', 'level 3: Шафник wakes');
  for (const id of ['rehearsal', 'first', 'clock', 'wardrobe']) assert.equal(r[id].van, '', `${id}: no traps in the van`);
  assert.equal(r.quiet.van, '', '«Без тривоги»: no traps (as before)');
  assert.equal(r.silent.van, 'marbles,soap', 'level 5: soap and marbles, not the bucket');
  assert.equal(r.evening.van, 'bucket,marbles,soap', 'level 7: all');
  assert.equal(r.rows, 'trap:soap,trap:marbles,trap:bucket,trap:clock,trap:rope', 'level 7 open: every trap in the shop');
  // only up to level 5 open: the shop has soap and marbles only
  const few = await page.evaluate(async () => {
    const E = await import('./src/systems/economy.js');
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 1 }, clock: { medium: 1 }, wardrobe: { medium: 1 }, quiet: { medium: 1 } }));
    const five = E.shopRows().filter((x) => x.consumable).map((x) => x.id).join(',');
    localStorage.setItem('nocturne.stars', '{}');
    return { five, none: E.shopRows().filter((x) => x.consumable).length };
  });
  assert.equal(few.five, 'trap:soap,trap:marbles');
  assert.equal(few.none, 0, 'a new player: no traps in the shop');
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

test('the rehearsal: Petrovych sits down in his armchair and stays; the clock stands («Годинник стоїть»); two items in the van = the goal, one star, no bonus; the result says «Прийнято. Далі — рівень 1» and «Далі: рівень 1» starts level 1', async () => {
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
    c2.fillText = orig; out.accepted = said.includes('Прийнято. Далі — рівень 1');
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
  assert.ok(r.accepted, 'the result: «Прийнято. Далі — рівень 1»');
  assert.ok(r.buttons.includes('nextlvl:Далі: рівень 1'), r.buttons.join(' | '));
  assert.ok(!r.buttons.some((b) => b.startsWith('again')), 'no «Новий раунд» next to it');
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
  assert.ok(r.said.some((t) => t.startsWith('★ мета:')), 'the goal');
  assert.ok(r.said.includes('Нове: сторож ходить'), 'what is new');
  assert.ok(r.said.some((t) => /pp\.$/.test(t)), 'the customer\'s «pp.»');
  assert.equal(r.flash, 'Вийди з фургона — годинник піде');
  assert.ok(Math.abs(Math.abs(r.yaw1 - r.spawnYaw) - Math.PI) < 0.01, 'turned to the house');
  assert.equal(r.overlay, 'flex', '«Карта…»: the menu');
  assert.equal(r.page, 'play', 'on its «Грати» page');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the start screen's list, closed levels, the map that follows the level ----------
const nav = async (page, doIt, mapId) => {   // a click that reloads the page on another map
  await Promise.all([page.waitForURL((u) => new URL(u).searchParams.get('map') === mapId, { timeout: 30000 }), doIt()]);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
};
const OLD = { first: { medium: 3 }, clock: { medium: 3 }, quiet: { medium: 3 } };   // 9★ on the dacha: the mansion is open

test('the list is the whole ladder 0–14 whichever map an older preview saved; picking a level picks its house (a level on the other map reloads the page on it)', async () => {
  const { ctx, page, errors } = await camp(base, { stars: OLD, keys: { map: 'mansion', contract: 'm13' } });
  const a = await page.evaluate(() => ({ list: [...document.querySelectorAll('#contract option')].map((o) => o.value).join(' '), level: window.__game.level.id, contract: window.__game.contract.id }));
  assert.equal(a.list, 'rehearsal first clock wardrobe quiet silent rush evening m8 m9 m10 m11 m12 m13 m14', 'all 15, in the ladder\'s order');
  assert.equal(a.level, 'dacha', 'the saved «mansion» of an older preview does not decide: the level does');
  assert.equal(a.contract, 'silent', 'where the ladder stands (★ on 1, 2, 4)');
  await nav(page, () => page.selectOption('#contract', 'm8'), 'mansion');
  const b = await page.evaluate(() => ({ level: window.__game.level.id, contract: window.__game.contract.id, n: document.querySelectorAll('#contract option').length }));
  assert.deepEqual(b, { level: 'mansion', contract: 'm8', n: 15 }, 'the mansion\'s level: the page is the mansion, the list is still all 15');
  await nav(page, () => page.selectOption('#contract', 'first'), 'dacha');   // and back: the dacha is reachable from the mansion
  const c = await page.evaluate(() => ({ level: window.__game.level.id, contract: window.__game.contract.id }));
  assert.deepEqual(c, { level: 'dacha', contract: 'first' });
  await page.selectOption('#contract', 'silent');                            // the same house: no reload
  assert.equal(await page.evaluate(() => window.__game.contract.id), 'silent');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a closed level (🔒) is only looked at: «Грати» is off and says «Спочатку пройди рівень N»; the game keeps the level that can be played; a level that can be played turns it on again; a placeholder says «Незабаром»', async () => {
  const { ctx, page, errors } = await camp();
  const r = await page.evaluate(async () => {
    const g = window.__game, sel = document.getElementById('contract'), out = {}, pick = (id) => { sel.value = id; sel.dispatchEvent(new Event('change')); };
    pick('quiet');
    out.quiet = { disabled: document.getElementById('start').disabled, info: document.getElementById('contractinfo').textContent, contract: g.contract.id, value: sel.value };
    document.getElementById('start').click();
    out.playing = g.playing;
    pick('m9');
    out.soon = { disabled: document.getElementById('start').disabled, info: document.getElementById('contractinfo').textContent };
    pick('m8');
    out.m8 = { disabled: document.getElementById('start').disabled, info: document.getElementById('contractinfo').textContent };
    pick('rehearsal');
    out.back = { disabled: document.getElementById('start').disabled, contract: g.contract.id };
    return out;
  });
  assert.equal(r.quiet.disabled, true, '«Грати» is off on a closed level');
  assert.match(r.quiet.info, /Спочатку пройди рівень 0/, r.quiet.info);
  assert.equal(r.quiet.contract, 'rehearsal', 'the game still has a level that can be played');
  assert.equal(r.quiet.value, 'quiet', 'the list shows the level looked at');
  assert.equal(r.playing, false, 'a click on the disabled button starts nothing');
  assert.equal(r.soon.disabled, true); assert.match(r.soon.info, /Незабаром/);
  assert.equal(r.m8.disabled, true); assert.match(r.m8.info, /8★|★/, 'the mansion: the stars it needs: ' + r.m8.info);
  assert.deepEqual(r.back, { disabled: false, contract: 'rehearsal' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a new player (clean profile, no ?map=, no «Відкрити все») starts at level 0 on the dacha — whatever an older preview saved: a «mansion» map, a closed contract', async () => {
  for (const keys of [null, { map: 'mansion' }, { map: 'mansion', contract: 'm13' }, { contract: 'evening' }, { map: 'mansion', contract: 'first' }]) {
    const { ctx, page, errors } = await camp(base, { stars: {}, keys });
    const r = await page.evaluate(() => ({ level: window.__game.level.id, contract: window.__game.contract.id, search: location.search, saved: localStorage.getItem('nocturne.contract') }));
    assert.deepEqual([r.level, r.contract, r.search], ['dacha', 'rehearsal', ''], JSON.stringify(keys));
    assert.deepEqual(errors, [], JSON.stringify(keys));
    await ctx.close();
  }
  // a preview too (its own keys): «Відкрити все» was never on, an older preview saved the mansion
  const pv = await camp(preview, { stars: {}, keys: { map: 'mansion', contract: 'm13' } });
  assert.deepEqual(await pv.page.evaluate(() => [window.__game.level.id, window.__game.contract.id]), ['dacha', 'rehearsal']);
  await pv.ctx.close();
});

test('«Відкрити все» switched off on the mansion\'s page (a clean profile): no frame error and no freeze — the page goes to level 0 on the dacha; the same when the flag is lost without the checkbox and the player walks out of the circle', async () => {
  // 1. the checkbox
  const a = await camp(preview, { stars: {}, keys: { openAll: true, map: 'mansion', contract: 'm13' } });
  const s0 = await a.page.evaluate(() => [window.__game.level.id, window.__game.contract.id]);
  assert.deepEqual(s0, ['mansion', 'm13'], 'with «Відкрити все» on the page is the mansion, as left by the older preview');
  await nav(a.page, () => a.page.evaluate(() => document.getElementById('openallcb').click()), 'dacha');
  assert.deepEqual(await a.page.evaluate(() => [window.__game.level.id, window.__game.contract.id]), ['dacha', 'rehearsal']);
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
  // 2. the flag gone behind the page's back: every contract of the page is closed; leaving the circle used to
  //    throw «Cannot read properties of undefined (reading 'id')» in every frame (the game stopped)
  const b = await camp(preview, { stars: {}, keys: { openAll: true, map: 'mansion', contract: 'm13' } });
  const threw = await b.page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('nocturne.preview.openAll', 'false');
    g.playing = true;
    try { g.player.teleport(0, 2, 0); g.sim(0.5); return null; } catch (e) { return String(e.message); }
  }).catch(() => null);   // the reload may cut the call short
  assert.equal(threw, null, 'no error in a frame');
  await b.page.waitForURL((u) => new URL(u).searchParams.get('map') === 'dacha', { timeout: 30000 });
  await b.page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  assert.deepEqual(await b.page.evaluate(() => [window.__game.level.id, window.__game.contract.id]), ['dacha', 'rehearsal']);
  assert.deepEqual(b.errors, []);
  await b.ctx.close();
});
