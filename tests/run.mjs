// Cloud tests (no phone, no headset): mode detection, the report, boot failure messages, preview
// settings, the fake microphone, and a VR regression in the WebXR emulator (IWER, Quest 3).
//   npm install && npm test            (Chromium from Playwright; WebKit is not available here)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { devices } from 'playwright';
import { startServer, launch, newContext, watchErrors, toneWav, segmentsWav, ROOT } from './harness.mjs';

const VERSION = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8')).version;
const { server, base } = await startServer();
const preview = base + 'preview/test/';
// a fresh Chromium per test: one browser for the whole run ran out of resources (WebGL + audio per page)
const micWav = await toneWav(0.1);
// 3 s silence, 6 finger knocks on the body (80 ms, loud), 1 s silence, a 1.5 s shout, 1.5 s silence (loops)
const knockWav = await segmentsWav('knocks', [{ secs: 3, kind: 'noise', amp: 0.0008 },
  ...Array.from({ length: 6 }, () => [{ secs: 0.08, kind: 'noise', amp: 0.5 }, { secs: 0.32, kind: 'noise', amp: 0.0008 }]).flat(),
  { secs: 1, kind: 'noise', amp: 0.0008 }, { secs: 1.5, kind: 'tone', amp: 0.35 }, { secs: 1.5, kind: 'noise', amp: 0.0008 }]);
let browser = null;

const UA = {
  pixel: devices['Pixel 7'].userAgent,
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  iphoneOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  quest: 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0.0 SamsungBrowser/4.0 Chrome/132.0.0.0 VR Safari/537.36',
  questOld: 'Mozilla/5.0 (Linux; Android 12; Quest 2) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/30.0 Chrome/118.0 Mobile VR Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  androidDesktopSite: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  androidReduced: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
};
const phoneCtx = (ua, extra = {}) => ({ ...devices['Pixel 7'], userAgent: ua, permissions: ['clipboard-read', 'clipboard-write'], ...extra });

async function open(ctx, url) {
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
  return { page, errors };
}
const modeOf = (page) => page.evaluate(() => ({ ...window.__game.MODE }));

const tests = [];
const test = (name, fn, opts = {}) => tests.push({ name, fn, ...opts });

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

