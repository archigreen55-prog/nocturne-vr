// The player: walking speeds and step noise; holding your breath.
// Units: metres, seconds, m/s (see src/config/index.js).

export const player = {
  maxSpeed: 2.0,         // stick fully forward
  quietSpeed: 1.0,       // up to this the steps are silent
  stepLength: 0.7,       // one step noise per this many metres above quietSpeed
  stepRadius: [1.5, 6],  // step noise radius at quietSpeed .. maxSpeed
  carryMediumK: 0.6,     // speed multiplier while carrying a two-handed item
};

// A / Shift: the mic is ignored for up to `hold` s. Cooldown = cooldown x (time held / hold), at least
// cooldownMin; a tap shorter than `tap` costs nothing (an accidental press is not punished).
export const breath = { hold: 6, cooldown: 20, cooldownMin: 2, tap: 0.25 };
