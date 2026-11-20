// Reach (plan 2026-11-19 «fixes after test 1», task 1): taking an item, pressing a device, reading a note,
// opening a door only with no wall, closed door or floor between you and it — phone / PC (the aim), VR (the
// hand), a friend (the host checks a guest's «Взяти»); a fast throw does not pass through a wall on a slow phone.
// The truth here is computed apart from the game's own check: the thing's floor from its definition, and «some
// part of it» = its centre or one of 16 points of its size around it with no wall or closed door in between.
import assert from 'node:assert/strict';
import { browser, open, test, preview } from './runner.mjs';
import { newContext } from './harness.mjs';

const openAll = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque origin */ } });

async function page(mapId) {
  const ctx = await newContext(browser);
  await openAll(ctx);
  const r = await open(ctx, preview + '?map=' + mapId);
  await r.page.evaluate(() => { const g = window.__game; g.newRound(); g.playing = true; for (const p of g.guards || []) p.update = () => null; });
  return { ctx, ...r };
}

// in the page: the helpers of the scan (stand, the truth, facing)
const SCAN = `(() => {
  const g = window.__game, L = g.level, P = g.player;
  const LEVELS = (L.floors && L.floors.levels) || [0];
  const stand = (x, z, fy) => { const [rx, rz] = L.resolve(x, z, 0.22, fy); return Math.hypot(rx - x, rz - z) < 1e-3; };
  const truth = (x, z, fy, f, tx, ty, tz, r) => {
    if (LEVELS[f] !== fy) return false;
    const R = Math.max(r, 0.06), y = fy + 0.1;
    if (!L.soundOccluded(x, z, tx, tz, y, y)) return true;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (!L.soundOccluded(x, z, tx + Math.cos(a) * R, tz + Math.sin(a) * R, y, y)) return true; }
    return false;
  };
  const place = (x, z, fy, tx, tz) => { const yaw = Math.atan2(-(tx - x), -(tz - z)); P.head.set(x, fy + 1.6, z); P.floorY = fy; P.yaw = yaw; return yaw; };
  // every standing point (10 cm grid) within reach of (tx, tz) on every floor
  const around = (tx, tz, reach, fn) => { for (const fy of LEVELS) for (let x = tx - reach; x <= tx + reach; x += 0.1) for (let z = tz - reach; z <= tz + reach; z += 0.1) { const d = Math.hypot(x - tx, z - tz); if (d <= reach && d > 0.05 && stand(x, z, fy)) fn(x, z, fy); } };
  return { g, L, P, LEVELS, stand, truth, place, around };
})()`;