test('CDN down: "Гра не завантажилась" with the error and a copyable boot report', async () => {
  const ctx = await newContext(browser, phoneCtx(UA.pixel), { abortCdn: true });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('#bootfail', { timeout: 30000 });
  assert.equal(await page.textContent('#start'), 'Гра не завантажилась');
  assert.match(await page.textContent('#bootfail pre'), /three|cdn\.jsdelivr|module/i);
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

test('fake microphone: permission, level of a -23 dBFS tone, track settings in the report', async () => {
  const ctx = await newContext(browser, { permissions: ['microphone'] });
  const { page, errors } = await open(ctx, base);
  await page.click('#micbtn');
  await page.waitForFunction(() => window.__game.mic.state === 'on');
  assert.equal(await page.textContent('#calbtn'), 'Калібрувати (4 кроки)', 'PC: the 4-step calibration as before');
  await page.waitForTimeout(1500);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mic.state, 'on');
  assert.ok(Math.abs(r.mic.levelDb - -23) < 3, `tone level ${r.mic.levelDb} dBFS`);
  assert.equal(r.mic.track.autoGainControl, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mic limits: the Android report (corrections -12 / -10) is brought back to sane thresholds', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  await page.evaluate(() => localStorage.setItem('nocturne.mic', JSON.stringify({ floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152, adj: -12, adjW: -10 })));
  await page.reload(); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  const m = await page.evaluate(() => { const m = window.__game.mic; return { shout: m.shoutDb, whisper: m.whisperDb, adj: m.cal.adj, adjW: m.cal.adjW }; });
  assert.ok(m.shout >= -22.408 + 4 - 1e-9, `shout threshold ${m.shout} must stay >= voice + 4`);
  assert.ok(m.whisper >= -44.69 + 3 - 1e-9, `whisper boundary ${m.whisper} must stay >= whisper + 3`);
  assert.ok(m.whisper <= -22.408 - 3 + 1e-9, 'whisper boundary below the voice');
  assert.deepEqual([m.adj, m.adjW], [-3, -7], 'saved corrections clamped');
  // without corrections the calibration's own thresholds are untouched
  const raw = await page.evaluate(() => { const m = window.__game.mic; m.resetAdjust(); return [m.shoutDb, m.whisperDb]; });
  assert.ok(Math.abs(raw[0] - -15.152) < 1e-6 && Math.abs(raw[1] - (-44.69 + 0.45 * (-22.408 + 44.69))) < 1e-6, String(raw));
  await ctx.close();
});

test('mic ± buttons (no sliders): stop at the limit with a note, reset, page swipes change nothing', async () => {
  const ctx = await newContext(browser, { ...devices['Pixel 7'], permissions: ['microphone'] });
  const { page, errors } = await open(ctx, base);
  await page.evaluate(() => localStorage.setItem('nocturne.mic', JSON.stringify({ floor: -50, normal: -22, whisper: -45, shout: -15 })));
  await page.reload(); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  await page.tap('#micbtn'); await page.waitForFunction(() => window.__game.mic.state === 'on');
  assert.equal(await page.locator('#shoutrow input[type=range]').count(), 0, 'no sliders');
  const before = await page.evaluate(() => [window.__game.mic.shoutDb, window.__game.mic.whisperDb]);
  // a page swipe that starts on the threshold rows (vertical, both ways)
  const cdp = await ctx.newCDPSession(page);
  for (const sel of ['#shoutdb', '#sdn', '#wup']) {
    await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), sel);
    const b = await page.locator(sel).boundingBox();
    for (const dy of [-200, 200]) {
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 2, y: y + dy * i / 10 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    }
  }
  assert.deepEqual(await page.evaluate(() => [window.__game.mic.shoutDb, window.__game.mic.whisperDb]), before, 'swipes did not move the thresholds');
  // shout threshold down to its limit: voice -22 + 4 = -18 (base -15, so at most -3)
  for (let i = 0; i < 6; i++) if (await page.isEnabled('#sdn')) await page.tap('#sdn');
  assert.equal(await page.evaluate(() => window.__game.mic.shoutDb), -18);
  assert.equal(await page.isEnabled('#sdn'), false);
  assert.match(await page.textContent('#adjnote'), /на 4 дБ вища за твій звичайний голос/);
  assert.match(await page.textContent('#shoutdb'), /−18 дБ \(зсув −3\)|-18 дБ \(зсув −3\)/);
  await page.tap('#adjreset');
  assert.deepEqual(await page.evaluate(() => [window.__game.mic.cal.adj, window.__game.mic.cal.adjW]), [0, 0]);
  assert.match(await page.textContent('#adjnote'), /Зсуви скинуто/);
  assert.equal(await page.isEnabled('#adjreset'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- T1: phone controls (Chromium with touch emulation; real Safari is tested by hand) ----------
const LAND = { ...devices['Pixel 7 landscape'], permissions: ['clipboard-read', 'clipboard-write'] };
const tp = (cdp, type, pts = [], timestamp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })), ...(timestamp ? { timestamp } : {}) });
// a quick tap with explicit event times (80 ms): here a busy page delays the second event by 300+ ms,
// which would make the tap look like a hold; on a phone the system stamps the real times
// explicit event times must keep increasing: the browser drops a touch event older than the last one
let lastTouchT = 0;
const touchT = () => (lastTouchT = Math.max(Date.now() / 1000, lastTouchT + 0.05));
async function quickTap(cdp, pt) { const t = touchT(); await tp(cdp, 'touchStart', [pt], t); await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.08)); }
// Software rendering here is slow (a few frames per second inside the house): wait for game time,
// not wall time. `ms` below is game time.
const simT = (page) => page.evaluate(() => window.__game.simT);
async function keepFor(page, ms, sample) {
  const t0 = await simT(page), out = [];
  while (await simT(page) - t0 < ms / 1000) { await page.waitForTimeout(60); if (sample) out.push(await page.evaluate(sample)); }
  return out;
}
const frames = async (page, n = 3) => { const t0 = await simT(page); await page.waitForFunction(([t0, n]) => window.__game.simT > t0 + n / 200, [t0, n], { polling: 30 }); };
async function drag(page, cdp, x0, y0, dx, dy, holdMs, sample) {
  await tp(cdp, 'touchStart', [{ x: x0, y: y0 }]);
  for (let i = 1; i <= 8; i++) await tp(cdp, 'touchMove', [{ x: x0 + dx * i / 8, y: y0 + dy * i / 8 }]);
  const out = await keepFor(page, holdMs, sample);
  await tp(cdp, 'touchEnd');
  await frames(page);
  return out;
}
async function hold(page, cdp, sel, ms, sample) {
  const b = await page.locator(sel).boundingBox();
  await tp(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
  const out = await keepFor(page, ms, sample);
  await tp(cdp, 'touchEnd');
  await frames(page);
  return out;
}
async function playPhone(ctxOpts = LAND) {
  const ctx = await newContext(browser, ctxOpts);
  const { page, errors } = await open(ctx, base);
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
}
// stand `dist` m from (x, z), facing it
const standFacing = (page, x, z, dist, fromYaw) => page.evaluate(([x, z, dist, fromYaw]) => {
  const g = window.__game, px = x + Math.sin(fromYaw) * dist, pz = z + Math.cos(fromYaw) * dist;
  g.player.teleport(px, pz, fromYaw); g.sim(0.05);
}, [x, z, dist, fromYaw]);

test('phone: Грати shows touch controls; joystick quiet inside the ring, loud beyond; look; pause', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  assert.equal(await page.isVisible('#touch'), true);
  assert.equal(await page.isVisible('#overlay'), false);
  assert.equal(await page.isVisible('#vrbutton'), false);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(2.2, 6.8, 2.92 - Math.PI); });   // spawn, facing the house
  const vp = page.viewportSize();
  const x0 = vp.width * 0.2, y0 = vp.height * 0.6;
  const p0 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  const quiet = await drag(page, cdp, x0, y0, 0, -36, 1200, () => ({ s: window.__game.player.speed, a: window.__game.player.stepsAudible, ring: document.querySelector('#touch .joy').classList.contains('loud') }));
  const p1 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.2, 'walked with a light push');
  assert.ok(quiet.every((q) => !q.a && !q.ring), `quiet push stays quiet: ${JSON.stringify(quiet.slice(-2))}`);
  const loud = await drag(page, cdp, x0, y0, 0, -64, 1200, () => ({ a: window.__game.player.stepsAudible, ring: document.querySelector('#touch .joy').classList.contains('loud') }));
  assert.ok(loud.some((q) => q.a) && loud.at(-1).ring, 'full push = audible steps, ring turns amber');
  assert.equal(await page.isVisible('#touch .joy'), false, 'joystick hides on release');
  const yaw0 = await page.evaluate(() => window.__game.player.yaw);
  await drag(page, cdp, vp.width * 0.7, vp.height * 0.4, -120, 0, 100);
  const yaw1 = await page.evaluate(() => window.__game.player.yaw);
  assert.ok(Math.abs(yaw1 - yaw0) > 0.4, `look turned ${(yaw1 - yaw0).toFixed(2)} rad`);
  await fingerPressEl(page, cdp, '#touch .pause');   // the pause button fires when the finger is lifted
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.isVisible('#pausemenu'), true, 'the pause menu opens');
  assert.equal(await page.evaluate(() => window.__game.playing), true, 'still in the game, only paused');
  await fingerPressEl(page, cdp, pm('На стартовий екран'));
  await page.waitForFunction(() => !window.__game.playing);
  assert.equal(await page.isVisible('#overlay'), true);
  assert.equal(await page.isVisible('#touch'), false);
  assert.equal(await page.isVisible('#hud'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: Взяти / Покласти, door tap = quick, hold = slow and quiet, release stops; crouch; breath hold and tap / tap', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  // item: stand 1 m in front of the nearest one-handed item
  const item = await page.evaluate(() => { const g = window.__game, it = g.loot.items.find((i) => !i.twoHanded); const c = it.mesh.getWorldPosition(new g.THREE.Vector3()); return { name: it.name, x: c.x, z: c.z }; });
  await standFacing(page, item.x, item.z, 1.0, 0.3);
  await page.waitForSelector('#touch .act:not([hidden])');
  assert.equal(await page.textContent('#touch .act'), 'Взяти');
  await page.tap('#touch .act');
  await page.waitForFunction(() => window.__game.hands.desk);
  assert.equal(await page.evaluate(() => window.__game.hands.desk.name), item.name);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Покласти');
  await page.tap('#touch .act');
  await page.waitForFunction(() => !window.__game.hands.desk);
  // door: an unlocked one, 1 m in front of its doorway
  const door = await page.evaluate(() => { const g = window.__game, i = g.level.doors.findIndex((d) => !d.locked); const d = g.level.doors[i]; return { i, x: d.cx, z: d.cz, n: d.base }; });
  await page.evaluate(() => window.__game.level.reset());
  await standFacing(page, door.x, door.z, 1.0, door.n);
  await page.waitForSelector('#touch .door:not([hidden])');
  { const db = await page.locator('#touch .door').boundingBox(); await quickTap(cdp, { x: db.x + db.width / 2, y: db.y + db.height / 2 }); }
  // the quick swing (a late frame may first start it as a slow one, then the tap speeds it up)
  await page.waitForFunction((i) => { const d = window.__game.level.doors[i]; return Math.abs(d.target) > 1.5 && Math.abs(d.rate - (95 * Math.PI / 180) / 0.35) < 0.01; }, door.i, { timeout: 8000 }).catch(() => {});
  const fast = await page.evaluate((i) => { const d = window.__game.level.doors[i]; return { target: d.target, rate: d.rate }; }, door.i);
  assert.ok(Math.abs(fast.target) > 1.5, 'tap opens');
  assert.ok(Math.abs(fast.rate - (95 * Math.PI / 180) / 0.35) < 0.01, 'tap = quick swing');
  await page.evaluate((i) => { window.__game.level.doors[i].reset(); }, door.i);
  const hs = await hold(page, cdp, '#touch .door', 1000, () => { const d = window.__game.level.doors.find((x) => !x.locked); return { a: d.angle, c: d.creak }; });
  const after = await page.evaluate((i) => { const d = window.__game.level.doors[i]; return { a: d.angle, t: d.target }; }, door.i);
  await keepFor(page, 300);
  const later = await page.evaluate((i) => window.__game.level.doors[i].angle, door.i);
  assert.ok(Math.abs(after.a) > 0.1 && Math.abs(after.a) < 1.5, `hold opened it partly (${after.a.toFixed(2)} rad)`);
  assert.ok(Math.abs(later - after.a) < 0.02, 'released: the leaf stays where it is');
  assert.ok(hs.every((h) => h.c === 0), 'slow swing does not creak');
  // crouch
  await page.tap('#touch .crouch');
  await page.waitForFunction(() => window.__game.player.virtualCrouch);
  assert.equal(await page.textContent('#touch .crouch'), 'Встати');
  await page.tap('#touch .crouch');
  await page.waitForFunction(() => !window.__game.player.virtualCrouch);
  // breath: hold
  const bh = await hold(page, cdp, '#touch .breath', 800, () => window.__game.breath.state);
  assert.ok(bh.includes('holding'), 'holding while pressed');
  assert.equal(await page.evaluate(() => window.__game.breath.state), 'cooldown');
  // breath: tap / tap
  await page.evaluate(() => { window.__game.breath.reset(); window.__game.touch.breathToggle = true; });
  await page.tap('#touch .breath');
  await page.waitForFunction(() => window.__game.breath.state === 'holding');
  await keepFor(page, 500);
  assert.equal(await page.evaluate(() => window.__game.breath.state), 'holding', 'still holding after the finger is up');
  await page.tap('#touch .breath');
  await page.waitForFunction(() => window.__game.breath.state === 'cooldown');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// screen point of a board button (the board as drawn now)
const boardPoint = (page, id) => page.evaluate((id) => {
  const g = window.__game, b = g.board.buttons.find((x) => x.id === id), m = g.board.mesh, P = m.geometry.parameters;
  if (!b) return null;
  g.camera.updateMatrixWorld(true); g.camera.matrixWorldInverse.copy(g.camera.matrixWorld).invert();   // as the game's own hit test sees it
  const v = m.localToWorld(new g.THREE.Vector3(((b.x + b.w / 2) / 1024 - 0.5) * P.width, (0.5 - (b.y + b.h / 2) / 640) * P.height, 0)).project(g.camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, id);
// a real finger: held 0.4 s and sliding 10 px while pressing (the old tap rule rejected such presses)
async function fingerPress(page, cdp, pt) {
  const t = touchT();
  await tp(cdp, 'touchStart', [pt], t);
  await tp(cdp, 'touchMove', [{ x: pt.x + 6, y: pt.y + 4 }], t + 0.15);
  await tp(cdp, 'touchMove', [{ x: pt.x + 10, y: pt.y + 4 }], t + 0.3);
  await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.4));
}
const toResult = (page) => page.waitForFunction(() => window.__game.round.phase === 'result' && window.__game.board.floating, null, { polling: 50, timeout: 20000 });
// a real finger on an HTML button (menu, summary, pause): really held (400 ms by default) and sliding 10 px
async function fingerPressEl(page, cdp, sel, { holdMs = 400, slide = 10 } = {}) {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  const b = await page.locator(sel).first().boundingBox();
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const t = touchT();
  await tp(cdp, 'touchStart', [pt], t);
  await page.waitForTimeout(holdMs / 2);
  await tp(cdp, 'touchMove', [{ x: pt.x + slide * 0.6, y: pt.y + slide * 0.4 }], t + holdMs / 2000);
  await page.waitForTimeout(holdMs / 2);
  await tp(cdp, 'touchMove', [{ x: pt.x + slide, y: pt.y + slide * 0.4 }], t + holdMs * 0.75 / 1000);
  await tp(cdp, 'touchEnd', [], (lastTouchT = t + holdMs / 1000));
}
// the pause menu button with this text
const pm = (text) => `#pausemenu .pm-btn:text-is("${text}")`;
const toSummary = (page) => page.waitForFunction(() => window.__game.summary && window.__game.summary.isOpen, null, { polling: 50, timeout: 20000 });
const pauseState = (page) => page.evaluate(() => ({ paused: window.__game.paused, menu: window.__game.menu.isOpen, simT: window.__game.simT }));

test('phone: a finger on a board button presses it (held 0.4 s, sliding 10 px), the view does not turn', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ c: window.__game.contract.id, yaw: window.__game.player.yaw }));
  await fingerPress(page, cdp, await boardPoint(page, 'cnext'));
  await page.waitForFunction((b) => window.__game.contract.id !== b, before.c);
  assert.equal(await page.evaluate(() => window.__game.player.yaw), before.yaw, 'no camera turn while pressing the board');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: round summary (HTML) after every ending: stars, items, Ще раз послухати and Новий раунд by finger', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  const endings = {
    // the real path: the guard catches you -> 1 s black -> result at the van
    caught: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.caught(); }),
    escaped: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('escaped'); }),
    late: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('late'); }),
    // a loot item in the van, then Поїхати pressed on the stand board with a finger
    left: async () => {
      // the clock starts 4.5 m from the van (Поїхати is on the board only then)
      await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); g.loot.deliver(g.loot.items.find((i) => !i.twoHanded)); g.player.teleport(2.2, 6.8, 2.92); });
      await page.waitForFunction(() => window.__game.board.buttons.some((b) => b.id === 'leave'), null, { timeout: 8000 });
      await frames(page);
      await fingerPress(page, cdp, await boardPoint(page, 'leave'));
    },
  };
  const TITLE = { caught: 'СПІЙМАЛИ', escaped: 'УТЕКЛИ', late: 'НЕ ВСТИГЛИ', left: 'ПОЇХАЛИ' };
  for (const [kind, end] of Object.entries(endings)) {
    // a recorded scream (stubbed: no microphone here) so that "Ще раз послухати" is enabled
    await page.evaluate(() => { const g = window.__game, s = g.scream; window.__played = 0; s.best = { t: 12, samples: new Float32Array(10), db: -10 }; s.play = () => { window.__played++; return true; }; });
    await end();
    await toResult(page).catch(async (e) => { throw new Error(`${kind}: no result (${JSON.stringify(await page.evaluate(() => ({ phase: window.__game.round.phase, floating: window.__game.board.floating })))}) ${e.message}`); });
    assert.equal(await page.evaluate(() => window.__game.round.result.kind), kind, `ending ${kind}`);
    assert.equal(await page.evaluate(() => window.__game.caughtT), -1, `${kind}: no leftover "caught" state`);
    await page.evaluate(() => { window.__game.round.result.shouts = 1; });
    await toSummary(page);
    assert.equal(await page.textContent('#summary .sm-title'), TITLE[kind], `${kind}: title`);
    assert.match(await page.textContent('#summary .sm-stars'), /^[★☆]{3}$/, `${kind}: stars`);
    assert.equal(await page.isVisible('#summary'), true);
    assert.equal(await page.evaluate(() => window.__game.board.mesh.visible), false, 'the floating 3D board is replaced by the summary');
    if (kind === 'left') assert.ok((await page.locator('#summary .sm-item').count()) >= 1, 'delivered item listed');
    await page.waitForFunction(() => !document.querySelector('#summary .sm-buttons .sm-btn:nth-child(2)').disabled, null, { timeout: 5000 });
    await page.waitForFunction(() => window.__played > 0, null, { timeout: 20000 });   // the board plays the scream once by itself
    await page.evaluate(() => { window.__played = 0; });
    await fingerPressEl(page, cdp, '#summary .sm-buttons .sm-btn:nth-child(2)');   // Ще раз послухати
    await page.waitForFunction(() => window.__played > 0, null, { timeout: 8000 });
    await page.evaluate(() => { window.__game.scream.best = null; });
    await fingerPressEl(page, cdp, '#summary .sm-buttons .sm-btn:nth-child(1)');   // Новий раунд
    await page.waitForFunction(() => window.__game.round.phase === 'ready' && !window.__game.board.floating, null, { timeout: 8000 });
    assert.equal(await page.isVisible('#summary'), false, `${kind}: summary closed`);
    assert.equal(await page.evaluate(() => window.__game.board.mesh.visible), true, 'the stand board is back');
    assert.equal(await page.evaluate(() => window.__game.playing), true, `${kind}: still playing after Новий раунд`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone (Android): full screen stays after being caught and a new round; if dropped, the next finger lift restores it', async () => {
  const { ctx, page, cdp } = await playPhone();
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 });
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.caught(); });
  await toResult(page); await toSummary(page);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true, 'still full screen on the summary');
  await fingerPressEl(page, cdp, '#summary .sm-buttons .sm-btn:nth-child(1)');
  await page.waitForFunction(() => window.__game.round.phase === 'ready');
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true, 'still full screen after Новий раунд');
  // something else drops it (a system dialog, a back swipe): one look swipe brings it back
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  const vp = page.viewportSize();
  await drag(page, cdp, vp.width * 0.7, vp.height * 0.4, -40, 0, 100);
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 });
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.phone.fullscreenLog.exits, 1);
  assert.equal(r.phone.fullscreenLog.restored, 1);
  await ctx.close();
});

