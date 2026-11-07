// W18 small loot (plan-W18-loot-stairs §B): on both maps every item stands on a surface, none overlaps
// another item, a can, a bottle or a story note, none stands inside furniture; nearly every room has
// something to take; a trinket is not missed by the guard on medium (half an item on hard); the van
// takes every item, the trinkets in their own middle column.
import assert from 'node:assert/strict';
import { browser, open, test, preview } from './runner.mjs';
import { newContext } from './harness.mjs';

const ROOMS_WITHOUT_LOOT = new Set(['Коридор', 'Коридор нагорі', 'Передпокій', 'Провулок', 'Двір']);   // the dacha's «Передпокій» is its side corridor (a mirror, no surfaces); the mansion's has the watch   // transit, no surfaces; the yard's gnome stands by the back step (the yard is Дача's outside)

// the mansion opens with «Відкрити все» on a preview (W3); the tests' contexts have it on
const openAll = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque origin */ } });
async function inspect(mapId) {
  const ctx = await newContext(browser);
  await openAll(ctx);
  const { page, errors } = await open(ctx, preview + '?map=' + mapId);
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.level, out = { id: L.id, bad: [], overlaps: [], inFurniture: [], rooms: {}, items: 0 };
    const items = g.loot.items.filter((i) => !i.throwable && !i.prop);
    out.items = items.length;
    const all = g.loot.items;   // loot + cans + bottles (W2a)
    const notes = (g.CFG.story && g.CFG.story.notes && g.CFG.story.notes[L.id]) || [];
    const devices = (g.CFG.devices && g.CFG.devices.maps && g.CFG.devices.maps[L.id] && g.CFG.devices.maps[L.id].list) || [];
    for (const it of items) {
      const [x, y, z] = it.def.pos, f = it.def.floor || 0;
      // on a surface: the highest surface under it at its height is its height (the ground outside = 0)
      const s = L.surfaceAt(x, z, y + 0.05);
      if (Math.abs(s - y) > 0.012 && !it.def.inWardrobe) out.bad.push({ id: it.id, y, surface: +s.toFixed(3) });   // W7: the box on the wardrobe's floor has no surface of its own
      // not inside a piece of furniture taller than its base (a shelf post, a wall)
      const inside = (L.furniture || []).find((b) => (b.floor || 0) === f && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.h > y + 0.05 && (b.top == null || Math.abs(b.top - y) > 0.012));
      if (inside && !it.def.inWardrobe && !it.heavy) out.inFurniture.push({ id: it.id, box: [inside.minX, inside.minZ, inside.maxX, inside.maxZ, inside.h, inside.top] });
      for (const o of all) {
        if (o === it || o.id < it.id) continue;
        const [ox, oy, oz] = o.def.pos;
        if (Math.abs(oy - y) < 0.5 && Math.hypot(ox - x, oz - z) < it.r + o.r + 0.02) out.overlaps.push([it.id, o.id, +Math.hypot(ox - x, oz - z).toFixed(2)]);
      }
      for (const n of notes) if (Math.abs(n.pos[1] - y) < 0.5 && Math.hypot(n.pos[0] - x, n.pos[2] - z) < it.r + 0.15) out.overlaps.push([it.id, 'note:' + n.id, +Math.hypot(n.pos[0] - x, n.pos[2] - z).toFixed(2)]);
      // the devices (W2a: a radio, a phone, a handset, a breaker) have a button of their own: an item within 1.2 m would be aimed instead
      for (const d of devices) if (Math.abs(d.pos[1] - y) < 0.6 && Math.hypot(d.pos[0] - x, d.pos[2] - z) < 1.2) out.overlaps.push([it.id, 'device:' + d.id, +Math.hypot(d.pos[0] - x, d.pos[2] - z).toFixed(2)]);
      const room = L.roomAt(x, z, y);
      out.rooms[room] = (out.rooms[room] || 0) + 1;
    }
    out.allRooms = (L.rooms || []).filter((r) => r.floor !== -1).map((r) => r.name);
    if (L.id === 'dacha') out.allRooms = [...new Set(out.allRooms)];
    out.sum = items.filter((i) => !i.heavy).reduce((s, i) => s + i.def.value, 0);
    out.devices = devices.length; out.notes = notes.length;
    out.small = items.filter((i) => i.small).map((i) => [i.id, i.def.value]);
    return out;
  });
  assert.deepEqual(errors, []);
  await ctx.close();
  return r;
}

