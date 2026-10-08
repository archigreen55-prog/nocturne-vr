// Building blocks shared by the maps (W6): walls with openings on any floor, the van, a fence,
// a lamp post. The first map (level.js) keeps its own copies of the wall helpers: its geometry must
// stay byte for byte what it was; the mansion builds everything with these.
import * as THREE from 'three';
import { C } from './level.js';

export const WALL_H = 2.7;
export const DOOR_H = 2.1;
export const EXT_T = 0.3;   // exterior wall thickness
export const INT_T = 0.14;  // interior wall thickness

// Walls of one floor at height y0: S = the static Builder, solid(x0, z0, x1, z1) adds the footprint
// to the collision worlds, doorSpecs collects doors for new Door(); floor = the floor's index.
export function wallKit(S, solid, doorSpecs, y0 = 0, floor = 0, wallH = WALL_H) {
  // Wall along X at z, from x0 to x1; openings: [{ c, w, door?: 'normal' | 'locked', front? }]
  function wallX(z, x0, x1, t, color, openings = []) {
    let x = x0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > x) { S.box(x, y0, z - t / 2, a, y0 + wallH, z + t / 2, color); solid(x, z - t / 2, a, z + t / 2); }
      S.box(a, y0 + DOOR_H, z - t / 2, b, y0 + wallH, z + t / 2, color);             // lintel
      S.box(a - 0.05, y0, z - t / 2 - 0.02, a, y0 + DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);  // jambs
      S.box(b, y0, z - t / 2 - 0.02, b + 0.05, y0 + DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);
      if (o.door) doorSpecs.push({ axis: 'x', hx: a + 0.02, hz: z, w: o.w - 0.04, locked: o.door === 'locked', front: o.front, y0, floor });
      x = b;
    }
    if (x1 > x) { S.box(x, y0, z - t / 2, x1, y0 + wallH, z + t / 2, color); solid(x, z - t / 2, x1, z + t / 2); }
  }
  // Wall along Z at x, from z0 to z1 (z0 < z1)
  function wallZ(x, z0, z1, t, color, openings = []) {
    let z = z0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > z) { S.box(x - t / 2, y0, z, x + t / 2, y0 + wallH, a, color); solid(x - t / 2, z, x + t / 2, a); }
      S.box(x - t / 2, y0 + DOOR_H, a, x + t / 2, y0 + wallH, b, color);
      S.box(x - t / 2 - 0.02, y0, a - 0.05, x + t / 2 + 0.02, y0 + DOOR_H + 0.05, a, C.trim);
      S.box(x - t / 2 - 0.02, y0, b, x + t / 2 + 0.02, y0 + DOOR_H + 0.05, b + 0.05, C.trim);
      if (o.door) doorSpecs.push({ axis: 'z', hx: x, hz: a + 0.02, w: o.w - 0.04, locked: o.door === 'locked', y0, floor });
      z = b;
    }
    if (z1 > z) { S.box(x - t / 2, y0, z, x + t / 2, y0 + wallH, z1, color); solid(x - t / 2, z, x + t / 2, z1); }
  }
  return { wallX, wallZ };
}

