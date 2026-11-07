// Sounds of W2b's traps (synthesised, through the game's shared bus): a slip and a thud, marbles
// scattering, a bucket on a head, an alarm clock, a fall over a rope. Apart from audio.js on purpose
// (W16 replaces them with samples).
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
function burst(c, dst, t, dur, type, freq, q, gain, attack = 0.003) {
  const s = c.createBufferSource(), f = c.createBiquadFilter();
  s.buffer = noiseBuf(c); s.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  s.connect(f).connect(env(c, dst, t, attack, dur, gain));
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(c, dst, t, type, f0, f1, dur, gain, attack = 0.005) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(c, dst, t, attack, dur, gain));
  o.start(t); o.stop(t + dur + 0.05);
}
function oneShot(pos, occluded, seconds, build) {
  const c = ready();
  if (!c) return;
  const v = new Voice3D(1, !!pos);
  if (!v.ok) return;
  if (pos) v.setPos(pos.x, pos.y, pos.z);
  v.setOccluded(!!occluded);
  build(c, v.input, c.currentTime);
  setTimeout(() => v.dispose(), (seconds + 0.5) * 1000);
}

// a slip (a squeak and a whoosh) and the body hitting the floor
export function playSlip(pos, occluded) {
  oneShot(pos, occluded, 1.0, (c, dst, t) => {
    tone(c, dst, t, 'sine', 900, 1800, 0.12, 0.12);
    burst(c, dst, t + 0.05, 0.25, 'bandpass', 1500, 1.5, 0.12, 0.05);
    tone(c, dst, t + 0.32, 'sine', 90, 40, 0.25, 0.5);
    burst(c, dst, t + 0.32, 0.18, 'lowpass', 700, 0.7, 0.35);
  });
}
// marbles scattering on a wooden floor
export function playMarbles(pos, occluded) {
  oneShot(pos, occluded, 1.6, (c, dst, t) => {
    for (let i = 0; i < 18; i++) tone(c, dst, t + i * 0.05 + Math.random() * 0.04, 'sine', 2600 + Math.random() * 1800, 2400, 0.03, 0.05);
    tone(c, dst, t + 0.2, 'sine', 90, 40, 0.25, 0.4);
  });
}
// a bucket on a head: a hollow clang
export function playBucket(pos, occluded) {
  oneShot(pos, occluded, 1.2, (c, dst, t) => {
    for (const f of [420, 610, 890]) tone(c, dst, t, 'triangle', f, f * 0.97, 0.9, 0.12);
    burst(c, dst, t, 0.08, 'highpass', 3000, 0.7, 0.2);
  });
}
// a fall over a rope: a thud on the knees
export function playTrip(pos, occluded) {
  oneShot(pos, occluded, 0.6, (c, dst, t) => { tone(c, dst, t, 'sine', 110, 50, 0.2, 0.45); burst(c, dst, t, 0.12, 'lowpass', 900, 0.7, 0.3); });
}
// one burst of an alarm clock's bell
export function playAlarmClock(pos, occluded) {
  oneShot(pos, occluded, 1.2, (c, dst, t) => {
    for (let k = 0; k < 16; k++) tone(c, dst, t + k * 0.045, 'square', k % 2 ? 2100 : 1900, k % 2 ? 2100 : 1900, 0.035, 0.05);
  });
}
