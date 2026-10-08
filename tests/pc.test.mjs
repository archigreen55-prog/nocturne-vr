// PC: keyboard, stars per mode, a full round.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { base, browser, open, test, keepFor, standFacing } from './runner.mjs';

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
