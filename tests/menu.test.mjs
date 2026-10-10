// W17 «Стиль» S3 (plan-W17-style.md §3.2–3.5, §4.4 item 6): the splash, the main menu and its pages, the
// ?page= links, Android's «Назад», the first-run microphone card, the small phone, Тихарник from W7.
// These tests ask for the menu a player gets ({ menu: true }); every other test sees all pages at once.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, LAND, preview } from './runner.mjs';
import { GAME_NAME } from '../src/i18n/name.js';

const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#overlay section[data-page]')].filter((s) => !s.hidden && getComputedStyle(s).display !== 'none').map((s) => s.dataset.page));
const PAGES = ['play', 'friends', 'shop', 'lurkers', 'settings'];

test('menu (S3): the splash (the loading screen; a tap skips it), then the main menu — the logo, five buttons; each page opens and «←» / «Назад» comes back; ?page= links; an invitation (?room=) skips the splash', async () => {
  const ctx = await newContext(browser, LAND, { menu: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(preview, { waitUntil: 'commit' });
  await page.waitForSelector('#splash');
  assert.ok(await page.$eval('#splash', (s) => getComputedStyle(s).display !== 'none'), 'the splash shows at once');
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.mouse.click(400, 200);   // a tap skips it (the game is up)
  await page.waitForFunction(() => window.__splashDone && !document.getElementById('splash'), null, { timeout: 5000 });
  if (await page.$('#micask:not([hidden])')) await page.click('#asklater');
  assert.deepEqual(await shown(page), ['menu']);
  assert.equal((await page.textContent('h1')).trim(), GAME_NAME, 'the logo is the game\'s name');
  assert.deepEqual(await page.$$eval('#mmnav [data-go]', (b) => b.map((x) => x.dataset.go)), PAGES, 'Грати · Грати з друзями · Магазин · Тихарник · Налаштування');
  assert.ok(await page.evaluate(() => document.fonts.check('800 20px Unbounded', 'HUSH JOB ЇЄҐ')), 'the headings\' font is there, with і ї є ґ');
  for (const p of PAGES) {
    await page.click(`#mmnav [data-go="${p}"]`);
    assert.deepEqual(await shown(page), [p], `«${p}» opens`);
    assert.match(page.url(), new RegExp(`page=${p}`));
    if (p === 'play') { await page.goBack(); assert.deepEqual(await shown(page), ['menu'], 'the browser\'s «Назад» comes back'); }
    else { await page.click(`section[data-page="${p}"] [data-back]`); await page.waitForFunction(() => !location.search.includes('page=')); assert.deepEqual(await shown(page), ['menu'], `«←» from «${p}»`); }
  }
  // «Для тестерів» from «Налаштування»: the quality, the frame rate, the style, the report, «Відкрити все»
  await page.click('#mmnav [data-go="settings"]');
  await page.click('section[data-page="settings"] [data-go="testers"]');
  assert.deepEqual(await shown(page), ['testers']);
  assert.deepEqual(await page.evaluate(() => ['quality', 'fpscap', 'stylesel', 'report', 'openall', 'shoutrow', 'recstate', 'modeline'].filter((id) => document.getElementById(id).closest('section').dataset.page === 'testers')),
    ['quality', 'fpscap', 'stylesel', 'report', 'openall', 'shoutrow', 'recstate', 'modeline']);
  assert.deepEqual(errors, []);
  // the links: ?page=testers opens it without the splash; ?room= opens «Грати з друзями»
  for (const [q, want] of [['?page=testers', 'testers'], ['?page=lurkers', 'lurkers'], ['?room=ABCD', 'friends']]) {
    const p2 = await ctx.newPage();
    await p2.goto(preview + q);
    await p2.waitForFunction(() => window.__game && window.__splashDone, null, { timeout: 30000 });
    assert.equal(!!(await p2.$('#splash')), false, `${q}: no splash`);
    assert.deepEqual(await shown(p2), [want], q);
    assert.equal(!!(await p2.$('#micask:not([hidden])')), false, `${q}: no microphone card over an invitation or a link`);
    await p2.close();
  }
  await ctx.close();
});

test('menu (S3): the first run offers the microphone — «Пізніше» closes it for this visit, «Грати без мікрофона» ticks the box; a calibrated microphone is not asked about; Тихарник shows W7\'s cards and opens one met', async () => {
  const ctx = await newContext(browser, LAND, { menu: true });
  let { page, errors } = await open(ctx, preview + '?nosplash=1');
  await page.waitForSelector('#micask:not([hidden])');
  await page.click('#asklater');
  assert.equal(!!(await page.$('#micask:not([hidden])')), false);
  assert.equal(await page.isVisible('#mmmic'), true, 'the menu still says «Мікрофон: не налаштовано»');
  await page.reload(); await page.waitForFunction(() => window.__game);
  assert.equal(!!(await page.$('#micask:not([hidden])')), false, '«Пізніше»: not again on this visit');
  await page.close();
  // a new visit: «Грати без мікрофона»
  ({ page, errors } = await open(await newContext(browser, LAND, { menu: true }), preview + '?nosplash=1'));
  await page.waitForSelector('#micask:not([hidden])');
  await page.click('#asknone');
  assert.equal(await page.evaluate(() => window.__game.mic.noMic), true, 'no microphone');
  assert.equal(await page.isVisible('#mmmic'), false);
  assert.deepEqual(errors, []);
  await page.context().close();
  // calibrated before: no card
  const c3 = await newContext(browser, LAND, { menu: true });
  await c3.addInitScript(() => { try { localStorage.setItem('nocturne.preview.mic', JSON.stringify({ floor: -60, normal: -30, whisper: -45, shout: -15 })); } catch { /* opaque */ } });
  const p3 = (await open(c3, preview + '?nosplash=1')).page;
  await p3.waitForTimeout(500);
  assert.equal(!!(await p3.$('#micask:not([hidden])')), false, 'calibrated: nothing to ask');
  // Тихарник: nine cards, «???» until met; meeting Шафник opens his
  await p3.click('#mmnav [data-go="lurkers"]');
  const cards = () => p3.$$eval('#lurkerlist .lcard', (c) => c.map((x) => `${x.dataset.lurker}:${x.classList.contains('locked') ? 'locked' : 'open'}`));
  assert.equal((await cards()).length, 9);
  assert.ok((await cards()).every((c) => c.endsWith('locked')));
  await p3.evaluate(async () => { const { meetLurker } = await import('./src/game/story.js'); meetLurker('wardrobe'); });
  await p3.click('section[data-page="lurkers"] [data-back]');
  await p3.click('#mmnav [data-go="lurkers"]');
  assert.ok((await cards()).includes('wardrobe:open'), 'Шафник\'s card is open');
  assert.match(await p3.textContent('#lurkercount'), /1/);
  await c3.close();
});

test('menu (S3): a small phone (667 x 280, landscape) — the main menu fits without scrolling; «Грати» → «Грати» starts the round', async () => {
  const ctx = await newContext(browser, { ...LAND, viewport: { width: 667, height: 280 } }, { menu: true });
  const { page, errors } = await open(ctx, preview + '?nosplash=1');
  if (await page.$('#micask:not([hidden])')) await page.click('#asklater');
  const fit = await page.evaluate(() => { const c = document.querySelector('#overlay .card'); return [c.scrollHeight, c.clientHeight]; });
  assert.ok(fit[0] <= fit[1] + 1, `no scrolling: ${fit}`);
  await page.tap('#mmnav [data-go="play"]');
  await page.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 30000 });
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  assert.equal(await page.$eval('#overlay', (o) => o.style.display), 'none');
  assert.deepEqual(errors, []);
  await ctx.close();
});
