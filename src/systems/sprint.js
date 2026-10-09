// Running (game-design §10): the third tempo. Input (right after the controls, before the player moves):
// the wish to run from the three modes (PC: Space twice and held with W; phone: the joystick past its
// circle forward or the 🔒 auto-run; VR: the left stick pressed while pushed forward), the rules
// (stamina, out of breath, crouching, what is in the hands), the running speed for the player, a
// door in the way (a closed one is shouldered open, a locked one = a knock and a stop), the crystal
// vase slipping out, no holding your breath and a raised whisper boundary while out of breath.
// World: your own running steps and the breathing (a noise the guard hears). The read-out for the
// HUD / wrist is G.run (RunState); the counts for the report are G.runStats.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { RunState } from '../game/run.js';
import { playKnock } from '../audio/audio.js';
import { playRunStep, playPant, playShoulder } from '../audio/runSfx.js';
import { G, $ } from './state.js';
import { flash, fx } from './messages.js';
import { S } from '../i18n/index.js';

const _v = new THREE.Vector3();
const local = { wasCrouched: false, hold: false, blockedMsg: false, breathWas: false, runT: 0, slipT: 0, knockT: 0, pantT: 0, phase: null, difficulty: null };

// VR comfort setting «Біг у VR»: 2.8 / 2.4 / off (CFG.sprint.vrSpeeds)
export const vrRunSpeed = () => CFG.sprint.vrSpeeds[G.vrRun] ?? CFG.sprint.speed;

function resetRun() {
  G.run.reset();
  local.hold = false; local.blockedMsg = false; local.runT = 0; local.slipT = 0; local.pantT = 0;
  G.player.runSpeed = 0;
  if (G.touch) G.touch.unlock();
}

// stop running from outside (a locked door, crouching): auto-run off; a new wish is needed to run again
function stopRun() {
  if (G.run.stop() && local.runT < 0.4) G.runStats.short++;
  G.player.runSpeed = 0;
  if (G.touch) G.touch.unlock();
  local.hold = true;
}

// A closed door within reach in the running direction: shoulder it open; a locked one: knock, stop.
function doorAhead() {
  const { player, level, noise } = G, h = player.head, v = player.vel, sp = Math.hypot(v.x, v.y);
  if (sp < 0.5) return;
  const fx_ = v.x / sp, fz = v.y / sp;
  for (const d of level.doors) {
    if (d.open) continue;
    const dx = d.cx - h.x, dz = d.cz - h.z, dist = Math.hypot(dx, dz);
    if (dist > CFG.sprint.doorAhead || (dx * fx_ + dz * fz) / Math.max(dist, 1e-6) < 0.6) continue;
    if (d.locked) {
      if (local.knockT > 0) return;
      local.knockT = CFG.sprint.knockEvery;
      playKnock({ x: d.cx, y: 1, z: d.cz });
      noise.emit(d.cx, d.cz, CFG.sprint.knockRadius, 'door');
      flash(S.messages.locked);
      G.runStats.knocks++;
      stopRun();
      player.vel.set(0, 0);
      return;
    }
    d.lastUser = 'player';
    d.toggle(h.x, h.z, CFG.sprint.bashTime);   // the creak of a fast swing is the noise (doors.creakRadius)
    playShoulder({ x: d.cx, y: 1.2, z: d.cz });
    flash(S.sprint.bashed, 1.2, '#ffb347');
    G.runStats.bashes++;
    return;
  }
}

