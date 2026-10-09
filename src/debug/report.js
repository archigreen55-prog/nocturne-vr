// "Скопіювати звіт": what the game knows about this device and session, as JSON to paste into the
// chat with Claude — on a phone there are no DevTools (plan-phone-mode §7.4). The slow parts (device
// model, VR support, microphone permission) are gathered once at start by prepareReport(), so the
// copy itself runs right inside the tap: Safari lets a page write to the clipboard only there.
import { allSettings, PREVIEW } from '../settings.js';
import { bindPress } from '../ui/press.js';
import { S } from '../i18n/index.js';

const RING = 7200;          // frame times kept (~60 s at 120 Hz)
const MINUTES = 30;         // per-minute FPS kept

// Frame times: the last 60 s (average, 1 % low, worst frame) and the average of every minute.
export class FrameStats {
  constructor() {
    this.ms = new Float32Array(RING); this.i = 0; this.n = 0;
    this.minutes = []; this.minFrames = 0; this.minMs = 0; this.minWorst = 0;
  }
  add(ms) {
    if (!(ms > 0) || ms > 1000) return;   // a hidden tab resumes with one huge gap: not a frame
    this.ms[this.i] = ms; this.i = (this.i + 1) % RING; this.n = Math.min(RING, this.n + 1);
    this.minFrames++; this.minMs += ms; this.minWorst = Math.max(this.minWorst, ms);
    if (this.minMs >= 60000) {
      this.minutes.push({ fps: +(this.minFrames * 1000 / this.minMs).toFixed(1), worstMs: Math.round(this.minWorst), ...(this.tag ? this.tag() : {}) });
      if (this.minutes.length > MINUTES) this.minutes.shift();
      this.minFrames = 0; this.minMs = 0; this.minWorst = 0;
    }
  }
  summary() {
    const v = [];
    let sum = 0;
    for (let k = 1; k <= this.n && sum < 60000; k++) { const x = this.ms[(this.i - k + RING) % RING]; v.push(x); sum += x; }
    if (!v.length) return { seconds: 0 };
    const sorted = v.slice().sort((a, b) => a - b);
    const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
    return {
      seconds: +(sum / 1000).toFixed(1), avgFps: +(v.length * 1000 / sum).toFixed(1),
      low1Fps: +(1000 / p99).toFixed(1), worstMs: Math.round(sorted.at(-1)), perMinute: this.minutes.slice(),
    };
  }
}

const cache = { uaData: null, xr: null, micPermission: null };
export const deviceData = () => cache.uaData;   // model / platform version (Chrome), after prepareReport
export async function prepareReport() {
  const jobs = [];
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    jobs.push(navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList'])
      .then((d) => { cache.uaData = { mobile: d.mobile, platform: d.platform, platformVersion: d.platformVersion, model: d.model, browser: (d.fullVersionList || []).map((b) => `${b.brand} ${b.version}`).join(', ') }; }).catch(() => {}));
  }
  cache.xr = navigator.xr ? 'checking' : 'no navigator.xr';
  if (navigator.xr) jobs.push(navigator.xr.isSessionSupported('immersive-vr').then((s) => { cache.xr = s ? 'immersive-vr' : 'no immersive-vr'; }, (e) => { cache.xr = `error: ${e && e.message}`; }));
  if (navigator.permissions && navigator.permissions.query) {
    jobs.push(navigator.permissions.query({ name: 'microphone' }).then((st) => {
      cache.micPermission = st.state;
      st.onchange = () => { cache.micPermission = st.state; };
    }, () => { cache.micPermission = 'unknown'; }));
  }
  await Promise.all(jobs);
}

function glInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    };
  } catch (e) { return { error: String(e) }; }
}

