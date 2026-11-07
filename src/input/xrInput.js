// Quest 3 controllers -> movement + one-shot actions (plan §5). Left stick press while the stick is
// pushed forward = running for this push (until the stick comes back); X held 1 s = vignette.
// WebXR 'xr-standard' gamepad: buttons[0] trigger, [1] grip, [3] stick press, [4] A/X, [5] B/Y;
// axes[2], [3] thumbstick.
import { CFG } from '../config/index.js';
import { offForward } from '../game/run.js';

const STICK_DEAD = 0.15;
const TURN_ON = 0.6, TURN_OFF = 0.3;   // snap turn: one per deflection
const HOLD = 1.0;                       // s, for Y (recentre) and right stick press (back to the van)
const TAP = 0.5;                        // s, X released before this = FPS counter

const pressed = (gp, i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
const axis = (gp, i) => (gp && gp.axes.length > i ? gp.axes[i] || 0 : 0);

// radial dead zone + quadratic curve for fine control of slow sneaking
export function shapeStick(x, y, out) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) { out.x = 0; out.y = 0; return out; }
  const k = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD));
  out.x = x / m * k * k; out.y = y / m * k * k;
  return out;
}

export class XRInput {
  constructor() {
    this.left = null;
    this.right = null;
    this.prev = {};
    this.holds = { y: 0, x: 0, rs: 0 };
    this.turnArmed = true;
    this.move = { x: 0, y: 0 };
    this.actions = { turn: 0, fps: false, vignette: false, recenter: false, crouch: false, home: false, useLeft: false, useRight: false };
    this.breath = false;   // A held: hold your breath
    this.run = false;      // running asked for: left stick pressed while pushed forward, until it comes back
    this.grip = { left: false, right: false };
    this.trigger = { left: false, right: false };
  }

  edge(key, down) {
    const e = down && !this.prev[key];
    this.prev[key] = down;
    return e;
  }
  hold(key, down, dt) {
    const h = this.holds;
    h[key] = down ? h[key] + dt : 0;
    return h[key] >= HOLD && h[key] - dt < HOLD;
  }

  read(session, dt) {
    this.left = this.right = null;
    if (session) {
      for (const src of session.inputSources) {
        if (!src.gamepad) continue;
        if (src.handedness === 'left') this.left = src.gamepad;
        else if (src.handedness === 'right') this.right = src.gamepad;
      }
    }
    const L = this.left, R = this.right, act = this.actions;
    shapeStick(axis(L, 2), -axis(L, 3), this.move);   // stick up = forward

    const rx = axis(R, 2);
    act.turn = 0;
    if (this.turnArmed && Math.abs(rx) > TURN_ON) { act.turn = rx > 0 ? -1 : 1; this.turnArmed = false; }  // right = negative yaw
    else if (Math.abs(rx) < TURN_OFF) this.turnArmed = true;

    this.trigger.left = pressed(L, 0); this.trigger.right = pressed(R, 0);
    this.grip.left = pressed(L, 1); this.grip.right = pressed(R, 1);
    act.useLeft = this.edge('tl', this.trigger.left);
    act.useRight = this.edge('tr', this.trigger.right);
    act.crouch = this.edge('b', pressed(R, 5));
    this.breath = pressed(R, 4);

    const x = pressed(L, 4);                          // X: tap = FPS counter
    act.fps = !x && this.prev.x && this.holds.x < TAP;
    this.prev.x = x;
    this.holds.x = x ? this.holds.x + dt : 0;
    act.vignette = x && this.holds.x >= HOLD && this.holds.x - dt < HOLD;   // X held 1 s: vignette strength
    // running: a left stick press with the stick pushed forward; ends when the stick comes back or
    // leaves the forward sector (CFG.sprint.vrStick, CFG.sprint.sector)
    const sx = axis(L, 2), sy = -axis(L, 3), push = Math.hypot(sx, sy), V = CFG.sprint.vrStick, A = CFG.sprint.sector;
    if (this.edge('ls', pressed(L, 3)) && push > V.on && offForward(sx, sy) <= A.on) this.run = true;
    else if (this.run && (push < V.off || offForward(sx, sy) > A.hold)) this.run = false;
    act.recenter = this.hold('y', pressed(L, 5), dt); // Y hold: recentre + measure standing height
    act.home = this.hold('rs', pressed(R, 3), dt);    // right stick press hold: back to the van
    return act;
  }

  pulse(hand, strength, ms) {
    for (const gp of hand === 'left' ? [this.left] : hand === 'right' ? [this.right] : [this.left, this.right]) {
      const h = gp && gp.hapticActuators && gp.hapticActuators[0];
      if (h && h.pulse) h.pulse(strength, ms).catch(() => {});
    }
  }
}
