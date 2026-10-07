// Phone controls (plan-phone-mode §1, decisions §9): a floating joystick on the left part of the
// screen (a light push = quiet steps, a ring marks where steps become audible), look by dragging
// anywhere else, and buttons on the right: context action (Взяти / Покласти), door (tap = quick,
// hold = slow, release = stop), crouch (toggle), hold breath (hold, or tap / tap), pause.
// A short tap on the scene (not on a button) is reported for the board buttons.
// Pointer Events: one pointer per role, so the joystick and the look work at the same time.
import { shapeStick } from './xrInput.js';
import { CFG } from '../game/config.js';

const JOY_ZONE = 0.45;     // left part of the screen that starts the joystick
const JOY_R = 64;          // px, joystick travel
const DEAD = 0.15;         // shapeStick's dead zone
const TAP_MS = 280, TAP_PX = 12;   // tap duration from the events' own time stamps (a long frame must not turn a tap into a hold)
const HOLD_S = 0.25;       // door: longer than this = slow swing while held
// shaped stick magnitude at which the steps become audible: quietSpeed / maxSpeed (shapeStick is
// quadratic after the dead zone, so the ring sits at the raw travel that gives that magnitude)
const QUIET_K = CFG.player.quietSpeed / CFG.player.maxSpeed;
const QUIET_R = JOY_R * (DEAD + (1 - DEAD) * Math.sqrt(QUIET_K));

export const LOOK_SPEEDS = { slow: 0.0035, normal: 0.0055, fast: 0.008 };   // rad per CSS px

