// The player's step of the frame. Act: holding the breath, walking, the hands (VR grips or the flat
// screen's context button), doors from the keyboard / the door button, the phone's context buttons,
// the drop-off ring behind the van.
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { ctl } from './controls.js';
import { boardAim } from './phone.js';
import { pressBoard } from './contract.js';
import { nearestDoor, useDoor } from './doors.js';
import { aimedDevice, useDevice } from './distract.js';
import { aimedNote, readNote } from './story.js';
import { placeAtDoor } from './traps.js';
import { S } from '../i18n/index.js';

// A guest's E / «Взяти» / «Покласти»: the host decides (the item may be gone already); the item then
// shows in front of this player's eyes when the host's state says it carries it.
function guestHands(hands, player, round) {
  if (hands.desk) G.netIntent('put', { atVan: round.atVan(player.head) });
  else if (hands.deskAim) G.netIntent('take', { i: G.loot.items.indexOf(hands.deskAim) });
}

export const player = {
  id: 'player',
  act(dt) {
    const { breath, xrIn, player, hands, round, touch, zone, loot, move } = G;
    const active = G.active;
    // breath (A / Shift)
    const b = breath.update(dt, active && G.breathDown);
    if (b === 'start') { flash(S.messages.breathHold, 1.5, '#4fb3ff'); xrIn.pulse('right', 0.2, 30); G.wristTimer = 0; }
    else if (b === 'end') { flash(S.messages.breathOut(breath.cool.toFixed(0)), 2, '#93a1b8'); G.wristTimer = 0; }
    else if (b === 'busy') flash(S.messages.breathBusy(breath.left.toFixed(0)), 1.5, '#93a1b8');

    // player + hands
    player.update(dt, move, G.level, hands.carrying === 'medium' ? CFG.player.carryMediumK : 1);
    if (G.inVR) { if (!G.isGuest) hands.update(dt, xrIn.grip); }   // with friends VR hands come later (W10); a guest's loot goes through the host
    else if (G.playingDesktop) {
      hands.aimDesk(player.head, player.yaw);
      // the context button: an item under the crosshair first, else a board button under it («Натиснути»)
      if (ctl.interact) {
        const dev = aimedDevice();   // W2a: a device in front (nothing in hand, no item under the crosshair)
        const note = !hands.deskAim ? aimedNote() : null;   // W7: a note in front (read on this device only)
        if (note) readNote(note);
        else if (dev) useDevice(dev);
        else if (!hands.desk && !hands.deskAim && boardAim()) pressBoard(boardAim());
        else if (G.isGuest) guestHands(hands, player, round);   // with friends: the host takes / puts it (systems/net.js)
        else if (hands.desk && placeAtDoor(hands.desk)) { /* W2b: the bucket on a door, the rope across a doorway */ }
        else hands.toggleDesk(player.head, player.yaw, round.atVan(player.head));
      }
      hands.updateDesk(player.head, player.yaw, player.lookPitch);
      hands.updateHighlight();
    }
    if (!G.inVR) {
      const front = () => nearestDoor(player.head.x, player.head.z, 1.6, player.yaw);
      if (ctl.doorSlow) useDoor(front(), null, CFG.doors.slowTime);
      if (ctl.doorFast) useDoor(front(), null, CFG.doors.fastTime);
      // phone: hold the door button = slow (quiet) swing; release = the leaf stops where it is
      if (ctl.doorHoldStart) { const d = front(); if (d) { useDoor(d, null, CFG.doors.slowTime); G.holdDoor = d.locked ? null : d; } }
      const i = G.holdDoor ? G.level.doors.indexOf(G.holdDoor) : -1;
      if (ctl.doorHoldEnd && G.holdDoor) { if (G.isGuest) G.netIntent('doorStop', { i }); else G.holdDoor.release(); G.holdDoor = null; }
      if (ctl.doorHoldToTap && G.holdDoor) { if (G.isGuest) G.netIntent('doorSwing', { i, time: CFG.doors.fastTime }); else G.holdDoor.swingTime(CFG.doors.fastTime); G.holdDoor = null; }
    }
    if (touch && G.playingDesktop) {
      const atVan = round.atVan(player.head);
      touch.setContext({
        interact: hands.desk ? (atVan && !hands.desk.throwable ? S.touch.toVan : S.touch.put) : hands.deskAim ? S.touch.take : aimedNote() ? S.touch.take : aimedDevice() ? S.devices.button[aimedDevice().kind] : boardAim() ? S.touch.press : null,
        door: !!nearestDoor(player.head.x, player.head.z, 1.6, player.yaw), crouched: player.virtualCrouch, breath,
      });
    }
    // drop-off ring: head inside with loot in hand = the loot flies into the van
    const carried = hands.heldItems().filter((it) => !it.throwable && (!it.twoHanded || hands.desk === it || (hands.two && hands.two.item === it)));   // a can is never delivered (W2a)
    const inRing = zone.contains(player.head.x, player.head.z);
    if (active && inRing && carried.length && round.phase !== 'result' && G.caughtT < 0 && !G.isGuest) {   // a guest: the host sees it in the ring
      for (const it of carried) { hands.detach(it); loot.deliver(it); }
      xrIn.pulse('both', 0.3, 40);
    }
    zone.update(dt, carried.length > 0, player.head);
  },
};
