// The level's geometry, checked on every map this branch has (src/world/maps.js when it exists, else
// the first map): no two surfaces in one place (they flicker), nothing (furniture, a rug, a picture)
// through a wall or standing in a doorway, door leaves that close their opening; the lurker only in
// its own room; the guard's flashlight stopping at walls.
// The level is built a second time in the page with the Builder and the collision worlds recording
// what goes into them (the game's own copy is untouched).
import assert from 'node:assert/strict';
import { browser, base, open, test } from './runner.mjs';
import { newContext } from './harness.mjs';

const TOL = 0.0005;        // m: faces closer than this to one plane are «in one place»
const MIN_AREA = 0.0001;   // m²: a shared patch from 1 cm² is a defect
const MIN_SIZE = 0.005;    // m: ...at least 5 mm across both ways

// In the page: build each map with recording on and return what is wrong with it.
async function inspect({ TOL, MIN_AREA, MIN_SIZE }) {
  const url = (n) => performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes(n));
  const L = await import(url('/src/world/level.js')), CW = await import(url('/src/world/collision.js'));
  const mapsUrl = url('/src/world/maps.js');
  const maps = mapsUrl ? Object.entries((await import(mapsUrl)).MAPS).map(([id, m]) => [id, m.build]) : [['dacha', L.buildLevel]];
  const out = {};
  for (const [id, build] of maps) {
    // record: every Builder part of every mesh, every box of every collision world
    let boxes = [];
    const mesh0 = L.Builder.prototype.mesh, addBox0 = CW.CollisionWorld.prototype.addBox;
    L.Builder.prototype.mesh = function (m) {
      const parts = this.parts.map((g) => { const c = g.clone(); c.computeBoundingBox(); return c; });
      const mesh = mesh0.call(this, m);
      mesh.userData.parts = parts;
      return mesh;
    };
    CW.CollisionWorld.prototype.addBox = function (x0, z0, x1, z1) {
      boxes.push({ w: this, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
      return addBox0.apply(this, arguments);
    };
    let lv;
    try { lv = build(); } finally { L.Builder.prototype.mesh = mesh0; CW.CollisionWorld.prototype.addBox = addBox0; }
    lv.group.updateMatrixWorld(true);
    const parts = [];
    lv.group.traverse((o) => {
      if (!o.isMesh || !o.userData.parts || /door/i.test(o.name)) return;
      for (const g of o.userData.parts) { const c = g.clone().applyMatrix4(o.matrixWorld); c.computeBoundingBox(); parts.push({ g: c, bb: c.boundingBox }); }
    });
    const bbs = (bb) => [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((x) => +x.toFixed(3)).join(' ');

    // ---- 1. two surfaces in one place: axis-aligned faces turned the same way, in one plane, overlapping
    const faces = [];
    parts.forEach((pt, pi) => {
      const P = pt.g.attributes.position, N = pt.g.attributes.normal, I = pt.g.index;
      if (!N) return;
      const n = I ? I.count / 3 : P.count / 3;
      for (let t = 0; t < n; t++) {
        const ids = [0, 1, 2].map((k) => (I ? I.getX(t * 3 + k) : t * 3 + k));
        const nv = [N.getX(ids[0]), N.getY(ids[0]), N.getZ(ids[0])];
        const ax = nv.findIndex((v) => Math.abs(v) > 0.999);
        if (ax < 0) continue;
        const u = (ax + 1) % 3, v = (ax + 2) % 3;
        const p = ids.map((i) => [P.getX(i), P.getY(i), P.getZ(i)]);
        const tri = p.map((q) => [q[u], q[v]]);
        faces.push({ pi, ax, s: Math.sign(nv[ax]), c: p[0][ax], tri,
          u0: Math.min(...tri.map((q) => q[0])), u1: Math.max(...tri.map((q) => q[0])), v0: Math.min(...tri.map((q) => q[1])), v1: Math.max(...tri.map((q) => q[1])) });
      }
    });
    const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; } return a / 2; };
    // triangle a clipped by triangle b (both convex): the shared polygon
    const clip = (a, b) => {
      const sg = Math.sign(area(b));
      let poly = a;
      for (let i = 0; i < 3 && poly.length; i++) {
        const [px, py] = b[i], [qx, qy] = b[(i + 1) % 3];
        const side = (r) => sg * ((qx - px) * (r[1] - py) - (qy - py) * (r[0] - px));
        const next = [];
        for (let j = 0; j < poly.length; j++) {
          const r = poly[j], s = poly[(j + 1) % poly.length], dr = side(r), ds = side(s);
          if (dr >= 0) next.push(r);
          if ((dr >= 0) !== (ds >= 0)) { const k = dr / (dr - ds); next.push([r[0] + (s[0] - r[0]) * k, r[1] + (s[1] - r[1]) * k]); }
        }
        poly = next;
      }
      return poly;
    };
    const inside = (pt, tri) => { const sg = Math.sign(area(tri)); for (let i = 0; i < 3; i++) { const [px, py] = tri[i], [qx, qy] = tri[(i + 1) % 3]; if (sg * ((qx - px) * (pt[1] - py) - (qy - py) * (pt[0] - px)) < -1e-6) return false; } return true; };
    // axis-aligned boxes (every normal along an axis): their bounding box is the solid itself
    const boxes3 = [];
    parts.forEach((pt, pi) => {
      const N = pt.g.attributes.normal;
      if (!N || pt.g.attributes.position.count !== 24) return;
      for (let i = 0; i < N.count; i++) if (Math.max(Math.abs(N.getX(i)), Math.abs(N.getY(i)), Math.abs(N.getZ(i))) < 0.999) return;
      boxes3.push({ pi, min: pt.bb.min, max: pt.bb.max });
    });
    faces.sort((a, b) => a.ax - b.ax || a.c - b.c);
    const pairs = new Map();
    for (let i = 0; i < faces.length; i++) {
      const a = faces[i];
      for (let j = i + 1; j < faces.length && faces[j].ax === a.ax && faces[j].c - a.c < TOL; j++) {
        const b = faces[j];
        if (b.s !== a.s || b.pi === a.pi || b.u0 >= a.u1 || a.u0 >= b.u1 || b.v0 >= a.v1 || a.v0 >= b.v1) continue;
        const poly = clip(a.tri, b.tri), ar = poly.length > 2 ? Math.abs(area(poly)) : 0;
        if (ar < 1e-7) continue;
        // a strip under 5 mm (the 4 mm edge of a floor board next to a leg) does not show
        if (Math.max(...poly.map((q) => q[0])) - Math.min(...poly.map((q) => q[0])) < MIN_SIZE || Math.max(...poly.map((q) => q[1])) - Math.min(...poly.map((q) => q[1])) < MIN_SIZE) continue;
        // pressed against an opposite face in the same plane (a wall top under the ceiling, a back against
        // a wall): nobody sees it
        const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
        if (faces.some((f) => f.ax === a.ax && f.s === -a.s && Math.abs(f.c - a.c) < TOL && cx > f.u0 && cx < f.u1 && cy > f.v0 && cy < f.v1 && inside([cx, cy], f.tri))) continue;
        // ...or buried in a third solid box (a floor board's end inside a wall)
        const q = []; q[a.ax] = a.c + a.s * 0.002; q[(a.ax + 1) % 3] = cx; q[(a.ax + 2) % 3] = cy;
        if (boxes3.some((bx) => bx.pi !== a.pi && bx.pi !== b.pi && q[0] > bx.min.x && q[0] < bx.max.x && q[1] > bx.min.y && q[1] < bx.max.y && q[2] > bx.min.z && q[2] < bx.max.z)) continue;
        const k = Math.min(a.pi, b.pi) + ':' + Math.max(a.pi, b.pi) + ':' + a.ax + a.s;
        const e = pairs.get(k) || { plane: 'xyz'[a.ax] + (a.s > 0 ? '+' : '-') + ' ' + a.c.toFixed(3), area: 0, A: bbs(parts[a.pi].bb), B: bbs(parts[b.pi].bb) };
        e.area += ar; pairs.set(k, e);
      }
    }
    const coplanar = [...pairs.values()].filter((e) => e.area >= MIN_AREA).map((e) => ({ ...e, area: +e.area.toFixed(4) })).sort((a, b) => b.area - a.area);

    // ---- walls: the boxes of the walls-only worlds inside the house, each with its floor height
    const H = lv.house || L.HOUSE;
    const bodyWorlds = new Set([lv.world, ...(lv.worlds || [])]);
    const walls = [];
    for (const b of boxes) {
      if (bodyWorlds.has(b.w) || b.x0 < H.minX - 0.3 || b.x1 > H.maxX + 0.3 || b.z0 < H.minZ - 0.3 || b.z1 > H.maxZ + 0.3) continue;
      const alongX = b.x1 - b.x0 > b.z1 - b.z0;
      if (Math.min(b.x1 - b.x0, b.z1 - b.z0) > 0.4) continue;
      const piece = parts.find((p) => Math.abs(p.bb.min.x - b.x0) < 0.002 && Math.abs(p.bb.max.x - b.x1) < 0.002 && Math.abs(p.bb.min.z - b.z0) < 0.002 && Math.abs(p.bb.max.z - b.z1) < 0.002 && p.bb.max.y - p.bb.min.y > 2.4);
      if (!piece) continue;
      walls.push({ ...b, alongX, y0: piece.bb.min.y, y1: piece.bb.max.y, c: alongX ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2, t: alongX ? b.z1 - b.z0 : b.x1 - b.x0, a: alongX ? b.x0 : b.z0, b: alongX ? b.x1 : b.z1 });
    }
    // furniture, rugs, pictures: not a wall piece, not a floor / ceiling / roof slab
    const deco = parts.filter((p) => p.bb.max.y - p.bb.min.y < 2.4 && p.bb.max.x - p.bb.min.x < 15 && p.bb.max.z - p.bb.min.z < 15);

    // ---- 2. through a wall: out of both of its faces (by > 3 cm), on the wall's floor
    const through = [];
    for (const p of deco) for (const w of walls) {
      const bb = p.bb;
      if (bb.max.y < w.y0 + 0.012 || bb.min.y > w.y1 - 0.01) continue;
      const [t0, t1, l0, l1] = w.alongX ? [bb.min.z, bb.max.z, bb.min.x, bb.max.x] : [bb.min.x, bb.max.x, bb.min.z, bb.max.z];
      if (t0 < w.c - w.t / 2 - 0.03 && t1 > w.c + w.t / 2 + 0.03 && Math.min(l1, w.b) - Math.max(l0, w.a) > 0.03) { through.push({ part: bbs(bb), wall: [w.x0, w.z0, w.x1, w.z1].map((x) => +x.toFixed(2)).join(' ') }); break; }
    }

    // ---- 3. openings: gaps of 0.5..2.6 m between wall pieces on one line and floor; nothing in them
    // but the door, the frame (up to 1.5 cm in from each side), the lintel and the floor covering
    const lines = new Map();
    for (const w of walls) { const k = w.alongX + ':' + w.c.toFixed(2) + ':' + w.y0.toFixed(2); (lines.get(k) || lines.set(k, []).get(k)).push(w); }
    const openings = [];
    for (const ws of lines.values()) {
      ws.sort((p, q) => p.a - q.a);
      for (let i = 0; i + 1 < ws.length; i++) { const g = ws[i + 1].a - ws[i].b; if (g > 0.5 && g < 2.6) openings.push({ alongX: ws[i].alongX, c: ws[i].c, t: ws[i].t, y0: ws[i].y0, a: ws[i].b, b: ws[i + 1].a }); }
    }
    const inOpening = [];
    for (const p of deco) for (const o of openings) {
      const bb = p.bb;
      const [l0, l1, t0, t1] = o.alongX ? [bb.min.x, bb.max.x, bb.min.z, bb.max.z] : [bb.min.z, bb.max.z, bb.min.x, bb.max.x];
      const ol = Math.min(l1, o.b - 0.015) - Math.max(l0, o.a + 0.015), ot = Math.min(t1, o.c + o.t / 2 + 0.02) - Math.max(t0, o.c - o.t / 2 - 0.02);
      const oy = Math.min(bb.max.y, o.y0 + 2.09) - Math.max(bb.min.y, o.y0 + 0.03);
      // inside the wall's thickness, or a thin thing hung at its face (a picture); a step or a mat lying in
      // front of the door is not in the opening
      const inWall = Math.min(t1, o.c + o.t / 2) - Math.max(t0, o.c - o.t / 2) > 0.002, hung = t1 - t0 < 0.1;
      if (ol > 0.005 && ot > 0.005 && oy > 0.005 && (inWall || hung)) inOpening.push({ part: bbs(bb), opening: (o.alongX ? 'z=' : 'x=') + o.c.toFixed(2) + ' ' + o.a.toFixed(2) + '..' + o.b.toFixed(2) + ' y0=' + o.y0 });
    }

    // ---- 4. a closed leaf fills its opening: at most 12 mm at each side (the frame covers 10), 5 mm at the top
    const doorGaps = [];
    for (const d of lv.doors) {
      const alongX = Math.abs(Math.cos(d.base)) > 0.5, y0 = d.y0 || 0;
      const o = openings.find((q) => q.alongX === alongX && Math.abs(q.y0 - y0) < 0.05 && Math.abs((alongX ? d.cz : d.cx) - q.c) < 0.05 && (alongX ? d.cx : d.cx * 0 + d.cz) > q.a && (alongX ? d.cx : d.cz) < q.b);
      if (!o) { doorGaps.push({ door: [d.cx, d.cz], gap: 'no opening found' }); continue; }
      const h = alongX ? d.hx : d.hz, gaps = [h - o.a, o.b - (h + d.w)];
      if (gaps.some((g) => g > 0.012 || g < -0.001)) doorGaps.push({ door: [+d.cx.toFixed(2), +d.cz.toFixed(2)], gaps: gaps.map((g) => +g.toFixed(3)) });
    }
    lv.group.traverse((o) => {
      if (!o.isMesh || !/door/i.test(o.name)) return;
      o.geometry.computeBoundingBox();
      const top = o.geometry.boundingBox.max.y;
      if (top < 2.1 - 0.005) doorGaps.push({ mesh: o.name, top: +top.toFixed(3), gap: 'over the leaf ' + (2.1 - top).toFixed(3) + ' m' });
    });
    out[id] = { parts: parts.length, walls: walls.length, openings: openings.length, doors: lv.doors.length, coplanar, through, inOpening, doorGaps };
  }
  return out;
}

