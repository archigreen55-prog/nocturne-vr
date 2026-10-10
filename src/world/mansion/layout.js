// The mansion (map 2, wave W6): the plan on paper. Rooms on two floors, the openings between them,
// the stairs, the navigation points, where the van, the board and the lamps stand. The geometry is
// built from these numbers in ./level.js; the guard's rounds and the loot are in src/config/mansion.js.
//
// Axes as on the first map: +X east, -Z north (the house), +Z south (the garden). The house is
// 26 x 18 m (x -13..13, z -18..0) with the garage sticking out to z = 1.5; the alley with the van
// runs along the east side (x 13..22); the garden is south (z 0..30). Floor 1 at y = 0, floor 2 at
// y = 3 (walls 2.7 + a 0.3 slab).
import { S } from '../../i18n/index.js';

export const FLOOR_Y = [0, 3.0];
export const LOT = { minX: -22, maxX: 22, minZ: -22, maxZ: 30 };
export const HOUSE = { minX: -13.15, maxX: 13.15, minZ: -18.15, maxZ: 1.65 };   // outer faces of the walls

const R = S.rooms, M = S.mansion.rooms;

// floor: 0 = ground, 1 = upstairs. The outdoor "rooms" come last (any point outside the house).
export const ROOMS = [
  // ground floor, north row
  { name: R.library, floor: 0, minX: -13, maxX: -6, minZ: -18, maxZ: -12 },
  { name: R.living, floor: 0, minX: -6, maxX: 0, minZ: -18, maxZ: -12 },
  { name: M.dining, floor: 0, minX: 0, maxX: 6, minZ: -18, maxZ: -12 },
  { name: R.kitchen, floor: 0, minX: 6, maxX: 13, minZ: -18, maxZ: -12 },
  // ground floor, middle
  { name: R.pantry, floor: 0, minX: -13, maxX: -9, minZ: -12, maxZ: -5 },
  { name: R.corridor, floor: 0, minX: -9, maxX: -7, minZ: -12, maxZ: -5 },
  { name: R.hall, floor: 0, minX: -7, maxX: 7, minZ: -12, maxZ: -5 },
  { name: M.study, floor: 0, minX: 7, maxX: 13, minZ: -12, maxZ: -5 },
  // ground floor, south row
  { name: M.laundry, floor: 0, minX: -13, maxX: -7, minZ: -5, maxZ: 0 },
  { name: R.anteroom, floor: 0, minX: -7, maxX: -2, minZ: -5, maxZ: 0 },
  { name: M.boiler, floor: 0, minX: -2, maxX: 4, minZ: -5, maxZ: 0 },
  { name: M.garage, floor: 0, minX: 4, maxX: 13, minZ: -5, maxZ: 1.5 },
  // upstairs, north row
  { name: M.bedroom, floor: 1, minX: -13, maxX: -6, minZ: -18, maxZ: -12 },
  { name: M.wardrobe, floor: 1, minX: -6, maxX: -3, minZ: -18, maxZ: -12 },
  { name: M.bath, floor: 1, minX: -3, maxX: 2, minZ: -18, maxZ: -12 },
  { name: M.kids, floor: 1, minX: 2, maxX: 8, minZ: -18, maxZ: -12 },
  { name: M.attic, floor: 1, minX: 8, maxX: 13, minZ: -18, maxZ: -12 },
  // upstairs, middle
  { name: M.guardroom, floor: 1, minX: -13, maxX: -9, minZ: -12, maxZ: -5 },
  { name: M.corridor2, floor: 1, minX: -9, maxX: -7, minZ: -12, maxZ: -5 },
  { name: M.gallery, floor: 1, minX: -7, maxX: 13, minZ: -12, maxZ: -5 },
  // upstairs, south row
  { name: M.guest, floor: 1, minX: -13, maxX: -5, minZ: -5, maxZ: 0 },
  { name: M.billiard, floor: 1, minX: -5, maxX: 5, minZ: -5, maxZ: 0 },
  { name: M.music, floor: 1, minX: 5, maxX: 13, minZ: -5, maxZ: 0 },
  { name: M.balcony, floor: 1, minX: -10, maxX: -6, minZ: 0, maxZ: 2 },
  // outdoors (floor 0)
  { name: M.alley, floor: 0, minX: 13, maxX: 22, minZ: -22, maxZ: 2 },
  { name: M.garden, floor: 0, minX: -22, maxX: 22, minZ: -22, maxZ: 30 },
];
export const OUTSIDE = [M.alley, M.garden];
export const WELL_NAME = '#well';   // the stair well: a pseudo-room of the flashlight mask, open through both floors

