// The mansion (map 2, wave W6): two floors, U-stairs, a garage, a garden and the alley with the van.
// Built from the numbers in ./layout.js with the blocks of ../kit.js. Same shape of result as the
// first map's buildLevel() (src/world/level.js) plus the floor functions (plan-W6 §2).
//
// The static geometry is three meshes: SA (always drawn: the outside of the house, the slab and roof,
// the hall band of both floors, the stairs, the garden), S0 (the rooms of the ground floor) and S1 (the
// rooms upstairs); the player's floor decides which of S0 / S1 is drawn (plan-W6 §6). The doors are
// one instanced mesh (one draw call for all 21).
import * as THREE from 'three';
import { CollisionWorld } from '../collision.js';
import { Builder, Door, C } from '../level.js';
import { Floors } from '../floors.js';
import { wallKit, fence, lampPost, van, WALL_H, EXT_T, INT_T } from '../kit.js';
import { FLOOR_Y, LOT, HOUSE, ROOMS, OUTSIDE, LINKS, WELL_NAME, STAIRS, SPAWN, BOARD, VAN, DROP, VAN_ZONE, LIGHTS, LAMPS, LAMP_LIST, WARDROBE, NAV_NODES, NAV_STAIRS } from './layout.js';
// the crate of the second lurker: in the garage by the gate, its lid pops up in the telegraph
const CRATE = { x: 12.2, z: 0.2, y0: 0, kind: 'crate', size: 0.9, minZ: -0.25, maxZ: 0.65 };
import { mansion as MCFG } from '../../config/mansion.js';
import { furnish } from './furniture.js';
import { CFG } from '../../config/index.js';

const CFG_HEARING = CFG.hearing;
import { S as TEXT } from '../../i18n/index.js';

const GLOW = { window: 0x2b3f6b, lamp: 0xffd9a0, moon: 0xdfe8ff };
const SLAB_T = FLOOR_Y[1] - WALL_H;   // the floor-2 slab: 0.3 m
const SLAB_MID = WALL_H + SLAB_T / 2;
const LEAF_W = 0.96;   // the door leaf geometry is built for this width; other widths are scaled

