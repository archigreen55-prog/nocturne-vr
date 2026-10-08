// The tutorial's bubble (systems/tutorial.js decides what it says): one line of advice, a step counter
// and «Пропустити». Phone: under the clock, clear of the thumbs; PC: above the key hint.
import { bindPress } from './press.js';
import { S } from '../i18n/index.js';

export class TutorialBubble {
  constructor({ phone, onSkip }) {
    const el = this.el = document.createElement('div');
    el.id = 'tutorial';
    el.className = phone ? 'tt-phone' : 'tt-pc';
    el.hidden = true;
    el.innerHTML = '<div class="tt-head"></div><div class="tt-text"></div><button type="button" class="tt-skip"></button>';
    this.head = el.querySelector('.tt-head');
    this.text = el.querySelector('.tt-text');
    this.skip = el.querySelector('.tt-skip');
    this.skip.textContent = phone ? S.tutorial.skip : S.tutorial.skipPc;
    bindPress(this.skip, onSkip);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(el);
    this.shown = '';
  }
  show(head, text) {
    const key = head + '\n' + text;
    if (key !== this.shown) { this.head.textContent = head; this.text.textContent = text; this.shown = key; }
    if (this.el.hidden) this.el.hidden = false;
  }
  hide() { if (!this.el.hidden) { this.el.hidden = true; this.shown = ''; } }
  get visible() { return !this.el.hidden; }
}