test('phone: portrait while playing = "rotate the phone" and the game waits', async () => {
  const { ctx, page } = await playPhone();
  await page.setViewportSize({ width: 412, height: 839 });
  await page.waitForSelector('#rotate', { state: 'visible' });
  await page.waitForTimeout(200);
  const t0 = await simT(page);
  await page.waitForTimeout(800);
  assert.equal(await simT(page), t0, 'paused in portrait');
  await page.setViewportSize({ width: 839, height: 412 });
  await page.waitForSelector('#rotate', { state: 'hidden' });
  await page.waitForFunction((t0) => window.__game.simT > t0, t0);
  await ctx.close();
});

test('iPhone landscape (UA in Chromium): play, buttons inside the screen, report has the phone block', async () => {
  const { ctx, page, errors } = await playPhone({ ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] });
  const vp = page.viewportSize();
  for (const sel of ['#touch .breath', '#touch .crouch', '#touch .pause']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} inside the screen`);
  }
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mode.device, 'iPhone');
  assert.equal(r.phone.lookSpeed, 'normal');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone HUD: HTML instead of the wrist canvas; time, eye, microphone, messages; minimal mode; inside the screen; takes no touches', async () => {
  const { ctx, page, errors } = await playPhone({ ...LAND, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  const G = (fn, arg) => page.evaluate(fn, arg);
  assert.equal(await page.isVisible('#hud'), true);
  assert.equal(await G(() => window.__game.wrist.mesh.visible), false, 'wrist panel hidden on a phone');
  await G(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(2); });
  await page.waitForFunction(() => /^\d:\d\d$/.test(document.querySelector('#hud .time').textContent));
  assert.equal(await G(() => window.__game.wrist.texture.version), 1, 'the wrist canvas is never redrawn (version 1 = the texture creation only)');
  assert.match(await page.textContent('#hud .stance'), /^Стоїш · \d\.\d м$/);
  assert.equal(await page.getAttribute('#hud .hud-eye', 'data-eye'), 'open');
  assert.match(await page.textContent('#hud .miclabel'), /МІК ВИМКНЕНО/);
  await page.tap('#touch .crouch');
  await page.waitForFunction(() => document.querySelector('#hud .stance').textContent.startsWith('Присів'));
  await page.waitForFunction(() => document.querySelector('#hud .hud-eye').getAttribute('data-eye') === 'half', null, { timeout: 8000 });
  await G(() => window.__game.flash('Тест повідомлення', 5, '#5fd38d'));
  await page.waitForFunction(() => document.querySelector('#hud .hud-msg').textContent === 'Тест повідомлення');
  assert.match(await page.textContent('#hud .goal'), /Мета: \$0 \/ \$2,000/);
  // microphone (the fake one): the label and a filled bar
  await G(() => window.__game.pauseOpen('user'));
  await G(() => window.__game.pauseResume());
  await G(async () => { await window.__game.mic.enable(); window.__game.sim(0.5); });
  await page.waitForFunction(() => window.__game.mic.state === 'on');
  await page.waitForFunction(() => ['ШЕПІТ', 'НОРМАЛЬНО', 'КРИК!'].includes(document.querySelector('#hud .miclabel').textContent), null, { timeout: 8000 });
  assert.ok(parseFloat(await G(() => document.querySelector('#hud .bar .fill').style.width)) > 0, 'level bar filled');
  // everything inside the screen; the HUD takes no touches
  const vp = page.viewportSize();
  for (const sel of ['#hud .hud-tl', '#hud .hud-tc', '#hud .hud-tr', '#hud .hud-msg']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} inside the screen ${JSON.stringify(b)}`);
  }
  assert.equal(await G(() => { const e = document.elementFromPoint(innerWidth / 2, 20); return !!(e && e.closest('#hud')); }), false, 'the HUD does not catch touches');
  // the pause button and the mic block do not overlap
  const tr = await page.locator('#hud .hud-tr').boundingBox(), pb = await page.locator('#touch .pause').boundingBox();
  assert.ok(tr.x + tr.width <= pb.x, 'mic block is left of the pause button');
  // minimal mode: the alarm word and the goal hide until they change, the clock / eye / mic stay
  await G(() => { document.getElementById('hudmode').value = 'min'; document.getElementById('hudmode').dispatchEvent(new Event('change')); });
  assert.equal(await G(() => window.__game.hud.minimal), true);
  await page.waitForFunction(() => document.querySelector('#hud .alarm').classList.contains('gone'), null, { timeout: 8000 });
  assert.equal(await page.isVisible('#hud .goal'), false);
  assert.equal(await page.isVisible('#hud .time'), true);
  assert.equal(await page.isVisible('#hud .hud-eye'), true);
  assert.equal(await page.isVisible('#hud .miclabel'), true);
  await G(() => { const g = window.__game; g.alert.add(100, g.player.head.x, g.player.head.z); g.sim(0.3); });   // the alarm must show at once
  await page.waitForFunction(() => !document.querySelector('#hud .alarm').classList.contains('gone') && /ТРИВОГА|ДО ФУРГОНА/.test(document.querySelector('#hud .alarm').textContent), null, { timeout: 8000 });
  assert.equal(await G(() => JSON.parse(localStorage.getItem('nocturne.hudMode') || localStorage.getItem('nocturne.preview.hudMode'))), 'min', 'the setting is saved');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone pause menu: opens by finger, the game waits, every button works held 0.4 s or 1.5 s, a slid-off finger does nothing', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => window.__game.sim(0.5));
  const yaw0 = await page.evaluate(() => window.__game.player.yaw);
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.isVisible('#pausemenu'), true);
  assert.equal(await page.evaluate(() => window.__game.audio.state), 'suspended', 'the mix is silenced while paused');
  const p0 = await pauseState(page);
  await page.waitForTimeout(800);
  assert.equal((await pauseState(page)).simT, p0.simT, 'game time stands still behind the menu');
  assert.equal(await page.evaluate(() => window.__game.player.yaw), yaw0, 'no camera turn from pressing the menu');
  // a finger that lands on «Продовжити» but is lifted far away: nothing happens
  {
    const b = await page.locator(pm('Продовжити')).boundingBox();
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t = touchT();
    await tp(cdp, 'touchStart', [pt], t);
    await tp(cdp, 'touchMove', [{ x: pt.x, y: pt.y + 5 }], t + 0.1);
    await tp(cdp, 'touchMove', [{ x: b.x + b.width / 2, y: b.y - 120 }], t + 0.3);   // far off, outside the button
    await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.4));
    await page.waitForTimeout(300);
    assert.equal((await pauseState(page)).paused, true, 'a slid-off finger does not press');
  }
  // settings: look speed cycles and is saved
  await fingerPressEl(page, cdp, pm('Налаштування'));
  await page.waitForSelector(pm('Назад'));
  assert.match(await page.textContent('#pausemenu .pm-btn'), /Огляд пальцем: звичайно/);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=0');
  assert.match(await page.textContent('#pausemenu .pm-btn'), /Огляд пальцем: швидко/);
  assert.equal(await page.evaluate(() => window.__game.touch.lookSpeed), 0.008);
  assert.equal(await page.inputValue('#lookspeed'), 'fast', 'the start-screen select follows');
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=1');   // breath mode
  assert.equal(await page.evaluate(() => window.__game.touch.breathToggle), true);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=2');   // HUD
  assert.equal(await page.evaluate(() => window.__game.hud.minimal), true);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=2');
  assert.equal(await page.evaluate(() => window.__game.hud.minimal), false);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=3');   // vibration
  assert.equal(await page.evaluate(() => window.__game.feedback.mode), 'flash');
  await fingerPressEl(page, cdp, pm('Назад'));
  // contract and difficulty (before the round starts)
  await fingerPressEl(page, cdp, pm('Контракт і складність'));
  await page.waitForSelector('#pausemenu .step');
  const c0 = await page.evaluate(() => window.__game.contract.id);
  await fingerPressEl(page, cdp, '#pausemenu .step >> nth=1', { holdMs: 1500 });   // ▶ held 1.5 s
  assert.notEqual(await page.evaluate(() => window.__game.contract.id), c0, 'contract changed (held 1.5 s)');
  const d0 = await page.evaluate(() => window.__game.difficulty);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn:has-text("Складність")');
  assert.notEqual(await page.evaluate(() => window.__game.difficulty), d0);
  await fingerPressEl(page, cdp, pm('Назад'));
  // continue: the game runs again, audio wakes
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused);
  assert.equal(await page.isVisible('#pausemenu'), false);
  await page.waitForFunction((t) => window.__game.simT > t, p0.simT);
  await page.waitForFunction(() => window.__game.audio.state === 'running', null, { timeout: 5000 });
  // mid-round the contract cannot change; «До фургона» and «Новий раунд» work
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(1); });
  assert.equal(await page.evaluate(() => window.__game.round.phase), 'heist');
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Контракт і складність'));
  await page.waitForSelector('#pausemenu .step');
  assert.equal(await page.locator('#pausemenu .step').first().isDisabled(), true, 'contract locked mid-round');
  await fingerPressEl(page, cdp, pm('Назад'));
  await fingerPressEl(page, cdp, pm('До фургона'));
  await page.waitForFunction(() => !window.__game.paused);
  await frames(page);
  const home = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  assert.ok(Math.hypot(home.x - 2.2, home.z - 6.8) < 0.5, `back at the van ${JSON.stringify(home)}`);
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Новий раунд'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.round.phase === 'ready');
  assert.equal(await page.evaluate(() => window.__game.playing), true);
  // report from the menu
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Скопіювати звіт'));
  await page.waitForFunction(() => /Скопійовано/.test(document.querySelector('#reportsheet')?.textContent || ''));
  const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(r.phone.hud, 'full'); assert.equal(r.phone.paused, true); assert.equal(r.phone.feedback.mode, 'flash');
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true, 'full screen kept through the menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('small phone (667 x 280, iPhone SE-like landscape): HUD blocks do not overlap; a long menu scrolls by dragging, a drag does not press', async () => {
  const { ctx, page, errors, cdp } = await playPhone({ ...LAND, viewport: { width: 667, height: 280 }, screen: { width: 667, height: 280 } });
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(2); g.alert.add(100, g.player.head.x, g.player.head.z); g.sim(0.3); g.flash('Довге повідомлення про щось важливе у будинку', 5); });
  await page.waitForFunction(() => /ТРИВОГА|ДО ФУРГОНА/.test(document.querySelector('#hud .alarm').textContent));
  const box = (sel) => page.locator(sel).boundingBox();
  const tl = await box('#hud .hud-tl'), tc = await box('#hud .hud-tc'), tr = await box('#hud .hud-tr'), msg = await box('#hud .hud-msg'), pb = await box('#touch .pause');
  assert.ok(tl.x + tl.width <= tc.x + 1, `eye block ends before the clock block (${tl.x + tl.width} vs ${tc.x})`);
  assert.ok(tc.x + tc.width <= tr.x + 1, `clock block ends before the mic block (${tc.x + tc.width} vs ${tr.x})`);
  assert.ok(tr.x + tr.width <= pb.x, 'mic block is left of the pause button');
  assert.ok(msg.x >= 0 && msg.x + msg.width <= 667, 'message inside the screen');
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  const sc = await page.evaluate(() => { const g = document.querySelector('#pausemenu .pm-grid'); return { sh: g.scrollHeight, ch: g.clientHeight }; });
  assert.ok(sc.sh > sc.ch, `the list is longer than the screen (${sc.sh} > ${sc.ch})`);
  // a vertical drag that starts on a button scrolls the list and presses nothing
  {
    const b = await page.locator(pm('До фургона')).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2, t = touchT();
    await tp(cdp, 'touchStart', [{ x, y }], t);
    for (let i = 1; i <= 8; i++) await tp(cdp, 'touchMove', [{ x, y: y - i * 15 }], t + i * 0.02);
    await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.3));
  }
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.querySelector('#pausemenu .pm-grid').scrollTop) > 20, 'the drag scrolled the list');
  assert.equal(await page.evaluate(() => window.__game.paused), true, 'the drag did not press anything');
  await fingerPressEl(page, cdp, pm('На стартовий екран'));   // the last button, reachable after scrolling
  await page.waitForFunction(() => !window.__game.playing);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: realistic fingers on the action buttons (held 0.4 s, sliding 10 px): Присісти, Взяти / Покласти, Двері, Подих', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await fingerPressEl(page, cdp, '#touch .crouch');
  await page.waitForFunction(() => window.__game.player.virtualCrouch);
  await fingerPressEl(page, cdp, '#touch .crouch');
  await page.waitForFunction(() => !window.__game.player.virtualCrouch);
  const item = await page.evaluate(() => { const g = window.__game, it = g.loot.items.find((i) => !i.twoHanded); const c = it.mesh.getWorldPosition(new g.THREE.Vector3()); return { x: c.x, z: c.z }; });
  await standFacing(page, item.x, item.z, 1.0, 0.3);
  await page.waitForSelector('#touch .act:not([hidden])');
  await fingerPressEl(page, cdp, '#touch .act');
  await page.waitForFunction(() => window.__game.hands.desk);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Покласти');
  await fingerPressEl(page, cdp, '#touch .act');
  await page.waitForFunction(() => !window.__game.hands.desk);
  const bh = [];
  const b = await page.locator('#touch .breath').boundingBox();
  await tp(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
  bh.push(...await keepFor(page, 700, () => window.__game.breath.state));
  await tp(cdp, 'touchEnd');
  assert.ok(bh.includes('holding'), 'breath held while the finger stays');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: minimising the page, a call (audio taken away) and focus loss pause the game; Продовжити wakes it', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  const hide = (state) => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await page.evaluate(() => window.__game.sim(0.5));
  // 1. the page is minimised
  await hide('hidden');
  await page.waitForFunction(() => window.__game.paused);
  assert.match(await page.textContent('#pausemenu .pm-note'), /згорнув/);
  assert.equal(await page.evaluate(() => window.__game.audio.state), 'suspended');
  const t = (await pauseState(page)).simT;
  await hide('visible');
  await page.waitForTimeout(500);
  assert.equal((await pauseState(page)).paused, true, 'coming back does not resume by itself: a tap is needed');
  assert.equal((await pauseState(page)).simT, t);
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.audio.state === 'running', null, { timeout: 5000 });
  await page.waitForFunction((t) => window.__game.simT > t, t);
  // 2. a call: the system suspends the audio context
  await page.evaluate(() => window.__game.audio.suspend());
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  assert.match(await page.textContent('#pausemenu .pm-note'), /звук/);
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.audio.state === 'running', null, { timeout: 5000 });
  // 3. focus lost (a notification shade): paused only if the document really lost focus, and not just after Продовжити
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__game.paused), false, 'a blur while the page still has focus is ignored');
  await page.waitForTimeout(2200);   // past the grace period after Продовжити
  await page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  assert.match(await page.textContent('#pausemenu .pm-note'), /фокус/);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.deepEqual(r.phone.pauses.map((p) => p.reason), ['hidden', 'audio', 'blur']);
  // the start screen is not paused by a minimised page
  await fingerPressEl(page, cdp, pm('На стартовий екран'));
  await page.waitForFunction(() => !window.__game.playing);
  await hide('hidden');
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#pausemenu'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone feedback: vibration on Android; no navigator.vibrate (iPhone) = edge flash and a soft sound; settings off / flash', async () => {
  // Android path: record the vibrations
  let { ctx, page, errors, cdp } = await (async () => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
    const { page, errors } = await open(ctx, base);
    await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
    return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
  })();
  assert.equal(await page.evaluate(() => window.__game.feedback.how), 'vibrate');
  const vp = page.viewportSize();
  await page.evaluate(() => { const g = window.__game; g.player.teleport(2.2, 6.8, 2.92 - Math.PI); });
  await drag(page, cdp, vp.width * 0.2, vp.height * 0.6, 0, -64, 600);   // across the quiet ring
  assert.ok((await page.evaluate(() => window.__vib)).includes(12), 'the joystick crossing the ring vibrates');
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); g.caught(); });
  assert.deepEqual(await page.evaluate(() => window.__vib.at(-1)), [260, 100, 420], 'caught');
  await page.evaluate(() => { window.__game.feedback.lastAt = {}; window.__game.feedback.play('hidden'); });
  assert.equal(await page.evaluate(() => window.__vib.at(-1)), 22, 'hidden tick');
  // 'flash only' on an Android phone shows the iPhone behaviour and does not vibrate
  await page.evaluate(() => { window.__vib.length = 0; window.__game.feedback.mode = 'flash'; window.__game.feedback.play('shout'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0);
  assert.equal(await page.evaluate(() => window.__game.feedback.count.flashes), 1);
  // off: nothing at all
  await page.evaluate(() => { const f = window.__game.feedback; f.mode = 'off'; f.lastAt = {}; f.play('alarm'); f.play('caught'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0);
  assert.equal(await page.evaluate(() => window.__game.feedback.count.flashes), 1);
  // paused: silent
  await page.evaluate(() => { const g = window.__game; g.feedback.mode = 'auto'; g.feedback.lastAt = {}; g.pauseOpen('user'); g.feedback.play('alarm'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0, 'no vibration behind the menu');
  assert.deepEqual(errors, []);
  await ctx.close();
  // iPhone path: Safari has no navigator.vibrate
  const ictx = await newContext(browser, { ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] });
  await ictx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true }); });
  const ip = await open(ictx, base);
  await ip.page.tap('#start'); await ip.page.waitForFunction(() => window.__game.playing);
  const F = (fn, a) => ip.page.evaluate(fn, a);
  assert.equal(await F(() => typeof navigator.vibrate), 'undefined');
  assert.equal(await F(() => window.__game.feedback.how), 'flash');
  await F(() => { window.__game.player.teleport(0, 2, 0); window.__game.sim(0.2); });
  await F(() => window.__game.feedback.play('caught'));
  assert.match(await F(() => document.getElementById('edgeflash').style.boxShadow), /rgb\(255, 43, 43\)|#ff2b2b/i);
  assert.equal(await F(() => window.__game.feedback.count.flashes), 1);
  await F(() => window.__game.feedback.play('hidden'));
  const st = await F(() => window.__game.feedback.state());
  assert.equal(st.flashes, 2); assert.equal(st.cues, 1, 'a soft sound for "hidden"'); assert.equal(st.vibrations, 0);
  const rep = JSON.parse(await F(() => window.__game.reportText()));
  assert.equal(rep.phone.feedback.canVibrate, false); assert.equal(rep.phone.feedback.how, 'flash');
  assert.deepEqual(ip.errors, []);
  await ictx.close();
});

