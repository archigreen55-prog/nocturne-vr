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
      // noise from the player: stick steps, voice, shout
      if (player.stepNoise) noise.emit(player.head.x, player.head.z, player.stepNoise, player.stepKind);   // 'step' or 'run'
      const micLive = mic.state === 'on' && !mic.noMic && !breath.holding && !scream.playing && G.caughtT < 0;
      const shout = mic.takeShout();
      if (micLive && shout) {
        round.shouts++;
        fx('shout');
        scream.onShout(round.t);
        noise.emit(player.head.x, player.head.z, 40, 'shout');
        if (CFG.run.shoutFull) { alert.setFull(S.cause.shout, player.head.x, player.head.z); flash(S.messages.shoutFull, 3, '#ff4d4d'); }
        else { alert.add(70, player.head.x, player.head.z); flash(S.messages.shoutEasy, 3, '#ff4d4d'); }   // easy
      }
      // talking: heard only after CFG.mic.normalAfter s of continuous speech (short pauses allowed)
      if (micLive && mic.level !== 'quiet') { G.speakT += dt; G.quietT = 0; }
      else { G.quietT += dt; if (G.quietT > 0.35) G.speakT = 0; }
      if (micLive && G.speakT >= CFG.mic.normalAfter) {
        G.voiceT -= dt;
        if (G.voiceT <= 0) { G.voiceT = CFG.mic.normalEvery; noise.emit(player.head.x, player.head.z, CFG.mic.normalRadius, 'voice'); }
      } else G.voiceT = 0;

      // world
      loot.update(dt, player);
      if (G.caughtT < 0) {
        if (patrol.update(dt, player) === 'caught') caught();
        lurker.update(dt, player);
      }
      alert.update(dt);
      round.update(dt, player);
      // heartbeat while escaping (plan §5: 1 Hz)
      if (round.phase === 'escape') {
        G.heartT -= dt;
        if (G.heartT <= 0) { G.heartT = 0.9; playHeartbeat(); xrIn.pulse('both', 0.35, 60); fx('heartbeat'); }
      }
    } else {
      mic.takeShout();
      G.speakT = 0;
      if (round.phase === 'result') { loot.update(dt, player); alert.update(dt); }
    }
  },
  present(dt) { G.noise.update(dt); },
};
