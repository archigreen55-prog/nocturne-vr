// Scream replay. The last CFG.scream.buffer s of the microphone live in a ring buffer in memory.
// When a shout starts, CFG.scream.after s later the clip (before + after s around the peak) is
// copied out; the loudest clip of the round is kept for the van board. Nothing is written to disk
// or sent anywhere; clear() (a new round) drops it.
import { audioContext } from './audio.js';
import { VERSION } from '../version.js';
import { CFG } from '../game/config.js';

export class ScreamRecorder {
  constructor(mic) {
    this.mic = mic;
    this.ready = false;
    this.ring = null;
    this.w = 0;              // write index
    this.filled = 0;
    this.pending = null;     // { at (ctx time), t (round time), db }
    this.best = null;        // { samples, t, db }
    this.count = 0;
    this.playing = null;
  }

  // Call after the microphone is on.
  async start() {
    if (this.ready || this.mic.state !== 'on' || !this.mic.source) return;
    const ctx = audioContext();
    this.rate = ctx.sampleRate;
    this.ring = new Float32Array(Math.ceil(this.rate * CFG.scream.buffer));
    const sink = ctx.createGain();
    sink.gain.value = 0;                 // keeps the tap running; nothing reaches the speakers
    sink.connect(ctx.destination);
    try {
      await ctx.audioWorklet.addModule(new URL(`./ringTap.worklet.js?v=${VERSION}`, import.meta.url));
      const node = new AudioWorkletNode(ctx, 'ring-tap');
      node.port.onmessage = (e) => this.push(e.data);
      this.mic.source.connect(node);
      node.connect(sink);
    } catch {
      // older browsers: ScriptProcessor on the main thread
      const node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => this.push(e.inputBuffer.getChannelData(0));
      this.mic.source.connect(node);
      node.connect(sink);
    }
    this.ready = true;
  }

  push(block) {
    const r = this.ring, n = r.length;
    for (let i = 0; i < block.length; i++) { r[this.w] = block[i]; this.w = (this.w + 1) % n; }
    this.filled = Math.min(n, this.filled + block.length);
  }

  // A shout started at round time t (s). Louder peaks within the same shout raise its level.
  onShout(t) {
    if (!this.ready || this.playing) return;
    this.count++;
    const ctx = audioContext();
    if (!this.pending) this.pending = { at: ctx.currentTime + CFG.scream.after, t, db: this.mic.env };
  }

  update() {
    if (!this.pending) return;
    this.pending.db = Math.max(this.pending.db, this.mic.env);
    if (audioContext().currentTime < this.pending.at) return;
    const len = Math.min(this.filled, Math.floor(this.rate * (CFG.scream.before + CFG.scream.after)));
    const out = new Float32Array(len), r = this.ring, n = r.length;
    for (let i = 0; i < len; i++) out[i] = r[(this.w - len + i + n) % n];
    if (!this.best || this.pending.db > this.best.db) this.best = { samples: out, t: this.pending.t, db: this.pending.db };
    this.pending = null;
  }

  // Plays the loudest clip; returns its length in s (0 if there is none).
  play() {
    if (!this.best || this.playing) return 0;
    const ctx = audioContext();
    const buf = ctx.createBuffer(1, this.best.samples.length, this.rate);
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
    src.onended = () => { this.playing = null; };
    return buf.duration;
  }

  clear() {
    if (this.playing) { try { this.playing.stop(); } catch { /* already stopped */ } this.playing = null; }
    this.best = null; this.pending = null; this.count = 0;
  }
}
