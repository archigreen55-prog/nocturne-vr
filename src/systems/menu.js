// W17 «Стиль» S3 (plan-W17-style.md §3.2–3.5): the way into the game. The start screen's card is now a
// main menu («Грати» · «Грати з друзями» · «Магазин» · «Тихарник» · «Налаштування») and pages, each a
// <section data-page> in index.html; the old elements kept their ids, so the start screen's own code
// (systems/startScreen.js, ui/start.js, ui/lobby.js) is unchanged. Pages open from the buttons and from
// ?page=… (deep links); «←» and Android's «Назад» go back (history). Тихарник shows W7's cards
// (game/story.js). The splash itself is index.html's (it shows before the modules load); this system
// only learns when it is gone, then offers the microphone on the first run.
// The tests see every page at once (body.pages-all, tests/harness.mjs) unless they ask for the menu.
import { S } from '../i18n/index.js';
import { G, $, params } from './state.js';
import { shopRows, buyUpgrade } from './economy.js';
import { wallet } from '../game/economy.js';
import { money } from '../ui/board.js';
import { lurkerCards, lurkersMet, papers, notesCount } from '../game/story.js';
import { dressLobby } from '../style/portraits.js';
import { renderPlayPage } from './playPage.js';
import { pressLook } from '../ui/press.js';   // S4: the thieves' portraits in the lobby

const PAGES = ['menu', 'play', 'friends', 'shop', 'lurkers', 'settings', 'testers', 'howto'];   // howto: menu design stage 2
const TEST = (typeof window !== 'undefined' && window.__NOCTURNE_TEST) || {};
let current = 'menu';

function show(page) {
  if (!PAGES.includes(page)) page = 'menu';
  current = page;
  for (const s of document.querySelectorAll('#overlay section[data-page]')) s.hidden = s.dataset.page !== page;
  if (page === 'shop') renderShop();
  if (page === 'lurkers') renderLurkers();
  if (page === 'menu') renderMenu();
  if (page === 'play') renderPlay();
  if (page === 'friends') dressLobby();
  if (page === 'settings' || page === 'testers') renderSettings();
  const card = document.querySelector('#overlay .card');
  if (card) card.scrollTop = 0;
}
// forward: one history entry per page, so Android's «Назад» comes back to the menu
export function goPage(page) {
  if (page === current) return show(page);
  try { history.pushState({ page }, '', pageUrl(page)); } catch { /* opaque origin */ }
  show(page);
}
function pageUrl(page) {
  const u = new URL(location.href);
  if (page === 'menu') u.searchParams.delete('page'); else u.searchParams.set('page', page);
  return u.pathname + u.search + u.hash;
}
function back() {
  if (history.state && history.state.page && history.state.page !== 'menu') history.back();
  else show('menu');
}

