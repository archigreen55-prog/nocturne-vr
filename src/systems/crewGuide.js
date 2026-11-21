// «Засоби бригади» (the menu's page `crew`): a card for every helper the player has reached — what it does,
// where to put it, how (the line for this device: phone, PC or VR browser), a tip. The cards come from
// config/crewTools.js, the words from S.crewTools, the numbers and prices from the shop's config (so a text
// cannot drift from the game). A card of a mechanic the player has not reached yet is a lock with its level;
// the traps, the cart and the blanket are not in the guide until the game has them. «?» in the shop's rows
// opens the page on that card (systems/menu.js openCrew). Pure DOM over the page's #crewlist; no game state.
import { CFG } from '../config/index.js';
import { quietBase } from '../config/crewTools.js';
import { upgrade, has } from '../game/economy.js';
import { reached } from '../game/campaign.js';
import { money } from '../ui/board.js';
import { G, $ } from './state.js';
import { S } from '../i18n/index.js';

const modeOf = () => (G.MODE && G.MODE.mode) || 'pc';

// the numbers the card words use, from the configs (null: this upgrade is not sold in this game)
function numbers() {
  const t = upgrade('thermos'), s = upgrade('sneakers'), b = upgrade('boots');
  return {
    tea: t ? t.teaExtra : 0,
    run: s ? s.stamina : 0,
    quietPct: b ? Math.round((b.quietSpeed / quietBase - 1) * 100) : 0,
  };
}
const say = (v, n) => (typeof v === 'function' ? v(n) : v);
const howOf = (v, mode, n) => say(v && typeof v === 'object' ? v[mode] || v.pc : v, n);

// The cards as the page shows them: [{ id, group, locked, level, name, does, where, how, tip, foot, owned }]
export function crewCards(mode = modeOf()) {
  const n = numbers(), T = S.crewTools, out = [];
  for (const c of CFG.crewTools.cards) {
    const u = c.upgrade ? upgrade(c.upgrade) : null;
    if (c.upgrade && !u) continue;   // not sold in this game
    const level = c.mech ? CFG.campaign.mechanics[c.mech] : null;
    const locked = !!c.mech && !reached(c.mech);
    const t = T.cards[c.id], owned = c.upgrade ? has(c.upgrade) : false;
    const foot = c.upgrade ? T.foot.buy(money(u.price), owned) : T.foot[c.group](level);
    out.push(locked
      ? { id: c.id, group: c.group, locked: true, level, name: T.locked, hint: T.lockedHint(level) }
      : { id: c.id, group: c.group, locked: false, level, owned, name: t.name, does: say(t.does, n), where: say(t.where, n), how: howOf(t.how, mode, n), tip: say(t.tip, n), foot });
  }
  return out;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// Draw the page; `focusId`: scroll to that card and light it
export function renderCrew(focusId = null) {
  const box = $('crewlist');
  if (!box) return;
  box.replaceChildren();
  const cards = crewCards(), L = S.crewTools.labels;
  for (const g of CFG.crewTools.groups) {
    const mine = cards.filter((c) => c.group === g);
    if (!mine.length) continue;
    const head = el('h3', 'crew-group', S.crewTools.groups[g]);
    const grid = el('div', 'cards');
    for (const c of mine) {
      const card = el('div', 'lcard ccard' + (c.locked ? ' locked' : '') + (c.owned ? ' owned' : ''));
      card.dataset.crew = c.id;
      card.append(el('b', '', c.name));
      if (c.locked) card.append(el('span', '', c.hint));
      else {
        for (const k of ['does', 'where', 'how', 'tip']) {
          const row = el('span', 'crew-' + k);
          row.append(el('em', '', L[k] + ': '), document.createTextNode(c[k]));
          card.append(row);
        }
        card.append(el('span', 'crew-foot', c.foot));
      }
      grid.append(card);
    }
    box.append(head, grid);
  }
  const f = focusId && box.querySelector(`[data-crew="${focusId}"]`);
  if (f) { f.classList.add('focus'); f.scrollIntoView({ block: 'center' }); }
}
