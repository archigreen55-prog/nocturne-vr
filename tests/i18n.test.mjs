// Texts for players live in src/i18n/<language>.js (Ukrainian: uk.js); the game's name is one
// constant (src/i18n/name.js). These tests keep it that way for every future change.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile as writeFileFs } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, LAND, siteCopy, base } from './runner.mjs';

const CYR = /[А-Яа-яІіЇїЄєҐґ]/;
// JavaScript without its comments (strings and template literals kept): a text in a comment is fine
function code(src) {
  let out = '', i = 0, mode = 'code', q = '';
  const tpl = [];
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 'str'; q = c; out += c; i++; continue; }
      if (c === '}' && tpl.length && tpl[tpl.length - 1] === 0) { tpl.pop(); mode = 'str'; q = '`'; out += c; i++; continue; }
      if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
      if (c === '}' && tpl.length) tpl[tpl.length - 1]--;
      out += c; i++; continue;
    }
    if (c === '\\') { out += c + (d || ''); i += 2; continue; }
    if (q === '`' && c === '$' && d === '{') { out += '${'; i += 2; mode = 'code'; tpl.push(0); continue; }
    if (c === q) { mode = 'code'; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}
async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p)); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const keysOf = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, pre + k + '.') : [pre + k]));
const pick = (o, key) => key.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
// the texts index.html may keep: they show before the game's modules load (the boot-failure panel and
// "Завантаження…"); see src/i18n/index.js
const BOOT_TEXTS = ['Завантаження…'];

test('texts: no player text in code outside src/i18n/ (comments aside); every index.html text key exists in uk.js; the game name is one constant everywhere', async () => {
  const bad = [];
  for (const f of await jsFiles(join(ROOT, 'src'))) {
    if (f.includes(`${join('src', 'i18n')}`)) continue;
    code(await readFile(f, 'utf8')).split('\n').forEach((l, i) => { if (CYR.test(l)) bad.push(`${f.slice(ROOT.length)}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(bad, [], 'texts must go to src/i18n/uk.js');
  const uk = (await import(pathToFileURL(join(ROOT, 'src/i18n/uk.js')))).default;
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  // the body without the boot texts: no Ukrainian left in the markup
  const body = html.slice(html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  let rest = body; for (const t of BOOT_TEXTS) rest = rest.replace(t, '');
  assert.equal(CYR.test(rest), false, `index.html body still has text: ${(rest.match(/[^<>]*[А-Яа-яІіЇїЄєҐґ][^<>]*/) || [''])[0].trim().slice(0, 80)}`);
  const keys = [...html.matchAll(/data-t(?:-html)?="([^"]+)"/g)].map((m) => m[1]).concat([...html.matchAll(/data-t-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';').map((p) => p.split(':')[1].trim())));
  assert.ok(keys.length > 80, `data-t keys: ${keys.length}`);
  for (const k of keys) assert.equal(typeof pick(uk, k), 'string', `index.html key "${k}" in uk.js`);
  // the name: one constant, written by tools/bump-version.mjs where it cannot be imported
  const { GAME_NAME } = await import(pathToFileURL(join(ROOT, 'src/i18n/name.js')));
  assert.match(html, new RegExp(`<title>${uk.app.pageTitle(GAME_NAME)}</title>`));
  assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${GAME_NAME}">`));
  const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, GAME_NAME); assert.equal(manifest.short_name, GAME_NAME); assert.equal(manifest.description, uk.app.description);
  try {
    const privacy = await readFile(join(ROOT, 'privacy.html'), 'utf8');
    for (const m of privacy.matchAll(/<span data-game-name>([^<]*)<\/span>/g)) assert.equal(m[1], GAME_NAME, 'privacy.html: the game name');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // every other language file: only keys that Ukrainian has, of the same kind (text / function)
  for (const f of (await readdir(join(ROOT, 'src/i18n'))).filter((f) => /^[a-z]{2,3}(-[A-Za-z]+)?\.js$/.test(f) && f !== 'uk.js')) {
    const other = (await import(pathToFileURL(join(ROOT, 'src/i18n', f)))).default;
    for (const k of keysOf(other)) assert.equal(typeof pick(other, k), typeof pick(uk, k), `${f}: ${k}`);
  }
  // in the game: the name on the start screen and in the tab
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  assert.equal(await page.textContent('h1'), GAME_NAME);
  assert.equal(await page.title(), uk.app.pageTitle(GAME_NAME));
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'uk');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('another language is one file: src/i18n/xx.js picked with ?lang=xx and remembered; missing keys fall back to Ukrainian; ?lang=uk goes back; an unknown language = Ukrainian', async () => {
  const site = await siteCopy();
  try {
    // a partial test language: three texts (one a function), the rest from uk.js
    await writeFileFs(join(site.dir, 'src/i18n/xx.js'), `export default {
  start: { play: 'Play', h: { mic: '1. Microphone' } },
  menu: { info: (contract, diff, time, van) => \`\${contract} / \${diff} / \${time} / van \${van}\` },
};
`);
    const ctx = await newContext(browser, LAND);
    let { page, errors } = await open(ctx, site.base + '?lang=xx');
    assert.equal(await page.textContent('#start'), 'Play');
    assert.equal(await page.textContent('[data-t="start.h.mic"]'), '1. Microphone');
    assert.equal(await page.textContent('[data-t="start.h.contract"]'), '2. Контракт', 'missing key: Ukrainian');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'xx');
    await page.tap('#start');
    await page.waitForFunction(() => window.__game.playing);
    await page.evaluate(() => window.__game.pauseOpen('user'));
    assert.match(await page.textContent('#pausemenu .pm-info'), / \/ van \$/, 'a text with numbers (function) from the language file');
    assert.match(await page.textContent('#pausemenu'), /Продовжити/, 'the rest in Ukrainian');
    assert.deepEqual(errors, []);
    await page.close();
    // remembered on this device
    ({ page, errors } = await open(ctx, site.base));
    assert.equal(await page.textContent('#start'), 'Play');
    await page.close();
    // back to Ukrainian
    ({ page } = await open(ctx, site.base + '?lang=uk'));
    assert.equal(await page.textContent('#start'), 'Грати');
    await page.close();
    ({ page } = await open(ctx, site.base));
    assert.equal(await page.textContent('#start'), 'Грати');
    await page.close();
    // a language that has no file: Ukrainian, nothing remembered
    ({ page, errors } = await open(ctx, site.base + '?lang=zz'));
    assert.equal(await page.textContent('#start'), 'Грати');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'uk');
    await ctx.close();
  } finally { await site.close(); }
});
