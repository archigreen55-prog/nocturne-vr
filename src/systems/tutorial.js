// The first-run tutorial (phone and PC; not in VR). Steps at the van, while the clock still waits:
// look around, walk, press the board, then "the clock starts when you leave the van". Then, during the
// first round, short hints when the situation comes up (an item under the crosshair, carrying it, a
// door, loud steps, the guard near, talking, the alarm), each once. It never pauses the game and
// changes no numbers. Shown once (setting "tutorial"); «Пропустити» (H on a PC) ends it; «Навчання
// ще раз» (start screen, menu → Налаштування) starts it again at the van.
import { loadSetting, saveSetting } from '../settings.js';
import { S } from '../i18n/index.js';
import { TutorialBubble } from '../ui/tutorial.js';
import { G } from './state.js';
import { nearestDoor } from './doors.js';

const STEPS = ['look', 'walk', 'board', 'go'];
const HINTS = ['alarm', 'take', 'carry', 'door', 'loud', 'guard', 'talk'];   // priority order
const HINT_SECS = 6;

const T = {
  on: false,          // running
  waitReady: false,   // started mid-round: begin at the van of the next round
  step: 0,            // index in STEPS; STEPS.length = the hints of the first round
  base: null,         // what the current step started from
  shown: new Set(),   // hints already given
  hint: null, hintT: 0,
};
let bubble = null;

const text = (key) => (G.touch ? S.tutorial.phone[key] : S.tutorial.pc[key]);
const sig = () => `${G.contract.id}|${G.difficulty}|${G.boardPage}`;

function finish() {
  T.on = false; T.hint = null;
  saveSetting('tutorial', { done: true });
  if (bubble) bubble.hide();
}
export function skipTutorial() { finish(); }
export function restartTutorial() {
  if (!bubble) return;
  saveSetting('tutorial', { done: false });
  T.on = true; T.step = 0; T.base = null; T.shown.clear(); T.hint = null;
  T.waitReady = !G.round || G.round.phase !== 'ready';
}
export const tutorialState = () => ({ on: T.on, waitReady: T.waitReady, step: T.step < STEPS.length ? STEPS[T.step] : 'hints', hint: T.hint, shown: [...T.shown], visible: !!bubble && bubble.visible });

function startStep() {
  const { player } = G;
  T.base = { x: player.head.x, z: player.head.z, yaw: player.yaw, turned: 0, sig: sig() };
}
function stepDone(name) {
  const { player, round } = G, b = T.base;
  if (name === 'look') {
    let d = player.yaw - b.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    b.turned += Math.abs(d); b.yaw = player.yaw;
    return b.turned >= 1.05;   // ~60°
  }
  if (name === 'walk') return Math.hypot(player.head.x - b.x, player.head.z - b.z) >= 1.5;
  if (name === 'board') return sig() !== b.sig;
  return round.phase !== 'ready';   // 'go': the clock started
}
function hintDue(name) {
  const { hands, player, patrol, mic, round } = G;
  if (name === 'alarm') return round.phase === 'escape';
  if (name === 'take') return !!hands.deskAim && !hands.desk;
  if (name === 'carry') return !!hands.desk;
  if (name === 'door') return !hands.desk && !!nearestDoor(player.head.x, player.head.z, 1.6, player.yaw);
  if (name === 'loud') return player.stepsAudible;
  if (name === 'guard') return round.phase === 'heist' && Math.hypot(patrol.x - player.head.x, patrol.z - player.head.z) < 7;
  return mic.state === 'on' && !mic.noMic && G.speakT > 0.3;   // 'talk'
}

export const tutorial = {
  id: 'tutorial',
  init() {
    if (G.MODE.mode === 'vr') return;   // VR keeps its own wrist and board; no tutorial there
    bubble = new TutorialBubble({ phone: !!G.touch, onSkip: () => finish() });
    const saved = loadSetting('tutorial', null);
    T.on = !(saved && saved.done);
  },
  act(dt) {
    if (!bubble) return;
    const { round } = G;
    if (!T.on || G.inVR || !G.playingDesktop || G.paused) { bubble.hide(); return; }
    if (!G.touch && G.keys.take('KeyH')) { finish(); return; }
    if (T.waitReady) { bubble.hide(); if (round.phase === 'ready') T.waitReady = false; else return; }
    if (T.step < STEPS.length) {
      // left the van before the steps were done: straight to the hints of this round
      if (round.phase !== 'ready' && STEPS[T.step] !== 'go') T.step = STEPS.length;
      else {
        if (!T.base) startStep();
        if (stepDone(STEPS[T.step])) { T.step++; T.base = null; if (T.step < STEPS.length) startStep(); }
        if (T.step < STEPS.length) { bubble.show(S.tutorial.counter(T.step + 1, STEPS.length), text(STEPS[T.step])); return; }
      }
    }
    // the first round's hints; the tutorial ends with the round
    if (round.phase === 'result') { finish(); return; }
    if (round.phase === 'ready') { bubble.hide(); return; }
    T.hintT -= dt;
    const urgent = !T.shown.has('alarm') && hintDue('alarm');
    if (!T.hint || T.hintT <= 0 || urgent) {
      T.hint = null;
      for (const h of HINTS) if (!T.shown.has(h) && hintDue(h)) { T.hint = h; T.hintT = HINT_SECS; T.shown.add(h); break; }
    }
    if (T.hint) bubble.show(S.tutorial.hintHead, text(T.hint)); else bubble.hide();
  },
};
