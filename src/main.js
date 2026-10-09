// The game loop. Everything else is a system in src/systems/ (the list and the order of the phases:
// src/systems/index.js); the shared state is G (src/systems/state.js).
import { SYSTEMS, PHASES } from './systems/index.js';
import { G, params } from './systems/state.js';
import { rotateBlocked } from './systems/flatScreen.js';
import { exposeDebugApi } from './systems/debugApi.js';
import { applyTexts } from './i18n/index.js';

applyTexts();   // the start screen's static texts (index.html data-t) from the language file
for (const s of SYSTEMS) if (s.init) s.init();
const hooks = (phase) => SYSTEMS.filter((s) => s[phase]).map((s) => s[phase].bind(s));
const steps = PHASES.map(hooks);
const after = hooks('frame');

// one frame of game logic
function simulate(dt, xrFrame, now) {
  G.simT += dt;
  for (const phase of steps) for (const fn of phase) fn(dt, now, xrFrame);
}

G.last = performance.now();
G.lampT = 0;
function frame(now, xrFrame) {
  const { quality, renderer, scene, camera, gpu, perf, frameStats, comfort, player, cpu } = G;
  // phone: the 30 / 60 cap (a 90 / 120 Hz screen calls this more often)
  if (quality && G.playingDesktop && !G.paused && !G.inVR && now - G.last < 1000 / quality.cap - 2) return;
  const cpuStart = performance.now();
  if (quality && G.playingDesktop && !G.paused && !G.inVR) quality.frame(now - G.last);
  const dt = Math.min(0.1, Math.max(0, (now - G.last) / 1000));
  if (!G.paused) frameStats.add(now - G.last);
  G.last = now;

  if (!rotateBlocked() && !G.paused) simulate(dt, xrFrame, now);   // phone: waits in portrait and behind the pause menu
  comfort.update(dt, player.speed, G.inVR || params.has('vignette'));

  // a paused phone redraws only a few times a second (battery, heat)
  const draw = !G.paused || now - G.lastRender > 150;
  if (draw) {
    G.lastRender = now;
    gpu.poll();
    gpu.begin();
    renderer.render(scene, camera);
    gpu.end();
    perf.calls = renderer.info.render.calls;
    perf.tris = renderer.info.render.triangles;
    perf.frames++;
  }
  if (now - perf.since >= 500) {
    perf.fps = (perf.frames * 1000) / (now - perf.since);
    perf.frames = 0; perf.since = now;
  }
  for (const fn of after) fn(dt, now);   // after the frame is drawn: HUD / wrist, messages, start screen
  cpu.sum += performance.now() - cpuStart; cpu.n++;
}

G.renderer.setAnimationLoop(frame);
if (params.has('autostart')) G.start.play();
exposeDebugApi(simulate);
