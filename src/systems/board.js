// The board at the van. Present: pointer hover; checked 4 times a second (8 on the microphone page:
// a live level bar), redrawn (and re-uploaded to the GPU) only when what it shows changed, and on a
// flat screen only while it is in view (plan-phone-mode §4: every canvas upload is a hitch on a phone).
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { LEVELS } from '../audio/mic.js';
import { goalText, bonusText, progress, bestStars } from '../game/contracts.js';
import { G } from './state.js';
import { summaryState } from './phone.js';
import { wallet } from '../game/economy.js';
import { money } from '../ui/board.js';
import { shopPageRows, shopPages, lockText, incomeText } from './economy.js';
import { S } from '../i18n/index.js';

// Everything the board shows, as one string: the same string = nothing to redraw.
function boardSignature(T, lv) {
  const { round, alert, scream, contract, board, loot, mic } = G;
  const R = round.result, V = G.verdict, onMic = round.phase === 'ready' && G.boardPage === 'mic', calib = G.calib;
  return JSON.stringify([
    round.phase, Math.ceil(round.clock), alert.level, T.sum, T.inVan, T.list.length, T.damaged, R && R.kind, R && R.sum,
    !!scream.best, scream.best && scream.best.t, !!scream.playing, scream.modeName, G.boardPage, contract.id, G.difficulty, bestStars(contract.id),
    V && V.stars, V && V.newBest, mic.noMic, mic.state, mic.calibrated, board.hover, progress(contract, T, loot).text,
    calib && [calib.i, calib.phase, calib.left.toFixed(1)], G.calibNotes,
    onMic ? [Math.round(mic.env), Math.round(mic.whisperDb), Math.round(mic.shoutDb), lv.label] : 0,
    wallet().cash, wallet().owned.length, G.shopPage, lockText(contract), incomeText(),
  ]);
}
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4();
function boardInView() {
  const { camera } = G;
  camera.updateMatrixWorld();
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
  return _frustum.intersectsObject(G.board.mesh);
}

export const board = {
  id: 'board',
  present(dt) {
    const { pointer, camera, summary, round, loot, mic, scream, alert, perf } = G;
    if (pointer.update(G.inVR, camera)) G.boardDirty = true;
    G.boardT -= dt;
    if (summary && summary.isOpen && (G.boardDirty || G.boardT <= 0)) summary.update(summaryState());
    if (G.boardDirty || G.boardT <= 0) {
      G.boardT = round.phase === 'ready' && G.boardPage === 'mic' ? 0.125 : 0.25; G.boardDirty = false;
      const T = loot.tally(), lv = LEVELS[mic.level];
      const sig = boardSignature(T, lv);
      if (sig === G.lastBoardSig || (!G.inVR && !boardInView())) return;
      G.lastBoardSig = sig;
      perf.boardDraws = (perf.boardDraws || 0) + 1;
      const contract = G.contract, difficulty = G.difficulty;
      G.board.draw({
        phase: round.phase, clock: round.clock, alertLevel: alert.level, tally: T, result: round.result,
        clip: scream.best, playing: !!scream.playing, recMode: scream.modeName,
        page: G.boardPage, contract, contractIndex: CFG.contracts.indexOf(contract), contractCount: CFG.contracts.length,
        goalText: goalText(contract, loot.items), bonusText: bonusText(contract), best: bestStars(contract.id),
        diffName: CFG.difficulties[difficulty].name, difficulty, progress: progress(contract, T, loot), verdict: G.verdict,
        noMic: mic.noMic, mic, calib: G.calib, calibNotes: G.calibNotes, levelColor: lv.color, levelLabel: lv.label, calSteps: G.touch ? 5 : 4,
        wallet: S.shop.wallet(money(wallet().cash)), lock: lockText(contract), income: incomeText(),
        shop: G.boardPage === 'shop' ? { rows: shopPageRows(), page: G.shopPage, pages: shopPages() } : null,
      });
    }
  },
};
