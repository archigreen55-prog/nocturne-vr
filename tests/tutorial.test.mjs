// The first-run tutorial (phone and PC; not in VR): steps at the van, hints in the first round, shown
// once, «Пропустити» (finger / H), «Навчання ще раз» from the menu and the start screen.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, base, UA, open, test, frames, playPhone, standFacing, fingerPressEl, keepFor } from './runner.mjs';

const tut = (page) => page.evaluate(() => ({ ...window.__game.tutorial.state(), text: document.getElementById('tutorial') && document.getElementById('tutorial').innerText }));
// (game time is slow here: software rendering; a hint stays 6 s of game time before the next one)
const waitTut = (page, fn, arg, timeout = 45000) => page.waitForFunction(([src, a]) => {
  const el = document.getElementById('tutorial'), s = { ...window.__game.tutorial.state(), text: el ? el.innerText : '' };
  return new Function('s', 'a', `return (${src})(s, a)`)(s, a);
}, [fn.toString(), arg], { timeout, polling: 50 });
// a point 2 m from where the player stands, still near the van (the clock does not start)
// the bubble keeps off the crosshair (the screen centre) and the action buttons
async function clearOfControls(page) {
  const box = await page.locator('#tutorial').boundingBox(), vp = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `inside the screen: ${JSON.stringify(box)}`);
  const cx = vp.width / 2, cy = vp.height / 2;
  assert.ok(!(cx >= box.x - 8 && cx <= box.x + box.width + 8 && cy >= box.y - 8 && cy <= box.y + box.height + 8), `off the crosshair: ${JSON.stringify(box)}`);
  for (const sel of ['.act', '.door', '.crouch', '.breath', '.pause']) {
    const b = await page.locator(`#touch ${sel}`).boundingBox().catch(() => null);
    if (b) assert.ok(box.x + box.width <= b.x || b.x + b.width <= box.x || box.y + box.height <= b.y || b.y + b.height <= box.y, `tutorial over ${sel}: ${JSON.stringify(box)} ${JSON.stringify(b)}`);
  }
  return box;
}
const step2m = (page) => page.evaluate(() => {
  const g = window.__game, Z = g.CFG.round.vanZone, h = g.player.head;
  for (const [x, z] of [[Z.x + 2.2, Z.z], [Z.x - 2.2, Z.z], [Z.x, Z.z + 2.2], [Z.x, Z.z - 2.2]]) {
    if (Math.hypot(x - h.x, z - h.z) >= 1.6) { g.player.teleport(x, z, g.player.yaw); return; }
  }
});

