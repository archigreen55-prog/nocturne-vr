// Noise: how far it carries (walls, masking); the floor ripples that show it.
// Units: metres, seconds, m/s (see src/config/index.js).

// A noise behind walls / closed doors carries occludedK of its radius; radiusK scales every noise
// (difficulty); a kettle or running water masks noises near it (maskK within maskR).
export const hearing = { occludedK: 0.5, radiusK: 1, maskK: 0.4 };

// Floor ripples that show a noise (plan «голос і кільця», 15.11: the owner's rule «what you see is what the
// guard hears»): the ring is the hearing radius itself (x the difficulty's hearing), a faint second ring how far
// it carries through a wall; the line keeps `line` m wide at any size.
// Plan 2026-11-19 «fixes after test 1», task 2 — «radar» (mode 'radar'): one thin ring per source (your voice, your
// steps, a door…) at its full radius at once, no growth from your feet and no second «through a wall» ring; a ping:
// bright when the sound comes, dim (`hold` of it) after `ping` s; the same ring pings again while the sound goes on
// (talking: every second), and `keep` s after its last ping it fades out over `fade` s. Near the camera it is see-through
// (`near`: from 0 at the first distance to full at the second, m from the eye), so the ring under your feet does not
// cover the view. mode 'grow': the old rings (growing from 0.2 r over `life` s, plus the wall ring) — for comparing.
export const ripple = {
  mode: 'radar',
  radiusK: 1, maxRadius: 24, line: 0.07,
  ping: 0.6, hold: 0.3, keep: 1.2, fade: 1.0, near: [1.0, 2.2],
  life: 0.7, wallRing: 0.45,   // mode 'grow' only: the old rings' life and the wall ring's brightness
};
