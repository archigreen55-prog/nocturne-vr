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

test('style (S2): the figures — Petrovych on the dacha, Valera and Zhora in the mansion, Шафник, a friend in the colour of the thief; 2 draw calls each, few triangles; the trap poses and Pozikhailo (gone when the guard is angry); the bucket on the new head; ?style=off keeps the old figures', async () => {
  const figs = async (map, st) => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); localStorage.setItem('nocturne.preview.tutorial', JSON.stringify({ done: true })); } catch { /* opaque */ } });
    const o = await open(ctx, preview + `?map=${map}&style=${st}&figures=on`);   // the figures stay off in the game until the owner approves them
    return { ctx, ...o };
  };
  const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  // the dacha: Petrovych, Шафник, a friend
  let { ctx, page, errors } = await figs('dacha', 'on');
  const d = await page.evaluate(async () => {
    const g = window.__game, P = g.patrol;
    const { RemotePlayer } = await import('./src/net/remotePlayer.js');
    const rp = new RemotePlayer({ id: 'f', name: 'Оля', thief: 'rita' });
    const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const info = (f) => f && { who: f.who, meshes: f.root.children.length, skinned: f.root.children.every((m) => m.isSkinnedMesh), tris: f.root.children.reduce((s, m) => s + tri(m), 0) };
    const lurk = g.lurker;
    return {
      guard: info(P.fig), friend: info(rp.fig), oldGuard: P.body.geometry.attributes.position ? P.body.geometry.attributes.position.count : 0,
      lurkerEyes: Array.from(lurk.eyes.geometry.attributes.color.array.slice(0, 3)).map((v) => +v.toFixed(2)), whisper: new g.THREE.Color(0x7fd0ff).toArray().map((v) => +v.toFixed(2)), lurkerOutline: !!lurk.body.getObjectByName('style: wardrobe outline'),
    };
  });
  assert.deepEqual([d.guard.who, d.guard.meshes, d.guard.skinned], ['petrovych', 2, true], 'the dacha\'s guard: Petrovych, one skinned mesh + its outline');
  assert.deepEqual([d.friend.who, d.friend.meshes], ['rita', 2], 'a friend: the thief\'s figure');
  assert.ok(d.guard.tris <= 2800 && d.friend.tris <= 2200, `triangles with the outline: guard ${d.guard.tris}, friend ${d.friend.tris}`);
  assert.equal(d.oldGuard, 0, 'the old figure is not drawn');
  assert.deepEqual(d.lurkerEyes, d.whisper, 'Шафник\'s eyes: Шепіт (0x7fd0ff), as in the art');
  assert.ok(d.lurkerOutline, 'Шафник has an outline');
  // poses: soap = feet up, the bucket on the head; angry = Pozikhailo leaves
  const poses = await page.evaluate(async () => {
    const g = window.__game, P = g.patrol, B = P.fig.bones, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    P.knockOut('soap', 30, 'flip'); await wait(700);
    const flip = +B.legL.rotation.x.toFixed(2);
    P.pose = 'kneel'; await wait(700);
    const kneel = +B.legL.rotation.x.toFixed(2);
    P.pose = 'bucket'; await wait(700);
    const bucket = +B.armL.rotation.x.toFixed(2), bucketY = P.bucketMesh ? +P.bucketMesh.position.y.toFixed(2) : null;
    const until = async (ok) => { for (let i = 0; i < 80 && !ok(); i++) await wait(100); };   // slow software frames: dt is capped
    P.pose = null; P.stunT = 0; P.brain.angryT = 30; await until(() => B.poz.scale.x < 0.1);
    const poz = +B.poz.scale.x.toFixed(2);
    P.brain.angryT = 0; await until(() => B.poz.scale.x > 0.9);
    return { flip, kneel, bucket, bucketY, poz, pozBack: +B.poz.scale.x.toFixed(2), headY: P.fig.headY };
  });
  assert.ok(poses.flip > 0.3, `soap: the legs up (${poses.flip})`);
  assert.ok(poses.kneel < -1, `marbles: on the knees (${poses.kneel})`);
  assert.ok(poses.bucket > 2, `bucket: the hand up to the head (${poses.bucket})`);
  assert.equal(poses.bucketY, +(poses.headY - 1.66).toFixed(2), 'the bucket sits on the new head');
  assert.ok(poses.poz < 0.1 && poses.pozBack >= 0.9, `Pozikhailo: gone when angry (${poses.poz}), back after (${poses.pozBack})`);
  assert.deepEqual(errors, []);
  await ctx.close();
  // the mansion: Valera and Zhora
  ({ ctx, page, errors } = await figs('mansion', 'on'));
  const m = await page.evaluate(() => window.__game.guards.map((p) => p.fig && p.fig.who));
  assert.deepEqual(m, ['valera', 'zhora']);
  assert.deepEqual(errors, []);
  await ctx.close();
  // style off: the old figures, untouched
  ({ ctx, page, errors } = await figs('mansion', 'off'));
  const o = await page.evaluate(() => window.__game.guards.map((p) => ({ fig: !!p.fig, body: p.body.geometry.attributes.position.count > 0, upper: p.upper.geometry.attributes.position.count > 0 })));
  assert.deepEqual(o, [{ fig: false, body: true, upper: true }, { fig: false, body: true, upper: true }], 'style off: the old guards');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('style: the game\'s random numbers are not touched — the style on or off, the page makes the same number of Math.random calls while it loads and plays (three.js names objects with Math.random; the style\'s take theirs from crypto)', async () => {
  const count = async (q) => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript(() => { let n = 0; const r = Math.random; Math.random = () => { n++; return r(); }; window.__rn = () => n; try { localStorage.setItem('nocturne.preview.tutorial', JSON.stringify({ done: true })); } catch { /* opaque */ } });
    const { page, errors } = await open(ctx, preview + q);
    const n = await page.evaluate(() => { const g = window.__game; const a = window.__rn(); for (let i = 0; i < 3; i++) g.renderer.render(g.scene, g.camera); return [a, window.__rn()]; });
    assert.deepEqual(errors, []);
    await ctx.close();
    return n;
  };
  const off = await count('?style=off'), on = await count('?style=on'), figs = await count('?style=on&figures=on');
  assert.deepEqual(on, off, `Math.random calls (loaded, after drawing): style on ${on}, off ${off}`);
  assert.deepEqual(figs, off, `Math.random calls with the new figures: ${figs}, style off ${off}`);
});

