// How visible the player is — the same rules the patrol uses, so the wrist tells the truth:
// light (flashlight beam or next to a lamp: seen 1.6x further), stance (crouched: 0.5x) and cover
// (crouched with furniture close by that reaches within CFG.stealth.coverBelowEyes of your eyes,
// and that furniture or a wall between you and the patrol: sightBlocked).
import { CFG } from '../config/index.js';
import { power } from '../world/devices.js';

const EYE = 1.62;

function angleDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

// W17: a lamp lights its own floor only (l.y: its floor's height; the gallery's lamp is upstairs), and
// not through a wall or a closed door (the nightlight in the dacha's corridor no longer lights the hall)
export function lampLights(level, l, x, z, y = 0) {
  if (Math.hypot(x - l.x, z - l.z) >= l.r) return false;
  if (!level) return true;
  const ly = l.y || 0;
  if (level.floorIndex && level.floorIndex(y) !== level.floorIndex(ly)) return false;
  return !level.soundOccluded(l.x, l.z, x, z, ly, ly);
}
export function nearLamp(x, z, y = 0, level = null) {
  if (power.dark) return false;   // W2a: the breaker is off
  return CFG.stealth.lamps.some((l) => lampLights(level, l, x, z, y));
}

// Is (x, z) inside the patrol's flashlight beam (and not behind a wall)?
export function inBeam(patrol, level, x, z, y = 0) {
  const dx = x - patrol.x, dz = z - patrol.z, d = Math.hypot(dx, dz, y - (patrol.y || 0));
  if (d > 14) return false;
  if (patrol.lampR) return d < patrol.lampR && !level.soundOccluded(patrol.x, patrol.z, x, z, patrol.y || 0, y);   // a hand lamp (W6)
  const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), patrol.heading + patrol.headYaw));
  return ang < CFG.patrol.beamHalf && !level.soundOccluded(patrol.x, patrol.z, x, z, patrol.y || 0, y);
}

// Furniture close to the head that reaches up to (almost) eye height.
export function coverNear(level, head) {
  const S = CFG.stealth, need = head.y - S.coverBelowEyes;
  for (const b of level.furniture) {
    if (b.h < need) continue;
    const dx = Math.max(b.minX - head.x, 0, head.x - b.maxX), dz = Math.max(b.minZ - head.z, 0, head.z - b.maxZ);
    if (Math.hypot(dx, dz) < S.coverDist) return true;
  }
  return false;
}

// The point the patrol has to see: your eyes standing, your face (lower) crouched.
export function targetY(player) { return player.head.y - (player.crouched ? CFG.patrol.coverDrop : 0); }

// Crouched next to cover that stands between you and the guard's eyes (stealth-house fix): the
// furniture piece reaches within CFG.stealth.coverBelowEyes of your eyes (the same rule as coverNear),
// the guard's line to you crosses its footprint, and it is within CFG.stealth.coverDist of you. Without
// this, a crouched player (eyes 1.10 m on a phone / PC) behind a 0.95 m sofa was seen by a guard closer
// than ~2.5 m: its line from 1.62 m down to your face passed just over the sofa's back.
// A guard looking down from the floor above (eyes more than coverMaxEye over your floor) is not fooled.
export function coverBlocks(level, ax, ay, az, player) {
  if (!player.crouched || !level.furniture) return false;
  const S = CFG.stealth, h = player.head, fy = player.floorY || 0;
  if (ay - fy > S.coverMaxEye) return false;
  const dx = h.x - ax, dz = h.z - az, len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const need = h.y - S.coverBelowEyes, f = level.floorIndex ? level.floorIndex(fy) : 0;
  for (const b of level.furniture) {
    if (b.h < need || (b.floor || 0) !== f) continue;
    // slab test: where the guard -> you segment (t 0..1) is inside the footprint
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < b.minX || ax > b.maxX) continue; }
    else { let u0 = (b.minX - ax) / dx, u1 = (b.maxX - ax) / dx; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); }
    if (Math.abs(dz) < 1e-9) { if (az < b.minZ || az > b.maxZ) continue; }
    else { let v0 = (b.minZ - az) / dz, v1 = (b.maxZ - az) / dz; if (v0 > v1) [v0, v1] = [v1, v0]; t0 = Math.max(t0, v0); t1 = Math.min(t1, v1); }
    if (t0 > t1 || t0 <= 0) continue;              // misses it, or the guard itself is at it
    if ((1 - t1) * len > S.coverDist) continue;    // the piece is not next to you
    return true;
  }
  return false;
}

// Does something hide this player from eyes at (ax, ay, az)? Walls, closed doors, tall furniture on
// the line, or (crouched) cover next to you. The guards' sight, the wrist and the human guard's
// screen all ask this.
export function sightBlocked(level, ax, ay, az, player) {
  const h = player.head;
  return level.losBlocked(ax, ay, az, h.x, targetY(player), h.z) || coverBlocks(level, ax, ay, az, player);
}

// Wrist read-out: { eye: 'open' | 'half' | 'closed', range (m it sees you from), lit, cover, hidden }.
// patrol: the guard, or every guard of the map (W6): lit by any, hidden from all.
export function stealthState(player, level, patrol) {
  const P = CFG.patrol, h = player.head, guards = Array.isArray(patrol) ? patrol : [patrol];
  const lit = guards.some((g) => inBeam(g, level, h.x, h.z, player.floorY || 0)) || nearLamp(h.x, h.z, player.floorY || 0, level);
  const range = P.sight * (player.crouched ? P.crouchK : 1) * (lit ? P.beamK : 1);
  const inPocket = !!(level.pockets && level.pockets.some((p) => h.x >= p.minX && h.x <= p.maxX && h.z >= p.minZ && h.z <= p.maxZ && (level.floorIndex ? level.floorIndex(player.floorY || 0) : 0) === (p.floor || 0)));
  const cover = (player.crouched && coverNear(level, h)) || inPocket;   // W6: a small room with a door hides you while its door is shut
  let hidden = false;
  if (cover) {
    hidden = guards.every((g) => {
      const d = Math.hypot(h.x - g.x, h.z - g.z, (player.floorY || 0) - (g.y || 0));
      return d > range * 1.25 || sightBlocked(level, g.x, (g.y || 0) + EYE, g.z, player);
    });
  }
  return { eye: hidden ? 'closed' : player.crouched ? 'half' : 'open', range, lit, cover, hidden };
}
