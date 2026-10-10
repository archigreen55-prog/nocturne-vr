// W17 «Стиль» (plan-W17-style.md): one material factory for the whole game (src/style/materials.js),
// the flashlight's patches chained on it, the style switch.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, LAND, preview } from './runner.mjs';

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p)); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('style (S0): every lit material comes from the factory — none made elsewhere in src/, every one in the scene of both maps carries the flashlight mask, one made later too', async () => {
  const bad = [];
  for (const f of await jsFiles(join(ROOT, 'src'))) {
    if (f.includes(join('src', 'style'))) continue;
    const src = await readFile(f, 'utf8');
    if (/new\s+THREE\.Mesh(Lambert|Standard|Phong|Physical|Toon)Material/.test(src)) bad.push(f.slice(ROOT.length));
  }
  assert.deepEqual(bad, [], 'lit materials outside src/style/: use lit() from src/style/materials.js');
  for (const map of ['dacha', 'mansion']) {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
    const { page, errors } = await open(ctx, preview + '?map=' + map);
    const r = await page.evaluate(() => {
      const g = window.__game, out = { lit: 0, unstyled: [], unmasked: [] };
      g.scene.traverse((o) => {
        for (const m of o.material ? [].concat(o.material) : []) {
          if (!m.isMeshLambertMaterial) continue;
          out.lit++;
          if (!m.userData.styled) out.unstyled.push(o.name || o.type);
          if (!m.userData.flashMask || !m.userData.flashWalls) out.unmasked.push(o.name || o.type);
        }
      });
      const later = g.style.lit();   // a friend joining mid-round: its material is made now
      out.later = { styled: !!later.userData.styled, mask: !!later.userData.flashMask, walls: !!later.userData.flashWalls, key: later.customProgramCacheKey() };
      out.on = g.style.on;
      return out;
    });
    assert.ok(r.lit > 3, `${map}: lit materials in the scene (${r.lit})`);
    assert.deepEqual(r.unstyled, [], `${map}: not from the factory`);
    assert.deepEqual(r.unmasked, [], `${map}: without the flashlight mask`);
    assert.deepEqual(r.later, { styled: true, mask: true, walls: true, key: 'flashmask-lit|-walls|style' }, `${map}: a later material (the style's patch runs last)`);
    assert.equal(r.on, true, 'the style is on by default');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // ?style=off: this page only; the factory still makes every material (the switch decides the look)
  const ctx = await newContext(browser, LAND);
  const { page, errors } = await open(ctx, preview + '?style=off');
  assert.equal(await page.evaluate(() => window.__game.style.on), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// The picture's luminance (linear, 0..1) around a world point: a 7 x 7 px patch of the drawn frame.
async function lumAt(page, pts) {
  return page.evaluate((pts) => {
    const g = window.__game, r = g.renderer, gl = r.getContext(), V = new g.THREE.Vector3();
    g.scene.updateMatrixWorld(true);
    r.render(g.scene, g.camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(7 * 7 * 4);
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return pts.map(([x, y, z]) => {
      V.set(x, y, z).project(g.camera);
      const sx = Math.round((V.x + 1) / 2 * w), sy = Math.round((V.y + 1) / 2 * h);
      gl.readPixels(sx - 3, sy - 3, 7, 7, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0;
      for (let i = 0; i < 49; i++) s += 0.2126 * lin(px[i * 4]) + 0.7152 * lin(px[i * 4 + 1]) + 0.0722 * lin(px[i * 4 + 2]);
      return s / 49;
    });
  }, pts);
}

test('style (S1): three steps — the lamp\'s circle on the floor is the stealth radius (lit inside, not outside), lit ≥ 3 x shadow at brightness steps 1 and 5; the night sky and dusk fog; no new shader programs when the preset, the brightness or the lamps change; ?style=off draws as before (no decor)', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.tutorial', JSON.stringify({ done: true })); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, preview + '?map=dacha');
  // the yard lamp: stand at its circle's edge, look down at the grass across it
  const L = await page.evaluate(() => { const g = window.__game, l = g.CFG.stealth.lamps[0]; g.player.teleport(l.x + 4.2, l.z + 1.5, Math.atan2(4.2, 1.5)); g.player.lookPitch = -0.75; g.sim(0.2); return l; });
  await page.waitForTimeout(1200);   // the lamps' intensities follow the frame
  const sample = () => lumAt(page, [[L.x + L.r - 0.45, 0, L.z], [L.x + L.r + 0.45, 0, L.z], [L.x + L.r + 1.2, 0, L.z]]);
  const s1 = await sample();
  const u = await page.evaluate(() => { const g = window.__game, U = g.style.uniforms; return { n: g.style.zones.length, bg: g.scene.background.getHex(), fog: g.scene.fog.color.getHex(), programs: g.renderer.info.programs.length }; });
  assert.ok(u.n >= 3, `the circles of the three lamps: ${u.n}`);
  assert.equal(u.bg, 0x0d1322, 'the sky is Ніч');
  assert.equal(u.fog, 0x18223a, 'the fog is Сутінки');
  assert.ok(s1[0] >= 3 * s1[1] && s1[0] >= 3 * s1[2], `step 1: inside the circle ${s1[0].toFixed(4)}, just outside ${s1[1].toFixed(4)}, further ${s1[2].toFixed(4)} (lit ≥ 3 x)`);
  // brightness step 5: everything brighter, the circle still reads
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__game.brightness.step(1); });
  await page.waitForTimeout(800);
  const s5 = await sample();
  assert.ok(s5[1] > s1[1] * 1.5, `step 5 is brighter outside the circle too (${s1[1].toFixed(4)} -> ${s5[1].toFixed(4)})`);
  assert.ok(s5[0] >= 3 * s5[1], `step 5: inside ${s5[0].toFixed(4)}, outside ${s5[1].toFixed(4)} (lit ≥ 3 x)`);
  // the low preset's thinner lines and a moving lamp: uniforms only, no new programs
  const p2 = await page.evaluate(() => {
    const g = window.__game, U = g.style.uniforms;
    if (g.quality) g.quality.setSetting('low');
    U.uStyleZoneOn.value = 0; U.uStyleZoneRect.value.x += 0.5;
    g.renderer.render(g.scene, g.camera);
    return g.renderer.info.programs.length;
  });
  assert.equal(p2, u.programs, 'no shader rebuilt');
  assert.deepEqual(errors, []);
  await ctx.close();
  // ?style=off: the sky and fog as before W17, nothing added
  const c2 = await newContext(browser, LAND);
  const off = await open(c2, preview + '?map=dacha&style=off');
  const o = await off.page.evaluate(() => { const g = window.__game; let decor = 0; g.scene.traverse((m) => { if (/^style:/.test(m.name)) decor++; }); return { bg: g.scene.background.getHex(), fog: g.scene.fog.color.getHex(), decor, styled: g.scene.getObjectByName('scoreboard') && 1 }; });
  assert.deepEqual({ bg: o.bg, fog: o.fog, decor: o.decor }, { bg: 0x0a0f1c, fog: 0x0a0f1c, decor: 0 }, 'style off: the old sky and fog, no decor');
  assert.deepEqual(off.errors, []);
  await c2.close();
});

test('style (S1): the mansion — the fountain has water, each lamp\'s circle lies on its own floor (the gallery lamp upstairs), the furniture shadows hide with their floor; the switch on the start screen saves and reloads', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); localStorage.setItem('nocturne.preview.tutorial', JSON.stringify({ done: true })); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, preview + '?map=mansion');
  const m = await page.evaluate(() => {
    const g = window.__game, U = g.style.uniforms, d = g.style.decor;
    const zones = g.style.zones.map((c) => [c.x, c.z, c.r, c.y]);
    const water = d.water.map((w) => w.geometry.boundingSphere || (w.geometry.computeBoundingSphere(), w.geometry.boundingSphere)).map((s) => [s.center.x, +s.center.y.toFixed(1), s.center.z]);
    const shadows = g.level.floorMeshes.map((f) => f.children.filter((c) => /^style: furniture shadows/.test(c.name)).length);
    return { zones, water, shadows };
  });
  assert.deepEqual(m.water, [[0, 0.6, 13]], 'the fountain\'s water, on top of its basin');
  assert.ok(m.zones.some((z) => z[0] === 5 && z[1] === -8.5 && z[3] === 3), `the gallery lamp's circle is upstairs: ${JSON.stringify(m.zones)}`);
  assert.ok(m.zones.some((z) => z[0] === 0 && z[1] === 12 && z[3] === 0), 'the garden lantern\'s circle is on the ground');
  assert.deepEqual(m.shadows, [1, 1], 'one furniture-shadow mesh inside each floor\'s mesh');
  // the switch: off -> saved, reloaded without the style
  await page.selectOption('#stylesel', 'off');
  await page.waitForFunction(() => window.__game && window.__game.style && window.__game.style.on === false, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne.preview.style'))), false);
  assert.equal(await page.$eval('#stylesel', (s) => s.value), 'off');
  assert.deepEqual(errors, []);
  await ctx.close();
});
