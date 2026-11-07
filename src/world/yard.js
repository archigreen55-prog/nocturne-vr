// The dacha's yard and street (owner's decision, claude/dacha-yard): the van no longer stands at the
// back step — it waits on the street, round the corner behind the neighbours' hedge, ~28 m from the
// house and out of the guard's sight. From the van: up the street, through the wicket gate (хвіртка),
// across the garden (bushes, a low garden fence, the shed, the woodpile: cover; the lamps: circles where
// you are seen) to the house. The guard comes out to the porch and to the gate, never further
// (LEASH: enemies/patrol.js, systems/humanGuard.js), and from nowhere he can stand is the van in view
// (tests/yard.test.mjs).
//
// Axes as in level.js: +X east, -Z north (the house: z -14..0, front door at x 0), +Z south.
// The house itself (walls, rooms, doors, windows) stays in level.js; this file is everything outside it.
import { lampPost, van } from './kit.js';

// the yard: the old lot, fenced; the street and the neighbours' side past its south fence
export const LOT = { minX: -16, maxX: 16, minZ: -20, maxZ: 33 };   // the collision worlds' bounds
export const YARD_FENCE_Z = 16;                                     // the yard's south fence (with the gate)
export const GATE = { x0: 2.3, x1: 3.7, z: YARD_FENCE_Z };          // the wicket gate's opening
export const STREET = { minZ: 17.2, maxZ: 22.4 };                   // the asphalt
export const HEDGE = { z0: 23.0, z1: 23.8, h: 2.2, gapX: 14.6 };    // the neighbours' hedge: open only at its east end (gapX..the fence) — round the corner to the van
// the van: its rear (open doors) to the north at z 26, the cab south; the ring right behind it
export const VAN = { x: 13.3, z: 26.0, yaw: 0 };
export const DROP = { x: 13.3, z: 25.2, r: 0.6, flyTime: 0.3 };    // CFG.dropZone on this map
export const VAN_ZONE = { x: 13.3, z: 25.2, r: 2.0 };               // CFG.round.vanZone («at the van»)
export const CARGO = { minX: 12.4, maxX: 14.2, minZ: 26.05, maxZ: 29.55, y: 0.4, rear: 'min' };   // = kit.van's cargo (x 13.3, z 26, yaw 0)
export const SPAWN = { x: 10.6, z: 25.4, yaw: 1.98 };   // beside the van, facing the board (contract menu); turned round (yaw - π) = towards the lane's way out to the street
export const BOARD = { x: 8.8, z: 26.2, yaw: 1.98 };   // scoreboard stand next to the van, facing the spawn point
// the guard goes no further south than this (the porch, the garden, the gate — not the street)
export const LEASH = { maxZ: YARD_FENCE_Z - 0.2 };

// The lamps: CFG.stealth.lamps on this map (the circle = you are seen as in the flashlight beam).
// The first one is the real point light over the garden path; the porch, the gate and the street
// lamps glow (and keep their circles) without one: the page has three point lights only.
export const LAMPS = [
  { x: 1.6, z: 7.6, r: 3 },        // the garden path lamp (point light 0)
  { x: 1.5, z: -12.9, r: 2.5 },    // the fireplace embers (as before)
  { x: -3.0, z: -6.0, r: 2.2 },    // the corridor night light (as before)
  { x: 0, z: 0.75, r: 1.6 },       // over the porch: the front door is lit
  { x: 4.4, z: 15.4, r: 2.0 },     // at the gate (beside it, not in the way)
  { x: -1.5, z: 22.9, r: 3 },      // the street lamp (the guard never comes here)
];
// the three point lights: [x, y, z, colour, intensity, distance] (systems/world.js puts them there)
export const LIGHTS = [
  [1.6, 2.8, 7.6, 0xffc98a, 6, 12],      // the garden path lamp
  [1.5, 0.6, -12.9, 0xff7a3a, 3.5, 8],   // fireplace embers
  [-3.0, 2.3, -6.0, 0x7f9cff, 3, 10],    // corridor night light
];

