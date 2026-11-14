// Round: the contract timer, the escape, the drop-off ring behind the van.
// Units: metres, seconds, m/s (see src/config/index.js).

export const round = {
  time: 8 * 60,          // contract timer (the dacha's medium: config/difficulty.js)
  warnAt: 7 * 60,        // lights start flickering ("the neighbours noticed")
  escapeTime: 75,        // after full alarm or the timer: this long to reach the van
  startDist: 4.5,        // the timer starts when you walk this far from the drop-off ring (the board is closer)
  vanZone: { x: 8.0, z: 10.2, r: 2.0 },  // the dacha's (world/yard.js VAN_ZONE); this close to the drop-off ring = "at the van" (the escape ends here)
};

// Drop-off ring behind the open van: head inside + loot in hands = it flies into the van.
export const dropZone = { x: 8.0, z: 10.2, r: 0.6, flyTime: 0.3 };   // the dacha's (world/yard.js DROP); a map's level sets its own
