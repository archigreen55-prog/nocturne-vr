// The watchers of the house for the phone HUD's guards panel: everyone in G.guards (the guards, and
// whoever else a level puts there later) as plain data — who, how much it sees you, its mark — plus the
// house scale and the pick of the main card. Pure functions; nothing here touches the DOM or the scene.
// A watcher is read as: x, y, z, state, meter (0..1, the sight meter), stunT, env.guard {id, name, kind}.
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

// 0 nothing, 1 «?» (it checks), 2 «!» (alarm; in full alarm it is everybody's)
export function markOf(g, alert) {
  if (alert && alert.full) return 2;
  if (g.state === 'chase') return 2;
  return g.state && g.state !== 'task' && g.state !== 'react' ? 1 : 0;
}

// every watcher, in G.guards order (the order on the panel does not change while the list does not)
export function listWatchers(guards, alert, head, floorY = 0) {
  return (guards || []).map((g, i) => {
    const spec = (g.env && g.env.guard) || {};
    return {
      i, id: spec.id || 'petrovych', name: spec.name || S.guard.name, kind: spec.kind || 'guard',
      seen: g.stunT > 0 ? 0 : clamp(100 * (g.meter || 0)),   // how much THIS one sees you (a stunned one sees nothing)
      mark: markOf(g, alert),
      dist: Math.hypot(g.x - head.x, g.z - head.z, (g.y || 0) - floorY),
    };
  });
}

// the house scale: the more of «heard» (alert.suspicion) and «seen» (the strongest of the watchers); 100 in full alarm
export function houseScale(list, alert) {
  if (alert.full) return 100;
  return clamp(Math.max(alert.suspicion || 0, ...list.map((w) => w.seen)));
}

// The main card: the most dangerous (a mark first, then how much it sees), the nearest among the equal.
// The caller runs this no more often than CFG.hud.mainEvery; `prev` (the current main's index) keeps its
// place while it is as dangerous as the best and not much further, so two at the same distance do not swap.
export function pickMain(list, prev) {
  if (!list.length) return -1;
  const band = (w) => Math.floor(w.seen / CFG.hud.seenBand);
  const worse = (a, b) => (b.mark - a.mark) || (band(b) - band(a));   // > 0: b is more dangerous than a
  let best = list[0];
  for (const w of list) if (worse(best, w) > 0 || (worse(best, w) === 0 && w.dist < best.dist)) best = w;
  const cur = list[prev];
  if (cur && worse(cur, best) === 0 && cur.dist <= best.dist + CFG.hud.mainStick) return cur.i;
  return best.i;
}
