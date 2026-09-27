// One shared AudioContext (microphone analysis + synthesised sounds). Browsers only let it run
// after a user gesture, so unlock() is called from clicks and from Enter VR.
let ctx = null;

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio() {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

// Door creak: a slowly wobbling low saw through a band-pass, ~0.6 s. loud: 0..1.
export function playCreak(loud = 0.5) {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(95, t);
  o.frequency.linearRampToValueAtTime(140, t + 0.25);
  o.frequency.linearRampToValueAtTime(80, t + 0.6);
  const lfo = c.createOscillator();
  lfo.frequency.value = 23;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(o.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05 + 0.12 * loud, t + 0.05);
  g.gain.setTargetAtTime(0, t + 0.45, 0.08);
  o.connect(bp).connect(g).connect(c.destination);
  o.start(t); lfo.start(t);
  o.stop(t + 0.9); lfo.stop(t + 0.9);
}

// Soft thud for a locked door.
export function playKnock() {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  for (const dt of [0, 0.14]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t + dt);
    o.frequency.exponentialRampToValueAtTime(55, t + dt + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.15);
    o.connect(g).connect(c.destination);
    o.start(t + dt); o.stop(t + dt + 0.2);
  }
}
