// The street (plan 2026-11-22-mic-noise): the background is not a voice. The level is measured in the speech
// band, the boundaries stand on the live noise floor at your calibrated distances, a voice looks like speech
// (syllables or a sharp start), and noise next to the microphone never makes the game deafer than the ceiling
// (+8 dB) — past it «дуже шумно» and, after 10 s in a round, the round goes without the microphone (Р-Ш1 = А).
// Sounds: synthetic WAVs made here (no one's recordings) — wind (brown noise with gusts), a road (rumble), a
// car coming closer, speech (a voiced tone cut into syllables, 4 a second), music (chords with a beat).
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newContext } from './harness.mjs';
import { browser, open, test, base, MIC_CAL, micPhone, micOn } from './runner.mjs';

// ---------- synthetic sounds (48 kHz mono, looped by Chromium's fake microphone) ----------
const RATE = 48000;
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 * 2 - 1; };
// parts: [{ secs, wind, road, speech, music, carFrom, carTo }] — the levels are linear amplitudes (RMS-ish)
async function streetWav(name, parts) {
  const n = Math.round(RATE * parts.reduce((a, p) => a + p.secs, 0)), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const r = rng(7);
  let i = 0, brown = 0, rumble = 0, rumble2 = 0;
  for (const p of parts) {
    const m = Math.round(RATE * p.secs);
    for (let k = 0; k < m && i < n; k++, i++) {
      const t = k / RATE, T = i / RATE;
      let v = 0;
      if (p.wind) {   // wind in the microphone: brown noise (most of it under 250 Hz), gusts 0.2–1 Hz
        brown = 0.997 * brown + r() * 0.05;
        const gust = 1 + 0.35 * Math.sin(2 * Math.PI * 0.23 * T) + 0.25 * Math.sin(2 * Math.PI * 0.71 * T + 1);
        v += brown * p.wind * gust;
      }
      if (p.road || p.carFrom) {   // a road: rumble (low-passed noise twice); a car: the same, rising
        rumble = 0.97 * rumble + r() * 0.2; rumble2 = 0.9 * rumble2 + rumble * 0.1;
        const a = (p.road || 0) + (p.carFrom ? p.carFrom * Math.pow(p.carTo / p.carFrom, Math.min(1, t / p.secs)) : 0);
        v += rumble2 * a * 3 + r() * a * 0.08;
      }
      if (p.speech) {   // speech: a voiced tone (150 Hz and its harmonics) in syllables 4 a second (yell: sustained)
        const on = (t * 4) % 1 < 0.6, env = p.yell ? 1 : on ? Math.sin(Math.PI * ((t * 4) % 1) / 0.6) : 0;   // a yell: no pauses
        let s = 0; for (let h = 1; h <= 12; h++) s += Math.sin(2 * Math.PI * 150 * h * t) / h;
        v += s * env * p.speech;
      }
      if (p.music) {   // music: a chord (C, E, G with overtones) on a beat twice a second
        const beat = 0.55 + 0.45 * Math.exp(-((t * 2) % 1) * 6);
        let s = 0; for (const f of [262, 330, 392, 131]) for (let h = 1; h <= 4; h++) s += Math.sin(2 * Math.PI * f * h * t) / (h * 2);
        v += s * beat * p.music;
      }
      if (p.hiss) v += r() * p.hiss;   // the microphone's own hiss (a quiet room)
      buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
    }
  }
  const file = join(tmpdir(), `nocturne-street-${name}.wav`);
  await writeFile(file, buf);
  return file;
}

