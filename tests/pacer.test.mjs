// V1 (plan 2026-11-15): the phone's frame cap steps with the screen. A 90 Hz screen gets an even 45 and
// keeps its sharpness (before: 45 against a target of 60, the pixel ratio slid to 0.75 and stayed there).
// The logic is driven by hand with made-up frame times: the test machine has no GPU and draws 3-5 frames
// a second, so a real 90 Hz screen cannot be had here (the phone checklist in the PR does that).
import assert from 'node:assert/strict';
import { browser, open, test, playPhone, LAND, base } from './runner.mjs';
import { newContext } from './harness.mjs';

// In the page: a fresh Quality fed with the browser's frame calls at `hz` (±jitter ms), as src/main.js does.
// opts: cap, secs, jitter, hiccupEvery (a long frame every n calls: the next call comes 40+ ms later),
// slow (ms: every call comes this late, a phone too slow for its screen), menu (s of menu first: 2 of 3
// frames draw nothing). Returns the drawn rate of the last half, the drawn gaps, the state.
const SIM = async (page, hz, opts = {}) => page.evaluate(async ([hz, o]) => {
  const { Quality } = await import('./src/perf/quality.js');
  const Q = new Quality({ renderer: { setPixelRatio() {}, setSize() {} }, setting: 'medium', autoPick: 'medium', ios: false, cap: o.cap || 60 });
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vs = 1000 / hz, secs = o.secs || 10, jitter = o.jitter ?? 0.3;
  let t = 1000, i = 0;
  const end = () => 1000 + ((o.menu || 0) + secs) * 1000;
  // the menu: not pacing, the live scene draws one frame in three
  while (t < 1000 + (o.menu || 0) * 1000) { t += vs; Q.skip(t, false); Q.drawn(i++ % 3 === 0); }
  const drawn = [];
  while (t < end()) {
    t += o.slow || vs;
    if (o.hiccupEvery && ++i % o.hiccupEvery === 0) t += vs * Math.ceil(40 / vs);
    const at = t + (rnd() - 0.5) * 2 * jitter;
    if (Q.skip(at, true)) continue;
    if (drawn.length) Q.frame(at - drawn[drawn.length - 1]);
    drawn.push(at); Q.drawn(true);
  }
  const half = end() - secs * 500, late = drawn.filter((x) => x >= half);
  const gaps = late.slice(1).map((x, k) => x - late[k]);
  return { rate: +(late.length / (secs / 2)).toFixed(1), gaps, st: Q.state(), target: Q.target };
}, [hz, opts]);

test('phone frame cap at an even step of the screen (V1): 60 / 90 / 120 / 144 Hz, the 30 cap, 90 Hz keeps its sharpness, slow frames are not the screen', async () => {
  const ctx = await newContext(browser, LAND);
  const { page, errors } = await open(ctx, base);

  // the 60 cap: 60 -> 60, 90 -> 45, 120 -> 60, 144 -> 48 (never above 60, an even step)
  for (const [hz, want] of [[60, 60], [90, 45], [120, 60], [144, 48]]) {
    const r = await SIM(page, hz);
    assert.ok(Math.abs(r.rate - want) <= 0.6, `${hz} Hz: ${r.rate} drawn a second, want ${want} (${JSON.stringify(r.st)})`);
    assert.ok(Math.abs(r.target - want) < 0.01, `${hz} Hz: the target is ${r.target}, want ${want}`);
    const step = 1000 / want, uneven = r.gaps.filter((g) => Math.abs(g - step) > 1);
    assert.deepEqual(uneven.map((g) => +g.toFixed(1)), [], `${hz} Hz: every drawn gap is ${step.toFixed(1)} ± 1 ms`);
    if (hz !== 60) assert.equal(r.st.hz, hz, `${hz} Hz measured`);
  }
  // the 30 cap: 30, 30, 30, 28.8
  for (const [hz, want] of [[60, 30], [90, 30], [120, 30], [144, 28.8]]) {
    const r = await SIM(page, hz, { cap: 30, menu: 1 });
    assert.ok(Math.abs(r.rate - want) <= 0.6, `cap 30, ${hz} Hz: ${r.rate}, want ${want}`);
    assert.ok(r.gaps.every((g) => g >= 31), `cap 30, ${hz} Hz: the gaps stay >= 31 ms: ${r.gaps.slice(0, 8).map((g) => g.toFixed(1))}`);
  }
  // 90 Hz for 20 s: the sharpness stays (before: 45 against 60 = the pixel ratio stepped down 4 times to 0.75)
  const sharp = await SIM(page, 90, { secs: 20 });
  assert.equal(sharp.st.dynamicSteps, 0, JSON.stringify(sharp.st));
  assert.equal(sharp.st.pixelRatio, sharp.st.maxPixelRatio);
  assert.equal(sharp.st.pace, 45);
  // long frames now and then: still 45 on average, measured as 90 Hz, no slide
  const bumpy = await SIM(page, 90, { secs: 20, hiccupEvery: 37 });
  assert.equal(bumpy.st.hz, 90); assert.equal(bumpy.st.dynamicSteps, 0, JSON.stringify(bumpy.st));
  // the rate measured in the menu (frames that draw nothing) before the round: 90 from the first frame of play
  const menu = await SIM(page, 90, { menu: 1, secs: 2 });
  assert.equal(menu.st.hz, 90); assert.ok(Math.abs(menu.rate - 45) <= 0.6, `${menu.rate}`);
  // a phone too slow for its 60 Hz screen (a frame every 33 ms) is not a 30 Hz screen: the target stays 60
  // and the dynamic resolution steps down as before
  const slow = await SIM(page, 60, { slow: 1000 / 30, secs: 8 });
  assert.equal(slow.st.hz, null); assert.equal(slow.target, 60); assert.ok(slow.st.dynamicSteps > 0, JSON.stringify(slow.st));
  // the test machine's own slow frames (200 ms) measure nothing
  const sw = await SIM(page, 60, { slow: 200, secs: 6 });
  assert.equal(sw.st.hz, null); assert.equal(sw.target, 60);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone report: the screen rate and the drawn rate (V1)', async () => {
  const { ctx, page, errors } = await playPhone();
  const r = JSON.parse(await page.evaluate(() => window.__game.reportText()));
  assert.ok('hz' in r.phone.quality && 'pace' in r.phone.quality, JSON.stringify(r.phone.quality));
  assert.equal(typeof r.phone.quality.pace, 'number');
  assert.deepEqual(errors, []);
  await ctx.close();
});
