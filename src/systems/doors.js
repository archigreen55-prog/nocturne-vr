// Doors: the nearest door, a quick or slow swing, dragging a door by its handle in VR, hinge creaks
// (a voice per moving door, a noise per creak). World: drags and creaks.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { playKnock, CreakVoice } from '../audio/audio.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

const _hand = new THREE.Vector3(), _handle = new THREE.Vector3();
// Door nearest to (x, z) within maxDist of its doorway centre; if dirYaw is given, only in front.
export function nearestDoor(x, z, maxDist, dirYaw) {
  let best = null, bestD = maxDist;
  const floor = G.level.floorIndex ? G.level.floorIndex(G.player.floorY) : 0;
  for (const d of G.level.doors) {
    if (d.floor !== floor) continue;
    const dx = d.cx - x, dz = d.cz - z;
    const dist = Math.hypot(dx, dz);
    if (dist >= bestD) continue;
    if (dirYaw !== undefined && dist > 0.5 && (-Math.sin(dirYaw) * dx - Math.cos(dirYaw) * dz) / dist < 0.3) continue;
    best = d; bestD = dist;
  }
  return best;
}
// Quick swing (creaks) or slow (quiet).
export function useDoor(door, hand, time = CFG.doors.fastTime) {
  if (!door) return;
  if (G.hands.busy) { flash(S.messages.handsBusy); return; }
  if (G.isGuest && !door.locked) { G.netIntent('door', { i: G.level.doors.indexOf(door), time }); if (hand) G.xrIn.pulse(hand, 0.3, 30); return; }   // with friends the host swings it
  door.lastUser = G.role === 'guard' ? 'patrol' : 'player';   // W15: the guard's own doors are no news to the guards
  const r = door.toggle(G.player.head.x, G.player.head.z, time);
  if (r === 'locked') { playKnock({ x: door.cx, y: 1, z: door.cz }); flash(S.messages.locked); if (hand) G.xrIn.pulse(hand, 0.6, 60); }
  else if (hand) G.xrIn.pulse(hand, 0.3, 30);
}
// VR trigger: hand on the handle = drag the door (slow = quiet); elsewhere near a door = quick swing.
export function triggerDown(hand) {
  const { hands, grips, level, drags, xrIn, player } = G;
  if (hands.busy) { flash(S.messages.handsBusy); return; }
  const g = grips[hand];
  if (!g) return;
  g.getWorldPosition(_hand);
  for (const door of level.doors) {
    door.handle(_handle);
    if (Math.hypot(_handle.x - _hand.x, _handle.z - _hand.z) < CFG.doors.handleReach && Math.abs(_hand.y - 1) < 0.6) {
      if (!door.grab(_hand.x, _hand.z)) { useDoor(door, hand); return; }   // locked
      door.lastUser = 'player';
      drags[hand] = { door, t: 0, a0: door.angle };
      xrIn.pulse(hand, 0.2, 20);
      return;
    }
  }
  let door = nearestDoor(_hand.x, _hand.z, 0.9);
  if (!door) door = nearestDoor(player.head.x, player.head.z, 1.5, player.yaw);
  useDoor(door, hand);
}
function updateDrags(dt) {
  const { drags, xrIn, grips, hands } = G;
  for (const hand of ['left', 'right']) {
    const d = drags[hand];
    if (!d) continue;
    d.t += dt;
    if (!xrIn.trigger[hand] || !grips[hand] || hands.busy) {
      d.door.release();
      drags[hand] = null;
      // a tap on the handle (no pull) = quick swing
      if (d.t < 0.3 && Math.abs(d.door.angle - d.a0) < 0.09) useDoor(d.door, hand);
      continue;
    }
    grips[hand].getWorldPosition(_hand);
    d.door.drag(_hand.x, _hand.z);
  }
}
// Hinge creaks: a continuous voice per moving door (loudness follows the swing speed) and, for the
// patrol, a noise per creak (radius from its loudest moment; the patrol's own doors only warn you,
// they do not alarm it).
const creakVoices = new Map();
const _doorPos = { x: 0, y: 1.2, z: 0 };
function updateDoors(dt) {
  const { level, player, noise } = G;
  for (const d of level.doors) {
    const loud = d.update(dt);
    let v = creakVoices.get(d);
    if (loud > 0 && !v) { v = new CreakVoice(); creakVoices.set(d, v); }
    if (v) {
      _doorPos.x = d.cx; _doorPos.z = d.cz;
      if (!v.set(loud, _doorPos, level.soundOccluded(player.head.x, player.head.z, d.cx, d.cz), dt)) { v.stop(); creakVoices.delete(d); }
    }
    // one noise per creak burst (when it stops), or every 0.5 s while it goes on; radius from its peak
    d.creakPeak = Math.max(d.creakPeak || 0, loud);
    if (d.creakPeak > 0) d.creakAge = (d.creakAge || 0) + dt;
    if (d.creakPeak > 0 && (loud === 0 || d.creakAge >= 0.5)) {
      if (d.lastUser !== 'patrol' && !G.isGuest) noise.emit(d.cx, d.cz, CFG.doors.creakRadius * Math.pow(d.creakPeak, 0.7), 'door');
      d.creakPeak = 0; d.creakAge = 0;
    }
  }
}

export const doors = {
  id: 'doors',
  // VR trigger drags (left, right)
  init() { G.drags = { left: null, right: null }; },
  world(dt) {
    updateDrags(dt);
    updateDoors(dt);
  },
};