const HISS = 0.0008;   // a quiet room in the fake microphone: about -62 dB raw (the calibration below)
// the street of the owner's test (Samsung, 22.11): wind and a far road, raw about -28 dB; silent
const windWav = await streetWav('wind', [{ secs: 8, wind: 0.08, road: 0.004, hiss: HISS }]);
// the same street, then talking over it (syllables), then a shout
const talkWav = await streetWav('talk', [{ secs: 5, wind: 0.08, road: 0.004, hiss: HISS }, { secs: 3, wind: 0.08, road: 0.004, speech: 0.15, hiss: HISS }, { secs: 2, wind: 0.08, road: 0.004, hiss: HISS }, { secs: 1.5, wind: 0.08, road: 0.004, speech: 0.6, yell: true, hiss: HISS }, { secs: 3, wind: 0.08, road: 0.004, hiss: HISS }]);
// music from a speaker next to the phone (the cheat: noise to hide the voice)
const musicWav = await streetWav('music', [{ secs: 6, music: 0.12, hiss: HISS }]);

// the home calibration of these tests (speech band) and helpers in the page
const CAL = { ...MIC_CAL, bleed: -80 };   // floor -62, whisper -48, voice -30; headphones (the game's sound is not heard)
const setCal = (page, cal = CAL) => page.evaluate((c) => { const m = window.__game.mic; m.cal = { ...c }; m.calibrated = true; m.stale = false; }, cal);
// watch the microphone for `secs` of its clock: how often each level, the noise states, the floor
const watch = (page, secs) => page.evaluate(async (secs) => {
  const m = window.__game.mic, o = { quiet: 0, normal: 0, shout: 0, shouts: 0, noisy: 0, loud: 0, n: 0, floor: [], band: -100, raw: -100, wMax: -100 };
  const t0 = m.t;
  while (m.t - t0 < secs) {
    await new Promise((r) => setTimeout(r, 40));
    o[m.level]++; o.n++; if (m.noise) o[m.noise]++;
    if (m.takeShout()) o.shouts++;
    o.band = Math.max(o.band, m.db); o.raw = Math.max(o.raw, m.rawDb); o.wMax = Math.max(o.wMax, m.whisperDb);
    if (o.n % 10 === 0) o.floor.push(+m.floorDb.toFixed(1));
  }
  o.floorNow = +m.floorDb.toFixed(1); o.whisperDb = +m.whisperDb.toFixed(1); o.own = +m.whisperOwn.toFixed(1);
  return o;
}, secs);

