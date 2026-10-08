// Microphone loudness (plan §6): getUserMedia with AGC / noise suppression / echo cancellation off,
// AnalyserNode RMS 30 times a second -> dBFS, envelope (attack 50 ms, release 300 ms), classified
// against a per-player calibration into quiet (whisper) / normal / shout.
import { audioContext, unlockAudio, setAudioSession } from './audio.js';
import { loadSetting, saveSetting } from '../settings.js';
import { CFG } from '../config/index.js';

const RATE = 30;               // analyses per second
const ATTACK = 0.05, RELEASE = 0.3;
const SHOUT_HOLD = 0.8;        // s the shout label stays after the peak
const DEFAULT_CAL = { floor: -62, normal: -32 };
const CONSTRAINTS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false };
// readable reasons for a microphone that did not open
const why = (e) => (e && e.name === 'NotAllowedError' ? 'дозвіл не надано'
  : e && e.name === 'NotFoundError' ? 'мікрофон не знайдено'
    : e && e.name === 'NotReadableError' ? 'мікрофон зайнятий іншим застосунком (дзвінок, диктофон) — закрий його й спробуй ще раз'
      : String(e && (e.message || e.name) || e));
// The game's loudness used for the boundaries rises at once, is held GAME_HOLD s after the game was
// last loud (speaker -> air -> microphone lag, the analyser windows), then falls by at most GAME_FALL
// dB/s. The microphone envelope falls faster than that while it is above the whisper boundary
// (release 0.3 s over a 20+ dB gap), so a fading game sound in the microphone stays under the raised
// boundary until it is a whisper anyway.
const GAME_HOLD = 0.25, GAME_FALL = 40;

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
    this.noMic = loadSetting('nomic', false) === true;   // play without the microphone
    const cal = loadSetting('mic', null);
    this.calibrated = !!(cal && Number.isFinite(cal.floor) && Number.isFinite(cal.normal));
    this.cal = this.calibrated ? cal : { ...DEFAULT_CAL };
    // corrections saved before the limits existed (or out of range): bring them inside
    this.clampedOnLoad = false;
    for (const k of ['adj', 'adjW']) {
      if (!this.cal[k]) continue;
      const [lo, hi] = this.adjustRange(k), v = Math.max(lo, Math.min(hi, this.cal[k]));
      if (v !== this.cal[k]) { this.cal[k] = v; this.clampedOnLoad = true; }
    }
    if (this.clampedOnLoad) saveSetting('mic', this.cal);
    this.hist.fill(-100);
    // phone only (set by main): the game bus level, for the protection against the game's own sounds
    this.gameDbFn = null;
    this.gameDb = -100;
    this.gameEnv = -100;
    this.gamePeakT = 0;
    this.coverHint = false;     // phone: say "microphone covered?" when the level stays far under your silence
    this.lowT = 0;
    this.covered = false;
    this.deviceChanged = false; // an input / output device came or went since the calibration
    this.permission = 'unknown';
    this.events = { ended: 0, reacquired: 0, recoverFailed: 0, deviceChanges: 0, lastRecover: '' };
    this.onSource = null;       // (MediaStreamSource) after the stream was replaced: the scream recorder re-taps
    this.onChange = null;       // permission / device / stream changes: refresh the UI
    this.feed = null;           // tests: () => dB instead of the analyser
    this.agcAdjust = false;     // phone: a smaller default voice -> shout gap when auto gain stays on
  }

  // ---- protection against the game's own sounds (phone) ----
  // bleed: the calibration's measurement, else (phone, not measured yet) an estimate; null = no protection
  get bleedMeasured() { return Number.isFinite(this.cal.bleed); }
  get bleedDb() { return this.bleedMeasured ? this.cal.bleed : this.gameDbFn ? CFG.mic.bleedDefault : null; }
  get gameHold() { return this.gameEnv; }
  // the game as the microphone hears it now (dBFS), -Infinity when silent or unprotected
  get gameInMic() {
    const b = this.bleedDb, g = this.gameHold;
    return !this.gameDbFn || b === null || g <= -90 ? -Infinity : g + b;
  }
  // the boundaries in effect right now: raised while the game is loud
  get whisperEff() { return Math.max(this.whisperDb, this.gameInMic + CFG.mic.maskWhisper); }
  get shoutEff() { return Math.max(this.shoutDb, this.gameInMic + CFG.mic.maskShout, this.whisperEff + 3); }
  get masking() { return Math.max(0, this.whisperEff - this.whisperDb); }   // dB the whisper boundary is raised by the game
  // auto gain the browser did not switch off (Safari often ignores the constraint)
  get agc() { try { return !!this.track && this.track.getSettings().autoGainControl === true; } catch { return false; } }

  // Whisper/voice boundary: between your whisper and your voice if the whisper step was usable,
  // else between silence and voice; plus your own correction (± on the start screen and the board),
  // kept within the sane range (whisperLimits).
  get whisperBase() {
    const c = this.cal;
    return this.whisperUsable ? c.whisper + 0.45 * (c.normal - c.whisper) : c.floor + CFG.mic.whisperK * (c.normal - c.floor);
  }
  get whisperUsable() { const c = this.cal; return Number.isFinite(c.whisper) && c.normal - c.whisper >= 4; }
  // [lo, hi] for the whisper boundary: above your whisper (or the silence) + a margin, so a whisper
  // stays "ШЕПІТ"; below your voice - a margin, so normal talk is still heard
  get whisperLimits() {
    const c = this.cal, M = CFG.mic.limitMargin;
    let lo = (this.whisperUsable ? c.whisper : c.floor) + M.whisper, hi = c.normal - M.voiceOverWhisper;
    if (lo > hi) lo = hi = (lo + hi) / 2;
    return [lo, hi];
  }
  get whisperDb() {
    const [lo, hi] = this.whisperLimits;
    return Math.min(hi, Math.max(lo, this.whisperBase + (this.cal.adjW || 0)));
  }
  // Shout threshold: from the calibration's shout step if it was done, else voice + shoutOver; plus
  // your correction, never below your calibrated voice + a margin (else normal talk would be a shout).
  get shoutBase() { return Number.isFinite(this.cal.shout) ? this.cal.shout : this.cal.normal + (this.agcAdjust && this.agc ? CFG.mic.shoutOverAgc : CFG.mic.shoutOver); }
  get shoutMin() { return this.cal.normal + CFG.mic.limitMargin.shoutOverVoice; }
  get shoutDb() { return Math.max(this.shoutMin, this.shoutBase + (this.cal.adj || 0)); }

  async enable() {
    if (this.state === 'on' || this.state === 'pending') return this.state;
    const ctx = unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ctx) {
      this.state = 'none'; this.error = 'браузер не дає доступу до мікрофона';
      return this.state;
    }
    this.state = 'pending';
    setAudioSession('play-and-record');   // iPhone: record and play at once (no-op elsewhere)
    try {
      this.attach(await navigator.mediaDevices.getUserMedia(CONSTRAINTS));
      this.state = 'on';
      this.error = '';
    } catch (e) {
      setAudioSession('playback');
      this.state = e && e.name === 'NotAllowedError' ? 'denied' : 'none';
      this.error = why(e);
    }
    if (this.onChange) this.onChange();
    return this.state;
  }

  // Wire a (new) stream into the analyser; the old one is stopped.
  attach(stream) {
    const ctx = audioContext();
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.buf = new Float32Array(this.analyser.fftSize);
    }
    if (this.source) { try { this.source.disconnect(); } catch { /* already */ } }
    if (this.stream && this.stream !== stream) for (const t of this.stream.getTracks()) t.stop();
    const src = ctx.createMediaStreamSource(stream);
    src.connect(this.analyser);   // analysis only: never routed to the speakers
    this.source = src;
    this.stream = stream;
    const track = this.track = stream.getAudioTracks()[0];
    this.deviceLabel = track ? track.label : '';
    if (track) {
      track.addEventListener('ended', () => { if (this.track === track) { this.events.ended++; if (this.onChange) this.onChange(); } });
      track.addEventListener('mute', () => { if (this.onChange) this.onChange(); });
      track.addEventListener('unmute', () => { if (this.onChange) this.onChange(); });
    }
    if (this.onSource) this.onSource(src);
  }

  // A new stream for a microphone that the system stopped (a call, a device unplugged). No dialog
  // when the permission is already granted.
  async reacquire() {
    try {
      setAudioSession('play-and-record');
      this.attach(await navigator.mediaDevices.getUserMedia(CONSTRAINTS));
      this.state = 'on'; this.error = '';
      this.events.reacquired++;
      return true;
    } catch (e) {
      this.events.recoverFailed++;
      if (e && e.name === 'NotAllowedError') { this.state = 'denied'; this.error = 'дозвіл не надано'; }
      else this.error = why(e);
      return false;
    } finally { if (this.onChange) this.onChange(); }
  }

  // After a pause, a minimised page or a call: wake the audio and bring the microphone back.
  // Call from a tap (iPhone resumes audio and opens the microphone only from a user gesture).
  // Returns 'off' | 'ok' | 'muted' (the system still holds it: it comes back by itself) | 'reacquired' | 'failed'.
  async recover() {
    let r;
    if (this.state !== 'on') r = 'off';
    else {
      unlockAudio();
      if (!this.track || this.track.readyState === 'ended') r = (await this.reacquire()) ? 'reacquired' : 'failed';
      else r = this.track.muted ? 'muted' : 'ok';
    }
    this.events.lastRecover = r;
    return r;
  }

  // Headphones with a microphone plugged in or out: the calibration (and the game's sound in the
  // microphone) no longer fit. The stream is re-opened if the system ended it.
  watchDevices() {
    const md = navigator.mediaDevices;
    if (!md || !md.addEventListener) return;
    md.addEventListener('devicechange', async () => {
      if (this.state !== 'on') return;
      this.events.deviceChanges++;
      this.deviceChanged = true;
      if (this.track && this.track.readyState === 'ended') await this.reacquire();
      if (this.onChange) this.onChange();
    });
  }

  // The permission state before asking (Chrome; Safari often answers 'prompt' or nothing)
  watchPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      this.permission = st.state;
      st.onchange = () => { this.permission = st.state; if (this.onChange) this.onChange(); };
      if (this.onChange) this.onChange();
    }, () => { this.permission = 'unknown'; });
  }

  // '' when the signal is live, else what is wrong (shown on the wrist: helps the first headset test)
  get problem() {
    if (this.state !== 'on') return '';
    const ctx = audioContext();
    if (ctx.state !== 'running') return `аудіо: ${ctx.state}`;
    if (this.track && this.track.readyState === 'ended') return 'потік мікрофона зупинено';
    if (this.track && this.track.muted) return 'мікрофон приглушено системою';
    if (this.covered) return 'Мікрофон закритий? Прибери палець з нижнього краю';
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
    if (this.gameDbFn) {
      const g = this.gameDb = this.gameDbFn();
      if (g >= this.gameEnv - 3) this.gamePeakT = this.t;   // still loud: keep holding
      if (g >= this.gameEnv) this.gameEnv = g;
      else if (this.t - this.gamePeakT > GAME_HOLD) this.gameEnv = Math.max(g, this.gameEnv - GAME_FALL * step);
    }
    if (this.feed) this.db = this.feed(this);
    else {
      const a = this.analyser, b = this.buf;
      a.getFloatTimeDomainData(b);
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      this.db = Math.max(-100, 10 * Math.log10(s / b.length + 1e-12));
    }
    const tau = this.db > this.env ? ATTACK : RELEASE;
    this.env += (this.db - this.env) * (1 - Math.exp(-step / tau));
    if (this.collect) { this.collect.push(this.db); if (this.collectBus) this.collectBus.push(this.gameDb); }
    // "microphone covered?" (phone): far under your silence for a while
    if (this.coverHint && this.calibrated) {
      this.lowT = this.env < this.cal.floor - CFG.mic.coverDrop ? this.lowT + step : 0;
      this.covered = this.lowT >= CFG.mic.coverSecs;
    }

    // rise over ~100 ms: compare with the envelope 3 analyses ago
    const past = this.hist[(this.histI + this.hist.length - 3) % this.hist.length];
    this.hist[this.histI] = this.env;
    this.histI = (this.histI + 1) % this.hist.length;
    // A shout: the raw level jumps (shoutRise dB above the envelope of 0.1 s ago) over the threshold
    // and stays there for shoutMin s (dips under 70 ms allowed). Loud talk that builds up slowly, a
    // plosive "p" or one stressed syllable is not a shout.
    // (the effective boundaries: raised while the game's own sound is loud in the microphone)
    if (this.db > this.shoutEff) {
      if (this.aboveT === 0) this.riseOk = this.db - past > CFG.mic.shoutRise;
      this.aboveT += step; this.dipT = 0;
      if (this.t < this.shoutUntil) this.shoutUntil = Math.max(this.shoutUntil, this.t + 0.3);   // still shouting
      else if (this.riseOk && this.aboveT >= CFG.mic.shoutMin) { this.shoutOnset = true; this.shoutUntil = this.t + SHOUT_HOLD; }
    } else {
      this.dipT += step;
      if (this.dipT > 0.07) { this.aboveT = 0; this.riseOk = false; }
    }
    if (this.t < this.shoutUntil) this.level = 'shout';
    else this.level = this.env >= this.whisperEff ? 'normal' : 'quiet';
  }

  // true once when a new shout has started since the last call
  takeShout() { const s = this.shoutOnset; this.shoutOnset = false; return s; }

  // Calibration: collect raw dB for `seconds`, then return a percentile of them.
  // withBus: also the game bus level over the same time -> { db, bus }
  measure(seconds, pct, withBus = false) {
    this.collect = [];
    this.collectBus = withBus ? [] : null;
    const pick = (a) => { if (!a || !a.length) return null; const v = a.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(v.length * pct))]; };
    return new Promise((resolve) => setTimeout(() => {
      const db = pick(this.collect), bus = pick(this.collectBus);
      this.collect = null; this.collectBus = null;
      resolve(withBus ? { db, bus } : db);
    }, seconds * 1000));
  }

  // cal: { floor, normal, whisper (or null), shout (threshold, or null = voice + shoutOver), bleed (phone) }
  setCalibration(cal) {
    this.cal = { floor: cal.floor, normal: cal.normal, whisper: cal.whisper ?? null, shout: cal.shout ?? null, adj: 0, adjW: 0 };
    if (Number.isFinite(cal.bleed)) this.cal.bleed = cal.bleed;   // phone: the game's sound in the microphone
    this.calibrated = true;
    this.deviceChanged = false;
    saveSetting('mic', this.cal);
  }

  // Player's corrections (dB): + makes a shout (adj) / normal voice (adjW) harder to trigger.
  // Clamped to the UI range and to the sane limits above; returns true if it hit a limit.
  adjustShout(delta) { return this.setAdjust('adj', (this.cal.adj || 0) + delta); }
  adjustWhisper(delta) { return this.setAdjust('adjW', (this.cal.adjW || 0) + delta); }
  adjustRange(key) {
    if (key === 'adj') return [Math.max(-12, Math.ceil(this.shoutMin - this.shoutBase)), 18];
    const [lo, hi] = this.whisperLimits, b = this.whisperBase;
    const min = Math.max(-10, Math.ceil(lo - b));
    return [min, Math.max(min, Math.min(10, Math.floor(hi - b)))];
  }
  setAdjust(key, v) {
    const [lo, hi] = this.adjustRange(key);
    const c = Math.max(lo, Math.min(hi, v));
    this.cal[key] = c;
    saveSetting('mic', this.cal);
    return c !== v;
  }
  resetAdjust() { this.cal.adj = 0; this.cal.adjW = 0; saveSetting('mic', this.cal); }

  setNoMic(v) { this.noMic = !!v; saveSetting('nomic', this.noMic); }

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