// Openings between rooms: [roomA, roomB, door centre x, z] (null = an arch, always open).
export const LINKS = [
  [M.alley, R.anteroom, -4.5, 0], [M.alley, M.garage, 13, -1.5], [M.alley, R.kitchen, 13, -15],
  [M.garden, R.anteroom, -4.5, 0], [M.garden, M.alley, null],
  [R.library, R.corridor, -8, -12], [R.living, R.hall, null], [M.dining, R.hall, 3, -12], [R.kitchen, R.hall, 6.5, -12],
  [R.living, R.library, null], [M.dining, R.kitchen, null],
  [R.pantry, R.corridor, -9, -8.5], [R.corridor, R.hall, null], [M.study, R.hall, 7, -8.5],
  [R.hall, R.anteroom, null], [R.hall, M.garage, 5.5, -5], [M.laundry, R.anteroom, -7, -2.5], [M.boiler, M.garage, 4, -2.5],
  // upstairs
  [M.bedroom, M.corridor2, -8, -12], [M.wardrobe, M.bedroom, -6, -15], [M.bath, M.gallery, -0.5, -12],
  [M.kids, M.gallery, 5, -12], [M.attic, M.gallery, 10.5, -12], [M.guardroom, M.corridor2, -9, -7],
  [M.corridor2, M.gallery, null], [M.guest, M.corridor2, -8, -5], [M.billiard, M.gallery, -1, -5], [M.music, M.gallery, 9, -5],
  [M.guest, M.balcony, -8, 0], [M.balcony, M.garden, null],
  [M.gallery, WELL_NAME, null], [R.hall, WELL_NAME, null],   // the stair well lets the light through between the floors
];

// The U-stairs in the west half of the hall, against its north wall: flight 1 rises north along
// x = -5.6 from the middle of the hall, the landing turns under the north wall, flight 2 rises
// south along x = -3.2 and arrives on the gallery's south strip. Heights: 0 -> 1.5 -> 3.
export const STAIRS = {
  flight1: { minX: -6.8, maxX: -4.4, minZ: -10.36, maxZ: -7.36 },
  landing: { minX: -6.8, maxX: -2.0, minZ: -11.86, maxZ: -10.36, y: 1.5 },
  flight2: { minX: -4.4, maxX: -2.0, minZ: -10.36, maxZ: -7.36 },
  ramps: [
    { x0: -5.6, z0: -7.36, x1: -5.6, z1: -10.36, w: 2.4, y0: 0, y1: 1.5 },
    { x0: -3.2, z0: -10.36, x1: -3.2, z1: -7.36, w: 2.4, y0: 1.5, y1: 3.0 },
  ],
  steps: 10,
  // the opening in the floor-2 slab: the stair well (flight 1 + landing + flight 2)
  well: { minX: -6.8, maxX: -2.0, minZ: -11.93, maxZ: -7.36 },
};
STAIRS.flats = [STAIRS.landing];

export const SPAWN = { x: 15.0, z: -4.2, yaw: 2.914 };  // in the alley beside the van, facing the board
export const BOARD = { x: 14.55, z: -2.25, yaw: 2.914 };
export const VAN = { x: 16.5, z: -6.4, yaw: Math.PI };  // rear doors facing south (+Z)
export const DROP = { x: 16.5, z: -5.35, r: 0.6 };
export const VAN_ZONE = { x: 16.5, z: -5.35, r: 2.0 };

