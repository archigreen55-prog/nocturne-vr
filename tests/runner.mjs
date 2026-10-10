// Shared test runner: the static server, a fresh Chromium per test, test(), the helpers (fingers,
// the phone start, the fake microphone, a copy of the site), and the run loop. The tests live in
// tests/<topic>.test.mjs (found by tests/run.mjs); each imports what it needs from here.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm, writeFile as writeFileFs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { devices } from 'playwright';
import { startServer, launch, newContext, watchErrors, toneWav, segmentsWav, ROOT } from './harness.mjs';

export const VERSION = JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8')).version;
export const { server, base } = await startServer();
export const preview = base + 'preview/test/';
// a fresh Chromium per test: one browser for the whole run ran out of resources (WebGL + audio per page)
export const micWav = await toneWav(0.1);
// 3 s silence, 6 finger knocks on the body (80 ms, loud), 1 s silence, a 1.5 s shout, 1.5 s silence (loops)
export const knockWav = await segmentsWav('knocks', [{ secs: 3, kind: 'noise', amp: 0.0008 },
  ...Array.from({ length: 6 }, () => [{ secs: 0.08, kind: 'noise', amp: 0.5 }, { secs: 0.32, kind: 'noise', amp: 0.0008 }]).flat(),
  { secs: 1, kind: 'noise', amp: 0.0008 }, { secs: 1.5, kind: 'tone', amp: 0.35 }, { secs: 1.5, kind: 'noise', amp: 0.0008 }]);
export let browser = null;

