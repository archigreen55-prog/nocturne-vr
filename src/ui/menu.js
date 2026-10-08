// Pause menu for the phone (plan-phone-mode §1.7 B): the ❚❚ button, a minimised page, a phone call or
// a notification all end up here, and the game waits behind it. Three small pages (main, contract,
// settings) so that it fits a landscape phone without scrolling; whatever does not fit scrolls.
// Every button is a bindPress button: it fires when the finger is lifted over it, held however long.
// The wording of the options lives in main.js (h.label), the same settings are on the start screen.
import { bindPress } from './press.js';
import { fmtTime, money } from './board.js';

const REASONS = {
  user: '',
  hidden: 'Ти згорнув сторінку, і гра стала на паузу.',
  blur: 'Гра втратила фокус (дзвінок, сповіщення чи системне вікно) і стала на паузу.',
  audio: 'Систему перервала звук (дзвінок чи сповіщення), гра стала на паузу.',
};

export class PauseMenu {
  // h: { info(), label(key), cycle(key), resume(), home(), newRound(), toStart(), toMic(), report(), contractStep(±1), difficultyNext() }
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
    title.textContent = this.page === 'main' ? 'Пауза' : this.page === 'contract' ? 'Контракт і складність' : 'Налаштування';
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
      info.textContent = `${I.contractName} · ${I.diffName} · ${I.phase === 'ready' ? 'до початку' : I.phase === 'result' ? 'раунд закінчено' : fmtTime(I.clock)} · у фургоні ${money(I.vanSum)}`;
      head.append(info);
      const mic = document.createElement('p');
      mic.className = 'pm-info';
      mic.textContent = I.micText;
      head.append(mic);
      grid.append(
        this.btn('Продовжити', () => h.resume(), 'primary wide'),
        this.btn('До фургона', () => h.home()),
        this.btn('Новий раунд', () => h.newRound()),
        this.btn('Контракт і складність', () => this.go('contract')),
        this.btn('Налаштування', () => this.go('settings')),
        this.btn('Мікрофон і калібрування', () => h.toMic()),
        this.btn('Скопіювати звіт', () => h.report()),
        this.btn('На стартовий екран', () => h.toStart(), 'quiet wide'),
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
      brief.textContent = `${I.brief} ★ ${I.goalText} · ★★ ${I.bonusText} · ★★★ те саме на важкому.`;
      grid.append(row, brief,
        this.btn(`Складність: ${I.diffName}`, () => { h.difficultyNext(); this.render(); }, 'wide', !can));
      if (!can) {
        const why = document.createElement('p');
        why.className = 'pm-note wide';
        why.textContent = 'Контракт і складність змінюються біля фургона до початку раунду (або після нього, у «Новий раунд»).';
        grid.append(why);
      }
      grid.append(this.btn('Назад', () => this.go('main'), 'quiet wide'));
    } else {
      for (const key of ['look', 'breath', 'hud', 'fx', 'quality', 'fps', 'gyro']) {
        grid.append(this.btn(h.label(key), () => { h.cycle(key); this.render(); }, 'small'));
      }
      grid.append(this.btn('Назад', () => this.go('main'), 'quiet wide'));
    }
    card.append(head, grid);
    this.root.replaceChildren(card);
  }
}
