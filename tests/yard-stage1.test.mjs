// The dacha's yard, stage 1 (claude/dacha-yard-stage1): cover by the porch (a barrel, crates), the gate as a door,
// puddles that splash, the place's sounds under the microphone rule, level 0's guide.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

const campaignCtx = async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; });
  return ctx;
};

test('yard stage 1: the barrel and the crates by the porch hide a crouching thief from the guard on the porch, not a standing one; nothing stands on the gnome, the path or the stones', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, L = g.level, Y = await import('./src/world/yard.js'), out = {};
    const eye = [0, 1.7, 1.6];
    const hid = (x, z, y) => L.losBlocked(eye[0], eye[1], eye[2], x, y, z);
    const behind = (x, z, r) => { const d = Math.hypot(x - eye[0], z - eye[2]); return [x + (x - eye[0]) / d * (r + 0.35), z + (z - eye[2]) / d * (r + 0.35)]; };
    const B = Y.COVER.barrel, [bx, bz] = behind(B.x, B.z, B.r);
    out.barrel = { crouched: hid(bx, bz, 0.75), standing: hid(bx, bz, 1.65) };
    const K = Y.COVER.crates, cx = (K.x0 + K.x1) / 2, cz = (K.z0 + K.z1) / 2, [kx, kz] = behind(cx, cz, 0.55);
    out.crates = { crouched: hid(kx, kz, 0.75), standing: hid(kx, kz, 1.65) };
    // the gnome (config/items.js) stands by the back step: the barrel is not on it
    const gn = g.loot.items.find((i) => i.def.id === 'gnome');
    out.gnomeClear = Math.hypot(gn.def.pos[0] - B.x, gn.def.pos[2] - B.z) > B.r + 0.6;
    // the guard's way (nav) from the porch to its points is not shut by the new cover
    out.reach = [[-5, 3.2], [6.5, 3.2], [1.4, 3.8]].map(([x, z]) => g.nav.path(0, 1.6, x, z).length);
    return out;
  });
  assert.deepEqual(r.barrel, { crouched: true, standing: false });
  assert.deepEqual(r.crates, { crouched: true, standing: false });
  assert.equal(r.gnomeClear, true);
  assert.ok(r.reach.every((n) => n >= 1 && n <= 3), JSON.stringify(r.reach));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard stage 1: the gate is a door — shut it stops a body and the sight, open it lets you through; a quick swing creaks (a noise heard from the porch), a slow one is silent; no trap goes on it and the guards leave it alone', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, L = g.level, out = {}, gate = L.doors.find((d) => d.gate);
    out.found = !!gate; out.last = L.doors.at(-1) === gate; out.locked = gate.locked;
    // shut: a body at the gate's line is pushed off; the sight line through the gap is stopped
    const [sx, sz] = L.resolve(3.0, 8.98, 0.25);
    out.shutPushed = Math.abs(sz - 8.98) > 0.05;
    out.shutBlocksSight = L.losBlocked(3.0, 1.7, 7.5, 3.0, 1.0, 10.5);
    g.playing = true; g.newRound(); g.sim(0.1);
    g.player.teleport(3.0, 10.2, 0); g.sim(0.05);
    const T = await import('./src/systems/doors.js');
    out.nearest = T.nearestDoor(3.0, 10.2, 1.6, 0) === gate;
    // quick swing
    g.noise.log.length = 0;
    gate.lastUser = 'player'; gate.toggle(3.0, 10.2, g.CFG.doors.fastTime);
    for (let i = 0; i < 60; i++) g.sim(1 / 30);
    const fast = g.noise.log.filter((e) => e.kind === 'door' && Math.hypot(e.x - gate.cx, e.z - gate.cz) < 0.5);
    out.fast = fast.map((e) => +e.radius.toFixed(1));
    out.openedBy = gate.open;
    const [ox, oz] = L.resolve(3.0, 8.98, 0.25);
    out.openPasses = Math.abs(oz - 8.98) < 0.01;
    out.openSight = !L.losBlocked(3.0, 1.7, 7.5, 3.0, 1.0, 10.5);
    // close, then a slow swing
    gate.toggle(3.0, 10.2, g.CFG.doors.fastTime); for (let i = 0; i < 60; i++) g.sim(1 / 30);
    g.noise.log.length = 0;
    gate.toggle(3.0, 10.2, g.CFG.doors.slowTime);
    for (let i = 0; i < 100; i++) g.sim(1 / 30);
    out.slow = g.noise.log.filter((e) => e.kind === 'door' && Math.hypot(e.x - gate.cx, e.z - gate.cz) < 0.5).length;
    // the porch is within the creak: the guard on the porch is 9 m away, the leash 4.5 m
    out.heardFromLeash = out.fast.length ? out.fast[0] > (9 - g.level.leash.maxZ) : false;
    return out;
  });
  assert.equal(r.found && r.last, true, 'the gate is the last door');
  assert.equal(r.locked, false);
  assert.equal(r.shutPushed, true, 'a body cannot walk through the shut gate');
  assert.equal(r.shutBlocksSight, true, 'the shut gate stops the sight');
  assert.equal(r.nearest, true, 'the door button finds it');
  assert.ok(r.fast.length >= 1 && r.fast[0] >= 4.5 && r.fast[0] <= 9, `a quick swing creaks ${JSON.stringify(r.fast)}`);
  assert.equal(r.openedBy, true); assert.equal(r.openPasses, true); assert.equal(r.openSight, true);
  assert.equal(r.slow, 0, 'a slow swing is silent');
  assert.equal(r.heardFromLeash, true, JSON.stringify(r.fast) + 'a quick creak carries to where the guard may stand (4.5 m from the house, 4.5 m from the gate)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard stage 1: a puddle splashes — a step in it is a noise (louder than a step at that speed, also at a silent speed), outside it nothing; no puddle lies on the fence', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {}, W = g.CFG.style.water.dacha.filter((w) => !w.rings);
    out.n = W.length;
    out.offFence = W.every((w) => w.z + w.r < 8.9 && w.z - w.r > 0.3);   // the fence is at z 9; the house at z 0
    g.playing = true; g.newRound(); g.sim(0.1);
    const walk = (x0, z0, dx, dz, frames) => {
      g.noise.log.length = 0; g.player.teleport(x0, z0, 0); g.sim(1 / 72);
      for (let i = 1; i <= frames; i++) { g.player.teleport(x0 + dx * i, z0 + dz * i, 0); g.sim(1 / 72); }   // one simulation step per move (1 / 72 s)
      return g.noise.log.filter((e) => e.kind === 'splash').map((e) => +e.radius.toFixed(1));
    };
    const P = W.find((w) => w.r >= 0.7), Q = W[W.length - 1];
    out.silent = walk(P.x - 0.5, P.z, 0.0125, 0, 80);   // 0.9 m/s: a silent speed (no step noise at all)
    out.fast = walk(P.x - 0.5, P.z, 0.025, 0, 40);   // 1.8 m/s
    out.dry = walk(P.x - 0.5 - 3, P.z, 0.0125, 0, 80);   // beside it
    out.still = (() => { g.noise.log.length = 0; g.player.teleport(Q.x, Q.z, 0); for (let i = 0; i < 80; i++) g.sim(1 / 72); return g.noise.log.filter((e) => e.kind === 'splash').length; })();
    out.min = g.CFG.puddle.minRadius;
    return out;
  });
  assert.ok(r.n >= 3, 'puddles on the dacha');
  assert.equal(r.offFence, true, 'no puddle on the fence or on the house wall');
  assert.ok(r.silent.length >= 1 && r.silent.every((x) => x >= r.min), `a silent speed splashes: ${JSON.stringify(r.silent)}`);
  assert.ok(r.fast.length >= 1 && Math.max(...r.fast) > Math.max(...r.silent), `louder when faster: ${JSON.stringify(r.fast)} vs ${JSON.stringify(r.silent)}`);
  assert.deepEqual(r.dry, [], 'dry ground is silent');
  assert.equal(r.still, 0, 'standing in a puddle is silent');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard stage 1: the microphone rule — no microphone: full volume and the ambience; microphone on with headphones (bleed measured low, or the setting): full volume, the ambience; microphone on and no sign of headphones: half volume, no ambience', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, m = g.mic, P = await import('./src/audio/placeSfx.js'), { saveSetting } = await import('./src/settings.js');
    const out = {}, snap = () => ({ risk: P.micRisk(m), k: P.placeK(m), amb: P.ambienceAllowed(m) });
    m.state = 'off'; out.off = snap();
    m.state = 'on'; m.noMic = true; out.noMic = snap();
    m.noMic = false; delete m.cal.bleed; out.unknown = snap();
    m.cal.bleed = -34; out.speaker = snap();                    // a phone speaker: measured, loud
    m.cal.bleed = -80; out.headphones = snap();                 // the game not heard at all
    m.deviceChanged = true; out.changed = snap(); m.deviceChanged = false;   // headphones came or went since the calibration
    delete m.cal.bleed; saveSetting('headphones', true); out.ticked = snap(); saveSetting('headphones', false);
    out.cfg = { k: g.CFG.placeSound.speakerK, bleed: g.CFG.placeSound.headphonesBleed };
    return out;
  });
  assert.deepEqual(r.off, { risk: 'none', k: 1, amb: true });
  assert.deepEqual(r.noMic, { risk: 'none', k: 1, amb: true });
  assert.deepEqual(r.unknown, { risk: 'speaker', k: r.cfg.k, amb: false });
  assert.deepEqual(r.speaker, { risk: 'speaker', k: r.cfg.k, amb: false });
  assert.deepEqual(r.headphones, { risk: 'headphones', k: 1, amb: true });
  assert.deepEqual(r.changed, { risk: 'speaker', k: r.cfg.k, amb: false }, 'devices changed since the calibration: no longer trusted');
  assert.deepEqual(r.ticked, { risk: 'headphones', k: 1, amb: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard stage 1: new sounds are quiet on the shared bus — a splash is under the patrol step of the calibration (and 5 dB lower again at the speaker rule), the ambience is far under it and fades in; the ambience is silent when the rule says speaker; the system plays nothing off the dacha', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const A = await import('./src/audio/audio.js'), P = await import('./src/audio/placeSfx.js'), g = window.__game;
    const c = A.unlockAudio(); await new Promise((x) => setTimeout(x, 300));
    const out = { state: c && c.state };
    const lvl = async (fn, ms) => { fn(); let m = -100, sum = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const d = A.gameBusDb(); if (d > m) m = d; sum += Math.pow(10, d / 10); n++; await new Promise((x) => setTimeout(x, 8)); } return { peak: m, mean: 10 * Math.log10(sum / n + 1e-12) }; };
    const v = new A.Voice3D(1, false);
    out.step = await lvl(() => A.playStep(v, 1), 400);
    out.splash = await lvl(() => P.playSplash({ x: 0, y: 0.05, z: 1 }, 1, 1), 500);
    out.splashSpeaker = await lvl(() => P.playSplash({ x: 0, y: 0.05, z: 1 }, 1, g.CFG.placeSound.speakerK), 500);
    const amb = new P.PlaceAmbience();
    amb.update(0.1, 'yard', false); out.notBuilt = amb.layers === null;     // the speaker rule: not even created
    amb.update(0.1, 'yard', true); await new Promise((x) => setTimeout(x, 2500)); amb.update(0.1, 'yard', true);
    out.ambience = await lvl(() => amb.update(0.1, 'yard', true), 2500);
    amb.update(0.1, 'yard', false); await new Promise((x) => setTimeout(x, 3500));
    out.after = amb.gains();   // asked to stop: the layers' gains fall to ~0
    out.ambOff = await lvl(() => amb.update(0.1, 'yard', false), 600);
    out.levels = amb.level;
    return out;
  });
  assert.equal(r.state, 'running');
  assert.ok(r.splash.peak <= r.step.peak - 6, `splash ${r.splash.peak.toFixed(1)} dB vs the patrol step ${r.step.peak.toFixed(1)}`);
  assert.ok(r.splash.peak > r.step.peak - 20, `the splash can be heard: ${r.splash.peak.toFixed(1)} dB`);
  assert.ok(r.splashSpeaker <= r.splash || r.splashSpeaker.peak <= r.splash.peak - 4, `at the speaker rule: ${r.splashSpeaker.peak.toFixed(1)} vs ${r.splash.peak.toFixed(1)}`);
  assert.equal(r.notBuilt, true);
  assert.ok(r.ambience.peak <= r.step.peak - 15 && r.ambience.mean <= r.step.mean - 8, `ambience peak ${r.ambience.peak.toFixed(1)} mean ${r.ambience.mean.toFixed(1)} vs step ${r.step.peak.toFixed(1)} / ${r.step.mean.toFixed(1)}`);
  assert.ok(r.after.crickets < 0.002 && r.after.wind < 0.002 && r.after.traffic < 0.002, `faded out: ${JSON.stringify(r.after)}`);
  assert.ok(r.ambOff.mean < -70, `silent when not allowed: ${r.ambOff.mean.toFixed(1)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard stage 1: level 0 only — chalk arrows, the beacon over the gate and one hint at the shut gate; the other levels have none; the lane is closed by shrubs and bins, not by thin air', async () => {
  const ctx = await campaignCtx();
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, out = {};
    g.playing = true; g.setContract('rehearsal'); g.newRound(); for (let i = 0; i < 4; i++) g.sim(1 / 30);
    const { G } = await import('./src/systems/state.js');
    out.l0 = G.yardGuide.visible; out.l0id = g.contract.id;
    g.setContract('first'); g.newRound(); for (let i = 0; i < 4; i++) g.sim(1 / 30);
    out.l1 = G.yardGuide.visible; out.l1id = g.contract.id;
    g.setContract('rehearsal'); g.newRound(); g.sim(0.1);
    // the hint at the shut gate (once)
    G.flashText = ''; g.player.teleport(3.0, 10.6, 0); for (let i = 0; i < 6; i++) g.sim(1 / 30);
    out.hint = G.flashText;
    G.flashText = ''; g.player.teleport(4.5, 10.6, 0); for (let i = 0; i < 4; i++) g.sim(1 / 30); g.player.teleport(3.0, 10.6, 0); for (let i = 0; i < 6; i++) g.sim(1 / 30);
    out.again = G.flashText;
    // nobody crosses the lane's end or its sides: walk at them step by step
    const go = (x, z, dx, dz) => { for (let i = 0; i < 70; i++) [x, z] = g.level.resolve(x + dx, z + dz, 0.25); return [x, z]; };
    out.edge = []; out.side = [];
    for (let x = -15; x <= 15; x += 1) { const [, z] = go(x, 20.5, 0, 0.05); if (z > 22.6) out.edge.push([x, +z.toFixed(2)]); }
    for (let z = 10.5; z <= 21; z += 1.5) { const [lx] = go(-14, z, -0.05, 0), [rx] = go(14, z, 0.05, 0); if (lx < -16.1 || rx > 16.1) out.side.push([z, +lx.toFixed(2), +rx.toFixed(2)]); }
    return out;
  });
  assert.equal(r.l0id, 'rehearsal'); assert.equal(r.l0, true, 'level 0 has the guide');
  assert.equal(r.l1id, 'first'); assert.equal(r.l1, false, 'level 1 has none');
  assert.match(r.hint, /Хвіртка зачинена/);
  assert.doesNotMatch(r.again, /Хвіртка зачинена/, 'the hint is once per round');
  assert.deepEqual(r.edge, [], 'the lane\'s end is closed');
  assert.deepEqual(r.side, [], 'the lane\'s sides are closed');
  assert.deepEqual(errors, []);
  await ctx.close();
});