const list = (a) => JSON.stringify(a.slice(0, 40)) + (a.length > 40 ? `\n… and ${a.length - 40} more` : '');

let report = null;
async function geometry() {
  if (report) return report;
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?mode=pc');
  report = await page.evaluate(inspect, { TOL, MIN_AREA, MIN_SIZE });
  if (process.env.GEO_DUMP) (await import('node:fs')).writeFileSync(process.env.GEO_DUMP, JSON.stringify(report, null, 1));
  assert.deepEqual(errors, []);
  await ctx.close();
  return report;
}

test('geometry: no two surfaces in one place on any map (they flicker as you move)', async () => {
  for (const [id, r] of Object.entries(await geometry())) {
    assert.ok(r.parts > 500 && r.walls > 10 && r.openings > 5, `${id}: the level was recorded (${r.parts} parts, ${r.walls} walls, ${r.openings} openings)`);
    assert.equal(r.coplanar.length, 0, `${id}: faces in one plane, turned the same way, overlapping:\n${list(r.coplanar)}`);
  }
});

test('geometry: no furniture, rug or picture through a wall or standing in a doorway', async () => {
  for (const [id, r] of Object.entries(await geometry())) {
    assert.equal(r.through.length, 0, `${id}: through a wall:\n${list(r.through)}`);
    assert.equal(r.inOpening.length, 0, `${id}: in a doorway:\n${list(r.inOpening)}`);
  }
});

