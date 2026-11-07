// Mischief points and combos (W2b; decision R6 A): every trick that works scores (CFG.traps.points);
// the next one within CFG.traps.combo.window s counts x2, then x3. Pure state, no DOM: the traps
// system, the devices and the throws call add(); the HUD, the board and the report read it.
import { CFG } from '../config/index.js';

export const mischief = {
  score: 0, chain: 0, lastT: -1e9, best: 1, events: [],
  reset() { this.score = 0; this.chain = 0; this.lastT = -1e9; this.best = 1; this.events.length = 0; },
  // the combo multiplier right now (1 once the window has passed)
  mult(t) { return t - this.lastT <= CFG.traps.combo.window ? Math.min(CFG.traps.combo.max, this.chain) : 1; },
  // kind: trap | device | throw | hit; t: game time (s). Returns { points, mult } added (null: no points for it).
  add(kind, t) {
    const base = CFG.traps.points[kind];
    if (!base) return null;
    this.chain = t - this.lastT <= CFG.traps.combo.window ? this.chain + 1 : 1;
    const mult = Math.min(CFG.traps.combo.max, this.chain);
    this.score += base * mult;
    this.best = Math.max(this.best, mult);
    this.lastT = t;
    this.events.push({ kind, points: base * mult, mult, t: +t.toFixed(1) });
    if (this.events.length > 40) this.events.shift();
    return { points: base * mult, mult };
  },
  report() { return { score: this.score, bestCombo: this.best, events: this.events.slice(-20) }; },
};
