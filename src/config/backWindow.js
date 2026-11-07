// The dacha's back window (the «stealth-house» branch): one window in the north wall (the living
// room), it opens like a door (a quiet creak) and you climb through it crouched. The guards never use it.
// Units: metres, seconds (see src/config/index.js).
export const backWindow = {
  x: 4.0, w: 1.1,          // its centre along the north wall (z = -14) and its width (as the other windows)
  sill: 0.9, top: 2.0,     // the opening from the sill to its top
  creakK: 0.35,            // its creak x this: a quick swing is heard ~4 m away (a door: ~8 m); a slow one is silent
  openAngle: 1.0,          // rad: open this far, you can climb through
  reach: 1.1,              // m: your head this close to the window's centre (and facing it) to climb
  climbTime: 1.5,          // s: climbing through, crouched; you cannot walk meanwhile
  land: 0.6,               // m: where you land, from the wall's centre line
};
