// The level cards (menu «Грати» and the host's room): a group per house, a card per level of the ladder —
// its number, name and best stars; a closed one greyed with 🔒 and not pressable. Built once per set of
// levels (show() may run twice a second: a remade card would lose the finger), then only the classes change.
//   const p = new LevelPick(root, (id) => …);  p.show(groups)   (groups: systems/levels.js levelGroups())
import { bindPress } from './press.js';
import { S } from '../i18n/index.js';

export class LevelPick {
  constructor(root, onPick) {
    this.root = root; this.onPick = onPick; this.sig = '';
    root.classList.add('lv-pick');
  }

  show(groups) {
    const sig = JSON.stringify(groups.map((g) => [g.map, g.note, g.levels.map((l) => [l.id, l.name, l.locked, l.stars])]));
    if (sig !== this.sig) { this.sig = sig; this.build(groups); }
    for (const g of groups) for (const l of g.levels) {
      const b = this.root.querySelector(`[data-level="${CSS.escape(l.id)}"]`);
      if (!b) continue;
      b.classList.toggle('on', !!l.current);
      b.setAttribute('aria-pressed', l.current ? 'true' : 'false');
    }
  }

  build(groups) {
    this.root.replaceChildren();
    for (const g of groups) {
      const box = document.createElement('div');
      box.className = 'lv-house' + (g.open ? '' : ' closed');
      box.dataset.house = g.map;
      const h = document.createElement('div'); h.className = 'lv-house-head';
      const t = document.createElement('b'); t.textContent = g.title; h.append(t);
      if (g.note) { const n = document.createElement('span'); n.className = 'lv-note'; n.textContent = g.note; h.append(n); }
      const row = document.createElement('div'); row.className = 'lv-row';
      for (const l of g.levels) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lv-card' + (l.locked ? ' locked' : '') + (l.soon ? ' soon' : '');
        b.dataset.level = l.id; b.disabled = !!l.locked;
        if (l.why) b.title = l.why;
        const n = document.createElement('span'); n.className = 'lv-n'; n.textContent = (l.n === null ? '' : String(l.n)) + (l.locked ? (l.n === null ? '🔒' : ' 🔒') : l.n === null ? '•' : '');
        const name = document.createElement('span'); name.className = 'lv-name'; name.textContent = l.soon ? S.levels.soon : l.name;
        const st = document.createElement('span'); st.className = 'lv-stars'; st.textContent = l.locked ? '' : '★'.repeat(l.stars) + '☆'.repeat(3 - l.stars);
        b.append(n, name, st);
        bindPress(b, () => { if (!b.disabled) this.onPick(l.id); });
        row.append(b);
      }
      box.append(h, row);
      this.root.append(box);
    }
  }
}
