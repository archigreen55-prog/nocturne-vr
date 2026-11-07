// The level picker's data and its one rule (menu «Грати» and the friends' room use the same, ui/levelPick.js):
// every level of the ladder 0–14 in its order, by house, whatever map this page runs (T1: the list showed
// only the mansion's levels when the browser remembered the mansion); a closed level (🔒, «незабаром», a
// closed house) cannot be picked, so it cannot be started from anywhere.
//   levelGroups()        [{ map, title, note, open, levels: [{ id, n, name, stars, locked, why, soon, current, here }] }]
//   canPlay(id)          the contract can be played now (open, not a placeholder)
//   pickLevel(id)        this page's map: setContract (a finished round goes back to the van first);
//                        the other house: remembered, then the page reloads with ?map= (one page = one map)
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { CLASSIC, levels, contractOf } from '../game/campaign.js';
import { lockOf, mapOpen, starsBefore } from '../game/economy.js';
import { bestStars } from '../game/contracts.js';
import { saveSetting } from '../settings.js';
import { S } from '../i18n/index.js';

const MAP_OF_ACT = () => Object.fromEntries(CFG.campaign.acts.map((a) => [a.n, a.map]));
const starsOf = (id) => { const b = bestStars(id); return Math.max(b.easy || 0, b.medium || 0, b.hard || 0); };

// why a contract cannot be played ('' = it can): a placeholder, a closed house, the previous level first
export function whyClosed(c) {
  if (!c) return S.levels.soon;
  if (c.locked) return S.levels.soon;
  const L = lockOf(c);
  if (!L) return '';
  if (L.map) return S.levels.houseLock(S.campaign.house[L.map] || L.map, L.need, L.have);
  return S.levels.after(L.after.name);
}
export const canPlay = (id) => {
  const c = CFG.contracts.find((x) => x.id === id) || (CLASSIC ? null : contractOf(levels().find((l) => l.id === id)));
  return !!c && !whyClosed(c);
};

export function levelGroups() {
  const here = G.level && G.level.id, cur = G.contract && G.contract.id;
  if (CLASSIC) {   // the tests' classic game: this map's contracts, no ladder
    return [{ map: here, title: S.campaign.house[here] || '', note: '', open: true,
      levels: CFG.contracts.map((c) => ({ id: c.id, n: null, name: c.name, stars: starsOf(c.id), why: whyClosed(c), locked: !!whyClosed(c), soon: !!c.locked, current: c.id === cur, here: true })) }];
  }
  const actMap = MAP_OF_ACT(), groups = [];
  for (const l of levels()) {
    const map = actMap[l.act];
    if (!map) continue;
    let g = groups.find((x) => x.map === map);
    if (!g) {
      const open = mapOpen(map);
      g = { map, title: S.campaign.house[map] || map, open, note: open ? '' : S.levels.houseLock(S.campaign.house[map] || map, CFG.shop.unlock.maps[map], starsBefore(map)), levels: [] };
      groups.push(g);
    }
    const c = contractOf(l), why = l.soon ? S.levels.soon : whyClosed(c);
    g.levels.push({ id: l.id, n: l.n, name: c ? c.name : '', stars: c ? starsOf(c.id) : 0, why, locked: !!why, soon: !!l.soon || !!(c && c.locked), current: l.id === cur, here: map === here });
  }
  return groups;
}

// the map a level is on (null: not on the ladder)
export function mapOfLevel(id) {
  if (CFG.contracts.some((c) => c.id === id)) return G.level.id;
  const l = levels().find((x) => x.id === id);
  return l ? MAP_OF_ACT()[l.act] || null : null;
}

// fns: { setContract, newRound, switchMap } (passed in: no import cycle with contract.js / world/maps.js)
export function pickLevel(id, { setContract, newRound, switchMap }) {
  if (G.isGuest || !canPlay(id)) return false;
  const map = mapOfLevel(id);
  if (map && map !== G.level.id) { saveSetting('contract', id); return switchMap(map); }   // the other house: the page reloads there
  if (G.round.phase !== 'ready') newRound();
  setContract(id);
  return true;
}