// The three point lights of the scene move here: [x, y, z, colour, intensity, distance]
export const LIGHTS = [
  [0, 2.45, -8.5, 0xffc98a, 5, 12],      // hall chandelier
  [15.5, 2.8, -4.0, 0xffc98a, 6, 12],    // alley lamp over the van
  [0, 2.8, 12, 0x9fb4ff, 3, 10],         // garden lantern
];
// Every lamp of the house and garden: the three point lights of the scene move to the three nearest
// ones on the player's floor (plan-W6 §6). [x, y, z, colour, intensity, distance, floor]
export const LAMP_LIST = [
  [0, 2.45, -8.5, 0xffc98a, 5, 12, 0], [9.5, 2.4, -15, 0xffd9a0, 3, 9, 0], [-9.5, 2.4, -15, 0xffd9a0, 3, 9, 0], [-3, 2.4, -15.5, 0xff9a5a, 3.5, 9, 0],
  [3, 2.4, -15.3, 0xffd9a0, 3, 9, 0], [10, 2.4, -8.5, 0xffd9a0, 3, 9, 0], [-4.5, 2.4, -2.5, 0xffd9a0, 2.5, 8, 0], [8.5, 2.4, -2, 0xcfe0ff, 3, 10, 0],
  [-8, 2.4, -8.5, 0x7f9cff, 2.5, 8, 0], [-10, 2.4, -2.5, 0xcfe0ff, 2, 7, 0],
  [5, 5.4, -8.5, 0xffd9a0, 4, 11, 1], [-9.5, 5.4, -15, 0xffd9a0, 3, 9, 1], [5, 5.4, -15, 0xffd9a0, 3, 9, 1], [-11, 5.4, -8.5, 0xffd9a0, 3, 9, 1],
  [-9, 5.4, -2.5, 0xffd9a0, 3, 9, 1], [0, 5.4, -2.5, 0xffd9a0, 3, 9, 1], [9, 5.4, -2.5, 0xffd9a0, 3, 9, 1], [-0.5, 5.4, -15, 0xcfe0ff, 2.5, 8, 1],
  [-8, 5.4, -8.5, 0x7f9cff, 2.5, 8, 1],
  [15.5, 2.8, -4.0, 0xffc98a, 6, 12, 0], [0, 2.8, 12, 0x9fb4ff, 3, 10, 0], [-10, 2.8, 20, 0x9fb4ff, 3, 10, 0],
];
// lit spots for the stealth read-out (seen further here)
export const LAMPS = [{ x: 15.5, z: -4.0, r: 3 }, { x: 0, z: 12, r: 3 }, { x: -10, z: 20, r: 3 }, { x: 0, z: -8.5, r: 2.5 }, { x: 5, z: -8.5, r: 2.5, y: 3 }];   // y: the lamp's floor (the gallery's is upstairs)

// The lurker's wardrobe: in the master bedroom upstairs, against its east wall, front facing -X.
export const WARDROBE = { x: -6.8, z: -16.8, minZ: -17.6, maxZ: -16.0, y0: 3 };

