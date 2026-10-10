// The round's world step. World: the flashlight's room mask and walls, the wrist facing the eye, the
// audio listener; while the round runs: the player's noise (steps, talking, a shout), loot, the guard, the
// lurker, the alarm, the round clock, the heartbeat while escaping. Present: the noise ripples.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { setListener, playHeartbeat } from '../audio/audio.js';
import { updateFlashMask } from '../enemies/flashMask.js';
import { updateFlashWalls } from '../enemies/flashWalls.js';
import { G } from './state.js';
import { flash, fx } from './messages.js';
import { caught } from './contract.js';
import { S } from '../i18n/index.js';
import { guestShout } from './net.js';

const flashFrom = new THREE.Vector3();

export const heist = {
  id: 'heist',
  world(dt) {
    const { patrol, level, wrist, player, round, noise, mic, breath, scream, alert, loot, lurker, xrIn } = G;
    updateFlashMask(patrol.x, patrol.z, level.doors, patrol.y);
    updateFlashWalls(patrol.spot.getWorldPosition(flashFrom), level);
    if (G.inVR) wrist.faceEye(player.head);
    setListener(player.head.x, player.head.y, player.head.z, player.yaw);

    if (G.active && round.phase !== 'result') {
      const micLive = mic.state === 'on' && !mic.noMic && !breath.holding && !scream.playing && G.caughtT < 0;
      const shout = mic.takeShout();
      if (G.isGuest) {   // a guest: the house is the host's; its shouts go there (systems/net.js), talking only shows on the HUD
        if (micLive && shout) { fx('shout'); scream.onShout(round.t); guestShout(); }
        speaking(G, dt, micLive, mic.level);
        alert.update(dt);   // the host's alarm level: the lights
        return;
      }
      // noise from the players: stick steps of everybody; voice and shout from this device's microphone
      for (const p of G.players) if (p.stepNoise) noise.emit(p.head.x, p.head.z, p.stepNoise, p.stepKind, { who: p });   // 'step' or 'run'
      voiceNoise(player, G, dt, micLive, mic.level, shout, true);

      // world
      loot.update(dt, G.players);
      if (G.caughtT < 0) {
        if (patrol.update(dt, G.players) === 'caught') caught(patrol.caughtWho);
        lurker.update(dt, G.players);
      }
      alert.update(dt);
      round.update(dt, G.players);
      // heartbeat while escaping (plan §5: 1 Hz)
      if (round.phase === 'escape') {
        G.heartT -= dt;
        if (G.heartT <= 0) { G.heartT = 0.9; playHeartbeat(); xrIn.pulse('both', 0.35, 60); fx('heartbeat'); }
      }
    } else {
      mic.takeShout();
      G.speakT = 0;
      if (G.isGuest) alert.update(dt);
      else if (round.phase === 'result') { loot.update(dt, G.players); alert.update(dt); }
    }
  },
  present(dt) { G.noise.update(dt); },
};

// Talking: heard only after CFG.mic.normalAfter s of continuous speech (short pauses allowed).
// st: { speakT, quietT, voiceT } (G for this device's player; a friend's own for each friend)
function speaking(st, dt, live, level) {
  if (live && level !== 'quiet') { st.speakT += dt; st.quietT = 0; }
  else { st.quietT += dt; if (st.quietT > 0.35) st.speakT = 0; }
}
// One player's voice in the house: a shout (full alarm, or +70 on easy) and talking (a 'voice' noise every
// CFG.mic.normalEvery s). local: this device's player (the scream replay and the effects are its own).
export function voiceNoise(p, st, dt, live, level, shout, local) {
  const { round, noise, alert } = G, x = p.head.x, z = p.head.z;
  if (live && shout) {
    round.shouts++;
    if (local) { fx('shout'); G.scream.onShout(round.t); }
    noise.emit(x, z, 40, 'shout', { who: p });
    if (CFG.run.shoutFull) { alert.setFull(S.cause.shout, x, z); flash(S.messages.shoutFull, 3, '#ff4d4d'); }
    else { alert.add(70, x, z); flash(S.messages.shoutEasy, 3, '#ff4d4d'); }   // easy
  }
  speaking(st, dt, live, level);
  if (live && st.speakT >= CFG.mic.normalAfter) {
    st.voiceT -= dt;
    if (st.voiceT <= 0) { st.voiceT = CFG.mic.normalEvery; noise.emit(x, z, CFG.mic.normalRadius, 'voice', { who: p }); }
  } else st.voiceT = 0;
}
