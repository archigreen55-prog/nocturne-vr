// Back to the start screen (Esc on a laptop, the menu on a phone); the laptop's captured mouse.
import { leavePhonePlay } from '../platform/screen.js';
import { G, $ } from './state.js';
import { pressBoard } from './contract.js';

export function pause2D() {
  if (!G.playingDesktop || G.inVR) return;
  G.playingDesktop = false;
  $('overlay').style.display = 'flex';
  $('hint').style.display = 'none';
  $('crosshair').style.display = 'none';
  G.siren.set(false);
  if (G.holdDoor) { G.holdDoor.release(); G.holdDoor = null; }
  if (G.touch) {
    G.paused = false; G.menu.close(); G.summary.hide(); G.hud.show(false);
    G.touch.reset(); $('touch').hidden = true; document.body.classList.remove('phone-playing', 'portrait-block'); leavePhonePlay();
  }
}
export function lockPointer() {
  try { const p = G.renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not available */ }
}

export const desktop = {
  id: 'desktop',
  init() {
    const { renderer, pointer, player } = G;
    renderer.domElement.addEventListener('click', () => {
      if (!G.playingDesktop || G.inVR || G.touch) return;
      if (!document.pointerLockElement) { lockPointer(); return; }
      if (pointer.hover.desk) pressBoard(pointer.hover.desk);
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === renderer.domElement) player.look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      // Esc releases the mouse: show the menu (calibration, settings) again
      if (!document.pointerLockElement && G.playingDesktop && !G.inVR && !G.touch) pause2D();
    });
  },
};
