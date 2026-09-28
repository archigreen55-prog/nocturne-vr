// One shared AudioContext (microphone analysis, scream replay, synthesised sounds). Browsers only
// let it run after a user gesture, so unlock() is called from clicks and from Enter VR.
// All sounds are synthesised (no files). Positional sounds go through an HRTF panner; behind walls
// or closed doors they are muffled (low-pass + quieter).
let ctx = null;
let master = null;
let noiseBuf = null;

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function unlockAudio() {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

const ready = () => ctx && ctx.state === 'running';

// Listener = the player's head (x, y, z) looking along yaw (three.js convention).
export function setListener(x, y, z, yaw) {
  if (!ready()) return;
  const L = ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw), t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
    L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t);
    L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
  } else {
    L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

// A sound source in the world: input -> muffle (low-pass) -> gain -> HRTF panner -> out.
export class Voice3D {
  constructor(gain = 1, positional = true) {
    this.ok = !!audioContext();
    if (!this.ok) return;
    this.input = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    this.base = gain;
    this.input.connect(this.lp).connect(this.out);
    this.panner = null;
    if (positional) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 1.2;
      this.panner.rolloffFactor = 1.3;
      this.panner.maxDistance = 40;
      this.out.connect(this.panner).connect(master);
    } else this.out.connect(master);
    this.occluded = false;
  }
  setPos(x, y, z) {
    if (!this.ok || !this.panner) return;
    const p = this.panner, t = ctx.currentTime;
    if (p.positionX) { p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t); }
    else p.setPosition(x, y, z);
  }
  // behind a wall: muffled and quieter (plan §7: low-pass + -12 dB)
  setOccluded(occ) {
    if (!this.ok || occ === this.occluded) return;
    this.occluded = occ;
    const t = ctx.currentTime;
    this.lp.frequency.setTargetAtTime(occ ? 650 : 20000, t, 0.05);
    this.out.gain.setTargetAtTime(occ ? this.base * 0.25 : this.base, t, 0.05);
  }
  dispose() { if (this.ok) this.out.disconnect(); }
}

// One-shot positional sound: creates a temporary voice, calls build(voice.input, t), frees it later.
function oneShot(pos, occluded, seconds, gain, build) {
  if (!ready()) return;
  const v = new Voice3D(gain, !!pos);
  if (pos) v.setPos(pos.x, pos.y, pos.z);
  v.setOccluded(!!occluded);
  build(v.input, ctx.currentTime);
  setTimeout(() => v.dispose(), (seconds + 0.5) * 1000);
}
function noise(dst, t, dur, type, freq, q, gain, attack = 0.003) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(f).connect(g).connect(dst);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone(dst, t, type, f0, f1, dur, gain, attack = 0.005) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(dst);
  o.start(t); o.stop(t + dur + 0.05);
}

