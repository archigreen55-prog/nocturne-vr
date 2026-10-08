// The wrist panel (VR, PC) or the phone HUD, 10 times a second: how visible you are, the goal, the
// guard's line, the microphone, the breath, steps, the room, what you hold, the clock, messages; and
// the debug overlay (F).
import { CFG } from '../config/index.js';
import { roomAt } from '../world/level.js';
import { progress } from '../game/contracts.js';
import { stealthState } from '../game/stealth.js';
import { G } from './state.js';
import { fx } from './messages.js';

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
      const st = stealthState(player, level, patrol);
      if (st.hidden && !G.wasHidden && G.inVR) xrIn.pulse('left', 0.15, 20);   // a small tick: you are hidden
      if (st.hidden && !G.wasHidden && !G.paused) fx('hidden');
      G.wasHidden = st.hidden;
      G.guardLineT -= 0.1;
      const guardText = G.guardLineT > 0 ? `Сторож: «${G.guardLine}»` : CFG.run.showGuard && round.phase !== 'result' ? `Сторож: ${patrol.activity}` : '';
      const pnl = {
        stealth: st, goal: round.phase === 'result' ? null : progress(G.contract, T, loot), guardText,
        vanSum: T.sum, vanCount: T.inVan, speaking: G.speakT >= CFG.mic.normalAfter && !breath.holding,
        door: dragging ? { creak: dragging.door.creak } : null,
        mic, breath, stepsAudible: player.stepsAudible, crouched: player.crouched, virtualCrouch: player.virtualCrouch,
        room: roomAt(player.head.x, player.head.z),
        holding: held ? `${held.name}${held.damaged ? ' (пошкодж.)' : ''}` : '',
        clock: round.clock, phase: round.phase, alertLevel: alert.level,
        fps: perf.fps, calls: perf.calls, tris: perf.tris, hz: session && session.frameRate ? Math.round(session.frameRate) : 0,
        gpuMs: (perf.gpuMs = gpu.take()), cpuMs: (perf.cpuMs = cpu.n ? (cpu.ms = cpu.sum / cpu.n, cpu.sum = cpu.n = 0, cpu.ms) : cpu.ms),
        msg: G.flashT > 0 ? G.flashText : '', msgColor: G.flashColor,
        guardSpeech: G.guardLineT > 0, stance: player.crouched || player.virtualCrouch ? 'Присів' : 'Стоїш',
      };
      if (hud) hud.update(pnl, now); else wrist.draw(pnl);
      debugEl.style.display = wrist.showFps && !G.inVR ? 'block' : 'none';
      if (wrist.showFps) debugEl.textContent = `${perf.fps.toFixed(0)} FPS\ncalls ${perf.calls}  tris ${perf.tris}\npos ${player.head.x.toFixed(1)}, ${player.head.z.toFixed(1)}  h ${player.head.y.toFixed(2)}\npatrol ${patrol.state} ${patrol.x.toFixed(1)}, ${patrol.z.toFixed(1)}  alert ${alert.level} ${alert.suspicion.toFixed(0)}`;
    }
  },
};
