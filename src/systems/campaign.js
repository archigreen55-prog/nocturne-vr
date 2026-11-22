// W19 «Кампанія» in the round (plan-W19-campaign.md §2.3–2.4): what this level has (the cans and
// bottles, the devices; the traps: systems/traps.js, Шафник: systems/world.js), the board's note
// (its level, what is new) and its buttons «Поїхали», «Карта…», «Далі: рівень N». The ladder and the
// rules are game/campaign.js; the tests' classic game (config/campaign.js CLASSIC) has all of it off.
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { pause2D } from './desktop.js';
import { goPage } from './menu.js';
import { CLASSIC, unlocked, levelOf, contractOf, nextLevel, isOpenLevel, introOf, currentLevel, mapOfLevel } from '../game/campaign.js';
import { saveSetting } from '../settings.js';
import { S } from '../i18n/index.js';

// After a new round, another contract or difficulty (systems/contract.js) and at the start: the cans
// and bottles are not in the house before their level, the devices are not there (decision §7.7).
export function applyLevel() {
  const c = G.contract;
  if (G.loot) {
    const cans = unlocked('throw', c);
    for (const it of G.loot.items) {
      if (!it.throwable || it.trap) continue;
      if (!cans) { it.gone = true; it.mesh.visible = false; }
      else if (it.gone && !it.thrown && G.round.phase === 'ready') it.reset();   // back for a level that has them
    }
  }
  if (G.devices) G.devices.setEnabled(unlocked('devices', c));
}

// The board's note (null in the classic game or off the ladder): the level, its act, what is new
export function campaignNote(c = G.contract) {
  const l = !CLASSIC && levelOf(c.id);
  if (!l) return null;
  const act = CFG.campaign.acts.find((a) => a.n === l.act);
  return {
    n: l.n, act: S.campaign.acts[l.act] || '', house: act && act.map ? S.campaign.house[act.map] : '',
    isNew: introOf(l, S.campaign.mechanics).filter((m) => m.id !== 'basics').map((m) => m.name),
    noClock: !!(c.mods && c.mods.noClock),
  };
}
// the result page: the next level, once it is open and this round's goal was met
export function nextOpen() {
  if (CLASSIC || !G.verdict || !G.verdict.goal) return null;
  const n = nextLevel(G.contract.id);
  return n && isOpenLevel(n) && CFG.contracts.some((c) => c.id === n.id) ? n : null;   // the same house only (another map: the menu)
}

// The board's buttons of the campaign; true when it was one of them (systems/contract.js pressBoard)
export function campaignPress(id, { newRound, setContract }) {
  if (id === 'go') {
    // «Поїхали»: the clock starts when you leave the van anyway — the button only says so; on a
    // phone / PC it also turns you to the house
    flash(S.campaign.goHint, 3, '#ffd166');
    if (!G.inVR && G.player && G.level.spawn) { G.comfort.fadeIn(0.4); G.player.teleport(G.player.head.x, G.player.head.z, G.level.spawn.yaw + Math.PI); }
    return true;
  }
  if (id === 'levels') {   // «Карта…»: the menu's «Грати» (the map of levels comes in stage E2)
    pause2D();
    setTimeout(() => goPage('play'), 0);   // after the menu shows its main page (systems/menu.js)
    return true;
  }
  if (id === 'nextlvl') {
    const n = nextOpen();
    if (!n) return true;
    newRound();
    setContract(n.id);
    return true;
  }
  return false;
}

// W19: a level on another map (or a page whose map has closed): the level is remembered, the page
// reloads on its map (one page = one map: world/maps.js)
export function goToLevel(l) {
  if (!l) return false;
  saveSetting('contract', l.id);
  const u = new URL(location.href); u.searchParams.set('map', mapOfLevel(l));
  location.href = u.toString();
  return true;
}
// the start screen's list (#contract): a level that can be played is played (on this map at once, on the
// other by reloading); a closed one is only looked at — the game never plays it (G.campaignView)
export function pickLevel(id, { setContract }) {
  const l = levelOf(id);
  G.campaignView = null;
  if (!l) return setContract(id);
  if (!isOpenLevel(l)) { G.campaignView = l.id; return false; }
  if (G.isGuest) { flash(S.net.hostDecides, 2, '#93a1b8'); return false; }
  if (CFG.contracts.some((c) => c.id === l.id)) return setContract(l.id);
  return goToLevel(l);
}
// «Відкрити все» switched off (or a map that closed): a page of a map that is not open any more goes to the level the player is at
export function leaveClosedMap() {
  if (CLASSIC || local.leaving) return false;
  const map = G.level && G.level.id, l = currentLevel();
  if (!l || mapOfLevel(l) === map) return false;
  local.leaving = true;
  return goToLevel(l);
}
const local = { leaving: false };

export const campaign = {
  id: 'campaign',
  init() { applyLevel(); },
};
