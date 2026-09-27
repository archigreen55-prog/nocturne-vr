// Hand-made level: one floor of an old house at night, a fenced yard and the van.
// Everything static is merged into two meshes (lit with vertex colours + unlit glow: windows, embers,
// lamp); each door is its own mesh turning on a hinge. Walls and furniture footprints go into the 2D
// collision world; doors are moving segments checked separately.
//
// Axes: +X east, -Z north (the house), +Z south (the yard). Floor at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision.js';

const WALL_H = 2.7;
const DOOR_H = 2.1;
const EXT_T = 0.3;   // exterior wall thickness
const INT_T = 0.14;  // interior wall thickness

// Cold night palette: muted blues and greys at rest; the lights tint the rest.
const C = {
  wallExt: 0x5d6475, wallInt: 0x6f7686, wallpaperLib: 0x4f5d58, wallpaperBed: 0x6a5f70, trim: 0x2e2a2a,
  ceiling: 0x2a2e38, wood: 0x5a4636, woodDark: 0x3b2d25, woodLight: 0x7a6250, tileA: 0x7c8490, tileB: 0x535a66,
  planksA: 0x4d3b2f, planksB: 0x433328, rugRed: 0x6b2d33, rugBlue: 0x2f3f63, rugGreen: 0x34523f,
  counter: 0x8d9097, metal: 0x777c85, fridge: 0xb9bcc2, fabric: 0x4b5a7a, fabricRed: 0x7a3438, bed: 0xb8b3a8,
  stone: 0x6c6760, brick: 0x6e3f35, soot: 0x151313, frameGold: 0x9c7a3c,
  grass: 0x243226, path: 0x55524d, fence: 0x3e342c, bark: 0x3b2e24, leaves: 0x1f3a2a, leaves2: 0x2a4a33,
  roof: 0x3a2f33, van: 0xc9cbc6, vanStripe: 0x2d5f8a, tyre: 0x1a1a1c, glass: 0x1d2633, pole: 0x2b2d31,
  door: 0x6b4f3a, doorFront: 0x4a2f2a, knob: 0xc2a15a,
  books: [0x7a2e2e, 0x2e4a7a, 0x3d6b3d, 0x8a6d2e, 0x5a3a6a, 0x6a6a6a, 0x8a4a2a, 0x2a5a5a],
};
const GLOW = { window: 0x2b3f6b, ember: 0xff6a2a, lamp: 0xffd9a0, moon: 0xdfe8ff };

export const ROOMS = [
  { name: 'Кухня', minX: -10, maxX: -2, minZ: -5, maxZ: 0 },
  { name: 'Хол', minX: -2, maxX: 3, minZ: -5, maxZ: 0 },
  { name: 'Комора', minX: 3, maxX: 10, minZ: -5, maxZ: 0 },
  { name: 'Коридор', minX: -10, maxX: 10, minZ: -7, maxZ: -5 },
  { name: 'Бібліотека', minX: -10, maxX: -4, minZ: -14, maxZ: -7 },
  { name: 'Передпокій', minX: -4, maxX: -2, minZ: -14, maxZ: -7 },
  { name: 'Вітальня', minX: -2, maxX: 5, minZ: -14, maxZ: -7 },
  { name: 'Спальня', minX: 5, maxX: 10, minZ: -14, maxZ: -7 },
];
export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.name;
  return 'Двір';
}

export const SPAWN = { x: 2.2, z: 6.8, yaw: 0 };  // beside the van, facing the back door
const LOT = { minX: -16, maxX: 16, minZ: -20, maxZ: 16 };

// ---------- geometry helpers ----------
const tmpColor = new THREE.Color();
function colored(geo, hex) {
  const g = geo;
  tmpColor.setHex(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = tmpColor.r; a[i * 3 + 1] = tmpColor.g; a[i * 3 + 2] = tmpColor.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

class Builder {
  constructor() { this.parts = []; }
  // axis-aligned box by its min/max corners
  box(x0, y0, z0, x1, y1, z1, color) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.parts.push(colored(g, color));
  }
  // box of size w,h,d with its bottom centre at x,y,z, turned by ry
  boxAt(w, h, d, x, y, z, color, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.parts.push(colored(g, color));
  }
  cyl(rTop, rBot, h, x, y, z, color, seg = 8) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(x, y + h / 2, z);
    this.parts.push(colored(g, color));
  }
  add(geo, color) { this.parts.push(colored(geo, color)); }
  mesh(material) {
    const geo = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return new THREE.Mesh(geo, material);
  }
}

