// A room for friends (plan-multiplayer §1.1): a 6-digit code, an invitation link that opens the room
// right away (?room=483921, with the map: one page = one map), and who this tab is (a player id that
// survives a reload of the same tab, so a dropped guest comes back as itself).
import { CFG } from '../config/index.js';

export const cleanCode = (s) => String(s || '').replace(/\D/g, '').slice(0, CFG.net.codeDigits);
export const validCode = (c) => cleanCode(c).length === CFG.net.codeDigits;
export const prettyCode = (c) => { c = cleanCode(c); return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c; };

export function newCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 10 ** CFG.net.codeDigits).padStart(CFG.net.codeDigits, '0');
}

// the link a friend opens: this page (main site or a preview) with ?room= and the map; ?net=local stays
// (two tabs of one browser, the tests)
export function roomLink(code, map, href = location.href) {
  const u = new URL(href), keep = u.searchParams.get('net');
  u.search = ''; u.hash = '';
  u.searchParams.set('room', cleanCode(code));
  if (map) u.searchParams.set('map', map);
  if (keep) u.searchParams.set('net', keep);
  return u.toString();
}
export const roomFromUrl = (search = location.search) => { const c = cleanCode(new URLSearchParams(search).get('room')); return validCode(c) ? c : null; };

// a random id from the browser's crypto: never Math.random, which the game's guards draw from (a call at
// page load shifted their plans: found by tools/snapshot.mjs in W8a)
export function randomId(prefix) {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return prefix + a[0].toString(36) + a[1].toString(36);
}
// this tab's player id (sessionStorage: a reload keeps it, another tab gets its own)
export function playerId() {
  const key = 'nocturne.net.pid';
  try {
    let id = sessionStorage.getItem(key);
    if (!id) { id = randomId('p'); sessionStorage.setItem(key, id); }
    return id;
  } catch { return randomId('p'); }
}
