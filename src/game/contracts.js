// Contracts in this house (CFG.contracts): goal, bonus star, the best stars kept per difficulty.
//   ★1 goal met and you got away (drove off or escaped to the van)
//   ★2 + the bonus condition (clean: no full alarm, no shout; intact: nothing damaged or broken)
//   ★3 + both on the hard difficulty
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { money } from '../ui/board.js';
import { S } from '../i18n/index.js';

export const contracts = () => CFG.contracts;
export const contractById = (id) => CFG.contracts.find((c) => c.id === id) || CFG.contracts[0];

export function goalText(c, items) {
  const G = c.goal, parts = [];
  if (G.item) parts.push(S.goal.item((items.find((i) => i.id === G.item) || {}).name || G.item));
  if (G.sum) parts.push(S.goal.sum(money(G.sum)));
  if (G.noAlarm) parts.push(S.goal.noAlarm);
  if (G.noShout) parts.push(S.goal.noShout);
  return parts.join(', ');
}
export const bonusText = (c) => (c.bonus === 'intact' ? S.goal.bonusIntact : S.goal.bonusClean);

// Progress toward the goal during the round, for the wrist and the board.
export function progress(c, tally, loot) {
  if (c.goal.item) {
    const it = loot.items.find((i) => i.id === c.goal.item);
    return { done: !!(it && it.delivered), text: S.goal.itemProgress(it ? it.name : c.goal.item, !!(it && it.delivered)) };
  }
  return { done: tally.sum >= c.goal.sum, text: `${money(tally.sum)} / ${money(c.goal.sum)}` };
}

// r: round.result; ctx: { alarmed, noMic, difficulty, loot }
export function evaluate(c, r, ctx) {
  const got = r.kind === 'left' || r.kind === 'escaped';
  const G = c.goal;
  let goal = got;
  const why = [];
  if (G.item) { const it = ctx.loot.items.find((i) => i.id === G.item); if (!(it && it.delivered)) { goal = false; why.push(S.goal.why.noItem); } }
  if (G.sum && r.sum < G.sum) { goal = false; why.push(S.goal.why.sum(money(r.sum), money(G.sum))); }
  if (G.noAlarm && ctx.alarmed) { goal = false; why.push(S.goal.why.alarm); }
  if (G.noShout && (r.shouts > 0 || ctx.noMic)) { goal = false; why.push(ctx.noMic ? S.goal.why.noMic : S.goal.why.shouted); }
  if (!got) why.unshift(r.kind === 'caught' ? S.goal.why.caught : S.goal.why.late);
  // clean: no full alarm and no shout (without a microphone only the alarm counts)
  const bonus = c.bonus === 'intact' ? r.damaged === 0 && r.broken === 0 : !ctx.alarmed && r.shouts === 0;
  const stars = goal ? 1 + (bonus ? 1 : 0) + (bonus && ctx.difficulty === 'hard' ? 1 : 0) : 0;
  return { goal, bonus, stars, why };
}

// Best stars: { contractId: { easy, medium, hard } } in localStorage (shown for all modes together).
// Each record also goes to 'starsByMode' { mode: { contractId: { difficulty: stars } } }: VR, phone and
// laptop records stay apart for a future leaderboard (plan-phone-mode §9, decision 14).
export function bestStars(id) {
  const all = loadSetting('stars', {});
  return all[id] || { easy: 0, medium: 0, hard: 0 };
}
// Returns true when this is a new best for that contract and difficulty.
export function recordStars(id, difficulty, stars, mode) {
  if (mode) {
    const byMode = loadSetting('starsByMode', {});
    const m = byMode[mode] || (byMode[mode] = {}), c = m[id] || (m[id] = {});
    if (stars > (c[difficulty] || 0)) { c[difficulty] = stars; saveSetting('starsByMode', byMode); }
  }
  const all = loadSetting('stars', {});
  const b = all[id] || { easy: 0, medium: 0, hard: 0 };
  if (stars <= (b[difficulty] || 0)) return false;
  b[difficulty] = stars;
  all[id] = b;
  saveSetting('stars', all);
  return true;
}
export const starsText = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));
