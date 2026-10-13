// The campaign (W19, plan-W19-campaign.md §2): the ladder of levels over the contracts, which mechanic
// is there on which level, where the player is now. Pure logic over CFG.campaign and the stars, no DOM:
// the menu's map, the board, the systems and the tests read it from here.
//   unlocked(mech, contract)  is a mechanic there in this contract's round (config/campaign.js mechanics)
//   levelOf(id)               the ladder's level of a contract ({ n, id, act, intro, soon }) or null
//   nextLevel(id)             the next level that can be played (skips the placeholders) or null
//   currentLevel()            where the player is: the first open level not passed (else the last open)
import { CFG } from '../config/index.js';
import { CLASSIC } from '../config/campaign.js';
import { openAll, lockOf, bestOf } from './economy.js';
import { contracts as DACHA } from '../config/contracts.js';
import { mansion as MANSION } from '../config/mansion.js';

export { CLASSIC };
const ALL = () => DACHA.concat(MANSION.contracts);
export const levels = () => CFG.campaign.levels;
export const levelOf = (id) => CFG.campaign.levels.find((l) => l.id === id) || null;
export const contractOf = (l) => (l ? ALL().find((c) => c.id === l.id) || null : null);

// The tests' classic game and «Відкрити все» (preview / ?debug): every mechanic everywhere. A contract
// off the ladder (none yet) has everything too.
export function unlocked(mech, contract) {
  if (CLASSIC || openAll()) return true;
  const need = CFG.campaign.mechanics[mech];
  const l = contract && levelOf(contract.id);
  return need === undefined || !l || l.n >= need;
}

// a level is there to play: not a placeholder, its contract exists and is open
export const playable = (l) => !!(l && !l.soon && contractOf(l) && !contractOf(l).locked);
export const isOpenLevel = (l) => playable(l) && !lockOf(contractOf(l));
export const stars = (l) => (l ? bestOf(l.id) : 0);
// passed: a star on it, or on a later level of its act (decision R10 A: an old player is not sent back
// to the rehearsal or to «Шафа»)
export const passed = (l) => !!l && (stars(l) > 0 || CFG.campaign.levels.some((x) => x.act === l.act && x.n > l.n && stars(x) > 0));

export function nextLevel(id) {
  const L = CFG.campaign.levels, i = L.findIndex((l) => l.id === id);
  if (i < 0) return null;
  return L.slice(i + 1).find(playable) || null;
}

export function currentLevel() {
  const open = CFG.campaign.levels.filter(isOpenLevel);
  return open.find((l) => !passed(l)) || open[open.length - 1] || levelOf(CFG.campaign.start);
}

// What a level brings, for the board's note and the map's card: [{ id, name }]
export const introOf = (l, names) => ((l && l.intro) || []).filter((m) => m !== 'basics' || l.n === 0).map((m) => ({ id: m, name: (names && names[m]) || m }));

// Has the player got as far as a mechanic (the shop's trap rows: decision R3 B)? Any open level from
// its number on — not the contract being played.
export function reached(mech) {
  if (CLASSIC || openAll()) return true;
  const need = CFG.campaign.mechanics[mech];
  return need === undefined || CFG.campaign.levels.some((l) => l.n >= need && isOpenLevel(l));
}
