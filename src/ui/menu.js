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
      grid.append(
        this.btn(S.menu.resume, () => h.resume(), 'primary wide'),
        this.btn(S.menu.home, () => h.home()),
        this.btn(S.menu.newRound, () => h.newRound()),
        this.btn(S.menu.title.contract, () => this.go('contract')),
        this.btn(S.shop.button, () => this.go('shop')),
        this.btn(S.lurkers.title, () => this.go('lurkers')),   // W7
        this.btn(S.notes.title, () => this.go('papers')),
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
      if (I.lock) { const lock = document.createElement('p'); lock.className = 'pm-note wide'; lock.textContent = I.lock; grid.append(lock); }
      // W7: the customer's lines (italic) and the crew's (yellow) above the brief
      const story = document.createElement('p');
      story.className = 'pm-info wide pm-story';
      if (I.story) {
        const i = document.createElement('i'); i.textContent = I.story.lines.join(' '); story.append(i);
        if (I.story.crew) { const c = document.createElement('span'); c.className = 'pm-crew'; c.textContent = ' ' + I.story.crew; story.append(c); }
      }
      grid.append(row);
      if (I.story) grid.append(story);
      grid.append(brief,
        this.btn(S.board.difficulty(I.diffName), () => { h.difficultyNext(); this.render(); }, 'wide', !can));
      if (!can) {
        const why = document.createElement('p');
        why.className = 'pm-note wide';
        why.textContent = S.menu.changeWhen;
        grid.append(why);
      }
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    } else if (this.page === 'lurkers') {
      // W7: Тихарник — every card; met: three lines, else «???»
      const L = h.lurkers();
      const cnt = document.createElement('p'); cnt.className = 'pm-info wide'; cnt.textContent = S.lurkers.met(L.met.n, L.met.total);
      grid.append(cnt);
      for (const c of L.cards) {
        const row = document.createElement('div');
        row.className = 'pm-shop wide pm-card-lurker' + (c.met ? '' : ' soon');
        row.dataset.lurker = c.id;
        const t = document.createElement('div'); t.className = 'pm-shop-text';
        const b = document.createElement('b'); b.textContent = c.name; t.append(b);
        const Lb = S.lurkers.labels;
        for (const line of c.met ? [`${Lb.wants}: ${c.wants}`, `${Lb.warns}: ${c.warns}`, `${Lb.avoid}: ${c.avoid}`] : [S.lurkers.lockedHint]) { const e = document.createElement('span'); e.textContent = line; t.append(e); }
        row.append(t); grid.append(row);
      }
      if (L.noMic) { const n = document.createElement('p'); n.className = 'pm-note wide'; n.textContent = S.lurkers.noMic; grid.append(n); }
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    } else if (this.page === 'papers') {
      // W7: «Папери» — the notes found
      const P = h.papers();
      const cnt = document.createElement('p'); cnt.className = 'pm-info wide'; cnt.textContent = P.rows.length ? S.notes.count(P.count.n, P.count.total) : S.notes.empty;
      grid.append(cnt);
      for (const r of P.rows) {
        const row = document.createElement('div'); row.className = 'pm-shop wide'; row.dataset.note = r.id;
        const t = document.createElement('div'); t.className = 'pm-shop-text';
        const b = document.createElement('b'); b.textContent = `«${r.text}»`;
        const e = document.createElement('span'); e.textContent = r.where;
        t.append(b, e); row.append(t); grid.append(row);
      }
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    } else if (this.page === 'shop') {
      // the shop (W3): one row per upgrade; buying only before the clock starts
      const purse = document.createElement('p');
      purse.className = 'pm-info wide pm-wallet';
      purse.textContent = h.walletText();
      grid.append(purse);
      for (const r of h.shopRows()) {
        const row = document.createElement('div');
        row.className = 'pm-shop wide' + (r.state === 'owned' ? ' owned' : r.state === 'soon' ? ' soon' : '');
        const t = document.createElement('div');
        t.className = 'pm-shop-text';
        const b = document.createElement('b'); b.textContent = r.name;
        const e = document.createElement('span'); e.textContent = r.effect;
        t.append(b, e);
        const btn = this.btn(r.button, () => { h.buy(r.id); this.render(); }, 'pm-buy', !r.enabled);
        btn.dataset.upgrade = r.id;
        row.append(t, btn);
        grid.append(row);
      }
      if (I.phase !== 'ready') {
        const why = document.createElement('p');
        why.className = 'pm-note wide';
        why.textContent = S.shop.onlyAtVan;
        grid.append(why);
      }
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    } else {
      for (const key of ['look', 'breath', 'hud', 'fx', 'quality', 'fps', 'gyro']) {
        grid.append(this.btn(h.label(key), () => { h.cycle(key); this.render(); }, 'small'));
      }
      // brightness: − «Яскравість: n/5» +, «Надворі», and the phone-brightness hint
      const row = document.createElement('div');
      row.className = 'pm-row wide';
      const val = document.createElement('div');
      val.className = 'pm-contract';
      val.textContent = h.brightLabel();
      row.append(this.btn('−', () => { h.bright(-1); this.render(); }, 'step'), val, this.btn('+', () => { h.bright(1); this.render(); }, 'step'));
      const hint = document.createElement('p');
      hint.className = 'pm-info wide';
      hint.textContent = S.bright.hintPhone;
      grid.append(row, this.btn(h.outdoorLabel(), () => { h.outdoor(); this.render(); }, 'wide'), hint);
      grid.append(this.btn(S.tutorial.again, () => h.tutorial(), 'small'), this.btn(S.progress.button, () => h.toProgress(), 'small'),
        this.btn(S.privacy.menu, () => h.privacy(), 'quiet wide'));
      grid.append(this.btn(S.menu.back, () => this.go('main'), 'quiet wide'));
    }
    card.append(head, grid);
    this.root.replaceChildren(card);
  }
}
