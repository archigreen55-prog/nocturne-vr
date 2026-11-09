// The dacha's yard and the lane (owner's decisions, claude/dacha-yard and claude/dacha-yard-near): a solid
// wooden fence — taller than a person — runs round the yard; its one gap is the wicket gate (хвіртка) in
// the south side. Right behind the gate is a dead-end lane and the van stands in it, rear to the fence,
// 13 m from the front door. From the yard the van cannot be seen (the fence stops the sight line, the
// guard never comes closer to the gate than LEASH), and from the van you cannot see the yard.
// From the van: the gate -> the garden (bushes, a low fence, the shed, the woodpile: cover; the lamps:
// circles where you are seen) -> the house. The guard comes out to the porch and the front of the garden
// (LEASH: enemies/patrol.js, systems/humanGuard.js) — not to the gate. tests/yard.test.mjs checks it.
// The gate itself is a door (creaks like one when swung quickly, silent when slow); the test opens it.
//
// Axes as in level.js: +X east, -Z north (the house: z -14..0, front door at x 0), +Z south.
// The house itself (walls, rooms, doors, windows) stays in level.js; this file is everything outside it.
import { lampPost, van } from './kit.js';

export const LOT = { minX: -16, maxX: 16, minZ: -20, maxZ: 22 };   // the collision worlds' bounds
export const YARD_FENCE_Z = 9;                                      // the yard's south fence (with the gate)
export const FENCE_H = 2.2;                                         // solid, taller than a person
export const GATE = { x0: 2.4, x1: 3.6, z: YARD_FENCE_Z };          // the wicket gate's opening (its posts take 0.1 m each side: a 1.0 m leaf)
export const LANE = { x0: 5.0, x1: 11.0, z0: 10.6, z1: 21.5 };      // the dead-end lane (asphalt); the apron along the fence is x 2..11, z 9.1..10.6
// the van: its rear (open doors) to the north at z 11, the cab south; the ring right behind it
export const VAN = { x: 8.0, z: 11.0, yaw: 0 };
export const DROP = { x: 8.0, z: 10.2, r: 0.6, flyTime: 0.3 };     // CFG.dropZone on this map
export const VAN_ZONE = { x: 8.0, z: 10.2, r: 2.0 };                // CFG.round.vanZone («at the van»)
export const CARGO = { minX: 7.1, maxX: 8.9, minZ: 11.05, maxZ: 14.55, y: 0.4, rear: 'min' };   // = kit.van's cargo (x 8, z 11, yaw 0)
export const SPAWN = { x: 6.0, z: 10.6, yaw: -Math.PI / 2 };   // beside the ring, facing the board (contract menu); turned round it faces the house
export const BOARD = { x: 10.2, z: 10.6, yaw: -Math.PI / 2 };   // scoreboard stand east of the van's rear, facing the spawn point
// the guard goes no further south than this: the porch and the front of the garden — never the gate
export const LEASH = { maxZ: 4.5 };

// The lamps: CFG.stealth.lamps on this map (the circle = you are seen as in the flashlight beam).
// The first one is the real point light over the garden path; the porch, the gate and the lane
// lamps glow (and keep their circles) without one: the page has three point lights only.
export const LAMPS = [
  { x: 2.6, z: 4.4, r: 3 },        // the garden path lamp (point light 0)
  { x: 1.5, z: -12.9, r: 2.5 },    // the fireplace embers (as before)
  { x: -3.0, z: -6.0, r: 2.2 },    // the corridor night light (as before)
  { x: 0, z: 0.75, r: 1.6 },       // over the porch: the front door is lit
  { x: 5.0, z: 7.6, r: 2.0 },      // at the gate, inside (beside the way)
  { x: 4.4, z: 12.6, r: 2.5 },     // the lane's lamp, outside the fence (the guard never sees it)
];
// the three point lights: [x, y, z, colour, intensity, distance] (systems/world.js puts them there)
export const LIGHTS = [
  [2.6, 2.8, 4.4, 0xffc98a, 6, 12],      // the garden path lamp
  [1.5, 0.6, -12.9, 0xff7a3a, 3.5, 8],   // fireplace embers
  [-3.0, 2.3, -6.0, 0x7f9cff, 3, 10],    // corridor night light
];

// The guard's nav points outside (enemies/nav.js): the porch and the front of the garden.
export const YARD_NODES = [[0, 1.6], [1.4, 3.8], [-5, 3.2], [6.5, 3.2], [-3, -16]];

