// Pause menu for the phone (plan-phone-mode §1.7 B): the ❚❚ button, a minimised page, a phone call or
// a notification all end up here, and the game waits behind it. Three small pages (main, contract,
// settings) so that it fits a landscape phone without scrolling; whatever does not fit scrolls.
// Every button is a bindPress button: it fires when the finger is lifted over it, held however long.
// The wording of the options lives in main.js (h.label), the same settings are on the start screen.
import { bindPress } from './press.js';
import { fmtTime, money } from './board.js';
import { S } from '../i18n/index.js';

const REASONS = {
  user: '',
  hidden: S.menu.reason.hidden,
  blur: S.menu.reason.blur,
  audio: S.menu.reason.audio,
};

export class PauseMenu {
  // h: { info(), label(key), cycle(key), resume(), home(), newRound(), toStart(), toMic(), report(), contractStep(±1), difficultyNext(),
  //      tutorial(), toProgress(), privacy() }
  constructor(root, h) {
    this.root = root; this.h = h;
    this.page = 'main'; this.reason = 'user';
    root.hidden = true;
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen() { return !this.root.hidden; }

  open(reason = 'user') {
    this.reason = reason; this.page = 'main';
    this.root.hidden = false;
    this.render();
  }
  close() { this.root.hidden = true; }
  go(page) { this.page = page; this.render(); }
  refresh() { if (this.isOpen) this.render(); }

  btn(label, fn, cls = '', disabled = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pm-btn ' + cls;
    b.textContent = label;
    if (disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
    bindPress(b, fn);
    return b;
  }

  render() {
    const h = this.h, I = h.info();
    const card = document.createElement('div');
    card.className = 'pm-card';
    const head = document.createElement('div');
    head.className = 'pm-head';
    const title = document.createElement('h2');
    title.textContent = this.page === 'main' ? S.menu.title.main : this.page === 'contract' ? S.menu.title.contract : S.menu.title.settings;
    head.append(title);
    const grid = document.createElement('div');
    grid.className = 'pm-grid scroll';
    if (this.page === 'main') {
      const note = document.createElement('p');
      note.className = 'pm-note';
      note.textContent = REASONS[this.reason] || '';
      if (note.textContent) head.append(note);
      const info = document.createElement('p');
      info.className = 'pm-info';
      info.textContent = S.menu.info(I.contractName, I.diffName, I.phase === 'ready' ? S.menu.beforeStart : I.phase === 'result' ? S.menu.roundOver : fmtTime(I.clock), money(I.vanSum));
      head.append(info);
      const mic = document.createElement('p');
      mic.className = 'pm-info';
      mic.textContent = I.micText;
      head.append(mic);
      grid.append(
        this.btn(S.menu.resume, () => h.resume(), 'primary wide'),
        this.btn(S.menu.home, () => h.home()),
        this.btn(S.menu.newRound, () => h.newRound()),
        this.btn(S.menu.title.contract, () => this.go('contract')),
        this.btn(S.menu.title.settings, () => this.go('settings')),
        this.btn(S.menu.mic, () => h.toMic()),
        this.btn(S.menu.report, () => h.report()),
        this.btn(S.menu.toStart, () => h.toStart(), 'quiet wide'),
      );
    } else if (this.page === 'contract') {
      const can = I.canChange;
      const row = document.createElement('div');
      row.className = 'pm-row wide';
      const name = document.createElement('div');
      name.className = 'pm-contract';
      name.textContent = I.contractName;
      row.append(this.btn('◀', () => { h.contractStep(-1); this.render(); }, 'step', !can), name, this.btn('▶', () => { h.contractStep(1); this.render(); }, 'step', !can));
      const brief = document.createElement('p');
      brief.className = 'pm-info wide';
      brief.textContent = S.menu.brief(I.brief, I.goalText, I.bonusText);
      grid.append(row, brief,
        this.btn(S.board.difficulty(I.diffName), () => { h.difficultyNext(); this.render(); }, 'wide', !can));
      if (!can) {
        const why = document.createElement('p');
        why.className = 'pm-note wide';
        why.textContent = S.menu.changeWhen;
        grid.append(why);
      }
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    } else {
      for (const key of ['look', 'breath', 'hud', 'fx', 'quality', 'fps', 'gyro']) {
        grid.append(this.btn(h.label(key), () => { h.cycle(key); this.render(); }, 'small'));
      }
      grid.append(this.btn(S.tutorial.again, () => h.tutorial(), 'small'), this.btn(S.progress.button, () => h.toProgress(), 'small'),
        this.btn(S.privacy.menu, () => h.privacy(), 'quiet wide'));
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    }
    card.append(head, grid);
    this.root.replaceChildren(card);
  }
}