// The guard's nav points outside (enemies/nav.js): the porch, the path, the garden, the gate.
export const YARD_NODES = [[0, 1.6], [1.0, 4.6], [-5, 3.2], [6.5, 3.2], [-3, -16], [2.4, 10.4], [3.0, 14.6], [-4.5, 13.6], [7.5, 13.4]];

// Cover in the garden: [x0, z0, x1, z1, h] — furniture for line of sight (a crouching thief behind a
// bush or the low fence is hidden; standing, he is not), bodies bump into it.
export const COVER = {
  bushes: [[-1.5, 4.6, 0.55], [2.9, 6.2, 0.6], [-0.6, 9.0, 0.55], [4.4, 11.1, 0.6], [1.0, 12.6, 0.55], [5.0, 14.4, 0.5]],   // [x, z, r]; 0.9 m high
  shed: { x0: -9.5, z0: 9.5, x1: -6.5, z1: 12.5, h: 2.5 },
  woodpile: { x0: 6.0, z0: 11.6, x1: 7.6, z1: 12.4, h: 1.0 },
  lowFence: { z: 10.0, x0: -6.2, x1: 12, gap: [1.0, 2.7], h: 0.8 },   // the garden's low fence across the yard, the path through its gap
};

const COL = {
  road: 0x2a2c31, kerb: 0x4a4b4f, hedge: 0x1c3324, hedgeTop: 0x23402c, shed: 0x4a3a2e, shedRoof: 0x2c2628,
  logs: 0x5a4434, logEnd: 0x8a6e52, low: 0x4a3e33,
};

