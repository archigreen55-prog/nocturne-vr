// The start when a file of the game fails to load (plan 2026-11-17 «Гра не завантажилась», steps 2, 3):
// the service worker tries a failed request again, the page reloads itself once, and only a second
// failure shows «Гра не завантажилась» with «Спробувати ще», «Скинути кеш» and the report.
// The server breaks one module of the start (src/systems/state.js) on purpose.
import assert from 'node:assert/strict';
import { newContext, watchErrors, startServer } from './harness.mjs';
import { VERSION, browser, test, LAND, siteCopy, swReady, swUpdatedTo } from './runner.mjs';

const MOD = 'src/systems/state.js';
const up = (page, timeout = 60000) => page.waitForFunction(() => window.__game, null, { timeout, polling: 200 });
// a server of the working tree whose fault for MOD the test sets: (n) => status | 'drop' | null, n = 1, 2, …
async function faultyServer() {
  const s = { n: 0, plan: () => null };
  const srv = await startServer(undefined, { fault: (rel) => (rel === MOD ? s.plan(++s.n) : null) });
  return Object.assign(s, srv, { close: () => srv.server.close() });
}

test('boot: a module of the game fails once on the first visit (no service worker) -> the page reloads itself once and the game starts', async () => {
  const srv = await faultyServer();
  try {
    srv.plan = (n) => (n === 1 ? 503 : null);
    const ctx = await newContext(browser, LAND);
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(srv.base);
    await up(page);
    assert.equal(srv.n, 2, 'the module was asked for twice: the failure, then the reload');
    assert.equal(await page.locator('#bootfail').count(), 0);
    // the address loses ?retry once the game is up; the report says the page was reloaded
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('retry'), null, { timeout: 10000 });
    const errs = await page.evaluate(() => window.__nocturneErrors);
    assert.ok(errs.some((e) => e.kind === 'note' && /перезавантажено/.test(e.msg)), JSON.stringify(errs));
    assert.deepEqual(errors.filter((e) => !/503|Failed to load/.test(e)), []);
    await ctx.close();
  } finally { srv.close(); }
});

test('boot: a module fails every time -> one automatic reload, then «Гра не завантажилась» with «Спробувати ще» (works once the file is back) and «Скинути кеш»', async () => {
  const srv = await faultyServer();
  try {
    srv.plan = () => 503;
    const ctx = await newContext(browser, LAND);
    const page = await ctx.newPage();
    await page.goto(srv.base);
    await page.waitForSelector('#bootfail', { timeout: 60000 });
    assert.equal(srv.n, 2, 'one automatic reload, not a loop');
    assert.equal(new URL(page.url()).searchParams.get('retry'), '1');
    assert.equal(await page.textContent('#start'), 'Гра не завантажилась');
    for (const id of ['#bootretry', '#bootcopy', '#bootreset']) assert.equal(await page.isVisible(id), true, id);
    // the report (step 1): the file that failed and how, the page's version, the reload
    await page.click('#bootcopy');
    await page.waitForFunction(() => document.querySelector('#bootcopy').textContent === 'Скопійовано');
    const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(r.report, 'nocturne-boot');
    assert.equal(r.env.retried, true); assert.equal(r.env.online, true); assert.equal(r.env.page, VERSION);
    assert.ok(r.env.failed.some((f) => /systems\/state\.js\?v=.*HTTP 503/.test(f)), JSON.stringify(r.env));
    assert.match(await page.textContent('#bootfail pre'), /файл: .*state\.js.*HTTP 503/);
    await page.waitForTimeout(3000);
    assert.equal(srv.n, 2, 'still no loop');
    // the file is back: «Спробувати ще» starts the game
    srv.plan = () => null;
    await page.click('#bootretry');
    await up(page);
    assert.equal(new URL(page.url()).searchParams.has('retry'), false);
    await ctx.close();
  } finally { srv.close(); }
});

test('boot: with a service worker, a new deploy whose module fails twice (503, then a cut connection) starts at once: the worker tries again, no reload', async () => {
  let n = 0, broken = false;
  // only the page's own module request (through the worker), not the new worker's install copy (that one
  // goes with cache: 'reload', i.e. Cache-Control: no-cache)
  const site = await siteCopy({ fault: (rel, req) => (broken && rel === MOD && !req.headers['cache-control'] ? (++n === 1 ? 503 : n === 2 ? 'drop' : null) : null) });
  try {
    const ctx = await newContext(browser, LAND, { sw: true });
    const page = await ctx.newPage();
    await page.goto(site.base);
    await up(page);
    await swReady(page);
    site.bump('0.6.0-boot.2');
    broken = true;
    await page.goto(site.base);
    await page.waitForFunction(() => window.__game && /0\.6\.0-boot\.2/.test(document.getElementById('version').textContent), null, { timeout: 60000, polling: 200 });
    assert.equal(n, 3, 'the worker asked three times');
    assert.equal(new URL(page.url()).searchParams.has('retry'), false, 'no reload was needed');
    assert.equal((await page.evaluate(() => window.__nocturneErrors)).filter((e) => e.kind !== 'console').length, 0);
    await ctx.close();
  } finally { await site.close(); }
});

