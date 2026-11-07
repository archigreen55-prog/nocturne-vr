// Progress as a code (export / import) and the privacy page.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newContext, ROOT } from './harness.mjs';
import { browser, base, preview, open, test, LAND, playPhone, fingerPressEl } from './runner.mjs';

const PROGRESS = {
  'nocturne.stars': JSON.stringify({ first: { easy: 2, medium: 1 }, clock: { hard: 3 } }),
  'nocturne.starsByMode': JSON.stringify({ phone: { first: { easy: 2 } } }),
  'nocturne.mic': JSON.stringify({ floor: -62, whisper: -48, normal: -30, shout: -21, adj: 2, adjW: 0, bleed: -40 }),
  'nocturne.difficulty': JSON.stringify('hard'),
  'nocturne.lookSpeed': JSON.stringify('fast'),
  'nocturne.tutorial': JSON.stringify({ done: true }),
};
const DEVICE_ONLY = { 'nocturne.qualityAuto': JSON.stringify('low'), 'nocturne.mode': JSON.stringify('pc') };
const stored = (page, prefix = 'nocturne.') => page.evaluate((p) => {
  const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(p) && (p !== 'nocturne.' || !k.startsWith('nocturne.preview.'))) o[k] = localStorage.getItem(k); }
  return o;
}, prefix);
const reopen = async (page) => { await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 }); };

