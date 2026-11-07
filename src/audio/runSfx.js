// Running sounds (synthesised, through the game's shared bus): your own running steps, the heavy
// breathing while out of breath, the shoulder against a door. Kept apart from audio.js on purpose.
import { audioContext, Voice3D } from './audio.js';

let buf = null;
const ready = () => { const c = audioContext(); return c && c.state === 'running' ? c : null; };
function noiseBuf(c) {
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}
function env(c, dst, t, attack, dur, gain) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  g.connect(dst);
  return g;
}
function burst(c, dst, t, dur, type, freq, q, gain, attack = 0.004) {
  const s = c.createBufferSource(), f = c.createBiquadFilter();
  s.buffer = noiseBuf(c); s.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  s.connect(f).connect(env(c, dst, t, attack, dur, gain));
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function thump(c, dst, t, f0, f1, dur, gain) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(c, dst, t, 0.004, dur, gain));
  o.start(t); o.stop(t + dur + 0.05);
}
function oneShot(pos, seconds, build) {
  const c = ready();
  if (!c) return;
  const v = new Voice3D(1, !!pos);
  if (!v.ok) return;
  if (pos) v.setPos(pos.x, pos.y, pos.z);
  build(c, v.input, c.currentTime);
  setTimeout(() => v.dispose(), (seconds + 0.5) * 1000);
}

// your own running step: a heavy thump and a scuff
export function playRunStep() {
  oneShot(null, 0.3, (c, dst, t) => {
    thump(c, dst, t, 85, 42, 0.12, 0.32);
    burst(c, dst, t, 0.07, 'lowpass', 900, 0.7, 0.18);
  });
}
// one breath while out of breath (in and out)
export function playPant() {
  oneShot(null, 0.9, (c, dst, t) => {
    burst(c, dst, t, 0.32, 'bandpass', 1300, 1.2, 0.09, 0.08);
    burst(c, dst, t + 0.4, 0.38, 'bandpass', 900, 1.0, 0.11, 0.06);
  });
}
// the shoulder hits a door
export function playShoulder(pos) {
  oneShot(pos, 0.5, (c, dst, t) => {
    thump(c, dst, t, 110, 45, 0.22, 0.5);
    burst(c, dst, t, 0.12, 'lowpass', 1200, 0.7, 0.3);
  });
}
