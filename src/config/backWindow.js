// The dacha's back window (the «stealth-house» branch, redone in claude/dacha-window): one window in the north
// wall (the living room); it opens like a door and you climb through it, crouched. One button does it all:
// you are in the zone in front of the window (either side) -> «Лізти у вікно» -> the game lines you up, opens
// the sash if it is shut (slowly: no creak), raises the camera to the sill, carries it over and lowers it:
// you are crouched on the other side. The guards never use it.
// Units: metres, seconds, radians (see src/config/index.js).
export const backWindow = {
  x: 4.0, w: 1.1,          // its centre along the north wall (z = -14) and its width (as the other windows)
  sill: 0.9, top: 2.0,     // the opening from the sill to its top
  creakK: 0.35,            // its creak x this: a quick swing is heard ~4 m away (a door: ~8 m); a slow one is silent
  openAngle: 1.0,          // rad: open this far, a body can pass (the climb waits for it)
  openTo: 1.2,             // rad: the climb opens the sash this far
  // the zone of the button: a rectangle on each side of the wall, along the window and out from the wall's face
  zone: { halfW: 0.9, depth: 1.2, minDot: -0.17 },   // minDot: your view's direction x the direction to the window (-0.17 = not with your back to it)
  stand: 0.55,             // m from the wall's centre line where you are lined up (not further than maxSlide sideways from the window's centre)
  maxSlide: 0.45,
  land: 0.6,               // m: where you land, from the wall's centre line
  // the sequence (seconds): align, open (only if shut), rise, carry, drop (phone / PC; ~2.2 s open, ~3.1 s shut)
  steps: { align: 0.35, open: 0.9, rise: 0.45, carry: 0.8, drop: 0.6 },
  // the camera's height (m above the floor) and tilt (rad, + = up): standing / crouched -> the sill's top -> over it -> crouched
  eye: { rise: 1.55, over: 1.4, land: 1.1 }, pitch: { rise: -0.12, over: -0.44 },
  carryItems: true,        // a small item (in a hand, a pocket) goes along; a two-handed one does not (a message)
  // VR: the camera is not moved or lifted (a real head cannot be): the picture fades out, the body goes over, it fades in
  vr: { fadeOut: 0.3, fadeIn: 0.4 },
  cancelUntil: 0.45,       // a guest's climb the host refused (busy window): can be taken back until this share of the carry step
};
