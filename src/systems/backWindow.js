// The dacha's back window (the «stealth-house» branch; the climb redone in claude/dacha-window). The window is a
// door of the level (level.doors, `window: true`) that opens like a door (the door button / Q / T / the VR trigger,
// a quiet creak), and now it has one more button: «Лізти у вікно».
//
// The zone: a rectangle on each side of the wall (CFG.backWindow.zone), the button is there at once, whether the
// window is shut or open, wherever you look (but not with your back to it). One press does everything:
//   phone / PC  1 align   you glide to the window's axis, 0.55 m from the wall, turning to face it
//               2 open    a shut sash opens by itself, slowly (no creak)
//               3 rise    the camera goes up from the crouch / the stand to the sill
//               4 carry   it goes over the sill (always >= 0.2 m above it), tilting down
//               5 drop    it comes down on the far side: you are crouched there
//   VR          the camera is not moved or lifted (a real head cannot be): the picture fades out (0.3 s), the
//               body goes over, the picture fades in (0.4 s)
// Not with the guard (a message), not with a big (two-handed) item (a message), not when the far side is blocked.
// With friends the guest climbs at once (its own body, own timeline) and tells the host (`climb`): the host opens
// the sash for it and may refuse (the window is busy: a friend or the host is on it; the guest was caught): the
// guest then comes back, if it has not got over the sill yet. The host sees the guest's body rise and sink in its
// pose (the head height), not slide through the wall.
// Input: no walking, no turning while climbing. Act (after the player's step): the body follows the sequence.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

const local = { climb: null };   // the sequence being played
const busy = new Map();          // host: window index -> { by, until (G.simT) }: who is on it
const _hand = new THREE.Vector3(), _handle = new THREE.Vector3();
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;
const BASE_EYE = 1.65, CROUCH_DROP = 0.55;   // xr/player.js: the flat camera's eye height and the virtual crouch's drop

// ---------- the zone ----------
// where (x, z) stands relative to the window: { side (+1 / -1 along the wall's normal), along, u (signed distance from the wall's centre line) }
function frame(win, x, z) {
  const nx = -Math.sin(win.base), nz = -Math.cos(win.base);   // normal of the closed sash
  const tx = Math.cos(win.base), tz = -Math.sin(win.base);    // along the wall
  const dx = x - win.cx, dz = z - win.cz, u = dx * nx + dz * nz;
  return { nx, nz, tx, tz, u, side: Math.sign(u) || 1, along: dx * tx + dz * tz };
}

// The window this player can climb now (in its zone, not with the back to it), or null.
export function windowAhead() {
  const { player, level } = G;
  if (!level || !level.doors || local.climb) return null;
  if ((player.floorY || 0) > 0.5) return null;
  const Z = CFG.backWindow.zone;
  for (const d of level.doors) {
    if (!d.window) continue;
    const f = frame(d, player.head.x, player.head.z);
    if (Math.abs(f.along) > Z.halfW || Math.abs(f.u) < 0.12 || Math.abs(f.u) > 0.15 + Z.depth) continue;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);   // where you look; the window is the other way from your side
    if (fx * -f.side * f.nx + fz * -f.side * f.nz < Z.minDot) continue;
    return d;
  }
  return null;
}
export const climbing = () => !!local.climb;
export const climbLabel = () => (windowAhead() ? S.backWindow.climb : null);

// ---------- the sequence ----------
const total = (open) => { const T = CFG.backWindow.steps; return T.align + (open ? T.open : 0) + T.rise + T.carry + T.drop; };

function plan(win) {
  const BW = CFG.backWindow, { player } = G, h = player.head;
  const f = frame(win, h.x, h.z), side = f.side;
  const at = (u, along) => [win.cx + f.nx * u + f.tx * along, win.cz + f.nz * u + f.tz * along];
  // the open sash swings to the far side near its hinge: land away from it
  const hinge = Math.sign((win.hx - win.cx) * f.tx + (win.hz - win.cz) * f.tz) || -1;
  const lo = hinge < 0 ? 0.1 : -BW.maxSlide, hi = hinge < 0 ? BW.maxSlide : -0.1;
  const along = Math.max(lo, Math.min(hi, f.along));
  const A = at(side * BW.stand, along), M = at(-side * 0.2, along), B = at(-side * BW.land, along);
  // the far side must be free to stand on (furniture, a bush): a landing pushed out by more than 0.4 m is refused
  const [bx, bz] = G.level.resolve(B[0], B[1], 0.22, player.floorY || 0);
  if (Math.hypot(bx - B[0], bz - B[1]) > 0.4) return null;
  const fxy = [-side * f.nx, -side * f.nz];   // facing the window: the view direction
  return { win, side, from: [h.x, h.z], A, M, B: [bx, bz], yawT: Math.atan2(-fxy[0], -fxy[1]), yaw0: player.yaw, crouch0: player.virtualCrouch, eye0: h.y - (player.floorY || 0), pitch0: player.lookPitch, f };
}

