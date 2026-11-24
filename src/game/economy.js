// Economy v1 (game-design §6): the wallet, buying upgrades, the bonus for new stars, which contracts
// and maps are open. Pure logic over localStorage (settings.js), no DOM: the same for VR, the phone and
// the PC. The numbers are CFG.shop.
//   wallet { cash, earned, spent, owned: [upgrade ids], paid: { contractId: { difficulty: stars paid for } },
//            log: [{ t, kind: 'round' | 'stars' | 'buy', amount, note }] }
// Every change reads the wallet afresh before writing it (another tab of the game may have changed it).
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting, PREVIEW } from '../settings.js';
import { bestStars, bestBits, goalK } from './contracts.js';
import { CLASSIC } from '../config/campaign.js';
import { contracts as DACHA } from '../config/contracts.js';
import { mansion as MANSION } from '../config/mansion.js';

const MAPS = ['dacha', 'mansion', 'museum'];
// every map's contracts (CFG.contracts holds only the current page's map: world/maps.js)
const LISTS = { dacha: DACHA, mansion: MANSION.contracts, museum: [] };
const allContracts = () => Object.values(LISTS).flat();
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

// The wallet as saved. A first wallet counts the stars won before the shop existed as already paid
// (no bonus for replaying them).
// Campaign v2 keeps its own wallet (CFG.shop.v2.walletKey: the money and the upgrades from zero, decision R12 А);
// the tests' classic game the old one.
const V2 = !CLASSIC;
const KEY = () => (V2 ? CFG.shop.v2.walletKey : 'wallet');
export function wallet() {
  let w = loadSetting(KEY(), null);
  if (V2 && (!w || typeof w !== 'object')) w = { cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [] };
  if (!w || typeof w !== 'object') {
    const paid = {};
    for (const c of allContracts()) {
      const b = bestStars(c.id);
      if (b.easy || b.medium || b.hard) paid[c.id] = { ...b };
    }
    w = { cash: 0, earned: 0, spent: 0, owned: [], paid, log: [] };
  }
  w.owned = Array.isArray(w.owned) ? w.owned : [];
  w.paid = w.paid && typeof w.paid === 'object' ? w.paid : {};
  w.log = Array.isArray(w.log) ? w.log : [];
  w.stock = w.stock && typeof w.stock === 'object' ? w.stock : {};   // W2b: traps bought and not used yet { kind: n }
  w.best = w.best && typeof w.best === 'object' ? w.best : {};   // v2: the loot already paid per level (its record)
  for (const k of ['cash', 'earned', 'spent']) w[k] = Number.isFinite(w[k]) ? w[k] : 0;
  return w;
}
function save(w) {
  if (w.log.length > CFG.shop.logSize) w.log = w.log.slice(-CFG.shop.logSize);
  saveSetting(KEY(), w);
  return w;
}
const note = (w, kind, amount, text) => w.log.push({ t: new Date().toISOString().slice(0, 16), kind, amount, note: text });

// The game creates the wallet when it starts (systems/economy.js), before any round: the stars won
// until then are the ones counted as paid (a round's own new stars are recorded before it is credited).
export function ensureWallet() { if (loadSetting(KEY(), null) === null) save(wallet()); }

// an upgrade with this game's price (v2: CFG.shop.v2.prices; its «незабаром» rows are gone)
export function upgrade(id) {
  const u = CFG.shop.upgrades.find((x) => x.id === id) || null;
  if (!u || !V2) return u;
  return CFG.shop.v2.prices[id] === undefined ? null : { ...u, price: CFG.shop.v2.prices[id] };
}
export const upgradeIds = () => (V2 ? CFG.shop.v2.order.slice() : CFG.shop.upgrades.map((u) => u.id));
export const trapPrice = (kind) => (V2 && CFG.shop.v2.trapPrices[kind] !== undefined ? CFG.shop.v2.trapPrices[kind] : CFG.traps.kinds[kind].price);
export const has = (id) => wallet().owned.includes(id);

