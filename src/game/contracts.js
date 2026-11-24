// Contracts in this house (CFG.contracts): goal, bonus star, the best stars kept per difficulty.
//   ★1 goal met and you got away (drove off or escaped to the van)
//   ★2 + the bonus condition (clean: no full alarm, no shout; intact: nothing damaged or broken)
//   ★3 + both on the hard difficulty
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { money, fmtTime } from '../ui/board.js';
import { mischief } from './mischief.js';
import { S } from '../i18n/index.js';

// ---------- co-op: the money goal by the number of thieves (plan 2026-11-22-coop-campaign §1) ----------
// n thieves in the round (counted when the clock starts, the guard of W15 is not one) = every money goal x k,
// k = 1 + goalStep x (n - 1) (CFG.coop). Only dollars: the goal's `sum` and a ★★★ `sum`; items, counts, floor items,
// times stay. One value for the whole game (the host decides it; a guest takes the host's), 1 offline.
let thieves = 1;
export const goalPlayers = () => thieves;
// sets n (1 .. the room's size); true when it changed
export function setGoalPlayers(n) {
  const v = Math.max(1, Math.min(CFG.net.maxThieves || 4, Math.floor(+n) || 1));
  const changed = v !== thieves;
  thieves = v;
  return changed;
}
export const goalK = (n = thieves) => 1 + CFG.coop.goalStep * (Math.max(1, Math.floor(n)) - 1);
export const scaleSum = (sum, n = thieves) => (n <= 1 || sum < CFG.coop.round ? sum : Math.round(sum * goalK(n) / CFG.coop.round) * CFG.coop.round);   // a placeholder's $1 stays $1
const scaled = new WeakMap();   // contract -> { n, c }: the scaled copy for the n it was made for
const copies = new WeakSet();   // the scaled copies themselves: never scaled again
// The contract as it is for n thieves: goal.sum and star3.sum multiplied (the contract itself when nothing changes)
export function scaledGoal(c, n = thieves) {
  if (!c || n <= 1 || copies.has(c) || (!(c.goal && c.goal.sum) && !(c.star3 && c.star3.sum !== undefined))) return c;
  const had = scaled.get(c);
  if (had && had.n === n) return had.c;
  const v = { ...c };
  if (c.goal && c.goal.sum) v.goal = { ...c.goal, sum: scaleSum(c.goal.sum, n) };
  if (c.star3 && c.star3.sum !== undefined) v.star3 = { ...c.star3, sum: scaleSum(c.star3.sum, n) };
  scaled.set(c, { n, c: v }); copies.add(v);
  return v;
}

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
  c = scaledGoal(c);
  const G = c.goal, parts = [];
  if (c.locked) return S.goal.locked(c.locked);
  if (G.item) parts.push(S.goal.item(nameOf(items, G.item)));
  if (G.count) parts.push(S.goal.count(G.count));   // W19: the rehearsal
  if (G.floorItems) parts.push(S.goal.floorItems(G.floorItems.n));
  if (G.swap) parts.push(S.goal.swap(nameOf(items, G.swap.item)));
  if (G.sum) parts.push(S.goal.sum(money(G.sum)));
  if (G.mischief) parts.push(S.goal.mischief(G.mischief));   // W2b: contract 7
  if (G.noAlarm) parts.push(S.goal.noAlarm);
  if (G.noShout) parts.push(S.goal.noShout);
  return parts.join(', ');
}
// the goal with its price in thieves, for a screen that has room: «$1,050 (2 злодії)» (nothing added for one thief or a goal without money)
export const goalLabel = (c, items) => (scaledGoal(c) !== c ? `${goalText(c, items)} (${S.coop2.thieves(thieves)})` : goalText(c, items));
export const bonusText = (c) => (c.bonus === 'none' ? S.goal.bonusNone : c.bonus === 'intact' ? S.goal.bonusIntact : c.bonus === 'mischief' ? S.goal.bonusMischief(CFG.traps.evening.bonus, CFG.traps.evening.comboStars) : S.goal.bonusClean);