function micText() {
  const mic = G.mic;
  if (!mic) return null;
  if (mic.noMic) return S.menu2.mic.off;
  return mic.calibrated ? S.menu2.mic.ok : null;
}
function renderMenu() {
  const w = wallet(), L = lurkersMet();
  $('mmwallet').textContent = money(w.cash);
  $('mmlurkers').textContent = S.lurkers.met(L.n, L.total);
  const ok = micText();
  $('mmmic').hidden = !!ok;
}
function renderPlay() {
  renderPlayPage();
  const ok = micText();
  $('playmic').textContent = ok || S.menu2.mic.none;
  $('playmicgo').hidden = !!(G.mic && G.mic.calibrated && !G.mic.noMic);
}
function renderShop() {
  const box = $('shoplist');
  box.replaceChildren();
  $('shopwallet').textContent = S.shop.wallet(money(wallet().cash));
  for (const r of shopRows()) {
    const row = document.createElement('div');
    row.className = 'shoprow'; row.dataset.shop = r.id;
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = r.name;
    t.append(b, document.createTextNode(r.effect));
    const btn = document.createElement('button');
    btn.textContent = r.button; btn.disabled = !r.enabled;
    btn.addEventListener('click', () => { buyUpgrade(r.id); renderShop(); });
    row.append(t, btn); box.append(row);
  }
}
function renderLurkers() {
  const L = lurkersMet(), box = $('lurkerlist');
  $('lurkercount').textContent = S.lurkers.met(L.n, L.total);
  box.replaceChildren();
  const Lb = S.lurkers.labels;
  for (const c of lurkerCards()) {
    const card = document.createElement('div');
    card.className = 'lcard' + (c.met ? '' : ' locked'); card.dataset.lurker = c.id;
    const b = document.createElement('b'); b.textContent = c.name; card.append(b);
    for (const line of c.met ? [`${Lb.wants}: ${c.wants}`, `${Lb.warns}: ${c.warns}`, `${Lb.avoid}: ${c.avoid}`] : [S.lurkers.lockedHint]) {
      const s = document.createElement('span'); s.textContent = line; card.append(s);
    }
    box.append(card);
  }
  $('lurkernomic').hidden = !(G.mic && (G.mic.noMic || G.mic.state !== 'on'));
  // W7's «Папери»: the notes found
  const P = papers(), C = notesCount(), pb = $('paperlist');
  $('papercount').textContent = P.length ? S.notes.count(C.n, C.total) : S.notes.empty;
  pb.replaceChildren();
  for (const r of P) {
    const card = document.createElement('div'); card.className = 'lcard'; card.dataset.note = r.id;
    const b = document.createElement('b'); b.textContent = `«${r.text}»`;
    const s = document.createElement('span'); s.textContent = r.where;
    card.append(b, s); pb.append(card);
  }
}

// Menu design stage 2: a <select class="seg-src"> is shown as a row of big buttons (the select stays: the
// code reads it and listens to its 'change'); kept in step when the code sets the value
function segFor(sel) {
  const next = sel.nextElementSibling;
  if (next && next.classList.contains('seg')) return next;
  const seg = document.createElement('div');
  seg.className = 'seg'; seg.setAttribute('role', 'group');
  sel.after(seg);
  sel.addEventListener('change', () => syncSeg(sel));
  return seg;
}
function syncSeg(sel) {
  const seg = segFor(sel), opts = [...sel.options];
  const sig = opts.map((o) => o.value + ':' + o.textContent).join('|');
  if (seg.dataset.sig !== sig) {
    seg.dataset.sig = sig; seg.replaceChildren();
    seg.style.gridTemplateColumns = `repeat(${Math.max(1, opts.length)}, minmax(0, 1fr))`;
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.value = o.value; b.textContent = o.textContent.trim();
      b.addEventListener('click', () => { if (sel.disabled) return; sel.value = o.value; sel.dispatchEvent(new Event('change')); syncSeg(sel); });
      seg.append(b);
    }
  }
  for (const b of seg.children) { const on = b.dataset.value === sel.value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = sel.disabled; }
}
const syncSegs = () => { for (const sel of document.querySelectorAll('#overlay select.seg-src')) syncSeg(sel); };
// the microphone's three steps: done ones ticked, the next one lit
function renderSettings() {
  syncSegs();
  const mic = G.mic, wiz = $('micwiz');
  if (!mic || !wiz) return;
  const done = { allow: mic.state === 'on', cal: !!mic.calibrated, check: !!$('verifyres').textContent.trim() };
  let now = null;
  for (const li of wiz.children) {
    const d = !!done[li.dataset.step];
    li.classList.toggle('done', d);
    if (!d && !now && !li.hidden && getComputedStyle(li).display !== 'none') now = li;
  }
  for (const li of wiz.children) li.classList.toggle('now', li === now);
  wiz.classList.toggle('off', !!mic.noMic);
}

