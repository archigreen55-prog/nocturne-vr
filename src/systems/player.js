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
import { S } from '../i18n/index.js';

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
    if (G.inVR) hands.update(dt, xrIn.grip);
    else if (G.playingDesktop) {
      hands.aimDesk(player.head, player.yaw);
      // the context button: an item under the crosshair first, else a board button under it («Натиснути»)
      if (ctl.interact) {
        if (!hands.desk && !hands.deskAim && boardAim()) pressBoard(boardAim());
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
      if (ctl.doorHoldEnd && G.holdDoor) { G.holdDoor.release(); G.holdDoor = null; }
      if (ctl.doorHoldToTap && G.holdDoor) { G.holdDoor.swingTime(CFG.doors.fastTime); G.holdDoor = null; }
    }
    if (touch && G.playingDesktop) {
      const atVan = round.atVan(player.head);
      touch.setContext({
        interact: hands.desk ? (atVan ? S.touch.toVan : S.touch.put) : hands.deskAim ? S.touch.take : boardAim() ? S.touch.press : null,
        door: !!nearestDoor(player.head.x, player.head.z, 1.6, player.yaw), crouched: player.virtualCrouch, breath,
      });
    }
    // drop-off ring: head inside with loot in hand = the loot flies into the van
    const carried = hands.heldItems().filter((it) => !it.twoHanded || hands.desk === it || (hands.two && hands.two.item === it));
    const inRing = zone.contains(player.head.x, player.head.z);
    if (active && inRing && carried.length && round.phase !== 'result' && G.caughtT < 0) {
      for (const it of carried) { hands.detach(it); loot.deliver(it); }
      xrIn.pulse('both', 0.3, 40);
    }
    zone.update(dt, carried.length > 0, player.head);
  },
};