// Start climbing through `win`. Returns true when the press was the window's (even if it said no).
export function startClimb(win = windowAhead()) {
  if (!win) return false;
  const BW = CFG.backWindow, { player } = G;
  if (G.role === 'guard') { flash(S.backWindow.guard, 2, '#93a1b8'); return true; }
  if (G.hands.carrying === 'medium') { flash(S.backWindow.tooBig, 2.5, '#93a1b8'); return true; }   // a big item takes both hands; small ones go along
  const idx = G.level.doors.indexOf(win), needOpen = Math.abs(win.angle) < BW.openAngle;
  if (!G.isGuest && isBusy(idx, 'host')) { flash(S.backWindow.busy, 2, '#93a1b8'); return true; }
  const c = plan(win);
  if (!c) { flash(S.backWindow.blocked, 2, '#93a1b8'); return true; }
  Object.assign(c, { t: 0, idx, needOpen, vr: G.inVR, opened: false, placed: false, cancel: null });
  c.dur = c.vr ? BW.vr.fadeOut + BW.vr.fadeIn + 0.1 : total(needOpen);
  local.climb = c;
  if (G.isGuest) G.netIntent('climb', { i: idx });   // the host opens the sash for us and may say no
  else { occupy(idx, 'host', c.dur + 0.5); openSash(win, player.head); }
  if (!c.vr) { player.virtualCrouch = true; }   // (the camera's height is the sequence's: it eases the crouch in behind it)
  flash(S.backWindow.climbing, c.dur, '#93a1b8');
  return true;
}

// open the sash (host / solo): slowly, from the side of the one who climbs; the guards will notice it open
function openSash(win, from) {
  win.lastUser = 'player';
  win.openTo(from.x, from.z, CFG.backWindow.openTo, CFG.backWindow.steps.open);
}

// VR: the trigger with the hand in the zone (not on the sash's handle: that drags the sash).
export function climbAtHand(hand) {
  const win = windowAhead(), g = G.grips && G.grips[hand];
  if (!win || !g) return false;
  g.getWorldPosition(_hand);
  win.handle(_handle);
  if (Math.hypot(_handle.x - _hand.x, _handle.z - _hand.z) < CFG.doors.handleReach) return false;
  startClimb(win);
  G.xrIn.pulse(hand, 0.3, 40);
  return true;
}

// put the head at (x, z): the rig follows (in VR the head is off the rig's centre)
function placeHead(x, z) {
  const p = G.player;
  p.rig.position.x += x - p.head.x; p.rig.position.z += z - p.head.z;
  p.rig.updateMatrixWorld();
  p.head.copy(p.headLocal).applyMatrix4(p.rig.matrixWorld);
  p.vel.set(0, 0); p.speed = 0;
}
const turnTo = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

// the sequence at time t: { x, z, eye (absolute, m above the floor), pitch, yaw }
function pose(c, t) {
  const T = CFG.backWindow.steps, E = CFG.backWindow.eye, P = CFG.backWindow.pitch;
  const tO = c.needOpen ? T.open : 0;
  const t1 = T.align, t2 = t1 + tO, t3 = t2 + T.rise, t4 = t3 + T.carry;
  const crouchEye = BASE_EYE - CROUCH_DROP;
  if (t < t1) { const u = ease(t / T.align); return { x: lerp(c.from[0], c.A[0], u), z: lerp(c.from[1], c.A[1], u), eye: c.eye0, pitch: 0, yaw: turnTo(c.yaw0, c.yawT, u), lookPitch: lerp(c.pitch0, 0, u) }; }
  if (t < t2) return { x: c.A[0], z: c.A[1], eye: c.eye0, pitch: 0, yaw: c.yawT, lookPitch: 0 };
  if (t < t3) { const u = ease((t - t2) / T.rise); return { x: c.A[0], z: c.A[1], eye: lerp(c.eye0, E.rise, u), pitch: lerp(0, P.rise, u), yaw: c.yawT, lookPitch: 0 }; }
  if (t < t4) { const u = ease((t - t3) / T.carry); return { x: lerp(c.A[0], c.M[0], u), z: lerp(c.A[1], c.M[1], u), eye: lerp(E.rise, E.over, u), pitch: lerp(P.rise, P.over, u), yaw: c.yawT, lookPitch: 0 }; }
  const u = ease((t - t4) / T.drop);
  return { x: lerp(c.M[0], c.B[0], u), z: lerp(c.M[1], c.B[1], u), eye: lerp(E.over, Math.min(E.land, crouchEye + 0.001) , u), pitch: lerp(P.over, 0, u), yaw: c.yawT, lookPitch: 0 };
}
// the time the carry step begins, and the share of it a refused climb can still be taken back in
const carryAt = (c) => CFG.backWindow.steps.align + (c.needOpen ? CFG.backWindow.steps.open : 0) + CFG.backWindow.steps.rise;

