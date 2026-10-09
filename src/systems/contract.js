// The contract and the difficulty, round control (new round, the board's buttons, caught, back to
// the van), the microphone from the board (VR). Act: the 1 s of black after being caught.
// Result: the result board, the summary screen (phone), the scream replay.
import { CFG } from '../config/index.js';
import { SPAWN } from '../world/level.js';
import { loadSetting, saveSetting } from '../settings.js';
import { applyDifficulty, DIFFS } from '../game/difficulty.js';
import { contractById } from '../game/contracts.js';
import { runCalibration } from '../audio/calibrate.js';
import { G } from './state.js';
import { flash, fx } from './messages.js';
import { playGame } from './flatScreen.js';
import { syncStartScreen } from './startScreen.js';
import { summaryState } from './phone.js';
import { shopPress } from './economy.js';
import { S } from '../i18n/index.js';

export function newRound() {
  const { drags, summary, board, loot, hands, level, patrol, lurker, round, scream, breath, noise, siren, player, comfort } = G;
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
  applyDifficulty(G.difficulty, G.contract);
  G.verdict = null; G.boardPage = 'contract';
  if (summary) { summary.hide(); board.mesh.visible = true; }
  loot.reset(); hands.reset(); level.reset(); patrol.reset(); lurker.reset(); G.alert.reset();
  round.reset(); scream.clear(); breath.reset(); noise.clear(); siren.set(false);
  G.caughtT = -1; G.resultT = -1;
  board.placeAtStand();
  player.virtualCrouch = false;
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  comfort.fadeIn(0.5);
  G.boardDirty = true;
  flash(S.messages.newRound, 4);
}
// Contract / difficulty can change only before the clock starts (at the van, or on the start screen).
export function setContract(id) {
  if (G.round.phase !== 'ready') return;
  G.contract = contractById(id); G.contractId = G.contract.id; saveSetting('contract', G.contractId);
  applyDifficulty(G.difficulty, G.contract); G.patrol.reset(); G.lurker.reset(); G.round.reset();
  syncStartScreen(); G.boardDirty = true;
}
export function setDifficulty(id) {
  if (G.round.phase !== 'ready') return;
  G.difficulty = id; saveSetting('difficulty', id);
  applyDifficulty(G.difficulty, G.contract); G.patrol.reset(); G.lurker.reset(); G.round.reset();
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
  if (id === 'leave' && (round.phase === 'heist' || round.phase === 'ready')) round.finish('left');
  else if (id === 'play') scream.play();
  else if (id === 'again') newRound();
  else if (id === 'cprev') setContract(all[(i + all.length - 1) % all.length].id);
  else if (id === 'cnext') setContract(all[(i + 1) % all.length].id);
  else if (id === 'diff') setDifficulty(DIFFS[(DIFFS.indexOf(G.difficulty) + 1) % DIFFS.length]);
  else if (id === 'micpage') { G.boardPage = 'mic'; G.calibNotes = ''; }
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
export function caught() {
  const { drags } = G;
  G.caughtT = 0;
  G.comfort.blackout();
  G.xrIn.pulse('both', 1, 400);
  flash(S.result.caught, 3, '#ff5c5c');
  fx('caught');
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
}
export function goHome() {
  G.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  G.comfort.fadeIn(0.4);
  flash(S.messages.atVan);
}

export const contract = {
  id: 'contract',
  // applied before the guard is built
  init() {
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
      if (G.caughtT > 1 && G.round.phase !== 'result') {
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