// Progress toward the goal during the round, for the wrist and the board.
export function progress(c, tally, loot) {
  c = scaledGoal(c);
  if (c.locked) return { done: false, text: S.goal.locked(c.locked) };
  if (c.goal.floorItems) { const n = floorDelivered(loot, c.goal.floorItems); return { done: n >= c.goal.floorItems.n, text: S.goal.floorProgress(n, c.goal.floorItems.n) }; }
  if (c.goal.swap) { const w = swapState(loot, c.goal.swap); return { done: w.placed && w.delivered, text: S.goal.swapProgress(w.placed, w.delivered) }; }
  if (c.goal.count) return { done: tally.inVan >= c.goal.count, text: S.goal.countProgress(tally.inVan, c.goal.count) };   // W19
  if (c.goal.mischief) return { done: mischief.score >= c.goal.mischief, text: S.goal.mischiefProgress(mischief.score, c.goal.mischief) };   // W2b
  if (c.goal.item) {
    const it = loot.items.find((i) => i.id === c.goal.item), got = !!(it && it.delivered), text = S.goal.itemProgress(it ? it.name : c.goal.item, got);
    if (c.goal.sum) return { done: got && tally.sum >= c.goal.sum, text: `${text} · ${money(tally.sum)} / ${money(c.goal.sum)}` };   // campaign v2: «Шафа» — the box and $1,000 in all
    return { done: got, text };
  }
  return { done: tally.sum >= c.goal.sum, text: `${money(tally.sum)} / ${money(c.goal.sum)}` };
}

// ---------- campaign v2 (plan 2026-11-15 §3): three stars, each its own condition ----------
// A level of the campaign's ladder (config/campaign.js ladderOf) has `level`; the classic contracts do not.
export const isLevel = (c) => !!c && c.level !== undefined && c.level !== null;
const practiceOf = (c) => c.bonus === 'none';
// ★★★ of a level: { ok, why } for a round's result (why: what broke it, '' when met)
export function star3Of(T, r) {
  const W = S.campaign2.why;
  if (!T) return { ok: false, why: '' };
  if (T.time !== undefined) return { ok: r.time <= T.time, why: r.time <= T.time ? '' : W.time(fmtTime(r.time, true)) };
  if (T.sum !== undefined) return { ok: r.sum >= T.sum, why: r.sum >= T.sum ? '' : W.sum(money(r.sum)) };
  if (T.intact) { const ok = !r.damaged && !r.broken; return { ok, why: ok ? '' : W.damaged }; }
  if (T.scares !== undefined) return { ok: (r.scares || 0) <= T.scares, why: (r.scares || 0) <= T.scares ? '' : W.scares(r.scares) };
  if (T.doubts !== undefined) return { ok: (r.doubts || 0) <= T.doubts, why: (r.doubts || 0) <= T.doubts ? '' : W.doubts(r.doubts) };
  return { ok: false, why: '' };
}
export function star3Text(T) {
  const X = S.campaign2.star;
  if (!T) return '';
  if (T.time !== undefined) return X.time(fmtTime(T.time));
  if (T.sum !== undefined) return X.sum(money(T.sum));
  if (T.intact) return X.intact;
  if (T.scares !== undefined) return X.scares;
  if (T.doubts !== undefined) return X.doubts;
  return '';
}
// The level's star rows for the card, the board's note and the summary: [{ n, text, price }] (the rehearsal: one)
export function starRows(c, items) {
  c = scaledGoal(c);
  const P = CFG.shop.v2.stars, X = S.campaign2.star;
  const rows = [{ n: 1, text: X.goal(goalText(c, items)), price: P[0] }];
  if (practiceOf(c)) return rows;
  rows.push({ n: 2, text: X.quiet, price: P[1] });
  if (c.star3) rows.push({ n: 3, text: star3Text(c.star3), price: P[2] });
  return rows;
}
// The summary's checklist (plan §4.3 A): each star of the level — met or not, why not, its money if new.
// v: the verdict (bits, whyStar); fresh: the stars paid now (G.income.fresh). [{ n, text, got, note }]
export function starChecklist(c, items, v, fresh = []) {
  const X = S.campaign2.star;
  return starRows(c, items).map((r) => {
    const i = r.n - 1, got = !!(v && v.bits && v.bits[i]);
    const note = got ? (fresh[i] ? `${X.money(money(r.price))} ${X.fresh}` : '') : ((v && v.whyStar && v.whyStar[i]) || '');
    return { n: r.n, text: r.text, got, note };
  });
}
// «Ще раз» — this same level (the owner's test of 16.11: one plain word on every ending; the checklist above it
// says which star is still missing)
export const againLabel = () => S.campaign2.again;
// The stars won so far, star by star ([goal, quiet, star3]; any difficulty, any round): 'stars2' in localStorage
export function bestBits(id) {
  const b = loadSetting('stars2', {})[id];
  return Array.isArray(b) ? [!!b[0], !!b[1], !!b[2]] : [false, false, false];
}
// Adds this round's stars; returns the ones that are new ([bool x3])
export function recordBits(id, bits) {
  const all = loadSetting('stars2', {}), had = bestBits(id), fresh = bits.map((b, i) => !!b && !had[i]);
  if (fresh.some(Boolean)) { all[id] = had.map((h, i) => (h || !!bits[i] ? 1 : 0)); saveSetting('stars2', all); }
  return fresh;
}