export function buildLevel() {
  const S = new Builder();   // static, lit
  const G = new Builder();   // glow, unlit
  const world = new CollisionWorld(LOT);
  const doors = [];
  const doorSpecs = [];

  // ---------- walls with openings ----------
  // Wall along X at z, from x0 to x1; openings: [{ c, w, door?: 'normal' | 'locked' }]
  function wallX(z, x0, x1, t, color, openings = []) {
    let x = x0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > x) { S.box(x, 0, z - t / 2, a, WALL_H, z + t / 2, color); world.addBox(x, z - t / 2, a, z + t / 2); }
      S.box(a, DOOR_H, z - t / 2, b, WALL_H, z + t / 2, color);             // lintel
      S.box(a - 0.05, 0, z - t / 2 - 0.02, a, DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);  // jambs
      S.box(b, 0, z - t / 2 - 0.02, b + 0.05, DOOR_H + 0.05, z + t / 2 + 0.02, C.trim);
      if (o.door) doorSpecs.push({ axis: 'x', hx: a + 0.02, hz: z, w: o.w - 0.04, locked: o.door === 'locked', front: o.front });
      x = b;
    }
    if (x1 > x) { S.box(x, 0, z - t / 2, x1, WALL_H, z + t / 2, color); world.addBox(x, z - t / 2, x1, z + t / 2); }
  }
  // Wall along Z at x, from z0 to z1 (z0 < z1)
  function wallZ(x, z0, z1, t, color, openings = []) {
    let z = z0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (a > z) { S.box(x - t / 2, 0, z, x + t / 2, WALL_H, a, color); world.addBox(x - t / 2, z, x + t / 2, a); }
      S.box(x - t / 2, DOOR_H, a, x + t / 2, WALL_H, b, color);
      S.box(x - t / 2 - 0.02, 0, a - 0.05, x + t / 2 + 0.02, DOOR_H + 0.05, a, C.trim);
      S.box(x - t / 2 - 0.02, 0, b, x + t / 2 + 0.02, DOOR_H + 0.05, b + 0.05, C.trim);
      if (o.door) doorSpecs.push({ axis: 'z', hx: x, hz: a + 0.02, w: o.w - 0.04, locked: o.door === 'locked' });
      z = b;
    }
    if (z1 > z) { S.box(x - t / 2, 0, z, x + t / 2, WALL_H, z1, color); world.addBox(x - t / 2, z, x + t / 2, z1); }
  }

  // exterior
  wallX(0, -10 - EXT_T / 2, 10 + EXT_T / 2, EXT_T, C.wallExt, [{ c: 0, w: 1.0, door: 'normal' }]);
  wallX(-14, -10 - EXT_T / 2, 10 + EXT_T / 2, EXT_T, C.wallExt, [{ c: -3, w: 1.0, door: 'locked', front: true }]);
  wallZ(-10, -14, 0, EXT_T, C.wallExt);
  wallZ(10, -14, 0, EXT_T, C.wallExt);
  // interior
  wallX(-5, -10, 10, INT_T, C.wallInt, [{ c: -6, w: 1.0, door: 'normal' }, { c: 0, w: 1.4 }, { c: 6.5, w: 1.0, door: 'normal' }]);
  wallX(-7, -10, -4, INT_T, C.wallpaperLib, [{ c: -7, w: 1.0, door: 'normal' }]);
  wallX(-7, -2, 10, INT_T, C.wallInt, [{ c: 1.5, w: 1.6 }, { c: 7.5, w: 1.0, door: 'normal' }]);
  wallZ(-2, -5, 0, INT_T, C.wallInt, [{ c: -2.5, w: 1.0, door: 'normal' }]);
  wallZ(3, -5, 0, INT_T, C.wallInt);
  wallZ(-4, -14, -7, INT_T, C.wallpaperLib, [{ c: -10.5, w: 1.0 }]);
  wallZ(-2, -14, -7, INT_T, C.wallInt, [{ c: -10, w: 1.2 }]);
  wallZ(5, -14, -7, INT_T, C.wallpaperBed, [{ c: -11, w: 1.0, door: 'normal' }]);

  // ---------- floors and ceiling ----------
  S.box(-25, -0.1, -30, 25, 0, 25, C.grass);                               // ground
  S.box(-10.15, 0, -14.15, 10.15, 0.01, 0.15, C.planksB);                     // house base
  for (let x = -10; x < -2; x += 0.5) for (let z = -5; z < 0; z += 0.5) {    // kitchen tiles
    if (((x + z) * 2) % 2 === 0) S.box(x, 0.01, z, x + 0.5, 0.015, z + 0.5, C.tileA);
    else S.box(x, 0.01, z, x + 0.5, 0.015, z + 0.5, C.tileB);
  }
  const planks = (x0, x1, z0, z1, alongX) => {
    if (alongX) for (let z = z0, i = 0; z < z1; z += 0.22, i++) S.box(x0, 0.01, z, x1, 0.014, Math.min(z1, z + 0.21), i % 2 ? C.planksA : C.planksB);
    else for (let x = x0, i = 0; x < x1; x += 0.22, i++) S.box(x, 0.01, z0, Math.min(x1, x + 0.21), 0.014, z1, i % 2 ? C.planksA : C.planksB);
  };
  planks(-2, 3, -5, 0, false);
  planks(-10, 10, -7, -5, true);
  planks(-10, -4, -14, -7, false);
  planks(-4, -2, -14, -7, false);
  planks(-2, 5, -14, -7, true);
  planks(5, 10, -14, -7, false);
  S.box(3, 0.01, -5, 10, 0.014, 0, C.stone);                                 // pantry: stone floor
  S.box(-10.15, WALL_H, -14.15, 10.15, WALL_H + 0.05, 0.15, C.ceiling);      // ceiling

  // roof: gable along X, ridge at 4.6 m
  {
    const e = 0.5, x0 = -10.15 - e, x1 = 10.15 + e, zs = 0.15 + e, zn = -14.15 - e, zm = -7, y0 = WALL_H + 0.05, y1 = 4.6;
    const south = new THREE.BoxGeometry(x1 - x0, 0.12, Math.hypot(zs - zm, y1 - y0));
    south.rotateX(Math.atan2(y1 - y0, zs - zm));
    south.translate((x0 + x1) / 2, (y0 + y1) / 2, (zs + zm) / 2);
    S.add(south, C.roof);
    const north = new THREE.BoxGeometry(x1 - x0, 0.12, Math.hypot(zm - zn, y1 - y0));
    north.rotateX(-Math.atan2(y1 - y0, zm - zn));
    north.translate((x0 + x1) / 2, (y0 + y1) / 2, (zm + zn) / 2);
    S.add(north, C.roof);
    // gable ends (triangles), as thin extruded shapes
    for (const x of [-10.15, 10.15]) {
      const shape = new THREE.Shape();
      shape.moveTo(-14.15, y0); shape.lineTo(0.15, y0); shape.lineTo(zm, y1); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      // shape XY -> world ZY, extruded along world -X (a proper rotation, so faces keep their winding)
      g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x + 0.15, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
      S.add(toIndexed(g), C.wallExt);
    }
  }

  // ---------- windows (glow panes on both faces of the exterior walls) ----------
  const windowX = (z, xc, outward) => {
    for (const s of [outward, -outward]) {
      const zz = z + s * (EXT_T / 2 + 0.012);
      G.box(xc - 0.55, 0.95, zz - 0.004, xc + 0.55, 2.0, zz + 0.004, GLOW.window);
      S.box(xc - 0.62, 0.9, zz - 0.02 * s, xc + 0.62, 0.95, zz + 0.03 * s, C.trim);          // sill
      S.box(xc - 0.025, 0.95, zz - 0.006, xc + 0.025, 2.0, zz + 0.006, C.trim);               // mullion
      S.box(xc - 0.55, 1.45, zz - 0.006, xc + 0.55, 1.5, zz + 0.006, C.trim);
    }
  };
  const windowZ = (x, zc, outward) => {
    for (const s of [outward, -outward]) {
      const xx = x + s * (EXT_T / 2 + 0.012);
      G.box(xx - 0.004, 0.95, zc - 0.55, xx + 0.004, 2.0, zc + 0.55, GLOW.window);
      S.box(xx - 0.02 * s, 0.9, zc - 0.62, xx + 0.03 * s, 0.95, zc + 0.62, C.trim);
      S.box(xx - 0.006, 0.95, zc - 0.025, xx + 0.006, 2.0, zc + 0.025, C.trim);
      S.box(xx - 0.006, 1.45, zc - 0.55, xx + 0.006, 1.5, zc + 0.55, C.trim);
    }
  };
  windowX(0, -6, 1); windowX(0, 6.5, 1); windowX(0, -8.8, 1);
  windowX(-14, -7, -1); windowX(-14, 1.5, -1); windowX(-14, 4, -1); windowX(-14, 8.5, -1);
  windowZ(-10, -2.5, -1); windowZ(-10, -10.5, -1); windowZ(10, -2.5, 1); windowZ(10, -12, 1);

  // ---------- furniture ----------
  const solid = (x0, z0, x1, z1) => world.addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
  const table = (x0, z0, x1, z1, h, top, legs) => {
    S.box(x0, h - 0.05, z0, x1, h, z1, top);
    for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.1, z0 + 0.05], [x0 + 0.05, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) S.box(x, 0, z, x + 0.05, h - 0.05, z + 0.05, legs);
    solid(x0, z0, x1, z1);
  };
  const chair = (x, z, ry, color = C.woodDark) => {
    S.boxAt(0.42, 0.45, 0.42, x, 0, z, color, ry);
    const b = new THREE.BoxGeometry(0.42, 0.5, 0.05); b.translate(0, 0.7, -0.19); b.rotateY(ry); b.translate(x, 0, z);
    S.add(b, color);
    solid(x - 0.22, z - 0.22, x + 0.22, z + 0.22);
  };
  const painting = (x, z, face, w, h, color) => {  // face: 'n','s','e','w' = the direction it faces
    const y0 = 1.3, y1 = 1.3 + h, t = 0.03;
    if (face === 's' || face === 'n') {
      const d = face === 's' ? 1 : -1;
      S.box(x - w / 2, y0, z, x + w / 2, y1, z + d * t, C.frameGold);
      S.box(x - w / 2 + 0.05, y0 + 0.05, z + d * t, x + w / 2 - 0.05, y1 - 0.05, z + d * (t + 0.005), color);
    } else {
      const d = face === 'e' ? 1 : -1;
      S.box(x, y0, z - w / 2, x + d * t, y1, z + w / 2, C.frameGold);
      S.box(x + d * t, y0 + 0.05, z - w / 2 + 0.05, x + d * (t + 0.005), y1 - 0.05, z + w / 2 - 0.05, color);
    }
  };
  const books = (x0, x1, z0, z1, y, alongX, seed) => {  // one shelf of books
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    let p = alongX ? x0 : z0;
    const end = alongX ? x1 : z1;
    while (p < end - 0.05) {
      const w = 0.035 + rnd() * 0.05, h = 0.2 + rnd() * 0.12;
      const col = C.books[Math.floor(rnd() * C.books.length)];
      if (rnd() > 0.08) {
        if (alongX) S.box(p, y, z0 + 0.02, Math.min(end, p + w), y + h, z1 - 0.02, col);
        else S.box(x0 + 0.02, y, p, x1 - 0.02, y + h, Math.min(end, p + w), col);
      }
      p += w + 0.004;
    }
  };
  const bookcase = (x0, z0, x1, z1, alongX, seed) => {
    S.box(x0, 0, z0, x1, 2.3, z1, C.woodDark);  // back/carcass (books sit on its front)
    const fz = alongX ? (z0 < -10 ? z1 : z0) : 0;
    const fx = alongX ? 0 : (x0 < -5 ? x1 : x0);
    for (let i = 0; i < 5; i++) {
      const y = 0.12 + i * 0.44;
      if (alongX) {
        const d = z0 < -10 ? 1 : -1;
        S.box(x0, y - 0.03, fz, x1, y, fz + d * 0.3, C.wood);
        books(x0 + 0.05, x1 - 0.05, Math.min(fz, fz + d * 0.28), Math.max(fz, fz + d * 0.28), y, true, seed + i * 31);
      } else {
        const d = x0 < -5 ? 1 : -1;
        S.box(fx, y - 0.03, z0, fx + d * 0.3, y, z1, C.wood);
        books(Math.min(fx, fx + d * 0.28), Math.max(fx, fx + d * 0.28), z0 + 0.05, z1 - 0.05, y, false, seed + i * 31);
      }
    }
    if (alongX) { const d = z0 < -10 ? 1 : -1; solid(x0, z0, x1, fz + d * 0.3); }
    else { const d = x0 < -5 ? 1 : -1; solid(x0, z0, fx + d * 0.3, z1); }
  };
  const rug = (x0, z0, x1, z1, color) => {
    S.box(x0, 0.014, z0, x1, 0.022, z1, color);
    S.box(x0 + 0.12, 0.022, z0 + 0.12, x1 - 0.12, 0.024, z1 - 0.12, C.frameGold);
    S.box(x0 + 0.17, 0.024, z0 + 0.17, x1 - 0.17, 0.026, z1 - 0.17, color);
  };
  const ceilingLamp = (x, z) => { S.cyl(0.01, 0.01, 0.5, x, WALL_H - 0.5, z, C.pole, 4); S.cyl(0.08, 0.25, 0.18, x, WALL_H - 0.68, z, C.metal, 10); };

  // kitchen
  S.box(-9.85, 0, -4.8, -9.25, 0.86, -1.0, C.woodLight); S.box(-9.88, 0.86, -4.83, -9.2, 0.92, -0.97, C.counter); solid(-9.85, -4.8, -9.2, -1.0);
  S.box(-9.2, 0, -4.86, -7.2, 0.86, -4.3, C.woodLight); S.box(-9.2, 0.86, -4.88, -7.2, 0.92, -4.25, C.counter); solid(-9.2, -4.88, -7.2, -4.25);
  S.box(-9.85, 0.92, -3.4, -9.3, 0.95, -2.8, C.soot);                               // hob
  S.box(-9.85, 1.5, -4.8, -9.5, 2.2, -1.0, C.woodLight);                           // upper cabinets
  for (let z = -4.8; z < -1.2; z += 0.6) S.box(-9.5, 1.55, z + 0.28, -9.48, 2.15, z + 0.3, C.trim);
  S.box(-9.85, 0, -0.9, -9.15, 1.9, -0.3, C.fridge); S.box(-9.16, 1.0, -0.55, -9.13, 1.5, -0.5, C.metal); solid(-9.85, -0.9, -9.15, -0.3);
  table(-6.3, -3.0, -4.7, -2.1, 0.76, C.wood, C.woodDark);
  chair(-5.9, -3.5, 0); chair(-5.1, -3.5, 0); chair(-5.9, -1.6, Math.PI); chair(-5.1, -1.6, Math.PI);
  ceilingLamp(-6, -2.5);
  painting(-2.07, -1.2, 'w', 0.6, 0.45, 0x5a7a4a);
  // hall
  rug(-1.2, -4.3, 2.2, -1.2, C.rugRed);
  S.box(2.4, 0, -3.0, 2.85, 0.45, -1.5, C.woodDark); S.box(2.8, 0.45, -3.0, 2.86, 0.9, -1.5, C.woodDark); solid(2.4, -3.0, 2.86, -1.5);
  S.cyl(0.02, 0.02, 1.8, 2.5, 0, -0.55, C.woodDark, 6); S.cyl(0.18, 0.2, 0.03, 2.5, 0, -0.55, C.woodDark, 8); solid(2.35, -0.7, 2.65, -0.4);
  S.box(-1.93, 0, -4.7, -1.5, 0.8, -3.6, C.wood); solid(-1.93, -4.7, -1.5, -3.6);   // console by the arch
  painting(0.5, -4.93, 's', 1.0, 0.7, 0x3a4a6a);
  ceilingLamp(0.5, -2.5);
  // pantry
  for (const [x0, z0, x1, z1] of [[9.35, -4.8, 9.85, -0.3], [4.0, -0.65, 8.8, -0.15]]) {
    S.box(x0, 0, z0, x1, 0.04, z1, C.woodDark);
    for (let i = 1; i <= 4; i++) S.box(x0, i * 0.48, z0, x1, i * 0.48 + 0.03, z1, C.wood);
    for (const [x, z] of [[x0, z0], [x1 - 0.04, z0], [x0, z1 - 0.04], [x1 - 0.04, z1 - 0.04]]) S.box(x, 0, z, x + 0.04, 2.0, z + 0.04, C.woodDark);
    solid(x0, z0, x1, z1);
    let r = Math.floor(x0 * 100 + 7);
    const rnd = () => ((r = (r * 16807 + 11) % 2147483647) / 2147483647);
    for (let i = 0; i < 4; i++) {
      const y = i * 0.48 + 0.04;
      const alongX = x1 - x0 > z1 - z0;
      for (let p = (alongX ? x0 : z0) + 0.1; p < (alongX ? x1 : z1) - 0.2; p += 0.25 + rnd() * 0.2) {
        const h = 0.12 + rnd() * 0.2, col = [0x8a6d2e, 0x6b5d4a, 0x3d6b3d, 0x7a2e2e, 0x9a9a8a][Math.floor(rnd() * 5)];
        if (alongX) S.cyl(0.06, 0.06, h, p, y, (z0 + z1) / 2, col, 6);
        else S.boxAt(0.3, h, 0.16, (x0 + x1) / 2, y, p, col);
      }
    }
  }
  S.boxAt(0.7, 0.7, 0.7, 5.0, 0, -3.5, C.woodLight, 0.1); S.boxAt(0.6, 0.55, 0.6, 5.1, 0.7, -3.45, C.woodLight, -0.2); S.boxAt(0.7, 0.6, 0.7, 5.9, 0, -3.7, C.wood, 0.3);
  solid(4.55, -4.2, 6.35, -3.05);
  S.cyl(0.32, 0.3, 0.9, 7.6, 0, -3.1, C.woodDark, 10); S.cyl(0.33, 0.33, 0.04, 7.6, 0.2, -3.1, C.metal, 10); S.cyl(0.33, 0.33, 0.04, 7.6, 0.7, -3.1, C.metal, 10);
  solid(7.28, -3.42, 7.92, -2.78);
  // corridor
  for (let x = -9.4; x < 9.5; x += 4.7) rug(x, -6.45, x + 3.8, -5.55, C.rugBlue);
  S.box(3.0, 0, -6.93, 4.2, 0.8, -6.58, C.wood); solid(3.0, -6.93, 4.2, -6.58);
  S.cyl(0.07, 0.09, 0.3, 3.6, 0.8, -6.75, 0x7a8aa0, 8);
  S.box(-9.6, 0, -6.93, -8.6, 0.8, -6.58, C.wood); solid(-9.6, -6.93, -8.6, -6.58);
  painting(-3.0, -5.07, 'n', 0.8, 0.6, 0x6a4a3a); painting(4.5, -5.07, 'n', 0.6, 0.8, 0x4a5a3a); painting(-8.0, -5.07, 'n', 0.7, 0.5, 0x3a3a5a);
  painting(9.85, -6.0, 'w', 0.8, 0.6, 0x7a5a3a);
  ceilingLamp(-6, -6); ceilingLamp(0, -6); ceilingLamp(6, -6);
  // library
  bookcase(-9.85, -13.6, -9.45, -7.4, false, 11);
  bookcase(-9.4, -13.85, -4.3, -13.45, true, 97);
  table(-6.9, -9.6, -5.5, -8.9, 0.76, C.woodDark, C.woodDark);
  S.box(-6.5, 0.76, -9.4, -6.2, 0.8, -9.2, 0xd8d0b0); S.cyl(0.05, 0.08, 0.35, -5.75, 0.76, -9.4, C.frameGold, 8);
  chair(-6.2, -8.4, Math.PI, C.fabricRed);
  S.boxAt(0.8, 0.45, 0.8, -8.2, 0, -11.3, C.fabricRed, 0.6); { const b = new THREE.BoxGeometry(0.8, 0.6, 0.18); b.translate(0, 0.75, -0.33); b.rotateY(0.6); b.translate(-8.2, 0, -11.3); S.add(b, C.fabricRed); }
  solid(-8.7, -11.8, -7.7, -10.8);
  S.cyl(0.02, 0.02, 1.5, -8.9, 0, -12.2, C.metal, 6); S.cyl(0.15, 0.22, 0.25, -8.9, 1.5, -12.2, 0xc8b890, 10); solid(-9.05, -12.35, -8.75, -12.05);
  rug(-8.6, -12.6, -5.2, -10.2, C.rugGreen);
  ceilingLamp(-7, -10.5);
  // side corridor
  rug(-3.6, -13.5, -2.4, -8.0, C.rugRed);
  S.box(-3.93, 1.0, -9.2, -3.9, 2.0, -8.4, 0x3a4658);                           // mirror
  S.cyl(0.03, 0.03, 1.8, -2.4, 0, -13.5, C.woodDark, 6); solid(-2.55, -13.65, -2.25, -13.35);
  // living room
  S.box(0.4, 0, -13.85, 2.6, 1.2, -13.3, C.brick); S.box(0.25, 1.2, -13.9, 2.75, 1.3, -13.2, C.woodDark);
  S.box(0.9, 0.1, -13.32, 2.1, 0.8, -13.28, C.soot); solid(0.4, -13.85, 2.6, -13.2);
  G.box(1.1, 0.1, -13.4, 1.9, 0.22, -13.3, GLOW.ember);
  painting(1.5, -13.85, 's', 1.2, 0.8, 0x6a5a3a);
  S.box(-0.1, 0, -10.4, 3.1, 0.45, -9.6, C.fabric); S.box(-0.1, 0.45, -9.8, 3.1, 0.95, -9.6, C.fabric);
  S.box(-0.25, 0, -10.4, -0.1, 0.65, -9.6, C.fabric); S.box(3.1, 0, -10.4, 3.25, 0.65, -9.6, C.fabric); solid(-0.25, -10.4, 3.25, -9.6);
  table(0.9, -12.1, 2.1, -11.4, 0.42, C.wood, C.woodDark);
  chair(-1.0, -11.6, Math.PI / 2, C.fabricRed); chair(4.0, -11.6, -Math.PI / 2, C.fabricRed);
  S.box(-1.85, 0, -13.85, -1.35, 2.0, -13.45, C.woodDark); S.cyl(0.14, 0.14, 0.02, -1.6, 1.6, -13.44, 0xd8d0b0, 12); solid(-1.85, -13.85, -1.35, -13.45);  // clock
  S.box(4.3, 0, -8.0, 4.85, 0.7, -7.3, C.wood); solid(4.3, -8.0, 4.85, -7.3);                                                                                  // side table
  rug(-0.6, -12.9, 3.6, -10.6, C.rugBlue);
  painting(4.93, -9.5, 'w', 0.7, 0.9, 0x3a5a6a);
  ceilingLamp(1.5, -10.5);
  // bedroom
  S.box(6.8, 0, -13.85, 8.8, 0.5, -11.6, C.woodDark); S.box(6.85, 0.5, -13.8, 8.75, 0.62, -11.65, C.bed);
  S.box(6.9, 0.62, -13.75, 8.7, 0.68, -12.1, 0x5a6a8a); S.box(6.95, 0.62, -13.8, 7.75, 0.75, -13.4, 0xe0dcd0); S.box(7.85, 0.62, -13.8, 8.65, 0.75, -13.4, 0xe0dcd0);
  S.box(6.8, 0, -13.9, 8.8, 1.15, -13.82, C.woodDark); solid(6.8, -13.9, 8.8, -11.6);
  for (const x of [6.25, 9.35]) { S.box(x - 0.25, 0, -13.85, x + 0.25, 0.55, -13.35, C.wood); solid(x - 0.25, -13.85, x + 0.25, -13.35); }
  S.box(9.25, 0, -10.2, 9.85, 2.1, -8.6, C.woodDark); S.box(9.23, 0.1, -9.41, 9.25, 2.0, -9.39, C.trim);
  S.box(9.21, 1.0, -9.55, 9.23, 1.15, -9.5, C.knob); S.box(9.21, 1.0, -9.3, 9.23, 1.15, -9.25, C.knob); solid(9.25, -10.2, 9.85, -8.6);
  S.box(5.15, 0, -9.6, 5.6, 0.9, -8.2, C.wood); S.box(5.1, 0.9, -9.65, 5.65, 0.94, -8.15, C.woodDark); solid(5.15, -9.65, 5.65, -8.15);
  rug(6.5, -11.4, 9.0, -9.0, C.rugGreen);
  painting(5.07, -12.4, 'e', 0.6, 0.6, 0x6a3a4a);
  ceilingLamp(7.8, -10.5);

  // ---------- yard ----------
  for (let i = 0; i < 9; i++) {                                                  // stepping stones to the van
    const t = i / 8, x = 0 + (2.6 - 0) * t + Math.sin(i * 1.7) * 0.15, z = 0.8 + 6.0 * t;
    S.boxAt(0.55, 0.03, 0.45, x, 0, z, C.path, i * 0.7);
  }
  S.box(-0.9, 0, 0.15, 0.9, 0.18, 0.7, C.stone); // back step
  // fence around the lot
  const fence = (x0, z0, x1, z1) => {
    const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0;
    for (let p = 0; p <= len + 0.01; p += 2) S.boxAt(0.1, 1.2, 0.1, alongX ? x0 + p : x0, 0, alongX ? z0 : z0 + p, C.fence);
    for (const y of [0.45, 1.0]) {
      if (alongX) S.box(x0, y, z0 - 0.03, x1, y + 0.1, z0 + 0.03, C.fence);
      else S.box(x0 - 0.03, y, z0, x0 + 0.03, y + 0.1, z1, C.fence);
    }
    world.addBox(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05);
  };
  fence(LOT.minX, LOT.maxZ, LOT.maxX, LOT.maxZ); fence(LOT.minX, LOT.minZ, LOT.maxX, LOT.minZ);
  fence(LOT.minX, LOT.minZ, LOT.minX, LOT.maxZ); fence(LOT.maxX, LOT.minZ, LOT.maxX, LOT.maxZ);
  // trees
  for (const [x, z, s] of [[-12, 10, 1], [-13, 3, 0.8], [12.5, 12, 1.1], [13, -4, 0.9], [-13, -12, 1.2], [11, -17, 1], [-6, 13, 0.9], [9, 13.5, 0.8]]) {
    S.cyl(0.12 * s, 0.18 * s, 1.6 * s, x, 0, z, C.bark, 6);
    S.cyl(0, 1.3 * s, 2.2 * s, x, 1.2 * s, z, C.leaves, 7);
    S.cyl(0, 1.0 * s, 1.8 * s, x, 2.4 * s, z, C.leaves2, 7);
    solid(x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s);
  }
  // bushes along the house
  for (const x of [-8, -4.5, 4, 8]) { S.cyl(0.5, 0.6, 0.8, x, 0, 0.8, C.leaves2, 7); solid(x - 0.5, 0.3, x + 0.5, 1.3); }
  // yard lamp
  S.cyl(0.05, 0.07, 2.9, 0.6, 0, 5.6, C.pole, 6); S.boxAt(0.3, 0.25, 0.3, 0.6, 2.9, 5.6, C.pole);
  G.box(0.47, 2.92, 5.47, 0.73, 3.12, 5.73, GLOW.lamp);
  solid(0.5, 5.5, 0.7, 5.7);
  // van: body along Z, rear doors open towards the house
  {
    const x0 = 3.4, x1 = 5.4, z0 = 7.8, z1 = 12.8;
    S.box(x0, 0.35, z0, x1, 2.2, z1 - 1.3, C.van);                                 // cargo box
    S.box(x0 + 0.05, 0.35, z1 - 1.3, x1 - 0.05, 1.6, z1, C.van);                    // cab
    S.box(x0 + 0.1, 1.6, z1 - 1.3, x1 - 0.1, 1.95, z1 - 0.5, C.van);
    G.box(x0 + 0.15, 1.2, z1 + 0.001, x1 - 0.15, 1.55, z1 + 0.01, 0x0e1420);
    S.box(x0 - 0.01, 1.2, z1 - 1.2, x0, 1.55, z1 - 0.3, C.glass); S.box(x1, 1.2, z1 - 1.2, x1 + 0.01, 1.55, z1 - 0.3, C.glass);
    S.box(x0 - 0.01, 1.0, z0 + 0.3, x0, 1.25, z1 - 1.4, C.vanStripe); S.box(x1, 1.0, z0 + 0.3, x1 + 0.01, 1.25, z1 - 1.4, C.vanStripe);
    S.box(x0 + 0.1, 0.36, z0 + 0.02, x1 - 0.1, 0.4, z1 - 1.4, C.woodDark);          // cargo floor (inside)
    S.box(x0 + 0.1, 2.1, z0 + 0.05, x1 - 0.1, 2.12, z1 - 1.35, 0x3a3c40);
    // hollow: dark interior seen through the open rear
    G.box(x0 + 0.08, 0.4, z0 + 0.3, x1 - 0.08, 2.1, z0 + 0.32, 0x07090d);
    for (const [x, z] of [[x0 + 0.05, z0 + 0.9], [x1 - 0.05, z0 + 0.9], [x0 + 0.05, z1 - 0.8], [x1 - 0.05, z1 - 0.8]]) {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12); g.rotateZ(Math.PI / 2); g.translate(x, 0.36, z); S.add(g, C.tyre);
    }
    // open rear doors, swung out ~110°
    for (const s of [-1, 1]) {
      const hx = s < 0 ? x0 : x1;
      const g = new THREE.BoxGeometry(0.98, 1.8, 0.05); g.translate(-s * 0.49, 1.3, 0);
      g.rotateY(s * 1.9); g.translate(hx, 0, z0);
      S.add(g, C.van);
    }
    S.box(x0 + 0.3, 0.2, z0 - 0.35, x1 - 0.3, 0.3, z0, C.metal);                     // step / drop-off lip
    world.addBox(x0, z0, x1, z1);
  }
  // moon, far away, unaffected by fog
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: GLOW.moon, fog: false }));
  moon.position.set(-45, 38, 55);

  world.finalize();

  // ---------- meshes ----------
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const staticMesh = S.mesh(lit);
  staticMesh.name = 'level';
  staticMesh.matrixAutoUpdate = false;
  const glowMesh = G.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  glowMesh.name = 'glow';
  glowMesh.matrixAutoUpdate = false;

  const doorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const spec of doorSpecs) doors.push(new Door(spec, doorMat));

  const group = new THREE.Group();
  group.add(staticMesh, glowMesh, moon);
  for (const d of doors) group.add(d.mesh);
  return {
    group, world, doors, moon,
    triangles: staticMesh.geometry.index.count / 3 + glowMesh.geometry.index.count / 3,
    // Push a circle out of the static world and all door leaves. Returns [x, z].
    resolve(x, z, r) {
      [x, z] = world.resolveCircle(x, z, r);
      for (const d of doors) [x, z] = d.resolveCircle(x, z, r);
      return [x, z];
    },
  };
}

