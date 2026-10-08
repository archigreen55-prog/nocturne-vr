// Phone controls: joystick, look, action buttons, the board by finger and by the crosshair, full screen, portrait, gyroscope.
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext } from './harness.mjs';
import { browser, open, test, LAND, tp, touchT, touchEndAt, quickTap, simT, keepFor, drag, hold, playPhone, standFacing, boardPoint, fingerPress, toResult, fingerPressEl, pm, toSummary, aimAt, base } from './runner.mjs';

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

test('phone: the board by the crosshair: aim at a board button -> «Натиснути» presses it (finger held 0.4 s); a slid-off finger does not', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.waitForFunction(() => window.__game.board.buttons.some((b) => b.id === 'cnext'));
  await aimAt(page, 'cnext');
  await page.waitForFunction(() => window.__game.board.hover === 'cnext' && document.querySelector('#touch .act').textContent === 'Натиснути' && !document.querySelector('#touch .act').hidden, null, { timeout: 8000 });
  const c0 = await page.evaluate(() => window.__game.contract.id);
  // a finger that slides far off the button: nothing
  {
    const b = await page.locator('#touch .act').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2, t = touchT();
    await tp(cdp, 'touchStart', [{ x, y }], t);
    await tp(cdp, 'touchMove', [{ x: x - 150, y: y - 60 }], t + 0.2);
    await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.4));
    await keepFor(page, 300);
    assert.equal(await page.evaluate(() => window.__game.contract.id), c0, 'slid off: not pressed');
  }
  await fingerPressEl(page, cdp, '#touch .act');
  await page.waitForFunction((c0) => window.__game.contract.id !== c0, c0, { timeout: 8000 });
  // aim away from the board: the button goes (or turns into an item action)
  await page.evaluate(() => { window.__game.player.lookYaw += Math.PI; });
  await page.waitForFunction(() => document.querySelector('#touch .act').hidden || document.querySelector('#touch .act').textContent !== 'Натиснути', null, { timeout: 8000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone gyroscope (option): off by default; on from the menu (a tap); turning the phone turns the view, the side of landscape flips it; iPhone without permission says so', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  assert.equal(await page.evaluate(() => window.__game.gyro.on), false);
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Налаштування'));
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn:has-text("Гіроскоп")');
  await page.waitForFunction(() => window.__game.gyro.on);
  await fingerPressEl(page, cdp, pm('Назад'));
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused);
  const turn = (angle, beta, gamma) => page.evaluate(async ([angle, beta, gamma]) => {
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => angle });
    const g = window.__game, y0 = g.player.lookYaw, p0 = g.player.lookPitch;
    for (let i = 0; i < 30; i++) {
      dispatchEvent(new DeviceMotionEvent('devicemotion', { rotationRate: { alpha: 0, beta, gamma }, interval: 16 }));
      await new Promise((r) => setTimeout(r, 16));
    }
    const t0 = g.simT; while (g.simT < t0 + 0.05) await new Promise((r) => setTimeout(r, 20));
    return { dyaw: g.player.lookYaw - y0, dpitch: g.player.lookPitch - p0 };
  }, [angle, beta, gamma]);
  const a = await turn(90, 60, 0), b = await turn(270, 60, 0), c = await turn(90, 0, -40);
  assert.ok(Math.abs(a.dyaw) > 0.2, `turned: ${JSON.stringify(a)}`);
  assert.ok(Math.sign(a.dyaw) === -Math.sign(b.dyaw), `the other landscape side turns the other way: ${JSON.stringify([a, b])}`);
  assert.ok(a.dyaw > 0, 'landscape 90, rotation about the device x axis +: the view turns left');
  assert.ok(c.dpitch > 0.1, `looking up: ${JSON.stringify(c)}`);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.phone.gyro.state, 'on'); assert.ok(r.phone.gyro.events >= 90);
  assert.deepEqual(errors, []);
  await ctx.close();
  // iPhone: the motion permission refused
  const ictx = await newContext(browser, { ...devices['iPhone 15 landscape'] });
  await ictx.addInitScript(() => { DeviceMotionEvent.requestPermission = async () => 'denied'; });
  const ip = await open(ictx, base);
  const icdp = await ictx.newCDPSession(ip.page);
  await fingerPressEl(ip.page, icdp, '#gyrobtn');
  await ip.page.waitForFunction(() => /немає дозволу/.test(document.getElementById('gyrobtn').textContent), null, { timeout: 5000 });
  await ictx.close();
});

test('a finger press fires a start-screen button once (no second press from the click that follows)', async () => {
  const ctx = await newContext(browser, LAND);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await fingerPressEl(page, cdp, '#gyrobtn');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.gyro'))), 'on', 'one press = one step (a double press would switch it back off)');
  await page.tap('#gyrobtn');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.gyro'))), 'off');
  assert.deepEqual(errors, []);
  await ctx.close();
});
