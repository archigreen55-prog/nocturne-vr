// The noise rings as a «radar» (plan 2026-11-19 «fixes after test 1», task 2): one thin ring per source at its full,
// honest radius (the guard's real hearing x the difficulty — never smaller), a ping that dims and comes again while
// the sound goes on, gone a while after it stops; another source has its own ring; see-through near the camera.
// Since owner 22.11 the default is 'wave' (tests/rings.test.mjs); the radar stays a config switch, tested here.
import assert from 'node:assert/strict';
import { browser, open, test, preview } from './runner.mjs';
import { newContext } from './harness.mjs';

test('radar rings: talking 3 s = one ring of the real 4 m all along (pinged every second), no growth, no second ring; it fades after the talk; a door elsewhere has its own; the radius follows the difficulty\'s hearing (never smaller); see-through near the camera', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, preview + '?rings=radar');
  const r = await page.evaluate(() => {
    const g = window.__game, N = g.noise, C = g.CFG, M = C.mic, out = { counts: [], radii: [], bright: [] };
    g.newRound(); g.playing = true;
    for (const p of g.guards) p.update = () => null;
    N.clear();
    const col = (i) => { N.mesh.getColorAt(i, N.c); return +(N.c.r + N.c.g + N.c.b).toFixed(3); };
    // talking: a voice noise every second, the frames in between
    for (let s = 0; s < 3; s++) {
      N.emit(0, 0, M.voice.radius, 'voice', { who: g.player });
      for (let f = 0; f < 10; f++) {
        N.update(0.1);
        out.counts.push(N.ripples.length);
        out.radii.push(+N.ripples[0].r.toFixed(2));
        if (s === 1) out.bright.push(col(0));
      }
    }
    // the scale drawn is the full radius from the first frame (no growth)
    N.emit(0, 0, M.voice.radius, 'voice', { who: g.player }); N.update(0.01);
    const m = new g.THREE.Matrix4(); N.mesh.getMatrixAt(0, m);
    out.scale = +new g.THREE.Vector3().setFromMatrixColumn(m, 0).length().toFixed(2);
    // a door elsewhere: its own ring
    N.emit(5, -3, C.doors.creakRadius, 'door');
    N.update(0.01);
    out.two = N.ripples.map((x) => x.kind || x.key.split('|')[1]);
    // the talk stops: gone after keep + fade
    N.update(C.ripple.keep + C.ripple.fade + 0.05);
    out.after = N.ripples.length;
    // the difficulty's hearing: the ring is radius x radiusK on each
    out.byDiff = {};
    for (const d of ['easy', 'medium', 'hard']) {
      g.setDifficulty(d); N.clear();
      N.emit(0, 0, M.shout.radius, 'shout', { who: g.player, wallK: M.shout.wallK });
      out.byDiff[d] = [+N.ripples[0].r.toFixed(2), +(Math.min(C.ripple.maxRadius, M.shout.radius * C.hearing.radiusK)).toFixed(2)];
    }
    g.setDifficulty('medium');
    out.near = C.ripple.near; out.mode = C.ripple.mode;
    // the shader got the near fade
    N.mesh.material.onBeforeCompile(out.sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>' });
    out.uNear = out.sh.uniforms.uNear.value.toArray();
    out.fadeInShader = /cameraPosition/.test(out.sh.fragmentShader);
    delete out.sh;
    return out;
  });
  assert.equal(r.mode, 'radar');
  assert.ok(r.counts.every((n) => n === 1), `one ring all along: ${r.counts}`);
  assert.ok(r.radii.every((x) => x === 4), `4 m all along: ${r.radii}`);
  assert.equal(r.scale, 4, 'drawn at the full radius at once');
  assert.ok(r.bright[0] > r.bright[7] * 2, `a ping, then dim: ${r.bright}`);
  assert.ok(r.bright[7] > 0, 'still seen between the pings');
  assert.equal(r.two.length, 2, `the door has its own ring: ${r.two}`);
  assert.equal(r.after, 0, 'gone after the talk');
  for (const d of ['easy', 'medium', 'hard']) assert.equal(r.byDiff[d][0], r.byDiff[d][1], `${d}: the real hearing radius ${r.byDiff[d]}`);
  assert.ok(r.byDiff.hard[0] > r.byDiff.easy[0], 'a harder guard hears further: a bigger ring');
  assert.deepEqual(r.uNear, r.near);
  assert.equal(r.fadeInShader, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