export class TouchControls {
  constructor(root) {
    this.root = root;
    this.look = { x: 0, y: 0 };          // accumulated rad since the last read
    this.lookSpeed = LOOK_SPEEDS.normal;
    this.breathToggle = false;           // tap / tap instead of hold
    this.joy = null;                     // { id, x0, y0, x, y }
    this.lookPtr = null;                 // { id, x, y, t0, x0, y0, moved }
    this.loud = false;
    this.raw = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.edges = new Set();              // 'interact', 'crouch', 'pause', 'doorTap', 'doorHoldStart', 'doorHoldEnd'
    this.breathDown = false;
    this.breathLatched = false;
    this.door = null;                    // { id, t, holding }
    this.tap = null;                     // { x, y } client px of a short tap on the scene
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="joy" hidden><div class="joy-quiet"></div><div class="joy-knob"></div></div>
      <button class="tbtn pause" data-btn="pause" aria-label="меню">❚❚</button>
      <button class="tbtn act" data-btn="interact" hidden>Взяти</button>
      <button class="tbtn door" data-btn="door" hidden>Двері</button>
      <button class="tbtn crouch" data-btn="crouch">Присісти</button>
      <button class="tbtn breath" data-btn="breath"><span>Подих</span><i></i></button>`;
    this.el = {
      joy: r.querySelector('.joy'), knob: r.querySelector('.joy-knob'), quiet: r.querySelector('.joy-quiet'),
      interact: r.querySelector('[data-btn=interact]'), door: r.querySelector('[data-btn=door]'),
      crouch: r.querySelector('[data-btn=crouch]'), breath: r.querySelector('[data-btn=breath]'), breathRing: r.querySelector('.breath i'),
    };
    this.el.joy.style.setProperty('--r', `${JOY_R}px`);
    this.el.quiet.style.setProperty('--q', `${QUIET_R}px`);
    r.addEventListener('pointerdown', (e) => this.down(e));
    r.addEventListener('pointermove', (e) => this.moveEv(e));
    r.addEventListener('pointerup', (e) => this.up(e));
    r.addEventListener('pointercancel', (e) => this.up(e, true));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(e) {
    e.preventDefault();
    const btn = e.target.closest('[data-btn]');
    if (btn) {
      try { btn.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
      const b = btn.dataset.btn;
      btn.classList.add('on');
      if (b === 'breath') {
        if (this.breathToggle) this.breathLatched = !this.breathLatched;
        else this.breathDown = true;
        this.breathPtr = e.pointerId;
      } else if (b === 'door') this.door = { id: e.pointerId, t0: e.timeStamp, holding: false };
      else this.edges.add(b);
      return;
    }
    if (e.clientX < innerWidth * JOY_ZONE && !this.joy) {
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, moved: false };
      Object.assign(this.el.joy.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      this.el.joy.hidden = false;
      this.setKnob(0, 0);
    } else if (!this.lookPtr) {
      this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, moved: false };
    }
    try { this.root.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
  }

  moveEv(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.x0, dy = e.clientY - this.joy.y0;
      const m = Math.hypot(dx, dy);
      if (m > TAP_PX) this.joy.moved = true;
      if (m > JOY_R) { dx *= JOY_R / m; dy *= JOY_R / m; }
      this.setKnob(dx, dy);
    } else if (this.lookPtr && e.pointerId === this.lookPtr.id) {
      const L = this.lookPtr;
      this.look.x += (e.clientX - L.x) * this.lookSpeed;
      this.look.y += (e.clientY - L.y) * this.lookSpeed;
      L.x = e.clientX; L.y = e.clientY;
      if (Math.hypot(L.x - L.x0, L.y - L.y0) > TAP_PX) L.moved = true;
    }
  }

  up(e, cancelled = false) {
    const btn = e.target.closest && e.target.closest('[data-btn]');
    if (btn) btn.classList.remove('on');
    if (this.breathPtr === e.pointerId) { this.breathDown = false; this.breathPtr = null; this.el.breath.classList.remove('on'); }
    if (this.door && e.pointerId === this.door.id) {
      // judged by the events' own times: a frame that came late may already have started the hold
      const tap = !cancelled && e.timeStamp - this.door.t0 < HOLD_S * 1000;
      if (this.door.holding) this.edges.add(tap ? 'doorHoldToTap' : 'doorHoldEnd');
      else if (tap || !cancelled) this.edges.add('doorTap');
      this.door = null;
      this.el.door.classList.remove('on');
    }
    if (this.joy && e.pointerId === this.joy.id) {
      // a short still tap on the left part is a tap too (the board may be there), not a walk
      if (!cancelled && !this.joy.moved && e.timeStamp - this.joy.t0 < TAP_MS) this.tap = { x: e.clientX, y: e.clientY };
      this.joy = null; this.el.joy.hidden = true; this.setKnob(0, 0);
    }
    if (this.lookPtr && e.pointerId === this.lookPtr.id) {
      const L = this.lookPtr;
      if (!cancelled && !L.moved && e.timeStamp - L.t0 < TAP_MS) this.tap = { x: e.clientX, y: e.clientY };
      this.lookPtr = null;
    }
  }

  setKnob(dx, dy) {
    this.el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.raw.x = dx / JOY_R; this.raw.y = -dy / JOY_R;   // up = forward
    shapeStick(this.raw.x, this.raw.y, this.move);
    const loud = Math.hypot(this.move.x, this.move.y) > QUIET_K + 1e-6;
    if (loud !== this.loud) {
      this.loud = loud;
      this.el.joy.classList.toggle('loud', loud);
      if (loud && navigator.vibrate) navigator.vibrate(12);   // Android; iPhone has no vibration API
    }
  }

  // Once per frame: door hold timing (real time since the finger went down, not game time).
  update() {
    if (this.door && !this.door.holding && performance.now() - this.door.t0 >= HOLD_S * 1000) {
      this.door.holding = true; this.edges.add('doorHoldStart');
    }
  }
  take(edge) { const had = this.edges.has(edge); this.edges.delete(edge); return had; }
  takeLook(out) { out.x = this.look.x; out.y = this.look.y; this.look.x = this.look.y = 0; return out; }
  takeTap() { const t = this.tap; this.tap = null; return t; }
  get breath() { return this.breathToggle ? this.breathLatched : this.breathDown; }

  // What the context buttons show: interact label (or null), door available, crouched, breath ring.
  setContext({ interact, door, crouched, breath }) {
    const el = this.el;
    if (interact) { if (el.interact.textContent !== interact) el.interact.textContent = interact; el.interact.hidden = false; }
    else if (!el.interact.hidden) el.interact.hidden = true;
    if (el.door.hidden === !!door && !this.door) el.door.hidden = !door;
    const cl = crouched ? 'Встати' : 'Присісти';
    if (el.crouch.textContent !== cl) el.crouch.textContent = cl;
    el.crouch.classList.toggle('active', !!crouched);
    // breath: the button is the ring (blue = holding, grey = resting)
    const st = breath.state;
    el.breath.classList.toggle('holding', st === 'holding');
    el.breath.classList.toggle('cooldown', st === 'cooldown');
    el.breathRing.style.setProperty('--p', String(breath.ring));
    if (this.breathLatched && st === 'cooldown') this.breathLatched = false;   // tap / tap: it ended by itself
  }

  reset() {
    this.joy = null; this.lookPtr = null; this.door = null; this.tap = null;
    this.breathDown = false; this.breathLatched = false; this.edges.clear();
    this.el.joy.hidden = true; this.setKnob(0, 0); this.look.x = this.look.y = 0;
    for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on');
  }
}

export { QUIET_R, JOY_R };
