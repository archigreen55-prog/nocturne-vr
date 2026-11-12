// The wrist panel (VR, PC) or the phone HUD, 10 times a second: how visible you are, the goal, the
// guard's line, the microphone, the breath, steps, the room, what you hold, the clock, messages; and
// the debug overlay (F).
import { CFG } from '../config/index.js';
import { progress } from '../game/contracts.js';
import { stealthState } from '../game/stealth.js';
import { mischief } from '../game/mischief.js';
import { listWatchers, houseScale, pickMain } from '../game/watchers.js';
import { G } from './state.js';
import { fx } from './messages.js';
import { S } from '../i18n/index.js';

export const panel = {
  id: 'panel',
  frame(dt, now) {
    const { renderer, hands, loot, drags, player, level, patrol, xrIn, round, mic, breath, alert, perf, gpu, cpu, hud, wrist, debugEl } = G;
    G.wristTimer -= dt;
    if (G.wristTimer <= 0) {
      G.wristTimer = 0.1;   // 10 Hz
      const session = G.inVR && renderer.xr.getSession();
      const held = hands.heldItems()[0];
      const T = loot.tally();
      const dragging = drags.left || drags.right;
      const st = stealthState(player, level, G.guards || patrol);
      if (st.hidden && !G.wasHidden && G.inVR) xrIn.pulse('left', 0.15, 20);   // a small tick: you are hidden
      if (st.hidden && !G.wasHidden && !G.paused) fx('hidden');
      G.wasHidden = st.hidden;
      // The phone HUD's guards panel (game/watchers.js): everybody in G.guards as data; the main card is
      // re-picked no more than once a second (CFG.hud.mainEvery) so it does not jump when two stand
      // equally close (W6: the mansion's two). G.cardGuard stays the main one's id.
      const ws = listWatchers(G.guards, alert, player.head, player.floorY || 0);
      G.cardGuardT = (G.cardGuardT || 0) - 0.1;
      if (G.cardGuardT <= 0 || !ws[G.cardMain]) {
        G.cardGuardT = CFG.hud.mainEvery;
        G.cardMain = pickMain(ws, G.cardMain);
        G.cardGuard = ws[G.cardMain] ? ws[G.cardMain].id : null;
      }
      G.guardLineT -= 0.1;
      // W7: who says it («Петрович: «…»»); the crew's yellow line when the guard is silent (systems/story.js)
      const guardName = (patrol.env.guard && patrol.env.guard.name) || S.guard.name;
      const crew = G.crewLineT > 0 && G.guardLineT <= 0 ? G.crewLine : '';
      const guardText = G.guardLineT > 0 ? S.hud.guardSays(G.guardSaid || G.guardLine, G.guardName) : crew ? S.hud.crewSays(crew.name, crew.line) : CFG.run.showGuard && round.phase !== 'result' ? S.hud.guardDoes(patrol.activity, guardName) : '';
      let goal = round.phase === 'result' ? null : progress(G.contract, T, loot);
      if (G.role === 'guard' && round.phase !== 'result') goal = { text: G.guardHudText(), done: false };   // W15: the guard's line
      if (goal && mischief.score && !G.contract.goal.mischief) goal = { ...goal, text: `${goal.text} · ${S.traps.score(mischief.score)}` };   // W2b: mischief on any contract
      const pnl = {
        stealth: st, goal, guardText,
        vanSum: T.sum, vanCount: T.inVan, speaking: G.speakT >= CFG.mic.normalAfter && !breath.holding,
        door: dragging ? { creak: dragging.door.creak } : null,
        mic, breath, stepsAudible: player.stepsAudible, crouched: player.crouched, virtualCrouch: player.virtualCrouch, run: G.run,
        room: level.roomAt(player.head.x, player.head.z, player.floorY),
        heldItem: held ? { kind: (held.def && held.def.kind) || 'light', damaged: !!held.damaged } : null,   // the phone HUD's icon
        holding: held ? `${held.name}${held.damaged ? S.hud.damagedMark : ''}` : '',
        clock: round.clock, phase: round.phase, alertLevel: alert.level,
        fps: perf.fps, calls: perf.calls, tris: perf.tris, hz: session && session.frameRate ? Math.round(session.frameRate) : 0,
        gpuMs: (perf.gpuMs = gpu.take()), cpuMs: (perf.cpuMs = cpu.n ? (cpu.ms = cpu.sum / cpu.n, cpu.sum = cpu.n = 0, cpu.ms) : cpu.ms),
        msg: G.flashT > 0 ? G.flashText : '', msgColor: G.flashColor,
        guardSpeech: G.guardLineT > 0, crewSpeech: !!crew, stance: player.crouched || player.virtualCrouch ? S.hud.crouched : S.hud.standing,
        // the guards panel: the watchers (data; `main` = the big card), the house scale 0..100 (the more of
        // the heard suspicion and the strongest «seen»; 100 in full alarm) and the heard suspicion itself.
        // Hidden in the human-guard mode (a plan decision: the suspicion there never counts, alert.js
        // manualOnly) and on the summary screen.
        watchers: ws.map((w) => ({ ...w, main: w.i === G.cardMain })),
        house: houseScale(ws, alert),
        suspicion: alert.suspicion,
        susOn: G.role !== 'guard' && !G.humanGuard && round.phase !== 'result',
      };
      if (hud) hud.update(pnl, now); else wrist.draw(pnl);
      debugEl.style.display = wrist.showFps && !G.inVR ? 'block' : 'none';
      if (wrist.showFps) debugEl.textContent = `${perf.fps.toFixed(0)} FPS\ncalls ${perf.calls}  tris ${perf.tris}\npos ${player.head.x.toFixed(1)}, ${player.head.z.toFixed(1)}  h ${player.head.y.toFixed(2)}\npatrol ${patrol.state} ${patrol.x.toFixed(1)}, ${patrol.z.toFixed(1)}  alert ${alert.level} ${alert.suspicion.toFixed(0)}`;
    }
  },
};
