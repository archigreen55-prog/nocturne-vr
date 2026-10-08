// Sets the build version: cache-busting ?v=<version> on every module (index.html import map),
// on main.js and the stale-page guard, version.json, and sw.js (its version and offline file list). Run before every deploy:
//   node tools/bump-version.mjs          # 0.1.0 -> 0.1.1
//   node tools/bump-version.mjs 0.2.0    # explicit
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const versionFile = join(root, 'version.json');
const htmlFile = join(root, 'index.html');
const swFile = join(root, 'sw.js');

const old = JSON.parse(readFileSync(versionFile, 'utf8')).version;
const next = process.argv[2] || old.replace(/(\d+)$/, (n) => String(+n + 1));
if (!/^[\w.-]+$/.test(next)) throw new Error(`bad version "${next}"`);

const modules = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) modules.push(relative(root, p).split('\\').join('/'));
  }
})(join(root, 'src'));
modules.sort();

let html = readFileSync(htmlFile, 'utf8');
const checks = [];
let vendor = [];
html = html.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (m, json) => {
  checks.push('importmap');
  const imports = {};
  for (const [k, v] of Object.entries(JSON.parse(json).imports)) if (!k.startsWith('./src/')) imports[k] = v;
  vendor = [...new Set(Object.values(imports).filter((v) => v.startsWith('./')))];
  // relative imports inside modules resolve to these URLs, so the map versions every module
  for (const f of modules) imports['./' + f] = `./${f}?v=${next}`;
  return `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`;
});
html = html.replace(/const PAGE_VERSION = '[^']*'/, () => { checks.push('guard'); return `const PAGE_VERSION = '${next}'`; });
html = html.replace(/<script type="module" src="src\/main\.js\?v=[^"]*">/, () => { checks.push('main'); return `<script type="module" src="src/main.js?v=${next}">`; });
if (checks.length !== 3) throw new Error('index.html: expected import map, guard and main.js script, found ' + checks.join(', '));

// the service worker: its version (a new sw.js on every deploy) and the files it keeps for offline play
const icons = readdirSync(join(root, 'icons')).filter((f) => f.endsWith('.png')).sort().map((f) => `./icons/${f}`);
const files = ['./', './index.html', './manifest.webmanifest', ...icons, ...vendor, ...modules.map((f) => `./${f}?v=${next}`)];
let sw = readFileSync(swFile, 'utf8');
const swChecks = [];
sw = sw.replace(/const VERSION = '[^']*';/, () => { swChecks.push('version'); return `const VERSION = '${next}';`; });
sw = sw.replace(/const FILES = \[[\s\S]*?\];/, () => { swChecks.push('files'); return `const FILES = ${JSON.stringify(files, null, 2)};`; });
if (swChecks.length !== 2) throw new Error('sw.js: expected VERSION and FILES, found ' + swChecks.join(', '));

writeFileSync(htmlFile, html);
writeFileSync(swFile, sw);
writeFileSync(versionFile, JSON.stringify({ version: next }) + '\n');
console.log(`version ${old} -> ${next}; ${modules.length} modules in the import map, ${files.length} files for the service worker`);
