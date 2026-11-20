// Reach (plan 2026-11-19 «fixes after test 1», task 1): taking an item, pressing a device, reading a note,
// opening a door — only with no wall, closed door or floor between you and it.
// Units: metres (see src/config/index.js).

export const reach = {
  ring: 8,          // an item counts as reachable when its centre or one of this many points around it (its size) is
  minR: 0.06,       // ...the ring's radius at least this (a thin painting, the breaker: their centre sits in the wall)
  doorPull: 0.25,   // a door: the point this far off the doorway's centre toward you (past the wall's half thickness)
  slab: 0.3,        // a thing up to this far under a floor's level still belongs to that floor (the slab)
};
