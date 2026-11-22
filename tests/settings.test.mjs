// ONE settings screen (claude/settings-breath): the same page in the menu and in the pause, two columns of equal rows, no scrolling on a
// landscape phone; every row acts at once (also the crickets' switch, in the pause); the microphone is one row that leads to its own page.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, LAND, playPhone, fingerPressEl, pm, frames } from './runner.mjs';

const VP = { ...LAND, viewport: { width: 667, height: 375 }, screen: { width: 667, height: 375 } };
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#setsheet .set-row')].filter((r) => r.getBoundingClientRect().width > 0).map((r) => { const b = r.getBoundingClientRect(); return { t: r.firstElementChild.textContent.trim().replace(/\s+/g, ' '), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; }));

test('settings in the menu (phone, 667x375): 12 rows of one height in two columns, all inside the screen, nothing scrolls', async () => {
  const ctx = await newContext(browser, VP);
  const { page, errors } = await open(ctx, base + '?page=settings');
  await page.waitForFunction(() => !document.querySelector('#overlay section[data-page="settings"]').hidden, null, { timeout: 10000 });
  await frames(page, 2);
  const R = await rows(page);
  assert.equal(R.length, 12, `12 rows: ${R.map((r) => r.t)}`);
  assert.deepEqual([...new Set(R.map((r) => r.h))], [44], `all rows one height: ${JSON.stringify(R.map((r) => [r.t, r.h]))}`);
  assert.equal(new Set(R.map((r) => r.x)).size, 2, 'two columns');
  assert.ok(R.every((r) => r.r <= 667 && r.b <= 375 && r.x >= 0 && r.y >= 0), `inside the screen: ${JSON.stringify(R.filter((r) => r.r > 667 || r.b > 375))}`);
  const sc = await page.evaluate(() => { const c = document.querySelector('#overlay .card'); return { sh: c.scrollHeight, ch: c.clientHeight, doc: document.documentElement.scrollHeight }; });
  assert.ok(sc.sh <= sc.ch + 1, `the card does not scroll (${sc.sh} > ${sc.ch})`);
  const labels = R.map((r) => r.t).join('|');
  for (const w of ['Звуки вулиці', 'Швидкість огляду', 'Затамувати подих', 'Огляд нахилом', 'Підказки на екрані', 'Вібрація', 'Яскравість', 'Якість', 'Плавність', 'Мікрофон', 'Навчання']) assert.ok(labels.includes(w), `a row «${w}»`);
  // the segmented controls fit their rows (no row is taller than 44, no label cut by the control)
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#setsheet .set-row')].filter((r) => r.getBoundingClientRect().width > 0).every((r) => r.scrollWidth <= r.clientWidth + 1)), true, 'nothing overflows a row');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('settings on a PC: the PC rows (vignette, snap, the headset run) and the shared ones, rows of one height', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?page=settings');
  await page.waitForFunction(() => !document.querySelector('#overlay section[data-page="settings"]').hidden, null, { timeout: 10000 });
  const R = await rows(page), labels = R.map((r) => r.t).join('|');
  assert.ok(R.length >= 7 && R.length <= 9, `PC rows: ${R.map((r) => r.t)}`);
  assert.deepEqual([...new Set(R.map((r) => r.h))], [44], JSON.stringify(R.map((r) => [r.t, r.h])));
  assert.ok(labels.includes('Звуки вулиці') && labels.includes('Мікрофон'), labels);
  assert.ok(!labels.includes('Огляд нахилом') && !labels.includes('Вібрація'), 'the phone rows are not there');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the pause opens the SAME settings page over the game: the same rows, «Продовжити» only there, «←» back to the pause, «Продовжити» resumes; every row acts at once (the crickets\' switch included)', async () => {
  const { ctx, page, errors, cdp } = await playPhone(VP);
  await page.evaluate(() => document.body.classList.remove('pages-all'));   // the tests show every menu page at once; a player sees one
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); for (const p of g.guards) p.update = () => null; });
  const menuRows = await (async () => {   // the menu's page, read in another page of the same size
    const c2 = await newContext(browser, VP); const o = await open(c2, base + '?page=settings');
    await o.page.waitForFunction(() => !document.querySelector('#overlay section[data-page="settings"]').hidden); const R = await rows(o.page); await c2.close(); return R;
  })();
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Налаштування'));
  await page.waitForFunction(() => document.body.classList.contains('set-over-pause') && !document.querySelector('#overlay section[data-page="settings"]').hidden, null, { timeout: 8000 });
  await page.waitForTimeout(400);   // the game is paused: no frames to count
  const pauseRows = await rows(page);
  assert.deepEqual(pauseRows.map((r) => [r.t, r.x, r.y, r.w, r.h]), menuRows.map((r) => [r.t, r.x, r.y, r.w, r.h]), 'the same rows in the same places as in the menu: ' + JSON.stringify(pauseRows.map((r, i) => [r.t, r.x, r.y, r.w]).filter((r, i) => JSON.stringify(r) !== JSON.stringify([menuRows[i].t, menuRows[i].x, menuRows[i].y, menuRows[i].w]))));
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('setresume')).display !== 'none'), true, '«Продовжити» is in the pause\'s header');
  assert.equal(menuRows.length, 12);
  // every row acts at once: the look speed, the crickets
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), out = {};
    const set = (id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change')); };
    set('lookspeed', 'fast'); out.look = g.touch.lookSpeed;
    set('lookspeed', 'slow'); out.lookSlow = g.touch.lookSpeed;
    set('streetsounds', 'on'); const A = await import('./src/audio/audio.js'); A.unlockAudio(); await new Promise((x) => setTimeout(x, 200));
    G.placeAmbience.update(0.1, 'yard', true); out.levelOn = G.placeAmbience.level.crickets;
    set('streetsounds', 'off'); out.off = [G.streetSounds, G.placeAmbience.level.crickets];
    out.paused = g.paused;
    return out;
  });
  assert.ok(r.look > r.lookSlow, `the look speed changed at once (${r.look} vs ${r.lookSlow})`);
  assert.ok(r.levelOn > 0, 'the crickets were asked for'); assert.deepEqual(r.off, [false, 0], 'off: silent at once, in the pause');
  assert.equal(r.paused, true, 'and the game is still paused: nothing started');
  // the microphone: one row, its own page, back
  await page.evaluate(() => document.getElementById('microwgo').click());
  await page.waitForFunction(() => !document.querySelector('#overlay section[data-page="mic"]').hidden);
  assert.equal(await page.evaluate(() => document.getElementById('micbox').getBoundingClientRect().width > 0), true, 'the calibration page');
  await page.evaluate(() => document.querySelector('#overlay section[data-page="mic"] [data-back]').click());
  await page.waitForFunction(() => !document.querySelector('#overlay section[data-page="settings"]').hidden && document.body.classList.contains('set-over-pause'));
  // «←» closes it: the pause is underneath; then again and «Продовжити»
  await page.evaluate(() => document.querySelector('#overlay section[data-page="settings"] [data-back]').click());
  await page.waitForFunction(() => !document.body.classList.contains('set-over-pause') && getComputedStyle(document.getElementById('overlay')).display === 'none');
  assert.equal(await page.evaluate(() => window.__game.paused), true, 'back in the pause');
  await fingerPressEl(page, cdp, pm('Налаштування'));
  await page.waitForFunction(() => document.body.classList.contains('set-over-pause'));
  await fingerPressEl(page, cdp, '#setresume');
  await page.waitForFunction(() => !window.__game.paused && !document.body.classList.contains('set-over-pause'), null, { timeout: 8000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the microphone row says its state, quality and frame rate moved from «Для тестерів» to the settings', async () => {
  const ctx = await newContext(browser, VP);
  const { page, errors } = await open(ctx, base + '?page=settings');
  await page.waitForFunction(() => !document.querySelector('#overlay section[data-page="settings"]').hidden);
  assert.match(await page.evaluate(() => document.getElementById('microwtext').textContent), /^Мікрофон/);
  assert.deepEqual(await page.evaluate(() => ['quality', 'fpscap'].map((id) => !!document.getElementById(id).closest('#setsheet'))), [true, true]);
  assert.deepEqual(errors, []);
  await ctx.close();
});
