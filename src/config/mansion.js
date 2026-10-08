// Map 2, the mansion (W6): the guard's rounds there and its loot. Geometry: src/world/mansion/.
// Units: metres, seconds, m/s (see src/config/index.js). The numbers of sight, hearing and the
// suspicion meter are the same as on the first map (src/config/guard.js); only places differ.
import { S } from '../i18n/index.js';

const R = S.rooms, M = S.mansion.rooms;

export const mansion = {
  // Valera: the ground floor and the garden (M1: the ground floor; the garden and the second guard come with M3)
  guard: {
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
      { name: S.mansion.spots.pantry, at: [-11, -10.5], from: [-9.6, -8.5] },
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

  // M1: three items on the ground floor to test carrying; the 14 of the plan come with M4.
  items: [
    { id: 'm_chest', name: S.mansion.items.chest, kind: 'medium', mesh: 'chest', value: 1300, pos: [9.5, 0, -3.0], yaw: 0.2 },
    { id: 'm_vase', name: S.mansion.items.vase, kind: 'medium', mesh: 'vase', value: 1200, pos: [4.5, 0, -10.5], yaw: 0 },
    { id: 'm_candelabrum', name: S.mansion.items.candelabrum, kind: 'light', mesh: 'candelabrum', value: 300, pos: [3.0, 0, -16.5], yaw: 0 },
  ],
};
