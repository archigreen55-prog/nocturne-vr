// Progress as a code (game-design-v3 §6.5, plan-phone-mode §10.1): everything this copy of the game
// keeps in localStorage — stars, settings, the microphone calibration, contract and difficulty, the
// tutorial — as one line of text to paste on another device or into the home-screen app (iPhone keeps
// the app's storage apart from Safari's). Not included: what belongs to this device only (the
// automatic quality pick, a ?mode= override).
//   NOC1-<base64url of the JSON>-<checksum>
// No compression: the code is made right inside the tap (Safari copies only from a tap) and stays a
// few hundred characters. A preview build reads and writes its own keys (settings.js), so a code
// from a preview never touches the main game's progress and the other way round.
import { PREVIEW } from '../settings.js';

const PREFIX = PREVIEW ? 'nocturne.preview.' : 'nocturne.';
const MAIN = 'nocturne.';
const SKIP = new Set(['qualityAuto', 'mode']);
const TAG = 'NOC1';

// FNV-1a, 32 bit: a pasted code that lost a few characters is refused instead of half-applied
function checksum(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const toB64url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

// name -> raw stored text; on a preview, the main site's values it still reads (settings.js) count too
function collect() {
  const d = {};
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (k.startsWith(PREFIX) && (PREVIEW || !k.startsWith('nocturne.preview.'))) d[k.slice(PREFIX.length)] = localStorage.getItem(k);
    }
    if (PREVIEW) for (const k of keys) {
      const name = k.startsWith(MAIN) && !k.startsWith('nocturne.preview.') ? k.slice(MAIN.length) : null;
      if (name && !(name in d)) d[name] = localStorage.getItem(k);
    }
  } catch { /* storage blocked */ }
  for (const k of SKIP) delete d[k];
  return d;
}

export function exportProgress() {
  const d = collect();
  const body = toB64url(JSON.stringify({ v: 1, d }));
  return { code: `${TAG}-${body}-${checksum(body)}`, count: Object.keys(d).length };
}

// { ok, data, count } or { ok: false, why: 'empty' | 'format' | 'checksum' | 'version' }
export function readCode(text) {
  const s = String(text || '').replace(/\s+/g, '');
  if (!s) return { ok: false, why: 'empty' };
  const m = /^NOC1-([A-Za-z0-9_-]+)-([0-9a-z]+)$/.exec(s);
  if (!m) return { ok: false, why: 'format' };
  if (checksum(m[1]) !== m[2]) return { ok: false, why: 'checksum' };
  let obj;
  try { obj = JSON.parse(fromB64url(m[1])); } catch { return { ok: false, why: 'format' }; }
  if (!obj || obj.v !== 1 || !obj.d || typeof obj.d !== 'object') return { ok: false, why: 'version' };
  const data = {};
  for (const [k, v] of Object.entries(obj.d)) if (/^[\w.-]+$/.test(k) && typeof v === 'string' && !SKIP.has(k)) data[k] = v;
  return { ok: true, data, count: Object.keys(data).length };
}

// Replaces this copy's progress with the code's (the caller reloads the page afterwards).
export function importProgress(data) {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX) && !SKIP.has(k.slice(PREFIX.length)) && (PREVIEW || !k.startsWith('nocturne.preview.'))) old.push(k); }
    for (const k of old) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(PREFIX + k, v);
    return true;
  } catch { return false; }
}
