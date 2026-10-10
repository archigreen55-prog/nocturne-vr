// Economy v1 (game-design §6): the wallet, the shop, the bonus for new stars, which contracts are open.
// Input: the phone joystick's "quiet" ring follows the boots upgrade. World (before the round clock):
// a closed contract cannot be played — leaving the van with one switches to the last open one.
// Result: the round's money (the loot when you got away; nothing when caught or late) and $500 for
// every new star, credited once per round. The shop: board page 'shop' (VR, PC, phone by tap or
// crosshair) and the phone's pause menu; buying only before the clock starts. «Відкрити все» on
// previews and with ?debug (start screen). The logic is game/economy.js; the numbers CFG.shop.
import { CFG } from '../config/index.js';
import { wallet, ensureWallet, creditRound, buy, upgrade, lockOf, isOpen, openAll, openAllAllowed, setOpenAll, buyTrap } from '../game/economy.js';
import { reloadVan, roundLimit } from './traps.js';
import { applyDifficulty } from '../game/difficulty.js';
import { money } from '../ui/board.js';
import { playCash } from '../audio/audio.js';
import { G, $ } from './state.js';
import { flash } from './messages.js';
import { setContract } from './contract.js';
import { syncStartScreen } from './startScreen.js';
import { S } from '../i18n/index.js';

const ROWS = 4;   // upgrades per board page
const local = { lastResult: null, lastOpen: null };

// One upgrade as the shop shows it: name, effect, price, the button state.
export function shopRows() {
  const w = wallet();
  return CFG.shop.upgrades.map((u) => {
    const owned = w.owned.includes(u.id);
    const state = u.soon ? 'soon' : owned ? 'owned' : w.cash >= u.price ? 'buy' : 'need';
    const effect = S.shop.effects[u.id](u.teaExtra ?? u.stamina ?? u.quietSpeed);
    const button = state === 'soon' ? S.shop.soon : state === 'owned' ? S.shop.owned : state === 'need' ? S.shop.need(money(u.price - w.cash)) : S.shop.buy(money(u.price));
    return { id: u.id, name: S.shop.names[u.id], effect, price: money(u.price), state, button, enabled: state === 'buy' && G.round.phase === 'ready' };
  }).concat(CFG.traps.order.map((kind) => {   // W2b: traps, consumables (bought again and again)
    const T = CFG.traps.kinds[kind], n = w.stock[kind] || 0, state = w.cash >= T.price ? 'buy' : 'need';
    const button = state === 'need' ? S.shop.need(money(T.price - w.cash)) : S.shop.buy(money(T.price));
    return { id: 'trap:' + kind, name: `${S.traps.names[kind]} · ${S.traps.stock(n)}`, effect: S.traps.effects[kind], price: money(T.price), state, button, enabled: state === 'buy' && G.round.phase === 'ready', consumable: true };
  }));
}
export const shopPages = () => Math.ceil((CFG.shop.upgrades.length + CFG.traps.order.length) / ROWS);   // + the traps (W2b)
export const shopPageRows = () => shopRows().slice(G.shopPage * ROWS, G.shopPage * ROWS + ROWS);

// Buy from the board or the menu; the message says what happened. Returns true when bought.
export function buyUpgrade(id) {
  const trap = id.startsWith('trap:') ? id.slice(5) : null;   // W2b: a trap for the stock
  const r = trap ? buyTrap(trap, G.round.phase) : buy(id, G.round.phase);
  const name = trap ? S.traps.names[trap] : S.shop.names[id] || id;
  if (r.ok && trap) {
    playCash();
    flash(`${S.shop.bought(name)} · ${S.traps.perRound(roundLimit())}`, 2.5, '#5fd38d');
    reloadVan();
  } else if (r.ok) {
    applyDifficulty(G.difficulty, G.contract);   // the numbers from their base again, with the new upgrade: in effect from this round
    if (G.run) G.run.reset();                    // e.g. the sneakers: full (longer) stamina
    playCash();
    flash(S.shop.bought(name), 2.5, '#5fd38d');
  } else if (r.why === 'cash') flash(S.shop.notEnough(money(r.need)), 2, '#ffb347');
  else if (r.why === 'phase') flash(S.shop.onlyAtVan, 2.5, '#ffb347');
  else if (r.why === 'soon') flash(S.shop.soonNote, 2, '#93a1b8');
  G.boardDirty = true;
  syncWallet();
  if (G.menu) G.menu.refresh();
  return r.ok;
}

