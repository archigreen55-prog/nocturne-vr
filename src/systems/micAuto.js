// Б1 (plan 2026-11-12-mic-v2 §2.1, stage 1): a player who set the microphone up before gets it back by
// itself. Never while the page loads (a newcomer looking at the menu sees no microphone mark lit): the
// first tap in the menu opens it when the browser already allows it (no dialog), and the taps that start
// the game («Грати», Enter VR, «Почати», «Увійти», the board in VR) open it and may ask for the permission
// (iPhone opens the microphone only from a tap). Also: whether this round went without a microphone.
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';
import { CFG } from '../config/index.js';

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
// the result's words for a round without the microphone (very noisy: why), and the friends who had it very noisy
export const noMicText = () => (G.micLoudRound ? S.micNoise.result : '');
export function loudFriendsText() {
  const names = G.net && G.loudFriends ? G.loudFriends() : [];
  return names.length ? S.micNoise.friends(names.join(', ')) : '';
}

// The street (plan 2026-11-22-mic-noise §2.4, owner's decision Р-Ш1 = А): very noisy here — the game cannot
// tell your voice from the noise (the boundaries would need more than CFG.mic.ceiling dB over yours). The first
// loudWarn s only warn (one gust of wind is not punished); after loudSecs s the round goes by the rules without a
// microphone to its end, also once the noise is gone (else switching the music on would hide a dangerous minute).
// The voice is still heard meanwhile, at the boundaries' ceiling: the noise never makes the guard deafer.
function loudCheck(dt) {
  const C = CFG.mic, loud = G.mic.noise === 'loud' && !(G.breath && G.breath.holding);
  G.micLoudT = Math.max(0, (G.micLoudT || 0) + (loud ? dt : -dt));
  if (G.micLoudRound) return;
  if (G.micLoudT >= C.loudWarn && !G.micLoudWarned) { G.micLoudWarned = true; flash(S.micNoise.warn, 4, '#ffb347'); }
  if (G.micLoudT >= C.loudSecs) {
    G.micLoudRound = true; G.micOffRound = true;
    flash(S.micNoise.offRound, 8, '#ffb347');
  }
  if (!loud && G.micLoudT === 0) G.micLoudWarned = false;
}

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
  world(dt) {
    const ph = G.round && G.round.phase;
    if (!G.active || (ph !== 'heist' && ph !== 'escape')) return;
    if (!G.mic.live) { G.micOffRound = true; return; }
    loudCheck(dt);
  },
};