for (const mapId of ['dacha', 'mansion']) {
  test(`loot (${mapId}): every item stands on a surface, nothing overlaps (items, cans, bottles, notes), nothing inside furniture; a trinket is worth at most $300; nearly every room has loot`, async () => {
    const r = await inspect(mapId);
    assert.equal(r.id, mapId, 'the map opened');
    assert.ok(r.devices >= 3, `the devices were read (${r.devices})`);
    assert.deepEqual(r.bad, [], `not on a surface: ${JSON.stringify(r.bad)}`);
    assert.deepEqual(r.inFurniture, [], `inside furniture: ${JSON.stringify(r.inFurniture)}`);
    assert.deepEqual(r.overlaps, [], `overlapping: ${JSON.stringify(r.overlaps)}`);
    assert.ok(r.small.every(([, v]) => v <= 300), `trinkets up to $300: ${JSON.stringify(r.small)}`);
    const empty = r.allRooms.filter((n) => !r.rooms[n] && !ROOMS_WITHOUT_LOOT.has(n) && n !== 'Сад');
    assert.deepEqual(empty, [], `rooms without loot: ${JSON.stringify(empty)} (have: ${JSON.stringify(r.rooms)})`);
    assert.equal(r.sum, mapId === 'dacha' ? 8000 : 16760, `the maps' totals without the heavy stand-ins (the plan's prices add up to $16,760 on the mansion, not the $16,320 its table said): $${r.sum}`);
  });
}

test('loot (small): on medium the guard does not miss a trinket but misses a valuable; on hard a trinket counts half an item; the van takes the trinkets in the middle column', async () => {
  const ctx = await newContext(browser);
  await openAll(ctx);
  const { page, errors } = await open(ctx, preview + '?map=mansion');
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.loot, by = (id) => L.items.find((i) => i.id === id), out = {};
    g.playing = true; g.sim(0.1);
    g.patrol.update = () => null; g.patrol2.update = () => null;
    const look = (x, z, heading, n = 20) => { g.patrol.x = x; g.patrol.z = z; g.patrol.y = 0; g.patrol.heading = heading; g.patrol.headYaw = 0; for (let i = 0; i < n; i++) g.patrol.brain.watch(0.1); };
    // medium: the teapot taken from the kitchen counter — Valera at the island looks at the counter: nothing; the chest gone from the garage: noticed
    g.setDifficulty('medium'); g.newRound(); g.playing = true; g.sim(0.1);
    L.stow(by('m_teapot')); L.stow(by('m_cognac'));
    g.patrol.brain.missing.clear(); g.patrol.brain.missingW = 0;
    look(9.5, -14.0, 0);   // in the kitchen, facing the north counter
    out.mediumTeapot = g.patrol.brain.missing.has(by('m_teapot')); out.mediumCognac = g.patrol.brain.missing.has(by('m_cognac'));
    out.mediumW = g.patrol.brain.missingW;
    // hard: the teapot counts half, the cognac one: 1.5 < 2 = no alarm yet; the jar too -> 2 = alarm
    g.setDifficulty('hard'); g.newRound(); g.playing = true; g.sim(0.1);
    L.stow(by('m_teapot')); L.stow(by('m_cognac'));
    g.patrol.brain.missing.clear(); g.patrol.brain.missingW = 0; g.alert.reset();
    look(9.5, -14.0, 0);
    out.hardTeapot = g.patrol.brain.missing.has(by('m_teapot')); out.hardW = g.patrol.brain.missingW; out.hardAlarm = g.alert.full;
    out.hardDbg = { difficulty: g.CFG.run.difficulty, missing: [...g.patrol.brain.missing].map((i) => i.id), sees: g.patrol.brain.canSee(8.0, 0.92 + 0.2, -17.55), phase: g.round.phase };
    // the van: 10 small ones go to the middle column, apart from the big ones
    g.setDifficulty('medium'); g.newRound(); g.playing = true; g.sim(0.1);
    for (const it of L.items) if (it.takeable && !it.prop && !it.throwable) L.deliver(it);
    g.sim(1.5);
    const c = g.level.cargo, xm = (c.minX + c.maxX) / 2;
    const smalls = L.items.filter((i) => i.small && i.delivered), bigs = L.items.filter((i) => !i.small && i.delivered);
    out.smallMid = smalls.every((i) => Math.abs(i.mesh.position.x - xm) < 0.01); out.bigSide = bigs.every((i) => Math.abs(i.mesh.position.x - xm) > 0.3);
    out.places = new Set(L.items.filter((i) => i.delivered).map((i) => i.mesh.position.x.toFixed(2) + ',' + i.mesh.position.z.toFixed(2))).size;
    out.delivered = smalls.length + bigs.length; out.sum = L.tally().sum;
    return out;
  });
  assert.equal(r.mediumTeapot, false, `medium: the trinket is not missed (${JSON.stringify(r)})`);
  assert.equal(r.mediumCognac, true, 'medium: the $350 bottle is missed');
  assert.equal(r.mediumW, 1);
  assert.equal(r.hardTeapot, true, `hard: the trinket is missed too (${JSON.stringify(r.hardDbg)})`);
  assert.equal(r.hardW, 1.5, 'hard: half an item for the trinket');
  assert.equal(r.hardAlarm, false, 'hard: 1.5 < 2, no alarm from these two');
  assert.ok(r.smallMid && r.bigSide, `trinkets in the middle column, the big ones at the sides (${JSON.stringify(r)})`);
  assert.equal(r.delivered, 26); assert.equal(r.sum, 16760); assert.ok(r.places >= 20, `${r.places} places`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