// Door hinge creak, continuous: a wobbling low saw through a band-pass whose loudness and pitch
// follow the swing speed (set() every frame; silent at 0). One per moving door, positional.
export class CreakVoice {
  constructor() {
    this.v = new Voice3D(1);
    this.ok = this.v.ok && !!ctx;
    if (!this.ok) return;
    this.o = ctx.createOscillator();
    this.o.type = 'sawtooth';
    this.o.frequency.value = 90;
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 22;
    this.lfo.connect(lg).connect(this.o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.o.connect(bp).connect(this.g).connect(this.v.input);
    this.o.start(); this.lfo.start();
    this.idle = 0;
  }
  // loud 0..1; returns false once it has been silent long enough to be dropped
  set(loud, pos, occluded, dt) {
    if (!this.ok || !ready()) return true;
    const t = ctx.currentTime;
    this.v.setPos(pos.x, pos.y, pos.z);
    this.v.setOccluded(occluded);
    this.g.gain.setTargetAtTime(loud > 0 ? 0.03 + 0.22 * loud : 0, t, 0.03);
    this.o.frequency.setTargetAtTime(80 + 80 * loud, t, 0.05);
    this.idle = loud > 0 ? 0 : this.idle + dt;
    return this.idle < 1.5;
  }
  stop() {
    if (!this.ok) return;
    try { this.o.stop(); this.lfo.stop(); } catch { /* already stopped */ }
    this.v.dispose();
  }
}

// Soft thud for a locked door.
export function playKnock(pos) {
  oneShot(pos, false, 0.4, 1, (dst, t) => {
    for (const dt of [0, 0.14]) tone(dst, t + dt, 'sine', 120, 55, 0.15, 0.3);
  });
}

// Something hits the floor. strength 0..1.5, heavy: bigger thump.
export function playThud(pos, occluded, strength, heavy) {
  oneShot(pos, occluded, 0.6, 1, (dst, t) => {
    const k = Math.min(1.5, strength);
    tone(dst, t, 'sine', heavy ? 90 : 160, heavy ? 38 : 70, heavy ? 0.35 : 0.18, 0.35 * k);
    noise(dst, t, heavy ? 0.18 : 0.08, 'lowpass', heavy ? 700 : 1800, 0.7, 0.25 * k);
  });
}

// Breaking glass: bright noise burst + ringing shards.
export function playGlass(pos, occluded) {
  oneShot(pos, occluded, 1.2, 1, (dst, t) => {
    noise(dst, t, 0.35, 'highpass', 2500, 0.8, 0.5);
    noise(dst, t, 0.12, 'bandpass', 900, 1, 0.3);
    for (let i = 0; i < 7; i++) {
      const f = 2200 + Math.random() * 3800, d = t + Math.random() * 0.25;
      tone(dst, d, 'sine', f, f * 0.98, 0.3 + Math.random() * 0.5, 0.06);
    }
  });
}

// Patrol footstep (goes through its voice so it is positional and muffled behind walls).
export function playStep(voice, loud = 1) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  noise(voice.input, t, 0.09, 'lowpass', 500 + Math.random() * 200, 0.8, 0.5 * loud);
  tone(voice.input, t, 'sine', 70, 45, 0.08, 0.25 * loud);
}

// Patrol voice: "Hm?" when curious, "Hey!" when it spots you.
export function playGrunt(voice, kind) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = kind === 'alarm' ? 900 : 650; bp.Q.value = 2;
  bp.connect(voice.input);
  if (kind === 'alarm') { tone(bp, t, 'sawtooth', 190, 150, 0.45, 0.55, 0.02); tone(bp, t + 0.05, 'sawtooth', 285, 220, 0.4, 0.25, 0.02); }
  else { tone(bp, t, 'sawtooth', 105, 150, 0.35, 0.45, 0.03); }
}

// Lurker telegraph: scratching and a low growl from the wardrobe, `dur` s.
export function playScratch(voice, dur) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  for (let i = 0; i < Math.floor(dur * 7); i++) noise(voice.input, t + i / 7 + Math.random() * 0.05, 0.08, 'bandpass', 2200 + Math.random() * 1500, 2, 0.35);
  const o = ctx.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = 52;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
  const lg = ctx.createGain(); lg.gain.value = 9;
  lfo.connect(lg).connect(o.frequency);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
  o.connect(lp).connect(g).connect(voice.input);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.2); lfo.stop(t + dur + 0.2);
}

// Lurker lunge: a loud dissonant screech right in the face.
export function playStinger() {
  oneShot(null, false, 1.2, 1, (dst, t) => {
    for (const f of [220, 233, 311, 466, 622]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
      o.connect(g).connect(dst); o.start(t); o.stop(t + 1);
    }
    noise(dst, t, 0.5, 'bandpass', 1800, 0.7, 0.45);
  });
}

