// Display brightness and «Надворі» (systems/brightness.js): the picture only. The simulation and the
// guard's numbers are the same at every step; dark corners stay darker than lit spots; the flashlight
// beam, the window / lamp glow and the noise ripples stand out as much at the top step as at the first.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, base, UA, open, test, LAND, playPhone, fingerPressEl } from './runner.mjs';

// Math.random with a seed (before any page script), as tools/snapshot.mjs does
const SEED = () => {
  window.__reseed = (seed) => {
    let s = seed | 0;
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  window.__reseed(1);
};
// the brightness setting as saved, before the page starts
const preset = (step, outdoor) => ({ 'nocturne.brightness': JSON.stringify(step), 'nocturne.outdoor': JSON.stringify(outdoor), 'nocturne.tutorial': JSON.stringify({ done: true }) });

// 90 s of a deterministic round: walk into the house, past the guard, make noise, get caught
async function trace(step, outdoor) {
  const ctx = await newContext(browser);
  await ctx.addInitScript(SEED);
  await ctx.addInitScript((all) => { for (const [k, v] of Object.entries(all)) localStorage.setItem(k, v); }, preset(step, outdoor));
  const { page, errors } = await open(ctx, base);
  const out = await page.evaluate(() => {
    const g = window.__game, P = g.player, rec = [], heard = [];
    g.renderer.setAnimationLoop(null);   // only sim() moves the game here
    g.noise.on((e) => heard.push([e.kind, +e.x.toFixed(3), +e.z.toFixed(3)]));
    g.playing = true; g.newRound(); window.__reseed(42);
    const cfg = JSON.stringify(g.CFG, (k, v) => (typeof v === 'function' ? 'fn:' + v : v));
    const sample = (tag) => rec.push([tag, +P.head.x.toFixed(6), +P.head.z.toFixed(6), g.patrol.state, +g.patrol.x.toFixed(6), +g.patrol.z.toFixed(6), g.alert.level, +g.alert.suspicion.toFixed(6), g.round.phase, +g.round.clock.toFixed(4), g.stealthState(P, g.level, g.patrol).hidden, heard.splice(0).join('|')]);
    const run = (secs, tag) => { for (let t = 0; t < secs; t += 0.5) { g.sim(0.5); sample(tag); } };
    P.teleport(0.5, -1.5, Math.PI); run(20, 'hall');
    P.teleport(-3, -6, Math.PI / 2); run(30, 'corridor');
    g.noise.emit(-3, -6, 6, 'step'); run(10, 'noise');
    for (let k = 0; k < 30 && g.round.phase !== 'result'; k++) { P.teleport(g.patrol.x + 0.5, g.patrol.z + 0.5, 0); run(1, 'guard'); }
    return { rec, cfg, k: g.brightness.state().k, gain: g.alert.gain };
  });
  assert.deepEqual(errors, []);
  await ctx.close();
  return out;
}

test('brightness: the simulation trace and the whole CFG (the guard included) are identical at steps 1, 3, 5 and «Надворі»', async () => {
  const runs = [await trace(0, false), await trace(2, false), await trace(4, false), await trace(0, true)];
  assert.deepEqual(runs.map((r) => r.k), [1, 1.8, 3.2, 3.2], 'the brightness was really on');
  assert.ok(runs[0].rec.length > 100 && runs[0].rec.some((r) => r[3] !== 'patrol'), 'a trace with the guard doing things');
  for (const r of runs.slice(1)) {
    assert.equal(r.cfg, runs[0].cfg, 'CFG identical');
    assert.deepEqual(r.rec, runs[0].rec, `trace identical at k = ${r.k}`);
  }
});

// Luminance (0..255) of every pixel of a frame rendered now into a small sRGB target (read back from
// the GPU; the screen canvas is not read: it may still hold the last presented frame). what(): run first.
const FRAME = () => {
  const g = window.__game, W = 320, H = 200, T = g.THREE;
  const rt = new T.WebGLRenderTarget(W, H);
  rt.texture.colorSpace = T.SRGBColorSpace;
  const px = new Uint8Array(W * H * 4);
  return (what) => {
    if (what) what(g);
    const aspect = g.camera.aspect;
    g.camera.aspect = W / H; g.camera.updateProjectionMatrix();
    g.renderer.setRenderTarget(rt);
    g.renderer.render(g.scene, g.camera);
    g.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    g.renderer.setRenderTarget(null);
    g.camera.aspect = aspect; g.camera.updateProjectionMatrix();
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return lum;
  };
};

async function picture(step) {
  const ctx = await newContext(browser, { viewport: { width: 960, height: 600 } });
  await ctx.addInitScript((all) => { for (const [k, v] of Object.entries(all)) localStorage.setItem(k, v); }, preset(step, false));
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate((FRAMEsrc) => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    g.wrist.mesh.visible = false; g.board.mesh.visible = false;
    const shot = new Function('return ' + FRAMEsrc)()();
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    // Weber contrast of an effect: over the pixels it changes (by more than 2 of 255), how much brighter
    // they are than the same pixels without it (the background there); and how many pixels it covers
    const weber = (on, off) => {
      let sum = 0, n = 0;
      for (let i = 0; i < on.length; i++) { const d = on[i] - off[i]; if (Math.abs(d) > 2) { sum += d / Math.max(off[i], 8); n++; } }
      return { c: n ? sum / n : 0, px: n };
    };
    const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
    const out = { k: g.brightness.state().k };
    // the camera follows the player in the frame loop (stopped here): update the pose by hand
    const pose = () => { g.sim(1 / 72); g.scene.updateMatrixWorld(true); };   // one step: the pose, the flashlight's room mask (the round is not running: nothing moves)
    // 1. lit and dark: from the yard, the lamp-lit path and the dark house front
    g.player.teleport(4.4, 9.5, 0.35); g.player.lookPitch = -0.25; pose();
    let L = shot();
    out.lit = pct(L, 0.95); out.dark = pct(L, 0.25);
    // 2. the guard's flashlight: stand 1.2 m behind the guard, look along the beam; with and without it (cone + spot)
    const T = new g.THREE.Vector3(), S = new g.THREE.Vector3();
    g.patrol.spot.getWorldPosition(S); g.patrol.spotTarget.getWorldPosition(T);
    const fx = T.x - S.x, fz = T.z - S.z, fl = Math.hypot(fx, fz) || 1;
    g.player.teleport(S.x - (fx / fl) * 1.2, S.z - (fz / fl) * 1.2, Math.atan2(-fx, -fz)); g.player.lookPitch = -0.3; pose();
    const spotI = g.patrol.spot.intensity;
    const withBeam = shot();
    const noBeam = shot(() => { g.patrol.beam.visible = false; g.patrol.spot.intensity = 0; });
    g.patrol.beam.visible = true; g.patrol.spot.intensity = spotI;
    ({ c: out.beam, px: out.beamPx } = weber(withBeam, noBeam));
    // 3. a noise ripple on the open yard ground, 2.5 m in front of the player, looking down at it
    g.player.teleport(4.4, 9.5, 0.35); g.player.lookPitch = -0.6; pose();
    const h = g.player.head, fwdX = -Math.sin(g.player.yaw), fwdZ = -Math.cos(g.player.yaw);
    const noRipple = shot(() => { g.noise.clear(); g.noise.update(0); });
    const ripple = shot(() => { g.noise.ripples.push({ x: h.x + fwdX * 2.5, y: 0.01, z: h.z + fwdZ * 2.5, r: 1.8, t: 0, color: 0x6f9fd8 }); g.noise.update(0.1); });
    g.noise.clear(); g.noise.update(0);
    ({ c: out.ripple, px: out.ripplePx } = weber(ripple, noRipple));
    // 4. the window / lamp glow, seen from the yard
    g.player.teleport(4.4, 9.5, 0.35); g.player.lookPitch = -0.1; pose();
    const glowMesh = g.level.group.getObjectByName('glow');
    const withGlow = shot();
    const noGlow = shot(() => { glowMesh.visible = false; });
    glowMesh.visible = true;
    ({ c: out.glow, px: out.glowPx } = weber(withGlow, noGlow));
    out.meanYard = mean(shot());
    return out;
  }, FRAME.toString());
  assert.deepEqual(errors, []);
  await ctx.close();
  return r;
}