// Cover in the garden — furniture for line of sight (a crouching thief behind a bush or the low fence
// is hidden; standing, he is not), bodies bump into it.
export const COVER = {
  bushes: [[-1.8, 2.8, 0.55], [3.6, 3.3, 0.6], [-1.0, 5.4, 0.55], [4.6, 7.4, 0.6], [0.2, 8.0, 0.55], [6.8, 3.0, 0.5]],   // [x, z, r]; 0.9 m high
  shed: { x0: -9.5, z0: 5.0, x1: -6.5, z1: 8.0, h: 2.5 },
  woodpile: { x0: 9.2, z0: 6.6, x1: 10.8, z1: 7.4, h: 1.0 },
  barrel: { x: -5.6, z: 1.9, r: 0.42, h: 1.0 },                        // a rain barrel and crates by the porch, where a standing thief is seen most
  crates: { x0: 4.7, z0: 1.2, x1: 5.6, z1: 2.1, h: 1.1 },
  lowFence: { z: 6.4, x0: -6.0, x1: 8.0, gap: [1.0, 2.6], h: 0.8 },   // the garden's low fence across the yard, the path through its gap
};

const COL = {
  road: 0x2a2c31, apron: 0x33353a, shed: 0x4a3a2e, shedRoof: 0x2c2628,
  logs: 0x5a4434, logEnd: 0x8a6e52, low: 0x4a3e33, board: 0x4a3c30, cap: 0x2f2620,
};

