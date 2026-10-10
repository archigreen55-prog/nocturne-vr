// Economy v1 (W3): the wallet, the round's money and the bonus for new stars, the shop (board, the
// phone's pause menu, PC, VR), the upgrades' effects, which contracts are open, «Відкрити все» on
// previews only, saving and the progress code.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, UA, open, test, LAND, keepFor, frames, playPhone, fingerPressEl, pm, toSummary, aimAt, base, preview, standFacing } from './runner.mjs';

// A page in a round at the van; __round(kind, sum, stars) ends a round as if played: `kind` left /
// caught, the loot `sum`, the verdict's stars (the real end of a round runs, only its numbers are set).
async function econ(url = base, ctxOpts) {
  const ctx = await newContext(browser, ctxOpts);
  const { page, errors } = await open(ctx, url);
  await page.evaluate(() => {
    const g = window.__game;
    g.patrol.update = () => null; g.lurker.update = () => {};
    g.newRound(); g.playing = true; g.sim(0.1);
    window.__wallet = () => JSON.parse(localStorage.getItem(location.pathname.includes('/preview/') ? 'nocturne.preview.wallet' : 'nocturne.wallet') || 'null');
    window.__round = async (kind, sum, stars) => {
      const C = await import('./src/game/contracts.js');
      g.player.teleport(0, 2, 0); g.sim(0.2);                     // away from the van: the clock runs
      g.round.finish(kind);
      if (sum !== undefined) g.round.result.sum = kind === 'left' || kind === 'escaped' ? sum : 0;
      if (stars !== undefined) { g.verdict.stars = stars; C.recordStars(g.contract.id, g.difficulty, stars, 'pc'); }
      g.sim(0.2);
    };
  });
  return { ctx, page, errors };
}

