// Stats for the wrist / debug overlay and the report: FPS, draw calls, GPU / CPU time, the battery,
// per-minute frame stats. The F key / X button toggles the FPS read-out; V / the left stick the vignette.
import { FrameStats } from '../debug/report.js';
import { GpuTimer } from '../perf/gpuTimer.js';
import { G, $, params } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

export function toggleStats() { G.wrist.showFps = !G.wrist.showFps; G.wristTimer = 0; }
export function cycleVignette() {
  const l = G.comfort.cycleLevel();
  $('vignette').value = l.id;
  flash(S.messages.vignette(l.label));
}

export const stats = {
  id: 'stats',
  init() {
    const { quality } = G;
    G.perf = { fps: 0, frames: 0, since: performance.now(), calls: 0, tris: 0 };
    const frameStats = G.frameStats = new FrameStats();   // for the report: last 60 s and per minute
    // phone: each minute also says which preset / pixel ratio / cap it ran with (heat shows as falling FPS)
    if (quality) frameStats.tag = () => ({ q: quality.preset, pr: quality.pr, cap: quality.cap });
    // battery at the start and now (Chrome on Android; §5.2 p. 10: 3 rounds in a row)
    const battery = G.battery = { start: null, now: null, charging: null };
    if (G.PHONE && navigator.getBattery) navigator.getBattery().then((b) => {
      battery.start = Math.round(b.level * 100); battery.charging = b.charging;
      const upd = () => { battery.now = Math.round(b.level * 100); battery.charging = b.charging; };
      upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
    }).catch(() => {});
    G.debugEl = $('debug');
    G.wrist.showFps = params.has('fps');
    G.gpu = new GpuTimer(G.renderer.getContext());
    G.cpu = { sum: 0, n: 0, ms: null };
  },
};
