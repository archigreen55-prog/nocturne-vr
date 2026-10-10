// W17 «Стиль»: the cost of a frame at fixed spots of both maps, on the phone's three quality presets.
// For every spot: the median of 40 frames (ms), draw calls, triangles; per page: the shader programs
// and the bytes the page loaded (decoded). The test machine draws in software (no GPU): the times are slow,
// the ratio between two variants of the same build is what counts.
//   node tools/bench-style.mjs                      this build as it is
//   node tools/bench-style.mjs off on               ?style=off and ?style=on, alternating per page
//   OUT=bench.json node tools/bench-style.mjs ...   also writes the numbers
import { writeFileSync } from 'node:fs';
import { devices } from 'playwright';
import { startServer, launch, newContext } from '../tests/harness.mjs';

const variants = process.argv.slice(2).length ? process.argv.slice(2) : [''];
const { server, base } = await startServer();
const preview = base + 'preview/bench/';
const PRESETS = ['low', 'medium', 'high'];
// [name, x, z, yaw | [tx, tz] (look at), floor y, pitch]
const SPOTS = {
  dacha: [
    ['hall', 0, -2.5, 0, 0, -0.1],
    ['yard (lamp)', 3.5, 9, [0, -2], 0, -0.15],
    ['corridor', -3, -6, [2, -10], 0, -0.1],
  ],
  mansion: [
    ['hall', 0, -8.5, Math.PI / 2, 0, 0],
    ['gallery', 4, -8.5, Math.PI / 2, 3, -0.5],
    ['garden (fountain)', 5, 9, [0, 13], 0, -0.2],
  ],
};

async function page(browser, map, preset, variant) {
  const ctx = await newContext(browser, { ...devices['Pixel 7 landscape'] });
  await ctx.addInitScript((preset) => {
    for (const p of ['nocturne.', 'nocturne.preview.']) {
      localStorage.setItem(p + 'tutorial', JSON.stringify({ done: true }));
      localStorage.setItem(p + 'quality', JSON.stringify(preset));
      localStorage.setItem(p + 'openAll', 'true');
    }
  }, preset);
  const pg = await ctx.newPage();
  const q = `?map=${map}${variant ? `&style=${variant}` : ''}`;
  await pg.goto(preview + q);
  await pg.waitForFunction(() => window.__game, null, { timeout: 60000, polling: 200 });
  const out = { map, preset, variant: variant || '-', spots: {} };
  for (const [name, x, z, look, y, pitch] of SPOTS[map]) {
    await pg.evaluate(([x, z, look, y, pitch]) => {
      const g = window.__game;
      const yaw = Array.isArray(look) ? Math.atan2(-(look[0] - x), -(look[1] - z)) : look;
      g.player.teleport(x, z, yaw, y); g.player.lookPitch = pitch; g.sim(0.3);
    }, [x, z, look, y, pitch]);
    await pg.waitForTimeout(1200);   // real frames: the floor's rooms, the lamps that follow you
    out.spots[name] = await pg.evaluate(() => {
      const g = window.__game, r = g.renderer, gl = r.getContext(), px = new Uint8Array(4);
      g.scene.updateMatrixWorld(true);
      const frame = () => { const t0 = performance.now(); r.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      for (let i = 0; i < 8; i++) frame();
      const t = Array.from({ length: 40 }, frame).sort((a, b) => a - b);
      return { ms: +t[20].toFixed(1), calls: r.info.render.calls, tris: r.info.render.triangles };
    });
  }
  out.programs = await pg.evaluate(() => window.__game.renderer.info.programs.length);
  out.pr = await pg.evaluate(() => window.__game.renderer.getPixelRatio());
  out.kb = await pg.evaluate(() => Math.round(performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation')).reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 1024));
  await ctx.close();
  return out;
}

const browser = await launch();
const rows = [];
try {
  for (const map of Object.keys(SPOTS)) for (const preset of PRESETS) for (const v of variants) {
    const r = await page(browser, map, preset, v);
    rows.push(r);
    console.log(`${map.padEnd(8)} ${preset.padEnd(7)} style=${r.variant.padEnd(3)} pr ${r.pr}  programs ${r.programs}  ${r.kb} KB  ` +
      Object.entries(r.spots).map(([n, s]) => `${n}: ${s.ms} ms ${s.calls} calls ${s.tris} tris`).join(' | '));
  }
} finally {
  await browser.close();
  server.close();
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
