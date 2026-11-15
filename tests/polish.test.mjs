// The dacha polish (claude/dacha-polish): level 0's hint arrows, the street sounds switch, level 1's goal $700, the HUD's corner without
// a plate, the mansion's old Шафник in the wardrobe (the blue-eyed one in the crate). The crickets' songs: tests/placesound.test.mjs.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview, LAND, frames } from './runner.mjs';

const campaignCtx = async (opts = {}) => {
  const ctx = await newContext(browser, opts);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; });
  return ctx;
};

test('level 0: one big arrow at the gate; the three small ones from the van show only after 20 s of waiting at the van, and go when the clock starts', async () => {
  const ctx = await campaignCtx();
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), out = {};
    g.playing = true; g.setContract('rehearsal'); g.newRound(); g.sim(0.3);
    for (const p of g.guards) p.update = () => null;
    const small = () => G.scene.getObjectByName('level 0 hint arrows');
    out.count = small() ? small().children.length : 0;
    out.big = G.yardGuide.children.filter((m) => m.material && m.material.map && !m.parent.name.includes('hint') && m.geometry.parameters.height === 3.45).length;
    out.at0 = small().visible;
    for (let t = 0; t < 15; t += 0.5) g.sim(0.5);
    out.at15 = small().visible;
    for (let t = 0; t < 8; t += 0.5) g.sim(0.5);
    out.at23 = small().visible;
    g.player.teleport(3.0, 8.0, 0); g.sim(0.3); g.sim(0.2);
    out.started = [G.round.phase, small().visible];
    g.newRound(); g.sim(0.3); out.again = small().visible;
    return out;
  });
  assert.equal(r.count, 3, 'three small arrows (a hint)');
  assert.equal(r.big, 1, 'one big arrow');
  assert.deepEqual([r.at0, r.at15, r.at23], [false, false, true], 'the hint comes after 20 s');
  assert.deepEqual(r.started, ['heist', false], 'and goes with the start');
  assert.equal(r.again, false, 'a new round: not at once');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('street sounds switch: on by default, off silences the crickets, saved between runs (a second page of the same browser profile sees it)', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), A = await import('./src/audio/audio.js'), sel = document.getElementById('streetsounds'), out = { has: !!sel, def: sel && sel.value, on: G.streetSounds };
    A.unlockAudio(); await new Promise((x) => setTimeout(x, 300));
    g.playing = true; g.sim(0.3); g.player.teleport(0, 2, 0);
    const lvl = async () => { for (let i = 0; i < 6; i++) { g.sim(0.2); await new Promise((x) => setTimeout(x, 60)); } return G.placeAmbience.level.crickets; };
    out.levelOn = await lvl();
    sel.value = 'off'; sel.dispatchEvent(new Event('change'));
    out.off = G.streetSounds; out.levelOff = await lvl();
    return out;
  });
  assert.deepEqual([r.has, r.def, r.on], [true, 'on', true]);
  assert.ok(r.levelOn > 0, `on: the crickets are asked for ${r.levelOn}`);
  assert.equal(r.off, false); assert.equal(r.levelOff, 0, 'off: no crickets');
  const page2 = await ctx.newPage();
  await page2.goto(base + '?map=dacha', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page2.waitForFunction(() => window.__game, null, { timeout: 90000 });
  const kept = await page2.evaluate(() => ({ v: document.getElementById('streetsounds').value, s: localStorage.length > 0 }));
  assert.equal(kept.v, 'off', 'kept for the next run');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('level 1 «first»: the goal is $700 — 700 and more is a star, 699 is not; the texts say $700', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, C = await import('./src/game/contracts.js'), { S } = await import('./src/i18n/index.js'), out = {};
    g.playing = true; g.setContract('first'); g.newRound(); g.sim(0.3);
    const c = g.CFG.contracts.find((x) => x.id === 'first');
    out.goal = c.goal.sum; out.brief = c.brief; out.text = C.goalText(c, g.loot.items);
    const ev = (sum) => C.evaluate(c, { kind: 'left', sum, inVan: 1 }, { alarmed: false, noMic: true, difficulty: 'medium', loot: g.loot, guards: g.guards });
    out.sum500 = [500, ev(500).goal]; out.sum699 = ev(699).goal; out.sum700 = ev(700).goal;
    out.sum750 = [750, ev(750).goal, ev(750).stars];
    return out;
  });
  assert.equal(r.goal, 700);
  assert.match(r.brief, /\$700/); assert.match(r.text, /\$700/);
  assert.deepEqual(r.sum500, [500, false], JSON.stringify(r));
  assert.deepEqual([r.sum699, r.sum700], [false, true], 'the line is 700');
  assert.equal(r.sum750[1], true); assert.ok(r.sum750[2] >= 1, 'a star');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('HUD: the left corner (the eye, the guards panel) has no plate — no background, no border — and its text has an outline', async () => {
  const ctx = await newContext(browser, LAND);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  await frames(page, 4);
  const read = () => page.evaluate(() => { const c = getComputedStyle(document.querySelector('#hud .hud-tl')), n = getComputedStyle(document.querySelector('#hud .gsus-name')), r = getComputedStyle(document.querySelector('#hud .hud-tc')); return { bg: c.backgroundColor, bw: c.borderTopWidth, sh: c.boxShadow, ts: n.textShadow, tcBg: r.backgroundColor }; });
  for (const outdoor of [false, true]) {
    await page.evaluate((o) => document.body.classList.toggle('outdoor', o), outdoor);
    const c = await read();
    assert.equal(c.bg, 'rgba(0, 0, 0, 0)', `no plate (outdoor ${outdoor})`);
    assert.equal(c.bw, '0px'); assert.equal(c.sh, 'none');
    assert.notEqual(c.ts, 'none', 'the text has an outline / shadow');
    assert.notEqual(c.tcBg, 'rgba(0, 0, 0, 0)', 'the clock block keeps its plate');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion: the wardrobe has the old Шафник (no style outline, no resting arms), the garage crate the blue-eyed one; the dacha\'s wardrobe has the old one too', async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false }; try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
  const look = (url) => async () => {
    const { page, errors } = await open(ctx, url);
    const r = await page.evaluate(async () => {
      const { G } = await import('./src/systems/state.js'), F = await import('./src/style/figures.js');
      await new Promise((x) => setTimeout(x, 800));
      return { on: F.FIGURES_ON, list: G.lurkers.map((L) => ({ kind: L.kind, outlined: L.eyes.children.some((c) => c.name === 'style: eyes outline'), rest: !!L.restArms })) };
    });
    assert.deepEqual(errors, []);
    await page.close();
    return r;
  };
  const m = await look(preview + '?map=mansion')(), d = await look(preview + '?map=dacha')();
  assert.equal(m.on, true, 'the style is on');
  const [ward, crate] = m.list;
  assert.deepEqual([ward.kind, ward.outlined, ward.rest], ['wardrobe', false, false], 'the mansion\'s wardrobe: the old one');
  assert.deepEqual([crate.kind, crate.outlined], ['crate', true], 'the garage crate: the blue-eyed one');
  assert.deepEqual([d.list[0].kind, d.list[0].outlined, d.list[0].rest], ['wardrobe', false, false], 'the dacha\'s wardrobe: the old one too');
  await ctx.close();
});
