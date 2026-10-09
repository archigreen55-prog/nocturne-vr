// The microphone: fake-microphone level, limits and ± buttons, the phone wizard, the game-sound bus, knocks, refusal, calls, iPhone audio session.
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { newContext } from './harness.mjs';
import { knockWav, browser, UA, open, test, fingerPressEl, pm, MIC_CAL, micPhone, micOn, installFeed, base } from './runner.mjs';

test('fake microphone: permission, level of a -23 dBFS tone, track settings in the report', async () => {
  const ctx = await newContext(browser, { permissions: ['microphone'] });
  const { page, errors } = await open(ctx, base);
  await page.click('#micbtn');
  await page.waitForFunction(() => window.__game.mic.state === 'on');
  assert.equal(await page.textContent('#calbtn'), 'Калібрувати (4 кроки)', 'PC: the 4-step calibration as before');
  await page.waitForTimeout(1500);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mic.state, 'on');
  assert.ok(Math.abs(r.mic.levelDb - -23) < 3, `tone level ${r.mic.levelDb} dBFS`);
  assert.equal(r.mic.track.autoGainControl, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mic limits: the Android report (corrections -12 / -10) is brought back to sane thresholds', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  await page.evaluate(() => localStorage.setItem('nocturne.mic', JSON.stringify({ floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152, adj: -12, adjW: -10 })));
  await page.reload(); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  const m = await page.evaluate(() => { const m = window.__game.mic; return { shout: m.shoutDb, whisper: m.whisperDb, adj: m.cal.adj, adjW: m.cal.adjW }; });
  assert.ok(m.shout >= -22.408 + 4 - 1e-9, `shout threshold ${m.shout} must stay >= voice + 4`);
  assert.ok(m.whisper >= -44.69 + 3 - 1e-9, `whisper boundary ${m.whisper} must stay >= whisper + 3`);
  assert.ok(m.whisper <= -22.408 - 3 + 1e-9, 'whisper boundary below the voice');
  assert.deepEqual([m.adj, m.adjW], [-3, -7], 'saved corrections clamped');
  // without corrections the calibration's own thresholds are untouched
  const raw = await page.evaluate(() => { const m = window.__game.mic; m.resetAdjust(); return [m.shoutDb, m.whisperDb]; });
  assert.ok(Math.abs(raw[0] - -15.152) < 1e-6 && Math.abs(raw[1] - (-44.69 + 0.45 * (-22.408 + 44.69))) < 1e-6, String(raw));
  await ctx.close();
});

