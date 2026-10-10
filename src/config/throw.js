// Throwing (W2a): the throw in VR (the hand's own swing), on a phone and a PC (aimed: an arc shows
// where it lands), the cans and bottles of each map, what the guard does with them.
// Units: metres, seconds, m/s (see src/config/index.js).

export const throwing = {
  vrK: 1.3,              // VR: a small item leaves the hand this much faster than the hand moved
  maxSpeed: 9,           // m/s, at most (two-handed items are not thrown: they drop, at most 6 m/s as before)
  thrownSpeed: 2.5,      // let go faster than this = a throw (the guard looks where it came from if hit)
  // phone / PC: hold, aim, let go
  aim: {
    holdS: 0.6,          // phone: hold «Покласти» this long to aim instead of putting it down (a normal press lasts up to ~0.45 s)
    speed: 7,            // m/s, the throw's speed (the distance comes from the angle of the view)
    up: 0.3,             // rad added to the view's pitch: looking straight ahead throws a little upwards
    minPitch: -0.6, maxPitch: 0.85,
    lookK: 1,            // phone: the aiming finger turns the view like the look finger
    points: 40,          // dots of the arc
  },
  // what lands where (noise: the hearing radius; points: suspicion when the guard hears it)
  can: { noise: 6, points: 10, found: 20, again: 30 },
  bottle: { breakSpeed: 5.2, noise: 10, sweep: 8, look: 6 },   // a thrown bottle breaks (put down from the hand it does not): the glass noise (CFG.alert.points.glass)
  hit: { points: 30, height: [0.8, 2.0], radius: 0.45 },       // a can on the guard's head: «Ай!»
  findRadius: 3,         // after looking at a noise, it notices a can / broken glass this close
  carryTimeout: 20,      // s: walking with a can that long (stuck) = it drops it and goes back to its plans
  // Each map: where the guard takes the cans (the kitchen's bin; floor), and the cans and bottles
  // (pos: bottom centre, y = the surface it stands on; floor: 1 = upstairs).
  maps: {
    dacha: {
      bin: [-8.65, -1.55, 0], binStand: [-7.9, -1.6, 0],
      items: [
        { id: 'can1', kind: 'can', pos: [-5.75, 0.76, -2.35], yaw: 0.3 },     // kitchen table
        { id: 'can2', kind: 'can', pos: [-5.35, 0.76, -2.8], yaw: 1.1 },      // kitchen table
        { id: 'can3', kind: 'can', pos: [6.5, 0, -2.2], yaw: 0 },             // pantry floor
        { id: 'can4', kind: 'can', pos: [1.8, 0, 2.2], yaw: 0.6 },            // yard, behind the house
        { id: 'bottle1', kind: 'bottle', pos: [8.3, 0, -1.2], yaw: 0 },       // pantry floor
        { id: 'bottle2', kind: 'bottle', pos: [1.2, 0.42, -11.7], yaw: 0 },   // living room, coffee table
      ],
    },
    mansion: {
      bin: [12.5, -13.0, 0], binStand: [11.5, -13.5, 0],
      items: [
        { id: 'can1', kind: 'can', pos: [9.2, 0.9, -14.0], yaw: 0.3 },        // kitchen island
        { id: 'can2', kind: 'can', pos: [9.9, 0.9, -14.3], yaw: 1.0 },        // kitchen island
        { id: 'can3', kind: 'can', pos: [11.2, 0.92, -4.5], yaw: 0 },         // garage workbench
        { id: 'can4', kind: 'can', pos: [12.2, 0.92, -4.5], yaw: 0.8 },       // garage workbench
        { id: 'can5', kind: 'can', pos: [-12.5, 0, 16.5], yaw: 0.4 },         // garden, by the shed path
        { id: 'bottle1', kind: 'bottle', pos: [9.4, 0, 0.6], yaw: 0 },        // garage, by the wine shelves
        { id: 'bottle2', kind: 'bottle', pos: [11.6, 0, 0.6], yaw: 0 },       // garage, by the wine shelves
        { id: 'bottle3', kind: 'bottle', pos: [1.0, 3.85, -1.8], yaw: 0, floor: 1 },   // billiard table upstairs
      ],
    },
  },
};