// The board's shop buttons (systems/contract.js pressBoard hands them over). Returns true when handled.
export function shopPress(id) {
  if (id === 'shop') { G.boardPage = 'shop'; G.shopPage = 0; }
  else if (id === 'sprev') G.shopPage = (G.shopPage + shopPages() - 1) % shopPages();
  else if (id === 'snext') G.shopPage = (G.shopPage + 1) % shopPages();
  else if (id.startsWith('buy:')) buyUpgrade(id.slice(4));
  else return false;
  G.boardDirty = true;
  return true;
}

// The lock of a contract in words, or '' when it is open.
export function lockText(c) {
  const L = lockOf(c);
  if (!L) return '';
  return L.after ? S.shop.lockAfter(L.after.name) : S.shop.lockMap(L.have, L.need);
}

// The wallet line and «Відкрити все» on the start screen; the closed contracts in its list.
export function syncWallet() {
  const w = wallet(), line = $('walletline');
  if (line) line.textContent = S.shop.startLine(money(w.cash), w.owned.length);
  const sel = $('contract');
  if (sel) for (const o of sel.options) {
    const c = CFG.contracts.find((x) => x.id === o.value);
    if (c) o.textContent = (isOpen(c) ? '' : S.shop.lockShort + ' ') + c.name;
  }
}

export const economy = {
  id: 'economy',
  init() {
    G.shopPage = 0; G.income = null;
    ensureWallet();   // before any round (the stars won so far count as paid)
    local.lastOpen = isOpen(G.contract) ? G.contract.id : CFG.contracts[0].id;
    const box = $('openall'), cb = $('openallcb');
    if (box) box.hidden = !openAllAllowed();
    if (cb && openAllAllowed()) {
      cb.checked = openAll();
      cb.addEventListener('change', () => { setOpenAll(cb.checked); syncWallet(); syncStartScreen(); G.boardDirty = true; if (G.menu) G.menu.refresh(); });
    }
    syncWallet();
  },
  input() {
    if (G.touch) G.touch.syncQuiet();   // the boots move the "quiet" ring
    if (isOpen(G.contract)) local.lastOpen = G.contract.id;
  },
  world() {
    const { round, player } = G;
    if (G.isGuest || G.role === 'guard') return;   // with friends the host's contract is played (plan-multiplayer §5); the guard is not at the van
    // leaving the van with a closed contract: play the last open one instead (before the clock starts)
    if (round.phase !== 'ready' || isOpen(G.contract) || !G.active) return;
    const V = CFG.round.vanZone;
    if (Math.hypot(player.head.x - V.x, player.head.z - V.z) < CFG.round.startDist - 0.3) return;
    const locked = G.contract.name;
    let target = CFG.contracts.find((c) => c.id === local.lastOpen);
    if (!target || !isOpen(target)) target = CFG.contracts.find((c) => isOpen(c));
    setContract(target.id);
    flash(S.shop.switched(locked, target.name), 4, '#ffb347');
  },
  result() {
    const R = G.round.result;
    if (G.round.phase !== 'result' || !R || !G.verdict || R === local.lastResult || G.role === 'guard') return;   // W15: the guard earns no money
    local.lastResult = R;
    const got = R.kind === 'left' || R.kind === 'escaped';
    G.income = { ...creditRound({ contractId: G.contract.id, difficulty: G.difficulty, loot: got ? R.sum : 0, stars: G.verdict.stars }), got };
    syncWallet();
    G.boardDirty = true;
  },
};

// the income line of the result board and the phone summary
export function incomeText(inc = G.income) {
  if (!inc) return '';
  if (!inc.got && !inc.bonus) return S.shop.incomeLost;
  return S.shop.income(money(inc.loot), money(inc.bonus), inc.stars);
}
export { upgrade };
