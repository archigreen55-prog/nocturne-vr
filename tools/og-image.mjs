// The link card's picture (og:image in index.html): a 1200×630 shot of the game — the dacha's library at
// night, the guard with his flashlight — with the game's name. Playwright, the same server and Chromium
// as the tests. Run it again when the look of the game changes:
//   node tools/og-image.mjs            # writes og.png in the repository root
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, launch, ROOT } from '../tests/harness.mjs';

const { GAME_NAME } = await import(pathToFileURL(join(ROOT, 'src/i18n/name.js')));
const out = process.argv[2] || join(ROOT, 'og.png');
const { server, base } = await startServer();
const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  // no microphone card, no tutorial: just the game
  await ctx.addInitScript(() => { localStorage.setItem('nocturne.nomic', 'true'); localStorage.setItem('nocturne.tutorialDone', 'true'); });
  const page = await ctx.newPage();
  await page.goto(base + '?nosplash=1&mode=pc', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game, null, { timeout: 90000, polling: 200 });
  await page.evaluate(() => document.fonts.load('800 40px Unbounded'));
  await page.evaluate((name) => {
    const g = window.__game, P = g.patrol;
    g.playingDesktop = true;
    document.getElementById('overlay').style.display = 'none';
    for (const id of ['hint', 'crosshair', 'debug', 'tut']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    // 3 m from the guard, facing him (level 0: he dozes in his armchair, the flashlight on)
    const x = P.x + 3, z = P.z + 3;
    g.player.teleport(x, z, Math.atan2(-(P.x - x), -(P.z - z)));
    g.player.lookPitch = -0.1;
    g.wrist.mesh.visible = false; g.board.mesh.visible = false;
    const t = document.createElement('div');
    t.textContent = name;
    t.style.cssText = 'position:fixed;right:44px;bottom:34px;z-index:99;font:800 76px Unbounded,system-ui,sans-serif;letter-spacing:.02em;color:#efe6d4;text-shadow:0 4px 0 #0d1322,0 0 24px rgba(0,0,0,.6)';
    document.body.append(t);
  }, GAME_NAME);
  await page.waitForTimeout(2500);   // a few frames: lamps, shadows, the flashlight's mask
  await page.evaluate(() => { const g = window.__game; g.wrist.mesh.visible = false; g.board.mesh.visible = false; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  console.log(`og image: ${out}`);
} finally {
  await browser.close();
  server.close();
}