// ExtrudeGeometry is non-indexed; mergeGeometries needs all parts alike, so index it trivially.
function toIndexed(g) {
  const n = g.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  return g;
}

// ---------- doors ----------
const OPEN_ANGLE = 95 * Math.PI / 180;
const OPEN_TIME = 0.7;   // s for a full swing
const LEAF_T = 0.05;

class Door {
  constructor(spec, material) {
    this.locked = spec.locked;
    this.w = spec.w;
    this.hx = spec.hx; this.hz = spec.hz;
    this.base = spec.axis === 'x' ? 0 : -Math.PI / 2;  // leaf direction when closed: +X or +Z
    this.angle = 0;          // current swing, rad (sign = side)
    this.target = 0;
    const B = new Builder();
    const col = spec.front ? C.doorFront : C.door;
    B.box(0, 0.01, -LEAF_T / 2, this.w, DOOR_H - 0.02, LEAF_T / 2, col);
    for (const y of [0.25, 1.15]) for (const s of [-1, 1]) B.box(0.12, y, s * LEAF_T / 2, this.w - 0.12, y + 0.75, s * (LEAF_T / 2 + 0.012), 0x57402f);
    for (const s of [-1, 1]) B.box(this.w - 0.12, 0.98, s * (LEAF_T / 2), this.w - 0.07, 1.04, s * (LEAF_T / 2 + 0.06), C.knob);
    this.mesh = B.mesh(material);
    this.mesh.name = spec.locked ? 'door (locked)' : 'door';
    this.mesh.position.set(this.hx, 0, this.hz);
    this.mesh.rotation.y = this.base;
    // centre of the doorway, for picking the door to use
    this.cx = this.hx + (spec.axis === 'x' ? this.w / 2 : 0);
    this.cz = this.hz + (spec.axis === 'z' ? this.w / 2 : 0);
    this.tip = [0, 0];
    this.updateTip();
  }