// Grab / drop-off feedback (non-positional, quiet).
export function playTick() { oneShot(null, false, 0.1, 1, (dst, t) => tone(dst, t, 'square', 1500, 1200, 0.03, 0.03)); }
export function playCash() {
  oneShot(null, false, 0.6, 1, (dst, t) => { tone(dst, t, 'sine', 880, 880, 0.18, 0.12); tone(dst, t + 0.1, 'sine', 1320, 1320, 0.3, 0.12); });
}
export function playHeartbeat() {
  oneShot(null, false, 0.5, 1, (dst, t) => { tone(dst, t, 'sine', 60, 42, 0.12, 0.45); tone(dst, t + 0.2, 'sine', 55, 40, 0.14, 0.32); });
}

// Siren outside during full alarm (sweeping two-tone, muffled as if from the street).
export class Siren {
  constructor() { this.on = false; this.nodes = null; }
  set(on) {
    if (on === this.on || !ready()) return;
    this.on = on;
    const t = ctx.currentTime;
    if (on) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 720;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.45;
      const lg = ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg).connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 1.5);
      o.connect(lp).connect(g).connect(master);
      o.start(t); lfo.start(t);
      this.nodes = { o, lfo, g };
    } else if (this.nodes) {
      const { o, lfo, g } = this.nodes;
      g.gain.setTargetAtTime(0, t, 0.2);
      o.stop(t + 1); lfo.stop(t + 1);
      this.nodes = null;
    }
  }
}

// ---------- the guard's habits ----------
// Kettle: a low hum, then a whistle (tell for the tea break). Positional; returns nothing.
export function playKettle(pos, occluded, dur, whistleAt, whistleFor) {
  oneShot(pos, occluded, dur + 1, 1, (dst, t) => {
    noise(dst, t, Math.min(dur, whistleAt + whistleFor), 'lowpass', 300, 0.7, 0.08, 1.5);   // water heating
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1700, t + whistleAt);
    o.frequency.linearRampToValueAtTime(2300, t + whistleAt + 1.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
    const lg = ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + whistleAt);
    g.gain.linearRampToValueAtTime(0.1, t + whistleAt + 1); g.gain.setValueAtTime(0.1, t + whistleAt + whistleFor - 0.5);
    g.gain.linearRampToValueAtTime(0, t + whistleAt + whistleFor);
    o.connect(g).connect(dst);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.5); lfo.stop(t + dur + 0.5);
  });
}
// Toilet flush: a falling rush of water.
export function playFlush(pos, occluded) {
  oneShot(pos, occluded, 3.5, 1, (dst, t) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(300, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    src.connect(f).connect(g).connect(dst); src.start(t); src.stop(t + 3.4);
  });
}
// Phone ringing on the guard (two rings), through its voice.
export function playRing(voice) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  for (const r of [0, 1.2]) for (let k = 0; k < 10; k++) {
    const s = t + r + k * 0.05;
    tone(voice.input, s, 'square', k % 2 ? 480 : 440, k % 2 ? 480 : 440, 0.045, 0.05);
  }
}
// Talking on the phone: a short burst of vowel-like babble.
export function playMurmur(voice) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.5;
  bp.connect(voice.input);
  for (let k = 0; k < 4 + Math.floor(Math.random() * 3); k++) {
    const f = 110 + Math.random() * 40, s = t + k * 0.18 + Math.random() * 0.05;
    tone(bp, s, 'sawtooth', f, f * (0.9 + Math.random() * 0.2), 0.14, 0.25, 0.02);
  }
}
export function playYawn(voice) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1.2;
  bp.connect(voice.input);
  tone(bp, t, 'sawtooth', 220, 110, 1.6, 0.35, 0.3);
}
// Radio: squelch, a garbled call, squelch.
export function playRadio(voice) {
  if (!ready() || !voice.ok) return;
  const t = ctx.currentTime;
  noise(voice.input, t, 0.15, 'bandpass', 2500, 1, 0.3);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 4;
  bp.connect(voice.input);
  for (let k = 0; k < 8; k++) tone(bp, t + 0.2 + k * 0.12, 'square', 150 + Math.random() * 60, 140, 0.1, 0.12, 0.01);
  noise(voice.input, t + 1.3, 0.2, 'bandpass', 2500, 1, 0.3);
}
