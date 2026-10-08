// Builds the minified three.js used by the game (plan-phone-mode §4, wave T4): one ES module with
// three.js and the two add-ons the game imports, so a phone downloads ~0.7 MB once instead of
// 2 MB of unminified modules from a CDN, and the service worker can keep it for offline play.
//   node tools/vendor-three.mjs      (after npm install; the output is committed)
// The import map in index.html points 'three' at vendor/three-<version>.min.js and both add-on
// specifiers at vendor/three-addons.js (re-exports from it). The file name carries the three.js
// version, so it never changes in place (the service worker may keep it forever).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;
const out = join(root, 'vendor');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^three-[\d.]+\.min\.js$/.test(f) && f !== `three-${version}.min.js`) rmSync(join(out, f));
const entry = `export * from 'three';
export { VRButton } from 'three/addons/webxr/VRButton.js';
export { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
`;
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'inline',
  outfile: join(out, `three-${version}.min.js`),
});
writeFileSync(join(out, 'three-addons.js'), `// the add-ons the game imports, from the minified bundle (tools/vendor-three.mjs)\nexport { VRButton, mergeGeometries } from 'three';\n`);
console.log(`vendor/three-${version}.min.js`);
