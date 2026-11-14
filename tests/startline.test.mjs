// The start of a round (claude/dacha-window): the dacha's gate is the start line (the clock starts when anybody is through it,
// not when someone is 4.5 m from the van), a big «ПІШЛИ!» with a sound comes at that moment (level 0: «Репетиція: часу нема»),
// the chalk line lies where it starts; the mansion keeps its ring round the van and gets the same banner, sound and a chalk arc.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview, LAND, frames } from './runner.mjs';

const campaignCtx = async (opts = {}) => {
  const ctx = await newContext(browser, opts);
  // every level open (the preview's switch): a closed contract is swapped for the last open one when you leave the van
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
  return ctx;
};

test('start line, the dacha: the lane and the apron do not start the clock, the gate does; the chalk line lies there and goes when the clock starts; any one of several players starts it for all', async () => {
  const ctx = await campaignCtx();
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), R = await import('./src/game/round.js'), Y = await import('./src/world/yard.js'), out = {};
    g.playing = true; g.setContract('first'); g.newRound(); g.sim(0.3);
    for (const p of g.guards) p.update = () => null;
    out.region = g.CFG.round.startRegion; out.mark = G.level.startMark;
    const phaseAt = (x, z) => { g.newRound(); g.sim(0.2); g.player.teleport(x, z, 0); g.sim(0.3); return G.round.phase; };
    // 4.5 m+ from the van, but outside the gate: not started (it was, before)
    out.lane = [[3.0, 14.0], [2.5, 10.2], [3.0, 9.6], [11.0, 18.0], [4.3, 10.6]].map(([x, z]) => phaseAt(x, z));
    out.yard = [[3.0, 8.2], [0, 4], [-8, 2], [6.5, 3.2]].map(([x, z]) => phaseAt(x, z));
    // the chalk line: ready -> visible; after the start -> hidden
    g.newRound(); g.sim(0.3);
    const line = () => G.scene.getObjectByName('start line');
    out.lineReady = !!line() && line().visible;
    g.player.teleport(3.0, 8.0, 0); g.sim(0.3); g.sim(0.1);
    out.lineAfter = line().visible;
    // several players (a guest too): one of them through the gate starts the clock for all
    out.pastStart = [R.pastStart({ x: 3, z: 8 }), R.pastStart({ x: 3, z: 9.2 }), R.pastStart({ x: 8, z: 14 }), R.pastStart({ x: -10, z: -5 })];
    const rd = G.round; rd.reset();
    const heads = { a: { head: { x: 8.0, z: 12.0 } }, b: { head: { x: 3.0, z: 8.0 } } };
    rd.update(0.1, [heads.a]); out.oneOutside = rd.phase;
    rd.update(0.1, [heads.a, heads.b]); out.oneThrough = rd.phase;
    out.lineZ = Y.START_LINE_Z; out.gateZ = Y.YARD_FENCE_Z;
    return out;
  });
  assert.ok(r.region && r.region.maxZ < r.gateZ, `the dacha has a start region inside the gate: ${JSON.stringify(r.region)}`);
  assert.equal(r.mark.kind, 'line');
  assert.deepEqual(r.lane, ['ready', 'ready', 'ready', 'ready', 'ready'], `outside the gate nothing starts: ${r.lane}`);
  assert.deepEqual(r.yard, ['heist', 'heist', 'heist', 'heist'], `through the gate it starts: ${r.yard}`);
  assert.equal(r.lineReady, true, 'the chalk line lies there before the start');
  assert.equal(r.lineAfter, false, 'and is gone once the clock runs');
  assert.deepEqual(r.pastStart, [true, false, false, true]);
  assert.equal(r.oneOutside, 'ready'); assert.equal(r.oneThrough, 'heist', 'any one of the players starts it for all');
  assert.ok(r.lineZ < r.gateZ && r.lineZ > r.gateZ - 1, 'the line is just inside the gate');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('start banner: «ПІШЛИ!» comes when the clock starts — «Репетиція: часу нема» on level 0, «Годинник пішов» elsewhere — once per start, and fades out', async () => {
  // level 0 only exists in the campaign; the classic game (no campaign flag) has the old contracts all open: two pages
  const play = async (campaign, id) => {
    const ctx = await newContext(browser, LAND);
    await ctx.addInitScript((campaign) => { window.__NOCTURNE_TEST = campaign ? { pages: 'all', splash: false, campaign: true } : { pages: 'all', splash: false }; }, campaign);
    const { page, errors } = await open(ctx, base + '?map=dacha');
    await page.tap('#start');
    await page.waitForFunction(() => window.__game.playing);
    const banner = () => page.evaluate(() => { const e = document.getElementById('gobanner'); return e ? { on: e.classList.contains('on'), text: e.querySelector('b').textContent, sub: e.querySelector('span').textContent, op: +getComputedStyle(e).opacity } : null; });
    await page.evaluate((id) => { const g = window.__game; g.player.teleport(3.0, 14.0, 0); g.setContract(id); g.newRound(); for (const p of g.guards) p.update = () => null; g.player.teleport(3.0, 14.0, 0); g.sim(0.2); }, id);   // out of the yard before the round is new: the clock must not start by itself
    await frames(page, 4);
    assert.equal(await page.evaluate(() => [window.__game.contract.id, window.__game.round.phase]).then((x) => x.join()), `${id},ready`, `${id}: waiting at the lane`);
    const before = await banner();
    await page.evaluate(() => { const g = window.__game; g.player.teleport(3.0, 8.0, 0); g.sim(0.2); });
    await page.waitForFunction(() => { const e = document.getElementById('gobanner'); return e && e.classList.contains('on'); }, null, { timeout: 8000 });
    const during = await banner();
    // it fades out by itself, and goes again with the next start
    await page.waitForFunction(() => { const e = document.getElementById('gobanner'); return !e.classList.contains('on') && +getComputedStyle(e).opacity < 0.05; }, null, { timeout: 10000 });
    await page.evaluate(() => { const g = window.__game; g.player.teleport(3.0, 14.0, 0); g.newRound(); g.player.teleport(3.0, 14.0, 0); g.sim(0.2); });
    await frames(page, 4);
    await page.evaluate(() => { const g = window.__game; g.player.teleport(3.0, 8.0, 0); g.sim(0.2); });
    await page.waitForFunction(() => document.getElementById('gobanner').classList.contains('on'), null, { timeout: 8000 });
    assert.deepEqual(errors, []);
    await ctx.close();
    return { before, during };
  };
  const l0 = await play(true, 'rehearsal');
  assert.ok(!l0.before || !l0.before.on, 'no banner before the start');
  assert.deepEqual([l0.during.text, l0.during.sub], ['ПІШЛИ!', 'Репетиція: часу нема'], 'level 0');
  const l1 = await play(false, 'first');
  assert.deepEqual([l1.during.text, l1.during.sub], ['ПІШЛИ!', 'Годинник пішов'], 'a level with a clock');
});