  get open() { return this.target !== 0; }
  get moving() { return this.angle !== this.target; }

  // Open away from the one who uses it, or close. Returns 'open' | 'close' | 'locked'.
  toggle(fromX, fromZ) {
    if (this.locked) return 'locked';
    if (this.target !== 0) { this.target = 0; return 'close'; }
    // swinging by +90° points the leaf along (cos(b+90°), -sin(b+90°))
    const nx = Math.cos(this.base + Math.PI / 2), nz = -Math.sin(this.base + Math.PI / 2);
    const side = (fromX - this.hx) * nx + (fromZ - this.hz) * nz;
    this.target = side > 0 ? -OPEN_ANGLE : OPEN_ANGLE;
    return 'open';
  }

  update(dt) {
    if (this.angle === this.target) return;
    const step = (OPEN_ANGLE / OPEN_TIME) * dt;
    const d = this.target - this.angle;
    this.angle = Math.abs(d) <= step ? this.target : this.angle + Math.sign(d) * step;
    this.mesh.rotation.y = this.base + this.angle;
    this.updateTip();
  }

  updateTip() {
    const a = this.base + this.angle;
    this.tip[0] = this.hx + Math.cos(a) * this.w;
    this.tip[1] = this.hz - Math.sin(a) * this.w;
  }

  // circle vs the leaf (segment hinge-tip, thickened by half the leaf)
  resolveCircle(x, z, r) {
    const ax = this.hx, az = this.hz, ex = this.tip[0] - ax, ez = this.tip[1] - az;
    const len2 = ex * ex + ez * ez;
    let t = ((x - ax) * ex + (z - az) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t), dz = z - (az + ez * t);
    const d2 = dx * dx + dz * dz, rr = r + LEAF_T / 2;
    if (d2 >= rr * rr || d2 < 1e-12) return [x, z];
    const d = Math.sqrt(d2);
    return [x + dx / d * (rr - d), z + dz / d * (rr - d)];
  }
}
