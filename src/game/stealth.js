// How visible the player is — the same rules the patrol uses, so the wrist tells the truth:
// light (flashlight beam or next to a lamp: seen 1.6x further), stance (crouched: 0.5x) and cover
// (crouched with furniture close by that reaches within CFG.stealth.coverBelowEyes of your eyes,
// and the patrol's line of sight to your face actually blocked).
import { CFG } from '../config/index.js';

const EYE = 1.62;

function angleDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

export function nearLamp(x, z) {
  return CFG.stealth.lamps.some((l) => Math.hypot(x - l.x, z - l.z) < l.r);
}

// Is (x, z) inside the patrol's flashlight beam (and not behind a wall)?
export function inBeam(patrol, level, x, z) {
  const dx = x - patrol.x, dz = z - patrol.z, d = Math.hypot(dx, dz);
  if (d > 14) return false;
  const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), patrol.heading + patrol.headYaw));
  return ang < CFG.patrol.beamHalf && !level.soundOccluded(patrol.x, patrol.z, x, z);
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

// Wrist read-out: { eye: 'open' | 'half' | 'closed', range (m it sees you from), lit, cover, hidden }
export function stealthState(player, level, patrol) {
  const P = CFG.patrol, h = player.head;
  const lit = inBeam(patrol, level, h.x, h.z) || nearLamp(h.x, h.z);
  const range = P.sight * (player.crouched ? P.crouchK : 1) * (lit ? P.beamK : 1);
  const cover = player.crouched && coverNear(level, h);
  let hidden = false;
  if (cover) {
    const d = Math.hypot(h.x - patrol.x, h.z - patrol.z);
    hidden = d > range * 1.25 || level.losBlocked(patrol.x, EYE, patrol.z, h.x, targetY(player), h.z);
  }
  return { eye: hidden ? 'closed' : player.crouched ? 'half' : 'open', range, lit, cover, hidden };
}