// leave the sequence: the camera's lift and tilt off
function endClimb() {
  const p = G.player;
  local.climb = null;
  p.climbY = 0; p.climbPitch = 0;
}

// the host said no (busy / not allowed): the guest comes back if it is not over the sill yet
export function climbDenied(why) {
  const c = local.climb;
  if (!c || c.cancel) return;
  flash(why === 'busy' ? S.backWindow.busy : S.backWindow.guard, 2, '#93a1b8');
  if (c.vr) { if (!c.placed) { c.cancel = { t: 0, vr: true }; } return; }
  const T = CFG.backWindow.steps, tNow = c.t;
  if (tNow > carryAt(c) + T.carry * CFG.backWindow.cancelUntil) return;   // already over: let it finish
  const now = pose(c, Math.min(tNow, c.dur));
  c.cancel = { t: 0, from: now };
}

// ---------- the host: who is on which window ----------
function occupy(i, by, secs) { busy.set(i, { by, until: G.simT + secs }); }
function isBusy(i, by) { const b = busy.get(i); return !!b && b.by !== by && b.until > G.simT; }
// a guest's `climb` (systems/net.js hostIntent): open the sash for it, or refuse. deny(why) tells the guest.
export function hostClimb(r, m, deny) {
  const win = G.level.doors[m.i];
  if (!win || !win.window) return;
  if (r.id === G.guardPid) { deny('guard'); return; }
  if (G.caughtT >= 0 || G.round.phase === 'result') { deny('caught'); return; }
  if (isBusy(m.i, r.id)) { deny('busy'); return; }
  occupy(m.i, r.id, total(Math.abs(win.angle) < CFG.backWindow.openAngle) + 0.5);
  openSash(win, r.head);
}

export const backWindow = {
  id: 'backWindow',
  init() { busy.clear(); local.climb = null; },
  input() {
    if (local.climb) { G.move.x = 0; G.move.y = 0; }
  },
  act(dt) {
    const c = local.climb;
    if (!c) return;
    const p = G.player, BW = CFG.backWindow;
    if (G.caughtT >= 0 || G.round.phase === 'result') { if (c.vr) G.comfort.fade = 0; endClimb(); return; }
    // the guard's / the host's no, taken back
    if (c.cancel && !c.vr) {
      c.cancel.t += dt;
      const u = ease(c.cancel.t / 0.4), a = c.cancel.from, home = { x: c.from[0], z: c.from[1], eye: c.eye0 };
      placeHead(lerp(a.x, home.x, u), lerp(a.z, home.z, u));
      p.climbY = lerp(a.eye, home.eye, u) - (BASE_EYE - CROUCH_DROP * p.crouchT); p.climbPitch = lerp(a.pitch, 0, u);
      if (u >= 1) { p.virtualCrouch = c.crouch0; endClimb(); }
      return;
    }
    c.t += dt;
    if (c.vr) {   // VR: fade out, the body goes over, fade in
      const V = BW.vr;
      if (c.cancel) { G.comfort.fadeIn(0.2); endClimb(); return; }
      if (!c.placed) {
        G.comfort.fade = Math.min(1, c.t / V.fadeOut); G.comfort.fadeRate = 0;
        if (c.t >= V.fadeOut) {
          const bx = c.B[0], bz = c.B[1];
          placeHead(bx, bz); p.virtualCrouch = true; c.placed = true;
          G.comfort.fadeIn(V.fadeIn);
          G.xrIn.pulse('both', 0.25, 50);
        }
      } else if (c.t >= V.fadeOut + V.fadeIn * 0.5) endClimb();
      return;
    }
    const s = pose(c, Math.min(c.t, c.dur));
    placeHead(s.x, s.z);
    p.lookYaw = s.yaw; p.lookPitch = s.lookPitch;
    p.virtualCrouch = true;
    p.climbY = s.eye - (BASE_EYE - CROUCH_DROP * p.crouchT);
    p.climbPitch = s.pitch;
    if (c.t >= c.dur) endClimb();   // crouched on the far side (the crouch has eased in behind the camera)
  },
};