test('style: the character sheet (?page=figures) — every figure in the row, one in three views, the four thieves at 8 m; the light under a lamp, in the shadow, in the alarm; old / new; the game keeps its old figures until the owner approves (CFG.style.figures)', async () => {
  const ctx = await newContext(browser, LAND);
  const { page, errors } = await open(ctx, preview + '?page=figures');
  await page.waitForFunction(() => window.__game.style.sheet, null, { timeout: 30000 });
  const ids = () => page.evaluate(() => window.__game.style.sheet.cast.map((c) => `${c.id}:${c.isNew ? 'new' : 'old'}`));
  assert.deepEqual(await ids(), ['petrovych', 'valera', 'zhora', 'zoya', 'frol', 'ritaWine', 'ritaPowder', 'nazar', 'shafnyk'].map((id) => `${id}:new`), 'the whole cast, new');
  const press = async (k) => { await page.tap(`button[data-k="${k}"]`); await page.waitForTimeout(300); };
  for (const k of ['shadow', 'alarm', 'lamp', 'walk', 'look']) await press(k);
  assert.equal(await page.evaluate(() => window.__game.style.uniforms.uStyleZoneOn.value), 1, 'under the lamp: the «you are seen» step');
  await press('ver');
  assert.ok((await ids()).every((s) => /:old$/.test(s) || s.startsWith('shafnyk')), 'old figures');
  await press('ver'); await press('one');
  assert.equal((await ids()).length, 4, 'one figure: three views and one that moves');
  await press('far');
  assert.deepEqual(await ids(), ['zoya', 'frol', 'ritaWine', 'nazar'].map((id) => `${id}:new`), 'the four thieves');
  assert.ok(await page.evaluate(() => Math.abs(window.__game.style.sheet.camera.position.z + 8) < 0.01), 'at 8 m');
  assert.equal(await page.evaluate(() => window.__game.style.uniforms.uStyleZoneOn.value), 0, 'in the shadow');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the game: the old figures until the owner approves the new ones
  const c2 = await newContext(browser, LAND);
  const g = await open(c2, preview);
  assert.equal(await g.page.evaluate(() => !!window.__game.patrol.fig), false, 'the game keeps the old guard (CFG.style.figures = false)');
  assert.deepEqual(g.errors, []);
  await c2.close();
});
