// Short messages on the wrist / phone HUD (flash) and the phone's vibration / edge flashes (fx).
import { G } from './state.js';

// phone feedback (vibration / edge flash), set up with the touch controls; a no-op in VR and on a PC
export const fx = (name) => { if (G.feedback) G.feedback.play(name); };

// W17 S4 (decision 10): the old colours the systems pass map to the palette's meanings — no green («done»
// is paper), yellow and orange are the lamp, red is the alarm
const OLD = { '#5fd38d': '#efe6d4', '#ffd166': '#ffb347', '#ff9f43': '#ffb347', '#ff5c5c': '#ff5468', '#ff4d4d': '#ff5468', '#7fc8ff': '#7fd0ff', '#93a1b8': '#9aa7bf' };
export function flash(text, seconds = 2, color = '#ffb347') { G.flashText = text; G.flashT = seconds; G.flashColor = OLD[color] || color; G.wristTimer = 0; }

export const messages = {
  id: 'messages',
  frame(dt) { G.flashT -= dt; },
};
