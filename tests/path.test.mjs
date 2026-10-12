// Where the player walks there is no visible wall without a collision (W18, plan-W18-loot-stairs §A.3):
// on every map, a grid of free points in every room and outside, the stairs' ramps and landings, the
// door openings and the spawn. The body is a cylinder (r 0.25, feet + 0.05 .. feet + 1.75). A static
// part of the level that crosses the body while level.resolve() leaves the point where it is = a defect
// (the first map's boards over the stair well). Floors under the feet, ceilings over the head, doors and
// the style's floor decals are not walls. The reverse — a free-looking point the collision world pushes
// away — is reported too (a nav node inside furniture).
import assert from 'node:assert/strict';
import { browser, base, open, test } from './runner.mjs';
import { newContext } from './harness.mjs';

async function walk() {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?mode=pc');
  const r = await page.evaluate(async () => {
    const url = (n) => performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes(n));
    const L = await import(url('/src/world/level.js'));
    const mapsUrl = url('/src/world/maps.js');
    const maps = mapsUrl ? Object.entries((await import(mapsUrl)).MAPS).map(([id, m]) => [id, m.build]) : [['dacha', L.buildLevel]];
    const out = {};
    for (const [id, build] of maps) {
      const mesh0 = L.Builder.prototype.mesh;
      L.Builder.prototype.mesh = function (m) { const parts = this.parts.map((g) => { const c = g.clone(); c.computeBoundingBox(); return c; }); const mesh = mesh0.call(this, m); mesh.userData.parts = parts; return mesh; };
      let lv; try { lv = build(); } finally { L.Builder.prototype.mesh = mesh0; }
      lv.group.updateMatrixWorld(true);
      const parts = [];
      lv.group.traverse((o) => {
        if (!o.isMesh || !o.userData.parts || /door|style:/i.test(o.name)) return;
        for (const g of o.userData.parts) { const c = g.clone().applyMatrix4(o.matrixWorld); c.computeBoundingBox(); const bb = c.boundingBox; if (bb.max.x - bb.min.x > 40 || bb.max.z - bb.min.z > 40) continue; parts.push({ bb, mesh: o.name }); }   // not the ground plane
      });
      const R = 0.25, H = 1.75, FOOT = 0.05;
      const fmt = (bb) => [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)).join(' ');
      // the places: a 0.5 m grid in every room (and the outside rects), the ramps, the landings, the doorways, the spawn
      const pts = [];
      const levels = lv.floors ? lv.floors.levels : [0];
      for (const room of lv.rooms || []) {
        const y = levels[room.floor || 0] ?? 0;
        if (room.floor === -1) continue;   // the stair well pseudo-room
        // 1.3 cm off the grid: a point exactly on a furniture edge is pushed nowhere (the push has no direction there)
        for (let x = room.minX + 0.313; x <= room.maxX - 0.3 + 1e-6; x += 0.5) for (let z = room.minZ + 0.313; z <= room.maxZ - 0.3 + 1e-6; z += 0.5) pts.push([x, z, y, room.name]);
      }
      if (lv.floors) {
        for (const rp of lv.floors.ramps) for (let t = 0; t <= 1.0001; t += 0.05) pts.push([rp.x0 + (rp.x1 - rp.x0) * t, rp.z0 + (rp.z1 - rp.z0) * t, rp.y0 + (rp.y1 - rp.y0) * t, 'ramp']);
        for (const f of lv.floors.flats) for (let x = f.minX + 0.3; x <= f.maxX - 0.3 + 1e-6; x += 0.4) for (let z = f.minZ + 0.3; z <= f.maxZ - 0.3 + 1e-6; z += 0.4) pts.push([x, z, f.y, 'landing']);
      }
      for (const d of lv.doors) pts.push([d.cx, d.cz, d.y0 || 0, 'door']);
      if (lv.spawn) pts.push([lv.spawn.x, lv.spawn.z, 0, 'spawn']);
      const seen = [], blocked = [];
      let free = 0;
      for (const [x, z, yHint, where] of pts) {
        const y = lv.floorY ? lv.floorY(x, z, yHint) : 0;
        if (where !== 'ramp' && where !== 'landing' && Math.abs(y - yHint) > 0.01) continue;   // a grid point over the well / under the stairs
        // inside a piece of furniture the collision world (edges) pushes nowhere: the player cannot be there either
        if (where !== 'ramp' && where !== 'landing' && where !== 'door' && (lv.furniture || []).some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && (b.floor || 0) === (lv.floorIndex ? lv.floorIndex(y) : 0))) continue;
        const [nx, nz] = lv.resolve(x, z, R, y);
        const pushed = Math.hypot(nx - x, nz - z) > 0.001;
        if (pushed) {
          // not a defect by itself (the grid runs into furniture); it is one on a ramp, a landing or in a doorway
          if (where === 'ramp' || where === 'landing' || where === 'door') blocked.push({ where, at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], to: [+nx.toFixed(2), +nz.toFixed(2)] });
          continue;
        }
        free++;
        for (const p of parts) {
          const bb = p.bb;
          // how deep the body's circle is in the part's footprint: a rotated chair's or crate's bounding box
          // sticks out of its collision box by up to ~10 cm at a corner; a wall through the body is 25 cm
          const dx = Math.max(bb.min.x - x, 0, x - bb.max.x), dz = Math.max(bb.min.z - z, 0, z - bb.max.z);
          if (R - Math.hypot(dx, dz) <= 0.12) continue;
          if (bb.max.y <= y + FOOT || bb.min.y >= y + H) continue;                   // under the feet / over the head
          if (bb.min.y >= y + 1.1 && !(lv.house && x > lv.house.minX && x < lv.house.maxX && z > lv.house.minZ && z < lv.house.maxZ)) continue;   // a tree's crown, a lamp post's head: you walk under them outside
          if (bb.max.y <= y + 0.35 && bb.min.y <= y + FOOT) continue;                 // the floor, a step
          const k = p.mesh + ' | ' + fmt(bb);
          const e = seen.find((q) => q.part === k);
          if (e) { e.n++; if (e.at.length < 3) e.at.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), where]); }
          else seen.push({ part: k, n: 1, at: [[+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), where]] });
        }
      }
      out[id] = { points: pts.length, free, seen, blocked };
    }
    return out;
  });
  assert.deepEqual(errors, []);
  await ctx.close();
  return r;
}

let report = null;
const geometry = async () => (report ||= await walk());

test('path: where the player walks there is no visible wall without a collision (rooms, stairs, doorways, both maps)', async () => {
  for (const [id, r] of Object.entries(await geometry())) {
    assert.ok(r.free > 100, `${id}: the map was walked (${r.free} free points of ${r.points})`);
    assert.equal(r.seen.length, 0, `${id}: the body passes through these parts of the level:\n${JSON.stringify(r.seen.slice(0, 20))}`);
  }
});
test('path: the stairs, the landings and the doorways are not blocked by an invisible collision', async () => {
  for (const [id, r] of Object.entries(await geometry())) assert.equal(r.blocked.length, 0, `${id}: pushed away on the path:\n${JSON.stringify(r.blocked.slice(0, 20))}`);
});
