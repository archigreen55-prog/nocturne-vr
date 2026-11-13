// The dacha yard's sounds (claude/dacha-window): a puddle's splash must carry to the house — the guard in the
// living room hears a walking (and a running) splash from every puddle and goes to look; a creeping one is
// only a soft plop near the house. (The microphone rule and the bus levels are in yard-stage1.test.mjs.)
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

test('puddle: a walking and a running splash reach the guard anywhere in the living room from EVERY puddle (the guard hears it and goes to look); a creeping one does not reach the far rooms', async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; });
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, W = g.CFG.style.water.dacha.filter((w) => !w.rings), p = g.patrol, out = { walk: [], run: [], creep: [], e2e: null, room: g.level.roomAt(1.5, -8) };
    g.playing = true; g.newRound(); g.sim(0.1);
    // a real splash: the player walks through the puddle's middle at `mps`; the last splash event of the noise log
    const splash = (w, mps) => {
      const dx = mps / 72;
      g.noise.log.length = 0; g.player.teleport(w.x - 0.3, w.z, 0); g.sim(1 / 72);
      for (let i = 1; i <= 80 && !g.noise.log.some((e) => e.kind === 'splash'); i++) { g.player.teleport(w.x - 0.3 + dx * i, w.z, 0); g.sim(1 / 72); }
      return g.noise.log.filter((e) => e.kind === 'splash').pop();
    };
    // the living room: x -2..5, z -14..-7 — the guard's three points and the corners
    const spots = [[1.5, -8], [-0.9, -12.6], [3.9, -9], [-1.8, -7.2], [4.8, -13.8], [-1.8, -13.8], [4.8, -7.2]];
    const hears = (e, s) => { p.x = s[0]; p.z = s[1]; p.y = 0; return p.audible(e, 0.03) > 0; };
    for (const w of W) {
      const walk = splash(w, g.CFG.player.maxSpeed - 0.05), run = splash(w, g.CFG.sprint.speed - 0.05), creep = splash(w, 0.7);
      out.walk.push({ at: [w.x, w.z], r: +walk.radius.toFixed(1), heard: spots.map((s) => hears(walk, s)) });
      out.run.push({ at: [w.x, w.z], r: +run.radius.toFixed(1), heard: spots.map((s) => hears(run, s)) });
      out.creep.push({ at: [w.x, w.z], r: +creep.radius.toFixed(1), heard: spots.map((s) => hears(creep, s)) });
    }
    // end to end: the guard sits in the living room, the player walks through the FARTHEST puddle; the guard reacts
    const far = W.reduce((a, b) => (Math.hypot(b.x - 1.5, b.z + 8) > Math.hypot(a.x - 1.5, a.z + 8) ? b : a));
    g.newRound(); g.sim(0.1);
    p.x = 1.5; p.z = -8; p.y = 0; p.reset && 0; p.state = 'task'; p.meter = 0;
    out.before = p.state;
    splash(far, g.CFG.player.maxSpeed - 0.05);
    for (let i = 0; i < 20; i++) g.sim(1 / 30);
    out.e2e = { state: p.state, suspicion: +g.alert.suspicion.toFixed(1), far: [far.x, far.z] };
    return out;
  });
  assert.equal(r.room, 'Вітальня');
  for (const kind of ['walk', 'run']) for (const w of r[kind]) assert.ok(w.heard.every(Boolean), `${kind}, puddle ${w.at}: radius ${w.r} m — heard at the living room's spots ${JSON.stringify(w.heard)}`);
  assert.ok(r.run[0].r > r.walk[0].r, 'running splashes louder than walking');
  for (const w of r.creep) assert.ok(!w.heard.every(Boolean), `creeping, puddle ${w.at}: radius ${w.r} m — a soft plop must not reach the whole living room`);
  assert.equal(r.before, 'task');
  assert.notEqual(r.e2e.state, 'task', `the guard in the living room reacted to the splash from the farthest puddle: ${JSON.stringify(r.e2e)}`);
  assert.ok(r.e2e.suspicion > 0 || r.e2e.state !== 'task', 'and the noise counted');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('crickets: three of them in different places of the yard; each sings in bouts of 1–3 s (clicks in chirps, a soft start and fade) with random pauses of 2–8 s, its own pitch; no click at the start; loudness near the old song\'s peak; off by the config switch', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const P = await import('./src/audio/placeSfx.js'), A = await import('./src/audio/audio.js'), { zoneOf } = await import('./src/systems/placeSound.js'), g = window.__game, CS = g.CFG.placeSound.crickets;
    const out = { spots: CS.spots.map(([x, z]) => zoneOf(x, z)), apart: Math.min(...CS.spots.flatMap((a, i) => CS.spots.slice(i + 1).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))), on: CS.on };
    // offline: one cricket for 60 s through the real scheduler (PlaceAmbience.sing)
    const SR = 44100, T = 60;
    const render = async () => {
      const oc = new OfflineAudioContext(1, SR * T, SR), q = { v: { input: oc.destination }, f: CS.carrier[0] + Math.random() * (CS.carrier[1] - CS.carrier[0]), next: Math.random() * 3 };
      while (q.next < T - 4) P.PlaceAmbience.prototype.sing.call({ c: oc }, q);
      return { d: (await oc.startRendering()).getChannelData(0), f: q.f };
    };
    const group = (arr, gap) => { const o = []; for (const t of arr) { if (o.length && t - o[o.length - 1][o[o.length - 1].length - 1] <= gap) o[o.length - 1].push(t); else o.push([t]); } return o; };
    const analyse = ({ d, f }) => {
      const w = Math.round(SR * 0.004), env = new Float32Array(d.length); let acc = 0, mx = 0;
      for (let i = 0; i < d.length; i++) { acc += Math.abs(d[i]); if (i >= w) acc -= Math.abs(d[i - w]); env[i] = acc / w; mx = Math.max(mx, env[i]); }
      const pulses = [], amp = new Map(); for (let i = 1; i < env.length - 1; i++) if (env[i] > mx * 0.08 && env[i] >= env[i - 1] && env[i] > env[i + 1] && (!pulses.length || i / SR - pulses[pulses.length - 1] > 0.018)) { pulses.push(i / SR); amp.set(i / SR, env[i]); }
      const bouts = group(pulses, 0.6), chirps = group(pulses, 0.07);
      // soft start / fade: in a long bout the first and the last click are clearly quieter than the loudest of that bout
      const soft = bouts.filter((b) => b[b.length - 1] - b[0] > 2).map((b) => { const m = Math.max(...b.map((t) => amp.get(t))); return [amp.get(b[0]) / m, amp.get(b[b.length - 1]) / m]; });
      let top = 0; for (let i = 0; i < d.length; i++) top = Math.max(top, Math.abs(d[i]));
      let best = 0, bi = 0; for (let i = 0; i + 2205 < env.length; i += 441) { let s = 0; for (let j = 0; j < 2205; j += 5) s += env[i + j]; if (s > best) { best = s; bi = i; } }
      let zc = 0; for (let j = bi + 1; j < bi + 2205; j++) if ((d[j - 1] < 0) !== (d[j] < 0)) zc++;
      return { f, pitch: zc / 2 / 0.05, bouts: bouts.map((b) => b[b.length - 1] - b[0]), pauses: bouts.slice(1).map((b, i) => b[0] - bouts[i][bouts[i].length - 1]),
        clicksPerChirp: chirps.map((c) => c.length), gapMs: chirps.filter((c) => c.length > 2).map((c) => 1000 * (c[c.length - 1] - c[0]) / (c.length - 1)), soft, peak: top };
    };
    out.runs = []; for (let i = 0; i < 3; i++) out.runs.push(analyse(await render()));
    // the bus: the crickets alone, the loudest bit against the patrol's step (the rule: far under it)
    const C = g.CFG.placeSound; for (const z of ['yard', 'lane']) { C.ambience.wind[z] = 0; C.ambience.traffic[z] = 0; }
    A.unlockAudio(); await new Promise((x) => setTimeout(x, 300));
    const lvl = async (fn, ms) => { fn(); let m = -100; const t0 = performance.now(); while (performance.now() - t0 < ms) { m = Math.max(m, A.gameBusDb()); await new Promise((x) => setTimeout(x, 8)); } return m; };
    out.step = await lvl(() => A.playStep(new A.Voice3D(1, false), 1), 400);
    const amb = new P.PlaceAmbience(); amb.update(0.1, 'yard', true); await new Promise((x) => setTimeout(x, 3000));
    out.song = await (async () => { let m = -100; const t0 = performance.now(); while (performance.now() - t0 < 14000) { amb.update(0.05, 'yard', true); m = Math.max(m, A.gameBusDb()); await new Promise((x) => setTimeout(x, 8)); } return m; })();   // update() is the game's 10 Hz tick: it schedules the bouts
    out.gain = amb.gains().crickets; out.voices = amb.layers.crickets.cr.length;
    amb.update(0.1, 'yard', false); await new Promise((x) => setTimeout(x, 3500));
    // switched off in the config: no crickets at all
    CS.on = false; const off = new P.PlaceAmbience(); off.update(0.1, 'yard', true); out.offVoices = off.layers.crickets.cr.length; CS.on = true;
    return out;
  });
  assert.deepEqual(r.spots, ['yard', 'yard', 'yard'], 'the three crickets sit in the yard');
  assert.ok(r.apart > 5, `in different places (${r.apart.toFixed(1)} m apart)`);
  assert.equal(r.voices, 3);
  const bouts = r.runs.flatMap((x) => x.bouts), pauses = r.runs.flatMap((x) => x.pauses);
  assert.ok(bouts.length >= 12, `bouts in 3 x 60 s: ${bouts.length}`);
  assert.ok(bouts.every((b) => b >= 0.3 && b <= 3.2), `bouts last 1–3 s (the faded edges are quieter): ${bouts.map((b) => b.toFixed(1))}`);
  assert.ok(Math.max(...bouts) > 1.8 && Math.min(...bouts) < 1.6, 'and they differ in length');
  assert.ok(pauses.every((p) => p >= 1.4 && p <= 9.5), `random pauses 2–8 s (the detector misses the faded tails, so up to ~1 s more): ${pauses.map((p) => p.toFixed(1))}`);
  assert.ok(Math.max(...pauses) - Math.min(...pauses) > 2, 'the pauses are not all alike');
  const gaps = r.runs.flatMap((x) => x.gapMs), clicks = r.runs.flatMap((x) => x.clicksPerChirp);
  const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];   // the faded edges of a bout lose a click or two to the detector, so the typical gap
  assert.ok(med > 26 && med < 34 && gaps.filter((g) => g > 20 && g < 45).length / gaps.length > 0.8, `clicks ~30 ms apart: median ${med.toFixed(1)} ms`);
  assert.ok(clicks.filter((c) => c >= 3 && c <= 5).length / clicks.length > 0.8, `chirps of 3–5 clicks: ${[...new Set(clicks)]}`);
  for (const x of r.runs) assert.ok(Math.abs(x.pitch - x.f) / x.f < 0.04, `the pitch is its own: ${x.pitch.toFixed(0)} vs ${x.f.toFixed(0)} Hz`);
  assert.ok(new Set(r.runs.map((x) => Math.round(x.f / 20))).size > 1, 'the crickets differ in pitch');
  const soft = r.runs.flatMap((x) => x.soft);
  a < 0.8 && z < 0.8), `a long bout swells in and fades out (the first / last click vs the loudest): ${soft.map(([a, z]) => `${a.toFixed(2)}/${z.toFixed(2)}`)}`);
  assert.ok(r.song <= r.step - 15, `the song is far under the patrol step: ${r.song.toFixed(1)} vs ${r.step.toFixed(1)} dB`);
  assert.ok(r.song > -48, `and can be heard (the old song's peak was -38 dB): ${r.song.toFixed(1)} dB`);
  assert.equal(r.offVoices, 0, 'crickets: { on: false } = no crickets');
  assert.deepEqual(errors, []);
  await ctx.close();
});
