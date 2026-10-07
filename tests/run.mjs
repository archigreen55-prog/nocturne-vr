// Cloud tests (no phone, no headset): mode detection, the report, boot failure messages, preview
// settings, the fake microphone, and a VR regression in the WebXR emulator (IWER, Quest 3).
//   npm install && npm test            (Chromium from Playwright; WebKit is not available here)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { devices } from 'playwright';
import { startServer, launch, newContext, watchErrors, toneWav, ROOT } from './harness.mjs';

const VERSION = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8')).version;
const { server, base } = await startServer();
const preview = base + 'preview/test/';
// a fresh Chromium per test: one browser for the whole run ran out of resources (WebGL + audio per page)
const micWav = await toneWav(0.1);
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
const test = (name, fn) => tests.push({ name, fn });

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
async function quickTap(cdp, pt) { const t = Date.now() / 1000; await tp(cdp, 'touchStart', [pt], t); await tp(cdp, 'touchEnd', [], t + 0.08); }
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
  await page.tap('#touch .pause');
  await page.waitForFunction(() => !window.__game.playing);
  assert.equal(await page.isVisible('#overlay'), true);
  assert.equal(await page.evaluate(() => window.__game.playing), false);
  assert.equal(await page.isVisible('#touch'), false);
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

test('phone: a tap on the board presses its button (contract ▶)', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.waitForTimeout(400);
  const pt = await page.evaluate(() => {
    const g = window.__game, b = g.board.buttons.find((x) => x.id === 'cnext'), m = g.board.mesh, P = m.geometry.parameters;
    const v = m.localToWorld(new g.THREE.Vector3(((b.x + b.w / 2) / 1024 - 0.5) * P.width, (0.5 - (b.y + b.h / 2) / 640) * P.height, 0)).project(g.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, before: g.contract.id };
  });
  await quickTap(cdp, pt);
  await page.waitForFunction((b) => window.__game.contract.id !== b, pt.before);
  assert.deepEqual(errors, []);
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

test('PC keyboard as before: WASD walks, E picks up / puts down, T door, C crouch', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  assert.equal(await page.isVisible('#touch'), false);
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
  assert.deepEqual(errors, []);
  await ctx.close();
});

let failed = 0;
const only = process.env.ONLY;   // ONLY=word runs the tests whose name contains it
for (const t of tests.filter((x) => !only || x.name.includes(only))) {
  const t0 = Date.now();
  browser = await launch({ micWav });
  try { await t.fn(); console.log(`✓ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { failed++; console.log(`✗ ${t.name}\n  ${String(e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
  await browser.close().catch(() => {});
}
server.close();
const ran = only ? tests.filter((x) => x.name.includes(only)).length : tests.length;
console.log(failed ? `${failed} of ${ran} failed` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
