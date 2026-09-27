// Keyboard for laptop testing: WASD walk (Space = fast), one-shot keys via take().
export class KeyboardInput {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    target.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  any(...codes) { return codes.some((c) => this.down.has(c)); }
  // one-shot: true once per key press
  take(code) { const had = this.pressed.has(code); this.pressed.delete(code); return had; }

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