test('tutorial on a phone: shown on the first run; look, walk, the board, the clock; hints in the first round (an item under the crosshair) once; balance untouched', async () => {
  const { ctx, page, cdp, errors } = await playPhone();
  await waitTut(page, (s) => s.visible && /Огляд/.test(s.text));
  let s = await tut(page);
  assert.equal(s.step, 'look'); assert.match(s.text, /навчання 1\/4/i); assert.match(s.text, /Пропустити/);
  // the bubble is inside the screen, off the crosshair and the action buttons; touches pass through it
  await clearOfControls(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('tutorial')).pointerEvents), 'none');
  // 1. look: ~60° (a finger drag turns the same player.look)
  await page.evaluate(() => window.__game.player.look(450, 0));
  await waitTut(page, (s) => s.step === 'walk' && /Ходьба/.test(s.text) && /2\/4/.test(s.text));
  // 2. walk 1.5 m
  await step2m(page);
  await waitTut(page, (s) => s.step === 'board' && /Табло/.test(s.text));
  // 3. the board: any button (here the next contract)
  await page.evaluate(() => window.__game.pressBoard('cnext'));
  await waitTut(page, (s) => s.step === 'go' && /Годинник піде/.test(s.text));
  assert.equal(await page.evaluate(() => window.__game.round.phase), 'ready', 'the clock still waits at the van');
  // 4. leave the van: the clock starts, the steps are done
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0.5, -1.5, Math.PI); });
  await waitTut(page, (s) => s.step === 'hints');
  // a hint: an item under the crosshair -> «Взяти», once
  const it = await page.evaluate(() => { const g = window.__game, i = g.loot.items.find((x) => !x.twoHanded); const c = i.mesh.getWorldPosition(new g.THREE.Vector3()); return { x: c.x, z: c.z }; });
  await standFacing(page, it.x, it.z, 1.0, 0.3);
  await waitTut(page, (s) => s.hint === 'take' && /Взяти/.test(s.text));
  s = await tut(page);
  assert.ok(s.shown.includes('take'));
  // the tutorial changes no numbers and pauses nothing: the round clock runs, the guard walks
  const t0 = await page.evaluate(() => window.__game.round.clock);
  await keepFor(page, 600);
  assert.ok(await page.evaluate(() => window.__game.round.clock) < t0, 'the clock runs under the tutorial');
  assert.equal(await page.evaluate(() => window.__game.paused), false);
  // the round ends -> the tutorial is done and saved
  await page.evaluate(() => window.__game.round.finish('left'));
  await waitTut(page, (s) => !s.on && !s.visible);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.tutorial'))), { done: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tutorial: «Пропустити» by finger ends it for good; «Навчання ще раз» in the menu (Налаштування) starts it again at the van', async () => {
  const { ctx, page, cdp, errors } = await playPhone();
  await waitTut(page, (s) => s.visible);
  await fingerPressEl(page, cdp, '#tutorial .tt-skip');
  await waitTut(page, (s) => !s.on && !s.visible);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.tutorial'))), { done: true });
  // after a reload: not shown again
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  await frames(page, 20);
  assert.equal((await tut(page)).visible, false);
  // the menu: Налаштування -> «Навчання ще раз» -> the game goes on with step 1
  await page.evaluate(() => { window.__game.pauseOpen('user'); window.__game.menu.go('settings'); });
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn:text-is("Навчання ще раз")');
  await page.waitForFunction(() => !window.__game.paused);
  await waitTut(page, (s) => s.on && s.visible && s.step === 'look');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tutorial on a PC: keyboard and mouse wording; H skips; «Навчання ще раз» on the start screen; in VR mode there is none', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.evaluate(() => window.__game.start.play());
  await waitTut(page, (s) => s.visible && /рухай мишею/.test(s.text) && /клавіша H/.test(s.text));
  await page.evaluate(() => window.__game.player.look(450, 0));
  await waitTut(page, (s) => /W A S D/.test(s.text));
  await page.keyboard.press('KeyH');
  await waitTut(page, (s) => !s.on && !s.visible);
  // the start screen button: on again for the next play (Esc releases the mouse -> the start screen)
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => !window.__game.playing);
  await page.click('#tutorialbtn');
  assert.match(await page.textContent('#tutorialbtn'), /почнеться біля фургона/);
  await page.evaluate(() => window.__game.start.play());
  await waitTut(page, (s) => s.visible && s.step === 'look');
  assert.deepEqual(errors, []);
  await ctx.close();
  // VR mode (a headset browser): no tutorial, no button
  const vctx = await newContext(browser, { userAgent: UA.quest });
  const v = await open(vctx, base);
  assert.equal(await v.page.evaluate(() => document.getElementById('tutorial')), null);
  assert.equal(await v.page.isVisible('#tutorialbtn'), false);
  assert.equal(await v.page.evaluate(() => window.__game.tutorial.state().on), false);
  await vctx.close();
});

test('tutorial on a small phone (667 x 280): the bubble fits and keeps off the crosshair and the action buttons', async () => {
  const { ctx, page } = await playPhone({ viewport: { width: 667, height: 280 }, screen: { width: 667, height: 280 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await waitTut(page, (s) => s.visible);
  await clearOfControls(page);
  // with the longest step text too
  await page.evaluate(() => window.__game.player.look(450, 0));
  await waitTut(page, (s) => s.step === 'walk');
  await clearOfControls(page);
  await ctx.close();
});