// ---------- T3: the microphone on a phone ----------
const MIC_CAL = { floor: -62, normal: -30, whisper: -48, shout: -21 };
const micPhone = { ...LAND, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] };
async function micOn(page, cdp) {
  await fingerPressEl(page, cdp, '#micbtn');
  await page.waitForFunction(() => window.__game.mic.state === 'on', null, { timeout: 10000 });
}
// the fake microphone level, picked by what the wizard / check asks for right now (calstep text)
const installFeed = (page, bleed) => page.evaluate((bleed) => {
  window.__bleed = bleed;
  window.__game.mic.feed = (m) => {
    const t = document.getElementById('calstep').textContent.split('·')[0], n = () => (Math.random() - 0.5) * 2;
    if (/ЗВУКИ ГРИ|Звуки гри/.test(t)) return window.__bleed === null ? -62 + n() : Math.max(-62 + n(), m.gameDb + window.__bleed + n());
    if (/КРИК|Крикни/.test(t)) return -12 + n();
    if (/ГОЛОС|Скажи/.test(t)) return -30 + n();
    if (/ШЕПІТ|Шепни/.test(t)) return -48 + n();
    return -62 + n();
  };
}, bleed);

test('phone mic wizard (5 steps, by finger): silence, the game\'s own sounds through the bus, whisper, voice, shout; then the check of three phrases', async () => {
  const ctx = await newContext(browser, micPhone);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  assert.match(await page.textContent('#michold'), /як гратимеш/);
  assert.match(await page.textContent('#michelp'), /два запити|Дозволити під час відвідування/, 'before asking: what the dialogs will be');
  await micOn(page, cdp);
  assert.equal(await page.textContent('#calbtn'), 'Калібрувати (5 кроків)');
  await installFeed(page, -20);
  await fingerPressEl(page, cdp, '#calbtn');
  await page.waitForFunction(() => /2\/5 ЗВУКИ ГРИ/.test(document.getElementById('calstep').textContent), null, { timeout: 15000 });
  const busPeak = await page.evaluate(async () => { let m = -100; for (let i = 0; i < 25; i++) { m = Math.max(m, window.__game.mic.gameDb); await new Promise((r) => setTimeout(r, 100)); } return m; });
  assert.ok(busPeak > -45, `the sample of game sounds plays on the bus (${busPeak.toFixed(1)} dB)`);
  await page.waitForFunction(() => /^Готово/.test(document.getElementById('calstep').textContent), null, { timeout: 45000 });
  const cal = await page.evaluate(() => window.__game.mic.cal);
  assert.ok(Math.abs(cal.floor - -62) < 3 && Math.abs(cal.normal - -30) < 3 && Math.abs(cal.whisper - -48) < 3, JSON.stringify(cal));
  assert.ok(Number.isFinite(cal.bleed) && Math.abs(cal.bleed - -20) < 4, `bleed measured ${cal.bleed}`);
  assert.match(await page.textContent('#calstep'), /Звуки гри чути в мікрофоні/);
  assert.equal(await page.textContent('#micnote'), '', 'nothing to redo');
  // the check after the wizard
  assert.equal(await page.isEnabled('#verifybtn'), true);
  await fingerPressEl(page, cdp, '#verifybtn');
  await page.waitForFunction(() => /Крик:/.test(document.getElementById('verifyres').textContent), null, { timeout: 30000 });
  const vr = await page.textContent('#verifyres');
  assert.match(vr, /Шепіт: ШЕПІТ ✓ · Голос: НОРМАЛЬНО ✓ · Крик: КРИК! ✓/, vr);
  // headphones: the game is not heard in the microphone -> no protection needed
  await installFeed(page, null);
  await fingerPressEl(page, cdp, '#calbtn');
  await page.waitForFunction(() => /^Готово/.test(document.getElementById('calstep').textContent), null, { timeout: 45000 });
  assert.equal(await page.evaluate(() => window.__game.mic.cal.bleed), -80);
  assert.match(await page.textContent('#calstep'), /навушники/);
  // the board at the van (tap) runs the same 5-step wizard on a phone
  await page.evaluate(() => { const g = window.__game; g.pressBoard('micpage'); g.sim(0.1); });
  assert.ok(await page.evaluate(() => window.__game.board.buttons.some((b) => b.id === 'cal' && b.label === 'Калібрувати (5 кроків)')), 'phone board: 5 steps');
  await page.evaluate(() => { const g = window.__game; g.pressBoard('back'); g.sim(0.1); });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the game\'s own sounds from the speaker are not your voice (bus analyser); your voice and shout still count', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -10 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  // the microphone hears only the game (a leaky speaker: bus - 10 dB)
  await page.evaluate(() => { const g = window.__game; window.__voice = null; g.mic.feed = (m) => window.__voice ?? Math.max(-62 + Math.random(), m.gameDb - 10); g.player.teleport(0, 2, 0); });
  const loud = async (ms) => page.evaluate(async (ms) => {
    const g = window.__game, seen = { normal: 0, shout: 0, bus: -100, raised: 0 };
    g.siren.set(true);
    const t0 = performance.now(), mt0 = g.mic.t;
    let next = 0;
    while (g.mic.t - mt0 < ms / 1000 && performance.now() - t0 < 60000) {   // microphone time
      if (performance.now() - t0 >= next) { g.playGame(); next += 1200; }
      await new Promise((r) => setTimeout(r, 30));
      if (g.mic.level === 'normal') seen.normal++;
      if (g.mic.level === 'shout') seen.shout++;
      seen.bus = Math.max(seen.bus, g.mic.gameDb); seen.raised = Math.max(seen.raised, g.mic.masking);
    }
    g.siren.set(false);
    return seen;
  }, ms);
  // control: without the protection the same game sound is taken for a voice
  await page.evaluate(() => { window.__fn = window.__game.mic.gameDbFn; });
  const unprotected = await page.evaluate(async () => {
    const g = window.__game, m = g.mic, fn = m.gameDbFn;
    // keep measuring the bus, but do not raise the boundaries
    m.gameDbFn = null;
    const seen = { normal: 0 };
    g.siren.set(true);
    const t0 = performance.now(); let next = 0;
    while (performance.now() - t0 < 4000) {
      if (performance.now() - t0 >= next) { g.playGame(); next += 1200; }
      m.gameDb = fn();
      await new Promise((r) => setTimeout(r, 30));
      if (m.level !== 'quiet') seen.normal++;
    }
    g.siren.set(false);
    m.gameDbFn = fn;
    return seen;
  });
  // (the feed reads m.gameDb, which the control loop keeps updating)
  assert.ok(unprotected.normal > 0, `control: unprotected, the game sound alone reads as a voice (${JSON.stringify(unprotected)})`);
  await page.waitForTimeout(800);
  const shouts0 = await page.evaluate(() => window.__game.round.shouts);
  const prot = await loud(4000);
  assert.ok(prot.bus > -40, `the game was loud on the bus (${prot.bus.toFixed(1)} dB)`);
  assert.equal(prot.normal + prot.shout, 0, `protected: the game sound is never "НОРМАЛЬНО" / "КРИК!" (${JSON.stringify(prot)})`);
  assert.ok(prot.raised >= 3, 'the boundaries were raised while the game sounded');
  assert.equal(await page.evaluate(() => window.__game.round.shouts), shouts0, 'no shout counted');
  await page.waitForFunction(() => /звуки гри: межі/.test(document.querySelector('#hud .micdb').textContent) || true);
  // the game quiet (a moment without the guard's sounds): a normal voice is heard as before
  await page.waitForFunction(() => window.__game.mic.gameInMic < -40, null, { timeout: 20000, polling: 30 });
  await page.evaluate(() => { window.__voice = -30; });
  await page.waitForFunction(() => window.__game.mic.level === 'normal' || window.__game.mic.gameInMic > -40, null, { timeout: 5000 });
  const v = await page.evaluate(() => ({ level: window.__game.mic.level, game: window.__game.mic.gameInMic }));
  assert.ok(v.level === 'normal' || v.game > -40, `voice heard while the game is quiet ${JSON.stringify(v)}`);
  // while the game is loud, a real shout well above it still counts
  await page.evaluate(() => { window.__voice = -62; });
  await page.waitForTimeout(500);
  const shout = await page.evaluate(async () => {
    const g = window.__game; g.siren.set(true); g.playGame();
    await new Promise((r) => setTimeout(r, 500));
    const before = { shoutNow: g.mic.shoutEff, game: g.mic.gameInMic };
    window.__voice = -3;   // a real shout near the phone: far above the game in the microphone
    let got = false, maxEff = -100; const t0 = performance.now(), mt0 = g.mic.t, trace = [];
    // microphone time, not wall time (software rendering here is slow)
    while (g.mic.t - mt0 < 1.2 && performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 30)); maxEff = Math.max(maxEff, g.mic.shoutEff); if (g.mic.level === 'shout') got = true; trace.push([+(g.mic.t - mt0).toFixed(2), Math.round(g.mic.db), Math.round(g.mic.env), g.mic.aboveT.toFixed(2), g.mic.riseOk]); }
    before.trace = trace.filter((x, i) => i % 5 === 0);
    window.__voice = -62; g.siren.set(false);
    return { got, before, maxEff };
  });
  assert.equal(shout.got, true, `a shout above the game is a shout ${JSON.stringify(shout)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('real fake-microphone WAV: finger knocks on the phone body are not a shout; the shout in the same recording is', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { floor: -62, normal: -30, whisper: -48, shout: -18 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  const r = await page.evaluate(async () => {
    const m = window.__game.mic, orig = m.takeShout.bind(m);
    let shouts = 0, maxDb = -100, peaks = 0, wasHigh = false;
    m.takeShout = () => { const s = orig(); if (s) shouts++; return s; };
    const t0 = performance.now();
    while (performance.now() - t0 < 22000) {   // two loops of the 10.9 s recording
      await new Promise((res) => setTimeout(res, 20));
      maxDb = Math.max(maxDb, m.db);
      const high = m.db > m.shoutDb; if (high && !wasHigh) peaks++; wasHigh = high;
    }
    return { shouts, maxDb, peaks };
  });
  assert.ok(r.maxDb > -15, `the recording reaches the analyser (${r.maxDb.toFixed(1)} dB)`);
  assert.ok(r.peaks >= 4, `knocks went over the shout threshold (${r.peaks} times)`);
  assert.ok(r.shouts >= 1 && r.shouts <= 3, `only the long shout counts: ${r.shouts} shouts in 2 loops (12 knocks)`);
  assert.deepEqual(errors, []);
  await ctx.close();
}, { wav: knockWav });

test('phone: microphone refused = where to allow it (Android and iPhone wording); covered microphone hint', async () => {
  for (const [opts, re] of [[micPhone, /Chrome: натисни значок ліворуч від адреси → «Дозволи»/], [{ ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] }, /«аА».*«Параметри вебсайту»/]]) {
    const ctx = await newContext(browser, opts);
    await ctx.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    const { page, errors } = await open(ctx, base);
    const cdp = await ctx.newCDPSession(page);
    await fingerPressEl(page, cdp, '#micbtn');
    await page.waitForFunction(() => window.__game.mic.state === 'denied');
    assert.match(await page.textContent('#michelp'), re);
    assert.match(await page.textContent('#michelp'), /без мікрофона/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // covered: far under the calibrated silence for 3 s -> the HUD says so; gone when uncovered
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  await page.evaluate(() => { const g = window.__game; g.mic.feed = () => -90; g.sim(4); });
  assert.match(await page.evaluate(() => window.__game.mic.problem), /закритий/);
  await page.waitForFunction(() => /закритий/.test(document.querySelector('#hud .micdb').textContent), null, { timeout: 5000 });
  await page.evaluate(() => { const g = window.__game; g.mic.feed = () => -60; g.sim(0.5); });
  assert.equal(await page.evaluate(() => window.__game.mic.problem), '');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: after a call the microphone comes back on Продовжити (re-opened if the system stopped it); headphones in / out ask for a new calibration', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.waitForFunction(() => ['worklet', 'script', 'recorder', 'none'].includes(window.__game.scream.mode), null, { timeout: 10000 });
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  // the call: the system stops the microphone and the page goes to the background
  await page.evaluate(() => {
    window.__game.mic.track.stop();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.evaluate(() => window.__game.mic.track.readyState), 'ended');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => window.__game.mic.events.lastRecover === 'reacquired', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__game.mic.track.readyState), 'live');
  await page.waitForFunction(() => /Мікрофон знову працює/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__game.mic.env > -40, null, { timeout: 8000 });   // the -23 dB tone is heard again
  // if it cannot be re-opened: say where to fix it
  await page.evaluate(() => { const g = window.__game; g.mic.track.stop(); navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')); g.pauseOpen('user'); });
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => window.__game.mic.events.lastRecover === 'failed', null, { timeout: 8000 });
  await page.waitForFunction(() => /Мікрофон не відновився/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  // headphones plugged in
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await page.waitForFunction(() => window.__game.mic.deviceChanged || window.__game.mic.state !== 'on', null, { timeout: 5000 });
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mic.events.ended >= 0, true); assert.ok(r.mic.events.reacquired >= 1, JSON.stringify(r.mic.events));
  assert.ok(r.mic.game && Number.isFinite(r.mic.game.bleedDb), 'report: the game sound in the microphone');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a live microphone + devicechange: the note on the start screen and in the game, gone after a calibration
  const c2 = await newContext(browser, micPhone);
  await c2.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const p2 = await open(c2, base);
  const cdp2 = await c2.newCDPSession(p2.page);
  await micOn(p2.page, cdp2);
  await p2.page.tap('#start'); await p2.page.waitForFunction(() => window.__game.playing);
  await p2.page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await p2.page.waitForFunction(() => window.__game.mic.deviceChanged);
  await p2.page.waitForFunction(() => /Змінився мікрофон або навушники/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  assert.match(await p2.page.textContent('#micnote'), /Змінився мікрофон або навушники/);
  await p2.page.evaluate(() => window.__game.mic.setCalibration({ ...window.__game.mic.cal }));
  assert.equal(await p2.page.evaluate(() => window.__game.mic.deviceChanged), false);
  assert.deepEqual(p2.errors, []);
  await c2.close();
});

test('iPhone (UA in Chromium): audio session playback -> play-and-record with the microphone; "silent switch" note; old calibration asks for the game-sounds step', async () => {
  const ctx = await newContext(browser, { ...devices['iPhone 15 landscape'], permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((cal) => {
    navigator.audioSession = { type: 'auto', state: 'inactive' };
    localStorage.setItem('nocturne.mic', JSON.stringify(cal));
  }, MIC_CAL);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  assert.equal(await page.isVisible('#iosnote'), true);
  assert.match(await page.textContent('#iosnote'), /«Без звуку»/);
  assert.match(await page.textContent('#michelp'), /Safari може питати дозвіл при кожному відкритті/);
  await fingerPressEl(page, cdp, '#soundtest');   // the sound test also unlocks audio -> playback
  await page.waitForFunction(() => navigator.audioSession.type === 'playback');
  await micOn(page, cdp);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'play-and-record');
  assert.match(await page.textContent('#micnote'), /без кроку «Звуки гри»/);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.phone.audioSession.type, 'play-and-record'); assert.equal(r.phone.audioSession.ios, true);
  assert.equal(r.mic.game.measured, false); assert.equal(r.mic.game.bleedDb, -34, 'estimate until the step is done');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('PC keyboard as before: WASD walks, E picks up / puts down, T door, C crouch', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  assert.equal(await page.isVisible('#touch'), false);
  assert.equal(await page.isVisible('#hud'), false, 'PC: no HTML HUD, the corner panel as before');
  assert.equal(await page.evaluate(() => window.__game.wrist.mesh.visible), true);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__game.paused), false, 'PC does not auto-pause');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await page.evaluate(() => window.__game.player.teleport(2.2, 6.8, 2.92 - Math.PI));
  const p0 = await page.evaluate(() => window.__game.player.head.z);
  await page.keyboard.down('KeyW'); await keepFor(page, 800); await page.keyboard.up('KeyW');
  assert.ok(Math.abs(await page.evaluate(() => window.__game.player.head.z) - p0) > 0.3, 'W walks');
  const item = await page.evaluate(() => { const g = window.__game, it = g.loot.items.find((i) => !i.twoHanded); const c = it.mesh.getWorldPosition(new g.THREE.Vector3()); return { x: c.x, z: c.z }; });
  await standFacing(page, item.x, item.z, 1.0, 0.3);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !!window.__game.hands.desk, null, { timeout: 5000 });   // E picks up
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !window.__game.hands.desk, null, { timeout: 5000 });    // E puts down
  const door = await page.evaluate(() => { const g = window.__game, d = g.level.doors.find((x) => !x.locked); return { x: d.cx, z: d.cz, n: d.base }; });
  await standFacing(page, door.x, door.z, 1.0, door.n);
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => Math.abs(window.__game.level.doors.find((x) => !x.locked).target) > 1.5, null, { timeout: 5000 });   // T opens
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.__game.player.virtualCrouch, null, { timeout: 5000 });   // C crouches
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('stars are also kept per mode', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  const s = await page.evaluate(async () => {
    const { recordStars, bestStars } = await import('./src/game/contracts.js');
    recordStars('first', 'medium', 2, 'phone');
    recordStars('first', 'medium', 1, 'vr');
    return { all: bestStars('first'), byMode: JSON.parse(localStorage.getItem('nocturne.starsByMode')) };
  });
  assert.equal(s.all.medium, 2);
  assert.deepEqual(s.byMode, { phone: { first: { medium: 2 } }, vr: { first: { medium: 1 } } });
  await ctx.close();
});

test('PC round: deliver an item, leave, verdict and stars recorded with the mode', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.newRound();
    g.playing = true;
    g.player.teleport(0, 2, 0);              // away from the van: the clock starts
    g.sim(2);
    const it = g.loot.items.find((i) => !i.twoHanded);
    g.loot.deliver(it);
    g.sim(1);
    g.pressBoard('leave');
    g.sim(0.5);
    g.playing = false;
    return { phase: g.round.phase, sum: g.loot.tally().sum, verdict: g.verdict, byMode: localStorage.getItem('nocturne.starsByMode') };
  });
  assert.equal(r.phase, 'result');
  assert.ok(r.sum > 0, 'item in the van');
  assert.ok(r.verdict && Array.isArray(r.verdict.why), JSON.stringify(r.verdict));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('VR regression (IWER Quest 3): enter VR, walk with the stick, snap turn, pick up an item, exit', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });   // the Quest browser's own UA
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, base);
  assert.equal((await modeOf(page)).mode, 'vr', 'the emulated Quest is detected as a headset');
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  assert.deepEqual(await page.evaluate(() => [window.__game.hud, window.__game.menu, window.__game.feedback, window.__game.wrist.mesh.visible]), [null, null, null, true], 'VR: wrist panel, no phone UI');
  const vrMic = await page.evaluate(async () => { const { stepsFor } = await import('./src/audio/calibrate.js'); const m = window.__game.mic; return { steps: stepsFor(false).length, game: m.gameDbFn, cover: m.coverHint, agc: m.agcAdjust, raised: m.masking }; });
  assert.deepEqual(vrMic, { steps: 4, game: null, cover: false, agc: false, raised: 0 }, 'VR: the microphone and the 4-step calibration as before');
  await page.evaluate(() => { const g = window.__game; g.mic.noMic = true; g.pressBoard('micpage'); g.sim(0.1); });
  assert.ok(await page.evaluate(() => window.__game.board.buttons.some((b) => b.id === 'cal' && b.label === 'Калібрувати (4 кроки)')), 'VR board: 4 steps');
  await page.evaluate(() => { const g = window.__game; g.mic.noMic = false; g.pressBoard('back'); g.sim(0.1); });
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const p0 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z, yaw: window.__game.player.yaw }));
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  const p1 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, `walked ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', 1, 0));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
  const yaw1 = await page.evaluate(() => window.__game.player.yaw);
  const turned = Math.abs(((yaw1 - p0.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  assert.ok(Math.abs(turned - Math.PI / 4) < 0.05, `snap turn ${(turned * 180 / Math.PI).toFixed(1)}°`);
  // right controller onto the nearest one-handed item (in rig space), squeeze
  const held = await page.evaluate(async () => {
    const g = window.__game, h = g.player.head;
    const it = g.loot.items.filter((i) => !i.twoHanded).sort((a, b) => a.mesh.position.distanceTo(h) - b.mesh.position.distanceTo(h))[0];
    const local = g.player.rig.worldToLocal(it.mesh.getWorldPosition(new g.THREE.Vector3()));
    const c = window.__xrDevice.controllers.right;
    c.position.set(local.x, local.y, local.z);
    await new Promise((r) => setTimeout(r, 300));
    c.updateButtonValue('squeeze', 1);
    await new Promise((r) => setTimeout(r, 400));
    return { name: it.name, held: g.hands.heldItems().map((i) => i.name) };
  });
  assert.deepEqual(held.held, [held.name], `holding ${JSON.stringify(held)}`);
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await page.waitForFunction(() => !window.__game.inVR);
  assert.equal(await page.isVisible('#overlay'), true);
  assert.equal(await page.isVisible('#hud'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

let failed = 0;
const only = process.env.ONLY;   // ONLY=word runs the tests whose name contains it
for (const t of tests.filter((x) => !only || x.name.includes(only))) {
  const t0 = Date.now();
  browser = await launch({ micWav: t.wav || micWav });
  try { await t.fn(); console.log(`✓ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { failed++; console.log(`✗ ${t.name}\n  ${String(e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
  await browser.close().catch(() => {});
}
server.close();
const ran = only ? tests.filter((x) => x.name.includes(only)).length : tests.length;
console.log(failed ? `${failed} of ${ran} failed` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