test('the wallet: a round you got away from pays its loot; caught pays nothing; once per round; $500 for every new star only', async () => {
  const { ctx, page, errors } = await econ();
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {};
    await window.__round('left', 2400, 1);
    out.first = window.__wallet().cash;                    // 2400 + 500 (the first star)
    g.sim(1); out.again = window.__wallet().cash;          // the result stays: not credited twice
    g.newRound(); g.sim(0.1);
    await window.__round('left', 1000, 1);
    out.sameStar = window.__wallet().cash;                 // +1000, no bonus for the same star
    g.newRound(); g.sim(0.1);
    await window.__round('left', 0, 3);
    out.threeStars = window.__wallet().cash;               // +2 new stars = +1000
    g.newRound(); g.sim(0.1);
    await window.__round('caught');
    out.caught = window.__wallet().cash;                   // nothing (decision R5 A)
    g.newRound(); g.setDifficulty('hard'); g.sim(0.1);
    await window.__round('left', 0, 1);
    out.otherDifficulty = window.__wallet().cash;          // another difficulty counts apart: +500
    out.log = window.__wallet().log.map((e) => `${e.kind}:${e.amount}`);
    return out;
  });
  assert.equal(r.first, 2900);
  assert.equal(r.again, 2900, 'credited once');
  assert.equal(r.sameStar, 3900);
  assert.equal(r.threeStars, 4900);
  assert.equal(r.caught, 4900, 'caught: the wallet is not touched');
  assert.equal(r.otherDifficulty, 5400);
  assert.deepEqual(r.log, ['round:2400', 'stars:500', 'round:1000', 'stars:1000', 'stars:500']);
  // stars won before the shop existed are not paid again
  await page.evaluate(() => {
    localStorage.removeItem('nocturne.wallet');   // a player from before the shop: stars, no wallet
    localStorage.setItem('nocturne.stars', JSON.stringify({ first: { easy: 0, medium: 2, hard: 0 } }));
    localStorage.setItem('nocturne.difficulty', '"medium"');
  });
  await page.reload(); await page.waitForFunction(() => window.__game);
  const old = await page.evaluate(async () => {
    const g = window.__game; g.patrol.update = () => null; g.newRound(); g.playing = true; g.sim(0.1);
    const C = await import('./src/game/contracts.js');
    g.player.teleport(0, 2, 0); g.sim(0.2);
    g.round.finish('left'); g.round.result.sum = 0; g.verdict.stars = 2; C.recordStars('first', 'medium', 2, 'pc');
    g.sim(0.2);
    const a = JSON.parse(localStorage.getItem('nocturne.wallet')).cash;
    g.newRound(); g.sim(0.1); g.player.teleport(0, 2, 0); g.sim(0.2);
    g.round.finish('left'); g.round.result.sum = 0; g.verdict.stars = 3; C.recordStars('first', 'medium', 3, 'pc');
    g.sim(0.2);
    return { a, b: JSON.parse(localStorage.getItem('nocturne.wallet')).cash };
  });
  assert.deepEqual(old, { a: 0, b: 500 }, 'replaying an old 2★ pays no bonus; the third star does');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the shop: not enough money, buying, owned, not during the round; upgrades take effect and never add up; without them the numbers are as before', async () => {
  const { ctx, page, errors } = await econ();
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/systems/economy.js'), out = {};
    const base = { quiet: g.CFG.player.quietSpeed, hand: g.CFG.loot.crystal.handSpeed, grab: g.CFG.loot.crystal.grabSpeed, slip: g.CFG.sprint.crystalSlip, stamina: g.CFG.sprint.stamina };
    out.base = base;
    out.poor = E.buyUpgrade('boots');
    localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 10000, earned: 10000, spent: 0, owned: [], paid: {}, log: [] }));
    for (const id of ['boots', 'gloves', 'thermos', 'mask', 'sneakers']) E.buyUpgrade(id);
    out.twice = E.buyUpgrade('boots');
    out.soon = E.buyUpgrade('cart');
    const w = window.__wallet(); out.cash = w.cash; out.owned = w.owned;
    out.on = { quiet: g.CFG.player.quietSpeed, hand: g.CFG.loot.crystal.handSpeed, grab: g.CFG.loot.crystal.grabSpeed, slip: g.CFG.sprint.crystalSlip, stamina: g.CFG.sprint.stamina, scare: g.CFG.run.scareK, tea: g.CFG.run.teaExtra };
    // the guard's tea is longer
    g.patrol.reset();
    out.tea = g.patrol.brain.habits.filter((h) => h.id.startsWith('tea')).map((h) => h.dur);
    // switching difficulty back and forth does not stack an upgrade
    g.setDifficulty('easy'); g.setDifficulty('medium');
    out.again = { grab: g.CFG.loot.crystal.grabSpeed, stamina: g.CFG.sprint.stamina };
    // steps: silent up to 1.4 m/s now
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    g.keys.down.add('KeyW'); g.sim(1.2); out.walk = { s: +g.player.speed.toFixed(2), loud: g.player.stepsAudible }; g.keys.down.clear();
    // the mask: the scare has no white flash
    g.comfort.flash = 0; g.lurker.lunge(g.player); out.flash = g.comfort.flash;
    // during the round: no buying
    localStorage.setItem('nocturne.wallet', JSON.stringify({ ...window.__wallet(), cash: 5000, owned: [] }));
    g.player.teleport(0, -2, 0); g.sim(0.3); out.phase = g.round.phase;
    out.inRound = E.buyUpgrade('boots');
    return out;
  });
  assert.equal(r.poor, false, 'not enough money');
  assert.equal(r.twice, false); assert.equal(r.soon, false, 'the cart is «незабаром»');
  assert.equal(r.cash, 10000 - (1500 + 800 + 500 + 1000 + 1200));
  assert.deepEqual(r.owned, ['boots', 'gloves', 'thermos', 'mask', 'sneakers']);
  assert.deepEqual(r.base, { quiet: 1.0, hand: 1.8, grab: 1.0, slip: 1.5, stamina: 5 }, 'without upgrades: the numbers as before');
  assert.equal(r.on.quiet, 1.4);
  assert.ok(r.on.hand === null || r.on.hand > 1000, `the crystal never slips from the hand: ${r.on.hand}`);   // Infinity (JSON: null)
  assert.ok(r.on.slip === null || r.on.slip > 1000, 'nor while running');
  assert.equal(r.on.grab, 2.0); assert.equal(r.on.stamina, 7); assert.equal(r.on.scare, 0.5); assert.equal(r.on.tea, 20);
  assert.ok(r.tea.length && r.tea.every((d) => d === 35 + 20), `tea habits +20 s: ${r.tea}`);
  assert.deepEqual(r.again, { grab: 2.0, stamina: 7 }, 'difficulty switches do not add up');
  assert.ok(r.walk.s > 0.95 && r.walk.s < 1.05 && !r.walk.loud, `W alone (1.0 m/s): silent ${JSON.stringify(r.walk)}`);
  assert.equal(r.flash, 0, 'the mask: no white flash');
  assert.equal(r.phase, 'heist');
  assert.equal(r.inRound, false, 'no buying once the clock runs');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('contracts open by stars: a new player has 2–5 and 7 closed (🔒, what opens them); a star on 1 opens 2; leaving the van with a closed one plays the last open one; the mansion needs 8★', async () => {
  const { ctx, page, errors } = await econ();
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/game/economy.js'), C = await import('./src/game/contracts.js'), out = {};
    out.open = g.CFG.contracts.map((c) => E.isOpen(c));
    out.options = [...document.getElementById('contract').options].map((o) => o.textContent.startsWith('🔒'));
    g.pressBoard('cnext'); g.sim(0.3);
    out.shown = g.contract.id;
    out.lockLine = g.board.buttons.length && document.getElementById('contractinfo').textContent.includes('🔒');
    // leave the van with it: the clock starts with the open contract
    g.player.teleport(0, 0, 0); g.sim(0.5);
    out.played = { id: g.contract.id, phase: g.round.phase };
    // a star on contract 1 opens contract 2
    C.recordStars('first', 'easy', 1, 'pc');
    out.after = g.CFG.contracts.map((c) => E.isOpen(c));
    // the mansion: 8 stars on the Dacha
    localStorage.setItem('nocturne.stars', JSON.stringify({ first: { hard: 3 }, clock: { medium: 2 }, quiet: { easy: 2 } }));
    out.mansion7 = E.mapOpen('mansion');
    localStorage.setItem('nocturne.stars', JSON.stringify({ first: { hard: 3 }, clock: { medium: 2 }, quiet: { easy: 2 }, silent: { easy: 1 } }));
    out.mansion8 = E.mapOpen('mansion');
    return out;
  });
  assert.deepEqual(r.open, [true, false, false, false, false, false]);   // W2b: + contract 7
  assert.deepEqual(r.options, [false, true, true, true, true, true], 'the start screen list marks them');
  assert.equal(r.shown, 'clock', '▶ shows the next contract (to see what opens next)');
  assert.equal(r.lockLine, true, 'with what opens it');
  assert.deepEqual(r.played, { id: 'first', phase: 'heist' }, 'but the round plays the last open one');
  assert.deepEqual(r.after, [true, true, false, false, false, false]);
  assert.equal(r.mansion7, false); assert.equal(r.mansion8, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the mansion (W6 merged): closed on the main site until 8★ on the dacha, then ?map=mansion plays it; its contracts open by stars past the placeholders 9 and 11; the board has the map page and the shop', async () => {
  const ctx = await newContext(browser);
  const seven = { first: { hard: 3 }, clock: { medium: 2 }, quiet: { easy: 2 } };
  const { page, errors } = await open(ctx, base + '?map=mansion');
  await page.evaluate((st) => { localStorage.setItem('nocturne.stars', JSON.stringify(st)); }, seven);
  await page.goto(base + '?map=mansion');
  await page.waitForFunction(() => window.__game && window.__game.level);
  const at7 = await page.evaluate(() => window.__game.level.id);
  await page.evaluate((st) => { localStorage.setItem('nocturne.stars', JSON.stringify({ ...st, silent: { easy: 1 } })); }, seven);
  await page.goto(base + '?map=mansion');
  await page.waitForFunction(() => window.__game && window.__game.level);
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/game/economy.js'), C = await import('./src/game/contracts.js'), out = { id: g.level.id };
    const open = () => Object.fromEntries(g.CFG.contracts.map((c) => [c.id, E.isOpen(c)]));
    out.before = open();
    C.recordStars('m8', 'easy', 1, 'pc'); out.afterM8 = open();
    C.recordStars('m10', 'easy', 1, 'pc'); out.afterM10 = open();
    return out;
  });
  assert.equal(at7, 'dacha', '7★: ?map=mansion is ignored on the main site');
  assert.equal(r.id, 'mansion', '8★: the mansion opens');
  assert.deepEqual(r.before, { m8: true, m9: false, m10: false, m11: false, m12: false, m13: false, m14: false });
  assert.deepEqual(r.afterM8, { m8: true, m9: true, m10: true, m11: false, m12: false, m13: false, m14: false }, 'a star on 8 opens 9 (placeholder) and 10');
  assert.deepEqual(r.afterM10, { m8: true, m9: true, m10: true, m11: true, m12: true, m13: false, m14: false }, 'a star on 10 opens 11 and 12 (11 gives no stars)');
  // the board at the van: the contract page has «Карта…» and «Магазин»; buying works here too
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  await standFacing(page, 14.55, -2.25, 1.6, 2.914);
  await keepFor(page, 700);
  const ids = await page.evaluate(() => window.__game.board.buttons.map((b) => b.id));
  assert.ok(ids.includes('mappage') && ids.includes('shop') && ids.includes('micpage') && ids.includes('diff'), `contract page: ${ids}`);
  const bought = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('nocturne.wallet', JSON.stringify({ ...JSON.parse(localStorage.getItem('nocturne.wallet')), cash: 600 }));
    g.pressBoard('shop'); g.pressBoard('buy:thermos');
    return JSON.parse(localStorage.getItem('nocturne.wallet')).owned;
  });
  assert.deepEqual(bought, ['thermos']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('«Відкрити все»: not on the main site (even if saved); on a preview and with ?debug it opens every contract', async () => {
  const runs = [];
  for (const [url, allowed] of [[base, false], [preview, true], [base + '?debug', true]]) {
    const ctx = await newContext(browser);
    const { page, errors } = await open(ctx, url);
    const r = await page.evaluate(async () => {
      const E = await import('./src/game/economy.js');
      // a saved "on" from a preview must not open anything on the main site
      localStorage.setItem('nocturne.openAll', 'true');
      const box = document.getElementById('openall'), cb = document.getElementById('openallcb');
      const before = window.__game.CFG.contracts.filter((c) => E.isOpen(c)).length;
      let after = before;
      if (!box.hidden) { cb.checked = true; cb.dispatchEvent(new Event('change')); after = window.__game.CFG.contracts.filter((c) => E.isOpen(c)).length; }
      return { shown: !box.hidden, before, after, mansion: E.mapOpen('mansion') };
    });
    runs.push(r);
    assert.equal(r.shown, allowed, `${url}: the switch ${allowed ? 'is' : 'is not'} there`);
    if (allowed) assert.deepEqual([r.after, r.mansion], [6, true], `${url}: everything open`);
    else assert.deepEqual([r.before, r.mansion], [1, false], `${url}: a saved value is ignored`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('saving: the wallet and the upgrades survive a reload; the progress code (T5) carries them over; a preview keeps its own wallet', async () => {
  const { ctx, page, errors } = await econ();
  await page.evaluate(() => localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 3000, earned: 3000, spent: 0, owned: [], paid: {}, log: [] })));
  await page.evaluate(async () => { const E = await import('./src/systems/economy.js'); E.buyUpgrade('gloves'); });
  await page.reload(); await page.waitForFunction(() => window.__game);
  const kept = await page.evaluate(() => ({ w: JSON.parse(localStorage.getItem('nocturne.wallet')), line: document.getElementById('walletline').textContent, grab: window.__game.CFG.loot.crystal.grabSpeed }));
  assert.equal(kept.w.cash, 2200); assert.deepEqual(kept.w.owned, ['gloves']);
  assert.match(kept.line, /\$2,200 · апгрейдів: 1/);
  assert.equal(kept.grab, 2, 'the upgrade is on after a reload');
  const moved = await page.evaluate(async () => {
    const P = await import('./src/game/progress.js');
    const { code } = P.exportProgress();
    localStorage.clear();
    const r = P.readCode(code); P.importProgress(r.data);
    return JSON.parse(localStorage.getItem('nocturne.wallet'));
  });
  assert.deepEqual([moved.cash, moved.owned], [2200, ['gloves']], 'export → clear → import');
  // a preview: its own wallet (it starts from the main site's, and its purchases stay there)
  const ctx2 = await newContext(browser);
  const p2 = await open(ctx2, preview);
  await p2.page.evaluate(() => {   // the main site's wallet; the preview has none of its own yet
    localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 900, earned: 900, spent: 0, owned: [], paid: {}, log: [] }));
    localStorage.removeItem('nocturne.preview.wallet');
  });
  await p2.page.reload(); await p2.page.waitForFunction(() => window.__game);
  const sep = await p2.page.evaluate(async () => {
    const E = await import('./src/systems/economy.js');
    window.__game.newRound();
    E.buyUpgrade('thermos');
    return { preview: JSON.parse(localStorage.getItem('nocturne.preview.wallet')), main: JSON.parse(localStorage.getItem('nocturne.wallet')) };
  });
  assert.deepEqual([sep.preview.cash, sep.preview.owned, sep.main.cash, sep.main.owned], [400, ['thermos'], 900, []]);
  assert.deepEqual(errors, []); assert.deepEqual(p2.errors, []);
  await ctx.close(); await ctx2.close();
});