// S, G: the static and the glow Builders; C: level.js's palette; solid(x0, z0, x1, z1, h, top):
// a body box + furniture for line of sight; both(x0, z0, x1, z1): the walls-only world too (sound,
// sight, thrown loot); furniture: the level's list (the van goes in). Returns the van's cargo floor.
export function buildYard({ S, G, C, solid, both, furniture, world }) {
  // ---------- the yard's fences: the old lot, the south side with the gate ----------
  const rails = (x0, z0, x1, z1) => {   // two rails, as level.js's fence
    const alongX = z0 === z1;
    for (const y of [0.45, 1.0]) {
      if (alongX) S.box(x0, y, z0 - 0.03, x1, y + 0.1, z0 + 0.03, C.fence);
      else S.box(x0 - 0.03, y, z0 + 0.03, x0 + 0.03, y + 0.1, z1 - 0.03, C.fence);
    }
    both(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05);
  };
  const postsX = (z, x0, x1) => { for (let x = x0; x <= x1 + 0.01; x += 2) S.boxAt(0.1, 1.2, 0.1, x, 0, z, C.fence); };
  const postsZ = (x, z0, z1) => { for (let z = z0 + 2; z <= z1 - 1.99; z += 2) S.boxAt(0.1, 1.2, 0.1, x, 0, z, C.fence); };
  const Y0 = -20, YS = YARD_FENCE_Z;
  postsX(Y0, -16, 16); rails(-16, Y0, 16, Y0);                                         // north
  postsZ(-16, Y0, YS); rails(-16, Y0, -16, YS); postsZ(16, Y0, YS); rails(16, Y0, 16, YS);   // west, east
  postsX(YS, -16, 16);                                                                  // south: the gate between two of its posts
  rails(-16, YS, GATE.x0, YS); rails(GATE.x1, YS, 16, YS);
  for (const x of [GATE.x0, GATE.x1]) S.boxAt(0.12, 1.3, 0.12, x, 0, YS, C.fence);     // the gate's own posts
  S.box(GATE.x0 + 0.06, 0.1, YS - 1.3, GATE.x0 + 0.1, 1.05, YS - 0.06, C.fence);       // its leaf, swung into the yard
  // the street's sides and the far side (the neighbours' fences)
  postsZ(-16, YS, LOT.maxZ - 1); rails(-16, YS, -16, LOT.maxZ - 1); postsZ(16, YS, LOT.maxZ - 1); rails(16, YS, 16, LOT.maxZ - 1);
  postsX(LOT.maxZ - 1, -16, 16); rails(-16, LOT.maxZ - 1, 16, LOT.maxZ - 1);

  // ---------- the garden path: stepping stones from the back step to the gate ----------
  for (let i = 0; i < 16; i++) {
    const t = i / 15, x = 0.6 * Math.sin(t * Math.PI) + 3.0 * t * t + Math.sin(i * 1.7) * 0.12, z = 0.9 + 14.0 * t;
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
  // trees in the yard and on the street ("behind the trees": one at the hedge's corner)
  for (const [x, z, s] of [[-12, 10, 1], [-13, 3, 0.8], [12.5, 12, 1.1], [13, -4, 0.9], [-13, -12, 1.2], [11, -17, 1], [-6, 14.6, 0.9], [9.5, 14.2, 0.8], [15.3, 30.5, 1.1], [8.5, 30.8, 0.9], [-9, 25.5, 1], [4, 28.5, 1.2]]) {
    S.cyl(0.12 * s, 0.18 * s, 1.6 * s, x, 0, z, C.bark, 6);
    S.cyl(0, 1.3 * s, 2.2 * s, x, 1.2 * s, z, C.leaves, 7);
    S.cyl(0, 1.0 * s, 1.8 * s, x, 2.4 * s, z, C.leaves2, 7);
    solid(x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s, 3.5, null);
  }
  // bushes along the house
  for (const x of [-8, -4.5, 4, 8]) { S.cyl(0.5, 0.6, 0.8, x, 0, 0.8, C.leaves2, 7); solid(x - 0.5, 0.3, x + 0.5, 1.3, 0.8, null); }
  S.box(-0.9, 0, 0.15, 0.9, 0.18, 0.7, C.stone); // back step

  // ---------- the street ----------
  S.box(-15.9, 0, STREET.minZ, 15.9, 0.02, STREET.maxZ, COL.road);
  S.box(-15.9, 0, STREET.minZ - 0.25, 15.9, 0.08, STREET.minZ, COL.kerb);
  for (let x = -14; x <= 14; x += 4) S.box(x - 0.9, 0.02, 19.75, x + 0.9, 0.025, 19.85, 0x8a8c80);   // the centre line
  // the hedge: the van waits behind it, in the lane east of its end
  for (const [a, b] of [[-15.9, HEDGE.gapX]]) {
    S.box(a, 0, HEDGE.z0, b, HEDGE.h - 0.1, HEDGE.z1, COL.hedge);
    S.box(a + 0.05, HEDGE.h - 0.1, HEDGE.z0 + 0.05, b - 0.05, HEDGE.h, HEDGE.z1 - 0.05, COL.hedgeTop);
    both(a, HEDGE.z0, b, HEDGE.z1);
  }
  // ---------- the lamps (the porch and the gate: on the wall / a short post) ----------
  S.cyl(0.05, 0.07, 2.9, 1.6, 0, 7.6, C.pole, 6); S.boxAt(0.3, 0.25, 0.3, 1.6, 2.9, 7.6, C.pole);   // the garden path lamp
  G.box(1.47, 2.92, 7.47, 1.73, 3.12, 7.73, 0xffd9a0);
  solid(1.5, 7.5, 1.7, 7.7, 3, null);
  G.box(-0.15, 2.3, 0.16, 0.15, 2.45, 0.24, 0xffd9a0);                                   // the porch lamp over the door
  S.box(-0.2, 2.25, 0.15, 0.2, 2.3, 0.3, C.pole);
  lampPost(S, G, solid, 4.4, 15.4, 2.2);                                                 // at the gate (inside)
  lampPost(S, G, solid, -1.5, 22.9, 3.4);                                                // the street lamp

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
  return { cargo: { ...V.cargo, rear: 'min' } };
}
