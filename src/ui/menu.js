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
  //      tutorial(), toProgress(), privacy(), bright(±1), brightLabel(), outdoor(), outdoorLabel(),
  //      shopRows(), buy(id), walletText(), lurkers(), papers() }   (W7: Тихарник, «Папери» — game/story.js)
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
    title.textContent = this.page === 'main' ? S.menu.title.main : this.page === 'contract' ? S.menu.title.contract : this.page === 'shop' ? S.shop.title : this.page === 'lurkers' ? S.lurkers.title : this.page === 'papers' ? S.notes.title : S.menu.title.settings;
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
      const purse = document.createElement('p');
      purse.className = 'pm-info pm-wallet';
      purse.textContent = h.walletText();
      head.append(purse);
      // T6 (decision P-T6.1 A): a small pause — the rest (levels, the shop, Тихарник, the microphone) is in the main menu
      grid.append(
        this.btn(S.menu.resume, () => h.resume(), 'primary wide'),
        this.btn(S.menu.home, () => h.home()),
        this.btn(S.menu.title.settings, () => h.settings()),   // the same settings page as the menu's (systems/menu.js settingsOver)
        this.btn(S.menu.toStart, () => h.toStart(), 'quiet wide'),
      );
    }
    card.append(head, grid);
    this.root.replaceChildren(card);
  }
}
