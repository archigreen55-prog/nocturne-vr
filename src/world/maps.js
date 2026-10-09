// The maps of the game (W6): which one this page runs and how to build it. One page = one map:
// changing the map reloads the page with ?map=<id> (the lights and shaders are fixed per page).
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { mapOpen as starsOpen, starsBefore } from '../game/economy.js';
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
  lock: mapOpen(id) ? '' : S.shop.mapLock(CFG.shop.unlock.maps[id], starsBefore(id)) }));
// go to another map: remembered, then the page reloads with ?map=<id> (one page = one map)
export function switchMap(id) {
  if (!MAPS[id] || !mapOpen(id)) return false;
  saveSetting('map', id);
  const u = new URL(location.href); u.searchParams.set('map', id); location.href = u.toString();
  return true;
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
