// Sounds of W2a (synthesised, through the game's shared bus): a can clattering and rolling, a
// bottle breaking, the radio's jingle and chatter, the house phone, the breaker's clack, the guard's
// «Ай!». Kept apart from audio.js on purpose (W16 replaces them with samples).
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

// a tin can: a bright clank, a few bounces, a short roll
export function playCan(pos, occluded, k = 1) {
  oneShot(pos, occluded, 1.4, (c, dst, t) => {
    for (const [d, g] of [[0, 0.32], [0.14, 0.2], [0.26, 0.12], [0.34, 0.07]]) {
      tone(c, dst, t + d, 'square', 1900 + Math.random() * 300, 1500, 0.05, g * k);
      burst(c, dst, t + d, 0.05, 'highpass', 3500, 0.8, g * 0.7 * k);
    }
    burst(c, dst, t + 0.4, 0.9, 'bandpass', 2400, 6, 0.05 * k, 0.05);   // rolling
  });
}
// a bottle smashing
export function playBottle(pos, occluded) {
  oneShot(pos, occluded, 1.2, (c, dst, t) => {
    tone(c, dst, t, 'sine', 120, 60, 0.08, 0.35);
    for (let i = 0; i < 9; i++) tone(c, dst, t + 0.02 + i * 0.035 + Math.random() * 0.03, 'sine', 3000 + Math.random() * 3500, 2500, 0.08, 0.12);
    burst(c, dst, t, 0.5, 'highpass', 4000, 0.7, 0.3);
  });
}
// the breaker's heavy clack
export function playBreaker(pos, occluded) {
  oneShot(pos, occluded, 0.5, (c, dst, t) => {
    tone(c, dst, t, 'square', 180, 90, 0.06, 0.3);
    burst(c, dst, t, 0.08, 'lowpass', 1600, 0.8, 0.35);
  });
}
// a device's switch / a handset picked up
export function playSwitch(pos, occluded) {
  oneShot(pos, occluded, 0.3, (c, dst, t) => { tone(c, dst, t, 'square', 900, 700, 0.03, 0.12); burst(c, dst, t, 0.03, 'highpass', 3000, 0.7, 0.1); });
}
// the house phone: two rings (one call of the ring cadence)
export function playHouseRing(pos, occluded) {
  oneShot(pos, occluded, 1.6, (c, dst, t) => {
    for (const r of [0, 0.5]) for (let k = 0; k < 8; k++) {
      const s = t + r + k * 0.045;
      tone(c, dst, s, 'square', k % 2 ? 720 : 680, k % 2 ? 720 : 680, 0.04, 0.09);
    }
  });
}
// «Ай!» (a can on the head) / grumbling, on the guard's voice
export function playOuch(voice) {
  const c = ready();
  if (!c || !voice || !voice.ok) return;
  const t = c.currentTime, bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
  bp.connect(voice.input);
  tone(c, bp, t, 'sawtooth', 320, 520, 0.12, 0.4, 0.01);
  tone(c, bp, t + 0.12, 'sawtooth', 520, 240, 0.25, 0.35);
}

// The radio: a loop of a cheesy jingle and a presenter's chatter while it plays (positional).
export class RadioVoice {
  constructor() { this.v = null; this.t = 0; this.i = 0; }
  start(pos) {
    if (!ready()) return;
    if (!this.v) this.v = new Voice3D(1.1, true);
    if (!this.v.ok) { this.v = null; return; }
    this.v.setPos(pos.x, pos.y, pos.z);
    this.t = 0; this.i = 0;
  }
  setOccluded(occ) { if (this.v) this.v.setOccluded(occ); }
  // every frame while playing: one bar of music or a phrase of chatter each 0.5 s
  update(dt) {
    const c = ready();
    if (!c || !this.v) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const t = c.currentTime, dst = this.v.input, n = this.i++ % 16;
    if (n < 10) {   // the jingle: an "oompah" bass and a three-note tune
      const tune = [523, 659, 784, 659, 587, 698, 880, 698, 523, 784];
      tone(c, dst, t, 'triangle', n % 2 ? 196 : 131, n % 2 ? 196 : 131, 0.22, 0.18);
      tone(c, dst, t + 0.25, 'square', tune[n], tune[n], 0.2, 0.05);
      burst(c, dst, t + 0.25, 0.04, 'highpass', 6000, 0.7, 0.05);
    } else {        // the presenter
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 3; bp.connect(dst);
      for (let k = 0; k < 3; k++) { const f = 160 + Math.random() * 70; tone(c, bp, t + k * 0.15, 'sawtooth', f, f * 1.1, 0.12, 0.22, 0.02); }
    }
  }
  stop() { if (this.v) { this.v.dispose(); this.v = null; } }
}
