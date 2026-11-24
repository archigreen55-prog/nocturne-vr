// The live noise floor (plan 2026-11-22-mic-noise §2.2): the level of the place you play in, measured all
// the time in the speech band. It is the 10th percentile of the last CFG.mic.floor.window s — the quietest
// moments: even while you talk there are pauses between syllables and words, so a voice does not become the
// floor. It rises slowly (CFG.mic.floor.rise dB/s) and falls fast (fall dB/s): into a quiet room and the game
// hears a whisper again within a second or two. The caller decides when not to learn (the game's own sound
// loud in the microphone, a shout, a held breath). Levels only, nothing of the sound is kept.
import { CFG } from '../config/index.js';

export class NoiseFloor {
  constructor(start = -62) { this.db = start; this.t = 0; this.ts = []; this.vs = []; this.target = start; }
  reset(db) { this.db = this.target = db; this.ts.length = 0; this.vs.length = 0; }
  // t: the microphone's clock (s); step: s since the last call; db: the speech-band level; learn: false = only time passes
  update(t, step, db, learn) {
    const F = CFG.mic.floor;
    this.t = t;
    if (learn) { this.ts.push(t); this.vs.push(db); }
    while (this.ts.length && this.ts[0] <= t - F.window) { this.ts.shift(); this.vs.shift(); }
    // not enough of the window to judge (the first moments, after a long shout or a held breath): hold
    if (this.ts.length < 3 || t - this.ts[0] < F.minSecs) return this.db;
    const v = this.vs.slice().sort((a, b) => a - b);
    this.target = v[Math.min(v.length - 1, Math.floor(v.length * F.pct))];
    const d = this.target - this.db;
    this.db += d > 0 ? Math.min(d, F.rise * step) : Math.max(d, -F.fall * step);
    return this.db;
  }
}
