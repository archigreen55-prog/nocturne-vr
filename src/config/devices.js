// Devices (W2a): the radio, the house phone (rung from a second handset) and the breaker (the
// lights). You switch them on; the guard goes to switch them off — a window elsewhere in the house.
// Units: metres, seconds, m/s (see src/config/index.js).

export const devices = {
  reach: 0.35,           // VR: the hand this close to a device = the trigger uses it (else: doors, as before)
  aimReach: 1.8,         // phone / PC: a device in front of the eyes this close = the context button / E uses it
  radio: { noise: 12, every: 2, mask: 4, dance: 2 },            // heard this far every `every` s (walls: x occludedK); a guard within `mask` m hears other noises worse; it dances `dance` s
  phone: { delay: 3, ring: 20, noise: 12, every: 1.5, talk: 12, hearK: 0.5, fovK: 0.6 },   // rings `delay` s after the handset, for `ring` s
  breaker: { click: 5, flicker: 1, darkSightK: 0.6, backAfter: 60, flip: 1.5 },            // the lights come back when the guard flips it, or after `backAfter` s
  look: 2.5,             // s it looks around after switching something off
  // suspicion: the first time a device "switches on by itself", then the same device again; the
  // third time it is unplugged for the rest of the round (decision R5 A)
  points: [10, 30, 30], unplugAt: 3,
  levels: {              // easy: half the suspicion; hard: from the second time it also checks 2 hiding spots nearby
    easy: { pointsK: 0.5, search: false },
    medium: { pointsK: 1, search: false },
    hard: { pointsK: 1, search: true },
  },
  // Each map: id, kind, where it stands (bottom centre; y = the surface), its yaw, where the guard
  // stands to use it ([x, z, floor]); `lights` = the scene's point lights the breaker leaves on
  // (indexes; the dacha's fireplace embers are not electric).
  maps: {
    dacha: {
      keepLights: [1],
      list: [
        { id: 'radio', kind: 'radio', pos: [-8.0, 0.92, -4.55], yaw: 0, stand: [-8.0, -3.75, 0] },                 // kitchen counter
        { id: 'phone', kind: 'phone', pos: [2.62, 0.45, -1.75], yaw: -Math.PI / 2, stand: [1.75, -1.75, 0] },      // hall bench
        { id: 'handset', kind: 'handset', pos: [6.25, 0.55, -13.6], yaw: 0, stand: null, rings: 'phone' },          // bedroom nightstand
        { id: 'breaker', kind: 'breaker', pos: [8.2, 1.35, -4.91], yaw: 0, wall: true, stand: [8.2, -4.2, 0] },    // pantry wall (east of the door)
      ],
    },
    mansion: {
      keepLights: [],
      list: [
        { id: 'radio', kind: 'radio', pos: [7.5, 0.92, -17.55], yaw: 0, stand: [7.5, -16.6, 0] },                  // kitchen counter
        { id: 'radio2', kind: 'radio', pos: [8.0, 4.05, -4.2], yaw: 0, stand: [8.6, -2.8, 1], floor: 1 },          // music room upstairs, on the piano
        { id: 'phone', kind: 'phone', pos: [1.4, 0.8, -11.7], yaw: 0, stand: [2.2, -10.9, 0] },                    // hall console
        { id: 'handset', kind: 'handset', pos: [10.2, 0.76, -10.7], yaw: Math.PI, stand: null, rings: 'phone' },   // study desk
        { id: 'breaker', kind: 'breaker', pos: [-0.2, 1.35, -4.93], yaw: 0, wall: true, stand: [-0.2, -4.1, 0] },  // boiler room wall
      ],
    },
  },
};
