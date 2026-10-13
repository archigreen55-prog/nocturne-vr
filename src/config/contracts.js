// Contracts in this house (game/contracts.js).
// Units: metres, seconds, m/s (see src/config/index.js).
import { S } from '../i18n/index.js';
import { CLASSIC } from './campaign.js';

// ---------- contracts in this house (game/contracts.js) ----------
// goal: sum (deliver at least $sum) | item (deliver this item) | mischief (points, W2b); noAlarm / noShout: extra conditions.
// bonus (2nd star): clean = no full alarm and no shout; intact = nothing damaged or broken; mischief =
// CFG.traps.evening.bonus points or a x3 combo (W2b).
// 3rd star: goal + bonus on the hard difficulty. mods override round / guard numbers.
// W19 (plan-W19-campaign.md §2.2): the campaign's order — level 0 «Репетиція» and level 3 «Шафа» are new
// (`campaign: true`: the tests' classic game leaves them out, config/campaign.js CLASSIC).
// goal count: deliver this many items (any); bonus 'none': one star only. mods: armchairAtStart — the guard
// sits in his armchair all round (it sees only close by); noClock — the round's clock does not run.
const ALL = [
  { id: 'rehearsal', name: S.contracts.rehearsal.name, brief: S.contracts.rehearsal.brief, goal: { count: 2 }, bonus: 'none', campaign: true, practice: true, mods: { armchairAtStart: true, noClock: true } },
  { id: 'first', name: S.contracts.first.name, brief: S.contracts.first.brief, goal: { sum: 2000 }, bonus: 'clean' },
  { id: 'clock', name: S.contracts.clock.name, brief: S.contracts.clock.brief, goal: { item: 'clock' }, bonus: 'clean' },
  { id: 'wardrobe', name: S.contracts.wardrobe.name, brief: S.contracts.wardrobe.brief, goal: { item: 'jewelbox' }, bonus: 'clean', campaign: true },
  { id: 'quiet', name: S.contracts.quiet.name, brief: S.contracts.quiet.brief, goal: { sum: 1500, noAlarm: true }, bonus: 'intact' },
  { id: 'silent', name: S.contracts.silent.name, brief: S.contracts.silent.brief, goal: { sum: 1500, noShout: true }, bonus: 'intact', mods: { lurkerCooldown: 20 }, needsMic: true },
  { id: 'rush', name: S.contracts.rush.name, brief: S.contracts.rush.brief, goal: { sum: 2500 }, bonus: 'clean', mods: { time: 180, warnAt: 150, escapeTime: 45, teaAtStart: 60 } },
  // W2b: contract 7 «Довгий вечір Петровича» — mischief points instead of loot (CFG.traps.evening), twice the
  // traps; opens after a star on «На час» (decision R8 A: also once «Напарник» (W5) comes in between)
  { id: 'evening', name: S.contracts.evening.name, brief: S.contracts.evening.brief, goal: { mischief: 500 }, bonus: 'mischief', after: 'rush', mods: { trapsK: 2 } },
];
export const contracts = CLASSIC ? ALL.filter((c) => !c.campaign) : ALL;
