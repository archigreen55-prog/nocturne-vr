// Platform: mode detection, boot and boot failures, ?debug, ?mode=, previews, the report.
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext } from './harness.mjs';
import { VERSION, preview, browser, UA, phoneCtx, open, modeOf, test, base } from './runner.mjs';

test('detection table (Android, iPhone, iPad, Quest, PC)', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  const rows = await page.evaluate(async (UA) => {
    const { detectDevice, iosTooOld, refineAndroid } = await import('./src/platform/mode.js');
    // touchOnly: primary pointer coarse, no fine pointer; 'samsung': primary coarse but also "any-pointer: fine"
    const media = (touchOnly) => (q) => (q === '(pointer: coarse)' ? !!touchOnly : q === '(any-pointer: fine)' ? touchOnly !== true : false);
    const d = (ua, touch = 0, touchOnly = false) => { const r = detectDevice({ userAgent: ua, maxTouchPoints: touch }, media(touchOnly)); return { mode: r.mode, device: r.device, os: r.os, old: iosTooOld(r) }; };
    const reduced = detectDevice({ userAgent: UA.androidReduced, maxTouchPoints: 5 }, media('samsung'));
    return {
      pixel: d(UA.pixel, 5, true), samsung: d(UA.samsung, 5, true), iphone: d(UA.iphone, 5, true), iphoneChrome: d(UA.iphoneChrome, 5, true),
      iphoneOld: d(UA.iphoneOld, 5, true), ipadOS: d(UA.ipadOS, 5, true), mac: d(UA.mac, 0, false), quest: d(UA.quest, 0, false),
      questOld: d(UA.questOld, 0, false), windows: d(UA.windows, 0, false), windowsTouchLaptop: d(UA.windows, 10, false),
      androidDesktopSite: d(UA.androidDesktopSite, 5, true),
      samsungDesktopSite: d(UA.androidDesktopSite, 5, 'samsung'),
      androidReduced: d(UA.androidReduced, 5, 'samsung'),
      refined: refineAndroid(reduced, { platformVersion: '13.0.0', model: 'SM-G988B' }).os,
    };
  }, UA);
  const expect = {
    pixel: ['phone', 'Android'], samsung: ['phone', 'Android'], iphone: ['phone', 'iPhone'], iphoneChrome: ['phone', 'iPhone'],
    iphoneOld: ['phone', 'iPhone'], ipadOS: ['phone', 'iPad'], mac: ['pc'], quest: ['vr'], questOld: ['vr'], windows: ['pc'],
    windowsTouchLaptop: ['pc'], androidDesktopSite: ['phone'], samsungDesktopSite: ['phone'], androidReduced: ['phone', 'Android'],
  };
  for (const [k, [mode, device]] of Object.entries(expect)) {
    assert.equal(rows[k].mode, mode, `${k}: ${JSON.stringify(rows[k])}`);
    if (device) assert.equal(rows[k].device, device, k);
  }
  assert.equal(rows.iphone.os, 'iOS 18.6');
  assert.equal(rows.androidReduced.os, '', 'frozen "Android 10; K" is not shown as Android 10');
  assert.equal(rows.refined, 'Android 13, SM-G988B');
  assert.equal(rows.iphoneOld.old, true, 'iOS 16.3 is too old');
  assert.equal(rows.iphone.old, false);
  await ctx.close();
});

