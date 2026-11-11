// The guard card (the plan glm 2026-11-10, hr.hud): the phone HUD's top-centre card — the nearest
// guard's portrait + the suspicion scale 0..100 that mirrors alert.suspicion. What is checked here:
// the scale repeats the suspicion and decays, the card's states 0/1/2 follow alert.level, the
// portrait is the nearest guard's (Petrovych on the dacha; Valera / Zhora by floor on the mansion),
// the minimal mode shows the card while there is something to hear, the human-guard mode hides it,
// and a guest sees the host's suspicion through guestApply (the sync path). The «?» / «!» and the
// bar over the guards' heads keep depthTest (hidden behind walls together with the body).
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, preview, LAND, frames } from './runner.mjs';

const G = (page, fn, arg) => page.evaluate(fn, arg);
const goneOf = (page) => G(page, () => document.querySelector('#hud .gsus').classList.contains('gone'));
const lvlOf = (page) => G(page, () => document.querySelector('#hud .gsus').getAttribute('data-lvl'));
const fillOf = (page) => G(page, () => parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width));
// move the card along at once (its guard is re-aimed once a second); the card's fields live in the
// state's G (window.__game is the debug snapshot that hides them, tests read via state.js). The
// panel is a frame-phase system: g.sim() runs only the logic phases, so the card moves on natural
// (drawn) frames — reset its timer, then let a few real frames pass
const recard = async (page) => { await G(page, async () => { const { G: S } = await import('./src/systems/state.js'); S.cardGuardT = 0; }); await frames(page, 4); };
const cardGuardOf = (page) => G(page, async () => { const { G: S } = await import('./src/systems/state.js'); return S.cardGuard; });
async function playPhoneAt(ctxOpts, url = base) {
  const ctx = await newContext(browser, ctxOpts);
  const { page, errors } = await open(ctx, url);
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  await frames(page, 3);
  return { ctx, page, errors };
}

