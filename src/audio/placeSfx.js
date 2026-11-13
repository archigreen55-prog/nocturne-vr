// The dacha's yard sounds (claude/dacha-yard-stage1): a puddle's splash and the place's ambience
// (crickets, wind in the trees, a far car in the lane). The crickets sing in bouts of chirps from a few spots of the yard. Synthesised, through the game's shared bus
// (audio/audio.js `master`), apart from audio.js like the traps' sounds.
//
// The microphone rule (the owner's condition for every new sound): the game listens to you, and a sound
// from a speaker must not be taken for your voice (nor wake the guard). Three layers keep to it:
//   1. Level. Every one-shot here is no louder than the patrol's step in the calibration's «Звуки гри»
//      step (audio.playSampleSounds), the ambience is far under it (tests/placesound.test.mjs measures both
//      on the bus).
//   2. The bus. Everything goes through `master`, so on a phone the microphone already raises its
//      whisper / shout boundaries above the game's own sound (mic.gameInMic, CFG.mic.maskWhisper / maskShout).
//   3. The rule below. With the microphone on and no sign of headphones (the calibration measured the
//      game's bleed at most CFG.placeSound.headphonesBleed, or the player ticked `headphones`), one-shots
//      go at speakerK and the ambience is off. Without a microphone nothing is held back.
import { audioContext, Voice3D } from './audio.js';
import { loadSetting } from '../settings.js';
import { CFG } from '../config/index.js';

// 'none' (no microphone in play) | 'headphones' | 'speaker' (the game's sound may reach the microphone)
export function micRisk(mic) {
  if (!mic || mic.state !== 'on' || mic.noMic) return 'none';
  if (loadSetting('headphones', false) === true) return 'headphones';
  if (mic.bleedMeasured && !mic.deviceChanged && mic.cal.bleed <= CFG.placeSound.headphonesBleed) return 'headphones';
  return 'speaker';
}
// gain of a one-shot sound under the rule; the ambience plays only when this is 1
export const placeK = (mic) => (micRisk(mic) === 'speaker' ? CFG.placeSound.speakerK : 1);
export const ambienceAllowed = (mic) => micRisk(mic) !== 'speaker';

const ready = () => { const c = audioContext(); return c && c.state === 'running' ? c : null; };
let buf = null;
function noiseBuf(c) {
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
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
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(c, dst, t, type, f0, f1, dur, gain, attack = 0.006) {
  const o = c.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(c, dst, t, attack, dur, gain)); o.start(t); o.stop(t + dur + 0.05);
}

// A foot in a puddle: a wet slap and a low «bloop». strength 0..1 (the faster, the louder), pos {x, y, z}.
// `k` is the rule's gain (placeK); a splash is never louder than the patrol's step.
export function playSplash(pos, strength = 0.5, k = 1) {
  const c = ready();
  if (!c) return;
  const v = new Voice3D(Math.max(0, k), true);
  if (!v.ok) return;
  v.setPos(pos.x, pos.y ?? 0.05, pos.z);
  const t = c.currentTime, g = CFG.placeSound.splashGain * (0.7 + 0.3 * Math.min(1, strength));
  burst(c, v.input, t, 0.11, 'bandpass', 1500 + Math.random() * 500, 0.9, 0.45 * g);
  burst(c, v.input, t + 0.02, 0.2, 'highpass', 2800, 0.7, 0.12 * g);
  tone(c, v.input, t + 0.01, 'sine', 240 + Math.random() * 40, 110, 0.16, 0.3 * g);
  setTimeout(() => v.dispose(), 900);
}

