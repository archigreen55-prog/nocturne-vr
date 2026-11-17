// The player: walking speeds and step noise; holding your breath.
// Units: metres, seconds, m/s (see src/config/index.js).

export const player = {
  maxSpeed: 2.0,         // stick fully forward
  quietSpeed: 1.0,       // up to this the steps are silent
  stepLength: 0.7,       // one step noise per this many metres above quietSpeed
  stepRadius: [1.5, 6],  // step noise radius at quietSpeed .. maxSpeed
  carryMediumK: 0.6,     // speed multiplier while carrying a two-handed item
};

// A / Shift: the mic is ignored while you hold your breath. The breath is a TANK like the run's stamina (config/sprint.js): `hold` s
// of it, spent 1 s per second while held, refilled slowly while not — from empty to full in `refill` s (hold / refill s per second);
// you can start holding when at least `minStart` s are in the tank, and an empty tank lets go by itself. A tap shorter than `tap`
// costs nothing (an accidental press is not punished).
export const breath = { hold: 6, refill: 20, minStart: 1, tap: 0.25 };
