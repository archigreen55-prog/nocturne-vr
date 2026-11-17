// The breath is a tank (config/player.js breath: hold 6, refill 20, minStart 1, tap 0.25), like the run's stamina: what you spend
// comes back gradually (hold / refill = 0.3 s per second); you may hold again as soon as 1 s is in the tank.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

test('breath tank: spends 1 s per second, refills 0.3 s per second, may be held again from 1 s, an empty tank lets go, a tap is free, a new press is needed, the ring shows the tank', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const { Breath } = await import('./src/audio/mic.js'), { CFG } = await import('./src/config/index.js'), out = {};
    const B = CFG.breath;
    const run = (b, secs, down) => { const ev = []; for (let t = 0; t < secs - 1e-9; t += 0.05) { const e = b.update(0.05, down); if (e) ev.push(e); } return ev; };
    out.cfg = [B.hold, B.refill, B.minStart, B.tap, B.cooldown, B.cooldownMin];
    // 2 s held: 4 s left at once, may hold again immediately
    let b = new Breath(); out.fresh = [b.state, b.tank, b.ring];
    out.start = run(b, 0.05, true); run(b, 1.95, true); out.holdTank = +b.tank.toFixed(2); out.holdRing = +b.ring.toFixed(2);
    out.end2 = run(b, 0.05, false); out.after2 = [b.state, +b.tank.toFixed(2)];
    out.again = run(b, 0.05, true); out.againState = b.state;
    // the refill: 10 s of rest = +3 s
    b = new Breath(); run(b, 0.05, true); run(b, 2.95, true); run(b, 0.05, false); const t0 = b.tank; run(b, 10, false); out.refill10 = +(b.tank - t0).toFixed(2);
    // all 6 s: an empty tank lets go by itself, 'cooldown' until 1 s is in it (3.3 s), a new press is needed
    b = new Breath(); out.full = run(b, 0.05, true); out.fullEnd = run(b, 6.2, true); out.empty = [b.state, +b.tank.toFixed(2), b.holding];
    out.stillDown = run(b, 3.5, true); out.lockedAt3 = [b.state, +b.left.toFixed(2)];   // finger kept down: no new hold (no new press); 1 s is back after 3.3 s
    out.busy = (() => { run(b, 0.1, false); const e = b.update(0.05, true); return e; })();
    run(b, 0.3, false); out.unlock = [b.state, b.tank >= B.minStart];
    out.ringLocked = +b.ring.toFixed(2);
    // a tap shorter than `tap` costs nothing
    b = new Breath(); b.update(0.05, true); const e1 = b.update(0.05, false); out.tap = [e1, b.state, +b.tank.toFixed(2)];
    // the toggle mode and the rest read the same fields
    out.fields = ['left', 'ring', 'holding', 'state', 'tank', 'reset'].every((k) => k in b);
    return out;
  });
  assert.deepEqual(r.cfg, [6, 20, 1, 0.25, undefined, undefined], 'the tank\'s numbers; the old cooldown numbers are gone');
  assert.deepEqual(r.fresh, ['ready', 6, 1]);
  assert.deepEqual(r.start, ['start']);
  assert.ok(Math.abs(r.holdTank - 4) < 0.15, `2 s held: 4 s left (${r.holdTank})`);
  assert.ok(Math.abs(r.holdRing - 0.67) < 0.03, `the ring shows the tank (${r.holdRing})`);
  assert.deepEqual(r.end2, ['end']); assert.equal(r.after2[0], 'ready', '4 s left: ready at once, no pause');
  assert.deepEqual(r.again, ['start']); assert.equal(r.againState, 'holding');
  assert.ok(Math.abs(r.refill10 - 3) < 0.1, `10 s of rest give back 3 s (${r.refill10})`);
  assert.deepEqual(r.full, ['start']);
  assert.ok(r.fullEnd.includes('end'), 'an empty tank lets go by itself');
  assert.deepEqual([r.empty[0], r.empty[2]], ['cooldown', false]);
  assert.ok(r.empty[1] < 1);
  assert.equal(r.lockedAt3[0], 'ready', 'after 3.5 s of rest (finger kept down) the lock is over');
  assert.deepEqual(r.stillDown.includes('start'), false, 'but a held finger starts nothing: a new press is needed');
  assert.deepEqual(r.tap, ['cancel', 'ready', 6], 'a tap costs nothing');
  assert.equal(r.fields, true);
});

test('breath tank in the game: the real act() holds while the finger is down, lets go at an empty tank, says «Ще не віддихався» for a press while it is too low, the HUD reads the tank', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), out = {};
    g.playing = true; g.newRound(); g.sim(0.3);
    for (const p of g.guards) p.update = () => null;
    const B = g.breath; B.reset();
    const step = (down, secs) => { for (let t = 0; t < secs - 1e-9; t += 0.05) { if (down) g.keys.down.add('ShiftLeft'); else g.keys.down.delete('ShiftLeft'); g.sim(0.05); } };   // Shift = the breath key (systems/controls.js)
    step(true, 1); out.during = [B.state, +B.tank.toFixed(1)];
    step(true, 5.3); out.emptied = [B.state, B.tank < 1];
    step(false, 0.2);
    G.flashText = ''; step(true, 0.1); out.busyText = G.flashText; step(false, 0.1);
    step(false, 3.5); out.back = [B.state, B.tank >= 1];
    return out;
  });
  assert.equal(r.during[0], 'holding'); assert.ok(Math.abs(r.during[1] - 5) < 0.3, `1 s held: about 5 s left (${r.during[1]})`);
  assert.deepEqual(r.emptied, ['cooldown', true]);
  assert.match(r.busyText, /Ще не віддихався/);
  assert.deepEqual(r.back, ['ready', true]);
  assert.deepEqual(errors, []);
  await ctx.close();
});
