// Playing on a flat screen: the phone's touch controls and HUD (instead of the wrist panel), the
// microphone's phone options, the sample of game sounds, portrait = "rotate the phone".
import { loadSetting } from '../settings.js';
import { CFG } from '../config/index.js';
import { TouchControls, LOOK_SPEEDS } from '../input/touch.js';
import { ensureFullscreen } from '../platform/screen.js';
import { Hud } from '../ui/hud.js';
import { pressHooks } from '../ui/press.js';
import { unlockAudio, gameBusDb, playSampleSounds } from '../audio/audio.js';
import { G, $ } from './state.js';
import { fx } from './messages.js';

// the sample of game sounds (calibration step "Звуки гри", "Перевірити звук")
export function playGame() {
  const c = unlockAudio();
  if (!c) return 0;
  if (c.state === 'running') return playSampleSounds();
  c.resume().then(() => playSampleSounds(), () => {});
  return 3.2;
}
// phone: portrait while playing = paused behind "rotate the phone"
export const rotateBlocked = () => !!G.touch && G.playingDesktop && innerHeight > innerWidth;
export function phoneLayout() {
  if (!G.touch) return;
  document.body.classList.toggle('portrait-block', rotateBlocked());
}

export const flatScreen = {
  id: 'flatScreen',
  init() {
    const { mic, scream, pointer, camera } = G;
    // playingDesktop: playing on a flat screen (laptop with the mouse captured, or phone with touch)
    G.playingDesktop = false;
    const touch = G.touch = G.MODE.mode === 'phone' ? new TouchControls($('touch')) : null;
    if (touch) {
      touch.lookSpeed = LOOK_SPEEDS[loadSetting('lookSpeed', 'normal')] || LOOK_SPEEDS.normal;
      touch.breathToggle = loadSetting('breathMode', 'hold') === 'toggle';
      // a finger on a board button presses it (no camera turn); also after being caught (result board)
      touch.hitBoard = (x, y) => (G.playingDesktop && G.caughtT < 0 && !G.paused && !G.summary.isOpen ? pointer.hitAt(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2, camera) : null);
      // Android: if full screen was dropped (a system dialog, a back swipe), the next finger lift restores it
      touch.onGesture = () => { if (G.playingDesktop) ensureFullscreen(); };
      document.body.classList.add('phone-mode');
      // Safari: no pinch zoom, no double-tap zoom on the game
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      // a finger lift on any HTML button (menu, summary) restores full screen too
      pressHooks.onGesture = touch.onGesture;
      touch.onLoud = () => fx('stepsLoud');
      // microphone on a phone (T3): "covered?" hint, auto gain default
      mic.coverHint = true;
      mic.agcAdjust = true;
    }
    // the game's own sound from the speaker is not your voice (decision §9 p. 10: the analyser on the game
    // bus) — on every device since mic v2 stage 1 (owner's condition 09.11; audit Б8: it was phone only):
    // laptop speakers and a headset's speakers next to its microphone too. Headphones in / out everywhere.
    mic.gameDbFn = gameBusDb;
    mic.bleedGuess = touch ? CFG.mic.bleedDefault : G.MODE.mode === 'vr' ? CFG.mic.bleedDefaultVr : CFG.mic.bleedDefaultPc;
    mic.watchDevices();
    mic.watchPermission();
    mic.onSource = (src) => scream.retap(src);   // a re-opened microphone stream: the scream replay keeps recording
    // phone: the wrist panel is replaced by the HTML HUD (nothing is drawn on the wrist canvas)
    G.hud = touch ? new Hud($('hud')) : null;
    if (touch) G.wrist.mesh.visible = false;
  },
};
