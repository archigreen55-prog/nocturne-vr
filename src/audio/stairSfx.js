// The creak of a stair tread under a running foot (W6, CFG.sprint.stairs.creakEveryStepWhenRunning):
// a short wobbling saw through a band-pass, from the player's own position (not positional).
import { audioContext, Voice3D } from './audio.js';

export function playStairCreak() {
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const v = new Voice3D(1, false);
  if (!v.ok) return;
  const t = c.currentTime, dur = 0.16;
  const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(240 + Math.random() * 80, t);
  o.frequency.linearRampToValueAtTime(170, t + dur);
  f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(f).connect(g).connect(v.input);
  o.start(t); o.stop(t + dur + 0.05);
  setTimeout(() => v.dispose(), 400);
}
