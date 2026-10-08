// VR regression in the WebXR emulator (IWER, Quest 3).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, UA, open, modeOf, test, base } from './runner.mjs';

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
  assert.deepEqual(await page.evaluate(() => [window.__game.quality, window.__game.gyro, window.__game.renderer.getPixelRatio() === Math.min(devicePixelRatio, 1.5)]), [null, null, true], 'VR: no phone quality / gyroscope, the pixel ratio as before');
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
