// The contract and the difficulty, round control (new round, the board's buttons, caught, back to
// the van), the microphone from the board (VR). Act: the 1 s of black after being caught.
// Result: the result board, the summary screen (phone), the scream replay.
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { applyDifficulty, DIFFS } from '../game/difficulty.js';
import { contractById } from '../game/contracts.js';
import { runCalibration } from '../audio/calibrate.js';
import { G } from './state.js';
import { flash, fx } from './messages.js';
import { playGame } from './flatScreen.js';
import { syncStartScreen } from './startScreen.js';
import { switchMap, applyMapConfig } from '../world/maps.js';
import { summaryState } from './phone.js';
import { shopPress } from './economy.js';
import { newRoundTraps, reloadVan } from './traps.js';
import { S } from '../i18n/index.js';

// fromHost: a guest starts a new round only when the host does (systems/net.js)
export function newRound(fromHost = false) {
  if (G.isGuest && !fromHost) { flash(S.net.hostDecides, 2, '#93a1b8'); return; }
  const { drags, summary, board, loot, hands, level, patrol, lurker, round, scream, breath, noise, siren, player, comfort } = G;
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
  applyDifficulty(G.difficulty, G.contract);
  G.verdict = null; G.boardPage = 'contract';
  if (summary) { summary.hide(); board.mesh.visible = true; }
  loot.reset(); hands.reset(); level.reset(); for (const g of G.guards || [patrol]) g.reset(); for (const l of G.lurkers || [lurker]) l.reset(); G.alert.reset();
  round.reset(); scream.clear(); breath.reset(); noise.clear(); siren.set(false);
  newRoundTraps();   // W2b: the van loaded from the stock again, the points from zero
  G.caughtT = -1; G.resultT = -1;
  board.placeAtStand();
  player.virtualCrouch = false;
  const SPAWN = level.spawn;
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  comfort.fadeIn(0.5);
  G.boardDirty = true;
  flash(S.messages.newRound, 4);
  if (G.netEvent) G.netEvent('newround', {});
}
// Contract / difficulty can change only before the clock starts (at the van, or on the start screen).
export function setContract(id) {
  if (G.round.phase !== 'ready') return;
  if (G.isGuest) { flash(S.net.hostDecides, 2, '#93a1b8'); return; }
  G.contract = contractById(id); G.contractId = G.contract.id; saveSetting('contract', G.contractId);
  applyDifficulty(G.difficulty, G.contract); for (const g of G.guards || [G.patrol]) g.reset(); for (const l of G.lurkers || [G.lurker]) l.reset(); G.round.reset();
  reloadVan();   // W2b: another contract / difficulty: another number of traps
  syncStartScreen(); G.boardDirty = true;
}
export function setDifficulty(id) {
  if (G.round.phase !== 'ready') return;
  if (G.isGuest) { flash(S.net.hostDecides, 2, '#93a1b8'); return; }
  G.difficulty = id; saveSetting('difficulty', id);
  applyDifficulty(G.difficulty, G.contract); for (const g of G.guards || [G.patrol]) g.reset(); for (const l of G.lurkers || [G.lurker]) l.reset(); G.round.reset();
  reloadVan();   // W2b: another contract / difficulty: another number of traps
  syncStartScreen(); G.boardDirty = true;
}
async function calibrateInVR() {
  const { mic, touch } = G;
  if (G.calib || mic.state !== 'on') return;
  G.calib = { i: 0, step: { title: '', say: '' }, phase: 'prep', left: 1.5, total: touch ? 5 : 4 };
  const res = await runCalibration(mic, (st) => { G.calib = st; G.boardDirty = true; }, touch ? { phone: true, playGame } : undefined);
  G.calib = null;
  if (res.ok) mic.setCalibration(res.cal);
  G.calibNotes = (res.ok ? S.calib.done : '') + res.notes.join(' ');
  G.start.refresh(); G.boardDirty = true;
}
async function micOnInVR() {
  const { mic, touch } = G;
  await mic.enable();
  if (mic.state === 'on') { G.scream.start(); G.calibNotes = S.board.micOn(!!touch); }
  else G.calibNotes = touch ? S.board.micFailPhone(mic.error || mic.state) : S.board.micFailVr(mic.error || mic.state);
  G.start.refresh(); G.boardDirty = true;
}
export function pressBoard(id) {
  const { round, mic, scream } = G;
  const all = CFG.contracts, i = all.indexOf(G.contract);
  if ((G.isGuest && ['leave', 'again', 'cprev', 'cnext', 'diff', 'mappage'].includes(id)) || (G.role === 'guard' && id === 'leave')) { flash(S.net.hostDecides, 2, '#93a1b8'); G.boardDirty = true; return; }   // the host's round
  if (id === 'leave' && (round.phase === 'heist' || round.phase === 'ready')) round.finish('left');
  else if (id === 'play') scream.play();
  else if (id === 'again') newRound();
  else if (id === 'cprev') setContract(all[(i + all.length - 1) % all.length].id);
  else if (id === 'cnext') setContract(all[(i + 1) % all.length].id);
  else if (id === 'diff') setDifficulty(DIFFS[(DIFFS.indexOf(G.difficulty) + 1) % DIFFS.length]);
  else if (id === 'micpage') { G.boardPage = 'mic'; G.calibNotes = ''; }
  else if (id === 'mappage') G.boardPage = 'map';
  else if (id.startsWith('map:')) { if (round.phase === 'ready') switchMap(id.slice(4)); }
  else if (id === 'back') G.boardPage = 'contract';
  else if (shopPress(id)) { /* the shop (systems/economy.js) */ }
  else if (id === 'cal') calibrateInVR();
  else if (id === 'micon') micOnInVR();
  else if (id === 'nomic') { mic.setNoMic(!mic.noMic); G.start.refresh(); }
  else if (id === 'wdn') mic.adjustWhisper(-2);
  else if (id === 'wup') mic.adjustWhisper(2);
  else if (id === 'sdn') mic.adjustShout(-2);
  else if (id === 'sup') mic.adjustShout(2);
  if (['wdn', 'wup', 'sdn', 'sup'].includes(id)) G.start.refresh();
  G.boardDirty = true;
}
// who: the player a guard caught (G.players); offline always this device's own player
export function caught(who = G.player) {
  const { drags } = G;
  if (G.humanGuard && G.onBench && G.isHost) { G.onBench(who); return; }   // W15: a friend plays the guard — the van for a while (systems/humanGuard.js)
  if (who && who !== G.player) { G.caughtT = 0; if (G.netCaught) G.netCaught(who); return; }   // a friend: its own screen goes black (systems/net.js)
  G.caughtT = 0;
  G.comfort.blackout();
  G.xrIn.pulse('both', 1, 400);
  flash(S.result.caught, 3, '#ff5c5c');
  fx('caught');
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
}
export function goHome() {
  const SPAWN = G.level.spawn;
  G.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  G.comfort.fadeIn(0.4);
  flash(S.messages.atVan);
}

