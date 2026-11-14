// The start of a round, seen and heard: when the clock starts (the phase goes ready -> heist; with friends the host's
// phase comes to everybody) a big «ПІШЛИ!» comes up on a flat screen (phone, PC) with a second line — «Репетиція: часу нема»
// on level 0, «Годинник пішов» elsewhere — and a short sound (three knocks and a bell, under the microphone rule). In VR the
// sound and the wrist's message line (game/round.js) say it; no banner is hung in front of the eyes.
import { G } from './state.js';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';
import { playGo } from '../audio/goSfx.js';
import { placeK } from '../audio/placeSfx.js';

let el = null, text = null, sub = null, prev = null;

function ensure() {
  if (el) return;
  el = document.createElement('div'); el.id = 'gobanner'; el.setAttribute('aria-live', 'polite');
  text = document.createElement('b'); sub = document.createElement('span');
  el.append(text, sub); document.body.appendChild(el);
  el.addEventListener('animationend', () => el.classList.remove('on'));   // gone: the next start plays it again
}

export const goBanner = {
  id: 'goBanner',
  init() { prev = null; },
  frame() {
    const r = G.round;
    if (!r) return;
    const ph = r.phase;
    if (prev === 'ready' && ph === 'heist' && G.active !== false) this.go();
    prev = ph;
  },
  go() {
    try { playGo(placeK(G.mic)); } catch { /* no audio */ }
    if (G.inVR || typeof document === 'undefined') return;
    ensure();
    text.textContent = S.go.go;
    sub.textContent = CFG.round.noClock ? S.go.rehearsal : S.go.clock;
    el.style.setProperty('--go-hold', CFG.start.hold + 's'); el.style.setProperty('--go-total', (CFG.start.hold + CFG.start.fade) + 's');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');   // restart the animation
  },
};
