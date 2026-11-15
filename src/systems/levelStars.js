// Campaign v2 (plan 2026-11-15 §3.2, §3.4): the moment a star of the level is lost, the HUD says so — «★★
// втрачено: тривога», «★★★ втрачено: «?» ×1» — so the player knows a new round is the way to it. Each star
// once a round. The conditions are the verdict's own (game/contracts.js evaluate): a full alarm or a shout
// for ★★; the level's ★★★ when it can only get worse (time over, a damaged or broken item, a scare, a «?»).
// The tests' classic game and the rehearsal: nothing.
import { G } from './state.js';
import { flash } from './messages.js';
import { isLevel } from '../game/contracts.js';
import { fmtTime } from '../ui/board.js';
import { S } from '../i18n/index.js';

const local = { quiet: false, star3: false };
const sum = (list, f) => (list || []).reduce((n, x) => n + (f(x) || 0), 0);

function star3Lost(T, round) {
  const W = S.campaign2.why;
  if (T.time !== undefined) return round.t > T.time ? W.time(fmtTime(round.t, true)) : '';
  if (T.intact) { const t = G.loot.tally(); return t.damaged || t.broken ? W.damaged : ''; }
  if (T.scares !== undefined) { const n = sum(G.lurkers || [G.lurker], (l) => l && l.scares); return n > T.scares ? W.scares(n) : ''; }
  if (T.doubts !== undefined) { const n = sum(G.guards, (g) => g.doubts); return n > T.doubts ? W.doubts(n) : ''; }
  return '';
}

// what this round has lost so far (the pause menu marks it): { quiet, star3 }
export const lostNow = () => ({ quiet: local.quiet, star3: local.star3 });

export const levelStars = {
  id: 'levelStars',
  present() {
    const { round, contract } = G;
    if (!round || !contract || !isLevel(contract) || contract.bonus === 'none' || G.role === 'guard') return;
    if (round.phase === 'ready') { local.quiet = false; local.star3 = false; }   // a new round
    if (round.phase !== 'heist' && round.phase !== 'escape') return;
    const L = S.campaign2.lost, W = S.campaign2.why;
    if (!local.quiet && (round.alarmed || round.shouts > 0)) {
      local.quiet = true;
      flash(L.quiet(round.alarmed && round.shouts > 0 ? W.alarmShout : round.alarmed ? W.alarm : W.shout), 3, '#ff9f43');
    }
    if (!local.star3 && contract.star3) {
      const why = star3Lost(contract.star3, round);
      if (why) { local.star3 = true; flash(L.star3(why), 3, '#ff9f43'); }
    }
  },
};