test('mic ± buttons (no sliders): stop at the limit with a note, reset, page swipes change nothing', async () => {
  const ctx = await newContext(browser, { ...devices['Pixel 7'], permissions: ['microphone'] });
  const { page, errors } = await open(ctx, base);
  await page.evaluate(() => localStorage.setItem('nocturne.mic', JSON.stringify({ floor: -50, normal: -22, whisper: -45, shout: -15 })));
  await page.reload(); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  await page.tap('#micbtn'); await page.waitForFunction(() => window.__game.mic.state === 'on');
  assert.equal(await page.locator('#shoutrow input[type=range]').count(), 0, 'no sliders');
  const before = await page.evaluate(() => [window.__game.mic.shoutDb, window.__game.mic.whisperDb]);
  // a page swipe that starts on the threshold rows (vertical, both ways)
  const cdp = await ctx.newCDPSession(page);
  for (const sel of ['#shoutdb', '#sdn', '#wup']) {
    await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), sel);
    const b = await page.locator(sel).boundingBox();
    for (const dy of [-200, 200]) {
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 2, y: y + dy * i / 10 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    }
  }
  assert.deepEqual(await page.evaluate(() => [window.__game.mic.shoutDb, window.__game.mic.whisperDb]), before, 'swipes did not move the thresholds');
  // shout threshold down to its limit: voice -22 + 4 = -18 (base -15, so at most -3)
  for (let i = 0; i < 6; i++) if (await page.isEnabled('#sdn')) await page.tap('#sdn');
  assert.equal(await page.evaluate(() => window.__game.mic.shoutDb), -18);
  assert.equal(await page.isEnabled('#sdn'), false);
  assert.match(await page.textContent('#adjnote'), /на 4 дБ вища за твій звичайний голос/);
  assert.match(await page.textContent('#shoutdb'), /−18 дБ \(зсув −3\)|-18 дБ \(зсув −3\)/);
  await page.tap('#adjreset');
  assert.deepEqual(await page.evaluate(() => [window.__game.mic.cal.adj, window.__game.mic.cal.adjW]), [0, 0]);
  assert.match(await page.textContent('#adjnote'), /Зсуви скинуто/);
  assert.equal(await page.isEnabled('#adjreset'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone mic wizard (5 steps, by finger): silence, the game\'s own sounds through the bus, whisper, voice, shout; then the check of three phrases', async () => {
  const ctx = await newContext(browser, micPhone);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  assert.match(await page.textContent('#michold'), /як гратимеш/);
  assert.match(await page.textContent('#michelp'), /два запити|Дозволити під час відвідування/, 'before asking: what the dialogs will be');
  await micOn(page, cdp);
  assert.equal(await page.textContent('#calbtn'), 'Калібрувати (5 кроків)');
  await installFeed(page, -20);
  await fingerPressEl(page, cdp, '#calbtn');
  await page.waitForFunction(() => /2\/5 ЗВУКИ ГРИ/.test(document.getElementById('calstep').textContent), null, { timeout: 15000 });
  const busPeak = await page.evaluate(async () => { let m = -100; for (let i = 0; i < 25; i++) { m = Math.max(m, window.__game.mic.gameDb); await new Promise((r) => setTimeout(r, 100)); } return m; });
  assert.ok(busPeak > -45, `the sample of game sounds plays on the bus (${busPeak.toFixed(1)} dB)`);
  await page.waitForFunction(() => /^Готово/.test(document.getElementById('calstep').textContent), null, { timeout: 45000 });
  const cal = await page.evaluate(() => window.__game.mic.cal);
  assert.ok(Math.abs(cal.floor - -62) < 3 && Math.abs(cal.normal - -30) < 3 && Math.abs(cal.whisper - -48) < 3, JSON.stringify(cal));
  assert.ok(Number.isFinite(cal.bleed) && Math.abs(cal.bleed - -20) < 4, `bleed measured ${cal.bleed}`);
  assert.match(await page.textContent('#calstep'), /Звуки гри чути в мікрофоні/);
  assert.equal(await page.textContent('#micnote'), '', 'nothing to redo');
  // the check after the wizard
  assert.equal(await page.isEnabled('#verifybtn'), true);
  await fingerPressEl(page, cdp, '#verifybtn');
  await page.waitForFunction(() => /Крик:/.test(document.getElementById('verifyres').textContent), null, { timeout: 30000 });
  const vr = await page.textContent('#verifyres');
  assert.match(vr, /Шепіт: ШЕПІТ ✓ · Голос: НОРМАЛЬНО ✓ · Крик: КРИК! ✓/, vr);
  // headphones: the game is not heard in the microphone -> no protection needed
  await installFeed(page, null);
  await fingerPressEl(page, cdp, '#calbtn');
  await page.waitForFunction(() => /^Готово/.test(document.getElementById('calstep').textContent), null, { timeout: 45000 });
  assert.equal(await page.evaluate(() => window.__game.mic.cal.bleed), -80);
  assert.match(await page.textContent('#calstep'), /навушники/);
  // the board at the van (tap) runs the same 5-step wizard on a phone
  await page.evaluate(() => { const g = window.__game; g.pressBoard('micpage'); g.sim(0.1); });
  assert.ok(await page.evaluate(() => window.__game.board.buttons.some((b) => b.id === 'cal' && b.label === 'Калібрувати (5 кроків)')), 'phone board: 5 steps');
  await page.evaluate(() => { const g = window.__game; g.pressBoard('back'); g.sim(0.1); });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the game\'s own sounds from the speaker are not your voice (bus analyser); your voice and shout still count', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -10 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  // the microphone hears only the game (a leaky speaker: bus - 10 dB)
  await page.evaluate(() => { const g = window.__game; window.__voice = null; g.mic.feed = (m) => window.__voice ?? Math.max(-62 + Math.random(), m.gameDb - 10); g.player.teleport(0, 2, 0); });
  const loud = async (ms) => page.evaluate(async (ms) => {
    const g = window.__game, seen = { normal: 0, shout: 0, bus: -100, raised: 0 };
    g.siren.set(true);
    const t0 = performance.now(), mt0 = g.mic.t;
    let next = 0;
    while (g.mic.t - mt0 < ms / 1000 && performance.now() - t0 < 60000) {   // microphone time
      if (performance.now() - t0 >= next) { g.playGame(); next += 1200; }
      await new Promise((r) => setTimeout(r, 30));
      if (g.mic.level === 'normal') seen.normal++;
      if (g.mic.level === 'shout') seen.shout++;
      seen.bus = Math.max(seen.bus, g.mic.gameDb); seen.raised = Math.max(seen.raised, g.mic.masking);
    }
    g.siren.set(false);
    return seen;
  }, ms);
  // control: without the protection the same game sound is taken for a voice
  await page.evaluate(() => { window.__fn = window.__game.mic.gameDbFn; });
  const unprotected = await page.evaluate(async () => {
    const g = window.__game, m = g.mic, fn = m.gameDbFn;
    // keep measuring the bus, but do not raise the boundaries
    m.gameDbFn = null;
    const seen = { normal: 0 };
    g.siren.set(true);
    const t0 = performance.now(); let next = 0;
    while (performance.now() - t0 < 4000) {
      if (performance.now() - t0 >= next) { g.playGame(); next += 1200; }
      m.gameDb = fn();
      await new Promise((r) => setTimeout(r, 30));
      if (m.level !== 'quiet') seen.normal++;
    }
    g.siren.set(false);
    m.gameDbFn = fn;
    return seen;
  });
  // (the feed reads m.gameDb, which the control loop keeps updating)
  assert.ok(unprotected.normal > 0, `control: unprotected, the game sound alone reads as a voice (${JSON.stringify(unprotected)})`);
  await page.waitForTimeout(800);
  const shouts0 = await page.evaluate(() => window.__game.round.shouts);
  const prot = await loud(4000);
  assert.ok(prot.bus > -40, `the game was loud on the bus (${prot.bus.toFixed(1)} dB)`);
  assert.equal(prot.normal + prot.shout, 0, `protected: the game sound is never "НОРМАЛЬНО" / "КРИК!" (${JSON.stringify(prot)})`);
  assert.ok(prot.raised >= 3, 'the boundaries were raised while the game sounded');
  assert.equal(await page.evaluate(() => window.__game.round.shouts), shouts0, 'no shout counted');
  await page.waitForFunction(() => /звуки гри: межі/.test(document.querySelector('#hud .micdb').textContent) || true);
  // the game quiet (a moment without the guard's sounds): a normal voice is heard as before
  await page.waitForFunction(() => window.__game.mic.gameInMic < -40, null, { timeout: 20000, polling: 30 });
  await page.evaluate(() => { window.__voice = -30; });
  await page.waitForFunction(() => window.__game.mic.level === 'normal' || window.__game.mic.gameInMic > -40, null, { timeout: 5000 });
  const v = await page.evaluate(() => ({ level: window.__game.mic.level, game: window.__game.mic.gameInMic }));
  assert.ok(v.level === 'normal' || v.game > -40, `voice heard while the game is quiet ${JSON.stringify(v)}`);
  // while the game is loud, a real shout well above it still counts
  await page.evaluate(() => { window.__voice = -62; });
  await page.waitForTimeout(500);
  const shout = await page.evaluate(async () => {
    const g = window.__game; g.siren.set(true); g.playGame();
    await new Promise((r) => setTimeout(r, 500));
    const before = { shoutNow: g.mic.shoutEff, game: g.mic.gameInMic };
    window.__voice = -3;   // a real shout near the phone: far above the game in the microphone
    let got = false, maxEff = -100; const t0 = performance.now(), mt0 = g.mic.t, trace = [];
    // microphone time, not wall time (software rendering here is slow)
    while (g.mic.t - mt0 < 1.2 && performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 30)); maxEff = Math.max(maxEff, g.mic.shoutEff); if (g.mic.level === 'shout') got = true; trace.push([+(g.mic.t - mt0).toFixed(2), Math.round(g.mic.db), Math.round(g.mic.env), g.mic.aboveT.toFixed(2), g.mic.riseOk]); }
    before.trace = trace.filter((x, i) => i % 5 === 0);
    window.__voice = -62; g.siren.set(false);
    return { got, before, maxEff };
  });
  assert.equal(shout.got, true, `a shout above the game is a shout ${JSON.stringify(shout)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mic protection, deterministic: a game sound that stops abruptly or fades never leaves a false "НОРМАЛЬНО" (30, 72 and 10 analyses / s)', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  const r = await page.evaluate(async (cal) => {
    const { Mic } = await import('./src/audio/mic.js');
    const out = {};
    for (const hz of [30, 72, 10]) {
      const m = new Mic();
      m.state = 'on'; m.cal = { ...cal, bleed: -10 }; m.calibrated = true;
      let g = -100, voice = null;
      m.gameDbFn = () => g;
      m.feed = (mm) => voice ?? Math.max(-62 + Math.random(), mm.gameDb - 10);
      let falseNormal = 0, heard = 0, t = 0;
      const run = (secs, fn) => { for (let k = 0; k < secs * hz; k++) { t += 1 / hz; fn(t); m.update(1 / hz); if (voice === null && m.level !== 'quiet') falseNormal++; if (voice !== null && m.level !== 'quiet') heard++; } };
      for (let i = 0; i < 6; i++) {
        run(0.3 + i * 0.15, () => { g = -8 + Math.random() * 3; });     // loud game sound...
        run(0.8, () => { g = -100; });                                  // ...that stops at once
        run(1.2, (tt) => { g = Math.max(-100, -8 - (tt % 1.2) * 40); }); // ...or fades out
      }
      run(1, () => { g = -100; });
      voice = -30; run(0.6, () => {});                                  // then a normal voice in silence
      out[hz] = { falseNormal, heard };
    }
    return out;
  }, MIC_CAL);
  for (const [hz, v] of Object.entries(r)) {
    assert.equal(v.falseNormal, 0, `${hz} Hz: the game's own sound read as a voice ${JSON.stringify(v)}`);
    assert.ok(v.heard > 0, `${hz} Hz: a voice in silence is still heard`);
  }
  await ctx.close();
});