// A fence along one side (posts and two rails); solid(…) adds it to the collision worlds.
export function fence(S, solid, x0, z0, x1, z1) {
  const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0;
  for (let p = 0; p <= len + 0.01; p += 2) S.boxAt(0.1, 1.2, 0.1, alongX ? x0 + p : x0, 0, alongX ? z0 : z0 + p, C.fence);
  for (const y of [0.45, 1.0]) {
    if (alongX) S.box(x0, y, z0 - 0.03, x1, y + 0.1, z0 + 0.03, C.fence);
    else S.box(x0 - 0.03, y, z0, x0 + 0.03, y + 0.1, z1, C.fence);
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

// The van: built along +Z with the rear (open doors) at z = 0 and the cab at z = 5, then turned by
// `yaw` about the rear and moved to (x, z). Returns the cargo floor rectangle in world space (for
// yaw = 0 or ±π only: the cargo is an axis-aligned box) and the body footprint.
export function van(S, G, x, z, yaw) {
  const x0 = -1.0, x1 = 1.0, z0 = 0, z1 = 5.0;
  const T = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const tmp = { parts: [] };
  const box = (a, b, c, d, e, f, col) => { const g = new THREE.BoxGeometry(Math.abs(d - a), Math.abs(e - b), Math.abs(f - c)); g.translate((a + d) / 2, (b + e) / 2, (c + f) / 2); tmp.parts.push([g, col, false]); };
  const gbox = (a, b, c, d, e, f, col) => { const g = new THREE.BoxGeometry(Math.abs(d - a), Math.abs(e - b), Math.abs(f - c)); g.translate((a + d) / 2, (b + e) / 2, (c + f) / 2); tmp.parts.push([g, col, true]); };
  // cargo: an open-backed shell (sides, roof, front wall), so you can see the loot inside
  box(x0, 0.35, z0, x0 + 0.05, 2.2, z1 - 1.3, C.van); box(x1 - 0.05, 0.35, z0, x1, 2.2, z1 - 1.3, C.van);
  box(x0, 2.15, z0, x1, 2.2, z1 - 1.3, C.van); box(x0, 0.35, z1 - 1.36, x1, 2.2, z1 - 1.3, C.van);
  box(x0 + 0.05, 0.4, z0 + 0.02, x0 + 0.06, 2.15, z1 - 1.36, 0x2e3036); box(x1 - 0.06, 0.4, z0 + 0.02, x1 - 0.05, 2.15, z1 - 1.36, 0x2e3036);
  box(x0, 0.28, z0 - 0.04, x1, 0.36, z0 + 0.02, C.metal);                           // rear sill
  box(x0 + 0.05, 0.35, z1 - 1.3, x1 - 0.05, 1.6, z1, C.van);                    // cab
  box(x0 + 0.1, 1.6, z1 - 1.3, x1 - 0.1, 1.95, z1 - 0.5, C.van);
  gbox(x0 + 0.15, 1.2, z1 + 0.001, x1 - 0.15, 1.55, z1 + 0.01, 0x0e1420);
  box(x0 - 0.01, 1.2, z1 - 1.2, x0, 1.55, z1 - 0.3, C.glass); box(x1, 1.2, z1 - 1.2, x1 + 0.01, 1.55, z1 - 0.3, C.glass);
  box(x0 - 0.01, 1.0, z0 + 0.3, x0, 1.25, z1 - 1.4, C.vanStripe); box(x1, 1.0, z0 + 0.3, x1 + 0.01, 1.25, z1 - 1.4, C.vanStripe);
  box(x0 + 0.1, 0.36, z0 + 0.02, x1 - 0.1, 0.4, z1 - 1.4, C.woodDark);          // cargo floor (inside)
  box(x0 + 0.1, 2.1, z0 + 0.05, x1 - 0.1, 2.12, z1 - 1.35, 0x3a3c40);
  gbox(x0 + 0.06, 0.4, z1 - 1.37, x1 - 0.06, 2.15, z1 - 1.36, 0x0b0d12);          // dark front wall inside
  gbox(x0 + 0.6, 2.13, z0 + 0.8, x1 - 0.6, 2.14, z0 + 1.1, 0x8a6a40);               // dim cargo lamp
  for (const [wx, wz] of [[x0 + 0.05, z0 + 0.9], [x1 - 0.05, z0 + 0.9], [x0 + 0.05, z1 - 0.8], [x1 - 0.05, z1 - 0.8]]) {
    const g = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12); g.rotateZ(Math.PI / 2); g.translate(wx, 0.36, wz); tmp.parts.push([g, C.tyre, false]);
  }
  for (const s of [-1, 1]) {   // open rear doors, swung out ~110°
    const hx = s < 0 ? x0 : x1;
    const g = new THREE.BoxGeometry(0.98, 1.8, 0.05); g.translate(-s * 0.49, 1.3, 0);
    g.rotateY(s * 1.9); g.translate(hx, 0, z0);
    tmp.parts.push([g, C.van, false]);
  }
  box(x0 + 0.3, 0.2, z0 - 0.35, x1 - 0.3, 0.3, z0, C.metal);                     // step / drop-off lip
  for (const [g, col, glow] of tmp.parts) { g.applyMatrix4(T); (glow ? G : S).add(g, col); }
  const corner = (px, pz) => new THREE.Vector3(px, 0, pz).applyMatrix4(T);
  const rect = (a, b) => { const p = corner(a[0], a[1]), q = corner(b[0], b[1]); return { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z) }; };
  return { body: rect([x0, z0], [x1, z1]), cargo: { ...rect([x0 + 0.1, z0 + 0.05], [x1 - 0.1, z1 - 1.45]), y: 0.4 } };
}
