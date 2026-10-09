// Phone feedback (plan-phone-mode §1.8, §10.1): vibration where the browser has it (Android Chrome),
// and where it has not (iPhone Safari has no navigator.vibrate) a short flash of the screen edge,
// plus a soft sound for "you are hidden". The setting 'feedback':
//   auto   vibration if available, else flashes (default)
//   flash  flashes only, no vibration (also a way to see the iPhone behaviour on an Android phone)
//   off    nothing
// The game's own sounds (heartbeat, siren, cash) are unchanged; these cues add to them.
import { playHiddenCue } from '../audio/audio.js';

// name -> { vib: pattern (ms), flash: colour, ms: flash length, cue: play the soft sound on iPhone }
const EVENTS = {
  stepsLoud: { vib: 12, flash: '#ffd166', ms: 160, weak: true },   // the joystick crossed the "quiet" ring
  hidden: { vib: 22, flash: '#5fd38d', ms: 320, cue: true },       // behind cover: the eye closed
  heartbeat: { vib: [55, 55, 35], flash: '#ff4d4d', ms: 420, weak: true },
  shout: { vib: [90, 50, 90], flash: '#ff4d4d', ms: 500 },
  alarm: { vib: [160, 90, 160, 90, 320], flash: '#ff3b3b', ms: 700 },
  caught: { vib: [260, 100, 420], flash: '#ff2b2b', ms: 900 },
  scare: { vib: 160, flash: '#ffffff', ms: 350 },
  deliver: { vib: 25, flash: null },                                // loot into the van (cash sound exists)
  run: { vib: [14, 40, 14], flash: '#ff7a1a', ms: 220, weak: true },  // running started (a double tick)
  runLock: { vib: 30, flash: '#ff7a1a', ms: 320 },                  // auto-run locked
};
const MIN_GAP = 90;   // ms between two vibrations of the same kind (a held button must not buzz non-stop)

export class Feedback {
  constructor(el) {
    this.el = el;                  // the full-screen edge-flash layer
    this.mode = 'auto';
    this.enabled = () => true;     // set by main: false while the game is paused / hidden
    this.count = { vibrations: 0, flashes: 0, cues: 0 };
    this.last = null;              // { name, how, t }
    this.lastAt = {};
  }

  get canVibrate() { return typeof navigator.vibrate === 'function'; }
  // how a cue reaches the player right now: 'vibrate' | 'flash' | 'off'
  get how() { return this.mode === 'off' ? 'off' : this.mode === 'auto' && this.canVibrate ? 'vibrate' : 'flash'; }

  play(name) {
    const ev = EVENTS[name], how = this.how;
    if (!ev || how === 'off' || !this.enabled()) return;
    const now = performance.now();
    if (now - (this.lastAt[name] || -1e9) < MIN_GAP) return;
    this.lastAt[name] = now;
    if (how === 'vibrate') {
      try { navigator.vibrate(ev.vib); } catch { /* blocked */ }
      this.count.vibrations++;
    } else if (ev.flash) {
      this.flash(ev.flash, ev.ms, ev.weak ? 0.5 : 0.9);
      this.count.flashes++;
      if (ev.cue) { playHiddenCue(); this.count.cues++; }
    }
    this.last = { name, how, t: +(now / 1000).toFixed(1) };
  }

  flash(color, ms, peak) {
    const el = this.el;
    if (!el) return;
    el.style.boxShadow = `inset 0 0 70px 22px ${color}`;
    if (el.animate) el.animate([{ opacity: peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    else { el.style.opacity = String(peak); setTimeout(() => { el.style.opacity = '0'; }, ms); }
  }

  state() { return { mode: this.mode, how: this.how, canVibrate: this.canVibrate, ...this.count, last: this.last }; }
}
