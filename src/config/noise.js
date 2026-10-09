// Noise: how far it carries (walls, masking); the floor ripples that show it.
// Units: metres, seconds, m/s (see src/config/index.js).

// A noise behind walls / closed doors carries occludedK of its radius; radiusK scales every noise
// (difficulty); a kettle or running water masks noises near it (maskK within maskR).
export const hearing = { occludedK: 0.5, radiusK: 1, maskK: 0.4 };

// Floor ripples that show a noise: one thin ring, visual only (the hearing radius is not changed).
export const ripple = { life: 0.7, radiusK: 0.4, maxRadius: 3 };
