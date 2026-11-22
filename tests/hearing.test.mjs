// Plan «голос і кільця» (15.11, owner's decisions Р1–Р4 A): what the guard hears of your voice and what the
// rings on the floor show. The shout from the owner's own calibration numbers; whisper / talking / shout
// through a wall at measured distances in the dacha; a small noise = a glance and «?», 25 suspicion = it
// comes to look; a shout close by = the alarm, farther = it comes at once; a ring = the hearing radius.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

// the owner's Android calibration (the report of 07.10, tests/mic.test.mjs «mic limits»)
const OWNER = { floor: -50.119, normal: -22.408, whisper: -44.69, shout: -15.152 };

test('shout (15.11): from the owner\'s calibration the threshold is -17.3 dB, not -15.2; a steady loud voice is a shout, a knock, a cough or a loud syllable is not (30 and 10 analyses / s)', async () => {
  const ctx = await newContext(browser);
  const { page } = await open(ctx, base);
  const r = await page.evaluate(async (cal) => {
    const { Mic } = await import('./src/audio/mic.js');
    const out = {};
    for (const hz of [30, 10]) {
      const m = new Mic();
      m.state = 'on'; m.cal = { ...cal }; m.calibrated = true;
      let v = -50, t = 0;
      m.feed = () => v + (Math.random() - 0.5);
      const run = (secs, fn) => { let shout = 0; for (let k = 0; k < Math.round(secs * hz); k++) { t += 1 / hz; fn((k + 1) / hz); m.update(1 / hz); if (m.takeShout()) shout++; } return shout; };   // fn gets the time since this part began
      const quiet = () => run(1.5, () => { v = -50; });
      quiet();
      const o = { threshold: +m.shoutDb.toFixed(2) };
      o.loudSteady = run(1.2, () => { v = -16; }); quiet();          // a loud steady voice, no jump
      o.rising = run(1.6, (tt) => { v = Math.min(-15, -26 + tt * 12); }); quiet();   // talk rising into a yell
      o.talkLoud = run(2, (tt) => { v = (tt * 4) % 1 < 0.5 ? -19 : -30; }); quiet();          // loud talk: syllables under the threshold
      o.knock = run(0.1, () => { v = -3; }); o.knock += quiet();       // a knock on the phone
      o.cough = run(0.25, () => { v = -8; }); o.cough += quiet();      // a cough / «ой»
      o.syllables = run(1.2, (tt) => { v = (tt * 3) % 1 < 0.33 ? -10 : -35; }); o.syllables += quiet();   // stressed syllables
      out[hz] = o;
    }
    return out;
  }, OWNER);
  for (const [hz, o] of Object.entries(r)) {
    assert.ok(Math.abs(o.threshold - -17.33) < 0.05, `${hz} Hz: threshold ${o.threshold}`);
    assert.equal(o.loudSteady, 1, `${hz} Hz: a steady loud voice is one shout ${JSON.stringify(o)}`);
    assert.equal(o.rising, 1, `${hz} Hz: a yell rising out of talk is a shout ${JSON.stringify(o)}`);
    assert.equal(o.talkLoud + o.knock + o.cough + o.syllables, 0, `${hz} Hz: loud talk, a knock, a cough, syllables are no shout ${JSON.stringify(o)}`);
  }
  await ctx.close();
});