export const contract = {
  id: 'contract',
  // applied before the guard is built
  init() {
    applyMapConfig();   // W6: the map's contracts and timers
    G.contractId = loadSetting('contract', 'first'); G.difficulty = loadSetting('difficulty', 'medium');
    if (!DIFFS.includes(G.difficulty)) G.difficulty = 'medium';
    G.contract = contractById(G.contractId);
    applyDifficulty(G.difficulty, G.contract);
    G.verdict = null;
  },
  // caught: 1 s of black, then the result at the van
  act(dt) {
    if (G.caughtT >= 0) {
      G.caughtT += dt;
      if (G.caughtT > 1 && G.round.phase !== 'result' && !G.isGuest) {   // a guest: the host ends the round
        G.round.finish('caught');   // onPhase: back to the van, board in front
        G.caughtT = -1;
      }
    }
  },
  result(dt) {
    const { round, board, player, summary, scream } = G;
    if (round.phase === 'result' && G.resultT >= 0) {
      G.resultT += dt;
      if (!board.floating && G.resultT > 0.2) { board.placeInFront(player.head, player.yaw); G.boardDirty = true; }
      if (summary && G.playingDesktop && !summary.isOpen && G.resultT > 0.4 && G.verdict) { summary.show(summaryState()); board.mesh.visible = false; }   // phone: the result is a screen of its own
      if (!G.autoPlayed && G.resultT > 1.2 && !scream.pending && !scream.busy) {
        G.autoPlayed = true;
        if (scream.best && scream.play()) G.boardDirty = true;
      }
    }
  },
};
