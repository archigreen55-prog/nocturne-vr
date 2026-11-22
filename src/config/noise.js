// Noise: how far it carries (walls, masking); the floor ripples that show it.
// Units: metres, seconds, m/s (see src/config/index.js).

// A noise behind walls / closed doors carries occludedK of its radius; radiusK scales every noise
// (difficulty); a kettle or running water masks noises near it (maskK within maskR).
export const hearing = { occludedK: 0.5, radiusK: 1, maskK: 0.4 };

// Floor ripples that show a noise (plan «голос і кільця», 15.11: the owner's rule «what you see is what the
// guard hears»): the ring is the hearing radius itself (x the difficulty's hearing), a faint second ring how far
// it carries through a wall; the line keeps `line` m wide at any size.
// Mode 'wave' (owner 22.11, «a stone in the water / echolocation»; the default): every sound (a step, a whisper,
// talking, a shout, a throw) is ONE thin wave born at the source that spreads over the floor to its real hearing
// radius (the same the guard hears, never smaller) and dissolves at the edge. It reaches the edge in `grow` s
// (grow[0] for a ring of growR[0] m or less, grow[1] from growR[1] m; a shout x shoutK), easing out like a ripple
// on water; bright at the start, fading to nothing at the edge. One source (a player / device + the kind) starts a
// new wave at most once per `gap` s (talking: one a second; steps: per stride) — the waves never pile up or stand
// still. No «through a wall» ring; walls and furniture hide it (depth-tested); within `nearH` m of the camera
// (on the floor: from 0 at the first distance to full at the second) it is see-through, so it never covers the view.
// Mode 'radar' (plan 2026-11-19 task 2): one ring per source at its full radius at once, a ping that dims and comes
// again while the sound goes on (`ping`, `hold`, `keep`, `fade`), see-through within `near` m of the eye.
// Mode 'grow': the first rings (from 0.2 r over `life` s, plus the faint wall ring) — kept for comparing.
// To compare on a phone without a new version: add ?rings=radar (or grow, wave) to the address.
export const ripple = {
  mode: 'wave',
  radiusK: 1, maxRadius: 24, line: 0.07,
  grow: [0.6, 1.0], growR: [3, 15], shoutK: 1.3, start: 0.25, nearH: [0.45, 1.1],
  gap: { voice: 0.9, whisper: 0.9, breath: 0.9, device: 0.9, step: 0.3, run: 0.3 },
  ping: 0.6, hold: 0.3, keep: 1.2, fade: 1.0, near: [1.0, 2.2],   // mode 'radar' only
  life: 0.7, wallRing: 0.45,   // mode 'grow' only: the old rings' life and the wall ring's brightness
};
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('rings') : null;
  if (q === 'wave' || q === 'radar' || q === 'grow') ripple.mode = q;
}
