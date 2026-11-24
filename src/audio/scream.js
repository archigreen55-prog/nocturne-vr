// Scream replay. The last CFG.scream.buffer s of the microphone live in memory only. When a shout
// starts, CFG.scream.after s later a clip (before + after s around the peak) is cut out; one clip of
// the round is kept for the board: the one a guard came to (markHeard), else the loudest — measured
// on the raw samples (the loudest 50 ms window), not on the microphone's smoothed level, which the
// phone's auto-gain flattens; equal loudness: the later one. Nothing is written to disk or sent
// anywhere; clear() (a new round) drops it.
//
// Three ways to get the samples, tried in order, each checked to really deliver sound:
//   'worklet'  AudioWorklet tap (off the main thread)        -> ring buffer of raw samples
//   'script'   ScriptProcessor tap (older, main thread)      -> ring buffer of raw samples
//   'recorder' MediaRecorder in 2 s segments (last 3 kept)  -> decoded and cut when needed
// ?rec=script / ?rec=recorder in the address forces a mode (for testing).
import { audioContext } from './audio.js';
import { VERSION } from '../version.js';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const SEG_MS = 2000;
const WIN_S = 0.05;        // loudness: the loudest window of this length (RMS)
const EQUAL_DB = 0.05;     // closer than this = equally loud: the later clip wins
const HEARD_WINDOW = 1.5;  // s: a guard's reaction belongs to the clip whose shout was this close in time
const QUEUE_MAX = 2;       // MediaRecorder mode: shouts that come while a clip is being decoded wait here

// How loud a clip is, in dBFS: the loudest 50 ms window of the raw samples (before any normalising)
export function clipLoudness(samples, rate, win = WIN_S) {
  const n = Math.max(1, Math.min(samples.length, Math.round(rate * win)));
  let sum = 0, best = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
    if (i >= n) sum -= samples[i - n] * samples[i - n];
    if (i >= n - 1 && sum > best) best = sum;
  }
  const rms = Math.sqrt(Math.max(0, best) / n);
  return rms > 1e-9 ? 20 * Math.log10(rms) : -180;
}
// Which of two clips (a is the later one) is kept: the one a guard came to beats one nobody heard;
// then the louder; equally loud: the later
export const betterClip = (a, b) => (!!a.heard !== !!b.heard ? !!a.heard : a.db >= b.db - EQUAL_DB);
const MODE_NAMES = { worklet: 'AudioWorklet', script: 'ScriptProcessor', recorder: 'MediaRecorder', none: S.scream.none };

export class ScreamRecorder {
  constructor(mic) {
    this.mic = mic;
    this.ready = false;
    this.mode = '';          // worklet | script | recorder | none ('' = not started)
    this.ring = null;
    this.w = 0;              // write index
    this.filled = 0;
    this.pending = null;     // { at (ctx time), t (round time), heard }
    this.queue = [];         // shouts that came while a MediaRecorder clip was decoded
    this.busy = false;       // decoding a MediaRecorder clip
    this.best = null;        // { samples, t (round time of the shout), db (dBFS of its loudest 50 ms), heard (the guard's name, or true) }
    this.log = [];           // this round's clips: { t, db, heard, kept } (the report)
    this.count = 0;
    this.playing = null;
    this.segs = [];
  }

  get modeName() { return MODE_NAMES[this.mode] || '…'; }

