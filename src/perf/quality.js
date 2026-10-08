// Phone performance (plan-phone-mode §4, wave T4): quality presets, dynamic resolution, a 30 / 60 FPS cap.
//   low     pixel ratio 1.0, no MSAA, lamps further than 12 m switched off, cheaper sound panning
//   medium  1.25
//   high    1.5 (never above the screen's own devicePixelRatio)
// 'auto' starts at medium (high on iPhone) and, the first time the game runs on this device, looks at
// 5 s of play: under 40 FPS it steps one preset down and remembers it. While playing, the dynamic
// resolution steps the pixel ratio down by 0.125 (to 0.75) after 3 s under 83 % of the target FPS and
// back up after 10 s at 95 % or more. MSAA is chosen when the page starts (WebGL cannot switch it later).
export const PRESETS = {
  low: { pr: 1.0, aa: false, farLights: false, panning: 'equalpower', name: 'низька' },
  medium: { pr: 1.25, aa: true, farLights: true, panning: 'HRTF', name: 'середня' },
  high: { pr: 1.5, aa: true, farLights: true, panning: 'HRTF', name: 'висока' },
};
export const ORDER = ['low', 'medium', 'high'];
const STEP = 0.125, FLOOR = 0.75;

// The preset the page starts with (before the renderer exists: MSAA depends on it)
export function startPreset(setting, autoPick, ios) {
  if (PRESETS[setting]) return setting;
  return PRESETS[autoPick] ? autoPick : ios ? 'high' : 'medium';
}

export class Quality {
  // renderer, setting ('auto' | preset), autoPick (saved), ios, cap (60 | 30), onAutoPick(preset)
  constructor({ renderer, setting, autoPick, ios, cap, onAutoPick }) {
    this.renderer = renderer;
    this.setting = setting;
    this.autoPick = PRESETS[autoPick] ? autoPick : null;
    this.ios = ios;
    this.cap = cap === 30 ? 30 : 60;
    this.onAutoPick = onAutoPick;
    this.aa = PRESETS[startPreset(setting, autoPick, ios)].aa;   // as created
    this.preset = startPreset(setting, autoPick, ios);
    this.secs = [];           // FPS of the last whole seconds while playing
    this.acc = { n: 0, ms: 0 };
    this.measure = null;      // auto pick: { t, frames, ms }
    this.steps = 0;           // dynamic resolution changes (report)
    this.apply(this.maxPr);
  }

  get maxPr() { return Math.min(window.devicePixelRatio || 1, PRESETS[this.preset].pr); }
  get target() { return this.cap; }
  get p() { return PRESETS[this.preset]; }
  // MSAA was decided when the page started; true when the preset now wants the other
  get needsReload() { return PRESETS[this.preset].aa !== this.aa; }

  apply(pr) {
    this.pr = Math.max(Math.min(FLOOR, this.maxPr), Math.min(this.maxPr, Math.round(pr / STEP) * STEP));
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  setSetting(setting) {
    this.setting = setting;
    this.preset = startPreset(setting, this.autoPick, this.ios);
    this.secs = []; this.measure = null;
    this.apply(this.maxPr);
  }
  setCap(cap) { this.cap = cap === 30 ? 30 : 60; this.secs = []; }

  // Every rendered frame while the phone is playing (not paused, not on the start screen).
  frame(ms) {
    if (!(ms > 0) || ms > 500) return;   // a hidden page or a pause: not a frame
    // auto: the first 5 s of play on this device (after 1 s of warm-up) pick the preset
    if (this.setting === 'auto' && !this.autoPick) {
      const M = this.measure || (this.measure = { t: 0, frames: 0, ms: 0 });
      M.t += ms;
      if (M.t > 1000) { M.frames++; M.ms += ms; }
      if (M.t > 6000) {
        const fps = M.frames * 1000 / M.ms, i = ORDER.indexOf(this.preset);
        this.autoPick = fps < 40 && i > 0 ? ORDER[i - 1] : this.preset;
        this.autoFps = +fps.toFixed(1);
        this.preset = this.autoPick;
        this.measure = null; this.secs = [];
        this.apply(this.maxPr);
        if (this.onAutoPick) this.onAutoPick(this.autoPick, this.autoFps);
      }
      return;
    }
    // dynamic resolution, judged on whole seconds
    this.acc.n++; this.acc.ms += ms;
    if (this.acc.ms < 1000) return;
    this.secs.push(this.acc.n * 1000 / this.acc.ms);
    this.acc = { n: 0, ms: 0 };
    if (this.secs.length > 10) this.secs.shift();
    const last = (k) => this.secs.slice(-k);
    if (this.secs.length >= 3 && last(3).every((f) => f < this.target * 0.83) && this.pr > Math.min(FLOOR, this.maxPr)) {
      this.apply(this.pr - STEP); this.steps++; this.secs = [];
    } else if (this.secs.length >= 10 && this.secs.every((f) => f >= this.target * 0.95) && this.pr < this.maxPr) {
      this.apply(this.pr + STEP); this.steps++; this.secs = [];
    }
  }

  state() {
    return { setting: this.setting, preset: this.preset, autoPick: this.autoPick, autoFps: this.autoFps, pixelRatio: this.pr, maxPixelRatio: this.maxPr, msaa: this.aa, cap: this.cap, dynamicSteps: this.steps, needsReload: this.needsReload };
  }
}