test('brightness: the picture is brighter at step 5, dark corners stay darker than lit spots, and the beam, the glow and the ripples stand out as much as at step 1', async () => {
  const p0 = await picture(0), p4 = await picture(4);
  const info = JSON.stringify({ p0, p4 });
  if (process.env.SHOW) console.log(info);
  assert.equal(p0.k, 1); assert.equal(p4.k, 3.2);
  assert.ok(p4.meanYard > p0.meanYard * 1.4, `brighter: ${info}`);
  assert.ok(p4.dark > p0.dark, `the dark parts are lifted: ${info}`);
  assert.ok(p4.lit > p4.dark * 1.6, `dark corners stay clearly darker than lit spots: ${info}`);
  for (const k of ['beam', 'ripple', 'glow']) {
    assert.ok(p0[k] > 0.05 && p0[k + 'Px'] > 20, `${k} is visible at step 1: ${info}`);
    assert.ok(p4[k] >= p0[k] * 0.8, `${k}: contrast against the background at step 5 (${p4[k].toFixed(3)}) >= 0.8 x step 1 (${p0[k].toFixed(3)}): ${info}`);
  }
});

test('brightness UI (phone): − / + in 5 steps with the limits, «Надворі» = top step + contrast HUD, saved; the menu by finger; the phone-brightness hint', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => localStorage.setItem('nocturne.tutorial', JSON.stringify({ done: true })));
  const { page, errors } = await open(ctx, base);
  const cdp = await ctx.newCDPSession(page);
  const st = () => page.evaluate(() => window.__game.brightness.state());
  assert.equal(await page.textContent('#brightval'), '1/5');
  assert.equal(await page.isDisabled('#brightdn'), true);
  assert.match(await page.textContent('#brighthint'), /яскравість телефона на максимум/);
  for (let i = 0; i < 5; i++) await fingerPressEl(page, cdp, '#brightup');
  assert.equal(await page.textContent('#brightval'), '5/5');
  assert.equal(await page.isDisabled('#brightup'), true);
  assert.equal((await st()).k, 3.2);
  await fingerPressEl(page, cdp, '#brightdn'); await fingerPressEl(page, cdp, '#brightdn');
  assert.equal(await page.textContent('#brightval'), '3/5');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.brightness'))), 2);
  // «Надворі»: top step + the contrast HUD; off = back to 3/5
  await fingerPressEl(page, cdp, '#outdoorbtn');
  assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('outdoor'), document.getElementById('brightval').textContent, document.getElementById('outdoorbtn').textContent]), [true, '5/5', 'Надворі: увімкнено']);
  // saved: after a reload still outdoors
  await page.reload(); await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => document.body.classList.contains('outdoor')), true);
  assert.equal((await st()).k, 3.2);
  // in the game: the HUD has the dark backing and the bolder text
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#hud .hud-tc')).backgroundColor), 'rgba(0, 0, 0, 0.78)');
  // the menu: Налаштування -> − turns «Надворі» off one step below the top; + back up; the hint is there
  await page.evaluate(() => { window.__game.pauseOpen('user'); window.__game.menu.go('settings'); });
  assert.match(await page.textContent('#pausemenu'), /Яскравість: 5\/5/);
  assert.match(await page.textContent('#pausemenu'), /яскравість телефона на максимум/);
  await fingerPressEl(page, cdp, '#pausemenu .pm-row .step >> nth=0');
  assert.match(await page.textContent('#pausemenu'), /Яскравість: 4\/5/);
  assert.deepEqual([(await st()).outdoor, await page.evaluate(() => document.body.classList.contains('outdoor'))], [false, false]);
  await fingerPressEl(page, cdp, '#pausemenu .pm-btn:text-is("Надворі")');
  assert.match(await page.textContent('#pausemenu'), /Надворі: увімкнено/);
  assert.equal(await page.evaluate(() => document.body.classList.contains('outdoor')), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('brightness: not in VR — a headset browser has no setting; a VR session from a PC shows the normal picture and returns to the setting after', async () => {
  // VR mode (Quest browser): no row, k = 1 even with a saved «Надворі»
  const v = await newContext(browser, { userAgent: UA.quest });
  await v.addInitScript((all) => { for (const [k, val] of Object.entries(all)) localStorage.setItem(k, val); }, preset(4, true));
  const vp = await open(v, base);
  assert.equal(await vp.page.isVisible('#brightrow'), false);
  assert.deepEqual(await vp.page.evaluate(() => [window.__game.brightness.state().k, window.__game.alert.gain, document.body.classList.contains('outdoor')]), [1, 1, false]);
  await v.close();
  // a PC with an emulated headset: Enter VR -> 1; exit -> the saved step again
  const ctx = await newContext(browser);
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  await ctx.addInitScript((all) => { for (const [k, val] of Object.entries(all)) localStorage.setItem(k, val); }, preset(4, false));
  const { page } = await open(ctx, base + '?mode=pc');   // (a PC with a headset attached is detected as VR mode)
  assert.equal(await page.evaluate(() => window.__game.brightness.state().k), 3.2);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  assert.deepEqual(await page.evaluate(() => [window.__game.brightness.state().k, window.__game.alert.gain, window.__game.noise.gain]), [1, 1, 1]);
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await page.waitForFunction(() => !window.__game.inVR, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__game.brightness.state().k), 3.2);
  await ctx.close();
});
