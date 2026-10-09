// Round: the contract timer, the escape, the drop-off ring behind the van.
// Units: metres, seconds, m/s (see src/config/index.js).

export const round = {
  time: 7 * 60,          // contract timer
  warnAt: 6 * 60,        // lights start flickering ("the neighbours noticed")
  escapeTime: 60,        // after full alarm or the timer: this long to reach the van
  startDist: 4.5,        // the timer starts when you walk this far from the drop-off ring (the board is closer)
  vanZone: { x: 4.4, z: 6.75, r: 2.0 },  // this close to the drop-off ring = "at the van" (the escape ends here)
};

// Drop-off ring behind the open van: head inside + loot in hands = it flies into the van.
export const dropZone = { x: 4.4, z: 6.75, r: 0.6, flyTime: 0.3 };
