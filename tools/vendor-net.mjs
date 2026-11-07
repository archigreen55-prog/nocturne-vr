// Builds the libraries for playing with friends (plan-multiplayer §1.2), like tools/vendor-three.mjs:
// one minified ES module per library in vendor/, the version in the file name (the service worker may
// keep it forever), loaded by the game only when a room is opened.
//   trystero-nostr / trystero-torrent   WebRTC rooms found through public relays (MIT, dmotz/trystero)
//   qrcode-generator                    the QR of the invitation link, drawn on the device (MIT)
//   node tools/vendor-net.mjs      (after npm install; the output is committed; index.html's import map
//                                   names the same files)
import { build } from 'esbuild';
import { readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'vendor');
mkdirSync(out, { recursive: true });
const version = (pkg) => JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;
const libs = [
  { name: 'trystero-nostr', pkg: '@trystero-p2p/nostr', entry: `export { joinRoom, selfId } from '@trystero-p2p/nostr';` },
  { name: 'trystero-torrent', pkg: '@trystero-p2p/torrent', entry: `export { joinRoom, selfId } from '@trystero-p2p/torrent';` },
  { name: 'qrcode-generator', pkg: 'qrcode-generator', entry: `import qrcode from 'qrcode-generator'; export default qrcode;` },
];
for (const { name, pkg, entry } of libs) {
  const v = version(pkg), file = `${name}-${v}.min.js`;
  for (const f of readdirSync(out)) if (f.startsWith(name + '-') && f.endsWith('.min.js') && f !== file) rmSync(join(out, f));
  await build({
    stdin: { contents: entry, resolveDir: root, loader: 'js' },
    bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'inline', platform: 'browser',
    outfile: join(out, file),
  });
  console.log(`vendor/${file}`);
}
