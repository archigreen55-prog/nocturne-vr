// Phone HUD, pause menu, round summary, small screens, pausing on minimise / call / blur, vibration and edge flashes.
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext } from './harness.mjs';
import { browser, UA, open, test, LAND, tp, touchT, touchEndAt, frames, drag, playPhone, boardPoint, fingerPress, toResult, fingerPressEl, pm, toSummary, pauseState, base } from './runner.mjs';

test('phone: round summary (HTML) after every ending: stars, items, Ще раз послухати and Новий раунд by finger', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  const endings = {
    // the real path: the guard catches you -> 1 s black -> result at the van
    caught: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.caught(); }),
    escaped: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('escaped'); }),
    late: () => page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.2); g.round.finish('late'); }),
    // a loot item in the van, then Поїхати pressed on the stand board with a finger
    left: async () => {
      // the clock starts 4.5 m from the van (Поїхати is on the board only then)
      await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); g.loot.deliver(g.loot.items.find((i) => !i.twoHanded)); g.player.teleport(2.2, 6.8, 2.92); });
      await page.waitForFunction(() => window.__game.board.buttons.some((b) => b.id === 'leave'), null, { timeout: 8000 });
      await frames(page);
      await fingerPress(page, cdp, await boardPoint(page, 'leave'));
    },
  };
  const TITLE = { caught: 'СПІЙМАЛИ', escaped: 'УТЕКЛИ', late: 'НЕ ВСТИГЛИ', left: 'ПОЇХАЛИ' };
  for (const [kind, end] of Object.entries(endings)) {
    // a recorded scream (stubbed: no microphone here) so that "Ще раз послухати" is enabled
    await page.evaluate(() => { const g = window.__game, s = g.scream; window.__played = 0; s.best = { t: 12, samples: new Float32Array(10), db: -10 }; s.play = () => { window.__played++; return true; }; });
    await end();
    await toResult(page).catch(async (e) => { throw new Error(`${kind}: no result (${JSON.stringify(await page.evaluate(() => ({ phase: window.__game.round.phase, floating: window.__game.board.floating })))}) ${e.message}`); });
    assert.equal(await page.evaluate(() => window.__game.round.result.kind), kind, `ending ${kind}`);
    assert.equal(await page.evaluate(() => window.__game.caughtT), -1, `${kind}: no leftover "caught" state`);
    await page.evaluate(() => { window.__game.round.result.shouts = 1; });
    await toSummary(page);
    assert.equal(await page.textContent('#summary .sm-title'), TITLE[kind], `${kind}: title`);
    assert.match(await page.textContent('#summary .sm-stars'), /^[★☆]{3}$/, `${kind}: stars`);
    assert.equal(await page.isVisible('#summary'), true);
    assert.equal(await page.evaluate(() => window.__game.board.mesh.visible), false, 'the floating 3D board is replaced by the summary');
    if (kind === 'left') assert.ok((await page.locator('#summary .sm-item').count()) >= 1, 'delivered item listed');
    await page.waitForFunction(() => !document.querySelector('#summary .sm-buttons .sm-btn:nth-child(2)').disabled, null, { timeout: 5000 });
    await page.waitForFunction(() => window.__played > 0, null, { timeout: 20000 });   // the board plays the scream once by itself
    await page.evaluate(() => { window.__played = 0; });
    await fingerPressEl(page, cdp, '#summary .sm-buttons .sm-btn:nth-child(2)');   // Ще раз послухати
    await page.waitForFunction(() => window.__played > 0, null, { timeout: 8000 });
    await page.evaluate(() => { window.__game.scream.best = null; });
    await fingerPressEl(page, cdp, '#summary .sm-buttons .sm-btn:nth-child(1)');   // Новий раунд
    await page.waitForFunction(() => window.__game.round.phase === 'ready' && !window.__game.board.floating, null, { timeout: 8000 });
    assert.equal(await page.isVisible('#summary'), false, `${kind}: summary closed`);
    assert.equal(await page.evaluate(() => window.__game.board.mesh.visible), true, 'the stand board is back');
    assert.equal(await page.evaluate(() => window.__game.playing), true, `${kind}: still playing after Новий раунд`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPhone landscape (UA in Chromium): play, buttons inside the screen, report has the phone block', async () => {
  const { ctx, page, errors } = await playPhone({ ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] });
  const vp = page.viewportSize();
  for (const sel of ['#touch .breath', '#touch .crouch', '#touch .pause']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} inside the screen`);
  }
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mode.device, 'iPhone');
  assert.equal(r.phone.lookSpeed, 'normal');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone HUD: HTML instead of the wrist canvas; time, eye, microphone, messages; minimal mode; inside the screen; takes no touches', async () => {
  const { ctx, page, errors } = await playPhone({ ...LAND, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  const G = (fn, arg) => page.evaluate(fn, arg);
  assert.equal(await page.isVisible('#hud'), true);
  assert.equal(await G(() => window.__game.wrist.mesh.visible), false, 'wrist panel hidden on a phone');
  await G(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(2); });
  await page.waitForFunction(() => /^\d:\d\d$/.test(document.querySelector('#hud .time').textContent));
  assert.equal(await G(() => window.__game.wrist.texture.version), 1, 'the wrist canvas is never redrawn (version 1 = the texture creation only)');
  assert.match(await page.textContent('#hud .stance'), /^Стоїш · \d\.\d м$/);
  assert.equal(await page.getAttribute('#hud .hud-eye', 'data-eye'), 'open');
  assert.match(await page.textContent('#hud .miclabel'), /МІК ВИМКНЕНО/);
  await page.tap('#touch .crouch');
  await page.waitForFunction(() => document.querySelector('#hud .stance').textContent.startsWith('Присів'));
  await page.waitForFunction(() => document.querySelector('#hud .hud-eye').getAttribute('data-eye') === 'half', null, { timeout: 8000 });
  await G(() => window.__game.flash('Тест повідомлення', 5, '#5fd38d'));
  await page.waitForFunction(() => document.querySelector('#hud .hud-msg').textContent === 'Тест повідомлення');
  assert.match(await page.textContent('#hud .goal'), /Мета: \$0 \/ \$2,000/);
  // microphone (the fake one): the label and a filled bar
  await G(() => window.__game.pauseOpen('user'));
  await G(() => window.__game.pauseResume());
  await G(async () => { await window.__game.mic.enable(); window.__game.sim(0.5); });
  await page.waitForFunction(() => window.__game.mic.state === 'on');
  await page.waitForFunction(() => ['ШЕПІТ', 'НОРМАЛЬНО', 'КРИК!'].includes(document.querySelector('#hud .miclabel').textContent), null, { timeout: 8000 });
  assert.ok(parseFloat(await G(() => document.querySelector('#hud .bar .fill').style.width)) > 0, 'level bar filled');
  // everything inside the screen; the HUD takes no touches
  const vp = page.viewportSize();
  for (const sel of ['#hud .hud-tl', '#hud .hud-tc', '#hud .hud-tr', '#hud .hud-msg']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} inside the screen ${JSON.stringify(b)}`);
  }
  assert.equal(await G(() => { const e = document.elementFromPoint(innerWidth / 2, 20); return !!(e && e.closest('#hud')); }), false, 'the HUD does not catch touches');
  // the pause button and the mic block do not overlap
  const tr = await page.locator('#hud .hud-tr').boundingBox(), pb = await page.locator('#touch .pause').boundingBox();
  assert.ok(tr.x + tr.width <= pb.x, 'mic block is left of the pause button');
  // minimal mode: the alarm word and the goal hide until they change, the clock / eye / mic stay
  await G(() => { document.getElementById('hudmode').value = 'min'; document.getElementById('hudmode').dispatchEvent(new Event('change')); });
  assert.equal(await G(() => window.__game.hud.minimal), true);
  await page.waitForFunction(() => document.querySelector('#hud .alarm').classList.contains('gone'), null, { timeout: 8000 });
  assert.equal(await page.isVisible('#hud .goal'), false);
  assert.equal(await page.isVisible('#hud .time'), true);
  assert.equal(await page.isVisible('#hud .hud-eye'), true);
  assert.equal(await page.isVisible('#hud .miclabel'), true);
  await G(() => { const g = window.__game; g.alert.add(100, g.player.head.x, g.player.head.z); g.sim(0.3); });   // the alarm must show at once
  await page.waitForFunction(() => !document.querySelector('#hud .alarm').classList.contains('gone') && /ТРИВОГА|ДО ФУРГОНА/.test(document.querySelector('#hud .alarm').textContent), null, { timeout: 8000 });
  assert.equal(await G(() => JSON.parse(localStorage.getItem('nocturne.hudMode') || localStorage.getItem('nocturne.preview.hudMode'))), 'min', 'the setting is saved');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone pause menu: opens by finger, the game waits, every button works held 0.4 s or 1.5 s, a slid-off finger does nothing', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => window.__game.sim(0.5));
  const yaw0 = await page.evaluate(() => window.__game.player.yaw);
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.isVisible('#pausemenu'), true);
  assert.equal(await page.evaluate(() => window.__game.audio.state), 'suspended', 'the mix is silenced while paused');
  const p0 = await pauseState(page);
  await page.waitForTimeout(800);
  assert.equal((await pauseState(page)).simT, p0.simT, 'game time stands still behind the menu');
  assert.equal(await page.evaluate(() => window.__game.player.yaw), yaw0, 'no camera turn from pressing the menu');
  // a finger that lands on «Продовжити» but is lifted far away: nothing happens
  {
    const b = await page.locator(pm('Продовжити')).boundingBox();
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t = touchT();
    await tp(cdp, 'touchStart', [pt], t);
    await tp(cdp, 'touchMove', [{ x: pt.x, y: pt.y + 5 }], t + 0.1);
    await tp(cdp, 'touchMove', [{ x: b.x + b.width / 2, y: b.y - 120 }], t + 0.3);   // far off, outside the button
    await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.4));
    await page.waitForTimeout(300);
    assert.equal((await pauseState(page)).paused, true, 'a slid-off finger does not press');
  }
  // settings: look speed cycles and is saved
  await fingerPressEl(page, cdp, pm('Налаштування'));
  await page.waitForSelector(pm('Назад'));
  assert.match(await page.textContent('#pausemenu .pm-btn'), /Огляд пальцем: звичайно/);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=0');
  assert.match(await page.textContent('#pausemenu .pm-btn'), /Огляд пальцем: швидко/);
  assert.equal(await page.evaluate(() => window.__game.touch.lookSpeed), 0.008);
  assert.equal(await page.inputValue('#lookspeed'), 'fast', 'the start-screen select follows');
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=1');   // breath mode
  assert.equal(await page.evaluate(() => window.__game.touch.breathToggle), true);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=2');   // HUD
  assert.equal(await page.evaluate(() => window.__game.hud.minimal), true);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=2');
  assert.equal(await page.evaluate(() => window.__game.hud.minimal), false);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn >> nth=3');   // vibration
  assert.equal(await page.evaluate(() => window.__game.feedback.mode), 'flash');
  await fingerPressEl(page, cdp, pm('Назад'));
  // contract and difficulty (before the round starts)
  await fingerPressEl(page, cdp, pm('Контракт і складність'));
  await page.waitForSelector('#pausemenu .step');
  const c0 = await page.evaluate(() => window.__game.contract.id);
  await fingerPressEl(page, cdp, '#pausemenu .step >> nth=1', { holdMs: 1500 });   // ▶ held 1.5 s
  assert.notEqual(await page.evaluate(() => window.__game.contract.id), c0, 'contract changed (held 1.5 s)');
  const d0 = await page.evaluate(() => window.__game.difficulty);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn:has-text("Складність")');
  assert.notEqual(await page.evaluate(() => window.__game.difficulty), d0);
  await fingerPressEl(page, cdp, pm('Назад'));
  // continue: the game runs again, audio wakes
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused);
  assert.equal(await page.isVisible('#pausemenu'), false);
  await page.waitForFunction((t) => window.__game.simT > t, p0.simT);
  await page.waitForFunction(() => window.__game.audio.state === 'running', null, { timeout: 5000 });
  // mid-round the contract cannot change; «До фургона» and «Новий раунд» work
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(1); });
  assert.equal(await page.evaluate(() => window.__game.round.phase), 'heist');
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Контракт і складність'));
  await page.waitForSelector('#pausemenu .step');
  assert.equal(await page.locator('#pausemenu .step').first().isDisabled(), true, 'contract locked mid-round');
  await fingerPressEl(page, cdp, pm('Назад'));
  await fingerPressEl(page, cdp, pm('До фургона'));
  await page.waitForFunction(() => !window.__game.paused);
  await frames(page);
  const home = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  assert.ok(Math.hypot(home.x - 2.2, home.z - 6.8) < 0.5, `back at the van ${JSON.stringify(home)}`);
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Новий раунд'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.round.phase === 'ready');
  assert.equal(await page.evaluate(() => window.__game.playing), true);
  // report from the menu
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  await fingerPressEl(page, cdp, pm('Скопіювати звіт'));
  await page.waitForFunction(() => /Скопійовано/.test(document.querySelector('#reportsheet')?.textContent || ''));
  const r = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(r.phone.hud, 'full'); assert.equal(r.phone.paused, true); assert.equal(r.phone.feedback.mode, 'flash');
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true, 'full screen kept through the menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('small phone (667 x 280, iPhone SE-like landscape): HUD blocks do not overlap; a long menu scrolls by dragging, a drag does not press', async () => {
  const { ctx, page, errors, cdp } = await playPhone({ ...LAND, viewport: { width: 667, height: 280 }, screen: { width: 667, height: 280 } });
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(2); g.alert.add(100, g.player.head.x, g.player.head.z); g.sim(0.3); g.flash('Довге повідомлення про щось важливе у будинку', 5); });
  await page.waitForFunction(() => /ТРИВОГА|ДО ФУРГОНА/.test(document.querySelector('#hud .alarm').textContent));
  const box = (sel) => page.locator(sel).boundingBox();
  const tl = await box('#hud .hud-tl'), tc = await box('#hud .hud-tc'), tr = await box('#hud .hud-tr'), msg = await box('#hud .hud-msg'), pb = await box('#touch .pause');
  assert.ok(tl.x + tl.width <= tc.x + 1, `eye block ends before the clock block (${tl.x + tl.width} vs ${tc.x})`);
  assert.ok(tc.x + tc.width <= tr.x + 1, `clock block ends before the mic block (${tc.x + tc.width} vs ${tr.x})`);
  assert.ok(tr.x + tr.width <= pb.x, 'mic block is left of the pause button');
  assert.ok(msg.x >= 0 && msg.x + msg.width <= 667, 'message inside the screen');
  await fingerPressEl(page, cdp, '#touch .pause');
  await page.waitForFunction(() => window.__game.paused);
  const sc = await page.evaluate(() => { const g = document.querySelector('#pausemenu .pm-grid'); return { sh: g.scrollHeight, ch: g.clientHeight }; });
  assert.ok(sc.sh > sc.ch, `the list is longer than the screen (${sc.sh} > ${sc.ch})`);
  // a vertical drag that starts on a button scrolls the list and presses nothing
  {
    const b = await page.locator(pm('До фургона')).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2, t = touchT();
    await tp(cdp, 'touchStart', [{ x, y }], t);
    for (let i = 1; i <= 8; i++) await tp(cdp, 'touchMove', [{ x, y: y - i * 15 }], t + i * 0.02);
    await tp(cdp, 'touchEnd', [], touchEndAt(t + 0.3));
  }
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.querySelector('#pausemenu .pm-grid').scrollTop) > 20, 'the drag scrolled the list');
  assert.equal(await page.evaluate(() => window.__game.paused), true, 'the drag did not press anything');
  await fingerPressEl(page, cdp, pm('На стартовий екран'));   // the last button, reachable after scrolling
  await page.waitForFunction(() => !window.__game.playing);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: minimising the page, a call (audio taken away) and focus loss pause the game; Продовжити wakes it', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  const hide = (state) => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await page.evaluate(() => window.__game.sim(0.5));
  // 1. the page is minimised
  await hide('hidden');
  await page.waitForFunction(() => window.__game.paused);
  assert.match(await page.textContent('#pausemenu .pm-note'), /згорнув/);
  assert.equal(await page.evaluate(() => window.__game.audio.state), 'suspended');
  const t = (await pauseState(page)).simT;
  await hide('visible');
  await page.waitForTimeout(500);
  assert.equal((await pauseState(page)).paused, true, 'coming back does not resume by itself: a tap is needed');
  assert.equal((await pauseState(page)).simT, t);
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.audio.state === 'running', null, { timeout: 5000 });
  await page.waitForFunction((t) => window.__game.simT > t, t);
  // 2. a call: the system suspends the audio context
  await page.evaluate(() => window.__game.audio.suspend());
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  assert.match(await page.textContent('#pausemenu .pm-note'), /звук/);
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => !window.__game.paused && window.__game.audio.state === 'running', null, { timeout: 5000 });
  // 3. focus lost (a notification shade): paused only if the document really lost focus, and not just after Продовжити
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__game.paused), false, 'a blur while the page still has focus is ignored');
  await page.waitForTimeout(2200);   // past the grace period after Продовжити
  await page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await page.waitForFunction(() => window.__game.paused, null, { timeout: 5000 });
  assert.match(await page.textContent('#pausemenu .pm-note'), /фокус/);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.deepEqual(r.phone.pauses.map((p) => p.reason), ['hidden', 'audio', 'blur']);
  // the start screen is not paused by a minimised page
  await fingerPressEl(page, cdp, pm('На стартовий екран'));
  await page.waitForFunction(() => !window.__game.playing);
  await hide('hidden');
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#pausemenu'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone feedback: vibration on Android; no navigator.vibrate (iPhone) = edge flash and a soft sound; settings off / flash', async () => {
  // Android path: record the vibrations
  let { ctx, page, errors, cdp } = await (async () => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
    const { page, errors } = await open(ctx, base);
    await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
    return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
  })();
  assert.equal(await page.evaluate(() => window.__game.feedback.how), 'vibrate');
  const vp = page.viewportSize();
  await page.evaluate(() => { const g = window.__game; g.player.teleport(2.2, 6.8, 2.92 - Math.PI); });
  await drag(page, cdp, vp.width * 0.2, vp.height * 0.6, 0, -64, 600);   // across the quiet ring
  assert.ok((await page.evaluate(() => window.__vib)).includes(12), 'the joystick crossing the ring vibrates');
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, 0); g.sim(0.3); g.caught(); });
  assert.deepEqual(await page.evaluate(() => window.__vib.at(-1)), [260, 100, 420], 'caught');
  await page.evaluate(() => { window.__game.feedback.lastAt = {}; window.__game.feedback.play('hidden'); });
  assert.equal(await page.evaluate(() => window.__vib.at(-1)), 22, 'hidden tick');
  // 'flash only' on an Android phone shows the iPhone behaviour and does not vibrate
  await page.evaluate(() => { window.__vib.length = 0; window.__game.feedback.mode = 'flash'; window.__game.feedback.play('shout'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0);
  assert.equal(await page.evaluate(() => window.__game.feedback.count.flashes), 1);
  // off: nothing at all
  await page.evaluate(() => { const f = window.__game.feedback; f.mode = 'off'; f.lastAt = {}; f.play('alarm'); f.play('caught'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0);
  assert.equal(await page.evaluate(() => window.__game.feedback.count.flashes), 1);
  // paused: silent
  await page.evaluate(() => { const g = window.__game; g.feedback.mode = 'auto'; g.feedback.lastAt = {}; g.pauseOpen('user'); g.feedback.play('alarm'); });
  assert.equal(await page.evaluate(() => window.__vib.length), 0, 'no vibration behind the menu');
  assert.deepEqual(errors, []);
  await ctx.close();
  // iPhone path: Safari has no navigator.vibrate
  const ictx = await newContext(browser, { ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] });
  await ictx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true }); });
  const ip = await open(ictx, base);
  await ip.page.tap('#start'); await ip.page.waitForFunction(() => window.__game.playing);
  const F = (fn, a) => ip.page.evaluate(fn, a);
  assert.equal(await F(() => typeof navigator.vibrate), 'undefined');
  assert.equal(await F(() => window.__game.feedback.how), 'flash');
  await F(() => { window.__game.player.teleport(0, 2, 0); window.__game.sim(0.2); });
  await F(() => window.__game.feedback.play('caught'));
  assert.match(await F(() => document.getElementById('edgeflash').style.boxShadow), /rgb\(255, 43, 43\)|#ff2b2b/i);
  assert.equal(await F(() => window.__game.feedback.count.flashes), 1);
  await F(() => window.__game.feedback.play('hidden'));
  const st = await F(() => window.__game.feedback.state());
  assert.equal(st.flashes, 2); assert.equal(st.cues, 1, 'a soft sound for "hidden"'); assert.equal(st.vibrations, 0);
  const rep = JSON.parse(await F(() => window.__game.reportText()));
  assert.equal(rep.phone.feedback.canVibrate, false); assert.equal(rep.phone.feedback.how, 'flash');
  assert.deepEqual(ip.errors, []);
  await ictx.close();
});