for (const mapId of ['dacha', 'mansion']) {
  test(`reach (${mapId}): no item, device or note is taken / pressed / read through a wall, a closed door or a floor (phone / PC aim, VR hand); each of them still can be from somewhere`, async () => {
    const { ctx, page: p, errors } = await page(mapId);
    const r = await p.evaluate((SCAN) => {
      const { g, P, LEVELS, truth, place, around } = eval(SCAN);
      const out = { through: [], never: [], vrThrough: [], devThrough: [], devNever: [], noteThrough: [], noteNever: [], items: 0, devices: 0, notes: 0 };
      const c = new g.THREE.Vector3(), hand = new g.THREE.Vector3();
      for (const it of g.loot.items) {
        if (!it.takeable) continue;
        out.items++;
        it.centre(c);
        const f = it.def.floor || 0, cx = c.x, cy = c.y, cz = c.z;
        let ok = 0;
        around(cx, cz, 1.8, (x, z, fy) => {
          const yaw = place(x, z, fy, cx, cz);
          if (g.hands.aimDesk(P.head, yaw) !== it) return;
          if (truth(x, z, fy, f, cx, cy, cz, it.r)) ok++;
          else if (out.through.length < 30) out.through.push([it.id, +x.toFixed(1), +z.toFixed(1), fy]);
        });
        if (!ok) out.never.push(it.id);
        // VR: the hand right on the item, the head within an arm's length
        around(cx, cz, 0.9, (x, z, fy) => {
          place(x, z, fy, cx, cz);
          hand.set(cx, cy, cz);
          if (g.hands.nearest(hand) === it && !truth(x, z, fy, f, cx, cy, cz, it.r) && out.vrThrough.length < 30) out.vrThrough.push([it.id, +x.toFixed(1), +z.toFixed(1), fy]);
        });
      }
      g.hands.deskAim = null;
      if (g.devices) for (const d of g.devices.list) {
        if (!g.devices.enabled) break;
        out.devices++;
        let ok = 0;
        around(d.x, d.z, g.CFG.devices.aimReach, (x, z, fy) => {
          const yaw = place(x, z, fy, d.x, d.z);
          if (g.devices.aimed(P.head, yaw, fy) !== d) return;
          if (truth(x, z, fy, d.floor || 0, d.x, d.y, d.z, 0.12)) ok++;
          else if (out.devThrough.length < 30) out.devThrough.push([d.id, +x.toFixed(1), +z.toFixed(1), fy]);
        });
        if (!ok) out.devNever.push(d.id);
      }
      return out;
    }, SCAN);
    const n = await p.evaluate(async (SCAN) => {
      const { g, P, truth, place, around } = eval(SCAN), St = await import('./src/systems/story.js');
      const notes = ((g.CFG.story.notes || {})[g.level.id] || []), out = { through: [], never: [], count: 0 };
      for (const def of notes) {
        const [nx, ny, nz] = def.pos;
        let ok = 0, seen = 0;
        around(nx, nz, g.CFG.story.noteUse.reach, (x, z, fy) => {
          const yaw = place(x, z, fy, nx, nz);
          const got = St.aimedNote();
          if (!got || Math.hypot(got.x - nx, got.z - nz) > 0.01) return;
          seen++;
          if (truth(x, z, fy, def.floor || 0, nx, ny, nz, 0.1)) ok++;
          else if (out.through.length < 30) out.through.push([def.id, +x.toFixed(1), +z.toFixed(1)]);
        });
        if (seen) out.count++;
        if (seen && !ok) out.never.push(def.id);
      }
      return out;
    }, SCAN);
    assert.ok(r.items >= 15, `items scanned (${r.items})`);
    assert.deepEqual(r.through, [], `taken through a wall / door / floor (phone, PC): ${JSON.stringify(r.through)}`);
    assert.deepEqual(r.never, [], `items nobody can take any more: ${r.never}`);
    assert.deepEqual(r.vrThrough, [], `VR hand through a wall: ${JSON.stringify(r.vrThrough)}`);
    assert.deepEqual(r.devThrough, [], `a device through a wall: ${JSON.stringify(r.devThrough)}`);
    assert.deepEqual(r.devNever, [], `devices nobody can press any more: ${r.devNever}`);
    assert.deepEqual(n.through, [], `a note through a wall: ${JSON.stringify(n.through)}`);
    assert.deepEqual(n.never, [], `notes nobody can read any more: ${n.never}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('reach: the dacha\'s big vase — not from the street behind the north wall nor from the bedroom; from the living room yes; every door of both maps still opens', async () => {
  const { ctx, page: p, errors } = await page('dacha');
  const r = await p.evaluate((SCAN) => {
    const { g, P, place } = eval(SCAN);
    const vase = g.loot.items.find((i) => i.id === 'vase'), c = vase.centre(new g.THREE.Vector3());
    const aim = (x, z) => { const yaw = place(x, z, 0, c.x, c.z); return g.hands.aimDesk(P.head, yaw) === vase; };
    const doors = [];
    for (const d of g.level.doors) {
      let ok = 0;
      for (let a = 0; a < 16; a++) {
        const x = d.cx + Math.cos(a / 8 * Math.PI) * 0.9, z = d.cz + Math.sin(a / 8 * Math.PI) * 0.9;
        place(x, z, 0, d.cx, d.cz);
        if (g.nearestDoor(x, z, 1.6, P.yaw) === d) ok++;
      }
      doors.push(ok);
    }
    return { street: aim(4.3, -14.75), bedroom: aim(5.45, -13.35), room: aim(4.3, -12.4), doors };
  }, SCAN);
  assert.deepEqual([r.street, r.bedroom, r.room], [false, false, true], 'the vase: street / bedroom / living room');
  assert.ok(r.doors.every((n) => n >= 2), `every door opens from around it: ${r.doors}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('reach: the mansion\'s hall vase is not taken from the gallery upstairs right above it; from the hall it is; every door of both floors still opens', async () => {
  const { ctx, page: p, errors } = await page('mansion');
  const r = await p.evaluate((SCAN) => {
    const { g, P, place } = eval(SCAN);
    const vase = g.loot.items.find((i) => i.id === 'm_vase'), c = vase.centre(new g.THREE.Vector3());
    const aim = (x, z, fy) => { const yaw = place(x, z, fy, c.x, c.z); return g.hands.aimDesk(P.head, yaw) === vase; };
    const doors = [];
    for (const d of g.level.doors) {
      const fy = (d.floor || 0) * 3;
      let ok = 0;
      for (let a = 0; a < 16; a++) {
        const x = d.cx + Math.cos(a / 8 * Math.PI) * 0.9, z = d.cz + Math.sin(a / 8 * Math.PI) * 0.9;
        place(x, z, fy, d.cx, d.cz);
        if (g.nearestDoor(x, z, 1.6, P.yaw) === d) ok++;
      }
      doors.push(ok);
    }
    return { upstairs: aim(-0.3, -10.8, 3), hall: aim(-0.3, -10.8, 0), doors };
  }, SCAN);
  assert.deepEqual([r.upstairs, r.hall], [false, true], 'the vase: from the gallery / from the hall');
  assert.ok(r.doors.every((n) => n >= 2), `every door opens from around it: ${r.doors}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('reach: a thrown can never passes through a wall, at any frame rate (72 / 30 / 20 / 15 fps) and speed; the aim\'s arc stops at the wall too', async () => {
  const { ctx, page: p, errors } = await page('dacha');
  const r = await p.evaluate(async () => {
    const g = window.__game, T = await import('./src/loot/throw.js'), out = [];
    const can = g.loot.items.find((i) => i.throwable);
    for (const fps of [72, 30, 20, 15]) for (const sp of [5, 7, 9]) for (const x0 of [2.0, 2.31, 2.47]) {
      can.state = 'fall'; can.holders.length = 0; can.mesh.position.set(x0, 1.2, -2.5); can.vel.set(sp, 0.5, 0); can.spin = 0;
      let crossed = false;
      for (let t = 0; t < 0.8; t += 1 / fps) { g.loot.update(1 / fps, [g.player]); if (can.mesh.position.x > 3.0) crossed = true; }
      if (crossed) out.push([fps, sp, x0]);
    }
    const pts = Array.from({ length: 40 }, () => new g.THREE.Vector3());
    const land = T.predictArc(g.level, new g.THREE.Vector3(2.0, 1.4, -2.5), new g.THREE.Vector3(9, 1, 0), pts, 0);
    return { through: out, arcX: land.x };
  });
  assert.deepEqual(r.through, [], `through the wall x = 3: ${JSON.stringify(r.through)}`);
  assert.ok(r.arcX < 3, `the arc lands this side of the wall (${r.arcX})`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
