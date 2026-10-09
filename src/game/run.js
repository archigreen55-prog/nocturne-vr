// Running as a resource (game-design §10.3 B): stamina runs down while running and refills while not;
// run it out and you are out of breath for a while (no holding your breath, the breathing is heard).
// Pure logic, no DOM and no three.js: the same rules for the phone, the PC and VR. The numbers are
// CFG.sprint (the current difficulty's row). systems/sprint.js feeds it the wish to run and the
// circumstances each frame and acts on what it returns.
import { CFG } from '../config/index.js';

export class RunState {
  constructor() { this.reset(); }

  reset() {
    this.left = CFG.sprint.stamina;   // s of running left
    this.winded = 0;                  // s of "out of breath" left
    this.running = false;
  }

  // 0..1 for the arc / bar
  get fraction() { return Math.max(0, Math.min(1, this.left / CFG.sprint.stamina)); }
  get full() { return this.left >= CFG.sprint.stamina - 1e-6; }

  // want: the player asks to run (and points forward); o: { carry: null | 'light' | 'medium', alarm }
  // Returns 'start' | 'stop' | 'winded' | 'recovered' | 'blocked:carry' | 'blocked:winded' | null.
  update(dt, want, o = {}) {
    const C = CFG.sprint;
    let ev = null;
    if (this.winded > 0) {
      this.winded = Math.max(0, this.winded - dt);
      if (this.winded === 0) ev = 'recovered';
    }
    if (this.running && (!want || o.carry === 'medium')) { this.running = false; ev = 'stop'; }
    if (!this.running && want) {
      if (o.carry === 'medium') ev = 'blocked:carry';
      else if (this.winded > 0 || this.left < Math.min(C.minStart, C.stamina)) ev = ev || 'blocked:winded';
      else { this.running = true; ev = 'start'; }
    }
    if (this.running) {
      this.left -= dt * (o.carry === 'light' ? C.lightK : 1);
      if (this.left <= 0) { this.left = 0; this.running = false; this.winded = C.winded; ev = 'winded'; }
    } else {
      // refills standing or walking, also while out of breath (from empty to full in `refill` s)
      this.left = Math.min(C.stamina, this.left + dt * C.stamina / C.refill * (o.alarm ? C.adrenaline : 1));
    }
    return ev;
  }

  // a stop from outside (a locked door, crouching): no stamina change
  stop() { const was = this.running; this.running = false; return was; }
}

// Degrees between a stick / joystick direction (x right, y forward) and straight ahead.
export const offForward = (x, y) => Math.abs(Math.atan2(x, y)) * 180 / Math.PI;
