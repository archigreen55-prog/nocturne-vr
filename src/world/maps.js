// The maps of the game (W6): which one this page runs and how to build it. One page = one map:
// changing the map reloads the page with ?map=<id> (the lights and shaders are fixed per page).
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { mapOpen as starsOpen, starsBefore, lockOf } from '../game/economy.js';
import { buildLevel as buildDacha } from './level.js';
import { buildMansion } from './mansion/level.js';
import { S } from '../i18n/index.js';
import { mansion as MCFG } from '../config/mansion.js';

export const MAPS = {
  dacha: { build: buildDacha, name: () => S.mansion.mapDacha, blurb: () => S.mansion.mapBlurb.dacha },
  mansion: { build: buildMansion, name: () => S.mansion.name, blurb: () => S.mansion.mapBlurb.mansion, contracts: MCFG.contracts, difficulty: MCFG.difficulty },
};
// Before the contract is loaded (systems/contract.js init): this map's own contracts (ids do not
// overlap the first map's) and its round numbers by difficulty (game/difficulty.js).
export function applyMapConfig() {
  const m = MAPS[currentMapId()];
  if (m.contracts) CFG.contracts = m.contracts;
  CFG.mapDifficulty = m.difficulty || null;
}
// the board's «Карта» page: every map, which is open and which this page runs
export const mapsForBoard = (current) => Object.keys(MAPS).map((id) => ({ id, name: MAPS[id].name(), blurb: MAPS[id].blurb(), open: mapOpen(id), current: id === current,
  lock: mapOpen(id) ? '' : lockOfMap(id) }));
const lockOfMap = (id) => { const L = lockOf((MAPS[id].contracts || [])[0] || { id: '', map: id }); return L && L.level !== undefined ? `🔒 ${S.campaign2.houseAfter(MAPS[id].name(), L.level)}` : S.shop.mapLock(CFG.shop.unlock.maps[id], starsBefore(id)); };
// go to another map: remembered, then the page reloads with ?map=<id> (one page = one map). Campaign v2 (variant
// В of 16.11): no splash on the way — «Їдемо в …» (travelNote); `from`: 'menu' (a level card: the «Грати» page
// again), 'next' (the summary's «Далі: Маєток»: «Поїхали ▶» starts the round), 'room' (with friends)
export function switchMap(id, from = 'menu') {
  if (!MAPS[id] || !mapOpen(id)) return false;
  saveSetting('map', id);
  travelNote(id, from);
  const u = new URL(location.href); u.searchParams.set('map', id); u.searchParams.delete('page');
  location.href = u.toString();
  return true;
}
// the note index.html reads before anything loads: no splash, this line instead (sessionStorage: this tab only)
export function travelNote(id, from, host = false) {
  try { sessionStorage.setItem('nocturne.travel', JSON.stringify({ to: id, from, t: Date.now(), text: (host ? S.campaign2.travel.host : S.campaign2.travel.to)[id] || '' })); } catch { /* storage blocked: the splash then */ }
}

// W3: a map opens by stars on the maps before it (the mansion: 8★ on the dacha); «Відкрити все» (previews, ?debug) opens it
export const mapOpen = (id) => !!MAPS[id] && starsOpen(id);

// ?map=<id> picks the map and remembers it; otherwise the remembered one; a closed map = the default.
export function currentMapId() {
  const q = new URLSearchParams(location.search).get('map');
  let id = q || loadSetting('map', CFG.maps.default);
  if (!MAPS[id] || !mapOpen(id)) id = CFG.maps.default;
  if (q && id === q) saveSetting('map', id);
  return id;
}

export function buildCurrentLevel() {
  const id = currentMapId();
  const level = MAPS[id].build();
  level.id = level.id || id;
  return level;
}