test('hearing (15.11) in the dacha: whisper only right next to the guard and never through a wall; talking 4 m (2 m through a wall) — a glance and «?», then it comes to look from 25 suspicion; a shout close by = the alarm, farther = it comes at once, out of reach = nothing; the rings are the hearing radius', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate(() => {
    const g = window.__game, P = g.patrol, M = g.CFG.mic, L = g.level;
    g.playing = true;
    const gx = -7.4, gz = -10.4;   // the library, its starting point
    // a point at distance d from the guard, behind a wall (wall = true) or in the open
    const at = (d, wall) => {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
        const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;   // from where the guard stands now (fresh())
        if (L.soundOccluded(P.x, P.z, x, z) === wall) return [x, z];
      }
      return null;
    };
    // a whisper through a wall: the guard by a wall, the whisper 1 m away on its other side
    let wg = null;
    for (const pts of Object.values(g.CFG.guard.rooms)) for (const [x, z] of pts) for (let a = 0; !wg && a < Math.PI * 2; a += Math.PI / 90) {
      const wx = x + Math.cos(a), wz = z + Math.sin(a);
      if (L.soundOccluded(x, z, wx, wz)) wg = { x, z, wx, wz };
    }
    const fresh = (pos = [gx, gz]) => { g.newRound(); P.reset(); P.x = pos[0]; P.z = pos[1]; P.state = 'task'; P.queue.length = 0; g.alert.reset(); g.noise.clear(); g.sim(0.05); };
    const say = (kind, d, wall) => {
      const p = at(d, wall); if (!p) return { none: true };
      const R = kind === 'whisper' ? M.whisper : kind === 'voice' ? M.voice : kind === 'shout' ? M.shout : { radius: 6 };
      g.noise.emit(p[0], p[1], R.radius, kind, { wallK: R.wallK ?? null, who: g.player });
      g.sim(0.05);
      return { state: P.state, sus: Math.round(g.alert.suspicion), full: g.alert.full, follow: P.runFollow, mark: P.markChar };
    };
    const o = {};
    fresh(); o.whisperOpen = say('whisper', 1.0, false);
    o.wallFound = !!wg;
    if (wg) { fresh([wg.x, wg.z]); g.noise.emit(wg.wx, wg.wz, M.whisper.radius, 'whisper', { wallK: M.whisper.wallK, who: g.player }); g.sim(0.05); o.whisperWall = { state: P.state, sus: Math.round(g.alert.suspicion) }; }
    fresh(wg && [wg.x, wg.z]); o.voiceWall1 = say('voice', 1.8, true);   // talking 4 m: through a wall only 2 m — the guard by a wall
     g.sim(0.3); o.voiceWall1b = { state: P.state }; o.voiceWall2 = say('voice', 1.8, true);
    fresh(); o.voiceWallFar = say('voice', 3, true);
    fresh(); o.voiceOpen = say('voice', 3.5, false);
    fresh(); o.stepOpen = say('step', 3, false); g.sim(1.6); o.stepAfter = { state: P.state };
    fresh(); o.shoutNear = say('shout', 4, true);
    fresh(); o.shoutFar = say('shout', 8, true);
    fresh(); o.shoutOut = say('shout', 11.5, true);
    // the rings: the hearing radius (x the difficulty)
    g.noise.clear(); g.noise.emit(0, 0, M.voice.radius, 'voice', { source: 'patrol' });
    o.voiceRings = g.noise.ripples.map((x) => [+x.r.toFixed(2), x.k]);
    g.noise.clear(); g.noise.emit(0, 0, M.whisper.radius, 'whisper', { source: 'patrol', wallK: M.whisper.wallK });
    o.whisperRings = g.noise.ripples.map((x) => [+x.r.toFixed(2), x.k]);
    g.noise.clear(); g.noise.emit(0, 0, M.shout.radius, 'shout', { source: 'patrol', wallK: M.shout.wallK });
    o.shoutRings = g.noise.ripples.map((x) => [+x.r.toFixed(2), x.k]);
    g.noise.clear();
    o.difficulty = g.difficulty;
    return o;
  });
  assert.equal(r.difficulty, 'medium');
  assert.deepEqual([r.whisperOpen.state, r.whisperOpen.sus, r.whisperOpen.mark], ['glance', 5, '?'], `whisper next to it: a glance ${JSON.stringify(r.whisperOpen)}`);
  assert.equal(r.wallFound, true, 'a spot by a wall');
  assert.deepEqual([r.whisperWall.state, r.whisperWall.sus], ['task', 0], `whisper through a wall: nothing ${JSON.stringify(r.whisperWall)}`);
  assert.deepEqual([r.voiceWall1.state, r.voiceWall1.sus], ['glance', 18], `talking 1.8 m through a wall: «?» and a glance first ${JSON.stringify(r.voiceWall1)}`);
  assert.equal(r.voiceWall1b.state, 'glance', 'it stays where it is');
  assert.ok(['react', 'investigate'].includes(r.voiceWall2.state) && r.voiceWall2.sus >= 25, `talking on: it comes to look ${JSON.stringify(r.voiceWall2)}`);
  assert.deepEqual([r.voiceWallFar.state, r.voiceWallFar.sus], ['task', 0], `talking 3 m through a wall (beyond 2 m): not heard ${JSON.stringify(r.voiceWallFar)}`);
  assert.equal(r.voiceOpen.state, 'glance', `talking 3.5 m in the open: heard ${JSON.stringify(r.voiceOpen)}`);
  assert.deepEqual([r.stepOpen.state, r.stepAfter.state], ['glance', 'task'], 'one step: a glance, then back to its plan');
  assert.equal(r.shoutNear.full, true, `a shout 4 m through a wall (alarm within 5.1 m): the alarm ${JSON.stringify(r.shoutNear)}`);
  assert.deepEqual([r.shoutFar.full, r.shoutFar.state, r.shoutFar.follow, r.shoutFar.sus], [false, 'investigate', true, 60], `a shout 8 m through walls: it comes at once ${JSON.stringify(r.shoutFar)}`);
  assert.deepEqual([r.shoutOut.full, r.shoutOut.state, r.shoutOut.sus], [false, 'task', 0], `a shout 11.5 m through walls (beyond 10.2 m): not heard ${JSON.stringify(r.shoutOut)}`);
  // plan 2026-11-19 «radar»: one ring, the real hearing radius (no second «through a wall» ring any more)
  assert.deepEqual(r.voiceRings, [[4, 1]], 'talking: 4 m');
  assert.deepEqual(r.whisperRings, [[1.2, 1]], 'whisper: 1.2 m');
  assert.deepEqual(r.shoutRings, [[12, 1]], 'shout: 12 m');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('levels 0–2 stay passable with the new hearing (campaign): talking 3 s behind the wall next to the guard brings him to look but no alarm, he goes back to his plan (level 0: his armchair); a shout at the van is not heard; the goal in the van = a star', async () => {
  const ctx = await newContext(browser, {}, { menu: true });
  await ctx.addInitScript(() => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    localStorage.setItem('nocturne.stars', JSON.stringify({ rehearsal: { medium: 1 }, first: { medium: 1 }, clock: { medium: 1 } }));
  });
  const { page, errors } = await open(ctx, base);
  const out = {};
  for (const id of ['rehearsal', 'first', 'clock']) {
    out[id] = await page.evaluate((id) => {
      const g = window.__game, P = g.patrol, M = g.CFG.mic, o = {};
      g.newRound(); g.setContract(id); g.newRound(); g.playing = true; o.contract = g.contract.id;   // a contract changes only before the clock
      const sight = g.CFG.patrol.sight; g.CFG.patrol.sight = 0;   // hearing only: he must not happen to see the player at the van meanwhile
      g.sim(30, 1 / 30);                                   // the guard settles into his plan (level 0: the armchair)
      o.sitting0 = P.sitting;
      g.player.teleport(0, -2.5, 0); g.sim(0.3);           // the hall: the round begins
      // 1.4 m from the guard, behind a wall (level 0: he hears x0.6 in his armchair: 1.8 m through a wall)
      let p = null;
      // (a spot a player can stand on: a walking node in a clear line within 1.5 m)
      const N = g.nav, standable = (x, z) => { const n = N.nodes[N.nearest(x, z)]; return n && Math.hypot(n.x - x, n.z - z) < 1.5 && N.clear(x, z, n.x, n.z, 0.15); };
      for (let a = 0; !p && a < Math.PI * 2; a += Math.PI / 90) { const x = P.x + Math.cos(a) * 1.4, z = P.z + Math.sin(a) * 1.4; if (g.level.soundOccluded(P.x, P.z, x, z) && standable(x, z)) p = [x, z]; }
      o.wall = !!p; p = p || [P.x + 1.4, P.z];
      let maxSus = 0, looked = false;
      for (let i = 0; i < 3; i++) {                        // 3 s of talking
        g.noise.emit(p[0], p[1], M.voice.radius, 'voice', { who: g.player });
        for (let k = 0; k < 30; k++) { g.sim(1 / 30, 1 / 30); maxSus = Math.max(maxSus, g.alert.suspicion); looked = looked || P.state !== 'task'; }
      }
      g.player.teleport(10.6, 25.4, 0);                    // back at the van, out of sight
      g.sim(40, 1 / 30);
      o.talk = { maxSus: Math.round(maxSus), full: g.alert.full, looked, back: P.state === 'task' || P.state === 'glance', sitting: P.sitting, state: P.state, act: P.activity };
      g.noise.emit(10.6, 25.4, M.shout.radius, 'shout', { who: g.player, wallK: M.shout.wallK });   // a shout at the van
      g.sim(0.2);
      o.shoutAtVan = { full: g.alert.full, sus: Math.round(g.alert.suspicion) };
      g.CFG.patrol.sight = sight;
      // the goal into the van
      const its = g.loot.items.filter((i) => !i.throwable && !i.trap && !i.prop && !i.heavy && !i.twoHanded);
      const goal = g.contract.goal;
      if (goal.item) g.loot.deliver(g.loot.items.find((i) => i.id === goal.item));
      else for (const it of its) { if ((goal.count && g.loot.tally().inVan >= goal.count) || (goal.sum && g.loot.tally().sum >= goal.sum)) break; g.loot.deliver(it); }
      g.sim(0.3); g.round.finish('left'); g.sim(0.3);
      o.verdict = { goal: g.verdict.goal, stars: g.verdict.stars };
      return o;
    }, id);
  }
  if (process.env.HEARING_LOG) console.log(JSON.stringify(out));
  for (const [id, o] of Object.entries(out)) {
    assert.equal(o.talk.full, false, `${id}: talking next door is no alarm ${JSON.stringify(o)}`);
    assert.equal(o.talk.looked, true, `${id}: but he heard it ${JSON.stringify(o)}`);
    assert.ok(o.talk.maxSus >= 25 && o.talk.maxSus < 100, `${id}: enough to come and look ${JSON.stringify(o)}`);
    assert.equal(o.talk.back, true, `${id}: back to his plan ${JSON.stringify(o)}`);
    assert.equal(o.shoutAtVan.full, false, `${id}: a shout at the van is not heard ${JSON.stringify(o)}`);
    assert.equal(o.verdict.goal, true, `${id}: the goal ${JSON.stringify(o)}`);
    assert.ok(o.verdict.stars >= 1, `${id}: a star`);
  }
  assert.equal(out.rehearsal.sitting0, true, 'level 0: in the armchair');
  assert.equal(out.rehearsal.talk.sitting, true, 'level 0: back in the armchair after looking');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rings on the floor (owner 16.11): a player\'s noise rings lie on that player\'s floor — the mansion\'s ground floor, its upper floor (3 m), the yard — and walls hide them (depth-tested, not drawn over everything)', async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => { localStorage.setItem('nocturne.preview.openAll', 'true'); });
  const { page, errors } = await open(ctx, base + 'preview/test/?map=mansion');
  const r = await page.evaluate(() => {
    const g = window.__game, M = g.CFG.mic, out = { map: g.level.id };
    g.playing = true;
    const ringY = (x, z, fy) => { g.player.teleport(x, z, 0, fy); g.sim(0.1); g.noise.clear(); g.noise.emit(x, z, M.voice.radius, 'voice', { who: g.player, source: 'patrol' }); return g.noise.ripples.map((p) => +p.y.toFixed(2)); };
    out.ground = ringY(0, -8.5, 0);
    out.upper = ringY(-9.5, -15, 3);
    out.depthTest = g.noise.mesh.material.depthTest;
    g.noise.clear();
    return out;
  });
  assert.equal(r.map, 'mansion');
  assert.deepEqual(r.ground, [0.04], 'the ground floor (one ring: «radar» 19.11, «wave» 22.11)');
  assert.deepEqual(r.upper, [3.04], 'the upper floor: on its floor, not at y 0');
  assert.equal(r.depthTest, true, 'walls hide the rings');
  assert.deepEqual(errors, []);
  await ctx.close();
});