test('geometry: a closed door fills its opening (no gaps to look through)', async () => {
  for (const [id, r] of Object.entries(await geometry())) {
    assert.ok(r.doors > 3, `${id}: doors found`);
    assert.equal(r.doorGaps.length, 0, `${id}: gaps around door leaves:\n${list(r.doorGaps)}`);
  }
});

test('lurker: wakes only for a player in its own room (never through a wall, also not by a noise behind one); its lunge stays in the room', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base + '?mode=pc');
  const r = await page.evaluate(() => {
    const g = window.__game, level = g.level, out = [];
    g.renderer.setAnimationLoop(null);
    for (const lk of g.lurkers || [g.lurker]) {
      const y0 = (lk.spec && lk.spec.y0) || 0, F = lk.FRONT || { x: 9.1, z: -9.4 }, room = level.roomAt(F.x, F.z, y0);
      const res = { room, inside: 0, woke: 0, wrong: [], lungeOut: [] };
      for (let dx = -2.4; dx <= 2.4; dx += 0.2) for (let dz = -2.4; dz <= 2.4; dz += 0.2) {
        const x = F.x + dx, z = F.z + dz, d = Math.hypot(dx, dz);
        if (d > 2.2 || d < 0.45) continue;
        const ok = level.roomAt(x, z, y0) === room && !level.soundOccluded(F.x, F.z, x, z);
        const player = { head: { x, y: y0 + 1.6, z }, floorY: y0 };
        // by walking up
        lk.reset(); lk.update(1 / 72, player);
        const woke = lk.state === 'telegraph';
        // by a noise there (the player elsewhere)
        lk.reset(); lk.hear({ x, z, y: y0, radius: 5, kind: 'step', source: 'player' });
        const heard = lk.state === 'telegraph';
        if (ok) { res.inside++; if (woke) res.woke++; } else if (woke || heard) res.wrong.push([+x.toFixed(1), +z.toFixed(1), woke ? 'walk' : 'noise']);
        if (ok && woke) {
          for (let i = 0; i < 200 && lk.state !== 'hold'; i++) lk.update(1 / 72, player);
          const t = lk.creature.position;
          if (level.roomAt(t.x, t.z, y0) !== room || level.soundOccluded(F.x, F.z, t.x, t.z)) res.lungeOut.push([+x.toFixed(1), +z.toFixed(1), '->', +t.x.toFixed(2), +t.z.toFixed(2)]);
        }
      }
      lk.reset();
      out.push(res);
    }
    return out;
  });
  assert.deepEqual(errors, []);
  for (const res of r) {
    assert.ok(res.inside > 20 && res.woke === res.inside, `wakes for the player in its room: ${JSON.stringify(res)}`);
    assert.deepEqual(res.wrong, [], `not through a wall: ${JSON.stringify(res.wrong)}`);
    assert.deepEqual(res.lungeOut, [], `the lunge stays in the room: ${JSON.stringify(res.lungeOut)}`);
  }
  await ctx.close();
});