  // Call after the microphone is on. Resolves with the working mode.
  async start() {
    if (this.mode || this.mic.state !== 'on' || !this.mic.source) return this.mode;
    this.mode = 'starting';
    const ctx = audioContext();
    this.rate = ctx.sampleRate;
    this.ring = new Float32Array(Math.ceil(this.rate * CFG.scream.buffer));
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;                 // keeps the taps running; nothing reaches the speakers
    this.sink.connect(ctx.destination);
    const force = new URLSearchParams(location.search).get('rec');
    const order = force === 'script' ? ['script'] : force === 'recorder' ? ['recorder'] : ['worklet', 'script', 'recorder'];
    for (const m of order) {
      try {
        if (m === 'recorder') { if (await this.startRecorder()) { this.mode = m; break; } continue; }
        const node = m === 'worklet' ? await this.tapWorklet(ctx) : this.tapScript(ctx);
        if (await this.flowing()) { this.mode = m; this.node = node; break; }
        this.mic.source.disconnect(node); node.disconnect();
      } catch (e) { console.warn('scream recorder', m, e); }
    }
    if (this.mode === 'starting') this.mode = 'none';
    this.ready = this.mode !== 'none';
    console.log('scream recorder mode:', this.mode);
    return this.mode;
  }

  async tapWorklet(ctx) {
    await ctx.audioWorklet.addModule(new URL(`./ringTap.worklet.js?v=${VERSION}`, import.meta.url));
    const node = new AudioWorkletNode(ctx, 'ring-tap');
    node.port.onmessage = (e) => this.push(e.data);
    this.mic.source.connect(node);
    node.connect(this.sink);
    return node;
  }

  tapScript(ctx) {
    const node = ctx.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (e) => this.push(e.inputBuffer.getChannelData(0));
    this.mic.source.connect(node);
    node.connect(this.sink);
    return node;
  }

  // Samples arrive within 1.5 s?
  flowing() {
    const f0 = this.filled;
    return new Promise((res) => {
      const t0 = performance.now();
      const check = () => {
        if (this.filled > f0 + 2048) res(true);
        else if (performance.now() - t0 > 1500) res(false);
        else setTimeout(check, 100);
      };
      check();
    });
  }

  // The microphone stream was replaced (after a call, a device change): tap the new source.
  retap(src) {
    if (this.node && (this.mode === 'worklet' || this.mode === 'script')) { try { src.connect(this.node); } catch (e) { console.warn('scream retap', e); } }
    // 'recorder' picks up mic.stream by itself with its next 2 s segment
  }

  push(block) {
    const r = this.ring, n = r.length;
    for (let i = 0; i < block.length; i++) { r[this.w] = block[i]; this.w = (this.w + 1) % n; }
    this.filled = Math.min(n, this.filled + block.length);
  }

  // ---- MediaRecorder fallback: consecutive 2 s files, each decodable on its own ----
  async startRecorder() {
    if (!window.MediaRecorder || !this.mic.stream) return false;
    this.mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    this.recOn = true;
    this.nextSegment();
    // it works once the first segment has data
    return new Promise((res) => {
      const t0 = performance.now();
      const check = () => {
        if (this.segs.length) res(true);
        else if (performance.now() - t0 > SEG_MS + 1500) { this.recOn = false; res(false); }
        else setTimeout(check, 200);
      };
      check();
    });
  }