function micInfo(mic) {
  const r = { state: mic.state, error: mic.error || undefined, noMic: mic.noMic, permission: cache.micPermission, calibrated: mic.calibrated, cal: mic.cal };
  r.whisperDb = +mic.whisperDb.toFixed(1); r.shoutDb = +mic.shoutDb.toFixed(1);
  // phone (T3): the game's sound in the microphone, what the game did with the microphone
  if (mic.gameDbFn) {
    r.game = { bleedDb: mic.bleedDb, measured: mic.bleedMeasured, busDb: +mic.gameDb.toFixed(1), raisedByDb: +mic.masking.toFixed(1), whisperNow: +mic.whisperEff.toFixed(1), shoutNow: +mic.shoutEff.toFixed(1) };
    r.covered = mic.covered; r.agc = mic.agc;
  }
  r.permissionLive = mic.permission; r.deviceChanged = mic.deviceChanged; r.device = mic.deviceLabel || undefined; r.events = mic.events;
  if (mic.state === 'on') {
    r.levelDb = +mic.env.toFixed(1); r.level = mic.level; r.problem = mic.problem || undefined;
    try {
      const s = mic.track.getSettings();
      r.track = { label: mic.track.label, muted: mic.track.muted, readyState: mic.track.readyState, sampleRate: s.sampleRate, channelCount: s.channelCount, echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl };
    } catch { /* getSettings is missing on very old browsers */ }
  }
  return r;
}

// ctx: { version, mode, renderer, mic, audio (AudioContext or null), frames: FrameStats, perf, game }
export function buildReport(ctx) {
  const v = window.visualViewport, ac = ctx.audio;
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const report = {
    report: 'nocturne', time: new Date().toISOString(), version: ctx.version, preview: PREVIEW, url: location.pathname + location.search,
    mode: ctx.mode,
    device: {
      ua: navigator.userAgent, uaData: cache.uaData || undefined,
      screen: `${screen.width}x${screen.height}`, dpr: devicePixelRatio, viewport: `${innerWidth}x${innerHeight}`,
      visualViewport: v ? `${Math.round(v.width)}x${Math.round(v.height)}` : undefined,
      orientation: screen.orientation ? screen.orientation.type : (typeof window.orientation === 'number' ? `angle ${window.orientation}` : undefined),
      touchPoints: navigator.maxTouchPoints || 0, pointerCoarse: matchMedia('(pointer: coarse)').matches, anyFinePointer: matchMedia('(any-pointer: fine)').matches,
      standalone, language: navigator.language, memoryGB: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
    },
    webxr: cache.xr,
    gl: glInfo(ctx.renderer),
    audio: ac ? { state: ac.state, sampleRate: ac.sampleRate, baseLatency: ac.baseLatency, outputLatency: ac.outputLatency } : 'not started',
    mic: micInfo(ctx.mic),
    perf: { ...ctx.frames.summary(), drawCalls: ctx.perf.calls, triangles: ctx.perf.tris, gpuMs: ctx.perf.gpuMs, cpuMs: ctx.perf.cpuMs },
    game: ctx.game,
    phone: ctx.screen,   // full screen, wake lock, look speed, breath mode (phone only)
    settings: allSettings(),
    errors: (window.__nocturneErrors || []).slice(-20),
  };
  return JSON.stringify(report, (k, val) => (typeof val === 'number' && !Number.isInteger(val) ? +val.toFixed(3) : val), 1);
}

// Copy inside the tap; a sheet with the text either way (select it by hand if the copy failed).
export function copyReport(text) {
  const sheet = showSheet(text);
  const fail = () => sheet.status(S.report.copyFailed, '#ffd166');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => sheet.status(S.report.copied(text.length), '#5fd38d'), fail);
    } else fail();
  } catch { fail(); }
}

function showSheet(text) {
  const old = document.getElementById('reportsheet');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'reportsheet';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(5,8,16,.85);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  const card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:720px;max-height:100%;display:flex;flex-direction:column;gap:10px;background:#101624;border:1px solid #26314a;border-radius:12px;padding:14px;box-sizing:border-box';
  const status = document.createElement('div');
  status.style.cssText = 'font:600 15px system-ui,sans-serif';
  status.textContent = S.report.copying;
  const ta = document.createElement('textarea');
  ta.readOnly = true; ta.value = text;
  ta.style.cssText = 'flex:1;min-height:200px;width:100%;box-sizing:border-box;background:#0a0f1c;color:#c9d3e3;border:1px solid #26314a;border-radius:8px;font:12px/1.35 ui-monospace,monospace;padding:8px';
  const close = document.createElement('button');
  close.textContent = S.report.close;
  bindPress(close, () => wrap.remove());   // not 'click': the click that follows the finger lifted from «Скопіювати звіт» would land on it
  card.append(status, ta, close);
  wrap.append(card);
  document.body.append(wrap);
  return { status(msg, color) { status.textContent = msg; status.style.color = color; } };
}
