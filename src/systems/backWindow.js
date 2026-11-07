// The dacha's back window (the «stealth-house» branch). The window itself is a door of the level
// (level.doors, `window: true`): it opens like a door (the door button / Q / T / the VR trigger), with a
// quiet creak, and with friends a guest asks the host as with any door. This system is the climbing:
// in front of the open window (phone «Лізти у вікно», PC E, VR the trigger by the opening) you climb
// through in CFG.backWindow.climbTime, crouched, not walking; not with a big (two-handed) item; the
// guard (the AI and the human one) does not climb. The climb moves this device's own body only: with
// friends the host sees the guest's body where the guest says it is.
// Input: no walking while climbing. Act (after the player's step): the body follows the climb.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

const local = { climb: null };   // { win, from: [x, z], to: [x, z], t }
const _hand = new THREE.Vector3();

// the side of the window's wall (x, z) is on: +1 / -1 along the wall's normal
function sideOf(win, x, z) {
  const nx = -Math.sin(win.base), nz = -Math.cos(win.base);   // normal of the closed sash
  return Math.sign((x - win.cx) * nx + (z - win.cz) * nz) || 1;
}

// The open window this player can climb through now (in reach, facing it), or null.
export function windowAhead() {
  const { player, level } = G;
  if (!level || !level.doors || local.climb) return null;
  if ((player.floorY || 0) > 0.5) return null;
  for (const d of level.doors) {
    if (!d.window || Math.abs(d.angle) < CFG.backWindow.openAngle) continue;
    const dx = d.cx - player.head.x, dz = d.cz - player.head.z, dist = Math.hypot(dx, dz);
    if (dist > CFG.backWindow.reach) continue;
    if (dist > 0.3 && (-Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz) / dist < 0.3) continue;   // in front of you
    return d;
  }
  return null;
}
export const climbing = () => !!local.climb;

// The context button's label in front of an open window (null: not here).
export function climbLabel() {
  return windowAhead() ? S.backWindow.climb : null;
}

// Start climbing through `win`. Returns true when the press was the window's (even if it said no).
export function startClimb(win = windowAhead()) {
  if (!win) return false;
  if (G.role === 'guard') { flash(S.backWindow.guard, 2, '#93a1b8'); return true; }
  if (G.hands.carrying === 'medium') { flash(S.backWindow.tooBig, 2.5, '#93a1b8'); return true; }   // a big item takes both hands; small ones (in a hand, a pocket) go along
  const { player } = G, h = player.head, BW = CFG.backWindow;
  const side = sideOf(win, h.x, h.z), nx = -Math.sin(win.base), nz = -Math.cos(win.base);
  const cx = win.cx, cz = win.cz;   // the middle of the opening
  local.climb = { win, from: [h.x, h.z], mid: [cx + nx * side * 0.35, cz + nz * side * 0.35], to: [cx - nx * side * BW.land, cz - nz * side * BW.land], t: 0 };
  player.virtualCrouch = true;   // you go through crouched (and stay so: stand up yourself)
  flash(S.backWindow.climbing, BW.climbTime, '#93a1b8');
  return true;
}

// VR: the trigger with the hand in the open window's opening (not on its handle: that drags the sash).
export function climbAtHand(hand) {
  const win = windowAhead(), g = G.grips && G.grips[hand];
  if (!win || !g) return false;
  g.getWorldPosition(_hand);
  win.handle(_handle);
  if (Math.hypot(_handle.x - _hand.x, _handle.z - _hand.z) < CFG.doors.handleReach) return false;
  if (Math.hypot(_hand.x - win.cx, _hand.z - win.cz) > 0.7 || _hand.y < win.y0 - 0.3 || _hand.y > win.y0 + 1.4) return false;
  startClimb(win);
  G.xrIn.pulse(hand, 0.3, 40);
  return true;
}
const _handle = new THREE.Vector3();

// put the head at (x, z): the rig follows (in VR the head is off the rig's centre)
function placeHead(x, z) {
  const p = G.player;
  p.rig.position.x += x - p.head.x; p.rig.position.z += z - p.head.z;
  p.rig.updateMatrixWorld();
  p.head.copy(p.headLocal).applyMatrix4(p.rig.matrixWorld);
  p.vel.set(0, 0); p.speed = 0;
}

export const backWindow = {
  id: 'backWindow',
  input() {
    if (local.climb) { G.move.x = 0; G.move.y = 0; }
  },
  act(dt) {
    const c = local.climb;
    if (!c) return;
    if (G.caughtT >= 0 || G.round.phase === 'result') { local.climb = null; return; }
    c.t += dt;
    const k = Math.min(1, c.t / CFG.backWindow.climbTime);
    G.player.virtualCrouch = true;
    // first to the sill on your side (40 %), then over it and down on the other side
    if (k < 0.4) { const u = k / 0.4; placeHead(c.from[0] + (c.mid[0] - c.from[0]) * u, c.from[1] + (c.mid[1] - c.from[1]) * u); }
    else { const u = (k - 0.4) / 0.6; placeHead(c.mid[0] + (c.to[0] - c.mid[0]) * u, c.mid[1] + (c.to[1] - c.mid[1]) * u); }
    if (k >= 1) local.climb = null;
  },
};
