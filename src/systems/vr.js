// The VR session: entering and leaving, the system recentre, the frame-rate fallback to 72 Hz.
// Pre: the head pose (a recentre fades in and says what happened).
import * as THREE from 'three';
import { unlockAudio } from '../audio/audio.js';
import { G, $, params } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

const fpsWindow = { frames: 0, since: 0 };

// Drop to 72 Hz once if the headset cannot hold its current rate (steady 72 beats jittery 80-90).
export function autoFrameRate(now) {
  fpsWindow.frames++;
  if (G.autoHzDone || params.has('hz') || now - G.vrStart < 6000) { if (now - fpsWindow.since > 3000) { fpsWindow.frames = 0; fpsWindow.since = now; } return; }
  if (now - fpsWindow.since < 3000) return;
  const fps = fpsWindow.frames * 1000 / (now - fpsWindow.since);
  fpsWindow.frames = 0; fpsWindow.since = now;
  const s = G.renderer.xr.getSession();
  const rates = s && s.supportedFrameRates;
  if (!s || !s.updateTargetFrameRate || !rates || !Array.from(rates).includes(72) || !(s.frameRate > 73)) return;
  if (fps < 86) {
    G.autoHzDone = true;
    s.updateTargetFrameRate(72).then(() => flash(S.messages.hz72(fps.toFixed(0)), 4)).catch(() => {});
  }
}

export const vr = {
  id: 'vr',
  init() {
    const { renderer } = G;
    renderer.xr.addEventListener('sessionstart', () => {
      const { player, comfort, hands, round, siren } = G;
      G.inVR = true;
      G.firstRecenter = true;
      unlockAudio();
      player.enterVR();
      player.recenterTo(player.head.x, player.head.z, player.yaw, true);
      comfort.blackout();   // black until the head pose is known, then fade in
      $('overlay').style.display = 'none';
      $('hint').style.display = 'none';
      $('crosshair').style.display = 'none';
      if (document.pointerLockElement) document.exitPointerLock();
      if (hands.desk) { hands.desk.drop(new THREE.Vector3()); hands.desk = null; }
      if (round.phase === 'escape') siren.set(true);
      // the system recentre (holding the Meta button) resets the space: keep the head where it was
      const space = renderer.xr.getReferenceSpace();
      if (space && space.addEventListener) space.addEventListener('reset', () => player.recenterTo(player.head.x, player.head.z, player.yaw));
      const session = renderer.xr.getSession();
      G.vrStart = performance.now();
      fpsWindow.frames = 0; fpsWindow.since = G.vrStart;
      if (params.has('hz') && session.updateTargetFrameRate) session.updateTargetFrameRate(+params.get('hz')).catch(() => {});
      session.addEventListener('inputsourceschange', (e) => {
        for (const i of e.added) console.log(`XR input ${i.handedness}: ${i.profiles[0]}, ${i.gamepad ? i.gamepad.buttons.length + ' buttons, ' + i.gamepad.axes.length + ' axes' : 'no gamepad'}`);
      });
    });
    renderer.xr.addEventListener('sessionend', () => {
      const { drags, hands, player, camera, wrist, comfort, siren } = G;
      G.inVR = false;
      for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } hands.release(h, true); }
      player.exitVR();
      camera.scale.set(1, 1, 1);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      wrist.attachToCamera(camera);
      comfort.fade = 0;
      siren.set(false);
      $('overlay').style.display = 'flex';
    });
  },
  pre(dt, now, xrFrame) {
    const { player, comfort } = G;
    if (player.updatePose(xrFrame) === 'recentred') {
      comfort.fadeIn(G.firstRecenter ? 0.5 : 0.25);
      if (G.firstRecenter) flash(S.messages.lookAtWrist, 5);
      else if (G.heightMsg) flash(S.messages.height(player.standingHeight.toFixed(2)));
      G.heightMsg = false;
      G.firstRecenter = false;
    }
  },
};
