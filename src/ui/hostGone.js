// Б9 (decision Р3-A): the card a guest sees in the game when the host is gone — it closed the game
// («Хост завершив гру», [В меню]) or went silent («Хост не відповідає…», [Чекати] [В меню]); anything from
// the host again and the card goes by itself. It stands above everything (the pause, the summary, the game).
// Pure DOM; when to show it is src/systems/net.js.
import { S } from '../i18n/index.js';
import { bindPress } from './press.js';

export class HostGone {
  // on: { wait(), menu() }
  constructor(on) {
    const el = this.el = document.createElement('div');
    el.id = 'hostgone'; el.hidden = true;
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-live', 'assertive');
    el.innerHTML = '<div class="hg-box"><p class="hg-text"></p><div class="hg-acts"><button type="button" class="hg-wait"></button><button type="button" class="hg-menu"></button></div></div>';
    document.body.append(el);
    this.text = el.querySelector('.hg-text');
    this.waitBtn = el.querySelector('.hg-wait'); this.menuBtn = el.querySelector('.hg-menu');
    this.waitBtn.textContent = S.net.gone.wait; this.menuBtn.textContent = S.net.gone.menu;
    bindPress(this.waitBtn, () => on.wait());
    bindPress(this.menuBtn, () => on.menu());
    this.kind = '';
  }

  // kind: 'end' (the host closed the game) | 'silent' (nothing from it for secs s)
  show(kind, name, secs = 0) {
    const text = kind === 'end' ? S.net.gone.ended(name) : S.net.gone.silent(name, secs);
    if (this.text.textContent !== text) this.text.textContent = text;
    this.waitBtn.hidden = kind === 'end';
    this.kind = kind;
    this.el.hidden = false;
  }
  hide() { this.kind = ''; this.el.hidden = true; }
  get isOpen() { return !this.el.hidden; }
}
