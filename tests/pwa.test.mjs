// The home-screen app: manifest, icons, install, the service worker (offline, updates).
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext, watchErrors } from './harness.mjs';
import { VERSION, preview, browser, open, test, LAND, fingerPressEl, siteCopy, swReady, swUpdatedTo, base } from './runner.mjs';

test('home-screen app: manifest and icons; Android install button (finger); iPhone "На початковий екран" hint', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => {
    window.__prompted = 0;
    window.__fakePrompt = () => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); };
  });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  const man = await page.evaluate(async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); return { type: r.headers.get('content-type'), json: await r.json() }; });
  assert.equal(man.json.display, 'fullscreen'); assert.equal(man.json.orientation, 'landscape'); assert.equal(man.json.start_url, './?app=1');
  for (const ic of man.json.icons) {
    const size = await page.evaluate(async (src) => { const img = new Image(); img.src = src; await img.decode(); return `${img.naturalWidth}x${img.naturalHeight}`; }, ic.src);
    assert.equal(size, ic.sizes, ic.src);
  }
  assert.ok(man.json.icons.some((i) => i.purpose === 'maskable'));
  assert.equal(await page.evaluate(async () => { const img = new Image(); img.src = document.querySelector('link[rel=apple-touch-icon]').href; await img.decode(); return img.naturalWidth; }), 180);
  assert.equal(await page.isVisible('#installbtn'), false);
  await page.evaluate(() => window.__fakePrompt());
  await page.waitForSelector('#installbtn', { state: 'visible' });
  await fingerPressEl(page, cdp, '#installbtn');
  await page.waitForFunction(() => window.__prompted === 1);
  await page.waitForFunction(() => /Гру встановлено/.test(document.getElementById('installnote').textContent));
  assert.deepEqual(errors, []);
  await ctx.close();
  const ictx = await newContext(browser, { ...devices['iPhone 15 landscape'] });
  const ip = await open(ictx, base);
  assert.match(await ip.page.textContent('#installnote'), /«Поділитися».*«На початковий екран».*окреме сховище/);
  await ictx.close();
});

test('service worker: offline play after the first visit (also from the icon start URL); a new deploy is picked up on the main site AND on a preview; ?nosw removes it', async () => {
  const site = await siteCopy();
  try {
    const ctx = await newContext(browser, LAND, { sw: true });
    for (const url of [site.base, site.base + 'preview/test/']) {
      const page = await ctx.newPage();
      const errors = watchErrors(page);
      await page.goto(url);
      await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
      await swReady(page);
      assert.match(await page.textContent('#version'), new RegExp(VERSION.replace(/\./g, '\\.')));
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
      assert.equal(new URL(scope).pathname, new URL(url).pathname, 'one worker per site copy (main / preview)');
      // offline: the game still opens, also from the home-screen icon (start_url ./?app=1)
      await ctx.setOffline(true);
      await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
      await page.goto(url + '?app=1'); await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
      assert.equal(await page.evaluate(() => window.__game.MODE.mode), 'phone');
      // the phone UI stylesheet (src/ui/phone.css) is in the offline copy too
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('hud')).position), 'fixed', `${url}: phone.css offline`);
      await ctx.setOffline(false);
      assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e)), [], url);
      await page.close();
    }
    // a new deploy: the next visit runs the new version (main site and preview), and the worker updates
    site.bump('0.6.0-test.2');
    for (const url of [site.base, site.base + 'preview/test/']) {
      const page = await ctx.newPage();
      await page.goto(url);
      await page.waitForFunction(() => window.__game && /0\.6\.0-test\.2/.test(document.getElementById('version').textContent), null, { timeout: 30000, polling: 200 });
      // the page's worker reports the new version (asked until it does: the new worker takes over by itself)
      const swVersion = await swUpdatedTo(page, '0.6.0-test.2');
      assert.equal(swVersion, '0.6.0-test.2', `${url}: the worker updated`);
      // and offline now gives the new version, not the old one
      await ctx.setOffline(true);
      await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
      assert.match(await page.textContent('#version'), /0\.6\.0-test\.2/, `${url}: offline copy is the new version`);
      await ctx.setOffline(false);
      // the old caches of this copy are gone
      const keys = await page.evaluate(async (path) => (await caches.keys()).filter((k) => k.startsWith(`nocturne:${path}:`)), new URL(url).pathname);
      assert.deepEqual(keys, [`nocturne:${new URL(url).pathname}:0.6.0-test.2`]);
      await page.close();
    }
    // the main site's worker never answers for a preview it does not own
    const page = await ctx.newPage();
    await page.goto(site.base + '?nosw');
    await page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });
    const gone = await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) { if (!(await navigator.serviceWorker.getRegistrations()).some((r) => new URL(r.scope).pathname === location.pathname)) return true; await new Promise((r) => setTimeout(r, 300)); }
      return false;
    });
    assert.equal(gone, true, '?nosw removed the main site worker');
    await ctx.close();
  } finally { await site.close(); }
});
