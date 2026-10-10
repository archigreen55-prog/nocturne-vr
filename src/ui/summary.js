// Round summary for the phone (plan-phone-mode §1.7 B): the result board as a screen of its own.
// Title and money, the delivered items, what went wrong, the contract stars, the scream replay and
// the buttons. The 3D board still stands at the van for VR and PC; on a phone this takes its place
// once the round is over. Buttons are bindPress buttons (fire on release, however long held).
import { bindPress } from './press.js';
import { fmtTime, money } from './board.js';
import { S } from '../i18n/index.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class Summary {
  // h: { play(), again(), menu(), report() }
  constructor(root, h) {
    this.root = root; this.h = h;
    root.hidden = true;
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen() { return !this.root.hidden; }
  hide() { this.root.hidden = true; this.refs = null; }

  // s: { result, verdict, contractName, difficulty, bonusText, clip, playing, recMode, noMic, income }
  show(s) {
    const R = s.result, V = s.verdict, good = R.kind === 'left' || R.kind === 'escaped';
    const card = el('div', 'sm-card scroll ' + (good ? 'good' : 'bad'));
    // left: title, money, items
    const left = el('div', 'sm-left');
    left.append(el('h2', 'sm-title', R.title));
    left.append(el('div', 'sm-money', good ? money(R.sum) : `−${money(R.lostLoot)}`));
    left.append(el('div', 'sm-sub', good ? S.board.res.kept(R.inVan, R.total, fmtTime(R.time, true)) : S.board.res.lost(fmtTime(R.time, true))));
    if (s.income) left.append(el('div', 'sm-income', s.income));   // the money for the wallet (W3)
    if (s.mischief) left.append(el('div', 'sm-income', s.mischief));   // W2b: mischief points
    if (s.story) { left.append(el('div', 'sm-story', s.story.line)); if (s.story.crew) left.append(el('div', 'sm-crew', s.story.crew)); }   // W2b: the customer and the crew (contract 7)
    const list = el('div', 'sm-list scroll');
    if (!R.list.length) list.append(el('div', 'sm-empty', S.summary.nothing));
    for (const it of R.list) {
      const row = el('div', 'sm-item' + (it.damaged ? ' dmg' : ''));
      row.append(el('span', '', `${it.damaged ? '✗' : '✓'} ${it.name}${it.damaged ? S.hud.damagedMark : ''}`), el('b', '', money(it.value)));
      list.append(row);
    }
    left.append(list);
    const extra = [];
    if (R.broken) extra.push(S.board.res.broken(R.broken));
    if (R.seen) extra.push(S.board.res.seen(R.seen));
    if (R.scares) extra.push(S.board.res.scared(R.scares));
    if (extra.length) left.append(el('div', 'sm-extra', extra.join(' · ')));
    // right: contract, scream, buttons
    const right = el('div', 'sm-right');
    if (V) {
      right.append(el('div', 'sm-contract', s.contractName));
      right.append(el('div', 'sm-stars' + (V.stars ? '' : ' none'), `${'★'.repeat(V.stars)}${'☆'.repeat(3 - V.stars)}`));
      if (V.newBest) right.append(el('div', 'sm-record', S.summary.newBest));
      right.append(el('div', 'sm-sub', V.goal
        ? S.board.res.goalOk(s.bonusText, V.bonus, V.bonus && s.difficulty !== 'hard')
        : S.board.res.goalFail(V.why.join(', '))));
    }
    const scream = el('div', 'sm-scream');
    right.append(scream);
    const row = el('div', 'sm-buttons');
    const mk = (label, fn, cls = '') => { const b = el('button', 'sm-btn ' + cls, label); b.type = 'button'; bindPress(b, fn); return b; };
    const play = mk(S.board.listen, () => this.h.play());
    const again = mk(S.board.res.newRound, () => this.h.again(), 'primary');
    row.append(again, play, mk(S.summary.menu, () => this.h.menu(), 'quiet'), mk(S.summary.report, () => this.h.report(), 'quiet'));
    right.append(row);
    card.append(left, right);
    this.root.replaceChildren(card);
    this.root.hidden = false;
    this.refs = { scream, play, R, last: '' };
    this.update(s);
  }

  // The scream line and its button (changes while the clip plays)
  update(s) {
    if (!this.refs) return;
    const { scream, play, R } = this.refs;
    let text, color;
    if (s.playing && s.clip) { text = S.board.res.screamAt(fmtTime(s.clip.t, true)); color = '#ff9f43'; }
    else if (R.shouts > 0) {
      text = s.clip ? S.board.res.shouts(R.shouts, fmtTime(s.clip.t, true)) : S.board.res.shoutsNoClip(R.shouts, s.recMode || '—');
      color = '#ffb347';
    } else { text = s.noMic ? S.board.mic.noMic : S.board.res.noShouts; color = '#7fc8ff'; }
    const key = text + (s.playing ? '|p' : '') + (s.clip ? '|c' : '');
    if (key === this.refs.last) return;
    this.refs.last = key;
    scream.textContent = text; scream.style.color = color;
    play.textContent = s.playing ? S.board.playing : s.clip && R.shouts > 0 ? S.board.res.listenAgain : S.board.listen;
    const off = !s.clip || s.playing;
    play.disabled = off; play.setAttribute('aria-disabled', String(off));
  }
}
