// Reach (plan 2026-11-19 «fixes after test 1», task 1): you take an item, press a device, read a note or
// open a door only with no wall, closed door or floor between you and it — on the phone, the PC, in VR
// and for a friend (the host checks a guest's «Взяти» the same way). Furniture does not count: an item on
// a shelf is taken. The line goes from your head to the thing: its centre or a point of a ring of its size
// around it (a painting on a wall and the breaker have their centre in the wall itself), so «any part of it
// you can reach». Pure functions of the level: the same for both maps.
import { CFG } from '../config/index.js';

const levelsOf = (level) => (level.floors && level.floors.levels) || [0];

// The floor a thing at height y is on: the highest floor whose level is at most CFG.reach.slab above it
// (an item at 1.6 m on the ground floor stays on the ground floor).
export function floorOf(level, y = 0) {
  const L = levelsOf(level);
  let f = 0;
  for (let j = 1; j < L.length; j++) if (y >= L[j] - CFG.reach.slab) f = j;
  return f;
}

// A wall or a closed door of floor f between a and b. except: a door that does not count (the one you open).
export function blockedBetween(level, ax, az, bx, bz, f = 0, except = null) {
  if (level.wallBlocked(ax, az, bx, bz, f)) return true;
  for (const d of level.doors) if ((d.floor || 0) === f && d !== except && d.blocksSegment(ax, az, bx, bz)) return true;
  return false;
}

// Can a player whose head is at (hx, hz) and who stands at floorY reach a thing centred at (tx, ty, tz) of
// horizontal size r? Same floor, and its centre or a point of the ring of radius r around it in the clear.
export function reachClear(level, hx, hz, floorY, tx, ty, tz, r = 0) {
  if (!level || !level.wallBlocked) return true;   // a level without the test (none today): as before
  const f = floorOf(level, floorY + 0.05);
  if (floorOf(level, ty) !== f) return false;
  if (!blockedBetween(level, hx, hz, tx, tz, f)) return true;
  const R = Math.max(r, CFG.reach.minR), n = CFG.reach.ring;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (!blockedBetween(level, hx, hz, tx + Math.cos(a) * R, tz + Math.sin(a) * R, f)) return true;
  }
  return false;
}

// A door: the doorway from your side (its centre pulled toward you past the wall's half thickness), no other
// wall or closed door in between; its own leaf does not count.
export function doorReach(level, door, hx, hz) {
  if (!level || !level.wallBlocked) return true;
  const dx = hx - door.cx, dz = hz - door.cz, d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const k = Math.min(CFG.reach.doorPull, d * 0.9) / d;
  return !blockedBetween(level, hx, hz, door.cx + dx * k, door.cz + dz * k, door.floor || 0, door);
}

// A falling item went from a to b this step: a wall or a closed door in between (the fall's own step can
// jump over a wall's face: the edges push a centre that got past one further in). y: its height.
export const sweptBlocked = (level, ax, az, bx, bz, y) => !!(level && level.wallBlocked) && blockedBetween(level, ax, az, bx, bz, floorOf(level, y));
