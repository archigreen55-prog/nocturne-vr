// The dacha's back window, the climb (claude/dacha-window): the button's zone, the path of the camera over the
// sill (not through the wall), the VR fade, the guest's climb the host refuses or the guard's catch cancels.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, UA } from './runner.mjs';

const dacha = base + '?map=dacha';

test('back window: the button is in the zone on both sides — shut or open, from any angle but the back to it — and nowhere else', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const r = await page.evaluate(async () => {
    const g = window.__game, bw = await import('./src/systems/backWindow.js'), Z = g.CFG.backWindow.zone;
    g.playing = true; g.sim(0.1);
    const w = g.level.doors.find((d) => d.window), out = { inside: [], outside: [] };
    const label = (x, z, yaw) => { g.player.teleport(x, z, yaw); g.sim(0.02); return bw.climbLabel(); };
    // inside the room (+z side of the wall z = -14): yaw 0 faces the window (north); outside: yaw π faces it (south)
    for (const open of [false, true]) {
      if (open) { w.angle = w.target = 1.3; w.updateTip(); }
      for (const [x, z, yaw] of [[4, -13.3, 0], [4.8, -13.1, 0.5], [3.2, -12.9, -0.6], [4, -12.9, 1.4], [4.85, -13.5, 0], [3.1, -13.4, -1.3],
        [4, -14.7, Math.PI], [4.8, -14.9, Math.PI - 0.5], [3.2, -15.1, Math.PI + 0.6], [4, -15.1, Math.PI - 1.4]]) out.inside.push({ open, x, z, yaw, label: label(x, z, yaw) });
    }
    w.angle = w.target = 0; w.updateTip();
    for (const [x, z, yaw, why] of [[4, -13.3, Math.PI, 'back to it'], [4, -11.5, 0, 'too far'], [6.2, -13.3, 0, 'beside it'], [1.5, -13.3, 0, 'beside it'], [4, -15.8, Math.PI, 'too far outside'], [4, -13.3, Math.PI - 0.1, 'back to it']])
      out.outside.push({ why, label: label(x, z, yaw) });
    out.expect = Z;
    return out;
  });
  for (const s of r.inside) assert.equal(s.label, 'Лізти у вікно', `in the zone: ${JSON.stringify(s)}`);
  for (const s of r.outside) assert.equal(s.label, null, `not in the zone: ${JSON.stringify(s)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window: the camera goes up, over the sill (>= 0.2 m above it) and down, in a curve; never through the wall; ends crouched; in and out, shut or open; the sash opens itself in silence', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const r = await page.evaluate(async () => {
    const g = window.__game, bw = await import('./src/systems/backWindow.js'), BW = g.CFG.backWindow, w = g.level.doors.find((d) => d.window);
    g.playing = true; g.sim(0.1);
    const heard = []; g.noise.on((e) => heard.push(e.kind));
    const run = (x, z, yaw, shut) => {
      if (shut) { w.angle = w.target = 0; w.updateTip(); }
      g.player.virtualCrouch = false; g.player.teleport(x, z, yaw); g.sim(0.5);
      bw.startClimb();
      const s = [], P = g.player;
      for (let i = 0; i < 90 && (i < 3 || bw.climbing()); i++) { g.sim(0.05); s.push({ t: i * 0.05, x: P.head.x, y: P.head.y - P.floorY, z: P.head.z, crouch: P.virtualCrouch, pitch: P.climbPitch, angle: w.angle }); }
      return s;
    };
    const wall = (p) => Math.abs(p.z - -14) < 0.16;   // inside the wall's thickness
    const res = {};
    for (const [name, x, z, yaw, shut] of [['in-shut', 4.0, -13.35, 0, true], ['out-open', 4.0, -14.65, Math.PI, false], ['in-shut-slide', 4.7, -13.2, 0.4, true]]) {
      const s = run(x, z, yaw, shut);
      const inWall = s.filter(wall);
      res[name] = {
        n: s.length, dur: +s.at(-1).t.toFixed(2), maxY: +Math.max(...s.map((p) => p.y)).toFixed(2), minYWall: inWall.length ? +Math.min(...inWall.map((p) => p.y)).toFixed(2) : null,
        alongWall: inWall.length ? +Math.max(...inWall.map((p) => Math.abs(p.x - 4))).toFixed(2) : null,
        endY: +s.at(-1).y.toFixed(2), endCrouch: s.at(-1).crouch, rose: s.some((p) => p.y > 1.5), startY: +s[0].y.toFixed(2),
        monotone: s.every((p, i) => i === 0 || Math.abs(p.y - s[i - 1].y) < 0.12), pitchMin: +Math.min(...s.map((p) => p.pitch)).toFixed(2),
        side: Math.sign(s.at(-1).z - -14), angle: +Math.abs(s.at(-1).angle).toFixed(2),
      };
    }
    res.heard = heard.filter((k) => k === 'door').length;
    res.sill = BW.sill;
    return res;
  });
  for (const [k, v] of Object.entries(r)) {
    if (!v || typeof v !== 'object' || v.n === undefined) continue;
    assert.ok(v.minYWall !== null && v.minYWall >= r.sill + 0.2, `${k}: over the sill by ≥ 0.2 m in the wall's thickness: ${JSON.stringify(v)}`);
    assert.ok(v.alongWall <= 0.5, `${k}: through the opening (the window is 1.1 m wide): ${JSON.stringify(v)}`);
    assert.ok(v.rose && v.maxY >= 1.5, `${k}: the camera rose: ${JSON.stringify(v)}`);
    assert.ok(v.endCrouch && v.endY < 1.2, `${k}: crouched at the end: ${JSON.stringify(v)}`);
    assert.ok(v.monotone, `${k}: no jumps in the camera's height: ${JSON.stringify(v)}`);
    assert.ok(v.pitchMin < -0.3, `${k}: looks down over the sill: ${JSON.stringify(v)}`);
    assert.ok(v.dur >= 1.8 && v.dur <= 3.4, `${k}: ~2.2–3.1 s: ${JSON.stringify(v)}`);
  }
  assert.equal(r['in-shut'].side, -1); assert.equal(r['out-open'].side, 1); assert.equal(r['in-shut-slide'].side, -1);
  assert.ok(r['in-shut'].angle >= 1.1, 'the sash opened itself');
  assert.equal(r.heard, 0, 'opened slowly: no creak noise');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window: a landing that is blocked says «Тут не пролізти» and does not start; the guard gets «Сторож вікнами не лазить»', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const r = await page.evaluate(async () => {
    const g = window.__game, bw = await import('./src/systems/backWindow.js'), { G } = await import('./src/systems/state.js'), out = {};
    g.playing = true; g.sim(0.1);
    // the far side (the back yard north of the wall, z -14.6) — fill it with furniture: a box in the landing
    const L = g.level, add = L.world.addBox ? null : null;
    g.player.teleport(4.0, -13.35, 0); g.sim(0.3);
    const orig = L.resolve; L.resolve = (x, z, r, y) => (z < -14.3 ? [x, z + 0.8] : orig.call(L, x, z, r, y));   // the landing is pushed 0.8 m: blocked
    bw.startClimb(); out.blocked = { on: bw.climbing(), flash: G.flashText };
    L.resolve = orig;
    G.role = 'guard'; bw.startClimb(); out.guard = { on: bw.climbing(), flash: G.flashText }; G.role = 'thief';
    return out;
  });
  assert.deepEqual(r.blocked, { on: false, flash: 'Тут не пролізти' });
  assert.deepEqual(r.guard, { on: false, flash: 'Сторож вікнами не лазить' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window (VR, IWER Quest 3): the camera is not moved or lifted: the picture fades out in 0.3 s, the body goes over, it fades in; the head height only drops by the crouch', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, dacha);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  const r = await page.evaluate(async () => {
    const g = window.__game, bw = await import('./src/systems/backWindow.js'), { G } = await import('./src/systems/state.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(4.0, -13.35, 0); await wait(500);
    const y0 = g.player.head.y, z0 = g.player.head.z, fades = [], ys = [], seen = [];
    let fadeIns = 0; const fi = G.comfort.fadeIn.bind(G.comfort); G.comfort.fadeIn = (sec) => { fadeIns++; fi(sec); };
    bw.startClimb();
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) { fades.push(+G.comfort.fade.toFixed(2)); ys.push(g.player.head.y); seen.push(bw.climbing()); await wait(40); if (!bw.climbing() && performance.now() - t0 > 900) break; }
    await wait(400);
    return { fadeIns, y0, z0, z: g.player.head.z, yEnd: g.player.head.y, maxY: Math.max(...ys), maxFade: Math.max(...fades), endFade: G.comfort.fade, crouch: g.player.virtualCrouch, open: Math.abs(g.level.doors.find((d) => d.window).angle), still: bw.climbing(), climbY: g.player.climbY };
  });
  assert.ok(r.maxFade >= 0.5 && r.fadeIns === 1, `the picture went dark and was faded back in once (frames are slow in software rendering): ${r.maxFade} ${r.fadeIns}`);
  assert.ok(r.endFade < 0.05, `and came back: ${r.endFade}`);
  assert.ok(r.maxY <= r.y0 + 0.02, `the head was never lifted: ${r.maxY} vs ${r.y0}`);
  assert.equal(r.climbY, 0, 'no camera offset in VR');
  assert.ok(r.z < -14.4 && r.z0 > -13.6, `the body went over: ${r.z0} -> ${r.z}`);
  assert.equal(r.crouch, true); assert.ok(r.open >= 1.0, 'the sash is open');
  assert.equal(r.still, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window (friends): the host climbs, the guest presses — the host says «busy» and the guest comes back; a guest caught on the sill stops', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, base + '?map=dacha&net=local');
  const code = '271828';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + '?map=dacha&net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'rita'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; g.patrol.x = -8; g.patrol.z = -2; });
  const run = async (secs) => { for (let t = 0; t < secs; t += 0.1) { for (const p of pages) await p.evaluate(() => window.__game.sim(0.1)); await host.page.waitForTimeout(30); } };
  await run(0.6);
  // the host starts; 0.3 s later the guest presses
  await host.page.evaluate(async () => { const g = window.__game, bw = await import('./src/systems/backWindow.js'); g.player.teleport(3.6, -13.35, 0); g.sim(0.3); bw.startClimb(); });
  await run(0.3);
  await guest.page.evaluate(async () => { const g = window.__game, bw = await import('./src/systems/backWindow.js'); g.player.teleport(4.4, -13.35, 0); g.sim(0.2); bw.startClimb(); });
  await run(1.0);
  const early = await guest.page.evaluate(async () => { const bw = await import('./src/systems/backWindow.js'); return { on: bw.climbing(), flash: window.__game.flashText }; });
  await run(2.0);
  const gst = await guest.page.evaluate(async () => { const bw = await import('./src/systems/backWindow.js'), P = window.__game.player; return { on: bw.climbing(), z: +P.head.z.toFixed(2), x: +P.head.x.toFixed(2), crouch: P.virtualCrouch, lift: P.climbY }; });
  const hst = await host.page.evaluate(() => +window.__game.player.head.z.toFixed(2));
  assert.ok(hst < -14.4, `the host got through: ${hst}`);
  assert.equal(gst.on, false); assert.ok(gst.z > -13.6, `the guest is back inside: ${JSON.stringify(gst)}`);
  assert.equal(gst.lift, 0); assert.equal(gst.crouch, false, 'standing as before');
  assert.equal(early.flash, 'Вікно зайняте', `the guest was told: ${JSON.stringify(early)}`);
  // the guest, caught while climbing: the climb stops where it is, no lift left
  await run(3.5);
  await guest.page.evaluate(async () => { const g = window.__game, bw = await import('./src/systems/backWindow.js'); g.player.teleport(4.4, -13.35, 0); g.sim(0.2); bw.startClimb(); });
  await run(0.8);
  const caught = await guest.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'), bw = await import('./src/systems/backWindow.js'); G.caughtT = 0; for (let i = 0; i < 4; i++) G.player && window.__game.sim(0.05); return { on: bw.climbing(), lift: G.player.climbY, pitch: G.player.climbPitch }; });
  assert.deepEqual(caught, { on: false, lift: 0, pitch: 0 });
  assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
  await ctx.close();
});
