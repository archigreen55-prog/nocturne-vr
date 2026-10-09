// Economy v1 (game-design §6): the wallet, buying upgrades, the bonus for new stars, which contracts
// and maps are open. Pure logic over localStorage (settings.js), no DOM: the same for VR, the phone and
// the PC. The numbers are CFG.shop.
//   wallet { cash, earned, spent, owned: [upgrade ids], paid: { contractId: { difficulty: stars paid for } },
//            log: [{ t, kind: 'round' | 'stars' | 'buy', amount, note }] }
// Every change reads the wallet afresh before writing it (another tab of the game may have changed it).
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting, PREVIEW } from '../settings.js';
import { bestStars } from './contracts.js';

const MAPS = ['dacha', 'mansion', 'museum'];
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

// The wallet as saved. A first wallet counts the stars won before the shop existed as already paid
// (no bonus for replaying them).
export function wallet() {
  let w = loadSetting('wallet', null);
  if (!w || typeof w !== 'object') {
    const paid = {};
    for (const c of CFG.contracts) {
      const b = bestStars(c.id);
      if (b.easy || b.medium || b.hard) paid[c.id] = { ...b };
    }
    w = { cash: 0, earned: 0, spent: 0, owned: [], paid, log: [] };
  }
  w.owned = Array.isArray(w.owned) ? w.owned : [];
  w.paid = w.paid && typeof w.paid === 'object' ? w.paid : {};
  w.log = Array.isArray(w.log) ? w.log : [];
  for (const k of ['cash', 'earned', 'spent']) w[k] = Number.isFinite(w[k]) ? w[k] : 0;
  return w;
}
function save(w) {
  if (w.log.length > CFG.shop.logSize) w.log = w.log.slice(-CFG.shop.logSize);
  saveSetting('wallet', w);
  return w;
}
const note = (w, kind, amount, text) => w.log.push({ t: new Date().toISOString().slice(0, 16), kind, amount, note: text });

// The game creates the wallet when it starts (systems/economy.js), before any round: the stars won
// until then are the ones counted as paid (a round's own new stars are recorded before it is credited).
export function ensureWallet() { if (loadSetting('wallet', null) === null) save(wallet()); }

export const upgrade = (id) => CFG.shop.upgrades.find((u) => u.id === id) || null;
export const has = (id) => wallet().owned.includes(id);

// After a round: the loot money (0 when caught or late: decision R5 A) and $starBonus for every star not
// paid before on this contract and difficulty. Returns { loot, stars, bonus } as credited.
export function creditRound({ contractId, difficulty, loot, stars }) {
  const w = wallet();
  const paid = w.paid[contractId] || (w.paid[contractId] = {});
  const newStars = Math.max(0, (stars || 0) - (paid[difficulty] || 0));
  const bonus = newStars * CFG.shop.starBonus;
  if (newStars) paid[difficulty] = stars;
  const total = Math.max(0, loot || 0) + bonus;
  w.cash += total; w.earned += total;
  if (loot > 0) note(w, 'round', loot, `${contractId}/${difficulty}`);
  if (bonus) note(w, 'stars', bonus, `${contractId}/${difficulty} +${newStars}★`);
  save(w);
  return { loot: Math.max(0, loot || 0), stars: newStars, bonus };
}

// Buying: only before the clock starts (decision R6 A). Returns { ok } or { ok: false, why, need }.
export function buy(id, phase) {
  const u = upgrade(id);
  if (!u) return { ok: false, why: 'unknown' };
  if (u.soon) return { ok: false, why: 'soon' };
  if (phase !== 'ready') return { ok: false, why: 'phase' };
  const w = wallet();
  if (w.owned.includes(id)) return { ok: false, why: 'owned' };
  if (w.cash < u.price) return { ok: false, why: 'cash', need: u.price - w.cash };
  w.cash -= u.price; w.spent += u.price; w.owned.push(id);
  note(w, 'buy', -u.price, id);
  save(w);
  return { ok: true };
}

// ---------- what is open ----------
// «Відкрити все» (open everything): only on a preview or with ?debug, for the owner's tests; the main
// site ignores a saved value.
export const openAllAllowed = () => PREVIEW || DEBUG;
export const openAll = () => openAllAllowed() && loadSetting('openAll', false) === true;
export function setOpenAll(on) { if (openAllAllowed()) saveSetting('openAll', !!on); }

const mapOf = (c) => c.map || 'dacha';
const bestOf = (id) => { const b = bestStars(id); return Math.max(b.easy || 0, b.medium || 0, b.hard || 0); };
// stars on a map: the best of each of its contracts (any difficulty)
export const mapStars = (map) => CFG.contracts.filter((c) => mapOf(c) === map).reduce((n, c) => n + bestOf(c.id), 0);
// A map is open once the stars on the maps before it reach its threshold (CFG.shop.unlock.maps).
export function mapOpen(map) {
  if (openAll() || map === 'dacha') return true;
  const need = CFG.shop.unlock.maps[map];
  if (need === undefined) return true;
  const before = MAPS.slice(0, Math.max(0, MAPS.indexOf(map)));
  return before.reduce((n, m) => n + mapStars(m), 0) >= need;
}
// What a contract waits for: null (open), { map, need } (the map is closed) or { after: contract } (the
// previous contract of its map needs a star).
export function lockOf(c) {
  if (openAll()) return null;
  const map = mapOf(c);
  if (!mapOpen(map)) {
    const before = MAPS.slice(0, MAPS.indexOf(map));
    return { map, need: CFG.shop.unlock.maps[map], have: before.reduce((n, m) => n + mapStars(m), 0) };
  }
  const same = CFG.contracts.filter((x) => mapOf(x) === map), i = same.indexOf(c);
  if (i <= 0) return null;
  const prev = same[i - 1];
  return bestOf(prev.id) >= CFG.shop.unlock.chainStars ? null : { after: prev };
}
export const isOpen = (c) => !lockOf(c);
