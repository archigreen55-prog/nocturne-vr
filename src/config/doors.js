// Doors: quick and slow swings, creaks.
// Units: metres, seconds, m/s (see src/config/index.js).

export const doors = {
  fastTime: 0.35,        // trigger tap / keyboard T: quick shove (creaks)
  slowTime: 2.2,         // keyboard Q: slow swing (quiet)
  creakFrom: 150,        // deg/s: the hinge starts creaking (quietly) above this swing speed...
  creakFull: 300,        // ...and creaks at full loudness from this speed
  speedSmooth: 0.2,      // s, smoothing of the swing speed (hand jitter does not creak)
  creakRadius: 9,        // noise radius of a full-loudness creak
  handleReach: 0.3,      // hand this close to the handle + trigger = drag the door by hand
};