// S, G: the static and the glow Builders; C: level.js's palette; solid(x0, z0, x1, z1, h, top):
// a body box + furniture for line of sight; both(x0, z0, x1, z1): the walls-only world too (sound,
// sight, thrown loot); furniture: the level's list (the van goes in). Returns the van's cargo floor.
export function buildYard({ S, G, C, solid, both, furniture, world }) {
  // ---------- the fence: solid boards, taller than a person, round the whole yard; one gap, the gate ----------
  // Every piece is a thin slab (it stops bodies, sight, sound and thrown loot: `both`), a cap board on top
  // and a post every 3 m. The side slabs stop at the south slab's face (no two tops in one place).
  const T = 0.06, Y0 = -20, YS = YARD_FENCE_Z, post = (x, z) => S.boxAt(0.2, FENCE_H + 0.15, 0.2, x, 0, z, C.woodDark);
  const slabX = (z, x0, x1) => {   // along X
    S.box(x0, 0, z - T, x1, FENCE_H, z + T, COL.board); S.box(x0, FENCE_H, z - 0.12, x1, FENCE_H + 0.07, z + 0.12, COL.cap);
    both(x0, z - T, x1, z + T);
  };
  const slabZ = (x, z0, z1) => {   // along Z
    S.box(x - T, 0, z0, x + T, FENCE_H, z1, COL.board); S.box(x - 0.12, FENCE_H, z0 + 0.06, x + 0.12, FENCE_H + 0.07, z1 - 0.06, COL.cap);   // ends 0.06 short: the next slab's cap (corner) is not in the same place
    both(x - T, z0, x + T, z1);
  };
  slabX(Y0, -16, 16); slabZ(-16, Y0 + T, YS - T); slabZ(16, Y0 + T, YS - T);                       // north, west, east
  slabX(YS, -16, GATE.x0); slabX(YS, GATE.x1, 16);                                                   // south, with the gate between
  for (let x = -16 + 3; x < 16; x += 3) { post(x, Y0); if (Math.abs(x - GATE.x0) > 0.4 && Math.abs(x - GATE.x1) > 0.4) post(x, YS); }
  for (let z = Y0 + 3; z < YS - 1; z += 3) { post(-16, z); post(16, z); }
  for (const x of [GATE.x0, GATE.x1]) post(x, YS);                                                   // the gate's own posts
  S.box(GATE.x0, 2.1, YS - T, GATE.x1, FENCE_H, YS + T, COL.board);                                  // over the leaf (sight is the leaf's: not a wall)
  S.box(GATE.x0, FENCE_H, YS - 0.12, GATE.x1, FENCE_H + 0.07, YS + 0.12, COL.cap);
  // the lane's edge: no wall behind the road (the owner took it away). A row of shrubs closes the lane's end and
  // both sides (you walk into a bush, not into thin air), the bins stand at the lane's end, the neighbours' houses
  // stand dark beyond (decor, no collision). Under the shrubs the same bodies as before: nobody can cross.
  world.addBox(-16, 22.3, 16, 22.5); world.addBox(-16.4, YS + 0.06, -16.1, 22.5); world.addBox(16.1, YS + 0.06, 16.4, 22.5);
  const shrub = (x, z, r) => { S.cyl(r * 0.8, r, 1.5, x, 0, z, C.leaves2, 7); S.cyl(0, r * 0.75, 0.6, x, 1.4, z, C.leaves, 7); solid(x - r * 0.75, z - r * 0.75, x + r * 0.75, z + r * 0.75, 1.6, null); };
  for (let x = -15.2; x <= 15.3; x += 1.5) shrub(x, 22.0 + 0.15 * Math.sin(x * 2.3), 0.72 + 0.08 * Math.sin(x * 5.1));
  for (let z = YS + 1.2; z <= 21.2; z += 1.5) { shrub(-15.6, z, 0.72 + 0.08 * Math.sin(z * 4.1)); shrub(15.6, z, 0.72 + 0.08 * Math.sin(z * 3.3)); }
  for (const [x, z, ry] of [[6.2, 20.4, 0.2], [10.0, 20.9, -0.15]]) {   // the neighbours' wheelie bins at the lane's end
    S.boxAt(0.6, 0.95, 0.7, x, 0, z, 0x2e5a46, ry); S.boxAt(0.66, 0.08, 0.76, x, 0.95, z, 0x23473a, ry);
    solid(x - 0.4, z - 0.45, x + 0.4, z + 0.45, 1.0, null);
  }
  // the neighbours' houses beyond the shrubs: dark blocks with a few warm windows, only to be seen
  for (const [x0, x1, z0, h, win] of [[-14.5, -5.5, 26, 5.5, [[-12, 3.2], [-8, 3.2]]], [-1.5, 6.5, 29, 6.5, [[1.5, 3.8]]], [11.5, 19.5, 27, 5.2, [[15, 3.0], [18, 3.0]]], [-22, -17, 12, 5, [[-17.1, 3.0]]]]) {
    S.box(x0, 0, z0, x1, h, z0 + 8, 0x1d2230); S.box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.5, z0 + 8.3, 0x15181f);
    for (const [wx, wy] of win) G.box(wx - 0.4, wy - 0.4, z0 - 0.01, wx + 0.4, wy + 0.4, z0 + 0.01, 0x8a6a40);   // a hair into the wall: it is part of it
  }

  // ---------- the garden path: stepping stones from the back step to the gate ----------
  for (let i = 0; i < 12; i++) {
    const t = i / 11, x = 0.5 * Math.sin(t * Math.PI) + 3.0 * t * t + Math.sin(i * 1.7) * 0.1, z = 0.9 + 7.9 * t;
    S.boxAt(0.55, 0.03, 0.45, x, 0, z, C.path, i * 0.7);
  }
  // ---------- cover ----------
  for (const [x, z, r] of COVER.bushes) { S.cyl(r * 0.85, r, 0.9, x, 0, z, C.leaves2, 7); solid(x - r * 0.8, z - r * 0.8, x + r * 0.8, z + r * 0.8, 0.9, null); }
  {
    const B = COVER.shed;   // the shed: hides you standing
    S.box(B.x0, 0, B.z0, B.x1, 2.3, B.z1, COL.shed);
    S.box(B.x0 - 0.15, 2.3, B.z0 - 0.15, B.x1 + 0.15, 2.45, B.z1 + 0.15, COL.shedRoof);
    S.box(B.x1, 0.02, B.z0 + 1.0, B.x1 + 0.02, 1.9, B.z0 + 1.9, C.woodDark);           // its door (shut)
    solid(B.x0, B.z0, B.x1, B.z1, B.h, null);
  }
  {
    const B = COVER.barrel;   // the rain barrel (a dark water ring on top)
    S.cyl(B.r, B.r * 1.05, B.h, B.x, 0, B.z, 0x4b3a2c, 10); S.cyl(B.r * 0.86, B.r * 0.86, 0.04, B.x, B.h, B.z, 0x1c2a3a, 10); S.cyl(B.r * 1.08, B.r * 1.08, 0.05, B.x, 0.5, B.z, 0x2a2420, 10);
    solid(B.x - B.r * 0.85, B.z - B.r * 0.85, B.x + B.r * 0.85, B.z + B.r * 0.85, B.h, null);
    const K = COVER.crates;   // two stacked crates
    const mx = (K.x0 + K.x1) / 2, mz = (K.z0 + K.z1) / 2;
    S.box(K.x0, 0, K.z0, mx + 0.05, 0.55, K.z1, 0x6e5238); S.box(mx + 0.05, 0, K.z0 + 0.1, K.x1, 0.55, K.z1 - 0.1, 0x5e452f);
    S.box(K.x0 + 0.1, 0.55, K.z0 + 0.1, K.x1 - 0.2, K.h, K.z1 - 0.1, 0x7a5c40);
    solid(K.x0, K.z0, K.x1, K.z1, K.h, null);
  }
  {
    const W = COVER.woodpile;   // the woodpile: a crouching thief behind it is hidden
    S.box(W.x0, 0, W.z0, W.x1, 0.95, W.z1, COL.logs);
    S.box(W.x0 + 0.05, 0.95, W.z0 + 0.05, W.x1 - 0.05, 1.0, W.z1 - 0.05, COL.logEnd);
    solid(W.x0, W.z0, W.x1, W.z1, W.h, null);
  }
  {
    const F = COVER.lowFence;   // the garden's low picket fence: crouch behind it
    for (const [a, b] of [[F.x0, F.gap[0]], [F.gap[1], F.x1]]) {
      S.box(a, 0.25, F.z - 0.02, b, 0.33, F.z + 0.02, COL.low);
      S.box(a, 0.62, F.z - 0.02, b, 0.7, F.z + 0.02, COL.low);
      for (let x = a + 0.1; x < b - 0.05; x += 0.4) S.box(x - 0.04, 0, F.z - 0.06, x + 0.04, F.h, F.z - 0.02, COL.low);
      solid(a, F.z - 0.06, b, F.z + 0.04, F.h, null);
    }
  }
  // trees: in the yard and a few outside the fence
  for (const [x, z, s] of [[-12, 6, 1], [-13, 2, 0.8], [12.5, 5.5, 1.1], [13, -4, 0.9], [-13, -12, 1.2], [11, -17, 1], [-6, 19.5, 1], [1.5, 20.5, 1.2], [13.5, 17, 1.1], [-12, 14, 0.9]]) {
    S.cyl(0.12 * s, 0.18 * s, 1.6 * s, x, 0, z, C.bark, 6);
    S.cyl(0, 1.3 * s, 2.2 * s, x, 1.2 * s, z, C.leaves, 7);
    S.cyl(0, 1.0 * s, 1.8 * s, x, 2.4 * s, z, C.leaves2, 7);
    solid(x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s, 3.5, null);
  }
  // bushes along the house
  for (const x of [-8, -4.5, 4, 8]) { S.cyl(0.5, 0.6, 0.8, x, 0, 0.8, C.leaves2, 7); solid(x - 0.5, 0.3, x + 0.5, 1.3, 0.8, null); }
  S.box(-0.9, 0, 0.15, 0.9, 0.18, 0.7, C.stone); // back step

  // ---------- the lane behind the gate: an apron along the fence and a dead-end lane south of it ----------
  S.box(2.0, 0, YS + 0.1, LANE.x1, 0.02, LANE.z0, COL.apron);
  S.box(LANE.x0, 0, LANE.z0, LANE.x1, 0.02, LANE.z1, COL.road);
  // ---------- the lamps (the porch and the gate: on the wall / a short post) ----------
  lampPost(S, G, solid, 2.6, 4.4, 2.9);                                                  // the garden path lamp
  G.box(-0.15, 2.3, 0.16, 0.15, 2.45, 0.24, 0xffd9a0);                                   // the porch lamp over the door
  S.box(-0.2, 2.25, 0.15, 0.2, 2.3, 0.3, C.pole);
  lampPost(S, G, solid, 5.0, 7.6, 2.2);                                                  // at the gate (inside)
  lampPost(S, G, solid, 4.4, 12.6, 3.4);                                                 // the lane's lamp

  // ---------- the van and the board ----------
  const V = van(S, G, VAN.x, VAN.z, VAN.yaw);
  world.addBox(V.body.minX, V.body.minZ, V.body.maxX, V.body.maxZ);
  for (const d of V.doors) world.addBox(d.minX, d.minZ, d.maxX, d.maxZ);
  furniture.push({ ...V.body, h: 2.2, top: null });
  {
    const bx = BOARD.x, bz = BOARD.z;
    S.cyl(0.03, 0.03, 1.1, bx, 0, bz, C.pole, 6);
    S.cyl(0.25, 0.25, 0.03, bx, 0, bz, C.pole, 10);
    solid(bx - 0.25, bz - 0.25, bx + 0.25, bz + 0.25, 1.9, null);
  }
  // the gate: a leaf of the fence's own boards (world/level.js Door, `gate`: its creak, no trap, the guards never use it)
  const gateSpec = { axis: 'x', hx: GATE.x0 + 0.1, hz: YS, w: GATE.x1 - GATE.x0 - 0.2, locked: false, gate: true, y0: 0, floor: 0, color: COL.board };
  return { cargo: { ...V.cargo, rear: 'min' }, gateSpec };
}
