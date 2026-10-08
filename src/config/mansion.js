// Map 2, the mansion (W6): the guard's rounds there and its loot. Geometry: src/world/mansion/.
// Units: metres, seconds, m/s (see src/config/index.js). The numbers of sight, hearing and the
// suspicion meter are the same as on the first map (src/config/guard.js); only places differ.
import { S } from '../i18n/index.js';

const R = S.rooms, M = S.mansion.rooms;

export const mansion = {
  // Valera: the ground floor and the garden; a flashlight (as on the first map)
  guard: {
    id: 'valera', name: S.mansion.names.valera,
    start: [10, -8.5, 0],   // the study
    rooms: {
      [R.hall]: [[0, -8.5], [3, -7], [-1, -10.5]],
      [R.kitchen]: [[9.5, -15], [11.5, -13.5]],
      [M.dining]: [[3, -13.3], [1.5, -13.3]],
      [R.living]: [[-1.5, -14.7], [-1.5, -12.8]],
      [R.library]: [[-9.5, -14.4], [-11.8, -14.2]],
      [M.study]: [[10, -8.5], [9, -6.5]],
      [M.garage]: [[9.5, -2], [5.0, -1.5]],
      [R.anteroom]: [[-4.5, -2.5]],
      [R.corridor]: [[-8, -8.5]],
      [M.garden]: [[-3, 3], [3, 9], [-9, 9], [-13, 16]],
      [M.alley]: [[15, -6], [15, -12]],
    },
    // Hiding spots: where a crouching thief hides; `from` is where the guard stands to look there.
    spots: [
      { name: S.mansion.spots.sofa, at: [-4.4, -13.2], from: [-4.4, -12.8] },
      { name: S.mansion.spots.diningTable, at: [3, -15.3], from: [3, -13.3] },
      { name: S.mansion.spots.island, at: [9.5, -13.2], from: [11.5, -13.5] },
      { name: S.mansion.spots.libTable, at: [-11, -15.2], from: [-9.5, -14.4] },
      { name: S.mansion.spots.pillar, at: [1.6, -10.5], from: [-1, -10.5] },
      { name: S.mansion.spots.desk, at: [9.5, -11.5], from: [9.5, -8.5] },
      { name: S.mansion.spots.car, at: [9.0, -1.5], from: [5.0, -1.5] },
      { name: S.mansion.spots.crates, at: [5.0, 0.6], from: [5.0, -4.0] },
      { name: S.mansion.spots.pantry, at: [-11, -10.5], from: [-10.3, -8.5] },   // a pocket: it steps inside (opens the door)
      { name: S.mansion.spots.shed, at: [-16, 19], from: [-17, 20.2] },           // a pocket in the garden
      { name: S.mansion.spots.boiler, at: [-1.2, -2.5], from: [3.4, -2.5] },
    ],
    // Habits: the same windows as on the first map (see src/config/guard.js), at this house's places.
    habits: {
      tea: { at: 120, dur: 35, label: S.guard.habits.tea, go: [9.5, -16.6], stand: [9.5, -16.6], face: [9.5, -17.6], hearK: 0.6, mask: 6, whistleAt: 8, whistleFor: 10 },
      tea2: { at: 300, dur: 35, label: S.guard.habits.tea, go: [9.5, -16.6], stand: [9.5, -16.6], face: [9.5, -17.6], hearK: 0.6, mask: 6, whistleAt: 8, whistleFor: 10 },
      toilet: { at: 210, dur: 25, label: S.mansion.guard.toilet, go: [-9.5, -2.5], stand: [-11, -2.5], face: [-12.6, -2.5], hearK: 0.3, sightK: 0.3, closeDoor: [-7, -2.5] },
      phone: { at: 75, dur: 40, label: S.guard.habits.phone, walk: [[0, -8.5], [3, -7], [-1, -10.5], [0, -8.5]], hearK: 0.5, fovK: 0.6 },
      armchair: { at: 360, dur: 20, label: S.guard.habits.armchair, go: [-3.0, -16.8], stand: [-5.4, -17.0], face: [-3, -17.0], sit: true, hearK: 0.6, sightK: 0.6 },
    },
  },

  // Zhora: upstairs, a hand lamp instead of the flashlight (a point light around it, seen from behind a
  // corner; it sees a little worse in the dark); comes down for coffee now and then. Habit ids are the
  // first map's so the difficulty's habit list applies (tea = coffee in the kitchen downstairs).
  guard2: {
    id: 'zhora', name: S.mansion.names.zhora, coat: 0x4a3b2f, cap: 0x3a2a22,
    lamp: { intensity: 2.2, distance: 7, lit: 3 },   // lit: you are "in the light" this close to it
    sightK: 0.85,
    start: [-10.3, -9, 1],   // the guard room
    rooms: {
      [M.gallery]: [[0, -8.5, 1], [4, -10.5, 1], [9, -8.5, 1]],
      [M.corridor2]: [[-8, -8.5, 1]],
      [M.guardroom]: [[-10.3, -9, 1]],
      [M.bedroom]: [[-9, -14.3, 1], [-11.5, -13.5, 1]],
      [M.kids]: [[5, -15, 1]],
      [M.bath]: [[-0.5, -15, 1]],
      [M.guest]: [[-9, -2.5, 1], [-7, -1, 1]],
      [M.billiard]: [[-3, -2.5, 1]],
      [M.music]: [[9, -2.5, 1], [11, -1, 1]],
    },
    spots: [
      { name: S.mansion.spots.bed, at: [-11, -14.6], from: [-9, -14.3] },
      { name: S.mansion.spots.wardrobe, at: [-4.5, -15], from: [-5.0, -15] },
      { name: S.mansion.spots.billiard, at: [1.0, -1.0], from: [2.5, -4.2] },
      { name: S.mansion.spots.piano, at: [7.0, -4.3], from: [9, -2.5] },
      { name: S.mansion.spots.atticCrates, at: [9.5, -14.5], from: [10.5, -15] },
      { name: S.mansion.spots.cot, at: [-12, -5.8], from: [-10.3, -9] },
    ],
    habits: {
      tea: { at: 90, dur: 25, label: S.mansion.guard.coffee, say: S.mansion.guard.sayCoffee, go: [9.5, -16.6, 0], stand: [9.5, -16.6, 0], face: [9.5, -17.6], hearK: 0.6, mask: 5, whistleAt: 6, whistleFor: 8 },
      tea2: { at: 330, dur: 25, label: S.mansion.guard.coffee, say: S.mansion.guard.sayCoffee, go: [9.5, -16.6, 0], stand: [9.5, -16.6, 0], face: [9.5, -17.6], hearK: 0.6, mask: 5, whistleAt: 6, whistleFor: 8 },
      toilet: { at: 240, dur: 20, label: S.mansion.guard.bath, go: [-0.5, -13.0, 1], stand: [-0.5, -16.0, 1], face: [1.5, -16.0], hearK: 0.3, sightK: 0.3, closeDoor: [-0.5, -12] },
      phone: { at: 150, dur: 40, label: S.guard.habits.phone, walk: [[0, -8.5, 1], [4, -7, 1], [9, -8.5, 1], [0, -8.5, 1]], hearK: 0.5, fovK: 0.6 },
      armchair: { at: 420, dur: 20, label: S.mansion.guard.cot, go: [-10.3, -7.0, 1], stand: [-12.0, -6.2, 1], face: [-11, -6.2], sit: true, hearK: 0.6, sightK: 0.6 },
    },
  },
  // the exits one guard watches during a full alarm (plan-W6 §3.2): inside the garage gate, the back door
  alarmPosts: [[11.8, -1.5, 0], [11.8, -15, 0]],
  // the radio between the two guards: a telegraph of where both are (s)
  radio: { every: 60, jitter: 15, answerAfter: 1.8 },
  // a noise on the other floor carries this part of its radius through the slab (through the stair well: as a wall)
  hearing: { floorK: 0.3 },
  // loot dropped off the balcony onto the hedge under it: lands at softK of its speed (no damage), rustles this far
  balcony: { softK: 0.3, rustle: 8 },
  // a guard this close to the fountain hears less (CFG.hearing.maskK, as by the kettle)
  fountain: { maskR: 5 },

  // 14 items (plan-W6 §4.1): 12 to take (4 upstairs), 2 heavy stand-ins nobody can lift alone (W5);
  // the fake painting lies in the van for contract 12 (M5). pos: bottom centre, y = the surface.
  items: [
    { id: 'm_statuette', name: S.mansion.items.statuette, kind: 'light', mesh: 'statuette', value: 350, pos: [-11.0, 0.76, -16.3], yaw: 0.4 },     // library table
    { id: 'm_candelabrum', name: S.mansion.items.candelabrum, kind: 'light', mesh: 'candelabrum', value: 300, pos: [3.0, 0.76, -15.3], yaw: 0 },   // dining table
    { id: 'm_laptop', name: S.mansion.items.laptop, kind: 'light', mesh: 'laptop', value: 800, pos: [9.5, 0.76, -10.5], yaw: Math.PI },           // study desk
    { id: 'm_jewelbox', name: S.mansion.items.jewelbox, kind: 'light', mesh: 'jewelbox', value: 600, pos: [-9.5, 3.55, -15.2], yaw: -0.3 },      // bedroom nightstand (upstairs)
    { id: 'm_trophy', name: S.mansion.items.trophy, kind: 'light', mesh: 'trophy', value: 400, pos: [-9.6, 3.84, -11.2], yaw: 0 },              // guard room dresser (upstairs)
    { id: 'm_robot', name: S.mansion.items.robot, kind: 'light', mesh: 'robot', value: 450, pos: [6.4, 3.72, -17.2], yaw: 0.3 },                // kids' table (upstairs)
    { id: 'm_painting', name: S.mansion.items.painting, kind: 'medium', mesh: 'painting2', value: 1500, pos: [-3.0, 1.3, -17.5], yaw: 0 },      // over the fireplace
    { id: 'm_vase', name: S.mansion.items.vase, kind: 'medium', mesh: 'vase', value: 1200, pos: [-0.3, 0, -11.6], yaw: 0 },                     // hall, by the north wall
    { id: 'm_chest', name: S.mansion.items.chest, kind: 'medium', mesh: 'chest', value: 1300, pos: [9.5, 0, -3.0], yaw: 0.2 },                  // garage
    { id: 'm_wine', name: S.mansion.items.wine, kind: 'medium', mesh: 'wine', value: 1400, pos: [10.5, 0, 0.4], yaw: 0 },                       // garage, by the shelves
    { id: 'm_crystal', name: S.mansion.items.crystal, kind: 'crystal', mesh: 'crystal', value: 2500, pos: [0.45, 0.94, -16.6], yaw: 0 },        // dining sideboard
    { id: 'm_mirror', name: S.mansion.items.mirror, kind: 'medium', mesh: 'mirror', fragile: true, value: 2000, pos: [-12.7, 3, -1.3], yaw: Math.PI / 2 },   // guest room (upstairs), against the west wall
    { id: 'm_statue', name: S.mansion.items.statue, kind: 'medium', mesh: 'statue', heavy: true, value: 3000, pos: [14, 0, 20], yaw: 0 },          // gazebo: "two to carry" (W5)
    { id: 'm_clock', name: S.mansion.items.floorclock, kind: 'medium', mesh: 'floorclock', heavy: true, value: 2500, pos: [6.68, 0, -7.3], yaw: -Math.PI / 2 },   // hall: "two to carry" (W5)
    { id: 'fake', name: S.mansion.items.fake, kind: 'medium', mesh: 'painting2', prop: true, value: 0, pos: [16.5, 0.4, -9.7], yaw: Math.PI },   // in the van, for contract 12 (M5)
  ],
};
