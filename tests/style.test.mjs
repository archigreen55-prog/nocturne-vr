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
    assert.deepEqual(r.later, { styled: true, mask: true, walls: true, key: 'flashmask-lit|-walls' }, `${map}: a later material`);
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
