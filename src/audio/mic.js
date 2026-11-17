// Microphone loudness (plan §6): getUserMedia with AGC / noise suppression / echo cancellation off,
// AnalyserNode RMS 30 times a second -> dBFS, envelope (attack 50 ms, release 300 ms), classified
// against a per-player calibration into quiet (whisper) / normal / shout.
import { audioContext, unlockAudio, setAudioSession } from './audio.js';
import { loadSetting, saveSetting } from '../settings.js';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const RATE = 30;               // analyses per second
const ATTACK = 0.05, RELEASE = 0.3;
const SHOUT_HOLD = 0.8;        // s the shout label stays after the peak
const DEFAULT_CAL = { floor: -62, normal: -32 };
const CONSTRAINTS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false };
// readable reasons for a microphone that did not open
const why = (e) => (e && e.name === 'NotAllowedError' ? S.mic.err.denied
  : e && e.name === 'NotFoundError' ? S.mic.err.notFound
    : e && e.name === 'NotReadableError' ? S.mic.err.busy
      : String(e && (e.message || e.name) || e));
// The game's loudness used for the boundaries rises at once, is held GAME_HOLD s after the game was
// last loud (speaker -> air -> microphone lag, the analyser windows), then falls by at most GAME_FALL
// dB/s. The microphone envelope falls faster than that while it is above the whisper boundary
// (release 0.3 s over a 20+ dB gap), so a fading game sound in the microphone stays under the raised
// boundary until it is a whisper anyway.
const GAME_HOLD = 0.25, GAME_FALL = 40;

