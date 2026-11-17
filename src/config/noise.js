// Noise: how far it carries (walls, masking); the floor ripples that show it.
// Units: metres, seconds, m/s (see src/config/index.js).

// A noise behind walls / closed doors carries occludedK of its radius; radiusK scales every noise
// (difficulty); a kettle or running water masks noises near it (maskK within maskR).
export const hearing = { occludedK: 0.5, radiusK: 1, maskK: 0.4 };

// Floor ripples that show a noise (plan «голос і кільця», 15.11: the owner's rule «what you see is what the
// guard hears»): the ring is the hearing radius itself (x the difficulty's hearing), a faint second ring how far
// it carries through a wall; the line keeps `line` m wide at any size.
export const ripple = { life: 0.7, radiusK: 1, maxRadius: 24, line: 0.07, wallRing: 0.45 };   // wallRing: its brightness
