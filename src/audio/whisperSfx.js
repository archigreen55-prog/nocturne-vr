// Шепотун's sounds (W7, story-bible.md §4.3; decision 12 a). Synthesised from noise only: the echo of
// your whisper follows the loudness curve of your whisper (numbers: dB values the microphone measured
// 30 times a second), never the sound itself. No microphone node is ever connected to the speakers;
// nothing is recorded. Apart from audio.js on purpose (W16 may replace them with samples).
import { audioContext, Voice3D } from './audio.js';

let buf = null;
const ready = () => { const c = audioContext(); return c && c.state === 'running' ? c : null; };
function noiseBuf(c) {
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}
// What the last echo was made of (for the tests and the report): always 'noise' + the curve's length
export const whisperInfo = { last: null, count: 0 };

// noise -> a «ш» band (high pass + a wandering band pass) -> a gain following `curve` (0..1)
function hiss(c, dst, t, dur, curve, gain) {
  const s = c.createBufferSource(), hp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(c); s.loop = true;
  hp.type = 'highpass'; hp.frequency.value = 1400;
  bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(2600, t);
  for (let k = 1; k <= 6; k++) bp.frequency.linearRampToValueAtTime(2200 + Math.random() * 1800, t + (dur * k) / 6);   // «syllables»
  g.gain.setValueAtTime(0, t);
  const n = curve.length;
  for (let i = 0; i < n; i++) g.gain.linearRampToValueAtTime(Math.max(0.0001, curve[i] * gain), t + 0.03 + (dur * (i + 1)) / n);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
  s.connect(hp).connect(bp).connect(g).connect(dst);
  s.start(t, Math.random()); s.stop(t + dur + 0.25);
}
function oneShot(pos, occluded, seconds, build) {
  const c = ready();
  if (!c) return false;
  const v = new Voice3D(1, !!pos);
  if (!v.ok) return false;
  if (pos) v.setPos(pos.x, pos.y, pos.z);
  v.setOccluded(!!occluded);
  build(c, v.input, c.currentTime);
  setTimeout(() => v.dispose(), (seconds + 0.6) * 1000);
  return true;
}

// the telegraph: «ш-ш-ш» from the grate, three short breaths (1 s)
export function playShh(pos, occluded) {
  oneShot(pos, occluded, 1.1, (c, dst, t) => {
    for (let i = 0; i < 3; i++) hiss(c, dst, t + i * 0.33, 0.22, [0.6, 1, 0.5], 0.18);
  });
}

// The echo: `env` = the whisper's loudness in dB, 30 values a second (the microphone's numbers, or
// none: a plain whisper of `dur` s). Louder than the whisper (the grate «repeats it louder»).
export function playWhisperEcho(pos, occluded, dur, env = []) {
  const top = env.length ? Math.max(...env) : 0;
  const curve = env.length ? env.map((db) => Math.pow(10, (db - top) / 20)) : [0.5, 0.9, 1, 0.8, 0.95, 0.6];
  whisperInfo.last = { source: 'noise', points: curve.length, dur: +dur.toFixed(2) };
  whisperInfo.count++;
  oneShot(pos, occluded, dur + 0.3, (c, dst, t) => hiss(c, dst, t, dur, curve, 0.55));
}