// The first run: no calibration and the microphone not turned off — «Налаштуємо мікрофон?»
let askPending = false;
function offerMic() {
  const mic = G.mic;
  if (!mic || mic.calibrated || mic.noMic || TEST.pages === 'all' || params.has('room') || params.has('page') || G.inVR) return;   // not over an invitation or a page link
  try { if (sessionStorage.getItem('nocturne.micLater')) return; } catch { /* private mode */ }
  $('micask').hidden = false;
}
function wireMicAsk() {
  $('askyes').addEventListener('click', () => {
    $('micask').hidden = true;
    goPage('settings');
    askPending = true;
    if (G.mic.state !== 'on') $('micbtn').click();   // the same tap: iPhone asks for the permission only from a gesture
    else $('calbtn').click();
    $('micbox').scrollIntoView({ block: 'start' });
  });
  $('asklater').addEventListener('click', () => {
    $('micask').hidden = true;
    try { sessionStorage.setItem('nocturne.micLater', '1'); } catch { /* private mode */ }
  });
  $('asknone').addEventListener('click', () => {
    $('micask').hidden = true;
    const cb = $('nomic'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    renderMenu();
  });
  // once the permission is given, the calibration starts by itself (the card's «Так» meant both)
  const prev = G.mic.onChange;
  G.mic.onChange = () => {
    if (prev) prev();
    if (askPending && G.mic.state === 'on' && !$('calbtn').disabled) { askPending = false; $('calbtn').click(); }
    if (current === 'menu') renderMenu();
    if (current === 'play') renderPlay();
    if (current === 'settings') renderSettings();
  };
}

export const menu = {
  id: 'menu',
  init() {
    if (!$('mmnav')) return;
    pressLook();   // every button: pushed in and darker while pressed
    if (TEST.pages === 'all' && !params.has('page')) document.body.classList.add('pages-all');
    for (const b of document.querySelectorAll('#overlay [data-go]')) b.addEventListener('click', () => goPage(b.dataset.go));
    for (const b of document.querySelectorAll('#overlay [data-back]')) b.addEventListener('click', back);
    addEventListener('popstate', (e) => show((e.state && e.state.page) || 'menu'));
    wireMicAsk();
    // the board's titles and clock use the headings' font: draw it again once the font is in (S4)
    if (document.fonts && document.fonts.load) document.fonts.load('800 40px Unbounded').then(() => { G.boardDirty = true; }, () => {});
    // the page to open: ?page=…, an invitation (?room=) opens «Грати з друзями»
    const want = params.get('page');
    const first = PAGES.includes(want) ? want : params.has('room') ? 'friends' : 'menu';
    // a deep link gets the main menu under it in the history: «←» (and Android's «Назад») land there, not off the game
    try {
      if (first === 'menu') history.replaceState({ page: 'menu' }, '', location.href);
      else { history.replaceState({ page: 'menu' }, '', pageUrl('menu')); history.pushState({ page: first }, '', pageUrl(first)); }
    } catch { /* opaque origin */ }
    show(first);
    // the overlay shown again (a pause, the round's end, out of VR): back to the main menu
    let wasHidden = false;
    new MutationObserver(() => {
      const hidden = $('overlay').style.display === 'none';
      if (wasHidden && !hidden && !document.body.classList.contains('pages-all')) show(G.net && G.net.t ? 'friends' : 'menu');   // T4c: with friends, back to the room
      wasHidden = hidden;
    }).observe($('overlay'), { attributes: true, attributeFilter: ['style'] });
    syncSegs();   // menu design: the selects as rows of buttons
    // after the splash (or at once without it): the microphone on the first run
    if (window.__splashDone || !$('splash')) offerMic();
    else addEventListener('splashdone', offerMic, { once: true });
  },
  // the wallet and the cards change in a round: the open page follows (cheap: only when shown)
  frame() {
    if (G.playingDesktop || $('overlay').style.display === 'none') return;
    if ((this.t = (this.t || 0) + 1) % 30) return;
    if (current === 'menu') renderMenu();
    if (current === 'settings') renderSettings();   // the microphone's steps follow a calibration / check
  },
};
