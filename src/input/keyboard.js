// Keyboard for laptop testing: WASD walk (Space = fast; Space twice and held = running), one-shot keys
// via take().
import { CFG } from '../config/index.js';

export class KeyboardInput {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.spaceAt = -1e9;     // ms of the last Space press
    this.spaceRun = false;   // Space pressed twice quickly and still held
    target.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) {
        this.pressed.add(e.code);
        if (e.code === 'Space') {
          const t = e.timeStamp || performance.now();
          this.spaceRun = t - this.spaceAt <= CFG.sprint.doubleTap * 1000;
          this.spaceAt = t;
        }
      }
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => { this.down.delete(e.code); if (e.code === 'Space') this.spaceRun = false; });
    window.addEventListener('blur', () => { this.down.clear(); this.spaceRun = false; });
  }
  any(...codes) { return codes.some((c) => this.down.has(c)); }
  // one-shot: true once per key press
  take(code) { const had = this.pressed.has(code); this.pressed.delete(code); return had; }

  // running asked for: Space twice and held, with W (forward only: W, W + A / D; not with S)
  get runWant() {
    return this.spaceRun && this.any('Space') && this.any('KeyW', 'ArrowUp') && !this.any('KeyS', 'ArrowDown');
  }

  // walking: 1.0 m/s (quiet steps), Space: 2.0 m/s (Shift is "hold your breath")
  readMove(out) {
    let x = (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0);
    let y = (this.any('KeyW', 'ArrowUp') ? 1 : 0) - (this.any('KeyS', 'ArrowDown') ? 1 : 0);
    const m = Math.hypot(x, y);
    if (m > 0) { const k = (this.any('Space') ? 1 : 0.5) / m; x *= k; y *= k; }
    out.x = x; out.y = y;
    return out;
  }
  endFrame() { this.pressed.clear(); }
}