// The flashlight seen from the other side of a wall: the picture with it and without it is the same.
// Through an open door it still lights (the test would pass with the light simply off otherwise).
async function flashScene(walls) {
  const ctx = await newContext(browser, { viewport: { width: 640, height: 400 } });
  const { page, errors } = await open(ctx, base + '?mode=pc' + (walls ? '' : '&flashwalls=off'));
  const r = await page.evaluate(() => {
    const g = window.__game, T = g.THREE, P = g.patrol, W = 320, H = 200;
    g.renderer.setAnimationLoop(null);
    g.wrist.mesh.visible = false; g.board.mesh.visible = false;
    const rt = new T.WebGLRenderTarget(W, H); rt.texture.colorSpace = T.SRGBColorSpace;
    const px = new Uint8Array(W * H * 4);
    const shot = () => {
      const aspect = g.camera.aspect;
      g.camera.aspect = W / H; g.camera.updateProjectionMatrix();
      g.renderer.setRenderTarget(rt); g.renderer.render(g.scene, g.camera); g.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); g.renderer.setRenderTarget(null);
      g.camera.aspect = aspect; g.camera.updateProjectionMatrix();
      return Float32Array.from({ length: W * H }, (_, i) => 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]);
    };
    // the guard stands at (x, z) facing `heading` (the round is not running: only the pose is set)
    const guard = (x, z, heading) => { P.x = x; P.z = z; P.heading = heading; P.headYaw = 0; P.place(); };
    const view = (x, z, yaw, pitch) => { g.player.teleport(x, z, yaw); g.player.lookPitch = pitch; };
    const lit = (setup) => {
      setup(); g.sim(1 / 72); g.scene.updateMatrixWorld(true);
      const on = shot(), spot = P.spot.intensity;
      P.spot.intensity = 0; P.beam.visible = false;
      const off = shot();
      P.spot.intensity = spot; P.beam.visible = true;
      let n = 0, sum = 0;
      for (let i = 0; i < on.length; i++) { const d = on[i] - off[i]; if (d > 3) n++; sum += Math.max(0, d); }
      return { px: n, sum: Math.round(sum) };
    };
    const door = (cx, cz) => g.level.doors.find((d) => Math.hypot(d.cx - cx, d.cz - cz) < 0.4);
    const open = (d, from) => { if (!d.open) d.toggle(from[0], from[1]); d.update(10); };   // the whole swing at once
    // 1. guard in the hall, kitchen door open; the flashlight on the hall's west wall away from the door.
    //    Seen from the kitchen: that wall's other side and the kitchen floor by it stay dark.
    const kitchen = lit(() => { open(door(-2, -2.5), [0, -2.5]); guard(-0.6, -0.6, Math.PI / 2 - 0.15); view(-4.2, -0.9, -Math.PI / 2, -0.25); });
    // 2. guard in the hall, the back door open; the flashlight on the south wall east of the door.
    //    Seen from the yard: the outer face of the wall and the ground in front of it stay dark.
    const yard = lit(() => { open(door(0, 0), [0, -1]); guard(2.6, -2.2, Math.PI); view(2.6, 3.5, 0, -0.1); });
    // 3. guard in the hall aiming out through the open back door: the yard is lit through it
    const through = lit(() => { guard(0.3, -2.6, Math.PI); view(0, 6, 0, -0.45); });
    return { kitchen, yard, through };
  });
  assert.deepEqual(errors, []);
  await ctx.close();
  return r;
}

test('flashlight: stops at walls — no light on the far side of a wall (next room, the yard), still through an open door', async () => {
  const on = await flashScene(true), off = await flashScene(false);
  const info = JSON.stringify({ withWalls: on, roomMaskOnly: off });
  // the scenes do show the leak without the wall test (else they test nothing)
  assert.ok(off.kitchen.px > 200 && off.yard.px > 200, `the room mask alone leaks in these scenes: ${info}`);
  assert.ok(on.kitchen.px < 20, `kitchen side of the wall stays dark: ${info}`);
  assert.ok(on.yard.px < 20, `outer wall and yard stay dark: ${info}`);
  assert.ok(on.through.px > 3000, `light still goes out through the open door: ${info}`);
});
