// The noise rings as waves (owner 22.11, «a stone in the water / echolocation», CFG.ripple.mode 'wave'): every sound
// is one thin wave that grows from the source to its real hearing radius (the guard's, x the difficulty — never
// smaller) in ~0.6–1 s (a shout a little longer), bright at the start and gone at the edge; a talking player starts
// at most one wave per ~0.9 s, they never pile up or stand still; no «through a wall» ring; see-through on the floor
// within ~1 m of the camera. ?rings=radar / grow bring back the older looks for comparing.
import assert from 'node:assert/strict';
import { browser, open, test, preview } from './runner.mjs';
import { newContext } from './harness.mjs';

test('wave rings: one wave per sound growing to the real radius in 0.6–1 s (a shout longer) and fading out at the edge; talking = one new wave per ~0.9 s, never piled up or standing still; no wall ring; the difficulty\'s hearing; see-through near the camera on the floor; ?rings=radar switches back', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, preview);
  const r = await page.evaluate(() => {
    const g = window.__game, N = g.noise, C = g.CFG, M = C.mic, out = {};
    g.newRound(); g.playing = true;
    for (const p of g.guards) p.update = () => null;
    out.mode = C.ripple.mode;
    const scale = (i) => { const m = new g.THREE.Matrix4(); N.mesh.getMatrixAt(i, m); return +new g.THREE.Vector3().setFromMatrixColumn(m, 0).length().toFixed(3); };
    const bright = (i) => { N.mesh.getColorAt(i, N.c); return +(N.c.r + N.c.g + N.c.b).toFixed(4); };
    // one voice: one wave, its radius over time, its brightness, its life
    N.clear();
    N.emit(0, 0, M.voice.radius, 'voice', { who: g.player });
    out.one = { n: N.ripples.length, r: N.ripples[0].r, life: N.ripples[0].life, wall: N.ripples.some((x) => x.wall) };
    out.grow = []; out.light = [];
    for (let t = 0; t < 2; t += 1 / 60) {
      N.update(1 / 60);
      if (!N.ripples.length) break;
      out.grow.push(scale(0)); out.light.push(bright(0));
    }
    out.goneAfter = out.grow.length / 60;
    // talking for 4 s, the game's noise every frame even (a worst case): new waves no more often than the gap
    N.clear();
    out.starts = []; out.maxAt = 0; let seen = new Set(), clock = 0;
    for (let f = 0; f < 240; f++) {
      N.emit(0.01 * f, 0, M.voice.radius, 'voice', { who: g.player });
      N.update(1 / 60); clock += 1 / 60;
      for (const w of N.ripples) if (!seen.has(w)) { seen.add(w); out.starts.push(+clock.toFixed(3)); }
      out.maxAt = Math.max(out.maxAt, N.ripples.length);
    }
    // another source (a door) has its own wave at once
    N.clear(); N.emit(0, 0, M.voice.radius, 'voice', { who: g.player }); N.emit(5, -3, C.doors.creakRadius, 'door');
    out.door = N.ripples.length;
    // a shout: the real radius x the difficulty's hearing on each, a longer wave
    out.byDiff = {};
    for (const d of ['easy', 'medium', 'hard']) {
      g.setDifficulty(d); N.clear();
      N.emit(0, 0, M.shout.radius, 'shout', { who: g.player, wallK: M.shout.wallK });
      out.byDiff[d] = [+N.ripples[0].r.toFixed(2), +(Math.min(C.ripple.maxRadius, M.shout.radius * C.hearing.radiusK)).toFixed(2), N.ripples.length];
    }
    out.shoutLife = N.ripples[0].life;
    g.setDifficulty('medium');
    // steps a stride apart: a wave each
    N.clear(); out.steps = 0; for (let k = 0; k < 4; k++) { N.emit(k * 0.7, 0, 6, 'step', { who: g.player }); out.steps += N.ripples.filter((w) => w.t === 0).length; N.update(0.37); }
    // the shader: see-through by the distance on the floor
    N.mesh.material.onBeforeCompile(out.sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>' });
    out.uNear = out.sh.uniforms.uNear.value.toArray(); out.uNearH = out.sh.uniforms.uNearH.value;
    out.floorFade = /rEye\.y = 0\.0/.test(out.sh.fragmentShader);
    delete out.sh;
    N.clear();
    return out;
  });
  assert.equal(r.mode, 'wave', 'the default');
  assert.deepEqual([r.one.n, r.one.r, r.one.wall], [1, 4, false], `one wave of the real 4 m, no wall ring ${JSON.stringify(r.one)}`);
  assert.ok(r.one.life >= 0.6 && r.one.life <= 1.0, `0.6–1 s to the edge: ${r.one.life}`);
  assert.ok(r.grow[0] < 1, `born at the player: ${r.grow[0]}`);
  assert.ok(r.grow.every((s, i) => i === 0 || s > r.grow[i - 1]), 'always growing, never standing still');
  assert.ok(r.grow.at(-1) > 3.9 && r.grow.at(-1) <= 4, `reaches the edge (the full radius, not less): ${r.grow.at(-1)}`);
  assert.ok(Math.abs(r.goneAfter - r.one.life) < 0.05, `gone at the edge: ${r.goneAfter}`);
  const L = r.light, n = L.length;
  assert.ok(L[5] > L[Math.floor(n / 2)] && L[Math.floor(n / 2)] > L[n - 2] * 3, `bright at the start, dimmer, dissolving at the edge: ${L.filter((_, i) => i % 6 === 0)}`);
  assert.ok(L[n - 1] < L[5] * 0.08, 'nearly nothing at the edge');
  const gaps = r.starts.slice(1).map((t, i) => t - r.starts[i]);
  assert.ok(r.starts.length >= 4 && r.starts.length <= 5, `4 s of talking: 4–5 waves, not a pile: ${r.starts}`);
  assert.ok(gaps.every((x) => x >= 0.8 && x <= 1.0), `one wave per 0.8–1 s: ${gaps.map((x) => x.toFixed(2))}`);
  assert.ok(r.maxAt <= 2, `at most two at once while talking: ${r.maxAt}`);
  assert.equal(r.door, 2, 'a door elsewhere: its own wave');
  for (const d of ['easy', 'medium', 'hard']) assert.deepEqual(r.byDiff[d].slice(0, 2), [r.byDiff[d][1], r.byDiff[d][1]], `${d}: the real hearing radius ${r.byDiff[d]}`);
  assert.ok(r.byDiff.medium.every((x, i) => i < 2 || x === 1), 'a shout: one wave');
  assert.ok(r.byDiff.hard[0] > r.byDiff.easy[0], 'a harder guard hears further: a bigger wave');
  assert.ok(r.shoutLife > r.one.life && r.shoutLife <= 1.5, `a shout a little longer: ${r.shoutLife}`);
  assert.equal(r.steps, 4, 'steps a stride apart: a wave each');
  assert.ok(r.uNear[0] > 0.2 && r.uNear[1] <= 1.3 && r.uNearH === 1 && r.floorFade, `see-through within ~1 m on the floor: ${r.uNear}`);
  assert.deepEqual(errors, []);
  await ctx.close();
  // the switch: the radar again
  const ctx2 = await newContext(browser);
  const o2 = await open(ctx2, preview + '?rings=radar');
  const mode = await o2.page.evaluate(() => window.__game.CFG.ripple.mode);
  assert.equal(mode, 'radar');
  assert.deepEqual(o2.errors, []);
  await ctx2.close();
});