test('progress code: export (copied by finger) -> wiped storage -> import -> stars, settings and calibration are back; device-only values stay out', async () => {
  const ctx = await newContext(browser, { ...LAND, permissions: ['clipboard-read', 'clipboard-write'] });
  const { page, errors } = await open(ctx, base);
  await page.evaluate((all) => { for (const [k, v] of Object.entries(all)) localStorage.setItem(k, v); }, { ...PROGRESS, ...DEVICE_ONLY });
  await page.reload(); await reopen(page);
  const cdp = await ctx.newCDPSession(page);
  await fingerPressEl(page, cdp, '#progbtn');
  assert.equal(await page.isVisible('#progress'), true);
  await fingerPressEl(page, cdp, '#progexport');
  const code = await page.inputValue('#progcode');
  assert.match(code, /^NOC1-[A-Za-z0-9_-]+-[0-9a-z]+$/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code, 'copied inside the tap');
  assert.match(await page.textContent('#prognote'), /Код скопійовано \(\d+ запис/);
  const before = await stored(page);
  // another device: nothing saved
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await reopen(page);
  const wiped = await stored(page);   // (the game itself saves its default settings when it starts)
  for (const k of ['nocturne.stars', 'nocturne.mic', 'nocturne.difficulty', 'nocturne.tutorial']) assert.equal(k in wiped, false, `${k} wiped`);
  await fingerPressEl(page, cdp, '#progbtn');
  await fingerPressEl(page, cdp, '#progimport');
  await page.fill('#progcode', code.slice(0, 40) + '\n' + code.slice(40));   // a line break from a chat app
  await fingerPressEl(page, cdp, '#progapply');
  assert.match(await page.textContent('#prognote'), /Код правильний/);
  assert.equal(await page.textContent('#progapply'), 'Замінити прогрес на цьому пристрої');
  await Promise.all([page.waitForNavigation(), fingerPressEl(page, cdp, '#progapply')]);
  await reopen(page);
  const after = await stored(page);
  for (const k of Object.keys(PROGRESS)) assert.equal(after[k], before[k], k);
  for (const k of Object.keys(DEVICE_ONLY)) assert.equal(k in after, false, `${k} is not carried over`);
  // and the game reads them: the stars, the difficulty, the calibration
  assert.equal(await page.evaluate(() => window.__game.difficulty), 'hard');
  assert.equal(await page.evaluate(() => window.__game.mic.calibrated), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('progress code: a cut or foreign code is refused and changes nothing; preview and main site keep their own progress', async () => {
  const ctx = await newContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const { page } = await open(ctx, base);
  await page.evaluate((all) => { for (const [k, v] of Object.entries(all)) localStorage.setItem(k, v); }, PROGRESS);
  await page.reload(); await reopen(page);
  await page.click('#progbtn'); await page.click('#progexport');
  const code = await page.inputValue('#progcode');
  const keep = await stored(page);
  for (const [bad, why] of [['', /Спершу встав код/], ['hello', /не код прогресу/], [code.slice(0, -6), /пошкоджений|не код/], [code.replace(/-([0-9a-z]+)$/, '-zzzz'), /пошкоджений/]]) {
    await page.click('#progimport');
    await page.fill('#progcode', bad);
    await page.click('#progapply');
    assert.match(await page.textContent('#prognote'), why, JSON.stringify(bad.slice(0, 20)));
    assert.deepEqual(await stored(page), keep, 'nothing changed');
  }
  // a code from the main site, imported on a preview: the preview's own keys; the main site untouched
  const pv = await ctx.newPage();
  await pv.goto(preview); await reopen(pv);
  await pv.click('#progbtn'); await pv.click('#progimport');
  await pv.fill('#progcode', code);
  await pv.click('#progapply');
  await Promise.all([pv.waitForNavigation(), pv.click('#progapply')]);
  await reopen(pv);
  const prev = await stored(pv, 'nocturne.preview.');
  assert.equal(prev['nocturne.preview.stars'], PROGRESS['nocturne.stars']);
  assert.deepEqual(await stored(page), keep, 'the main site is untouched');
  await ctx.close();
});

test('privacy page: linked from the start screen and the menu; microphone on the device only, the scream in memory only, localStorage, no analytics, Issues as the contact, no email; offline copy', async () => {
  const html = await readFile(join(ROOT, 'privacy.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const re of [/Мікрофон/, /лише на твоєму пристрої/, /нікуди не надсилається/, /Запис крику/, /в пам'яті/, /не записується на диск/, /localStorage/, /Аналітики/, /Реклами/, /cookies/i, /GitHub Pages/]) assert.match(text, re);
  assert.match(html, /href="https:\/\/github\.com\/archigreen55-prog\/nocturne-vr\/issues"/);
  assert.doesNotMatch(html, /[\w.+-]+@[\w-]+\.[\w.]+/, 'no email address on the page');
  assert.doesNotMatch(html, /mailto:/);
  const { GAME_NAME } = await import(pathToFileURL(join(ROOT, 'src/i18n/name.js')));
  assert.match(html, new RegExp(`<span data-game-name>${GAME_NAME}</span>`));
  assert.match(html, new RegExp(`<title>${GAME_NAME}:`));
  assert.match(await readFile(join(ROOT, 'sw.js'), 'utf8'), /"\.\/privacy\.html"/, 'kept for offline play');
  // the start screen link opens it
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  assert.equal(await page.getAttribute('#privacylink', 'href'), 'privacy.html');
  const [pp] = await Promise.all([ctx.waitForEvent('page'), page.click('#privacylink')]);
  await pp.waitForLoadState();
  assert.match(await pp.title(), /політика приватності/);
  await ctx.close();
  // the phone menu: Налаштування -> «Політика приватності»
  const { ctx: c2, page: p2, cdp } = await playPhone();
  await p2.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; window.__game.pauseOpen('user'); window.__game.menu.go('settings'); });
  await fingerPressEl(p2, cdp, '#pausemenu .pm-btn:text-is("Політика приватності")');
  assert.deepEqual(await p2.evaluate(() => window.__opened), ['privacy.html']);
  // and «Прогрес: код» from the menu opens the start screen's block
  await p2.evaluate(() => { window.__game.menu.go('settings'); });
  await fingerPressEl(p2, cdp, '#pausemenu .pm-btn:text-is("Прогрес: код")');
  await p2.waitForFunction(() => !document.getElementById('progress').hidden && document.getElementById('overlay').style.display !== 'none');
  await c2.close();
});
