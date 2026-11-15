// Building blocks shared by the maps (W6): walls with openings on any floor, the van, a fence,
// a lamp post. The first map (level.js) keeps its own copies of the wall helpers: its geometry must
// stay byte for byte what it was; the mansion builds everything with these.
import * as THREE from 'three';
import { C } from './level.js';
import { buildVan } from './vans.js';

export const WALL_H = 2.7;
export const DOOR_H = 2.1;
export const EXT_T = 0.3;   // exterior wall thickness
export const INT_T = 0.14;  // interior wall thickness
export const JAMB = 0.01;   // the door frame reaches this far into the opening; the leaf fills the rest (no face in the wall end's plane)

// Walls of one floor at height y0: S = the static Builder, solid(x0, z0, x1, z1) adds the footprint
// to the collision worlds, doorSpecs collects doors for new Door(); floor = the floor's index;
// occluders (optional) collects the wall centre lines [x0, z0, x1, z1, y0, y1] the flashlight stops at
// (enemies/flashWalls.js), the ends at x0 / z0 / x1 / z1 extended by half the thickness (a corner).
export function wallKit(S, solid, doorSpecs, y0 = 0, floor = 0, wallH = WALL_H, occluders = null) {
  const occ = (x0, z0, x1, z1) => { if (occluders) occluders.push([x0, z0, x1, z1, y0, y0 + wallH]); };
  // Wall along X at z, from x0 to x1; openings: [{ c, w, door?: 'normal' | 'locked', front? }]
  function wallX(z, x0, x1, t, color, openings = []) {
    let x = x0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > x) { S.box(x, y0, z - t / 2, a, y0 + wallH, z + t / 2, color); solid(x, z - t / 2, a, z + t / 2); occ(x === x0 ? x - t / 2 : x, z, a, z); }
      S.box(a, y0 + DOOR_H, z - t / 2, b, y0 + wallH, z + t / 2, color);             // lintel
      S.box(a - 0.05, y0, z - t / 2 - 0.02, a + JAMB, y0 + DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);  // jambs, 1 cm into the opening
      S.box(b - JAMB, y0, z - t / 2 - 0.02, b + 0.05, y0 + DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);
      if (o.door) doorSpecs.push({ axis: 'x', hx: a + JAMB, hz: z, w: o.w - 2 * JAMB, locked: o.door === 'locked', front: o.front, y0, floor });   // jamb to jamb
      x = b;
    }
    if (x1 > x) { S.box(x, y0, z - t / 2, x1, y0 + wallH, z + t / 2, color); solid(x, z - t / 2, x1, z + t / 2); occ(x === x0 ? x - t / 2 : x, z, x1 + t / 2, z); }
  }
  // Wall along Z at x, from z0 to z1 (z0 < z1)
  function wallZ(x, z0, z1, t, color, openings = []) {
    let z = z0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > z) { S.box(x - t / 2, y0, z, x + t / 2, y0 + wallH, a, color); solid(x - t / 2, z, x + t / 2, a); occ(x, z === z0 ? z - t / 2 : z, x, a); }
      S.box(x - t / 2, y0 + DOOR_H, a, x + t / 2, y0 + wallH, b, color);
      S.box(x - t / 2 - 0.02, y0, a - 0.05, x + t / 2 + 0.02, y0 + DOOR_H + 0.05, a + JAMB, C.trim);
      S.box(x - t / 2 - 0.02, y0, b - JAMB, x + t / 2 + 0.02, y0 + DOOR_H + 0.05, b + 0.05, C.trim);
      if (o.door) doorSpecs.push({ axis: 'z', hx: x, hz: a + JAMB, w: o.w - 2 * JAMB, locked: o.door === 'locked', y0, floor });
      z = b;
    }
    if (z1 > z) { S.box(x - t / 2, y0, z, x + t / 2, y0 + wallH, z1, color); solid(x - t / 2, z, x + t / 2, z1); occ(x, z === z0 ? z - t / 2 : z, x, z1 + t / 2); }
  }
  return { wallX, wallZ };
}

// A fence along one side (posts and two rails); solid(…) adds it to the collision worlds.
// skipEnds: no post at either end (a side between two others that already have the corner posts);
// its rails then run between the other sides' rails.
export function fence(S, solid, x0, z0, x1, z1, skipEnds = false) {
  const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0;
  for (let p = skipEnds ? 2 : 0; p <= len + 0.01 - (skipEnds ? 2 : 0); p += 2) S.boxAt(0.1, 1.2, 0.1, alongX ? x0 + p : x0, 0, alongX ? z0 : z0 + p, C.fence);
  const in0 = skipEnds ? 0.03 : 0;
  for (const y of [0.45, 1.0]) {
    if (alongX) S.box(x0 + in0, y, z0 - 0.03, x1 - in0, y + 0.1, z0 + 0.03, C.fence);
    else S.box(x0 - 0.03, y, z0 + in0, x0 + 0.03, y + 0.1, z1 - in0, C.fence);
  }
  solid(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05);
}

// A lamp post with a glowing head at (x, z); G = the glow Builder. Returns the light position.
export function lampPost(S, G, solid, x, z, h = 2.9, glow = 0xffd9a0) {
  S.cyl(0.05, 0.07, h, x, 0, z, C.pole, 6); S.boxAt(0.3, 0.25, 0.3, x, h, z, C.pole);
  G.box(x - 0.13, h + 0.02, z - 0.13, x + 0.13, h + 0.22, z + 0.13, glow);
  solid(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 3, null);
  return [x, h - 0.1, z];
}

// The van: built along +Z with the rear (open doors) at z = 0 and the cab at z = 5 (world/vans.js draws it),
// then turned by `yaw` about the rear and moved to (x, z). The paint goes to P (its own mesh and material, see
// vans.js), the lights to G. Returns the cargo floor rectangle in world space (for
// yaw = 0 or ±π only: the cargo is an axis-aligned box) and the body footprint.
export function van(S, G, x, z, yaw, P = S) {
  const x0 = -1.0, x1 = 1.0, z0 = 0, z1 = 5.0;
  const T = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  for (const [g, col, glow] of buildVan().parts) { g.applyMatrix4(T); (glow ? G : P).add(g, col); }
  const corner = (px, pz) => new THREE.Vector3(px, 0, pz).applyMatrix4(T);
  const rect = (a, b) => { const p = corner(a[0], a[1]), q = corner(b[0], b[1]); return { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z) }; };
  // the swung-out rear doors (W18): a body walks into them, not through them — their footprints, 0.32 m
  // out from the side and 0.93 m along it (the leaf turned by 1.9 rad about its hinge)
  const doorRects = [-1, 1].map((s) => { const hx = s < 0 ? x0 : x1; return rect([hx, z0], [hx + s * 0.98 * -Math.cos(1.9), z0 + 0.98 * Math.sin(1.9)]); });
  return { body: rect([x0, z0], [x1, z1]), cargo: { ...rect([x0 + 0.1, z0 + 0.05], [x1 - 0.1, z1 - 1.45]), y: 0.4 }, doors: doorRects };
}
