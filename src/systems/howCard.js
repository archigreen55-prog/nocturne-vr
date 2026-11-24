// Campaign v2, the cards «Як це?» (plan 2026-11-15 §6.2 item 1): what is new on a level, in three steps. Shown
// once per mechanic on this device, at the van before the round of the level that brings it (phone and PC: a card
// over the game; the clock waits at the van anyway); again from the button «Як це?» on the level card (menu
// «Грати»), in the phone's pause and on the board (VR reads it there: the board's page 'how'). Several new things
// on one level: one card after another («Далі»). The tests' classic game: none.
//   howCards(c)   [{ id, title, lines: [3] }] of a contract's level (basics: the first-run tutorial does it)
//   openHow(c)    the card(s) now (seen or not)
import { G, $ } from './state.js';
import { CLASSIC, levelOf, introOf } from '../game/campaign.js';
import { loadSetting, saveSetting } from '../settings.js';
import { S } from '../i18n/index.js';

const local = { queue: [], wired: false };
const textsOf = (id) => S.campaign2.how.cards[id] || (S.hints && S.hints.cards && S.hints.cards[id]) || null;

export function howCards(c) {
  if (CLASSIC || !c) return [];
  const l = levelOf(c.id);
  return introOf(l, S.campaign.mechanics).filter((m) => m.id !== 'basics' && textsOf(m.id)).map((m) => ({ id: m.id, title: S.hints.title(m.name), lines: textsOf(m.id) }));
}
const seen = () => new Set(loadSetting('howSeen', []));
export function markSeen(id) { const s = seen(); if (!s.has(id)) { s.add(id); saveSetting('howSeen', [...s]); } }
export const isOpen = () => { const el = $('howcard'); return !!el && !el.hidden; };

function wire() {
  if (local.wired) return;
  const ok = $('howok');
  if (!ok) return;
  local.wired = true;
  ok.addEventListener('click', (e) => { e.stopPropagation(); advance(); });
  // a PC in pointer lock has no cursor: Enter / Space / E / Escape or a click anywhere goes on
  document.addEventListener('keydown', (e) => { if (isOpen() && (['Enter', ' ', 'Escape'].includes(e.key) || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); advance(); } }, true);
  document.addEventListener('mousedown', (e) => { if (isOpen() && document.pointerLockElement && e.target !== ok) { e.stopImmediatePropagation(); advance(); } }, true);
}
function advance() { const card = local.queue.shift(); if (card) markSeen(card.id); show(); }
function show() {
  const el = $('howcard');
  if (!el) return;
  const card = local.queue[0];
  if (!card) { el.hidden = true; return; }
  $('howtitle').textContent = card.title;
  const list = $('howsteps');
  list.replaceChildren(...card.lines.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  $('howok').textContent = local.queue.length > 1 ? S.campaign2.how.next : S.hints.ok;
  el.hidden = false;
}
// the level's card(s) now
export function openHow(c = G.contract) {
  wire();
  local.queue = howCards(c);
  show();
  return local.queue.length > 0;
}

export const howCard = {
  id: 'howCard',
  init() { wire(); },
  // once per mechanic: at the van, in the game (not the menu, not VR; a guest in a friend's room too: plan 22.11 §2.2), before the clock
  present() {
    if (CLASSIC || G.inVR || !G.playingDesktop || G.paused || isOpen() || !G.round || G.round.phase !== 'ready' || G.role === 'guard') return;
    if (G.summary && G.summary.isOpen) return;
    const s = seen(), fresh = howCards(G.contract).filter((x) => !s.has(x.id));
    if (!fresh.length) return;
    wire();
    local.queue = fresh;
    show();
  },
};
