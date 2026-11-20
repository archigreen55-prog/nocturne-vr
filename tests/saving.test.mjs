// Saving the progress (plan 2026-11-19 «fixes after test 1», task 3) — the campaign v2 game the players have
// (tests/economy.test.mjs «saving» covers the classic test game's old wallet): the money, an upgrade, the stars
// and the open levels survive a reload and travel by the progress code; a preview keeps its own; the summary
// says «Прогрес збережено на цьому телефоні» (or that the browser keeps nothing), once with the hint to keep
// the code; the main menu's «Мій прогрес» card and its «Перенести на інший пристрій».
import assert from 'node:assert/strict';
import { browser, open, test, base, preview, LAND, toSummary, reloadGame } from './runner.mjs';
import { newContext } from './harness.mjs';

const CAMPAIGN = () => { window.__NOCTURNE_TEST = { ...(window.__NOCTURNE_TEST || { pages: 'all', splash: false }), campaign: true }; };
// one level played and left with the loot (the guards frozen)
const PLAY = `(id, items) => {
  const g = window.__game, by = (i) => g.loot.items.find((x) => x.id === i);
  g.newRound(); g.setDifficulty('medium'); g.setContract(id); g.playing = true;
  for (const p of g.guards) { p.update = () => null; p.doubts = 0; }
  g.player.teleport(0, 2, 0); g.sim(0.3);
  for (const i of items) g.loot.deliver(by(i));
  g.sim(0.5); g.round.finish('left'); g.sim(0.3);
}`;
const state = (page) => page.evaluate(async () => {
  const E = await import('./src/game/economy.js'), Cm = await import('./src/game/campaign.js');
  const w = E.wallet();
  return { cash: w.cash, owned: w.owned.join(','), stars: Cm.levels().filter((l) => Cm.stars(l) > 0).map((l) => `${l.n}:${Cm.stars(l)}`).join(' '), level: Cm.currentLevel().id };
});

test('saving (campaign v2): money, an upgrade, stars and the open level survive a reload; the progress code carries them to a fresh browser; a preview keeps its own wallet and leaves the main one alone', async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(CAMPAIGN);
  const { page, errors } = await open(ctx, base);
  await page.evaluate((PLAY) => { const play = eval(PLAY); play('rehearsal', ['painting', 'candelabrum']); play('first', ['painting', 'candelabrum', 'watch']); }, PLAY);
  await page.evaluate(async () => { window.__game.newRound(); (await import('./src/systems/economy.js')).buyUpgrade('gloves'); });
  const before = await state(page);
  assert.ok(before.cash > 0 && before.owned === 'gloves' && before.stars && before.level !== 'rehearsal', `played and bought: ${JSON.stringify(before)}`);
  await reloadGame(page);
  assert.deepEqual(await state(page), before, 'after a reload');
  assert.equal(await page.evaluate(() => window.__game.CFG.loot.crystal.grabSpeed), 2, 'the gloves work after a reload');
  const code = await page.evaluate(async () => (await import('./src/game/progress.js')).exportProgress().code);
  // a fresh browser: the code, then a reload
  const ctx2 = await newContext(browser);
  await ctx2.addInitScript(CAMPAIGN);
  const p2 = await open(ctx2, base);
  assert.equal((await state(p2.page)).cash, 0, 'a new player has nothing');
  const ok = await p2.page.evaluate(async (c) => { const P = await import('./src/game/progress.js'); const r = P.readCode(c); return r.ok && P.importProgress(r.data); }, code);
  assert.equal(ok, true);
  await reloadGame(p2.page);
  assert.deepEqual(await state(p2.page), before, 'through the progress code');
  const p2errors = p2.errors.slice(); await ctx2.close();
  // the preview (the same browser as the main site): starts from the main site's progress, writes its own
  const p3 = await open(ctx, preview);
  assert.deepEqual(await state(p3.page), before, 'the preview reads the main site\'s progress');
  await p3.page.evaluate((PLAY) => eval(PLAY)('chest', ['chest']), PLAY);
  const prevNow = await state(p3.page);
  await reloadGame(page);
  assert.deepEqual(await state(page), before, 'the main site did not change from the preview');
  assert.ok(await p3.page.evaluate(() => localStorage.getItem('nocturne.preview.wallet2') !== null), 'the preview has its own wallet');
  assert.notDeepEqual(prevNow, before, 'the preview\'s round counted there');
  assert.deepEqual([...errors, ...p2errors, ...p3.errors], []);
  await ctx.close();
});