test('start sound: three knocks and a bell, no louder than 6 dB under the patrol step on the bus (the microphone rule), quieter again at the speaker rule; nothing when the audio is not running', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const A = await import('./src/audio/audio.js'), Go = await import('./src/audio/goSfx.js'), P = await import('./src/audio/placeSfx.js'), g = window.__game;
    const c = A.unlockAudio(); await new Promise((x) => setTimeout(x, 300));
    const lvl = async (fn, ms) => { fn(); let m = -100; const t0 = performance.now(); while (performance.now() - t0 < ms) { m = Math.max(m, A.gameBusDb()); await new Promise((x) => setTimeout(x, 6)); } return m; };
    const out = { state: c && c.state };
    out.step = await lvl(() => A.playStep(new A.Voice3D(1, false), 1), 400);
    out.go = await lvl(() => Go.playGo(1), 2600);
    out.speaker = await lvl(() => Go.playGo(g.CFG.placeSound.speakerK), 2600);
    out.silence = await lvl(() => {}, 600);
    out.k = [P.placeK({ state: 'off' }), g.CFG.placeSound.speakerK];
    return out;
  });
  assert.equal(r.state, 'running');
  assert.ok(r.go <= r.step - 6, `the start sound is under the patrol step: ${r.go.toFixed(1)} vs ${r.step.toFixed(1)} dB`);
  assert.ok(r.go > r.step - 22, `and it can be heard: ${r.go.toFixed(1)} dB`);
  assert.ok(r.speaker <= r.go - 4, `at the speaker rule it is quieter again: ${r.speaker.toFixed(1)} vs ${r.go.toFixed(1)}`);
  assert.ok(r.silence < -70, `then silence: ${r.silence.toFixed(1)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('start, the mansion: the old ring (4.5 m from the van) is kept and shown by a chalk arc with «СТАРТ»; the same banner and sound; the arc goes when the clock starts', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false }; try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, preview + '?map=mansion');
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), out = { id: g.level.id, mark: G.level.startMark, region: g.CFG.round.startRegion || null };
    for (const p of g.guards) p.update = () => null;
    const V = g.CFG.round.vanZone, D = g.CFG.round.startDist, phaseAt = (dz) => { g.newRound(); g.sim(0.2); g.player.teleport(V.x, V.z + dz, 0); g.sim(0.3); return G.round.phase; };
    out.dz = [phaseAt(D - 0.3), phaseAt(D + 0.3)];
    g.newRound(); g.sim(0.3);
    const arc = G.scene.getObjectByName('start line');
    out.arc = arc ? { visible: arc.visible, dashes: arc.children.length } : null;
    g.player.teleport(V.x, V.z + D + 0.5, 0); g.sim(0.3); g.sim(0.1);
    out.arcAfter = arc.visible;
    return out;
  });
  assert.equal(r.id, 'mansion'); assert.equal(r.mark.kind, 'arc'); assert.equal(r.region, null, 'the mansion has no start region: the ring round the van');
  assert.deepEqual(r.dz, ['ready', 'heist'], `the ring is 4.5 m: ${r.dz}`);
  assert.ok(r.arc && r.arc.visible && r.arc.dashes > 15, `the chalk arc is there before the start: ${JSON.stringify(r.arc)}`);
  assert.equal(r.arcAfter, false);
  await page.waitForFunction(() => { const e = document.getElementById('gobanner'); return e && e.classList.contains('on'); }, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.querySelector('#gobanner b').textContent), 'ПІШЛИ!');
  assert.deepEqual(errors, []);
  await ctx.close();
});
