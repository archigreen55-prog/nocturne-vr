// Performance: quality presets, dynamic resolution, the frame cap, board redraws; the cost of the
// flashlight's wall test (frame time with the beam on screen, phone).
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext } from './harness.mjs';
import { browser, open, test, keepFor, frames, playPhone, base } from './runner.mjs';

test('phone quality: presets (pixel ratio, MSAA note, far lamps off on low), auto pick from 5 s, dynamic resolution, per-minute tags, 30 FPS cap', async () => {
  const { ctx, page, errors } = await playPhone();
  await page.evaluate(() => { window.__game.playing = false; });   // drive the quality logic by hand (no real frames feed it)
  let q = await page.evaluate(() => window.__game.quality.state());
  assert.equal(q.setting, 'auto'); assert.equal(q.preset, 'medium', 'Android starts at medium');
  assert.equal(q.pixelRatio, Math.min(1.25, devices['Pixel 7 landscape'].deviceScaleFactor));
  assert.equal(await page.evaluate(() => window.__game.renderer.getPixelRatio()), q.pixelRatio);
  // auto pick: 6 s at 30 FPS -> one preset down, remembered
  q = await page.evaluate(() => { const Q = window.__game.quality; for (let i = 0; i < 6.5 * 30; i++) Q.frame(1000 / 30); return Q.state(); });
  assert.equal(q.autoPick, 'low'); assert.equal(q.preset, 'low'); assert.equal(q.pixelRatio, 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.qualityAuto'))), 'low');
  // low: lamps further than 12 m are off, the near ones on
  await page.evaluate(() => { const g = window.__game; g.player.teleport(2.2, 6.8, 0); g.playing = true; });
  await page.waitForFunction(() => window.__game.points.some((l) => l.intensity === 0) && window.__game.points.some((l) => l.intensity > 0), null, { timeout: 8000 });
  await page.evaluate(() => { window.__game.playing = false; });
  // a fixed preset from the settings (the start-screen select); the page started with MSAA (medium), so
  // "low" (no MSAA) says it takes effect after a reload, and "high" does not need one
  await page.evaluate(() => { const s = document.getElementById('quality'); s.value = 'low'; s.dispatchEvent(new Event('change')); });
  assert.equal(await page.evaluate(() => window.__game.quality.needsReload), true);
  assert.match(await page.textContent('#qualitynote'), /після перезавантаження/);
  await page.evaluate(() => { const s = document.getElementById('quality'); s.value = 'high'; s.dispatchEvent(new Event('change')); });
  q = await page.evaluate(() => window.__game.quality.state());
  assert.equal(q.preset, 'high'); assert.equal(q.pixelRatio, Math.min(1.5, devices['Pixel 7 landscape'].deviceScaleFactor));
  assert.equal(q.needsReload, false); assert.equal(await page.textContent('#qualitynote'), '');
  // dynamic resolution: 3 s at 40 FPS (< 83 % of 60) -> one step down; 10 s at 60 -> back up.
  // The per-second accumulator starts empty and the slow part is exactly 3 whole seconds: the real
  // frames played above (a part-second of them, longer on a loaded machine) and a slow remainder must
  // not leak into the first of the fast seconds.
  q = await page.evaluate(() => { const Q = window.__game.quality; Q.acc = { n: 0, ms: 0 }; Q.secs = []; for (let i = 0; i < 3 * 40; i++) Q.frame(25); return Q.state(); });
  assert.equal(q.pixelRatio, Math.min(1.5, devices['Pixel 7 landscape'].deviceScaleFactor) - 0.125, JSON.stringify(q));
  q = await page.evaluate(() => { const Q = window.__game.quality; for (let i = 0; i < 10.5 * 60; i++) Q.frame(1000 / 60); return Q.state(); });
  assert.equal(q.pixelRatio, Math.min(1.5, devices['Pixel 7 landscape'].deviceScaleFactor)); assert.equal(q.dynamicSteps, 2);
  // the report: each minute says preset / pixel ratio / cap
  const minute = await page.evaluate(() => { const f = window.__game.frameStats; for (let i = 0; i < 62; i++) f.add(990); return f.minutes.at(-1); });
  assert.deepEqual(Object.keys(minute).sort(), ['cap', 'fps', 'pr', 'q', 'worstMs']);
  // 30 FPS cap: rendered frames at least ~31 ms apart while playing
  await page.evaluate(() => { const s = document.getElementById('fpscap'); s.value = '30'; s.dispatchEvent(new Event('change')); window.__game.playing = true; });
  // the intervals the game itself recorded between the frames it ran (rAF times, as frameStats uses them)
  await keepFor(page, 300);
  const gaps = await page.evaluate(async () => {
    const f = window.__game.frameStats, i0 = f.i;
    const t0 = performance.now(); while (performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 50));
    const out = []; for (let k = i0; k !== f.i; k = (k + 1) % f.ms.length) out.push(f.ms[k]);
    return out;
  });
  assert.ok(gaps.length > 3 && gaps.every((ms) => ms >= 31), `30 FPS cap: ${gaps.map((x) => x.toFixed(0)).join(' ')}`);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.phone.quality.cap, 30); assert.ok('battery' in r.phone && 'pwa' in r.phone && 'gyro' in r.phone);
  assert.deepEqual(errors, []);
  await ctx.close();
  // iPhone starts at high
  const ictx = await newContext(browser, { ...devices['iPhone 15 landscape'] });
  const ip = await open(ictx, base);
  assert.equal(await ip.page.evaluate(() => window.__game.quality.preset), 'high');
  await ictx.close();
});

