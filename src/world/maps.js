// The maps of the game (W6): which one this page runs and how to build it. One page = one map:
// changing the map reloads the page with ?map=<id> (the lights and shaders are fixed per page).
import { CFG } from '../config/index.js';
import { PREVIEW, loadSetting, saveSetting } from '../settings.js';
import { buildLevel as buildDacha } from './level.js';
import { buildMansion } from './mansion/level.js';
import { S } from '../i18n/index.js';

export const MAPS = {
  dacha: { build: buildDacha, name: () => S.mansion.mapDacha },
  mansion: { build: buildMansion, name: () => S.mansion.name },
};

export const mapOpen = (id) => id === 'dacha' || PREVIEW || !!(CFG.maps[id] && CFG.maps[id].open);

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
