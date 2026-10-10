// Every body in the round (plan-multiplayer §4.1): G.players. Offline it is [G.player]; with friends it
// also holds the remote players (src/net/remotePlayer.js), later the bot. The systems that count the world
// (the guards, the lurkers, the loot, the round clock, the noise) go through the list; the ones that draw
// or read the controls keep using G.player (this device's own body).
// A player is anything with { head: {x, y, z}, yaw, floorY, crouched, speed, running, stepNoise, stepKind }.

// the list as given (an array), or one player as a list of one
export const asList = (who) => (Array.isArray(who) ? who : who ? [who] : []);

// distance in 3D on the floor plan: a floor above / below counts as far (the guards' rule)
export const dist3 = (p, x, z, y = 0) => Math.hypot(p.head.x - x, p.head.z - z, (p.floorY || 0) - y);

// the player nearest to (x, z, y); null for an empty list
export function nearest(players, x, z, y = 0) {
  let best = null, bestD = Infinity;
  for (const p of asList(players)) { const d = dist3(p, x, z, y); if (d < bestD) { bestD = d; best = p; } }
  return best;
}