test('saving (phone): the summary says «Прогрес збережено на цьому телефоні», the hint to keep the code once at 5★; a browser that keeps nothing (private window) is told so in the summary and the menu', async () => {
  const run = async (blocked) => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(CAMPAIGN);
    await ctx.addInitScript(([blocked]) => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 3 }, chest: { medium: 1 } })); }
      if (blocked) Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
    }, [blocked]);
    const { page, errors } = await open(ctx, base);
    await page.tap('#start');
    await page.waitForFunction(() => window.__game.playing);
    const lines = [];
    for (let i = 0; i < 2; i++) {
      await page.evaluate((PLAY) => eval(PLAY)('quiet', ['painting', 'candelabrum', 'watch', 'clock']), PLAY);
      await toSummary(page);
      lines.push(await page.evaluate(() => { const e = document.querySelector('.sm-saved'); return e ? { text: e.textContent, warn: e.classList.contains('warn') } : null; }));
      await page.evaluate(() => window.__game.summary.hide());
    }
    const menu = await page.evaluate(() => document.getElementById('mmprogline').textContent);
    assert.deepEqual(errors, []);
    await ctx.close();
    return { lines, menu };
  };
  const ok = await run(false);
  assert.match(ok.lines[0].text, /^✓ Прогрес збережено на цьому телефоні/);
  assert.match(ok.lines[0].text, /меню → «Перенести»/, 'the hint the first time (5★ and more)');
  assert.equal(ok.lines[1].text, '✓ Прогрес збережено на цьому телефоні', 'the hint only once');
  assert.equal(ok.lines[0].warn, false);
  assert.match(ok.menu, /^Мій прогрес: ★ \d+ · \$[\d,]+ · рівень \d+ — на цьому телефоні$/);
  const no = await run(true);
  assert.equal(no.lines[0].warn, true);
  assert.match(no.lines[0].text, /не зберігається/);
  assert.match(no.menu, /не зберігається/);
});

test('saving (menu): «Мій прогрес» on the main menu (★ · $ · level — on this computer); «Перенести на інший пристрій» makes the code (copied) on the «Ще» page; «Вставити код» opens the field for it', async () => {
  const ctx = await newContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] }, { menu: true });
  await ctx.addInitScript(CAMPAIGN);
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 3 } }));
    localStorage.setItem('nocturne.wallet2', JSON.stringify({ cash: 2150, earned: 2150, spent: 0, owned: [], paid: {}, log: [] }));
  });
  const { page, errors } = await open(ctx, base);
  await page.waitForFunction(() => !document.getElementById('mmprog').closest('section').hidden && document.getElementById('mmprogline').textContent);
  assert.equal(await page.textContent('#mmprogline'), 'Мій прогрес: ★ 4 · $2,150 · рівень 2 — на цьому комп’ютері');
  const box = await page.locator('#mmprogsend').boundingBox();
  assert.ok(box && box.width > 0, 'the button is on the screen');
  await page.click('#mmprogsend');
  await page.waitForFunction(() => !document.querySelector('section[data-page="more"]').hidden && !document.getElementById('progress').hidden);
  const code = await page.inputValue('#progcode');
  assert.match(code, /^NOC1-/);
  await page.waitForFunction(() => /Код скопійовано/.test(document.getElementById('prognote').textContent));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code, 'copied');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => !document.querySelector('section[data-page="menu"]').hidden);
  await page.click('#mmprogpaste');
  await page.waitForFunction(() => !document.getElementById('progapply').hidden && !document.getElementById('progcode').readOnly);
  assert.deepEqual(errors, []);
  await ctx.close();
});