test('phone: the shop in the pause menu by finger (buy, «Є ✓», not while the clock runs); the money line in the summary; the board shop by tap; small phone fits', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => { const g = window.__game; g.patrol.update = () => null; g.lurker.update = () => {}; localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 1000, earned: 1000, spent: 0, owned: [], paid: {}, log: [] })); g.menu.refresh(); });
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Магазин'));
  await page.waitForSelector('#pausemenu [data-upgrade="thermos"]');
  assert.match(await page.textContent('#pausemenu .pm-wallet'), /\$1,000/);
  assert.equal(await page.isDisabled('#pausemenu [data-upgrade="boots"]'), true, 'too expensive: disabled');
  await fingerPressEl(page, cdp, '#pausemenu [data-upgrade="thermos"]');
  await page.waitForFunction(() => /Є/.test(document.querySelector('#pausemenu [data-upgrade="thermos"]').textContent));
  assert.match(await page.textContent('#pausemenu .pm-wallet'), /\$500/);
  // inside the screen on a phone (no part of the row cut off on the right)
  const vw = page.viewportSize().width;
  const b = await page.locator('#pausemenu [data-upgrade="thermos"]').boundingBox();
  assert.ok(b.x + b.width <= vw, `the buy button inside the screen: ${JSON.stringify(b)}`);
  await fingerPressEl(page, cdp, pm('Назад'));
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused);
  // the clock runs: the menu's shop buttons are disabled with the reason
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -2, 0); });
  await page.waitForFunction(() => window.__game.round.phase === 'heist');
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Магазин'));
  await page.waitForSelector('#pausemenu [data-upgrade="gloves"]');
  assert.equal(await page.isDisabled('#pausemenu [data-upgrade="gloves"]'), true);
  assert.match(await page.textContent('#pausemenu .pm-grid'), /біля фургона/);
  await fingerPressEl(page, cdp, pm('Назад'));
  await fingerPressEl(page, cdp, pm('Продовжити'));
  // deliver an item and leave: the summary has the money line
  await page.evaluate(() => { const g = window.__game, it = g.loot.items.find((i) => !i.twoHanded && !i.crystal); g.loot.deliver(it); g.sim(0.3); g.round.finish('left'); });
  await toSummary(page);
  const line = await page.textContent('#summary .sm-income');
  const stars = await page.evaluate(() => window.__game.verdict.stars);
  assert.match(line, /^\+\$[\d,]+ у гаманець/, line);
  if (stars) assert.match(line, /за нову ★|нові ★/, line);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('board shop: PC by the crosshair (aim + the board takes the button), VR in the emulator (the board page and buying); VR regression stays green', async () => {
  // PC: aim at «Магазин» → the board says it is under the crosshair → pressed → the shop page; buy
  {
    const ctx = await newContext(browser);
    const { page, errors } = await open(ctx, base);
    await page.click('#start'); await page.waitForFunction(() => window.__game.playing);
    await page.evaluate(() => { const g = window.__game; g.patrol.update = () => null; localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 600, earned: 600, spent: 0, owned: [], paid: {}, log: [] })); g.sim(0.3); });
    await page.waitForFunction(() => window.__game.board.buttons.some((b) => b.id === 'shop'));
    await aimAt(page, 'shop');
    await page.waitForFunction(() => window.__game.pointer.hover.desk === 'shop', null, { timeout: 8000 });
    await page.evaluate(() => { const g = window.__game; g.pressBoard(g.pointer.hover.desk); g.sim(0.3); });
    await page.waitForFunction(() => window.__game.board.buttons.some((b) => b.id === 'buy:thermos'));
    await aimAt(page, 'buy:thermos');
    await page.waitForFunction(() => window.__game.pointer.hover.desk === 'buy:thermos', null, { timeout: 8000 });
    await page.evaluate(() => { const g = window.__game; g.pressBoard(g.pointer.hover.desk); g.sim(0.3); });
    const w = await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.wallet')));
    assert.deepEqual([w.cash, w.owned], [100, ['thermos']], 'PC: bought at the board');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // VR: the same board in the emulator
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, base);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  const vr = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 900, earned: 900, spent: 0, owned: [], paid: {}, log: [] }));
    g.pressBoard('shop'); g.sim(0.3);
    const page1 = g.board.buttons.map((b) => b.id);
    g.pressBoard('buy:gloves'); g.sim(0.3);
    return { page1, w: JSON.parse(localStorage.getItem('nocturne.wallet')), hud: g.hud };
  });
  assert.ok(vr.page1.includes('buy:gloves') && vr.page1.includes('back'), JSON.stringify(vr.page1));
  assert.deepEqual([vr.w.cash, vr.w.owned, vr.hud], [100, ['gloves'], null]);
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  assert.deepEqual(errors, []);
  await ctx.close();
});