test('real fake-microphone WAV: finger knocks on the phone body are not a shout; the shout in the same recording is', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { floor: -62, normal: -30, whisper: -48, shout: -18 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  const r = await page.evaluate(async () => {
    const m = window.__game.mic, orig = m.takeShout.bind(m);
    let shouts = 0, maxDb = -100, peaks = 0, wasHigh = false;
    m.takeShout = () => { const s = orig(); if (s) shouts++; return s; };
    const t0 = performance.now();
    while (performance.now() - t0 < 22000) {   // two loops of the 10.9 s recording
      await new Promise((res) => setTimeout(res, 20));
      maxDb = Math.max(maxDb, m.db);
      const high = m.db > m.shoutDb; if (high && !wasHigh) peaks++; wasHigh = high;
    }
    return { shouts, maxDb, peaks };
  });
  assert.ok(r.maxDb > -15, `the recording reaches the analyser (${r.maxDb.toFixed(1)} dB)`);
  assert.ok(r.peaks >= 4, `knocks went over the shout threshold (${r.peaks} times)`);
  assert.ok(r.shouts >= 1 && r.shouts <= 3, `only the long shout counts: ${r.shouts} shouts in 2 loops (12 knocks)`);
  assert.deepEqual(errors, []);
  await ctx.close();
}, { wav: knockWav });

