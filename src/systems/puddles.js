// A step into a puddle (the dacha's yard: CFG.style.water.dacha, the dark discs on the grass): «плюх».
// Louder than a step at the same speed, also at a silent speed (CFG.puddle). Every device plays the splash
// where it is (positional); the noise itself is the host's (a guest's goes through the host: systems/net.js
// already sends the guest's position). The sound follows the microphone rule (audio/placeSfx.js).
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { playSplash, placeK } from '../audio/placeSfx.js';

const last = new Map();   // player -> { x, z, acc }

export const puddles = {
  id: 'puddles',
  world(dt) {
    if (!G.level || !G.active || dt <= 0) return;
    const list = ((CFG.style.water || {})[G.level.id] || []).filter((w) => !w.rings && w.y < 0.1);
    if (!list.length) return;
    const P = CFG.puddle, live = G.round && G.round.phase !== 'result' && G.caughtT < 0;
    for (const p of G.players || []) {
      const s = last.get(p) || { x: p.head.x, z: p.head.z, acc: 0 };
      last.set(p, s);
      const d = Math.hypot(p.head.x - s.x, p.head.z - s.z), speed = d / dt;
      s.x = p.head.x; s.z = p.head.z;
      if (speed > 6) { s.acc = 0; continue; }   // a teleport (a new round), not a step
      const w = list.find((q) => Math.hypot(p.head.x - q.x, p.head.z - q.z) < q.r);
      if (!w || speed < P.minSpeed) { if (!w) s.acc = 0; continue; }
      s.acc += d;
      if (s.acc < P.stride) continue;
      s.acc = 0;
      // the radius by speed: creeping = minRadius, the stick's full = walkRadius, running = runRadius (config/placeSound.js)
      const quiet = CFG.player.quietSpeed, top = CFG.player.maxSpeed, run = CFG.sprint.speed, lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
      const k = Math.min(1, Math.max(0, (speed - quiet) / (top - quiet)));
      let radius = speed <= quiet ? P.minRadius : speed <= top ? lerp(P.minRadius, P.walkRadius, k) : lerp(P.walkRadius, P.runRadius, (speed - top) / (run - top));
      if (p.crouched || p.virtualCrouch) radius *= P.crouchK;
      if (!live) continue;
      playSplash({ x: p.head.x, y: 0.05, z: p.head.z }, k, placeK(G.mic));
      if (!G.isGuest) G.noise.emit(p.head.x, p.head.z, radius, 'splash', { who: p, wallK: P.wallK });
    }
  },
};