test('board redraws only when its content changes and it is in view (phone)', async () => {
  const { ctx, page, errors } = await playPhone();
  const draws = () => page.evaluate(() => window.__game.perf.boardDraws || 0);
  // at the van, facing the board, nothing changes: no redraws
  await page.evaluate(() => { const g = window.__game; g.player.teleport(2.2, 6.8, 2.92); });
  await keepFor(page, 600);
  let d0 = await draws();
  await keepFor(page, 1500);
  assert.equal(await draws(), d0, 'idle board: not redrawn');
  // the clock runs (heist) but the board is behind you: not redrawn
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); g.player.teleport(2.2, 4.5, 2.92 + Math.PI); });
  await keepFor(page, 600);
  d0 = await draws();
  await keepFor(page, 2500);
  assert.equal(await draws(), d0, 'out of view: not redrawn');
  // turned towards it: redrawn (the clock changed)
  await page.evaluate(() => { window.__game.player.lookYaw = 2.92; });
  await page.waitForFunction((d0) => (window.__game.perf.boardDraws || 0) > d0, d0, { timeout: 8000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

// The flashlight stopping at walls (enemies/flashWalls.js) on the phone: a frame with the guard's beam
// filling the screen, the page with the wall test and the page without it (?flashwalls=off), median of
// 40 frames each (the test machine draws in software: the times are slow, the ratio is what counts).
// FLASH_FPS=1 prints the numbers.
async function beamFrame(query) {
  const ctx = await newContext(browser, { ...devices['Pixel 7 landscape'] });
  await ctx.addInitScript(() => localStorage.setItem('nocturne.tutorial', JSON.stringify({ done: true })));
  const { page, errors } = await open(ctx, base + query);
  const ms = await page.evaluate(() => {
    const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4), S = new g.THREE.Vector3(), T = new g.THREE.Vector3();
    g.renderer.setAnimationLoop(null);
    g.patrol.spot.getWorldPosition(S); g.patrol.spotTarget.getWorldPosition(T);
    const fx = T.x - S.x, fz = T.z - S.z, fl = Math.hypot(fx, fz) || 1;
    g.player.teleport(S.x - fx / fl * 1.2, S.z - fz / fl * 1.2, Math.atan2(-fx, -fz)); g.player.lookPitch = -0.3;
    g.sim(1 / 72); g.scene.updateMatrixWorld(true);
    const frame = () => { const t0 = performance.now(); g.renderer.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
    for (let i = 0; i < 8; i++) frame();
    const t = Array.from({ length: 40 }, frame).sort((a, b) => a - b);
    return t[20];
  });
  assert.deepEqual(errors, []);
  await ctx.close();
  return ms;
}
test('flashlight wall test: a frame with the beam on screen costs at most 15 % more than without it (phone)', async () => {
  const off = await beamFrame('?flashwalls=off'), on = await beamFrame('');
  const info = `without ${off.toFixed(1)} ms (${(1000 / off).toFixed(1)} FPS), with ${on.toFixed(1)} ms (${(1000 / on).toFixed(1)} FPS), +${((on / off - 1) * 100).toFixed(1)} %`;
  if (process.env.FLASH_FPS) console.log('  flashlight wall test: ' + info);
  assert.ok(on <= off * 1.15, info);
});