// ---------- the ambience ----------
// Three layers on one non-positional voice each; target gains follow the zone and the rule, so a layer
// fades in and out (CFG.placeSound.ambience.fadeTime) and never starts with a click.
export class PlaceAmbience {
  constructor() {
    this.c = null; this.layers = null;
    this.carT = 8;
    this.level = { crickets: 0, wind: 0, traffic: 0 };   // what the last update asked for (tests read it)
  }
  build(c) {
    this.c = c;
    const mk = () => new Voice3D(0, false);
    // crickets: a few of them, each its own positional voice in its own spot; the songs are scheduled in update()
    const CS = CFG.placeSound.crickets, cr = CS.on ? CS.spots.map(([x, z]) => {
      const v = new Voice3D(0, true); v.setPos(x, 0.25, z);
      v.panner.refDistance = CS.refDistance; v.panner.rolloffFactor = CS.rolloff;
      return { v, f: CS.carrier[0] + Math.random() * (CS.carrier[1] - CS.carrier[0]), next: c.currentTime + 0.5 + Math.random() * 4.5 };
    }) : [];
    const crickets = { cr };
    // wind: low noise through a band-pass, breathing
    const wind = mk(); const wsrc = c.createBufferSource(); wsrc.buffer = noiseBuf(c); wsrc.loop = true;
    const wbp = c.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 380; wbp.Q.value = 0.5;
    const wg = c.createGain(); wg.gain.value = 0.6;
    const wl = c.createOscillator(); wl.frequency.value = 0.13; const wd = c.createGain(); wd.gain.value = 0.4; wl.connect(wd).connect(wg.gain);
    wsrc.connect(wbp).connect(wg).connect(wind.input); wsrc.start(); wl.start();
    // traffic: a far rumble, swells when a car passes (set in update)
    const traffic = mk(); const tsrc = c.createBufferSource(); tsrc.buffer = noiseBuf(c); tsrc.loop = true;
    const tlp = c.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 190;
    const tg = c.createGain(); tg.gain.value = 0.35;
    tsrc.connect(tlp).connect(tg).connect(traffic.input); tsrc.start();
    this.layers = { crickets, wind, traffic, tg, tlp };
  }
  // zone: 'yard' | 'lane' | 'house' (inside); allowed: the microphone rule; dt seconds
  update(dt, zone, allowed) {
    const c = ready();
    if (!c) return;
    if (!this.layers) { if (!allowed) return; this.build(c); }
    const A = CFG.placeSound.ambience, L = this.layers, t = c.currentTime;
    const k = allowed ? (zone === 'house' ? 0.25 : 1) : 0, z = zone === 'lane' ? 'lane' : 'yard';
    this.level = { crickets: k * A.crickets[z], wind: k * A.wind[z], traffic: k * A.traffic[z] };
    const tau = A.fadeTime / 3;
    for (const n of ['wind', 'traffic']) L[n].out.gain.setTargetAtTime(this.level[n], t, tau);
    for (const q of L.crickets.cr) q.v.out.gain.setTargetAtTime(this.level.crickets, t, tau);
    if (allowed) for (const q of L.crickets.cr) {
      if (q.next < c.currentTime - 1) q.next = c.currentTime + 0.3 + Math.random() * 4;   // back after the rule had switched the ambience off: not all at once
      if (c.currentTime + 0.25 >= q.next) this.sing(q);   // the next bout, scheduled a little ahead
    }
    // a far car now and then: its rumble swells and fades over a few seconds
    this.carT -= dt;
    if (this.carT <= 0 && allowed) {
      this.carT = A.trafficEvery[0] + Math.random() * (A.trafficEvery[1] - A.trafficEvery[0]);
      const d = 4 + Math.random() * 3;
      L.tg.gain.cancelScheduledValues(t); L.tg.gain.setValueAtTime(0.35, t);
      L.tg.gain.linearRampToValueAtTime(1, t + d * 0.45); L.tg.gain.linearRampToValueAtTime(0.35, t + d);
      L.tlp.frequency.cancelScheduledValues(t); L.tlp.frequency.setValueAtTime(170, t);
      L.tlp.frequency.linearRampToValueAtTime(260, t + d * 0.45); L.tlp.frequency.linearRampToValueAtTime(170, t + d);
    }
  }
  // One bout of one cricket: chirps of a few damped clicks, the bout's loudness swelling in and fading out; then a random pause.
  // The clicks are scheduled ahead on one gain (two close sines = a little roughness, like a real wing's ring).
  sing(q) {
    const c = this.c, S = CFG.placeSound.crickets, R = (r) => r[0] + Math.random() * (r[1] - r[0]), jit = (k) => 1 + (Math.random() - 0.5) * k;
    const t0 = Math.max(c.currentTime + 0.05, q.next), dur = R(S.bout), period = 1 / R(S.chirpRate), n = Math.round(R(S.pulses)), f = q.f * jit(0.03);
    const pg = c.createGain(); pg.gain.value = 0; pg.connect(q.v.input);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
    o1.type = o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 1.011; g2.gain.value = 0.35;
    o1.connect(pg); o2.connect(g2).connect(pg);
    const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    for (let t = 0; t < dur; t += period * jit(0.2)) {
      const bout = smooth(t / S.fadeIn) * smooth((dur - t) / S.fadeOut);
      for (let i = 0; i < n; i++) {
        const tp = t0 + t + i * S.pulseGap * jit(0.2), a = S.peak * bout * (0.55 + 0.45 * (n > 1 ? i / (n - 1) : 1)) * jit(0.24);
        pg.gain.setValueAtTime(0, tp); pg.gain.linearRampToValueAtTime(a, tp + 0.002); pg.gain.setTargetAtTime(0, tp + 0.002, 0.0045);
      }
    }
    o1.start(t0); o2.start(t0); o1.stop(t0 + dur + 0.3); o2.stop(t0 + dur + 0.3);
    o1.onended = () => { try { pg.disconnect(); } catch { /* gone */ } };
    q.next = t0 + dur + R(S.pause);
  }
  // tests: the carriage of one layer's gain right now
  gains() { const L = this.layers; return L ? { crickets: Math.max(0, ...L.crickets.cr.map((q) => q.v.out.gain.value)), wind: L.wind.out.gain.value, traffic: L.traffic.out.gain.value } : null; }
}
