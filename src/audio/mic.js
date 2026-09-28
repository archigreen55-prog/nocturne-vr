// Microphone loudness (plan §6): getUserMedia with AGC / noise suppression / echo cancellation off,
// AnalyserNode RMS 30 times a second -> dBFS, envelope (attack 50 ms, release 300 ms), classified
// against a per-player calibration into quiet (whisper) / normal / shout.
import { audioContext, unlockAudio } from './audio.js';
import { loadSetting, saveSetting } from '../settings.js';
import { CFG } from '../game/config.js';

const RATE = 30;               // analyses per second
const ATTACK = 0.05, RELEASE = 0.3;
const SHOUT_HOLD = 0.8;        // s the shout label stays after the peak
const DEFAULT_CAL = { floor: -62, normal: -32 };

export const LEVELS = {
  quiet: { label: 'ШЕПІТ', color: '#5fd38d' },
  normal: { label: 'НОРМАЛЬНО', color: '#ffd166' },
  shout: { label: 'КРИК!', color: '#ff4d4d' },
};

export class Mic {
  constructor() {
    this.state = 'off';        // off | pending | on | denied | none
    this.error = '';
    this.analyser = null;
    this.buf = null;
    this.db = -100;            // last raw RMS, dBFS
    this.env = -100;           // smoothed envelope, dBFS
    this.level = 'quiet';
    this.hist = new Float32Array(8);  // envelope history at RATE, for the rise test
    this.histI = 0;
    this.shoutUntil = 0;
    this.aboveT = 0;
    this.dipT = 0;
    this.riseOk = false;
    this.acc = 0;
    this.t = 0;
    this.collect = null;       // array while calibrating
    this.shoutOnset = false;   // true for one analysis when a new shout starts (see takeShout)
    this.source = null;        // MediaStreamSource (the scream recorder taps it too)
    const cal = loadSetting('mic', null);
    this.calibrated = !!(cal && Number.isFinite(cal.floor) && Number.isFinite(cal.normal));
    this.cal = this.calibrated ? cal : { ...DEFAULT_CAL };
    this.hist.fill(-100);
  }

  get whisperDb() { return this.cal.floor + CFG.mic.whisperK * (this.cal.normal - this.cal.floor); }
  // Shout threshold: from the calibration's shout step if it was done, else voice + shoutOver;
  // plus the player's own correction (the ± buttons on the start screen).
  get shoutDb() {
    const base = Number.isFinite(this.cal.shout) ? this.cal.shout : this.cal.normal + CFG.mic.shoutOver;
    return base + (this.cal.adj || 0);
  }

