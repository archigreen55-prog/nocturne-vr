// Texts for players. Every text the game shows lives in a language file (src/i18n/<code>.js, a
// default export with the same keys as uk.js); the code uses S.<section>.<key> (texts with numbers
// are functions). Ukrainian is the only language now and the fallback for any missing key.
// A new language = one file, e.g. src/i18n/en.js; it is picked with ?lang=en (remembered on this
// device; ?lang=uk goes back). The file is loaded before the game starts (top-level await), so
// modules may use S at load time.
import uk from './uk.js';
import { GAME_NAME } from './name.js';
import { loadSetting, saveSetting } from '../settings.js';

// deep merge: the language's keys over Ukrainian
function over(base, top) {
  if (!top || typeof top !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(top)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? over(base[k], v) : v;
  return out;
}

let lang = 'uk', strings = uk;
const asked = new URLSearchParams(location.search).get('lang');
const want = asked || loadSetting('lang', 'uk');
if (want && want !== 'uk' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(want)) {
  try {
    strings = over(uk, (await import(`./${want}.js`)).default);
    lang = want;
  } catch { /* no such language file: Ukrainian */ }
}
if (asked && (asked === 'uk' || lang === asked)) saveSetting('lang', lang);

export const LANG = lang;
export const S = strings;

// Static texts of index.html: data-t="key" = textContent, data-t-html="key" = innerHTML (the text has
// markup), data-t-attr="attr:key; attr2:key2" = attributes, data-game-name = the game's name.
export const pick = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
export function applyTexts(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = pick(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-html]')) el.innerHTML = pick(el.dataset.tHtml);
  for (const el of root.querySelectorAll('[data-t-attr]')) {
    for (const pair of el.dataset.tAttr.split(';')) { const [a, k] = pair.split(':').map((s) => s.trim()); if (a && k) el.setAttribute(a, pick(k)); }
  }
  for (const el of root.querySelectorAll('[data-game-name]')) el.textContent = GAME_NAME;
  if (root === document) document.documentElement.lang = LANG;
}
