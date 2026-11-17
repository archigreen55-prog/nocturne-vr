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
      if (G.role !== 'guard' && !(G.benchT > 0)) voiceNoise(player, G, dt, micLive, mic.level, shout, true, micLive && mic.whispering);   // W15: the guard's voice, or a thief's in the van, is no noise in the house

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
// One player's voice in the house (plan «голос і кільця», 15.11): a shout, talking (a 'voice' noise every
// CFG.mic.normalEvery s) and whispering (a 'whisper' noise every CFG.mic.whisper.every s) — each a noise of its
// real radius (CFG.mic.voice / whisper / shout); what the guard does about it is the hearing's (systems/world.js:
// a shout close by is the full alarm, farther it comes to look). local: this device's player (the scream replay
// and the effects are its own). whispering: the microphone says it is a whisper now (a friend's: its `wh`).
export function voiceNoise(p, st, dt, live, level, shout, local, whispering = false) {
  const { round, noise, alert } = G, x = p.head.x, z = p.head.z, M = CFG.mic;
  if (live && shout) {
    round.shouts++;
    if (local) { fx('shout'); G.scream.onShout(round.t); }
    noise.emit(x, z, M.shout.radius, 'shout', { who: p, wallK: M.shout.wallK });
    if (alert.manualOnly) flash(S.hguard.shoutHeard, 3, '#ff4d4d');   // W15: a friend plays the guard — it decides what a shout means
  }
  speaking(st, dt, live, level);
  if (live && st.speakT >= M.normalAfter) {
    st.voiceT -= dt;
    if (st.voiceT <= 0) { st.voiceT = M.normalEvery; noise.emit(x, z, M.voice.radius, 'voice', { who: p }); }
  } else st.voiceT = 0;
  // whispering for as long as talking needs to be heard: a ring right around you, not through a wall
  st.whisperT = live && whispering ? (st.whisperT || 0) + dt : 0;
  if (st.whisperT >= M.normalAfter) {
    st.whisperEmitT = (st.whisperEmitT || 0) - dt;
    if (st.whisperEmitT <= 0) { st.whisperEmitT = M.whisper.every; noise.emit(x, z, M.whisper.radius, 'whisper', { who: p, wallK: M.whisper.wallK }); }
  } else st.whisperEmitT = 0;
}
