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

// W6: goals of the second map. floorItems: n items of that floor delivered; swap: the prop stands where
// the item stood (within m) and no guard noticed the item gone; locked: a placeholder contract.
const nameOf = (items, id) => (items.find((i) => i.id === id) || {}).name || id;
const floorDelivered = (loot, F) => loot.items.filter((i) => i.delivered && (i.def.floor || 0) === F.floor).length;
function swapState(loot, W) {
  const it = loot.items.find((i) => i.id === W.item), fake = loot.items.find((i) => i.id === W.prop);
  const p = fake && fake.mesh.position, [hx, hy, hz] = it ? it.def.pos : [0, 0, 0];
  const placed = !!(fake && !fake.held && Math.hypot(p.x - hx, p.z - hz) < W.within && Math.abs(p.y - hy) < 0.4);
  return { it, placed, delivered: !!(it && it.delivered) };
}
export function goalText(c, items) {
  const G = c.goal, parts = [];
  if (c.locked) return S.goal.locked(c.locked);
  if (G.item) parts.push(S.goal.item(nameOf(items, G.item)));
  if (G.floorItems) parts.push(S.goal.floorItems(G.floorItems.n));
  if (G.swap) parts.push(S.goal.swap(nameOf(items, G.swap.item)));
  if (G.sum) parts.push(S.goal.sum(money(G.sum)));
  if (G.noAlarm) parts.push(S.goal.noAlarm);
  if (G.noShout) parts.push(S.goal.noShout);
  return parts.join(', ');
}
export const bonusText = (c) => (c.bonus === 'intact' ? S.goal.bonusIntact : S.goal.bonusClean);

// Progress toward the goal during the round, for the wrist and the board.
export function progress(c, tally, loot) {
  if (c.locked) return { done: false, text: S.goal.locked(c.locked) };
  if (c.goal.floorItems) { const n = floorDelivered(loot, c.goal.floorItems); return { done: n >= c.goal.floorItems.n, text: S.goal.floorProgress(n, c.goal.floorItems.n) }; }
  if (c.goal.swap) { const w = swapState(loot, c.goal.swap); return { done: w.placed && w.delivered, text: S.goal.swapProgress(w.placed, w.delivered) }; }
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
  if (c.locked) { goal = false; why.push(S.goal.locked(c.locked)); }
  if (G.item) { const it = ctx.loot.items.find((i) => i.id === G.item); if (!(it && it.delivered)) { goal = false; why.push(S.goal.why.noItem); } }
  if (G.floorItems && floorDelivered(ctx.loot, G.floorItems) < G.floorItems.n) { goal = false; why.push(S.goal.why.floorItems(floorDelivered(ctx.loot, G.floorItems), G.floorItems.n)); }
  if (G.swap) {
    const w = swapState(ctx.loot, G.swap), noticed = (ctx.guards || []).some((g) => g.brain && w.it && g.brain.missing.has(w.it));
    if (!w.delivered) { goal = false; why.push(S.goal.why.noItem); }
    else if (!w.placed) { goal = false; why.push(S.goal.why.noSwap); }
    else if (noticed) { goal = false; why.push(S.goal.why.swapSeen); }
  }
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
