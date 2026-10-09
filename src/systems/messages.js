// Short messages on the wrist / phone HUD (flash) and the phone's vibration / edge flashes (fx).
import { G } from './state.js';

// phone feedback (vibration / edge flash), set up with the touch controls; a no-op in VR and on a PC
export const fx = (name) => { if (G.feedback) G.feedback.play(name); };

export function flash(text, seconds = 2, color = '#ffd166') { G.flashText = text; G.flashT = seconds; G.flashColor = color; G.wristTimer = 0; }

export const messages = {
  id: 'messages',
  frame(dt) { G.flashT -= dt; },
};