// Navigation points: [x, z, floor]. Open floor in every room and both sides of every doorway.
export const NAV_NODES = [
  // hall and its doorways
  [0, -8.5, 0], [3, -7, 0], [-1, -10.5, 0], [3, -10.5, 0], [5, -6, 0], [-1, -6.5, 0], [6, -8.5, 0], [-3.5, -6.2, 0], [-5.5, -6.2, 0], [0, -11.4, 0], [-1, -12.6, 0],
  [6.4, -8.5, 0], [7.6, -8.5, 0], [6.5, -11.4, 0], [6.5, -12.6, 0], [3, -11.4, 0], [3, -12.6, 0],
  [-6.4, -6.2, 0], [-7.6, -6.2, 0], [-4.5, -5.6, 0], [-4.5, -4.4, 0], [5.5, -5.6, 0], [5.5, -4.4, 0],
  // kitchen, dining, living, library
  [9.5, -15, 0], [11.5, -13.5, 0], [8, -16.4, 0], [12, -16.5, 0], [12.4, -15, 0], [13.8, -15, 0], [5.4, -15, 0], [6.6, -15, 0],
  [5.2, -17.0, 0], [1.5, -13.3, 0], [4.5, -13.5, 0],
  [-1.5, -14.7, 0], [-1.5, -12.8, 0], [-2.2, -16.6, 0], [-5.4, -15, 0], [-6.6, -15, 0], [-3, -12.6, 0],
  [-9.5, -14.4, 0], [-7.5, -13.5, 0], [-11.8, -14.2, 0], [-9.0, -16.5, 0], [-8, -12.6, 0], [-8, -11.4, 0],
  // west corridor, pantry, study
  [-8, -8.5, 0], [-8, -10.5, 0], [-8, -6.2, 0], [-9.6, -8.5, 0], [-8.4, -8.5, 0], [-11, -8.5, 0], [-11, -10.5, 0],
  [10, -8.5, 0], [9, -6.5, 0], [11.6, -8.0, 0],
  // south row: anteroom, laundry, boiler room, garage
  [-4.5, -2.5, 0], [-3, -1, 0], [-6, -1.5, 0], [-6.4, -2.5, 0], [-7.6, -2.5, 0], [-10, -2.5, 0], [-11.5, -1, 0], [-4.5, -0.6, 0], [-4.5, 0.8, 0],
  [9.5, -2, 0], [5.0, -1.5, 0], [11, -3.3, 0], [9.5, 0.5, 0], [5.0, -4.0, 0], [4.6, -2.5, 0], [3.4, -2.5, 0], [1, -2.5, 0], [-1, -1.5, 0], [12.4, -1.5, 0], [14, -1.5, 0],
  // alley and garden (a mesh about 6 m apart, around the hedges and the fountain)
  [15, -1.5, 0], [15, -6, 0], [15, -12, 0], [15, -16, 0], [16, -20, 0], [19.5, -5, 0], [19.5, -13, 0], [19.5, -19, 0],
  [-15, 3.5, 0], [-9, 4.2, 0], [-3, 3, 0], [3, 3, 0], [9, 3, 0], [15, 3, 0], [18, 4, 0],
  [-15, 9, 0], [-9, 9, 0], [-3, 9, 0], [3, 9, 0], [9, 9, 0], [15, 9, 0], [18, 12, 0], [16.5, 8, 0], [16.5, 11, 0],
  [-15, 15, 0], [-9, 15, 0], [-4, 15, 0], [4, 15, 0], [9, 15, 0], [15, 15, 0],
  [-14, 23, 0], [-9, 21, 0], [-3, 21, 0], [3, 21, 0], [9, 21, 0], [15, 21, 0], [-17, 19.5, 0], [-17, 22, 0],
  [-12, 27, 0], [0, 27, 0], [12, 27, 0],
  // the stairs: bottom (floor 0), the landing (both ends), the top (floor 1)
  [-5.6, -6.9, 0], [-5.6, -11.1, 1], [-3.2, -11.1, 1], [-3.2, -6.9, 1], [-1.4, -6.9, 1],
  // upstairs: gallery, corridor, rooms and their doorways
  [0, -8.5, 1], [4, -7, 1], [4, -10.5, 1], [9, -8.5, 1], [-1, -10.8, 1], [-4.5, -6.2, 1], [11, -6.5, 1],
  [-8, -10.8, 1], [-8, -8.5, 1], [-8, -6.2, 1], [-7.6, -6.2, 1], [-6.4, -6.2, 1],
  [-9.0, -14.3, 1], [-11.5, -13.5, 1], [-8, -12.6, 1], [-8, -11.4, 1], [-4.5, -15, 1], [-6.6, -15, 1], [-5.0, -15, 1],
  [-0.5, -15, 1], [-0.5, -12.6, 1], [-0.5, -11.4, 1], [5, -15, 1], [4.3, -16.0, 1], [5, -12.6, 1], [5, -11.4, 1],
  [10.5, -15, 1], [10.5, -12.6, 1], [10.5, -11.4, 1], [-10.3, -9.0, 1], [-9.6, -7, 1], [-8.4, -7, 1],
  [-9, -2.5, 1], [-7, -1, 1], [-8, -5.6, 1], [-8, -4.4, 1], [-3, -2.5, 1], [2.5, -4.2, 1], [-1, -5.6, 1], [-1, -4.4, 1],
  [9, -2.5, 1], [11, -1, 1], [9, -5.6, 1], [9, -4.4, 1], [-8, -0.6, 1], [-8, 0.6, 1], [-8, 1.2, 1],
];
// Edges the automatic linking cannot see (different floors): [[x, z], [x, z]] by nearest node.
export const NAV_STAIRS = [
  [[-5.6, -6.9], [-5.6, -11.1]], [[-5.6, -11.1], [-3.2, -11.1]], [[-3.2, -11.1], [-3.2, -6.9]],
];