test('hud card: the scale mirrors alert.suspicion and decays, the states 0/1/2, the portrait, minimal and human-guard modes', async () => {
  const { ctx, page, errors } = await playPhoneAt(LAND);
  const noise = () => G(page, () => { const g = window.__game; g.alert.add(25, g.player.head.x, g.player.head.z); });
  // calm: the scale at 0, the card visible (the HUD is not minimal yet), the state 0
  assert.equal(await fillOf(page), 0, 'the scale starts empty');
  assert.equal(await lvlOf(page), '0');
  assert.equal(await goneOf(page), false, 'the card stays at rest in the normal mode');
  // the guards freeze for the whole test: the noise draws a live guard to the player's head and on a
  // slow run it arrives and catches (the round ends, the card hides) — the card's logic needs none of it
  await G(page, () => { for (const p of window.__game.guards) p.update = () => null; });
  // a heard noise: the scale swings to 25 and the card is in «?» (checking)
  await noise();
  await page.waitForFunction(() => parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width) >= 20, null, { timeout: 8000 });
  assert.equal(await lvlOf(page), '1', 'suspicion > 1: the checking state');
  // full alarm: the state 2 (red), then back to calm. The state is set directly (setFull would run
  // its real alarm course: the radios, the escape and its time limit); the HUD reads only
  // alert.level, so the exact trigger does not matter for the card's logic
  await G(page, () => { const g = window.__game; g.alert.reset(); g.alert.full = true; g.sim(0.2); });
  await frames(page, 2);
  assert.equal(await lvlOf(page), '2');
  // the portrait: a real png of the guard (Petrovych on the dacha, the nearest guard here)
  await recard(page);
  await page.waitForFunction(() => (document.querySelector('#hud .gsus-pic').src || '').startsWith('data:image/png'), null, { timeout: 8000 });
  const cg = await cardGuardOf(page);
  assert.equal(cg, 'petrovych', `the card is Petrovych on the dacha (state G, got ${String(cg)})`);
  const src0 = await G(page, () => document.querySelector('#hud .gsus-pic').src);
  // decay: the suspicion melts away (4 pts per second of game time) and the scale follows it
  const both = (page) => G(page, () => [parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width), window.__game.alert.suspicion]);
  await G(page, () => { const g = window.__game; g.alert.full = false; g.alert.suspicion = 40; });
  await frames(page, 4);
  const [f1, s1] = await both(page);
  assert.ok(Math.abs(f1 - s1) <= 2 && s1 > 30, `the scale mirrors the suspicion (${f1} vs ${s1})`);
  await G(page, () => window.__game.sim(4));   // 40 - 4 * 4 ≈ 24 pts
  await frames(page, 4);
  const [f2, s2] = await both(page);
  assert.ok(s2 < s1 - 10 && Math.abs(f2 - s2) <= 2, `the scale falls with the suspicion (${f1}/${s1} -> ${f2}/${s2})`);
  // the minimal mode: hidden at calm, visible while the suspicion counts
  await G(page, () => { const g = window.__game; g.alert.reset(); g.sim(0.2); });
  await frames(page, 4);
  await G(page, () => { document.getElementById('hudmode').value = 'min'; document.getElementById('hudmode').dispatchEvent(new Event('change')); });
  await frames(page, 4);
  assert.equal(await goneOf(page), true, 'minimal mode: no card while calm');
  await G(page, () => { const g = window.__game; g.alert.suspicion = 40; g.sim(0.3); });
  await frames(page, 4);
  assert.equal(await goneOf(page), false, 'minimal mode: the card shows while the suspicion counts');
  // and it drops back when the suspicion reaches 0
  await G(page, () => { const g = window.__game; g.alert.suspicion = 0; g.sim(0.3); });
  await frames(page, 4);
  assert.equal(await goneOf(page), true, 'minimal mode: the card hides at 0');
  // the human-guard mode: the card hides (the suspicion does not count there, it is always greenish-0)
  await G(page, async () => { const { G: S } = await import('./src/systems/state.js'); S.humanGuard = true; });
  await noise();
  await frames(page, 4);
  assert.equal(await goneOf(page), true, 'the human-guard mode hides the card');
  const srcNow = await G(page, () => document.querySelector('#hud .gsus-pic').src);
  assert.equal(srcNow === '' || srcNow === src0, true, 'the portrait keeps its src or is empty');
  await G(page, async () => { const { G: S } = await import('./src/systems/state.js'); S.humanGuard = false; });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion: the card picks the nearer guard — Valera by the spawn, Zhora after a teleport beside him', async () => {
  const ctx = await newContext(browser, LAND);
  await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, preview + '?map=mansion');
  await page.tap('#start');
  await page.waitForFunction(() => window.__game.playing);
  await frames(page, 3);
  assert.equal(await G(page, () => window.__game.level.id), 'mansion');
  assert.equal(await G(page, () => window.__game.guards.length), 2, 'two guards on this map');
  // the guards go on their rounds: pin them to known spots for a deterministic margin test. Valera
  // (the ground floor) by the spawn in the alley… Zhora (the first floor) is in his room upstairs.
  const placeG = (a, b) => G(page, ([p1, p2]) => { const g = window.__game; g.patrol.x = p1[0]; g.patrol.z = p1[1]; g.patrol.y = p1[2]; g.patrol2.x = p2[0]; g.patrol2.z = p2[1]; g.patrol2.y = p2[2]; }, [a, b]);
  const VALERA = [10, -8.5, 0], ZHORA = [-10.3, -9, 3];   // the mansion's first floor lives at y ≈ 3 m
  await placeG(VALERA, ZHORA);
  // by the spawn in the alley: Valera is a step away, Zhora across the house and a floor up
  await G(page, () => { window.__game.player.teleport(10.5, -8.8, 0, 0); });
  await recard(page);
  assert.equal(await cardGuardOf(page), 'valera', 'the ground guard by the spawn');
  // right at Zhora's spot upstairs: the floor wins, Valera loses
  await placeG(VALERA, ZHORA);
  await G(page, () => { window.__game.player.teleport(-10, -9.2, Math.PI, 3); });
  await recard(page);
  assert.equal(await cardGuardOf(page), 'zhora', `the floor guard upstairs (${JSON.stringify(await G(page, async () => { const { G: S } = await import('./src/systems/state.js'); return { log: (S.cardLog || []).slice(-6) }; }))})`);
  // and the portrait is Zhora's
  await page.waitForFunction(() => (document.querySelector('#hud .gsus-pic').src || '').includes('image/png'), null, { timeout: 8000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a guest sees the host\'s suspicion through guestApply (the sync path), and the marks keep depthTest', async () => {
  const { ctx, page, errors } = await playPhoneAt(LAND);
  // the same path a real guest runs: a 'state' message applied by net/sync.js. The guard's mind is
  // switched off so nothing local (a chase, a noise) overwrites the host's alarm while the check runs.
  await G(page, () => {
    const g = window.__game;
    g.patrol.update = () => null;
    return import('./src/net/sync.js').then(({ guestApply }) => guestApply({
      type: 'state', full: 0,
      r: ['heist', 60, 0, 0, 0],
      a: [1, 90, 0, 0, 1],
      pw: 1, c: [g.contract.id, g.difficulty], p: [], l: [], d: [], i: [],
      g: [[0, 0, 0, 0, 0, 1, 0, 0, 0, 0, '']],
    }, g.player.pid));
  });
  await page.waitForFunction(() => parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width) >= 50, null, { timeout: 8000 });
  assert.equal(await lvlOf(page), '1', 'the synced level passes into the card');
  // the marks and the bar over the guards stay behind walls with the body (depth test, not checks each frame)
  const dt = await G(page, () => ({ mark: window.__game.patrol.mark.material.depthTest, bar: window.__game.patrol.bar.material.depthTest }));
  assert.deepEqual(dt, { mark: true, bar: true }, 'the marks keep depthTest');
  assert.deepEqual(errors, []);
  await ctx.close();
});