test('phone: microphone refused = where to allow it (Android and iPhone wording); covered microphone hint', async () => {
  for (const [opts, re] of [[micPhone, /Chrome: натисни значок ліворуч від адреси → «Дозволи»/], [{ ...devices['iPhone 15 landscape'], permissions: ['clipboard-read', 'clipboard-write'] }, /«аА».*«Параметри вебсайту»/]]) {
    const ctx = await newContext(browser, opts);
    await ctx.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    const { page, errors } = await open(ctx, base);
    const cdp = await ctx.newCDPSession(page);
    await fingerPressEl(page, cdp, '#micbtn');
    await page.waitForFunction(() => window.__game.mic.state === 'denied');
    assert.match(await page.textContent('#michelp'), re);
    assert.match(await page.textContent('#michelp'), /без мікрофона/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // covered: far under the calibrated silence for 3 s -> the HUD says so; gone when uncovered
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  await page.evaluate(() => { const g = window.__game; g.mic.feed = () => -90; g.sim(4); });
  assert.match(await page.evaluate(() => window.__game.mic.problem), /закритий/);
  await page.waitForFunction(() => /закритий/.test(document.querySelector('#hud .micdb').textContent), null, { timeout: 5000 });
  await page.evaluate(() => { const g = window.__game; g.mic.feed = () => -60; g.sim(0.5); });
  assert.equal(await page.evaluate(() => window.__game.mic.problem), '');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: after a call the microphone comes back on Продовжити (re-opened if the system stopped it); headphones in / out ask for a new calibration', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  await page.waitForFunction(() => ['worklet', 'script', 'recorder', 'none'].includes(window.__game.scream.mode), null, { timeout: 10000 });
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  // the call: the system stops the microphone and the page goes to the background
  await page.evaluate(() => {
    window.__game.mic.track.stop();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.evaluate(() => window.__game.mic.track.readyState), 'ended');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => window.__game.mic.events.lastRecover === 'reacquired', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__game.mic.track.readyState), 'live');
  await page.waitForFunction(() => /Мікрофон знову працює/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__game.mic.env > -40, null, { timeout: 8000 });   // the -23 dB tone is heard again
  // if it cannot be re-opened: say where to fix it
  await page.evaluate(() => { const g = window.__game; g.mic.track.stop(); navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')); g.pauseOpen('user'); });
  await fingerPressEl(page, cdp, pm('Продовжити'));
  await page.waitForFunction(() => window.__game.mic.events.lastRecover === 'failed', null, { timeout: 8000 });
  await page.waitForFunction(() => /Мікрофон не відновився/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  // headphones plugged in
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await page.waitForFunction(() => window.__game.mic.deviceChanged || window.__game.mic.state !== 'on', null, { timeout: 5000 });
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.mic.events.ended >= 0, true); assert.ok(r.mic.events.reacquired >= 1, JSON.stringify(r.mic.events));
  assert.ok(r.mic.game && Number.isFinite(r.mic.game.bleedDb), 'report: the game sound in the microphone');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a live microphone + devicechange: the note on the start screen and in the game, gone after a calibration
  const c2 = await newContext(browser, micPhone);
  await c2.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), { ...MIC_CAL, bleed: -30 });
  const p2 = await open(c2, base);
  const cdp2 = await c2.newCDPSession(p2.page);
  await micOn(p2.page, cdp2);
  await p2.page.tap('#start'); await p2.page.waitForFunction(() => window.__game.playing);
  await p2.page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await p2.page.waitForFunction(() => window.__game.mic.deviceChanged);
  await p2.page.waitForFunction(() => /Змінився мікрофон або навушники/.test(document.querySelector('#hud .hud-msg').textContent), null, { timeout: 5000 });
  assert.match(await p2.page.textContent('#micnote'), /Змінився мікрофон або навушники/);
  await p2.page.evaluate(() => window.__game.mic.setCalibration({ ...window.__game.mic.cal }));
  assert.equal(await p2.page.evaluate(() => window.__game.mic.deviceChanged), false);
  assert.deepEqual(p2.errors, []);
  await c2.close();
});

test('iPhone (UA in Chromium): audio session playback -> play-and-record with the microphone; "silent switch" note; old calibration asks for the game-sounds step', async () => {
  const ctx = await newContext(browser, { ...devices['iPhone 15 landscape'], permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((cal) => {
    navigator.audioSession = { type: 'auto', state: 'inactive' };
    localStorage.setItem('nocturne.mic', JSON.stringify(cal));
  }, MIC_CAL);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  assert.equal(await page.isVisible('#iosnote'), true);
  assert.match(await page.textContent('#iosnote'), /«Без звуку»/);
  assert.match(await page.textContent('#michelp'), /Safari може питати дозвіл при кожному відкритті/);
  await fingerPressEl(page, cdp, '#soundtest');   // the sound test also unlocks audio -> playback
  await page.waitForFunction(() => navigator.audioSession.type === 'playback');
  await micOn(page, cdp);
  assert.equal(await page.evaluate(() => navigator.audioSession.type), 'play-and-record');
  assert.match(await page.textContent('#micnote'), /без кроку «Звуки гри»/);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.equal(r.phone.audioSession.type, 'play-and-record'); assert.equal(r.phone.audioSession.ios, true);
  assert.equal(r.mic.game.measured, false); assert.equal(r.mic.game.bleedDb, -34, 'estimate until the step is done');
  assert.deepEqual(errors, []);
  await ctx.close();
});
