// Б1 (plan 2026-11-12-mic-v2 §2.1, stage 1): a player who set the microphone up before gets it back by
// itself. Never while the page loads (a newcomer looking at the menu sees no microphone mark lit): the
// first tap in the menu opens it when the browser already allows it (no dialog), and the taps that start
// the game («Грати», Enter VR, «Почати», «Увійти», the board in VR) open it and may ask for the permission
// (iPhone opens the microphone only from a tap). Also: whether this round went without a microphone.
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

// ask: this tap may show the browser's permission dialog. Without a tap (a guest sent into the round by
// the host) only an already allowed microphone opens.
export function ensureMic({ ask = false, tell = false } = {}) {
  const mic = G.mic;
  if (!mic || mic.noMic || !mic.calibrated) return null;   // the first run: the «Налаштуємо мікрофон?» card
  if (mic.state === 'on' || mic.state === 'pending' || mic.state === 'denied' || mic.permission === 'denied') return null;
  const gesture = typeof navigator !== 'undefined' && navigator.userActivation ? navigator.userActivation.isActive : true;
  if (!(ask && gesture) && mic.permission !== 'granted') return null;
  return mic.enable().then((st) => {
    if (st === 'on') { if (G.start && G.start.micReady) G.start.micReady(); else if (G.scream) G.scream.start(); }
    else if (tell) flash(S.micState.failed(mic.error || st), 6, '#ffb347');
    if (G.start) G.start.refresh();
    G.boardDirty = true;
    return st;
  });
}

// the round went (partly) without a microphone: the result says so honestly (not «жодного крику»), and
// the contracts' «тиша» conditions are not counted (game/contracts.js, owner's decision Р6)
export const roundNoMic = () => !!G.micOffRound || !(G.mic && G.mic.live);

export const micAuto = {
  id: 'micAuto',
  init() {
    G.micOffRound = false;
    // the first tap in the menu: only an already allowed microphone, no dialog
    const onTap = (e) => {
      if (!G.mic || G.mic.state === 'on') return;
      const t = e.target && e.target.closest ? e.target : null;
      if (t && t.closest('#micbox, #micask')) return;   // the microphone's own box (allow, calibrate, «Звуки гри», «без мікрофона») and the first-run card
      ensureMic();
    };
    document.addEventListener('click', onTap, true);
  },
  // a round's clock running without the microphone (switched off, refused, «без мікрофона»): the whole round counts as one without it
  world() {
    const ph = G.round && G.round.phase;
    if (G.active && (ph === 'heist' || ph === 'escape') && !G.mic.live) G.micOffRound = true;
  },
};