  async enable() {
    if (this.state === 'on' || this.state === 'pending') return this.state;
    const ctx = unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ctx) {
      this.state = 'none'; this.error = 'браузер не дає доступу до мікрофона';
      return this.state;
    }
    this.state = 'pending';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
      const src = audioContext().createMediaStreamSource(stream);
      this.analyser = audioContext().createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser);   // analysis only: never routed to the speakers
      this.source = src;
      this.stream = stream;
      this.track = stream.getAudioTracks()[0];
      this.state = 'on';
    } catch (e) {
      this.state = e && e.name === 'NotAllowedError' ? 'denied' : 'none';
      this.error = e && e.name === 'NotAllowedError' ? 'дозвіл не надано' : String(e && (e.message || e.name) || e);
    }
    return this.state;
  }

  // '' when the signal is live, else what is wrong (shown on the wrist: helps the first headset test)
  get problem() {
    if (this.state !== 'on') return '';
    const ctx = audioContext();
    if (ctx.state !== 'running') return `аудіо: ${ctx.state}`;
    if (this.track && this.track.readyState === 'ended') return 'потік мікрофона зупинено';
    if (this.track && this.track.muted) return 'мікрофон приглушено системою';
    return '';
  }

  // Call every frame with the frame time (s).
  update(dt) {
    if (this.state !== 'on') return;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    const step = Math.min(0.2, this.acc);
    this.acc = 0;
    this.t += step;
    const a = this.analyser, b = this.buf;
    a.getFloatTimeDomainData(b);
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    this.db = Math.max(-100, 10 * Math.log10(s / b.length + 1e-12));
    const tau = this.db > this.env ? ATTACK : RELEASE;
    this.env += (this.db - this.env) * (1 - Math.exp(-step / tau));
    if (this.collect) this.collect.push(this.db);

    // rise over ~100 ms: compare with the envelope 3 analyses ago
    const past = this.hist[(this.histI + this.hist.length - 3) % this.hist.length];
    this.hist[this.histI] = this.env;
    this.histI = (this.histI + 1) % this.hist.length;
    // A shout: the raw level jumps (shoutRise dB above the envelope of 0.1 s ago) over the threshold
    // and stays there for shoutMin s (dips under 70 ms allowed). Loud talk that builds up slowly, a
    // plosive "p" or one stressed syllable is not a shout.
    if (this.db > this.shoutDb) {
      if (this.aboveT === 0) this.riseOk = this.db - past > CFG.mic.shoutRise;
      this.aboveT += step; this.dipT = 0;
      if (this.t < this.shoutUntil) this.shoutUntil = Math.max(this.shoutUntil, this.t + 0.3);   // still shouting
      else if (this.riseOk && this.aboveT >= CFG.mic.shoutMin) { this.shoutOnset = true; this.shoutUntil = this.t + SHOUT_HOLD; }
    } else {
      this.dipT += step;
      if (this.dipT > 0.07) { this.aboveT = 0; this.riseOk = false; }
    }
    if (this.t < this.shoutUntil) this.level = 'shout';
    else this.level = this.env >= this.whisperDb ? 'normal' : 'quiet';
  }

  // true once when a new shout has started since the last call
  takeShout() { const s = this.shoutOnset; this.shoutOnset = false; return s; }

  // Calibration: collect raw dB for `seconds`, then return a percentile of them.
  measure(seconds, pct) {
    this.collect = [];
    return new Promise((resolve) => setTimeout(() => {
      const v = this.collect.slice().sort((x, y) => x - y);
      this.collect = null;
      resolve(v.length ? v[Math.min(v.length - 1, Math.floor(v.length * pct))] : null);
    }, seconds * 1000));
  }

  // shout: measured shout threshold (dB) or null to use voice + shoutOver
  setCalibration(floor, normal, shout = null) {
    this.cal = { floor, normal, shout, adj: 0 };
    this.calibrated = true;
    saveSetting('mic', this.cal);
  }

  // Player's correction of the shout threshold (dB, + = shouts are harder to trigger).
  adjustShout(delta) {
    this.cal.adj = Math.max(-12, Math.min(18, (this.cal.adj || 0) + delta));
    saveSetting('mic', this.cal);
  }

  // 0..1 position of a dB value on the level bar (floor - 10 .. shout + 12)
  barPos(db) {
    const lo = this.cal.floor - 10, hi = this.shoutDb + 12;
    return Math.min(1, Math.max(0, (db - lo) / (hi - lo)));
  }
}

// "Hold your breath" (A / Shift): the game ignores the microphone for up to CFG.breath.hold s.
// The cooldown after it is proportional to how long you held (a full hold = CFG.breath.cooldown s,
// at least cooldownMin); a tap shorter than CFG.breath.tap is cancelled and costs nothing.
// Shown as a ring on the wrist.
export class Breath {
  constructor() { this.state = 'ready'; this.t = 0; this.cool = CFG.breath.cooldown; this.prevDown = false; }
  get holding() { return this.state === 'holding'; }
  // seconds left: of the hold while holding, of the cooldown while resting
  get left() {
    if (this.state === 'holding') return Math.max(0, CFG.breath.hold - this.t);
    if (this.state === 'cooldown') return Math.max(0, this.cool - this.t);
    return 0;
  }
  // 0..1 for the ring: remaining hold, or cooldown progress
  get ring() {
    if (this.state === 'holding') return 1 - this.t / CFG.breath.hold;
    if (this.state === 'cooldown') return this.t / this.cool;
    return 1;
  }
  reset() { this.state = 'ready'; this.t = 0; }
  // Returns 'start' | 'end' | 'cancel' | 'busy' (pressed during the cooldown) | null.
  update(dt, down) {
    const B = CFG.breath;
    const pressed = down && !this.prevDown;   // a new press is needed to start again
    this.prevDown = down;
    if (this.state === 'ready') {
      if (pressed) { this.state = 'holding'; this.t = 0; return 'start'; }
    } else if (this.state === 'holding') {
      this.t += dt;
      if (!down || this.t >= B.hold) {
        if (!down && this.t < B.tap) { this.state = 'ready'; this.t = 0; return 'cancel'; }
        this.cool = Math.max(B.cooldownMin, B.cooldown * Math.min(1, this.t / B.hold));
        this.state = 'cooldown'; this.t = 0;
        return 'end';
      }
    } else {
      this.t += dt;
      if (this.t >= this.cool) { this.state = 'ready'; this.t = 0; }
      else if (pressed) return 'busy';
    }
    return null;
  }
}