test('PC: loads clean, mode "комп\'ютер", play and VR buttons as before', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  assert.equal((await modeOf(page)).mode, 'pc');
  assert.equal(await page.textContent('#start'), 'Грати на ПК');
  assert.equal(await page.isEnabled('#start'), true);
  assert.equal(await page.isVisible('#vrbutton'), true);
  assert.match(await page.textContent('#version'), new RegExp(`версія ${VERSION.replace(/\./g, '\\.')}$`));
  assert.match(await page.textContent('#modeline'), /Режим: комп'ютер/);
  await page.evaluate(() => window.__game.sim(5));
  assert.equal(await page.locator('#bootfail').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Android phone: mode "телефон", no VR button, "Грати", report copies valid JSON', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.pixel));
  const { page, errors } = await open(ctx, base);
  const m = await modeOf(page);
  assert.equal(m.mode, 'phone'); assert.equal(m.device, 'Android'); assert.equal(m.auto, true);
  assert.equal(await page.isVisible('#vrbutton'), false);
  assert.equal(await page.textContent('#start'), 'Грати');
  assert.equal(await page.isEnabled('#start'), true);
  assert.match(await page.textContent('#modeline'), /Режим: телефон \(Android/);
  await page.waitForTimeout(500);
  await page.tap('#report');
  await page.waitForFunction(() => /Скопійовано/.test(document.querySelector('#reportsheet')?.textContent || ''));
  const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(r.report, 'nocturne'); assert.equal(r.version, VERSION); assert.equal(r.mode.mode, 'phone');
  assert.equal(r.preview, false); assert.ok(r.gl.renderer, 'gl info'); assert.ok(r.perf.avgFps > 0, 'fps'); assert.equal(r.mic.state, 'off');
  assert.ok(Array.isArray(r.errors));
  await page.tap('#reportsheet button');
  assert.equal(await page.locator('#reportsheet').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPhone (UA in Chromium: detection and layout only, not Safari)', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.iphone, { ...devices['iPhone 15'], userAgent: UA.iphone, permissions: ['clipboard-read', 'clipboard-write'] }));
  const { page, errors } = await open(ctx, base);
  const m = await modeOf(page);
  assert.equal(m.mode, 'phone'); assert.equal(m.device, 'iPhone'); assert.equal(m.os, 'iOS 18.6');
  assert.equal(await page.isVisible('#vrbutton'), false);
  assert.equal(await page.locator('#bootfail').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('old iPhone (iOS 16.3): the start screen says which iOS is needed', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.iphoneOld));
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('#bootfail');
  assert.match(await page.textContent('#bootfail'), /iOS 16\.3.*16\.4/);
  await ctx.close();
});

test('three.js (vendor/) does not load: "Гра не завантажилась" with the error and a copyable boot report', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.pixel), { abortVendor: true });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('#bootfail', { timeout: 30000 });
  assert.equal(await page.textContent('#start'), 'Гра не завантажилась');
  assert.match(await page.textContent('#bootfail pre'), /three|vendor|module/i);
  await page.tap('#bootfail button');
  await page.waitForFunction(() => document.querySelector('#bootfail button').textContent === 'Скопійовано');
  const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(r.report, 'nocturne-boot'); assert.ok(r.errors.length > 0);
  await ctx.close();
});

test('?debug shows the error panel; a thrown error appears in it and in the report', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base + '?debug');
  await page.evaluate(() => setTimeout(() => { throw new Error('test-boom'); }));
  await page.waitForFunction(() => /test-boom/.test(document.body.innerText));
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.ok(r.errors.some((e) => /test-boom/.test(e.msg)));
  await ctx.close();
});

test('?mode= overrides and is remembered; ?mode=auto forgets', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.pixel));
  let { page } = await open(ctx, base + '?mode=vr');
  assert.equal((await modeOf(page)).mode, 'vr');
  assert.equal(await page.isVisible('#vrbutton'), true);
  assert.match(await page.textContent('#modeline'), /вибрано вручну; автоматично було б «телефон»/);
  await page.goto(base); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  assert.equal((await modeOf(page)).mode, 'vr', 'remembered');
  await page.goto(base + '?mode=auto'); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  assert.equal((await modeOf(page)).mode, 'phone');
  await ctx.close();
});

test('preview: version marked, settings saved apart, main site values read until then', async () => {
  const ctx = await newContext(browser);
  let { page } = await open(ctx, base);
  await page.selectOption('#difficulty', 'hard');
  await page.goto(preview); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  assert.match(await page.textContent('#version'), /тестова \(превʼю\)/);
  assert.equal(await page.inputValue('#difficulty'), 'hard', 'reads the main site value');
  await page.selectOption('#difficulty', 'easy');
  const store = await page.evaluate(() => ({ main: localStorage.getItem('nocturne.difficulty'), prev: localStorage.getItem('nocturne.preview.difficulty') }));
  assert.deepEqual(store, { main: '"hard"', prev: '"easy"' });
  await page.goto(base); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  assert.equal(await page.inputValue('#difficulty'), 'hard', 'main site untouched');
  await ctx.close();
});
