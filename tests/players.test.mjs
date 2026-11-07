// Everybody in the round (plan-multiplayer §4.1): G.players instead of one player. Offline the list is
// [G.player] and the game is the same (tools/snapshot.mjs proves it); here a second body is put in the
// list by hand, as a friend's would be, to check that the systems counting the world go through it:
// the guard watches the one it sees and catches whoever it reaches, a lurker wakes for the one in its
// room, the round clock starts when anybody leaves the van and the escape ends when everybody is back,
// a friend's steps are heard where the friend is.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

test('players[]: guard, lurker, round clock and steps go through every body in the round (PC)', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js');
    const out = {};
    out.offline = G.players.length === 1 && G.players[0] === g.player;
    g.playing = true; g.newRound();
    // a second body, shaped like a player (a friend's would be src/net/remotePlayer.js)
    const friend = { head: new g.THREE.Vector3(-4, 1.65, 1.6), yaw: 0, floorY: 0, crouched: false, virtualCrouch: false, speed: 0, running: false, stepNoise: 0, stepKind: 'step', lookPitch: 0 };
    G.players.push(friend);
    out.list = G.players.length;
    for (const l of g.lurkers) { l.saved = l.update; l.update = () => {}; }
    // 1. the guard in the yard looks north at the friend; this player stands at the van behind its back
    const P = g.patrol, S0 = g.level.spawn;
    g.player.teleport(S0.x, S0.z, S0.yaw);
    P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.queue.length = 0; P.queue.push({ type: 'wait', t: 999, label: 'test' });
    P.x = -4; P.z = 4.2; P.y = 0; P.heading = 0; P.headYaw = 0;
    let caughtWho = null;
    for (let t = 0; t < 12 && !caughtWho; t += 1 / 72) { g.sim(1 / 72); if (P.caughtWho) caughtWho = P.caughtWho; }
    out.started = g.round.phase !== 'ready';   // the friend is far from the van: the clock runs
    out.target = P.target === friend;
    out.caughtFriend = caughtWho === friend;
    out.caughtT = g.caughtT >= 0;
    // 2. the escape ends only when everybody is back at the van
    g.newRound(); g.sim(0.1);
    P.interrupt(); P.state = 'task'; P.path = []; P.queue.length = 0; P.queue.push({ type: 'wait', t: 999, label: 'test' }); P.x = -8; P.z = -12;
    friend.head.set(-4, 1.65, 3);
    g.sim(0.2);
    g.round.startEscape('test');
    const V = g.CFG.round.vanZone;
    g.player.teleport(V.x, V.z, S0.yaw); g.sim(1);
    out.meAtVan = g.round.atVan(g.player.head);
    out.waitsForFriend = g.round.phase === 'escape';
    friend.head.set(V.x + 0.2, 1.65, V.z); g.sim(0.5);
    out.escaped = g.round.phase === 'result' && g.round.result.kind === 'escaped';
    // 3. a lurker wakes for the friend in its room while this player is far away
    g.newRound(); g.sim(0.1);
    P.x = -8; P.z = -12;
    const L = g.lurkers[0];
    L.update = L.saved; L.reset();
    g.player.teleport(S0.x, S0.z, S0.yaw);
    friend.head.set(L.FRONT.x - 1.2, 1.65, L.FRONT.z);
    for (let t = 0; t < 1 && L.state === 'dormant'; t += 1 / 72) g.sim(1 / 72);
    out.lurkerWoke = L.state === 'telegraph' && L.victim === friend;
    // 4. the friend's step is a noise where the friend is, made by the friend
    friend.head.set(-2, 1.65, 2); friend.stepNoise = 6; friend.stepKind = 'step';
    const before = g.noise.log.length;
    g.sim(1 / 72); friend.stepNoise = 0;
    const e = g.noise.log.slice(before).find((x) => x.kind === 'step');
    out.step = !!e && e.who === friend && Math.abs(e.x + 2) < 1e-6 && Math.abs(e.z - 2) < 1e-6;
    G.players.length = 1;
    return out;
  });
  assert.equal(r.offline, true, 'offline the list is just this player');
  assert.equal(r.list, 2);
  assert.equal(r.started, true, 'the clock starts when anybody leaves the van');
  assert.equal(r.target, true, 'the guard watches the one it sees');
  assert.equal(r.caughtFriend, true, 'the guard catches whoever it reaches');
  assert.equal(r.caughtT, true);
  assert.equal(r.meAtVan, true);
  assert.equal(r.waitsForFriend, true, 'the escape waits for everybody');
  assert.equal(r.escaped, true);
  assert.equal(r.lurkerWoke, true, 'a lurker wakes for the one in its room');
  assert.equal(r.step, true, "a friend's step is heard where the friend is");
  assert.deepEqual(errors, []);
  await ctx.close();
});
