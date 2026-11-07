// The dacha's yard (claude/dacha-yard, world/yard.js): the van waits on the street, round the corner
// behind the hedge, 25–30 m from the house; the guard (AI or a friend) comes out to the porch and the
// gate but never further, and from nowhere he can stand does he see the van; the longer walk fits in
// the dacha's contracts (levels 0–7); several thieves at the van still work (the ring, the escape).
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base } from './runner.mjs';

const campaignCtx = async () => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true }; });
  return ctx;
};

test('yard: the van is 25–30 m from the house, behind the hedge; from no point the guard can reach (the house, the porch, the garden, the gate) is the van or a thief at the ring in sight', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.level, V = g.CFG.round.vanZone, D = g.CFG.dropZone, C = L.cargo, M = L.leash;
    const out = { id: L.id, leash: M && M.maxZ, ring: [D.x, D.z], zone: [V.x, V.z] };
    out.dist = Math.hypot(D.x - 0, D.z - 0);   // from the front door (x 0, z 0)
    // the van: its cargo floor and body, a thief standing / crouching at the ring
    const targets = [];
    for (const y of [0.5, 1.2, 2.1]) for (const x of [C.minX - 0.1, (C.minX + C.maxX) / 2, C.maxX + 0.1]) for (const z of [C.minZ - 0.05, (C.minZ + C.maxZ) / 2, C.maxZ + 1.4]) targets.push([x, y, z]);
    for (const y of [0.9, 1.65]) for (const [dx, dz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, -0.6]]) targets.push([D.x + dx, y, D.z + dz]);
    // where the guard can stand: every nav point he may go to, the rooms' points, and a 0.5 m grid of
    // the yard up to his leash (not inside a bush or the shed); his eyes at 1.7 m
    const eyes = [];
    for (const n of g.nav.nodes) if (n.z <= M.maxZ + 1e-6) eyes.push([n.x, n.z]);
    for (let x = -15.5; x <= 15.5; x += 0.5) for (let z = -19.5; z <= M.maxZ + 1e-6; z += 0.5) {
      const [nx, nz] = L.resolveBody(x, z, 0.25);
      if (Math.hypot(nx - x, nz - z) < 1e-3) eyes.push([x, z]);
    }
    out.eyes = eyes.length;
    out.seen = [];
    for (const [ex, ez] of eyes) for (const [tx, ty, tz] of targets) {
      if (!L.losBlocked(ex, 1.7, ez, tx, ty, tz)) { out.seen.push([ex, ez, tx, ty, tz].map((v) => +v.toFixed(2))); break; }
    }
    // the spawn, the board and the ring are on the street side, out of the yard
    out.spawn = [L.spawn.x, L.spawn.z]; out.board = [L.board.x, L.board.z];
    // the AI guard sent to the van: he stops at the gate
    const P = g.patrol;
    g.playing = true; g.newRound();
    g.player.teleport(V.x, V.z, 0);
    P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.queue.length = 0;
    P.x = 0; P.z = 1.6; P.y = 0;
    P.queue.push({ type: 'walk', to: [V.x, V.z], label: 'test' }, { type: 'wait', t: 999, label: 'test' });
    let maxZ = -99;
    for (let t = 0; t < 40; t += 1 / 30) { g.sim(1 / 30); maxZ = Math.max(maxZ, P.z); }
    out.walkMaxZ = +maxZ.toFixed(2);
    // ...and chasing a thief who runs to the van
    P.interrupt(); P.x = 3; P.z = 14.5; P.state = 'chase'; P.lastSeen = { x: V.x, z: V.z }; P.lostT = 0; P.goTo(V.x, V.z);
    maxZ = -99;
    for (let t = 0; t < 20; t += 1 / 30) { g.sim(1 / 30); maxZ = Math.max(maxZ, P.z); if (g.round.phase === 'result') break; }
    out.chaseMaxZ = +maxZ.toFixed(2);
    out.caught = !!P.caughtWho;
    return out;
  });
  assert.equal(r.id, 'dacha');
  assert.ok(r.dist >= 25 && r.dist <= 30, `the ring ${r.dist.toFixed(1)} m from the front door`);
  assert.ok(r.spawn[1] > 23.8 && r.board[1] > 23.8 && r.ring[1] > 23.8, `spawn ${r.spawn}, board ${r.board}, ring ${r.ring}: behind the hedge`);
  assert.ok(r.eyes > 1500, `guard points checked: ${r.eyes}`);
  assert.deepEqual(r.seen, [], `the van seen from: ${JSON.stringify(r.seen.slice(0, 5))}`);
  assert.ok(r.walkMaxZ <= r.leash + 0.05, `the guard walked to z ${r.walkMaxZ} (leash ${r.leash})`);
  assert.ok(r.chaseMaxZ <= r.leash + 0.05, `the guard chased to z ${r.chaseMaxZ} (leash ${r.leash})`);
  assert.equal(r.caught, false, 'nobody caught at the van');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard: cover in the garden hides a crouching thief, not a standing one (bush, low fence, woodpile); the shed hides him standing; the lamps light the porch, the path and the gate', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, L = g.level, Y = await import('./src/world/yard.js');
    const out = {};
    // the guard on the porch (0, 1.6) looking south; a thief right behind each piece of cover (on the far side)
    const eye = [0, 1.7, 1.6];
    const hid = (x, z, y) => L.losBlocked(eye[0], eye[1], eye[2], x, y, z);
    const behind = (x, z, r) => { const d = Math.hypot(x - eye[0], z - eye[2]); return [x + (x - eye[0]) / d * (r + 0.35), z + (z - eye[2]) / d * (r + 0.35)]; };
    out.bushes = Y.COVER.bushes.map(([x, z, r]) => { const [tx, tz] = behind(x, z, r * 0.8); return { at: [x, z], crouched: hid(tx, tz, 0.75), standing: hid(tx, tz, 1.65) }; });
    const F = Y.COVER.lowFence;
    out.lowFence = { crouched: hid(-3, F.z + 0.4, 0.6), standing: hid(-3, F.z + 0.4, 1.65) };
    const W = Y.COVER.woodpile, wx = (W.x0 + W.x1) / 2;
    out.woodpile = { crouched: hid(wx + 0.3, W.z1 + 0.35, 0.75), standing: hid(wx + 0.3, W.z1 + 0.35, 1.65) };
    const B = Y.COVER.shed;
    out.shed = hid((B.x0 + B.x1) / 2 - 0.5, B.z1 + 0.4, 1.65);
    const { litAt } = await import('./src/game/stealth.js').catch(() => ({}));
    out.lamps = g.CFG.stealth.lamps.map((l) => [l.x, l.z, l.r]);
    out.hasLit = typeof litAt === 'function';
    return out;
  });
  for (const b of r.bushes) { assert.equal(b.crouched, true, `crouched behind the bush at ${b.at}`); assert.equal(b.standing, false, `standing behind the bush at ${b.at} is seen`); }
  assert.deepEqual(r.lowFence, { crouched: true, standing: false });
  assert.deepEqual(r.woodpile, { crouched: true, standing: false });
  assert.equal(r.shed, true, 'the shed hides a standing thief');
  const near = (x, z) => r.lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 1.5);
  assert.ok(near(0, 0.8) && near(1.6, 7.6) && near(3, 15.5), `lamps: ${JSON.stringify(r.lamps)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard: the walk van ↔ house fits in the time of every dacha level (0–7) on every difficulty — the items the goal needs, one per trip, at the silent walk', async () => {
  const ctx = await campaignCtx();
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, L = g.level, D = g.CFG.dropZone;
    // the shortest walk on a 0.5 m grid of free floor (doors open: the static world only)
    const X0 = -16, Z0 = -20, N = 0.5, W = 65, H = 107, free = new Uint8Array(W * H);
    for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) { const x = X0 + i * N, z = Z0 + j * N, [nx, nz] = L.resolveBody(x, z, 0.25); free[j * W + i] = Math.hypot(nx - x, nz - z) < 1e-3 ? 1 : 0; }
    const cell = (x, z) => { let best = -1, bd = 1e9; for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) if (free[j * W + i]) { const d = Math.hypot(X0 + i * N - x, Z0 + j * N - z); if (d < bd) { bd = d; best = j * W + i; } } return best; };
    const dist = new Float64Array(W * H).fill(Infinity), s = cell(D.x, D.z - 0.3);
    dist[s] = 0; const q = [s];
    while (q.length) {   // Dijkstra (small grid: a sorted insert is enough)
      let k = 0; for (let m = 1; m < q.length; m++) if (dist[q[m]] < dist[q[k]]) k = m;
      const c = q.splice(k, 1)[0], ci = c % W, cj = (c - ci) / W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const n = j * W + i; if (!free[n] || (di && dj && (!free[cj * W + i] || !free[j * W + ci]))) continue;
        const x0 = X0 + ci * N, z0 = Z0 + cj * N, x1 = X0 + i * N, z1 = Z0 + j * N;
        if (L.walls.segmentBlocked && L.walls.segmentBlocked(x0, z0, x1, z1) && !L.doors.some((d) => Math.hypot(d.cx - (x0 + x1) / 2, d.cz - (z0 + z1) / 2) < 0.8)) continue;
        const nd = dist[c] + Math.hypot(di, dj) * N;
        if (nd < dist[n]) { if (dist[n] === Infinity) q.push(n); dist[n] = nd; }
      }
    }
    // to an item: the nearest reachable spot within an arm's reach (1.4 m on a 0.5 m grid: over a table, into the wardrobe)
    const walk = (x, z) => { let best = Infinity; for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) { const d = Math.hypot(X0 + i * N - x, Z0 + j * N - z); if (d < 1.4 && dist[j * W + i] + d < best) best = dist[j * W + i] + d; } return best; };
    const out = { door: +walk(0, -0.6).toFixed(1), levels: [] };
    const items = g.loot.items.filter((it) => !it.throwable && !it.trap && !it.prop && !it.heavy).map((it) => ({ id: it.def.id, value: it.def.value, m: walk(it.def.pos[0], it.def.pos[2]) }));
    out.unreachable = items.filter((i) => !isFinite(i.m)).map((i) => i.id);
    out.far = Math.max(...items.filter((i) => isFinite(i.m)).map((i) => i.m));
    const { campaign } = await import('./src/config/campaign.js');
    const speed = g.CFG.player.quietSpeed, HANDLE = 8;   // s per trip: picking up, the door, the ring
    for (const lv of campaign.levels.filter((l) => l.act === 1)) {
      const c = g.CFG.contracts.find((x) => x.id === lv.id);
      if (!c) { out.levels.push({ n: lv.n, missing: true }); continue; }
      // the trips the goal needs: the nearest items worth the most per metre
      const byNear = items.filter((i) => isFinite(i.m)).sort((a, b) => a.m / a.value - b.m / b.value);
      let trips = [];
      if (c.goal.item) trips = items.filter((i) => i.id === c.goal.item);
      else if (c.goal.count) trips = items.filter((i) => isFinite(i.m)).sort((a, b) => a.m - b.m).slice(0, c.goal.count);
      else if (c.goal.sum) { let sum = 0; for (const i of byNear) { if (sum >= c.goal.sum) break; trips.push(i); sum += i.value; } }
      else trips = byNear.slice(0, 3);   // mischief: walking the traps in and out
      const need = trips.reduce((s, i) => s + 2 * i.m / speed + HANDLE, 0);
      const times = {};
      for (const d of ['easy', 'medium', 'hard']) { g.setDifficulty(d); g.setContract(c.id); times[d] = { time: g.CFG.round.time, escape: g.CFG.round.escapeTime, noClock: !!g.CFG.round.noClock }; }
      out.levels.push({ n: lv.n, id: c.id, trips: trips.length, need: Math.round(need), times });
    }
    return out;
  });
  assert.deepEqual(r.unreachable, [], `every item can be walked to (door ${r.door} m): ${r.unreachable.join(" ")}`);
  assert.ok(r.door >= 25 && r.door <= 40, `van → front door: ${r.door} m`);
  for (const l of r.levels) {
    assert.ok(!l.missing, `level ${l.n} has its contract`);
    for (const [d, t] of Object.entries(l.times)) {
      if (t.noClock) continue;
      assert.ok(l.need <= t.time * 0.75, `level ${l.n} «${l.id}» on ${d}: ${l.trips} trips need ~${l.need} s of walking, the round is ${t.time} s`);
      assert.ok(r.far / 1.0 <= t.escape * 1.6, `level ${l.n} on ${d}: the escape ${t.escape} s from the farthest room (${r.far.toFixed(0)} m) at a run`);
    }
  }
  console.log('      ', JSON.stringify({ door: r.door, far: Math.round(r.far), levels: r.levels.map((l) => [l.n, l.trips, l.need, l.times.hard && l.times.hard.time]) }));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('yard: co-op at the van — two thieves at the ring: each one\'s loot flies in, the clock starts only when one walks out, the escape waits for both', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?map=dacha');
  const r = await page.evaluate(async () => {
    const g = window.__game, { G } = await import('./src/systems/state.js'), V = g.CFG.round.vanZone, S0 = g.level.spawn;
    const out = {};
    g.playing = true; g.newRound(); g.sim(0.1);
    const friend = { head: new g.THREE.Vector3(V.x - 0.8, 1.65, V.z - 0.4), yaw: 0, floorY: 0, crouched: false, virtualCrouch: false, speed: 0, running: false, stepNoise: 0, stepKind: 'step', lookPitch: 0 };
    G.players.push(friend);
    g.player.teleport(S0.x, S0.z, S0.yaw);
    for (let i = 0; i < 30; i++) g.sim(1 / 30);
    out.readyBoth = g.round.phase === 'ready';
    out.spawnAtVan = Math.hypot(S0.x - V.x, S0.z - V.z) < g.CFG.round.startDist && g.round.atVan(friend.head);   // the spawn is beside the ring (as before), the clock not started
    friend.head.set(3, 1.65, 14); g.sim(0.3);
    out.started = g.round.phase !== 'ready';
    g.round.startEscape('test');
    g.player.teleport(V.x, V.z, 0); g.sim(0.5);
    out.waits = g.round.phase === 'escape';
    friend.head.set(V.x + 0.3, 1.65, V.z + 0.2); g.sim(0.5);
    out.escaped = g.round.phase === 'result' && g.round.result.kind === 'escaped';
    G.players.pop();
    out.at = [g.player.head.x, g.player.head.z, friend.head.x, friend.head.z, V.x, V.z, g.round.phase];
    return out;
  });
  const at = r.at; delete r.at;
  assert.deepEqual(r, { readyBoth: true, spawnAtVan: true, started: true, waits: true, escaped: true }, JSON.stringify(at));
  assert.deepEqual(errors, []);
  await ctx.close();
});
