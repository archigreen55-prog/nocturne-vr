// How visible the player is — the same rules the patrol uses, so the wrist tells the truth:
// light (flashlight beam or next to a lamp: seen 1.6x further), stance (crouched: 0.5x) and cover
// (crouched with furniture close by that reaches within CFG.stealth.coverBelowEyes of your eyes,
// and the patrol's line of sight to your face actually blocked).
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
      return d > range * 1.25 || level.losBlocked(g.x, (g.y || 0) + EYE, g.z, h.x, targetY(player), h.z);
    });
  }
  return { eye: hidden ? 'closed' : player.crouched ? 'half' : 'open', range, lit, cover, hidden };
}
