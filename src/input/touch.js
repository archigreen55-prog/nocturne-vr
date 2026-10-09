// Phone controls (plan-phone-mode §1, decisions §9): a floating joystick on the left part of the
// screen (a light push = quiet steps, a ring marks where steps become audible), look by dragging
// anywhere else, and buttons on the right: context action (Взяти / Покласти), door (tap = quick,
// hold = slow, release = stop), crouch (toggle), hold breath (hold, or tap / tap), pause.
// A finger that lands on a board button presses it like a real button: the view does not turn, and
// the button fires when the finger is lifted over it, however long it was held (set hitBoard).
// Pointer Events: one pointer per role, so the joystick and the look work at the same time.
// Running (game-design §10, like PUBG Mobile): the joystick pushed forward past its circle = running;
// further up, onto the 🔒 over the joystick = auto-run, the finger may be lifted (the joystick stays as
// a faint ghost). Only forward (CFG.sprint.sector). Any touch on the joystick side unlocks; so does the
// game (stamina out, crouching ...: unlock()). The stamina arc runs along the joystick's lower half.
import { shapeStick } from './xrInput.js';
import { CFG } from '../config/index.js';
import { offForward } from '../game/run.js';
import { S } from '../i18n/index.js';

const JOY_ZONE = 0.45;     // left part of the screen that starts the joystick
const JOY_R = 64;          // px, joystick travel
const DEAD = 0.15;         // shapeStick's dead zone
const HOLD_S = 0.25;
const BOARD_SLOP = 24;     // px a finger may slide on a board button and still press it       // door: longer than this = slow swing while held
// shaped stick magnitude at which the steps become audible: quietSpeed / maxSpeed (shapeStick is
// quadratic after the dead zone, so the ring sits at the raw travel that gives that magnitude)
const quietK = () => CFG.player.quietSpeed / CFG.player.maxSpeed;   // live: an upgrade raises quietSpeed
const quietR = () => JOY_R * (DEAD + (1 - DEAD) * Math.sqrt(quietK()));
const QUIET_R = quietR();   // the base value

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
    this.board = null;                   // { id: pointerId, btn } a finger pressing a board button
    this.pressing = null;                // board button under that finger (highlight)
    this.boardPress = null;              // board button to press this frame
    this.hitBoard = null;                // (clientX, clientY) -> board button id | null, set by main
    this.onGesture = null;               // called on every finger lift (a user gesture: full screen)
    this.onLoud = null;                  // called when the stick crosses the "quiet" ring (a vibration / flash cue)
    this.rel = new Map();                // pointerId -> { b, x0, y0 }: pause and the context button fire on release
    // running
    this.joyRaw = null;                  // { over: travel / JOY_R, ang: degrees off forward } of the joystick finger
    this.runWant = false;                // the finger is past the circle, forward, long enough
    this.runSince = null;                // ms since the finger is in the running zone (before runWant)
    this.lockPos = null;                 // { x, y } of the 🔒 for this joystick
    this.lockAt = null;                  // ms since the finger rests on the 🔒
    this.locked = false;                 // auto-run
    this.ghost = false;                  // auto-run with the finger lifted: the joystick stays, faint
    // throwing (W2a): hold the context button with an item in hand = aim (the finger turns the view),
    // lift = throw, lift on the ✕ = put back to "holding"
    this.canAim = null;                  // () => true when a one-hand item is carried (set by systems/distract.js)
    this.aiming = null;                  // { id, x, y }: the finger aiming
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="joy" hidden><div class="joy-quiet"></div><div class="joy-stamina"></div><div class="joy-knob"></div></div>
      <div class="joy-lock" hidden aria-label="${S.sprint.lock}">🔒</div>
      <button class="tbtn pause" data-btn="pause" aria-label="${S.touch.menu}">❚❚</button>
      <button class="tbtn act" data-btn="interact" hidden>${S.touch.take}</button>
      <button class="tbtn door" data-btn="door" hidden>${S.touch.door}</button>
      <button class="tbtn crouch" data-btn="crouch">${S.touch.crouch}</button>
      <button class="tbtn breath" data-btn="breath"><span>${S.touch.breath}</span><i></i></button>
      <div class="throw-x" hidden aria-label="${S.throw.cancel}">✕</div>`;
    this.el = {
      joy: r.querySelector('.joy'), knob: r.querySelector('.joy-knob'), quiet: r.querySelector('.joy-quiet'),
      stamina: r.querySelector('.joy-stamina'), lock: r.querySelector('.joy-lock'),
      interact: r.querySelector('[data-btn=interact]'), door: r.querySelector('[data-btn=door]'),
      crouch: r.querySelector('[data-btn=crouch]'), pause: r.querySelector('[data-btn=pause]'), breath: r.querySelector('[data-btn=breath]'), breathRing: r.querySelector('.breath i'),
      throwX: r.querySelector('.throw-x'),
    };
    this.el.joy.style.setProperty('--r', `${JOY_R}px`);
    this.syncQuiet();
    this.el.lock.style.setProperty('--ls', `${CFG.sprint.touch.lockSize}px`);
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
      else if (b === 'pause' || b === 'interact') this.rel.set(e.pointerId, { b, btn, x0: e.clientX, y0: e.clientY, t0: performance.now(), ts0: e.timeStamp });   // fire on release, like the board buttons
      else this.edges.add(b);
      return;
    }
    // auto-run: a touch on the joystick side unlocks it (and may start the joystick as usual)
    if (this.locked && e.clientX < innerWidth * CFG.sprint.touch.unlockZone) this.unlock();
    const onBoard = !this.board && this.hitBoard && this.hitBoard(e.clientX, e.clientY);
    if (onBoard) {
      this.board = { id: e.pointerId, btn: onBoard, x0: e.clientX, y0: e.clientY };
      this.pressing = onBoard;
    } else if (e.clientX < innerWidth * JOY_ZONE && !this.joy) {
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      Object.assign(this.el.joy.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      this.el.joy.hidden = false;
      this.joyRaw = { over: 0, ang: 0 }; this.runWant = false; this.runSince = null; this.lockAt = null;
      this.lockPos = this.placeLock(e.clientX, e.clientY);
      if (this.lockPos) Object.assign(this.el.lock.style, { left: `${this.lockPos.x}px`, top: `${this.lockPos.y}px` });
      this.setKnob(0, 0);
    } else if (!this.lookPtr) {
      this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    try { this.root.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
  }

  moveEv(e) {
    if (this.aiming && e.pointerId === this.aiming.id) {   // W2a: the aiming finger turns the view; over the ✕ = cancel on lift
      const A = this.aiming, k = this.lookSpeed * CFG.throw.aim.lookK;
      this.look.x += (e.clientX - A.x) * k; this.look.y += (e.clientY - A.y) * k;
      A.x = e.clientX; A.y = e.clientY;
      this.el.throwX.classList.toggle('on', this.overX(e));
      return;
    }
    if (this.rel.has(e.pointerId)) {
      const P = this.rel.get(e.pointerId);
      P.lastX = e.clientX; P.lastY = e.clientY;
      P.btn.classList.toggle('on', this.overRel(P, e));
    } else if (this.board && e.pointerId === this.board.id) {
      this.pressing = this.overBoardButton(e) ? this.board.btn : null;
    } else if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.x0, dy = e.clientY - this.joy.y0;
      const m = Math.hypot(dx, dy), T = CFG.sprint.touch, A = CFG.sprint.sector;
      const R = this.joyRaw = { over: m / JOY_R, ang: m > 0 ? offForward(dx, -dy) : 0 };
      // the knob follows the finger past the circle while it points forward (up to the 🔒)
      const reach = R.ang <= A.hold ? Math.max(JOY_R, Math.min(m, T.lockDist)) : JOY_R;
      const kx = m > reach ? dx * reach / m : dx, ky = m > reach ? dy * reach / m : dy;
      if (m > JOY_R) { dx *= JOY_R / m; dy *= JOY_R / m; }
      this.setKnob(dx, dy, kx, ky);
      // the 🔒: the finger rests on it (update() times it) or is lifted on it (up())
      const onLock = this.lockShown && Math.hypot(e.clientX - this.lockPos.x, e.clientY - this.lockPos.y) <= T.lockHit / 2;
      if (onLock && this.lockAt === null) this.lockAt = performance.now();
      else if (!onLock) this.lockAt = null;
      // locked, and the finger comes back into the circle or turns away: that is touching the joystick
      if (this.locked && (R.over < T.off || R.ang > A.hold)) this.unlock();
    } else if (this.lookPtr && e.pointerId === this.lookPtr.id) {
      const L = this.lookPtr;
      this.look.x += (e.clientX - L.x) * this.lookSpeed;
      this.look.y += (e.clientY - L.y) * this.lookSpeed;
      L.x = e.clientX; L.y = e.clientY;
    }
  }

  up(e, cancelled = false) {
    if (!cancelled && this.onGesture) this.onGesture();
    if (this.aiming && e.pointerId === this.aiming.id) {   // W2a: lift = throw; on the ✕ (or a cancelled touch) = not
      // judged by the events' own times (as the door): a press shorter than the hold was a press, even
      // if a late frame already showed the arc
      const P = this.rel.get(e.pointerId), quick = !cancelled && P && e.timeStamp - P.ts0 < CFG.throw.aim.holdS * 1000;
      if (quick) { this.edges.add('aimQuiet'); if (this.overRel(P, e)) this.edges.add('interact'); }
      else this.edges.add(cancelled || this.overX(e) ? 'aimCancel' : 'throw');
      this.stopAim();
      this.rel.delete(e.pointerId);
      this.el.interact.classList.remove('on');
      return;
    }
    if (this.rel.has(e.pointerId)) {
      // like the board buttons: pressed when the finger is lifted over the button, however long it was held
      const P = this.rel.get(e.pointerId);
      if (!cancelled && this.overRel(P, e)) this.edges.add(P.b);
      this.rel.delete(e.pointerId);
    }
    if (this.board && e.pointerId === this.board.id) {
      if (!cancelled && this.overBoardButton(e)) this.boardPress = this.board.btn;
      this.board = null; this.pressing = null;
    }
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
      if (!cancelled && !this.locked && this.lockAt !== null) this.setLock(true);   // lifted on the 🔒
      this.joy = null; this.joyRaw = null; this.runWant = false; this.runSince = null; this.lockAt = null;
      if (this.locked) {   // auto-run goes on: the joystick stays as a ghost, knob up, straight ahead
        this.ghost = true;
        this.el.joy.classList.add('ghost');
        this.setKnob(0, -JOY_R);
      } else { this.el.joy.hidden = true; this.setKnob(0, 0); }
      this.showLock();
    }
    if (this.lookPtr && e.pointerId === this.lookPtr.id) this.lookPtr = null;
  }

  // A release button is still pressed: over it, or within BOARD_SLOP px of where the finger landed
  overRel(P, e) {
    const r = P.btn.getBoundingClientRect();
    return Math.hypot(e.clientX - P.x0, e.clientY - P.y0) <= BOARD_SLOP || (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
  }

  // Still on the pressed board button: over it, or within BOARD_SLOP px of where the finger landed
  // (the ◀ ▶ buttons on the far board are only ~25 px wide; a finger rolls more than that).
  overBoardButton(e) {
    const B = this.board;
    return Math.hypot(e.clientX - B.x0, e.clientY - B.y0) <= BOARD_SLOP || this.hitBoard(e.clientX, e.clientY) === B.btn;
  }

  // dx, dy: the stick (within the circle); kx, ky: where the knob is drawn (past the circle when running)
  setKnob(dx, dy, kx = dx, ky = dy) {
    this.el.knob.style.transform = `translate(${kx}px, ${ky}px)`;
    this.raw.x = dx / JOY_R; this.raw.y = -dy / JOY_R;   // up = forward
    shapeStick(this.raw.x, this.raw.y, this.move);
    const loud = Math.hypot(this.move.x, this.move.y) > quietK() + 1e-6;
    if (loud !== this.loud) {
      this.loud = loud;
      this.el.joy.classList.toggle('loud', loud);
      if (loud && this.onLoud) this.onLoud();   // main: vibration (Android) or an edge flash (iPhone)
    }
  }

  // The dashed "quiet" ring where the steps become audible (again at a round start: an upgrade moves it).
  syncQuiet() {
    const r = quietR();
    if (r !== this.quietPx) { this.quietPx = r; this.el.quiet.style.setProperty('--q', `${r}px`); }
  }

  // W2a: the ✕ beside the context button while aiming
  overX(e) {
    const r = this.el.throwX.getBoundingClientRect(), m = 10;
    return e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m;
  }
  stopAim() { this.aiming = null; this.el.throwX.hidden = true; this.el.throwX.classList.remove('on'); this.el.interact.classList.remove('aim'); }

  // Once per frame: door hold timing (real time since the finger went down, not game time); running;
  // the context button held long enough with an item in hand = aiming a throw (W2a).
  update() {
    const now = performance.now();
    if (!this.aiming && this.canAim) {
      for (const [id, P] of this.rel) {
        if (P.b !== 'interact' || now - P.t0 < CFG.throw.aim.holdS * 1000 || !this.canAim()) continue;
        this.aiming = { id, x: P.lastX ?? P.x0, y: P.lastY ?? P.y0 };
        this.el.throwX.hidden = false; this.el.interact.classList.add('aim');
        this.edges.add('aimStart');
        break;
      }
    }
    if (this.door && !this.door.holding && now - this.door.t0 >= HOLD_S * 1000) {
      this.door.holding = true; this.edges.add('doorHoldStart');
    }
    // running: past the circle (x over) within the forward sector for `delay` s; it keeps going while
    // past x off within the wider `hold` sector
    const R = this.joyRaw, T = CFG.sprint.touch, A = CFG.sprint.sector;
    if (this.joy && R) {
      const inZone = this.runWant ? R.over >= T.off && R.ang <= A.hold : R.over >= T.over && R.ang <= A.on;
      if (!inZone) { this.runWant = false; this.runSince = null; }
      else if (!this.runWant) {
        if (this.runSince === null) this.runSince = now;
        if (now - this.runSince >= T.delay * 1000) this.runWant = true;
      }
      if (!this.locked && this.lockAt !== null && now - this.lockAt >= T.lockDwell * 1000) this.setLock(true);
    }
    this.showLock();
  }

  // running asked for: the finger past the circle, or auto-run
  get run() { return this.runWant || this.locked; }

  // The 🔒 for a joystick that starts at (x0, y0): straight up, lockDist px; with no room above (the
  // finger landed high), it comes closer (never under lockMin) and leans right (still "forward").
  // A finger that landed so high that even that does not fit gets no 🔒 this time (running still
  // works): a 🔒 squeezed next to the circle would lock by accident.
  placeLock(x0, y0) {
    const T = CFG.sprint.touch, top = T.topMargin + T.lockSize / 2;
    for (let a = 0; a <= T.lockTilt; a += 5) {
      for (let d = T.lockDist; d >= T.lockMin; d -= 5) {
        const r = a * Math.PI / 180, y = y0 - d * Math.cos(r);
        if (y >= top) return { x: x0 + d * Math.sin(r), y };
      }
    }
    return null;
  }
  // the 🔒 shows once the finger is past the circle going forward, and while locked
  get lockShown() { return !!this.lockPos && (this.locked || (!!this.joy && this.joyRaw && (this.runWant || this.runSince !== null))); }
  showLock() {
    const el = this.el.lock, on = this.lockShown;
    if (el.hidden === on) el.hidden = !on;
    el.classList.toggle('on', this.locked || this.lockAt !== null);
  }
  setLock(on) {
    if (on === this.locked) return;
    this.locked = on;
    this.edges.add(on ? 'runLock' : 'runUnlock');
    this.el.joy.classList.toggle('locked', on);
  }
  // Auto-run off (a touch on the joystick side, or the game: stamina out, crouching, a locked door ...)
  unlock() {
    if (!this.locked) return;
    this.setLock(false);
    if (this.ghost) {
      this.ghost = false;
      this.el.joy.classList.remove('ghost');
      if (!this.joy) { this.el.joy.hidden = true; this.setKnob(0, 0); }
    }
    this.showLock();
  }
  // The running read-out on the joystick (systems/sprint.js, every frame): red circle while running,
  // the stamina arc (shown while not full), out of breath.
  setRun({ running, stamina, winded }) {
    const el = this.el;
    el.joy.classList.toggle('run', !!running);
    el.joy.classList.toggle('winded', !!winded);
    const show = stamina < 0.999 || running;
    el.stamina.classList.toggle('shown', show);
    if (show) el.stamina.style.setProperty('--s', stamina.toFixed(3));
  }
  take(edge) { const had = this.edges.has(edge); this.edges.delete(edge); return had; }
  takeLook(out) { out.x = this.look.x; out.y = this.look.y; this.look.x = this.look.y = 0; return out; }
  takeBoardPress() { const b = this.boardPress; this.boardPress = null; return b; }
  get breath() { return this.breathToggle ? this.breathLatched : this.breathDown; }

  // What the context buttons show: interact label (or null), door available, crouched, breath ring.
  setContext({ interact, door, crouched, breath }) {
    const el = this.el;
    if (interact) { if (el.interact.textContent !== interact) el.interact.textContent = interact; el.interact.hidden = false; }
    else if (!el.interact.hidden) el.interact.hidden = true;
    if (el.door.hidden === !!door && !this.door) el.door.hidden = !door;
    const cl = crouched ? S.touch.stand : S.touch.crouch;
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
    this.joy = null; this.lookPtr = null; this.door = null; this.rel.clear(); this.board = null; this.pressing = null; this.boardPress = null;
    if (this.aiming) this.stopAim();
    this.breathDown = false; this.breathLatched = false; this.edges.clear();
    this.joyRaw = null; this.runWant = false; this.runSince = null; this.lockAt = null; this.locked = false; this.ghost = false;
    this.el.joy.classList.remove('ghost', 'locked', 'run', 'winded');
    this.el.joy.hidden = true; this.setKnob(0, 0); this.look.x = this.look.y = 0;
    this.showLock();
    for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on');
  }
}

export { QUIET_R, JOY_R };