  nextSegment() {
    if (!this.recOn) return;
    const ctx = audioContext();
    const rec = new MediaRecorder(this.mic.stream, this.mime ? { mimeType: this.mime } : undefined);
    const chunks = [], t0 = ctx.currentTime;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      if (chunks.length) {
        this.segs.push({ blob: new Blob(chunks, { type: rec.mimeType }), t0, t1: ctx.currentTime });
        while (this.segs.length > 3) this.segs.shift();
      }
      if (this.onSegment) { const f = this.onSegment; this.onSegment = null; f(); }
      this.nextSegment();
    };
    rec.start();
    this.rec = rec;
    this.segTimer = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, SEG_MS);
  }

  // Close the current segment now, decode the last ones and cut [end - len, end].
  async cutFromSegments(end, len) {
    await new Promise((res) => { this.onSegment = res; clearTimeout(this.segTimer); if (this.rec && this.rec.state === 'recording') this.rec.stop(); else res(); });
    const ctx = audioContext();
    const parts = [];
    for (const s of this.segs) {
      if (s.t1 < end - len - 0.1) continue;
      try { parts.push({ t0: s.t0, buf: await ctx.decodeAudioData(await s.blob.arrayBuffer()) }); } catch (e) { console.warn('decode', e); }
    }
    if (!parts.length) return null;
    const rate = ctx.sampleRate, out = new Float32Array(Math.floor(len * rate));
    for (const p of parts) {
      const d = p.buf.getChannelData(0), off = Math.round((p.t0 - (end - len)) * rate);
      for (let i = 0; i < d.length; i++) { const j = off + i; if (j >= 0 && j < out.length) out[j] = d[i]; }
    }
    return out;
  }

  now() { return audioContext().currentTime; }   // (tests replace it)

  // A shout started at round time t (s).
  onShout(t) {
    if (!this.ready || this.playing) return;
    this.count++;
    const p = { at: this.now() + CFG.scream.after, t, heard: null };
    if (!this.pending) this.pending = p;
    else if (this.busy && this.queue.length < QUEUE_MAX) this.queue.push(p);   // not lost while the last clip is decoded
    // else: the same cry (it is cut out within a second): one clip
  }

  // A guard went to look at / raised the alarm for the shout at round time t (s): the clip of that
  // shout (waiting, queued or kept) becomes «the one with the guard». who: the guard's name.
  markHeard(t, who = true) {
    for (const c of [this.pending, ...this.queue, this.best]) {
      if (c && !c.heard && Math.abs(c.t - t) <= HEARD_WINDOW) c.heard = who;
    }
    const k = this.log.find((c) => Math.abs(c.t - t) <= HEARD_WINDOW);
    if (k) k.heard = true;
  }

  update() {
    if (this.busy) return;
    if (!this.pending && this.queue.length) this.pending = this.queue.shift();
    const p = this.pending;
    if (!p) return;
    const now = this.now();
    if (now < p.at) return;
    const len = CFG.scream.before + CFG.scream.after;
    const keep = (samples) => {
      if (samples && samples.length) {
        const clip = { samples, t: p.t, db: clipLoudness(samples, this.rate || audioContext().sampleRate), heard: p.heard };
        const entry = { t: clip.t, db: +clip.db.toFixed(1), heard: !!clip.heard, kept: false };
        this.log.push(entry);
        if (!this.best || betterClip(clip, this.best)) { this.best = clip; for (const e of this.log) e.kept = false; entry.kept = true; }
      }
      this.pending = null;
    };
    if (this.mode === 'recorder') {
      this.busy = true;
      this.cutFromSegments(Math.min(now, p.at), len).then(keep, () => keep(null)).finally(() => { this.busy = false; });
      return;
    }
    const n = Math.min(this.filled, Math.floor(this.rate * len));
    const out = new Float32Array(n), r = this.ring, N = r.length;
    for (let i = 0; i < n; i++) out[i] = r[(this.w - n + i + N) % N];
    keep(out);
  }

  // For the report: this round's clips and their loudness
  report() { return { mode: this.mode, shouts: this.count, clips: this.log.slice(), keptT: this.best ? this.best.t : null, heardBy: this.best && this.best.heard ? this.best.heard : null }; }

  // Plays the kept clip; returns its length in s (0 if there is none).
  play() {
    if (!this.best || this.playing) return 0;
    const ctx = audioContext();
    const buf = ctx.createBuffer(1, this.best.samples.length, this.rate || ctx.sampleRate);
    buf.copyToChannel(this.best.samples, 0);
    // normalise so a distant scream is still audible
    let peak = 0;
    for (const v of this.best.samples) peak = Math.max(peak, Math.abs(v));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = peak > 0 ? Math.min(8, 0.8 / peak) : 1;
    src.connect(g).connect(ctx.destination);
    src.start();
    this.playing = src;
    src.onended = () => { this.playing = null; if (this.onEnded) this.onEnded(); };
    return buf.duration;
  }

  clear() {
    if (this.playing) { try { this.playing.stop(); } catch { /* already stopped */ } this.playing = null; }
    this.best = null; this.pending = null; this.queue = []; this.log = []; this.count = 0;
  }
}
