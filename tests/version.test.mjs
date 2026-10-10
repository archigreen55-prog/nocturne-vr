// Versions while several branches are developed in parallel (CONTRIBUTING-agents.md): a branch build
// is <base>.<label>.<n> (0.6.0-pre.9.w0.1), the build that is merged gets the next 0.6.0-pre.N. The
// stale-page guard (index.html), the ?v= module URLs and the service worker compare versions only for
// equality, so any of these sequences must update cleanly, including a "shorter" version after a
// longer one (0.6.0-pre.9.w0.2 -> 0.6.0-pre.10).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, watchErrors } from './harness.mjs';
import { browser, test, LAND, siteCopy, swReady, swUpdatedTo } from './runner.mjs';

const SEQUENCE = ['0.6.0-pre.9.w0.2', '0.6.0-pre.9.t5.1', '0.6.0-pre.10', '0.6.0-pre.10.run.1', '0.6.0-pre.11'];
const shown = (page) => page.evaluate(() => document.getElementById('version').textContent);
const ready = (page) => page.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 200 });

test('versions of parallel branches (0.6.0-pre.9.w0.2 -> …t5.1 -> pre.10 -> pre.10.run.1 -> pre.11): stale-page guard, ?v= modules, service worker and its caches follow every step', async () => {
  const site = await siteCopy();
  try {
    // 1. the stale-page guard: an old cached page sees a newer version.json and reloads once with ?v=<new>
    for (const v of SEQUENCE) {
      const oldHtml = await readFile(join(site.dir, 'index.html'), 'utf8');
      const oldVersion = /const PAGE_VERSION = '([^']*)'/.exec(oldHtml)[1];
      site.bump(v);
      assert.equal(JSON.parse(await readFile(join(site.dir, 'version.json'), 'utf8')).version, v);
      const html = await readFile(join(site.dir, 'index.html'), 'utf8');
      assert.match(html, new RegExp(`const PAGE_VERSION = '${v.replace(/\./g, '\\.')}'`));
      assert.match(html, new RegExp(`src/main\\.js\\?v=${v.replace(/\./g, '\\.')}"`));
      assert.match(html, new RegExp(`"\\./src/systems/state\\.js": "\\./src/systems/state\\.js\\?v=${v.replace(/\./g, '\\.')}"`));
      assert.match(html, new RegExp(`src/ui/phone\\.css\\?v=${v.replace(/\./g, '\\.')}"`));
      const sw = await readFile(join(site.dir, 'sw.js'), 'utf8');
      assert.match(sw, new RegExp(`const VERSION = '${v.replace(/\./g, '\\.')}';`));
      const ctx = await newContext(browser, LAND);
      const page = await ctx.newPage();
      // the first page load gets the OLD page (as a stale cache would); the guard must notice and reload
      let served = 0;
      await page.route((url) => url.pathname.endsWith('/') && !url.searchParams.has('v'), (route) => { served++; route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: oldHtml }); }, { times: 1 });
      await page.goto(site.base);
      await page.waitForURL((u) => new URL(u).searchParams.get('v') === v, { timeout: 30000 });
      await ready(page);
      assert.equal(served, 1, `${oldVersion} -> ${v}: the stale page was served once`);
      assert.match(await shown(page), new RegExp(v.replace(/\./g, '\\.')), `${oldVersion} -> ${v}: the new build runs after the guard's reload`);
      // the modules that ran are the new ones (src/version.js reads its own ?v=)
      assert.equal(await page.evaluate(() => window.__game.VERSION), v);
      await ctx.close();
    }
    // 2. the service worker (phone): installed at one version, every next one replaces it and its cache
    site.bump('0.6.0-pre.9.w0.1');
    const ctx = await newContext(browser, LAND, { sw: true });
    let page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(site.base); await ready(page);
    await swReady(page);
    const path = new URL(site.base).pathname;
    for (const v of SEQUENCE) {
      site.bump(v);
      await page.close();
      page = await ctx.newPage();
      await page.goto(site.base);
      await page.waitForFunction((v) => window.__game && document.getElementById('version').textContent.includes(v), v, { timeout: 30000, polling: 200 });
      const swVersion = await swUpdatedTo(page, v);
      assert.equal(swVersion, v, `the worker updated to ${v}`);
      // the new worker deletes the old caches when it takes over (activate): wait for that
      const keys = await page.evaluate(async ([p, want]) => {
        let k = [];
        for (let i = 0; i < 40; i++) { k = (await caches.keys()).filter((x) => x.startsWith(`nocturne:${p}:`)); if (k.length === 1 && k[0] === want) break; await new Promise((r) => setTimeout(r, 250)); }
        return k;
      }, [path, `nocturne:${path}:${v}`]);
      assert.deepEqual(keys, [`nocturne:${path}:${v}`], `only the cache of ${v} is left: ${keys.join(', ')}`);
      // offline: the copy is this version
      await ctx.setOffline(true);
      await page.reload(); await ready(page);
      assert.match(await shown(page), new RegExp(v.replace(/\./g, '\\.')), `offline copy is ${v}`);
      await ctx.setOffline(false);
    }
    assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e)), []);
    await ctx.close();
  } finally { await site.close(); }
});