// ---------- deterministic: the floor's math and the speech signs, a level fed at 30, 72 and 10 analyses / s ----------
test('street, deterministic (30, 72, 10 analyses / s): a silent street is no voice, a slowly coming car neither; talking and a shout over it are; the boundaries follow the floor up to +8 dB; a quiet room keeps its boundaries; back in quiet a whisper is a whisper within 2 s', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate(async (cal) => {
    const { Mic } = await import('./src/audio/mic.js');
    const out = {};
    for (const hz of [30, 72, 10]) {
      const m = new Mic();
      m.state = 'on'; m.cal = { ...cal }; m.calibrated = true; m.stale = false;
      let v = -62, t = 0, k0 = 0;
      const rnd = () => Math.random() - 0.5;
      m.feed = () => v;
      // run secs of analyses; fn(tt) sets the level; counts the levels after `skip` s
      const run = (secs, fn, skip = 0) => {
        const c = { quiet: 0, normal: 0, shout: 0, shouts: 0, loud: 0, noisy: 0 };
        for (let k = 0; k < Math.round(secs * hz); k++) {
          const tt = (k + 1) / hz; t += 1 / hz; k0++;
          fn(tt); m.update(1 / hz);
          if (m.takeShout()) c.shouts++;
          if (tt >= skip) { c[m.level]++; if (m.noise) c[m.noise]++; }
        }
        return c;
      };
      const o = {};
      // a quiet room: the boundaries are the calibrated ones (regression: ±1 dB, here exactly)
      run(3, () => { v = -62 + rnd(); });
      o.roomWhisper = +m.whisperDb.toFixed(2); o.roomShout = +m.shoutDb.toFixed(2); o.ownWhisper = +m.whisperOwn.toFixed(2); o.ownShout = +m.shoutOwn.toFixed(2);
      o.room = run(2, (tt) => { v = (tt * 4) % 1 < 0.5 ? -46 : -55; });   // a whisper in the room: «ШЕПІТ»
      o.roomTalk = run(2, (tt) => { v = (tt * 4) % 1 < 0.5 ? -30 : -40; }); run(1, () => { v = -62 + rnd(); });
      // into the street: the noise rises to -54 (8 dB over home) with slow gusts ±1.5 dB; silent
      o.street = run(20, (tt) => { v = -54 + 1.5 * Math.sin(tt * 2 * Math.PI * 0.3) + rnd(); });
      o.streetFloor = +m.floorDb.toFixed(1); o.streetWhisper = +m.whisperDb.toFixed(1);
      // a car comes closer: +12 dB in 3 s, then away
      o.car = run(6, (tt) => { v = -54 + (tt < 3 ? 4 * tt : Math.max(0, 12 - 6 * (tt - 3))) + rnd(); });
      // talking over the street: your usual voice (-30) in syllables, the street between them
      o.talk = run(3, (tt) => { v = (tt * 4) % 1 < 0.55 ? -30 : -48; }, 1);
      run(2, () => { v = -54 + rnd(); });
      // a shout over the street
      o.shout = run(1.5, () => { v = -14 + rnd(); });
      run(3, () => { v = -54 + rnd(); });
      // very noisy: a loud road 20 dB over home — the boundaries stop at the ceiling, «дуже шумно»
      o.loud = run(25, () => { v = -42 + rnd(); }, 15);
      o.loudWhisper = +m.whisperDb.toFixed(2); o.loudRaise = +m.noiseRaise.toFixed(2);
      // back home: within 2 s a whisper is a whisper again
      run(2, () => { v = -62 + rnd(); });
      o.back = run(1, (tt) => { v = (tt * 4) % 1 < 0.5 ? -46 : -55; });
      o.backWhisper = +m.whisperDb.toFixed(1);
      out[hz] = o;
    }
    return out;
  }, CAL);
  for (const [hz, o] of Object.entries(r)) {
    const J = JSON.stringify(o);
    assert.equal(o.roomWhisper, o.ownWhisper, `${hz}: a quiet room keeps the calibrated voice boundary ${J}`);
    assert.equal(o.roomShout, o.ownShout, `${hz}: ...and the shout threshold ${J}`);
    assert.ok(Math.abs(o.roomWhisper - -39.9) < 1 && Math.abs(o.roomShout - -23.7) < 1, `${hz}: the same numbers as before the street (±1 dB) ${J}`);
    assert.equal(o.room.normal + o.room.shout, 0, `${hz}: a whisper in the room is «ШЕПІТ» ${J}`);
    assert.ok(o.roomTalk.normal > 0, `${hz}: talking in the room is a voice ${J}`);
    assert.equal(o.street.normal + o.street.shout, 0, `${hz}: a silent street is no voice ${J}`);
    assert.ok(o.streetFloor > -58 && o.streetFloor < -53, `${hz}: the floor followed the street ${J}`);
    assert.ok(o.streetWhisper > o.roomWhisper + 3 && o.streetWhisper <= o.roomWhisper + 8 + 1e-9, `${hz}: the boundary rose with the floor, at most +8 ${J}`);
    assert.equal(o.street.loud, 0, `${hz}: an ordinary street is not «дуже шумно» ${J}`);
    assert.equal(o.car.normal + o.car.shout, 0, `${hz}: a car coming closer is no voice ${J}`);
    assert.ok(o.talk.normal >= o.talk.quiet, `${hz}: talking over the street is a voice ${J}`);
    assert.ok(o.shout.shouts >= 1, `${hz}: a shout over the street is a shout ${J}`);
    assert.ok(Math.abs(o.loudRaise - 8) < 1e-9 && Math.abs(o.loudWhisper - (o.ownWhisper + 8)) < 1e-6, `${hz}: very noisy: the boundaries stay at the ceiling (+8) ${J}`);
    assert.ok(o.loud.loud > 0 && o.loud.normal + o.loud.shout === 0, `${hz}: «дуже шумно», and the steady roar is no voice ${J}`);
    assert.ok(o.back.normal + o.back.shout === 0 && o.backWhisper < o.roomWhisper + 1, `${hz}: back in quiet: a whisper within 2 s ${J}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the round: «дуже шумно» -> a warning at 3 s, the round without the microphone at 10 s ----------
test('very noisy in a round (Р-Ш1 = А): a warning after 3 s, after 10 s «Тут дуже шумно…» and the round goes without the microphone — to its end, also after the noise is gone; a gust shorter than 3 s is nothing; the result says why; the next round starts with the microphone', async () => {
  const ctx = await newContext(browser, { permissions: ['microphone'] });
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), CAL);
  const { page, errors } = await open(ctx, base);
  await page.click('#micbtn'); await page.waitForFunction(() => window.__game.mic.state === 'on');
  const r = await page.evaluate(() => {
    const g = window.__game, m = g.mic;
    window.__v = -62; m.feed = () => window.__v + Math.random() - 0.5;
    g.newRound(); g.playing = true; g.player.teleport(0, 2, 0); g.sim(1.5);   // away from the van: the clock starts
    const o = { phase: g.round.phase };
    // (the floor rises 1.5 dB/s: from -62 it takes several seconds to say «дуже шумно» — more than +8 dB would be needed)
    const untilLoud = () => { for (let i = 0; i < 300 && m.noise !== 'loud'; i++) g.sim(0.1); return m.noise; };
    // a short noise: a second of «дуже шумно», then quiet — nothing
    window.__v = -30; o.gustLoud = untilLoud(); g.sim(1); window.__v = -62; g.sim(4);
    o.gust = { off: g.micOffRound, loud: g.micLoudRound, warned: /дуже шумно/.test(g.flashText) };
    // very noisy: 4 s of «дуже шумно» -> the warning only; 11 s -> the round goes without the microphone
    window.__v = -30; untilLoud(); g.sim(4);
    o.warn = { flash: g.flashText, off: g.micOffRound, noise: m.noise };
    g.sim(7);
    o.off = { flash: g.flashText, off: g.micOffRound, loud: g.micLoudRound, status: m.status };
    // quiet again: the round stays without the microphone
    window.__v = -62; g.sim(5);
    o.after = { off: g.micOffRound, loud: g.micLoudRound, status: m.status };
    // the next round: heard again
    g.newRound();
    o.next = { off: g.micOffRound, loud: g.micLoudRound };
    return o;
  });
  assert.equal(r.phase, 'heist');
  assert.equal(r.gustLoud, 'loud', JSON.stringify(r));
  assert.deepEqual([r.gust.off, r.gust.loud, r.gust.warned], [false, false, false], `a gust under 3 s is nothing ${JSON.stringify(r)}`);
  assert.match(r.warn.flash, /Тут дуже шумно: гра не відрізняє твій голос від шуму\. Знайди тихіше місце\./, JSON.stringify(r.warn));
  assert.equal(r.warn.off, false, 'only a warning at 4 s');
  assert.match(r.off.flash, /Ця вилазка йде без мікрофона/, JSON.stringify(r.off));
  assert.deepEqual([r.off.off, r.off.loud, r.off.status], [true, true, 'loud']);
  assert.deepEqual([r.after.off, r.after.loud], [true, true], 'the round stays without the microphone after the noise is gone');
  assert.equal(r.after.status, 'ok');
  assert.deepEqual([r.next.off, r.next.loud], [false, false], 'the next round is heard from its start');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('very noisy: the result says «Вилазка без мікрофона: було дуже шумно.»; the menu line says it before the round; the HUD shows the level over the floor and «шумно»', async () => {
  const ctx = await newContext(browser, { permissions: ['microphone'] });
  await ctx.addInitScript((cal) => localStorage.setItem('nocturne.mic', JSON.stringify(cal)), CAL);
  const { page, errors } = await open(ctx, base);
  await page.click('#micbtn'); await page.waitForFunction(() => window.__game.mic.state === 'on');
  const r = await page.evaluate(() => {
    const g = window.__game, m = g.mic;
    window.__v = -62; m.feed = () => window.__v + Math.random() - 0.5;
    g.sim(2);
    const o = {};
    // noisy (the floor 6 dB over home): the mark, still «✓»
    window.__v = -56; g.sim(12);
    o.noisy = { status: m.status, noise: m.noise };
    // very noisy, before the round: the menu line
    window.__v = -30; g.sim(16);
    o.loud = { status: m.status };
    return o;
  });
  assert.deepEqual(r.noisy, { status: 'noisy', noise: 'noisy' }, JSON.stringify(r));
  assert.equal(r.loud.status, 'loud');
  await page.evaluate(() => window.__game.start.tick(1));
  await page.waitForFunction(() => /Тут дуже шумно/.test(document.getElementById('mmmicline').textContent), null, { timeout: 5000 });
  assert.equal(await page.locator('#mmmic button').isHidden(), true, 'no «Налаштувати»: a calibration does not help with noise');
  // the result
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.newRound(); g.playing = true; g.player.teleport(0, 2, 0); g.sim(13);
    return { loud: g.micLoudRound, phase: g.round.phase };
  });
  assert.equal(res.loud, true, JSON.stringify(res));
  const s = await page.evaluate(async () => (await import('./src/systems/micAuto.js')).noMicText());
  assert.equal(s, 'Вилазка без мікрофона: було дуже шумно.');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- Р-Ш2: an old calibration (the whole sound) is asked to be redone once ----------
test('Р-Ш2 = А: a calibration from before the speech band — the card asks once to redo it; until then the standard distances from the live floor; a new calibration is in the speech band', async () => {
  const ctx = await newContext(browser, { permissions: ['microphone'] }, { menu: true });
  const OLD = { floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152, bleed: -40 };
  await ctx.addInitScript((cal) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('nocturne.mic', JSON.stringify(cal)); sessionStorage.setItem('seeded', '1'); } }, OLD);
  const { page, errors } = await open(ctx, base + '?nosplash=1');
  await page.waitForFunction(() => !document.getElementById('micask').hidden, null, { timeout: 15000 });
  assert.equal(await page.textContent('#micask h2'), 'Мікрофон оновлено');
  assert.match(await page.textContent('#micask p'), /відрізняє твій голос від шуму вулиці.*30 секунд/);
  assert.equal(await page.locator('#asknone').isHidden(), true);
  const m = await page.evaluate(() => { const m = window.__game.mic; return { stale: m.stale, calibrated: m.calibrated, status: m.status, whisper: m.whisperDb, own: m.own.floor }; });
  assert.deepEqual([m.stale, m.calibrated, m.status], [true, true, 'willStart'], 'still set up: the microphone comes back by itself (Б1)');
  assert.ok(Math.abs(m.whisper - (-62 + 15)) < 1e-6 && m.own === -62, `the standard distances until the new calibration ${JSON.stringify(m)}`);
  await page.click('#asklater');
  // once: not again after a reload
  await page.reload(); await page.waitForFunction(() => window.__game, null, { polling: 200 });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#micask').isHidden(), true, 'asked once');
  // with the microphone on: «налаштуй ще раз» in the menu line, with the button
  await page.evaluate(() => window.__game.mic.enable());
  await page.waitForFunction(() => window.__game.mic.state === 'on');
  assert.equal(await page.evaluate(() => window.__game.mic.status), 'recal');
  // a new calibration: the speech band, not stale
  const after = await page.evaluate(() => { const m = window.__game.mic; m.setCalibration({ floor: -60, normal: -30, whisper: -47 }); return { saved: JSON.parse(localStorage.getItem('nocturne.mic')), stale: m.stale, status: m.status }; });
  assert.deepEqual([after.saved.band, after.stale, after.status], [1, false, 'ok'], JSON.stringify(after));
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the real filter: synthetic sounds through the fake microphone ----------
test('street WAV (real speech-band filter): wind and a far road, raw about -28 dB, silent — no «ГОЛОС», no «тебе чути», not very noisy (the owner\'s Samsung 22.11)', async () => {
  const ctx = await newContext(browser, micPhone);
  const cal = { floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152, band: 1, bleed: -80 };   // the owner's Android calibration
  await ctx.addInitScript((c) => localStorage.setItem('nocturne.mic', JSON.stringify(c)), cal);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  const o = await watch(page, 16);
  const J = JSON.stringify(o);
  assert.ok(o.raw > -32 && o.raw < -20, `the whole sound is as loud as the owner's street ${J}`);
  assert.ok(o.band < o.raw - 6, `the speech band drops the wind ${J}`);
  assert.equal(o.normal + o.shout, 0, `a silent street is no voice ${J}`);
  assert.equal(o.loud, 0, `not «дуже шумно» ${J}`);
  assert.deepEqual(errors, []);
  await ctx.close();
}, { wav: windWav });

test('street WAV: talking over the wind is «ГОЛОС», a shout is «КРИК!», the silence between is not', async () => {
  const ctx = await newContext(browser, micPhone);
  const cal = { floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152, band: 1, bleed: -80 };
  await ctx.addInitScript((c) => localStorage.setItem('nocturne.mic', JSON.stringify(c)), cal);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  // two loops of the 14.5 s recording: what each level was while each part played (by the loop's clock)
  const o = await page.evaluate(async () => {
    const m = window.__game.mic, parts = { street: [0, 5], talk: [5.6, 8], gap: [8.6, 10], shout: [10, 11.5], after: [12.3, 14.5] };
    const out = Object.fromEntries(Object.keys(parts).map((k) => [k, { quiet: 0, normal: 0, shout: 0 }]));
    // the loop's start: the first sharp rise of the shout (the loudest moment)
    const t0 = performance.now();
    let base = null, prev = -100;
    while (performance.now() - t0 < 32000) {
      await new Promise((r) => setTimeout(r, 30));
      if (base === null && prev < -14 && m.db > -11) base = (performance.now() - t0) / 1000 - 10;
      prev = m.db;
      if (base === null) continue;
      const lt = (((performance.now() - t0) / 1000 - base) % 14.5 + 14.5) % 14.5;
      for (const [k, [a, b]] of Object.entries(parts)) if (lt >= a && lt < b) out[k][m.level]++;
    }
    return { out, base, floor: +m.floorDb.toFixed(1), whisperDb: +m.whisperDb.toFixed(1), shoutDb: +m.shoutDb.toFixed(1) };
  });
  const J = JSON.stringify(o);
  assert.ok(o.out.talk.normal > o.out.talk.quiet, `talking over the street is a voice ${J}`);
  assert.ok(o.out.shout.shout + o.out.after.shout > 0, `a shout is a shout (its label holds a moment after it) ${J}`);
  assert.equal(o.out.street.normal + o.out.street.shout, 0, `the silent street before is no voice ${J}`);
  assert.deepEqual(errors, []);
  await ctx.close();
}, { wav: talkWav });

test('music next to the microphone (the cheat): the boundaries rise at most +8 dB, «дуже шумно», and in a round the round goes without the microphone — no way to talk freely under it', async () => {
  const ctx = await newContext(browser, micPhone);
  await ctx.addInitScript((c) => localStorage.setItem('nocturne.mic', JSON.stringify(c)), CAL);
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  await micOn(page, cdp);
  const o = await watch(page, 20);
  const J = JSON.stringify(o);
  assert.ok(o.wMax <= o.own + 8 + 1e-6, `the boundary never more than +8 over yours ${J}`);
  assert.ok(o.loud > 0, `«дуже шумно» ${J}`);
  const r = await page.evaluate(async () => {
    const g = window.__game;
    g.newRound(); g.playing = true; g.player.teleport(0, 2, 0);
    const t0 = performance.now();
    while (!g.micLoudRound && performance.now() - t0 < 30000) await new Promise((res) => setTimeout(res, 100));
    return { loud: g.micLoudRound, off: g.micOffRound };
  });
  assert.deepEqual(r, { loud: true, off: true }, `the round goes without the microphone ${J}`);
  assert.deepEqual(errors, []);
  await ctx.close();
}, { wav: musicWav });