export const sprint = {
  id: 'sprint',
  init() {
    G.run = new RunState();
    G.runStats = { runs: 0, short: 0, time: 0, locks: 0, winded: 0, bashes: 0, knocks: 0, carryBlocked: 0, slips: 0 };
    G.vrRun = loadSetting('vrRun', 'fast');
    if (!(G.vrRun in CFG.sprint.vrSpeeds)) G.vrRun = 'fast';
    const sel = $('vrrun');
    if (sel) {
      for (const id of Object.keys(CFG.sprint.vrSpeeds)) {
        const o = document.createElement('option');
        o.value = id; o.textContent = S.sprint.vrSpeeds[id];
        sel.appendChild(o);
      }
      sel.value = G.vrRun;
      sel.addEventListener('change', () => { G.vrRun = sel.value; saveSetting('vrRun', G.vrRun); });
    }
  },

  input(dt) {
    const { player, touch, keys, xrIn, hands, alert, round, mic } = G;
    const R = G.run, C = CFG.sprint, st = G.runStats;
    // a new round or another difficulty: full stamina, nothing locked
    if ((round.phase === 'ready' && local.phase !== 'ready') || local.difficulty !== G.difficulty) resetRun();
    local.phase = round.phase; local.difficulty = G.difficulty;
    local.knockT -= dt;

    // the wish to run (each mode already checks "forward")
    let want = false;
    if (G.playingDesktop) want = keys.runWant || !!(touch && touch.run);
    if (G.inVR) want = want || (xrIn.run && vrRunSpeed() > 0);
    if (touch) {
      if (touch.take('runLock')) { st.locks++; fx('runLock'); flash(S.sprint.autoRun, 2, '#ffb347'); }
      touch.take('runUnlock');
    }
    // crouching wins: «Присісти» / C / B while running stops it (and auto-run)
    if (player.virtualCrouch && !local.wasCrouched && R.running) stopRun();
    local.wasCrouched = player.virtualCrouch;
    if (!want) { local.hold = false; local.blockedMsg = false; }
    if (local.hold) want = false;
    // really crouching in VR (the head low): no running (it cannot stand you up)
    if (G.inVR && player.crouched && !player.virtualCrouch) want = false;
    if (!G.active || G.caughtT >= 0 || G.paused || round.phase === 'result') want = false;

    const carry = hands.carrying === 'medium' ? 'medium' : hands.carrying === 'light' ? 'light' : null;
    const ev = R.update(dt, want, { carry, alarm: alert.full });
    if (ev === 'start') {
      st.runs++; local.runT = 0;
      fx('run');
      if (player.virtualCrouch) { player.virtualCrouch = false; local.wasCrouched = false; flash(S.sprint.stood, 1.5); }   // running stands you up
    } else if (ev === 'stop' || ev === 'winded') {
      if (local.runT < 0.4) st.short++;
    }
    if (ev === 'winded') { st.winded++; local.pantT = 0; flash(S.sprint.runOut, 1.5, '#ff7a1a'); if (touch) touch.unlock(); }
    if (ev && ev.startsWith('blocked') && !local.blockedMsg) {
      local.blockedMsg = true;
      if (ev === 'blocked:carry') { st.carryBlocked++; flash(S.sprint.cantCarry, 1.5); }
      else flash(S.sprint.windedTry(Math.ceil(R.winded > 0 ? R.winded : (Math.min(C.minStart, C.stamina) - R.left) * C.refill / C.stamina)), 1.5, '#93a1b8');
      if (touch) touch.unlock();
    }
    player.runSpeed = R.running ? (G.inVR ? vrRunSpeed() : C.speed) : 0;
    if (R.running) { local.runT += dt; st.time += dt; }

    // the way ahead and the hands while running
    if (R.running) doorAhead();
    const crystal = R.running && hands.heldItems().find((it) => it.crystal);
    if (crystal) {
      local.slipT += dt;
      if (local.slipT >= C.crystalSlip) {
        local.slipT = 0;
        hands.detach(crystal);
        hands.dropItem(crystal, _v.set(player.vel.x, 0.5, player.vel.y));   // it flies on ahead of you
        flash(S.loot.crystalSlipped, 2, '#7fc8ff');
        st.slips++;
      }
    } else local.slipT = 0;

    // out of breath: no holding your breath, the whisper boundary goes up
    if (R.winded > 0) {
      if (G.breathDown && !local.breathWas) flash(S.sprint.stillPanting, 1.5, '#93a1b8');
      local.breathWas = G.breathDown;
      G.breathDown = false;
    } else local.breathWas = false;
    mic.raise = R.winded > 0 ? C.whisperRaise : 0;

    if (touch) touch.setRun({ running: R.running, stamina: R.fraction, winded: R.winded > 0 });
  },

  world(dt) {
    const { player, noise, round } = G, R = G.run;
    if (!G.active || round.phase === 'result') return;
    // your own running steps (the noise itself is emitted with the other steps: systems/heist.js)
    if (player.stepNoise && player.stepKind === 'run') playRunStep();
    // out of breath: you breathe hard, once a second, and the guard may hear it (CFG.sprint.pantRadius)
    if (R.winded > 0 && G.caughtT < 0) {
      local.pantT -= dt;
      if (local.pantT <= 0) {
        local.pantT = 1;
        playPant();
        if (CFG.sprint.pantRadius > 0) noise.emit(player.head.x, player.head.z, CFG.sprint.pantRadius, 'breath');
      }
    }
  },
};
