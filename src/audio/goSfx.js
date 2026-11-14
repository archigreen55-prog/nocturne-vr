// The sound of the round's start («ПІШЛИ!»): three soft knocks and a bell. Synthesised, through the shared bus like the
// yard's sounds (audio/placeSfx.js) and under the same microphone rule: the caller passes placeK(mic), a sound from a speaker
// is quieter, so it is not taken for your voice.
import { audioContext, Voice3D } from './audio.js';
import { CFG } from '../config/index.js';

let buf = null;
const noiseBuf = (c) => {
  if (!buf) { buf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return buf;
};
const env = (c, dst, t, attack, dur, gain) => {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  g.connect(dst);
  return g;
};
function knock(c, dst, t, gain) {   // a low wooden thump: a falling sine and a short dull tick
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  o.connect(env(c, dst, t, 0.004, 0.14, 0.5 * gain)); o.start(t); o.stop(t + 0.2);
  const s = c.createBufferSource(), f = c.createBiquadFilter(); s.buffer = noiseBuf(c); f.type = 'lowpass'; f.frequency.value = 900;
  s.connect(f).connect(env(c, dst, t, 0.002, 0.05, 0.25 * gain)); s.start(t, Math.random() * 0.5); s.stop(t + 0.1);
}
function bell(c, dst, t, gain) {   // a clear bell: the note, a fifth above it and an octave
  [[784, 1], [1176, 0.45], [1568, 0.3]].forEach(([f, a]) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(env(c, dst, t, 0.005, 1.2 / (1 + (f > 800 ? 0.4 : 0)), 0.3 * a * gain)); o.start(t); o.stop(t + 1.4);
  });
}

// k: the microphone rule's gain (placeK(G.mic)); nothing when the audio is not running
export function playGo(k = 1) {
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const v = new Voice3D(Math.max(0, k), false);
  if (!v.ok) return;
  const S = CFG.start.sound, t = c.currentTime + 0.02, g = S.gain;
  for (const dt of S.knocks) knock(c, v.input, t + dt, g);
  bell(c, v.input, t + S.bellAt, g);
  setTimeout(() => v.dispose(), 3000);
}