// After a round: the loot money (0 when caught or late: decision R5 A) and $starBonus for every star not
// paid before on this contract and difficulty. Returns { loot, stars, bonus } as credited.
export function creditRound({ contractId, difficulty, loot, stars, bits, practice, players = 1 }) {
  if (V2 && bits) return creditLevel({ contractId, loot, bits, practice, players });
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

// Campaign v2 (plan §3.1, §5.3): each star of the level once ($200 / $300 / $500), the loot only above the
// level's record (the rehearsal's: never). Co-op (plan 2026-11-22 §1.4, decision Р1 А): the record and the pay are in
// «solo dollars» — the brigade's loot ÷ k (k = the goal's multiplier for the thieves of the round): the same loot
// is worth as much as one thief would have carried out for a goal k times smaller. Returns { loot (paid), sum (solo
// dollars), team (the brigade's loot), players, best (the record before), stars (new), bonus, fresh: [bool x3], practice }.
function creditLevel({ contractId, loot, bits, practice, players = 1 }) {
  const w = wallet(), P = CFG.shop.v2.stars;
  const had = Array.isArray(w.paid[contractId]) ? w.paid[contractId] : [0, 0, 0];
  const fresh = bits.map((b, i) => !!b && !had[i]);
  const bonus = fresh.reduce((n, f, i) => n + (f ? P[i] : 0), 0);
  w.paid[contractId] = had.map((h, i) => (h || bits[i] ? 1 : 0));
  const team = Math.max(0, loot || 0), k = goalK(players), sum = k > 1 ? Math.round(team / k) : team, best = w.best[contractId] || 0;
  const gain = practice ? 0 : Math.max(0, sum - best);
  if (!practice && sum > best) w.best[contractId] = sum;
  w.cash += gain + bonus; w.earned += gain + bonus;
  if (gain) note(w, 'round', gain, `${contractId} record ${sum}`);
  if (bonus) note(w, 'stars', bonus, `${contractId} +${fresh.filter(Boolean).length}★`);
  save(w);
  return { loot: gain, sum, team, players, best, stars: fresh.filter(Boolean).length, bonus, fresh, practice: !!practice };
}
export const lootRecord = (id) => wallet().best[id] || 0;

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

// ---------- traps: consumables (W2b; W3 decision R2: «витратні — разом із пастками») ----------
export const stockOf = (kind) => wallet().stock[kind] || 0;
// Buy one trap: like an upgrade, only before the clock starts. Returns { ok } or { ok: false, why, need }.
export function buyTrap(kind, phase) {
  const T = CFG.traps.kinds[kind];
  if (!T) return { ok: false, why: 'unknown' };
  if (phase !== 'ready') return { ok: false, why: 'phase' };
  const w = wallet(), price = trapPrice(kind);
  if (w.cash < price) return { ok: false, why: 'cash', need: price - w.cash };
  w.cash -= price; w.spent += price; w.stock[kind] = (w.stock[kind] || 0) + 1;
  note(w, 'buy', -price, kind);
  save(w);
  return { ok: true };
}
// a trap that worked (or that the guard picked up) is gone from the stock
export function spendTrap(kind) {
  const w = wallet();
  if (!(w.stock[kind] > 0)) return;
  w.stock[kind]--; save(w);
}
// decision R2 A: one free soap for the first round of contract 7 (once)
export function trialSoap() {
  const w = wallet();
  if (w.trialSoap) return false;
  w.trialSoap = true; w.stock.soap = (w.stock.soap || 0) + 1; save(w);
  return true;
}

// ---------- what is open ----------
// «Відкрити все» (open everything): only on a preview or with ?debug, for the owner's tests; the main
// site ignores a saved value.
export const openAllAllowed = () => PREVIEW || DEBUG;
export const openAll = () => openAllAllowed() && loadSetting('openAll', false) === true;
export function setOpenAll(on) { if (openAllAllowed()) saveSetting('openAll', !!on); }

const mapOf = (c) => c.map || MAPS.find((m) => LISTS[m].some((x) => x.id === c.id)) || 'dacha';
export const bestOf = (id) => { const b = bestStars(id); return Math.max(b.easy || 0, b.medium || 0, b.hard || 0, V2 ? bestBits(id).filter(Boolean).length : 0); };
// stars on a map: the best of each of its contracts (any difficulty); W19: not the rehearsal's (`practice`)
export const mapStars = (map) => (LISTS[map] || []).reduce((n, c) => n + (c.practice ? 0 : bestOf(c.id)), 0);
// A map is open once the stars on the maps before it reach its threshold (CFG.shop.unlock.maps).
export const starsBefore = (map) => MAPS.slice(0, Math.max(0, MAPS.indexOf(map))).reduce((n, m) => n + mapStars(m), 0);
// The old rule (before the co-op campaign), kept for the saved snapshot (`opened2`) and the tests' classic game:
// a house opens on a star on its level, or any star won in it; a level opens on a star on the one before it,
// a level put in by the campaign counts as passed once a later one has a star.
function mapOpenOld(map) {
  if (map === 'dacha') return true;
  const after = V2 && CFG.campaign.opens[map];   // v2 (decision R13 А): a star on the house's last level before it
  if (after) return bestOf(after) >= CFG.shop.unlock.chainStars || mapStars(map) > 0;   // (or stars already won in it)
  const need = CFG.shop.unlock.maps[map];
  return need === undefined || starsBefore(map) >= need;
}
const prevOf = (c) => {
  const same = LISTS[mapOf(c)] || [], i = same.findIndex((x) => x.id === c.id);
  return { same, prev: c.after ? same.find((x) => x.id === c.after) : same.slice(0, Math.max(0, i)).reverse().find((x) => !x.locked) };
};
const houseLock = (map) => {
  const after = V2 && CFG.campaign.opens[map], l = after && CFG.campaign.levels.find((x) => x.id === after);
  return l ? { map, level: l.n, after: null } : { map, need: CFG.shop.unlock.maps[map], have: starsBefore(map) };
};
function lockOld(c) {
  const map = mapOf(c);
  if (!mapOpenOld(map)) return houseLock(map);
  // the previous contract of its map that can be played (W6's placeholders, `locked`, give no stars);
  // a contract may name its own (W2b decision R8 A: contract 7 opens after a star on contract 5)
  const { same, prev } = prevOf(c);
  if (!prev) return null;
  // W19 (decision R10 A): a level put in before the ones already won (`campaign`: the rehearsal, «Шафа»)
  // counts as passed once a later contract of the map has a star — an old player is not sent back
  const later = !!prev.campaign && same.slice(same.indexOf(prev) + 1).some((x) => bestOf(x.id) >= CFG.shop.unlock.chainStars);
  return bestOf(prev.id) >= CFG.shop.unlock.chainStars || later ? null : { after: prev };
}

// ---------- the way to a level (plan 2026-11-22-coop-campaign §2) ----------
// A star won on a level that is still closed (a friend's room: the host picked it) is kept but opens nothing: a level
// is open when the one before it is open and has a star (a chain from level 0), a house when its last level before
// it is open and passed. What is open at the first start of this version stays open (decision Р3 А): the list is
// written once to `opened2` { levels, maps } by the old rule — an old player is not sent back, a restored progress
// code without it gets its own list at the next start.
const OPENED = 'opened2';
function opened() {
  let o = loadSetting(OPENED, null);
  if (!o || !Array.isArray(o.levels) || !Array.isArray(o.maps)) {
    o = { levels: allContracts().filter((c) => !lockOld(c)).map((c) => c.id), maps: MAPS.filter(mapOpenOld) };
    saveSetting(OPENED, o);
  }
  return o;
}
const passedStar = (c) => bestOf(c.id) >= CFG.shop.unlock.chainStars;
function mapOpenV2(map) {
  if (map === 'dacha' || opened().maps.includes(map)) return true;
  const after = CFG.campaign.opens[map];
  if (!after) return mapOpenOld(map);   // a house the ladder does not know (the museum): by the stars before it
  const c = allContracts().find((x) => x.id === after);
  return !!c && !lockV2(c) && passedStar(c);
}
function lockV2(c) {
  if (opened().levels.includes(c.id)) return null;
  const map = mapOf(c);
  if (!mapOpenV2(map)) return houseLock(map);
  const { prev } = prevOf(c);
  if (!prev) return null;
  const up = lockV2(prev);   // the first level of the chain still to be passed
  if (up) return up;
  return passedStar(prev) ? null : { after: prev };
}
export function mapOpen(map) {
  if (openAll() || map === 'dacha') return true;
  return V2 ? mapOpenV2(map) : mapOpenOld(map);
}
// What a contract waits for: null (open), { map, need } (the map is closed) or { after: contract } (the
// previous contract of its map needs a star).
export function lockOf(c) {
  if (openAll()) return null;
  return V2 ? lockV2(c) : lockOld(c);
}
export const isOpen = (c) => !lockOf(c);