export const LEVELS = {
  quiet: { label: S.mic.level.quiet, color: '#7fd0ff' },   // W17: whisper
  normal: { label: S.mic.level.normal, color: '#ffb347' },   // lamp
  shout: { label: S.mic.level.shout, color: '#ff5468' },   // alarm
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
    this.win = [];             // the last CFG.mic.shoutWindow s of analyses: [time, above the shout threshold 0 / 1, …]
    this.shoutUntil = 0;
    this.aboveT = 0;
    this.dipT = 0;
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
    // set by systems/flatScreen.js: the game bus level, for the protection against the game's own sounds
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
    this.bleedGuess = null;     // dB: how loud the game is in the microphone until «Звуки гри» measures it (by device type, systems/flatScreen.js)
  }

  // this device's microphone is heard by the game now
  get live() { return this.state === 'on' && !this.noMic; }
  // Б1 (plan 2026-11-12-mic-v2 §2.2): one honest state for every place that shows the microphone
  // ok | uncal (on, not calibrated) | problem (on, but not heard: mic.problem) | pending | willStart
  // (calibrated, opens on «Грати») | off (never set up) | denied | none | nomic (the player's choice)
  get status() {
    if (this.noMic) return 'nomic';
    if (this.state === 'on') return this.problem ? 'problem' : this.calibrated ? 'ok' : 'uncal';
    if (this.state === 'pending') return 'pending';
    if (this.state === 'denied' || this.permission === 'denied') return 'denied';
    if (this.state === 'none') return 'none';
    return this.calibrated ? 'willStart' : 'off';
  }

  // ---- protection against the game's own sounds (every device since mic v2 stage 1; was phone only) ----
  // bleed: the calibration's measurement, else (phone, not measured yet) an estimate; null = no protection
  get bleedMeasured() { return Number.isFinite(this.cal.bleed); }
  get bleedDb() { return this.bleedMeasured ? this.cal.bleed : this.gameDbFn ? this.bleedGuess ?? CFG.mic.bleedDefault : null; }
  get gameHold() { return this.gameEnv; }
  // the game as the microphone hears it now (dBFS), -Infinity when silent or unprotected
  get gameInMic() {
    const b = this.bleedDb, g = this.gameHold;
    return !this.gameDbFn || b === null || g <= -90 ? -Infinity : g + b;
  }
  // the boundaries in effect right now: raised while the game is loud
  // raise: dB added while out of breath after running (systems/sprint.js), so real heavy breathing
  // into the microphone is not punished on top of the game's own breathing noise
  get whisperEff() { return Math.max(this.whisperDb + (this.raise || 0), this.gameInMic + CFG.mic.maskWhisper); }
  get shoutEff() { return Math.max(this.shoutDb, this.gameInMic + CFG.mic.maskShout, this.whisperEff + 3); }
  // W7 (Шепотун): a whisper = not silence and not a voice: above your calibrated silence by
  // CFG.story.whisperer.overFloor dB (uncalibrated: the voice boundary minus `uncalibrated`), above the
  // game's own sound in the microphone, below the voice boundary. Levels only, no sound kept.
  get whisperLow() {
    const W = CFG.story.whisperer, eff = this.whisperEff;
    const lo = this.calibrated ? Math.min(this.cal.floor + W.overFloor, eff - 2) : eff - W.uncalibrated;
    return Math.max(lo, this.gameInMic + 3);
  }
  get whispering() { return this.state === 'on' && !this.noMic && this.level === 'quiet' && this.t - (this.loudT ?? -1e9) > 0.5 && this.env >= this.whisperLow && this.env < this.whisperEff; }
  get masking() { return Math.max(0, this.whisperEff - this.whisperDb - (this.raise || 0)); }   // dB the whisper boundary is raised by the game
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
  // Shout threshold: your voice + the larger of shoutGapMin dB and shoutGapK of the way from your voice to
  // your shout (the calibration's shout step), else voice + shoutOver; plus your correction, never below your
  // calibrated voice + a margin (else normal talk would be a shout). Plan «голос і кільця» (15.11): it was
  // half the way, and a loud steady voice never reached it (the owner's calibration: voice -22.4, threshold
  // -15.2, a loud voice about -17). Older calibrations kept only that half-way threshold: the shout's own
  // level is recovered from it.
  get shoutPeak() {
    const c = this.cal;
    if (Number.isFinite(c.shoutPeak)) return c.shoutPeak;
    return Number.isFinite(c.shout) ? c.normal + 2 * (c.shout - c.normal) : null;
  }
  get shoutBase() {
    const c = this.cal, M = CFG.mic, peak = this.shoutPeak;
    if (peak !== null) return c.normal + Math.max(M.shoutGapMin, M.shoutGapK * (peak - c.normal));
    return c.normal + (this.agcAdjust && this.agc ? Math.min(CFG.mic.shoutOverAgc, M.shoutOver) : M.shoutOver);
  }
  get shoutMin() { return this.cal.normal + CFG.mic.limitMargin.shoutOverVoice; }
  get shoutDb() { return Math.max(this.shoutMin, this.shoutBase + (this.cal.adj || 0)); }

  async enable() {
    if (this.state === 'on' || this.state === 'pending') return this.state;
    const ctx = unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ctx) {
      this.state = 'none'; this.error = S.mic.err.noAccess;
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
      if (e && e.name === 'NotAllowedError') { this.state = 'denied'; this.error = S.mic.err.denied; }
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
    if (ctx.state !== 'running') return S.mic.problem.audio(ctx.state);
    if (this.track && this.track.readyState === 'ended') return S.mic.problem.ended;
    if (this.track && this.track.muted) return S.mic.problem.muted;
    if (this.covered) return S.mic.problem.covered;
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

    // A shout (plan «голос і кільця», 15.11): CFG.mic.shoutShare of the analyses of the last shoutWindow s
    // above the threshold — a steady loud voice too, not only a sudden jump (that rule kept a yell rising
    // out of talk a «НОРМАЛЬНО» forever). A knock on the phone, a cough, a plosive «п» or one stressed
    // syllable are shorter than the window. (The effective boundaries: raised while the game's own sound is
    // loud in the microphone.)
    const W = CFG.mic.shoutWindow, above = this.db > this.shoutEff;
    this.win.push(this.t, above ? 1 : 0);
    while (this.win.length > 2 && this.win[0] <= this.t - W) this.win.splice(0, 2);
    let n = 0, up = 0;
    for (let i = 1; i < this.win.length; i += 2) { n++; up += this.win[i]; }
    const full = this.t - this.win[0] + step >= 0.8 * W;   // the window has filled (not the first moments)
    if (above) { this.aboveT += step; this.dipT = 0; } else { this.dipT += step; if (this.dipT > 0.07) this.aboveT = 0; }
    if (above && this.t < this.shoutUntil) this.shoutUntil = Math.max(this.shoutUntil, this.t + 0.3);   // still shouting
    else if (above && full && up >= CFG.mic.shoutShare * n) { this.shoutOnset = true; this.shoutUntil = this.t + SHOUT_HOLD; }
    if (this.t < this.shoutUntil) this.level = 'shout';
    else this.level = this.env >= this.whisperEff ? 'normal' : 'quiet';
    if (this.level !== 'quiet') this.loudT = this.t;   // W7: the tail of a voice is not a whisper
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
    if (Number.isFinite(cal.shoutPeak)) this.cal.shoutPeak = cal.shoutPeak;   // the shout step's own level (the threshold comes from it)
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
  // state: 'ready' (the tank has at least minStart s) | 'holding' | 'cooldown' (too little in the tank: not yet). tank: s of breath in it, 0..hold
  constructor() { this.state = 'ready'; this.tank = CFG.breath.hold; this.t = 0; this.prevDown = false; }
  get holding() { return this.state === 'holding'; }
  get rate() { return CFG.breath.hold / CFG.breath.refill; }   // s of tank per second while not holding
  // seconds: what is left to hold while holding or ready; while it is too low, how long until you may hold again
  get left() { return this.state === 'cooldown' ? Math.max(0, (CFG.breath.minStart - this.tank) / this.rate) : this.tank; }
  // 0..1 for the ring: the tank's fill (the ring shrinks while you hold and grows while it refills)
  get ring() { return Math.max(0, Math.min(1, this.tank / CFG.breath.hold)); }
  reset() { this.state = 'ready'; this.tank = CFG.breath.hold; this.t = 0; }
  // Returns 'start' | 'end' | 'cancel' | 'busy' (pressed while the tank is too low) | null.
  update(dt, down) {
    const B = CFG.breath;
    const pressed = down && !this.prevDown;   // a new press is needed to start again
    this.prevDown = down;
    if (this.state === 'holding') {
      this.t += dt; this.tank -= dt;
      if (!down || this.tank <= 0) {
        if (!down && this.t < B.tap) { this.tank = Math.min(B.hold, this.tank + this.t); this.state = 'ready'; this.t = 0; return 'cancel'; }   // a tap costs nothing
        this.tank = Math.max(0, this.tank);
        this.state = this.tank < B.minStart ? 'cooldown' : 'ready'; this.t = 0;
        return 'end';
      }
      return null;
    }
    this.tank = Math.min(B.hold, this.tank + dt * this.rate);
    if (this.state === 'cooldown' && this.tank >= B.minStart) this.state = 'ready';
    if (this.state === 'ready') { if (pressed && this.tank >= B.minStart) { this.state = 'holding'; this.t = 0; return 'start'; } }
    else if (pressed) return 'busy';
    return null;
  }
}