test('boot: the network drops for a second while the game loads (airplane mode), with and without a service worker -> the game starts', async () => {
  const site = await siteCopy();
  try {
    for (const sw of [false, true]) {
      const ctx = await newContext(browser, LAND, { sw });
      const page = await ctx.newPage();
      if (sw) {
        await page.goto(site.base); await up(page); await swReady(page);
        site.bump('0.6.0-air.' + Date.now());   // a new deploy: the modules come from the network again
      }
      // the network goes the moment the page asks for its first module, and comes back a second later
      let cut = false;
      page.on('request', (r) => {
        if (cut || !/\/src\/.*\.js\?v=/.test(r.url())) return;
        cut = true;
        ctx.setOffline(true).then(() => setTimeout(() => ctx.setOffline(false), 1000));
      });
      await page.goto(site.base, { waitUntil: 'commit' });
      await up(page, 90000);
      assert.equal(cut, true, `sw ${sw}: the network was cut`);
      assert.equal(await page.locator('#bootfail').count(), 0, `sw ${sw}`);
      await ctx.close();
    }
  } finally { await site.close(); }
});

test('boot: «Скинути кеш» removes this site copy\'s service worker and caches, then loads the page from the network', async () => {
  let broken = false;
  const site = await siteCopy({ fault: (rel, req) => (broken && rel === MOD && !req.headers['cache-control'] ? 503 : null) });
  try {
    const ctx = await newContext(browser, LAND, { sw: true });
    const page = await ctx.newPage();
    await page.goto(site.base); await up(page); await swReady(page);
    site.bump('0.6.0-reset.2');
    broken = true;
    await page.goto(site.base);
    await page.waitForSelector('#bootreset', { timeout: 90000 });
    // the report names the file the worker gave up on, and the worker's state
    const errs = await page.evaluate(() => window.__nocturneErrors);
    assert.ok(errs.some((e) => e.kind === 'fetch' && /src\/systems\/state\.js\?v=0\.6\.0-reset\.2: HTTP 503 \(service worker .*спроб: 4\)/.test(e.msg)), JSON.stringify(errs));
    await page.click('#bootcopy');
    await page.waitForFunction(() => document.querySelector('#bootcopy').textContent === 'Скопійовано');
    const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(r.env.sw.controlled, true, JSON.stringify(r.env));
    assert.equal(r.env.page, '0.6.0-reset.2');
    broken = false;
    await page.click('#bootreset');
    await page.waitForURL((u) => new URL(u).searchParams.has('fresh'), { timeout: 30000 });
    await up(page);
    const left = await page.evaluate(async () => ({
      caches: (await caches.keys()).filter((k) => k.startsWith(`nocturne:${location.pathname}:`) && !k.endsWith('0.6.0-reset.2')),
    }));
    assert.deepEqual(left.caches, [], 'the old caches are gone');
    await ctx.close();
  } finally { await site.close(); }
});

// Guards the rule of step 4 (the new worker waits for the page's 'skipWaiting', sent once the game is up).
// Chromium here did not take over in the middle of a start with the old rule either (it waits for the
// old worker's requests under way): this test does not tell the two rules apart, it keeps the new one.
test('service worker: a new version installs while the page loads but takes over only after the game is up (never in the middle of a start)', async () => {
  let slow = false, installed = 0, held = null;
  // Chrome looks for a new sw.js by itself only after the page's load event; anything else may look
  // sooner (another tab, registration.update()): here the page asks at its very first moment (?poke).
  // Its own request for one module of the start is held until the new worker has fetched its last file
  // (the install copies go with Cache-Control: no-cache) and 2 s more: the new worker is ready to take
  // over long before the start
  const site = await siteCopy({ fault: () => null });
  const srv = site.server, orig = srv.listeners('request')[0], lastFile = 'src/xr/player.js';
  srv.removeAllListeners('request');
  srv.on('request', (req, res) => {
    const install = !!req.headers['cache-control'];
    if (slow && install && req.url.includes(lastFile)) { installed++; if (held) setTimeout(held, 2000); }
    if (slow && !install && /\/src\/systems\/state\.js/.test(req.url)) {
      let sent = false;
      const go = () => { if (!sent) { sent = true; orig(req, res); } };
      if (installed) setTimeout(go, 2000); else { held = go; setTimeout(go, 30000); }
    } else orig(req, res);
  });
  try {
    const ctx = await newContext(browser, LAND, { sw: true });
    await ctx.addInitScript(() => {
      window.__swLog = [];
      if (location.search.includes('poke')) navigator.serviceWorker.getRegistration().then((r) => r && r.update());
      navigator.serviceWorker.addEventListener('controllerchange', () => window.__swLog.push(window.__game ? 'after the start' : 'during the start'));
    });
    const page = await ctx.newPage();
    await page.goto(site.base); await up(page); await swReady(page);
    site.bump('0.6.0-wait.2');
    slow = true;
    await page.goto(site.base + '?poke', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__game && /0\.6\.0-wait\.2/.test(document.getElementById('version').textContent), null, { timeout: 60000, polling: 200 });
    assert.equal(await swUpdatedTo(page, '0.6.0-wait.2'), '0.6.0-wait.2', 'the new worker took over');
    assert.equal(installed, 1, 'the new worker installed while the page was loading');
    assert.deepEqual(await page.evaluate(() => window.__swLog), ['after the start']);
    await ctx.close();
  } finally { await site.close(); }
});
