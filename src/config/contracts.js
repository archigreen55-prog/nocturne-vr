// Contracts in this house (game/contracts.js).
// Units: metres, seconds, m/s (see src/config/index.js).
import { S } from '../i18n/index.js';

// ---------- contracts in this house (game/contracts.js) ----------
// goal: sum (deliver at least $sum) | item (deliver this item); noAlarm / noShout: extra conditions.
// bonus (2nd star): clean = no full alarm and no shout; intact = nothing damaged or broken.
// 3rd star: goal + bonus on the hard difficulty. mods override round / guard numbers.
export const contracts = [
  { id: 'first', name: S.contracts.first.name, brief: S.contracts.first.brief, goal: { sum: 2000 }, bonus: 'clean' },
  { id: 'clock', name: S.contracts.clock.name, brief: S.contracts.clock.brief, goal: { item: 'clock' }, bonus: 'clean' },
  { id: 'quiet', name: S.contracts.quiet.name, brief: S.contracts.quiet.brief, goal: { sum: 1500, noAlarm: true }, bonus: 'intact' },
  { id: 'silent', name: S.contracts.silent.name, brief: S.contracts.silent.brief, goal: { sum: 1500, noShout: true }, bonus: 'intact', mods: { lurkerCooldown: 20 }, needsMic: true },
  { id: 'rush', name: S.contracts.rush.name, brief: S.contracts.rush.brief, goal: { sum: 2500 }, bonus: 'clean', mods: { time: 180, warnAt: 150, escapeTime: 45, teaAtStart: 60 } },
];