export const UA = {
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
export const phoneCtx = (ua, extra = {}) => ({ ...devices['Pixel 7'], userAgent: ua, permissions: ['clipboard-read', 'clipboard-write'], ...extra });

export async function open(ctx, url) {
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
  return { page, errors };
}
export const modeOf = (page) => page.evaluate(() => ({ ...window.__game.MODE }));

const tests = [];
export const test = (name, fn, opts = {}) => tests.push({ name, fn, ...opts });

// ---------- T1: phone controls (Chromium with touch emulation; real Safari is tested by hand) ----------
export const LAND = { ...devices['Pixel 7 landscape'], permissions: ['clipboard-read', 'clipboard-write'] };
export const tp = (cdp, type, pts = [], timestamp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })), ...(timestamp ? { timestamp } : {}) });
// a quick tap with explicit event times (80 ms): here a busy page delays the second event by 300+ ms,
// which would make the tap look like a hold; on a phone the system stamps the real times
// explicit event times must keep increasing: the browser drops a touch event older than the last one
export let lastTouchT = 0;
export const touchT = () => (lastTouchT = Math.max(Date.now() / 1000, lastTouchT + 0.05));
// tests set the time of their last touch through this (an imported binding cannot be assigned)
export const touchEndAt = (t) => (lastTouchT = t);
export async function quickTap(cdp, pt) { const t = touchT(); await tp(cdp, 'touchStart', [pt], t); await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.08)); }
// Software rendering here is slow (a few frames per second inside the house): wait for game time,
// not wall time. `ms` below is game time.
export const simT = (page) => page.evaluate(() => window.__game.simT);
export async function keepFor(page, ms, sample) {
  const t0 = await simT(page), out = [];
  while (await simT(page) - t0 < ms / 1000) { await page.waitForTimeout(60); if (sample) out.push(await page.evaluate(sample)); }
  return out;
}
export const frames = async (page, n = 3) => { const t0 = await simT(page); await page.waitForFunction(([t0, n]) => window.__game.simT > t0 + n / 200, [t0, n], { polling: 30 }); };
export async function drag(page, cdp, x0, y0, dx, dy, holdMs, sample) {
  await tp(cdp, 'touchStart', [{ x: x0, y: y0 }]);
  for (let i = 1; i <= 8; i++) await tp(cdp, 'touchMove', [{ x: x0 + dx * i / 8, y: y0 + dy * i / 8 }]);
  const out = await keepFor(page, holdMs, sample);
  await tp(cdp, 'touchEnd');
  await frames(page);
  return out;
}
export async function hold(page, cdp, sel, ms, sample) {
  const b = await page.locator(sel).boundingBox();
  await tp(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
  const out = await keepFor(page, ms, sample);
  await tp(cdp, 'touchEnd');
  await frames(page);
  return out;
}
export async function playPhone(ctxOpts = LAND) {
  const ctx = await newContext(browser, ctxOpts);
  const { page, errors } = await open(ctx, base);
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
}
// stand `dist` m from (x, z), facing it
export const standFacing = (page, x, z, dist, fromYaw) => page.evaluate(([x, z, dist, fromYaw]) => {
  const g = window.__game, px = x + Math.sin(fromYaw) * dist, pz = z + Math.cos(fromYaw) * dist;
  g.player.teleport(px, pz, fromYaw); g.sim(0.05);
}, [x, z, dist, fromYaw]);
// screen point of a board button (the board as drawn now)
export const boardPoint = (page, id) => page.evaluate((id) => {
  const g = window.__game, b = g.board.buttons.find((x) => x.id === id), m = g.board.mesh, P = m.geometry.parameters;
  if (!b) return null;
  g.camera.updateMatrixWorld(true); g.camera.matrixWorldInverse.copy(g.camera.matrixWorld).invert();   // as the game's own hit test sees it
  const v = m.localToWorld(new g.THREE.Vector3(((b.x + b.w / 2) / 1024 - 0.5) * P.width, (0.5 - (b.y + b.h / 2) / 640) * P.height, 0)).project(g.camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, id);
// a real finger: held 0.4 s and sliding 10 px while pressing (the old tap rule rejected such presses)
export async function fingerPress(page, cdp, pt) {
  const t = touchT();
  await tp(cdp, 'touchStart', [pt], t);
  await tp(cdp, 'touchMove', [{ x: pt.x + 6, y: pt.y + 4 }], t + 0.15);
  await tp(cdp, 'touchMove', [{ x: pt.x + 10, y: pt.y + 4 }], t + 0.3);
  await tp(cdp, 'touchEnd', [], (lastTouchT = t + 0.4));
}
export const toResult = (page) => page.waitForFunction(() => window.__game.round.phase === 'result' && window.__game.board.floating, null, { polling: 50, timeout: 20000 });
// a real finger on an HTML button (menu, summary, pause): really held (400 ms by default) and sliding 10 px
export async function fingerPressEl(page, cdp, sel, { holdMs = 400, slide = 10 } = {}) {
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
export const pm = (text) => `#pausemenu .pm-btn:text-is("${text}")`;
export const toSummary = (page) => page.waitForFunction(() => window.__game.summary && window.__game.summary.isOpen, null, { polling: 50, timeout: 20000 });
export const pauseState = (page) => page.evaluate(() => ({ paused: window.__game.paused, menu: window.__game.menu.isOpen, simT: window.__game.simT }));
// ---------- T3: the microphone on a phone ----------
export const MIC_CAL = { floor: -62, normal: -30, whisper: -48, shout: -21 };
export const micPhone = { ...LAND, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] };
export async function micOn(page, cdp) {
  await fingerPressEl(page, cdp, '#micbtn');
  await page.waitForFunction(() => window.__game.mic.state === 'on', null, { timeout: 10000 });
}
// the fake microphone level, picked by what the wizard / check asks for right now (calstep text)
export const installFeed = (page, bleed) => page.evaluate((bleed) => {
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
// ---------- T4: board by the crosshair, performance, gyroscope, home-screen app ----------
// look at a board button: yaw / pitch from the head to the button's centre
export const aimAt = (page, id) => page.evaluate((id) => {
  const g = window.__game, b = g.board.buttons.find((x) => x.id === id), m = g.board.mesh, P = m.geometry.parameters;
  const w = m.localToWorld(new g.THREE.Vector3(((b.x + b.w / 2) / 1024 - 0.5) * P.width, (0.5 - (b.y + b.h / 2) / 640) * P.height, 0));
  const h = g.player.head, dx = w.x - h.x, dy = w.y - h.y, dz = w.z - h.z;
  g.player.lookYaw = Math.atan2(-dx, -dz); g.player.lookPitch = Math.atan2(dy, Math.hypot(dx, dz));
}, id);
// A copy of the site in a temp folder, its own server: the service-worker tests change the version there.
export async function siteCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'nocturne-site-'));
  for (const f of ['index.html', 'privacy.html', 'version.json', 'sw.js', 'manifest.webmanifest', 'src', 'vendor', 'icons', 'fonts', 'tools']) await cp(join(ROOT, f), join(dir, f), { recursive: true });
  const srv = await startServer(dir);
  return { dir, ...srv, bump: (v) => execFileSync('node', [join(dir, 'tools/bump-version.mjs'), v]), close: async () => { srv.server.close(); await rm(dir, { recursive: true, force: true }); } };
}
// the worker installed and active, then a page load it controls (a load that began while it was still
// installing stays uncontrolled: that is how service workers work)
export async function swReady(page) {
  // (waitForFunction does not wait for a promise: a page-side wait instead)
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (r.active.state !== 'activated') await new Promise((res) => r.active.addEventListener('statechange', () => { if (r.active.state === 'activated') res(); }));
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.__game, null, { timeout: 30000, polling: 200 });
}

// After a new deploy: the page's service worker becomes that version. The browser finds the new worker
// on its own after a navigation (this also asks it to: registration.update()), installs it and, as sw.js
// calls skipWaiting(), activates it. Polled from here in short calls: a long-running script in the page
// (one evaluate that waits inside the page) holds the new worker in "waiting" for as long as it runs
// (seen: 2 minutes), which is what made the old in-page wait time out under load. The version is asked
// only once nothing is waiting. Returns the version, or 'timeout <last states>'.
export async function swUpdatedTo(page, want, timeoutMs = 120000) {
  const until = Date.now() + timeoutMs, trace = [];
  for (let n = 0; Date.now() < until; n++) {
    const st = await page.evaluate(async ([want, poke]) => {
      const SW = navigator.serviceWorker, reg = await SW.getRegistration();
      const pending = !!(reg && (reg.installing || reg.waiting));
      if (!pending && poke && reg) { try { await reg.update(); } catch { /* offline: try again later */ } }
      let got = null;
      if (!pending && SW.controller) {
        got = await new Promise((res) => {
          const done = (v) => { SW.removeEventListener('message', on); clearTimeout(t); res(v); };
          const on = (e) => done(e.data && e.data.version);
          const t = setTimeout(() => done(null), 1000);
          SW.addEventListener('message', on);
          SW.controller.postMessage('version');
        });
      }
      return { got, installing: !!(reg && reg.installing), waiting: !!(reg && reg.waiting) };
    }, [want, n % 10 === 0]).catch((e) => ({ error: String(e.message || e).slice(0, 60) }));
    if (st.got === want) return want;
    trace.push(st); if (trace.length > 6) trace.shift();
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'timeout ' + JSON.stringify(trace);
}

// The run loop (tests/run.mjs): ONLY=word runs the tests whose name contains it.
export async function runAll() {
  let failed = 0;
  const only = process.env.ONLY;
  const chosen = tests.filter((x) => !only || x.name.includes(only));
  for (const t of chosen) {
    const t0 = Date.now();
    browser = await launch({ micWav: t.wav || micWav });
    try { await t.fn(); console.log(`✓ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
    catch (e) { failed++; console.log(`✗ ${t.name}\n  ${String(e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
    await browser.close().catch(() => {});
  }
  server.close();
  console.log(failed ? `${failed} of ${chosen.length} failed` : `all ${chosen.length} passed`);
  return failed;
}
export const testNames = () => tests.map((t) => t.name);