// r: round.result; ctx: { alarmed, noMic, difficulty, loot }
export function evaluate(c, r, ctx) {
  c = scaledGoal(c);
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
  if (G.count && r.inVan < G.count) { goal = false; why.push(S.goal.why.count(r.inVan, G.count)); }   // W19: the rehearsal
  if (G.sum && r.sum < G.sum) { goal = false; why.push(S.goal.why.sum(money(r.sum), money(G.sum))); }
  if (G.mischief && mischief.score < G.mischief) { goal = false; why.push(S.goal.why.mischief(mischief.score, G.mischief)); }   // W2b: the loot does not count
  if (G.noAlarm && ctx.alarmed) { goal = false; why.push(S.goal.why.alarm); }
  // owner's decision Р6 (14.11): without a microphone the campaign can be finished — «без жодного крику» is
  // simply not counted (no bonus stars), not a failed goal
  if (G.noShout && !ctx.noMic && r.shouts > 0) { goal = false; why.push(S.goal.why.shouted); }
  if (G.noShout && ctx.noMic) why.push(S.goal.why.noMic);
  if (!got) why.unshift(r.kind === 'caught' ? S.goal.why.caught : S.goal.why.late);
  // clean: no full alarm and no shout (without a microphone only the alarm counts)
  const E = CFG.traps.evening;
  const bonus = c.bonus === 'none' || (G.noShout && ctx.noMic) ? false   // W19: the rehearsal — one star; Р6: «тиша» not counted without a microphone
    : c.bonus === 'intact' ? r.damaged === 0 && r.broken === 0
    : c.bonus === 'mischief' ? mischief.score >= E.bonus || mischief.best >= E.comboStars   // W2b, decision R7 A
      : !ctx.alarmed && r.shouts === 0;
  if (isLevel(c)) {
    // campaign v2: ★ the goal, ★★ «Тихо», ★★★ the level's own — each on its own, on any difficulty
    const W = S.campaign2.why, quiet = !ctx.alarmed && r.shouts === 0, practice = practiceOf(c);
    const s3 = practice || !c.star3 ? null : star3Of(c.star3, r);
    const bits = [goal, goal && !practice && quiet, goal && !!(s3 && s3.ok)];
    const whyStar = [
      goal ? '' : (why[0] || W.goal),
      practice || !goal ? '' : quiet ? '' : ctx.alarmed && r.shouts ? W.alarmShout : ctx.alarmed ? W.alarm : W.shout,
      !s3 || !goal ? '' : s3.why,
    ];
    return { goal, bonus: bits[1], stars: bits.filter(Boolean).length, why, bits, whyStar, practice };
  }
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
