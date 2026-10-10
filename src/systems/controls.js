// Controls: one snapshot per frame from the keyboard and the touch screen; the VR controllers.
// Input: the one-shot actions (stats, vignette, home, new round, crouch, the board), the move and
// look of this frame, the breath button. Frame: the keyboard's one-shot keys end.
import { G } from './state.js';
import { flash } from './messages.js';
import { pauseOpen } from './phone.js';
import { goHome, newRound, pressBoard } from './contract.js';
import { toggleStats, cycleVignette } from './stats.js';
import { triggerDown } from './doors.js';
import { useDeviceAtHand } from './distract.js';
import { autoFrameRate } from './vr.js';
import { S } from '../i18n/index.js';

// (VR reads its controllers in the input step below, unchanged.)
export const ctl = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
export function flatControls(dt) {
  const { keys, touch, pointer, gyro } = G;
  ctl.stats = keys.take('KeyF'); ctl.vignette = keys.take('KeyV'); ctl.home = keys.take('KeyR'); ctl.newRound = keys.take('KeyN');
  ctl.crouch = keys.take('KeyC'); ctl.interact = keys.take('KeyE'); ctl.doorSlow = keys.take('KeyQ'); ctl.doorFast = keys.take('KeyT');
  ctl.doorHoldStart = ctl.doorHoldEnd = ctl.doorHoldToTap = false; ctl.boardPress = null; ctl.look.x = ctl.look.y = 0;
  keys.readMove(ctl.move);
  ctl.breath = keys.any('ShiftLeft', 'ShiftRight');
  if (touch && G.playingDesktop) {
    touch.update();
    if (Math.hypot(touch.move.x, touch.move.y) > Math.hypot(ctl.move.x, ctl.move.y)) { ctl.move.x = touch.move.x; ctl.move.y = touch.move.y; }
    ctl.breath = ctl.breath || touch.breath;
    if (touch.take('crouch')) ctl.crouch = true;
    if (touch.take('interact')) ctl.interact = true;
    if (touch.take('doorTap')) ctl.doorFast = true;
    ctl.doorHoldStart = touch.take('doorHoldStart');
    ctl.doorHoldEnd = touch.take('doorHoldEnd');
    ctl.doorHoldToTap = touch.take('doorHoldToTap');
    ctl.boardPress = touch.takeBoardPress();
    pointer.touchHover = touch.pressing;
    touch.takeLook(ctl.look);
    if (gyro.on) gyro.take(ctl.look);   // the gyroscope turns the view on top of the finger
  }
  return ctl;
}

export const controls = {
  id: 'controls',
  init() { G.move = { x: 0, y: 0 }; },
  input(dt, now) {
    const { touch, player, xrIn, renderer, comfort, move } = G;
    const active = G.active = G.inVR || G.playingDesktop;   // this frame (also for the steps after input)
    // input (laptop keyboard, phone touch; VR below)
    flatControls(dt);
    if (touch && touch.take('pause')) pauseOpen('user');
    if (ctl.stats) toggleStats();
    if (ctl.vignette) cycleVignette();
    if (ctl.home) goHome();
    if (ctl.newRound) newRound();
    if (ctl.crouch) player.virtualCrouch = !player.virtualCrouch;
    move.x = ctl.move.x; move.y = ctl.move.y;
    G.breathDown = ctl.breath;
    if (G.playingDesktop && !G.guardStunned && (ctl.look.x || ctl.look.y)) player.look(ctl.look.x / 0.0025, ctl.look.y / 0.0025);   // touch: rad -> look()'s px
    if (G.playingDesktop && ctl.boardPress && G.caughtT < 0) pressBoard(ctl.boardPress);
    if (G.inVR) {
      const act = xrIn.read(renderer.xr.getSession(), dt);
      if (Math.hypot(xrIn.move.x, xrIn.move.y) > Math.hypot(move.x, move.y)) { move.x = xrIn.move.x; move.y = xrIn.move.y; }
      G.breathDown = G.breathDown || xrIn.breath;
      if (act.turn) { player.snapTurn(act.turn * G.snapDeg * Math.PI / 180); comfort.fadeIn(0.08); comfort.pulse(); }
      if (act.fps) toggleStats();
      if (act.vignette) cycleVignette();
      if (act.crouch) { player.virtualCrouch = !player.virtualCrouch; flash(player.virtualCrouch ? S.messages.crouchedVr : S.messages.stoodVr); }
      if (act.recenter) { player.recenterTo(player.head.x, player.head.z, player.yaw, true); G.heightMsg = true; }
      if (act.home) goHome();
      for (const [hand, used] of [['left', act.useLeft], ['right', act.useRight]]) {
        if (!used || G.caughtT >= 0) continue;
        if (G.pointer.hover[hand]) { pressBoard(G.pointer.hover[hand]); xrIn.pulse(hand, 0.3, 30); }
        else if (!useDeviceAtHand(hand)) triggerDown(hand);   // a device within reach first (W2a), else doors
      }
      autoFrameRate(now);
    } else if (!G.playingDesktop) {
      move.x = move.y = 0;
    }
    if (!active || G.caughtT >= 0 || G.guardStunned) { move.x = move.y = 0; }   // W15: a trap knocked the guard player down
  },
  frame() { G.keys.endFrame(); },
};