// One instanced mesh for every door: the leaf geometry of src/world/level.js's Door at width
// LEAF_W, one instance per door, its matrix refreshed before each render from the door's swing.
function instancedDoors(doors, material) {
  const B = new Builder(), LEAF_T = 0.05, DOOR_H = 2.1;
  B.box(0, 0.01, -LEAF_T / 2, LEAF_W, DOOR_H - 0.02, LEAF_T / 2, C.door);
  for (const y of [0.25, 1.15]) for (const s of [-1, 1]) B.box(0.12, y, s * LEAF_T / 2, LEAF_W - 0.12, y + 0.75, s * (LEAF_T / 2 + 0.012), 0x57402f);
  for (const s of [-1, 1]) B.box(LEAF_W - 0.12, 0.98, s * (LEAF_T / 2), LEAF_W - 0.07, 1.04, s * (LEAF_T / 2 + 0.06), C.knob);
  const leaf = B.mesh(material);
  const mesh = new THREE.InstancedMesh(leaf.geometry, material, doors.length);
  mesh.name = 'doors';
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const last = new Float32Array(doors.length).fill(NaN);
  const refresh = () => {
    let changed = false;
    doors.forEach((d, i) => {
      const a = d.base + d.angle;
      if (a === last[i]) return;
      last[i] = a; changed = true;
      q.setFromAxisAngle(up, a); p.set(d.hx, d.y0, d.hz); sc.set(d.w / LEAF_W, 1, 1);
      mesh.setMatrixAt(i, m.compose(p, q, sc));
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  };
  refresh();
  mesh.onBeforeRender = refresh;
  return mesh;
}

export function buildMansion() {
  const SA = new Builder(), S0 = new Builder(), S1 = new Builder();   // static, lit: always / ground floor / upstairs
  const S = SA;              // the default for everything seen from both floors
  const G = new Builder();   // glow, unlit
  const floors = new Floors({ levels: FLOOR_Y, ramps: STAIRS.ramps, flats: STAIRS.flats });
  const worlds = FLOOR_Y.map(() => new CollisionWorld(LOT));   // everything a body bumps into, per floor
  const walls = FLOOR_Y.map(() => new CollisionWorld(LOT));    // walls and fence only: sound, line of sight
  const furniture = [];    // { minX, minZ, maxX, maxZ, h, top, floor } absolute heights, for cover and landing
  const doorSpecs = [];
  const solidOn = (f) => (x0, z0, x1, z1) => { worlds[f].addBox(x0, z0, x1, z1); walls[f].addBox(x0, z0, x1, z1); };
  // a block a body walks around (and hides behind) on floor f; h and top relative to that floor
  const block = (f, x0, z0, x1, z1, h, top = h) => {
    const y0 = FLOOR_Y[f];
    const b = { minX: Math.min(x0, x1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxZ: Math.max(z0, z1), h: y0 + h, top: top == null ? null : y0 + top, floor: f };
    worlds[f].addBox(b.minX, b.minZ, b.maxX, b.maxZ);
    furniture.push(b);
    return b;
  };
  const rail = (f, x0, z0, x1, z1) => worlds[f].addEdge(x0, z0, x1, z1);   // a line a body cannot cross
  const K0 = wallKit(SA, solidOn(0), doorSpecs, FLOOR_Y[0], 0), R0 = wallKit(S0, solidOn(0), doorSpecs, FLOOR_Y[0], 0);   // band / rows
  const K1 = wallKit(SA, solidOn(1), doorSpecs, FLOOR_Y[1], 1), R1 = wallKit(S1, solidOn(1), doorSpecs, FLOOR_Y[1], 1);
  const H = HOUSE;

  // ---------- ground floor walls ----------
  K0.wallX(-18, H.minX, H.maxX, EXT_T, C.wallExt);
  K0.wallX(0, H.minX, 4, EXT_T, C.wallExt, [{ c: -4.5, w: 1.0, door: 'locked', front: true }]);   // front door, locked
  K0.wallX(1.5, 4, H.maxX, EXT_T, C.wallExt);                                                   // garage south wall
  K0.wallZ(H.minX, -18, 0, EXT_T, C.wallExt);
  K0.wallZ(4, 0, 1.5, EXT_T, C.wallExt);
  K0.wallZ(13, -18, 1.5, EXT_T, C.wallExt, [{ c: -15, w: 1.0, door: 'normal' }, { c: -1.5, w: 2.6, door: 'normal' }]);   // back door, garage gate
  K0.wallX(-12, -13, 13, INT_T, C.wallInt, [{ c: -8, w: 1.0, door: 'normal' }, { c: -1, w: 1.6 }, { c: 3, w: 1.0, door: 'normal' }, { c: 6.5, w: 1.0, door: 'normal' }]);
  K0.wallX(-5, -13, 13, INT_T, C.wallInt, [{ c: -4.5, w: 1.6 }, { c: 5.5, w: 1.0, door: 'normal' }]);
  R0.wallZ(-6, -18, -12, INT_T, C.wallpaperLib, [{ c: -15, w: 1.4 }]);
  R0.wallZ(0, -18, -12, INT_T, C.wallInt);
  R0.wallZ(6, -18, -12, INT_T, C.wallInt, [{ c: -15, w: 1.4 }]);
  K0.wallZ(-9, -12, -5, INT_T, C.wallInt, [{ c: -8.5, w: 1.0, door: 'normal' }]);
  K0.wallZ(-7, -12, -5, INT_T, C.wallInt, [{ c: -6.2, w: 1.4 }]);
  K0.wallZ(7, -12, -5, INT_T, C.wallInt, [{ c: -8.5, w: 1.0, door: 'normal' }]);
  R0.wallZ(-7, -5, 0, INT_T, C.wallInt, [{ c: -2.5, w: 1.0, door: 'normal' }]);
  R0.wallZ(-2, -5, 0, INT_T, C.wallInt);
  R0.wallZ(4, -5, 0, INT_T, C.wallInt, [{ c: -2.5, w: 1.0, door: 'normal' }]);

  // ---------- upstairs walls (y = 3) ----------
  K1.wallX(-18, H.minX, H.maxX, EXT_T, C.wallExt);
  K1.wallX(0, H.minX, H.maxX, EXT_T, C.wallExt, [{ c: -8, w: 1.0, door: 'normal' }]);   // balcony door
  K1.wallZ(H.minX, -18, 0, EXT_T, C.wallExt);
  K1.wallZ(13, -18, 0, EXT_T, C.wallExt);
  K1.wallX(-12, -13, 13, INT_T, C.wallpaperBed, [{ c: -8, w: 1.0, door: 'normal' }, { c: -0.5, w: 1.0, door: 'normal' }, { c: 5, w: 1.0, door: 'normal' }, { c: 10.5, w: 1.0, door: 'normal' }]);
  K1.wallX(-5, -13, 13, INT_T, C.wallInt, [{ c: -8, w: 1.0, door: 'normal' }, { c: -1, w: 1.0, door: 'normal' }, { c: 9, w: 1.0, door: 'normal' }]);
  R1.wallZ(-6, -18, -12, INT_T, C.wallpaperBed, [{ c: -15, w: 0.9, door: 'normal' }]);
  R1.wallZ(-3, -18, -12, INT_T, C.wallInt);
  R1.wallZ(2, -18, -12, INT_T, C.wallInt);
  R1.wallZ(8, -18, -12, INT_T, C.wallInt);
  K1.wallZ(-9, -12, -5, INT_T, C.wallInt, [{ c: -7, w: 1.0, door: 'normal' }]);
  K1.wallZ(-7, -12, -5, INT_T, C.wallInt, [{ c: -6.2, w: 1.4 }]);
  R1.wallZ(-5, -5, 0, INT_T, C.wallInt);
  R1.wallZ(5, -5, 0, INT_T, C.wallInt);

  // ---------- floors, the slab, the roof ----------
  S.box(-30, -0.1, -30, 30, 0, 36, C.grass);                                      // ground
  S.box(H.minX, 0, H.minZ, H.maxX, 0.012, 0.15, C.planksB);                       // ground floor
  S.box(4, 0, 0, H.maxX, 0.012, H.maxZ, C.stone);                                 // garage floor
  const W = STAIRS.well, y1 = FLOOR_Y[1];
  // the floor-2 slab (ceiling of floor 1 / floor of floor 2) in four pieces around the stair well
  for (const [x0, z0, x1, z1] of [
    [H.minX, H.minZ, H.maxX, W.minZ], [H.minX, W.maxZ, H.maxX, 0.15], [H.minX, W.minZ, W.minX, W.maxZ], [W.maxX, W.minZ, H.maxX, W.maxZ],
  ]) S.box(x0, WALL_H, z0, x1, y1, z1, C.ceiling);
  S.box(H.minX, y1, H.minZ, H.maxX, y1 + 0.012, 0.15, C.planksA);                  // upstairs floor (over the slab)
  S.box(4, WALL_H, 0, H.maxX, WALL_H + 0.25, H.maxZ, C.roof);                      // garage roof
  S.box(H.minX - 0.2, y1 + WALL_H, H.minZ - 0.2, H.maxX + 0.2, y1 + WALL_H + 0.25, 0.35, C.roof);   // flat roof
  for (const [x0, z0, x1, z1] of [[H.minX - 0.2, H.minZ - 0.2, H.maxX + 0.2, H.minZ], [H.minX - 0.2, 0.15, H.maxX + 0.2, 0.35], [H.minX - 0.2, H.minZ, H.minX, 0.35], [H.maxX, H.minZ, H.maxX + 0.2, 0.35]]) {
    S.box(x0, y1 + WALL_H + 0.25, z0, x1, y1 + WALL_H + 0.7, z1, C.wallExt);        // parapet
  }

  // ---------- the stairs (plan-W6 §2.2): a ramp under visible steps ----------
  {
    const F1 = STAIRS.flight1, F2 = STAIRS.flight2, L = STAIRS.landing, n = STAIRS.steps;
    const rise = L.y / n, run = (F1.maxZ - F1.minZ) / n;
    for (let i = 0; i < n; i++) {   // flight 1: rises north; each step is a solid block from the floor
      S.box(F1.minX, 0, F1.maxZ - run * (i + 1), F1.maxX, rise * (i + 1), F1.maxZ - run * i, i % 2 ? C.woodDark : C.wood);
    }
    S.box(L.minX, 0, L.minZ, L.maxX, L.y, L.maxZ, C.woodDark);                     // the landing, solid underneath
    for (let i = 0; i < n; i++) {   // flight 2: rises south from the landing
      S.box(F2.minX, 0, F2.minZ + run * i, F2.maxX, L.y + rise * (i + 1), F2.minZ + run * (i + 1), i % 2 ? C.woodDark : C.wood);
    }
    // solid underneath: a body on the ground floor walks around flight 2; the landing is reached
    // from the top of flight 1 only (its east side is fenced below), and it blocks the view
    block(0, F2.minX, F2.minZ, F2.maxX, F2.maxZ, y1, null);
    rail(0, L.maxX, L.minZ, L.maxX, L.maxZ);
    furniture.push({ minX: L.minX, minZ: L.minZ, maxX: L.maxX, maxZ: L.maxZ, h: L.y, top: null, floor: 0 });
    rail(0, F1.minX, F1.minZ, F1.minX, F1.maxZ);                                   // flight 1: no stepping off its west edge
    // upstairs: the well is fenced by a solid parapet 1 m high; the flights keep their rails
    const par = (x0, z0, x1, z1, yb) => { S.box(Math.min(x0, x1) - 0.04, yb, Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, yb + 1.0, Math.max(z0, z1) + 0.04, C.trim); rail(1, x0, z0, x1, z1); };
    par(L.maxX, L.minZ, L.maxX, F2.maxZ - 0.6, y1);   // east edge of the landing and flight 2 (open for the last 0.6 m at the top, where it is at most 0.3 m below the gallery)
    par(F1.minX, F1.maxZ, F1.maxX, F1.maxZ, y1);      // over the bottom of flight 1
    rail(1, L.minX, L.minZ, L.minX, F1.maxZ);          // west edge (the wall is just beyond); the north edge is the wall
    // the wall between the flights, from the landing up
    S.box(F2.minX - 0.04, L.y, F2.minZ, F2.minX + 0.04, y1 + 1.0, F2.maxZ, C.trim);
    rail(1, F2.minX, F2.minZ, F2.minX, F2.maxZ);
    // handrail posts along the flights
    for (let i = 0; i <= n; i += 2) {
      S.boxAt(0.05, 0.9, 0.05, F1.minX + 0.1, rise * i, F1.maxZ - run * i, C.trim);
      S.boxAt(0.05, 0.9, 0.05, F2.maxX - 0.1, L.y + rise * i, F2.minZ + run * i, C.trim);
    }
  }

  // ---------- balcony (upstairs, over the garden) ----------
  {
    const B = ROOMS.find((r) => r.name === TEXT.mansion.rooms.balcony);
    S.box(B.minX, y1 - 0.15, B.minZ, B.maxX, y1 + 0.012, B.maxZ, C.stone);
    for (const [x0, z0, x1, z1] of [[B.minX, B.maxZ, B.maxX, B.maxZ], [B.minX, B.minZ, B.minX, B.maxZ], [B.maxX, B.minZ, B.maxX, B.maxZ]]) {
      S.box(Math.min(x0, x1) - 0.04, y1, Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, y1 + 1.0, Math.max(z0, z1) + 0.04, C.trim);
      rail(1, x0, z0, x1, z1);
    }
    for (const x of [B.minX, B.maxX]) S.box(x - 0.08, 0, B.maxZ - 0.08, x + 0.08, y1, B.maxZ + 0.08, C.wallExt);   // posts under it
  }

  // ---------- the wardrobe of the lurker (master bedroom, upstairs) ----------
  {
    const w = WARDROBE;
    S1.box(w.x, w.y0, w.minZ, w.x + 0.7, w.y0 + 2.2, w.maxZ, C.woodDark);
    S1.box(w.x - 0.01, w.y0, w.minZ - 0.01, w.x + 0.71, w.y0 + 0.02, w.maxZ + 0.01, C.wood);
    block(1, w.x, w.minZ, w.x + 0.7, w.maxZ, 2.2, null);
  }

  // ---------- the crate of the second lurker (garage) ----------
  {
    const c = CRATE, s = c.size;
    S0.box(c.x - s / 2, 0, c.z - s / 2, c.x + s / 2, s * 0.8, c.z + s / 2, C.woodLight);
    for (const z of [c.z - s / 2, c.z + s / 2 - 0.06]) S0.box(c.x - s / 2, s * 0.3, z, c.x + s / 2, s * 0.36, z + 0.06, C.woodDark);
    block(0, c.x - s / 2, c.z - s / 2, c.x + s / 2, c.z + s / 2, s * 0.85, null);
  }

  // ---------- furniture (./furniture.js) ----------
  furnish({ S0, S1, SA, G, block }, FLOOR_Y);

  // ---------- glow: windows on the facades, a chandelier in the hall ----------
  for (const [x0, z0, x1, z1] of [[-10.5, -18.14, -8.5, -18.16], [-3.5, -18.14, -1.5, -18.16], [2.5, -18.14, 4.5, -18.16], [8.5, -18.14, 10.5, -18.16], [-10.5, 0.14, -8.5, 0.16]]) {
    for (const yb of [0.9, y1 + 0.9]) G.box(x0, yb, z0, x1, yb + 1.2, z1, GLOW.window);
  }
  G.box(-0.25, 2.35, -8.75, 0.25, 2.45, -8.25, GLOW.lamp);

  // ---------- garden and the alley ----------
  for (const [x0, z0, x1, z1] of [[LOT.minX, LOT.maxZ, LOT.maxX, LOT.maxZ], [LOT.minX, LOT.minZ, LOT.maxX, LOT.minZ], [LOT.minX, LOT.minZ, LOT.minX, LOT.maxZ], [LOT.maxX, LOT.minZ, LOT.maxX, LOT.maxZ]]) {
    fence(S, solidOn(0), x0, z0, x1, z1);
  }
  const hedge = (x0, z0, x1, z1) => { S.box(x0, 0, z0, x1, 1.4, z1, C.leaves); block(0, x0, z0, x1, z1, 1.4, null); };
  hedge(-12, 5.5, -2, 6.5); hedge(2, 5.5, 12, 6.5); hedge(-16, 11.5, -8, 12.5); hedge(8, 11.5, 16, 12.5); hedge(-6, 17.5, 6, 18.5);
  // under the balcony: a lower hedge you can land loot on (a soft landing: much slower, but a rustle)
  { const [x0, z0, x1, z1] = [-10.5, 2.2, -5.5, 3.2]; S.box(x0, 0, z0, x1, 1.0, z1, C.leaves); block(0, x0, z0, x1, z1, 1.0, 1.0); }
  const SOFT = [{ minX: -10.5, maxX: -5.5, minZ: 2.2, maxZ: 3.2, k: MCFG.balcony.softK, noise: MCFG.balcony.rustle }];
  S.cyl(1.5, 1.6, 0.6, 0, 0, 13, C.stone, 14); S.cyl(0.15, 0.2, 1.2, 0, 0.6, 13, C.stone, 8);   // fountain
  block(0, -1.6, 11.4, 1.6, 14.6, 0.6, null);
  const MASK = [{ x: 0, z: 13, r: MCFG.fountain.maskR }];   // the fountain hides your steps near it (a guard beside it hears less)
  {   // gazebo with the heavy statue (a stand-in until W5)
    const gx = 14, gz = 20;
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { S.cyl(0.08, 0.1, 2.6, gx + dx, 0, gz + dz, C.wood, 6); block(0, gx + dx - 0.1, gz + dz - 0.1, gx + dx + 0.1, gz + dz + 0.1, 2.6, null); }
    S.box(gx - 2, 2.6, gz - 2, gx + 2, 2.75, gz + 2, C.roof);
    block(0, gx - 0.5, gz - 0.5, gx + 0.5, gz + 0.5, 1.7, null);   // the heavy statue stands here (a loot item nobody can lift yet)
  }
  {   // shed (a hiding pocket with a door) and the greenhouse
    const Ks = wallKit(S, solidOn(0), doorSpecs, 0, 0, 2.3);
    Ks.wallX(18, -19, -15, 0.1, C.fence); Ks.wallX(21, -19, -15, 0.1, C.fence, [{ c: -17, w: 1.0, door: 'normal' }]); Ks.wallZ(-19, 18, 21, 0.1, C.fence); Ks.wallZ(-15, 18, 21, 0.1, C.fence);
    S.box(-19.2, 2.3, 17.8, -14.8, 2.45, 21.2, C.roof);
    const Kg = wallKit(S, solidOn(0), [], 0, 0, 2.2);
    Kg.wallX(6, 14, 19, 0.06, C.glass); Kg.wallX(10, 14, 19, 0.06, C.glass, [{ c: 16.5, w: 1.0 }]); Kg.wallZ(14, 6, 10, 0.06, C.glass); Kg.wallZ(19, 6, 10, 0.06, C.glass);
    S.box(13.9, 2.2, 5.9, 19.1, 2.3, 10.1, C.glass);
  }
  for (const [x, z, s] of [[-18, -8, 1.1], [-18, 2, 0.9], [19, 24, 1], [-14, 26, 1.2], [6, 27, 0.9], [-19, 14, 0.8], [20, -18, 1]]) {   // trees
    S.cyl(0.12 * s, 0.18 * s, 1.6 * s, x, 0, z, C.bark, 6);
    S.cyl(0, 1.3 * s, 2.2 * s, x, 1.2 * s, z, C.leaves, 7);
    S.cyl(0, 1.0 * s, 1.8 * s, x, 2.4 * s, z, C.leaves2, 7);
    block(0, x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s, 3.5, null);
  }
  for (let i = 0; i < 12; i++) S.boxAt(0.55, 0.03, 0.45, -4.5 + Math.sin(i * 1.7) * 0.2, 0, 1.0 + i * 1.1, C.path, i * 0.7);   // path from the front door
  S.box(13.3, 0, -20, 21.5, 0.01, 1.5, C.path);                                                                          // the alley
  lampPost(S, G, (x0, z0, x1, z1, h, top) => block(0, x0, z0, x1, z1, h, top), 15.5, -4.0);
  lampPost(S, G, (x0, z0, x1, z1, h, top) => block(0, x0, z0, x1, z1, h, top), 0, 12);
  lampPost(S, G, (x0, z0, x1, z1, h, top) => block(0, x0, z0, x1, z1, h, top), -10, 20);

  // the van in the alley, rear doors towards the drop-off ring
  const V = van(S, G, VAN.x, VAN.z, VAN.yaw);
  worlds[0].addBox(V.body.minX, V.body.minZ, V.body.maxX, V.body.maxZ);
  furniture.push({ ...V.body, h: 2.2, top: null, floor: 0 });
  const CARGO = { ...V.cargo, rear: 'max' };   // the rear doors face +Z: the first places are at maxZ
  // scoreboard stand (the board itself is ui/board.js)
  S.cyl(0.03, 0.03, 1.1, BOARD.x, 0, BOARD.z, C.pole, 6);
  S.cyl(0.25, 0.25, 0.03, BOARD.x, 0, BOARD.z, C.pole, 10);
  block(0, BOARD.x - 0.25, BOARD.z - 0.25, BOARD.x + 0.25, BOARD.z + 0.25, 1.9, null);

  // moon, far away, unaffected by fog
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: GLOW.moon, fog: false }));
  moon.position.set(-45, 38, 55);

  for (const w of worlds) w.finalize();
  for (const w of walls) w.finalize();

  // ---------- meshes ----------
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshA = SA.mesh(lit), mesh0 = S0.mesh(lit), mesh1 = S1.mesh(lit);
  meshA.name = 'level'; mesh0.name = 'level: ground floor'; mesh1.name = 'level: upstairs';
  for (const m of [meshA, mesh0, mesh1]) m.matrixAutoUpdate = false;
  const glowMesh = G.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  glowMesh.name = 'glow';
  glowMesh.matrixAutoUpdate = false;
  const doorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const doors = doorSpecs.map((spec) => new Door(spec, doorMat));   // their own meshes stay unused: one instanced mesh draws all of them
  const doorMesh = instancedDoors(doors, doorMat);
  const group = new THREE.Group();
  group.add(meshA, mesh0, mesh1, glowMesh, doorMesh, moon);
  const triangles = [meshA, mesh0, mesh1, glowMesh].reduce((n, m) => n + m.geometry.index.count / 3, 0);
  // rooms with the height band the flashlight mask lights (plan-W6 §2.5); the stair well is a
  // pseudo-room open through both floors
  const rooms = ROOMS.map((r) => ({ ...r, yMin: FLOOR_Y[r.floor] - 0.1, yMax: FLOOR_Y[r.floor] + WALL_H + 0.2 }));
  rooms.push({ name: WELL_NAME, floor: -1, minX: W.minX, maxX: W.maxX, minZ: W.minZ, maxZ: W.maxZ, yMin: -0.1, yMax: FLOOR_Y[1] + WALL_H });

  const surfaces = furniture.filter((b) => b.top != null);
  surfaces.push({ ...CARGO, top: CARGO.y });
  const floorIndex = (y) => floors.floorIndex(y);
  const inHouse = (x, z) => x > H.minX && x < H.maxX && z > H.minZ && z < H.maxZ;
  const BAL = ROOMS.find((r) => r.name === TEXT.mansion.rooms.balcony);
  // The ground under a falling thing at (x, z) that is at height maxY: the stairs and the landing
  // where they are; under the slab the floor at or below it; in the stair well, on the balcony's
  // outside and in the garden — the ground (loot thrown over a rail falls all the way down).
  const groundAt = (x, z, maxY) => {
    const r = floors.rampAt(x, z); if (r) return r.y;
    const f = floors.flatAt(x, z); if (f) return f.y;
    const onBalcony = x >= BAL.minX && x <= BAL.maxX && z >= BAL.minZ && z <= BAL.maxZ;
    if ((inHouse(x, z) && !inWell(x, z)) || onBalcony) return maxY >= FLOOR_Y[1] - 0.2 ? FLOOR_Y[1] : FLOOR_Y[0];
    return FLOOR_Y[0];
  };
  const RN = TEXT.rooms, MN = TEXT.mansion.rooms;
  const POCKETS = [RN.pantry, MN.boiler, MN.wardrobe, MN.attic].map((n) => ROOMS.find((r) => r.name === n)).map((r) => ({ name: r.name, floor: r.floor, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));
  POCKETS.push({ name: TEXT.mansion.rooms.shed, floor: 0, minX: -19, maxX: -15, minZ: 18, maxZ: 21 });
  const inWell = (x, z) => x >= W.minX && x <= W.maxX && z >= W.minZ && z <= W.maxZ;
  const roomAt = (x, z, y = 0) => {
    const f = floorIndex(y);
    for (const r of ROOMS) if (r.floor === f && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.name;
    return OUTSIDE[1];
  };
  // Line of sight on one floor: its walls, its closed doors, and furniture taller than the line.
  function losOnFloor(f, ax, ay, az, bx, by, bz) {
    if (walls[f].segmentBlocked(ax, az, bx, bz)) return true;
    for (const d of doors) if (d.floor === f && d.blocksSegment(ax, az, bx, bz)) return true;
    const dx = bx - ax, dz = bz - az, lowest = Math.min(ay, by);
    for (const b of furniture) {
      if (b.h < lowest - 1.2) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < b.minX || ax > b.maxX) continue; }
      else { let u0 = (b.minX - ax) / dx, u1 = (b.maxX - ax) / dx; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); }
      if (Math.abs(dz) < 1e-9) { if (az < b.minZ || az > b.maxZ) continue; }
      else { let v0 = (b.minZ - az) / dz, v1 = (b.maxZ - az) / dz; if (v0 > v1) [v0, v1] = [v1, v0]; t0 = Math.max(t0, v0); t1 = Math.min(t1, v1); }
      if (t0 > t1) continue;
      const y0 = ay + (by - ay) * t0, yy1 = ay + (by - ay) * t1;
      if (b.h > Math.min(y0, yy1) && FLOOR_Y[b.floor] <= Math.max(y0, yy1)) return true;
    }
    return false;
  }

  return {
    id: 'mansion', group, doors, furniture, moon, glowMaterial: glowMesh.material, triangles,
    world: worlds[0], walls: walls[0],   // as on the first map: the ground floor
    worlds, floors, rooms, links: LINKS, outside: OUTSIDE, house: HOUSE,
    spawn: SPAWN, board: BOARD, cargo: CARGO, dropZone: DROP, vanZone: VAN_ZONE, lights: LIGHTS, lamps: LAMPS, lampList: LAMP_LIST,
    floorMeshes: [mesh0, mesh1],
    // draw the rooms of floor f only (the hall band, the stairs and the outside are always drawn)
    setFloorVisible(f) { mesh0.visible = f === 0; mesh1.visible = f === 1; },
    wardrobe: WARDROBE, lurkers: [WARDROBE, CRATE], pockets: POCKETS, softZones: SOFT, maskZones: MASK, nav: { nodes: NAV_NODES, stairs: NAV_STAIRS, indoor: (n) => n[0] > H.minX && n[0] < H.maxX && n[1] > H.minZ && n[1] < H.maxZ },
    guard: MCFG.guard, guard2: MCFG.guard2, alarmPosts: MCFG.alarmPosts, items: MCFG.items,
    roomAt, floorIndex,
    floorY: (x, z, yHint = 0) => floors.floorY(x, z, yHint),
    onRamp: (x, z) => floors.onRamp(x, z),
    worldAt: (y) => worlds[floorIndex(y)],

    // Push a circle out of the static world of its floor and that floor's door leaves (the player).
    resolve(x, z, r, y = 0) {
      const f = floorIndex(y);
      [x, z] = worlds[f].resolveCircle(x, z, r);
      for (const d of doors) if (d.floor === f) [x, z] = d.resolveCircle(x, z, r);
      return [x, z];
    },
    resolveBody(x, z, r, y = 0) { return worlds[floorIndex(y)].resolveCircle(x, z, r); },
    // Walls, fence and door leaves only (flying loot). onContact(nx, nz, depth) per push.
    resolveWalls(x, z, r, onContact, y = 0) {
      const f = floorIndex(y);
      [x, z] = walls[f].resolveCircle(x, z, r, onContact);
      for (const d of doors) {
        if (d.floor !== f) continue;
        const [nx, nz] = d.resolveCircle(x, z, r);
        if (nx !== x || nz !== z) { if (onContact) { const l = Math.hypot(nx - x, nz - z); onContact((nx - x) / l, (nz - z) / l, l); } x = nx; z = nz; }
      }
      return [x, z];
    },
    // the soft zone under (x, z) (the hedge under the balcony), or null
    softAt(x, z) { for (const s of SOFT) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s; return null; },
    // Highest surface under (x, z) at or below maxY: the ground there (groundAt) or a furniture top.
    surfaceAt(x, z, maxY, margin = 0) {
      let best = groundAt(x, z, maxY);
      for (const b of surfaces) {
        if (b.top > maxY + 1e-3 || b.top <= best) continue;
        if (x >= b.minX + margin && x <= b.maxX - margin && z >= b.minZ + margin && z <= b.maxZ - margin) best = b.top;
      }
      return best;
    },
    // How much of a noise's radius reaches from a to b: 1 in the open, occludedK through a wall or a
    // closed door, floorK through the slab (through the stair well: as through a wall).
    soundK(ax, az, bx, bz, ay = 0, by = ay) {
      const fa = floorIndex(ay), fb = floorIndex(by);
      if (fa !== fb) {
        // the straight line between them crosses the well, or both are next to it: the sound goes round the slab
        const t = 0.5, mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
        const nearWell = (x, z) => x >= W.minX - 1.5 && x <= W.maxX + 1.5 && z >= W.minZ - 1.5 && z <= W.maxZ + 1.5;
        return inWell(mx, mz) || (nearWell(ax, az) && nearWell(bx, bz)) ? CFG_HEARING.occludedK : MCFG.hearing.floorK;
      }
      if (walls[fa].segmentBlocked(ax, az, bx, bz)) return CFG_HEARING.occludedK;
      for (const d of doors) if (d.floor === fa && d.blocksSegment(ax, az, bx, bz)) return CFG_HEARING.occludedK;
      return 1;
    },
    // Sound between two points goes through a wall or a closed door (of the floor the points are on).
    soundOccluded(ax, az, bx, bz, ay = 0, by = ay) {
      const f = floorIndex(ay);
      if (floorIndex(by) !== f) return true;
      if (walls[f].segmentBlocked(ax, az, bx, bz)) return true;
      for (const d of doors) if (d.floor === f && d.blocksSegment(ax, az, bx, bz)) return true;
      return false;
    },
    // Line of sight between eye a and target b: the floor-2 slab blocks it except through the stair
    // well; a line through the well is checked on each floor in turn.
    losBlocked(ax, ay, az, bx, by, bz) {
      if ((ay - SLAB_MID) * (by - SLAB_MID) < 0) {
        const t = (SLAB_MID - ay) / (by - ay), cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        if (!inWell(cx, cz)) return true;
        return losOnFloor(floorIndex(ay), ax, ay, az, cx, SLAB_MID, cz) || losOnFloor(floorIndex(by), cx, SLAB_MID, cz, bx, by, bz);
      }
      return losOnFloor(floorIndex(ay), ax, ay, az, bx, by, bz);
    },
    reset() { for (const d of doors) d.reset(); },
  };
}
