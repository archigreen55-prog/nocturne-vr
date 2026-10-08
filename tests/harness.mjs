// Test harness: a static server for the working tree (at /nocturne-vr/ like GitHub Pages, and at
// /nocturne-vr/preview/test/ like a branch preview) and Chromium.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/markdown', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export async function startServer(root = ROOT) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const m = /^\/nocturne-vr(?:\/preview\/[^/]+)?(\/.*)$/.exec(path);
    if (!m) { res.writeHead(404); res.end(); return; }
    let rel = normalize(m[1]).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const body = await readFile(join(root, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/nocturne-vr/` };
}

// A mono 16-bit WAV: a 440 Hz tone at `amp` (0..1) for `seconds` (for the fake microphone).
export async function toneWav(amp, seconds = 4) {
  const rate = 48000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * amp * 32767), 44 + i * 2);
  const file = join(tmpdir(), `nocturne-tone-${amp}.wav`);
  await writeFile(file, buf);
  return file;
}

// A mono WAV built from segments [{ secs, amp, kind: 'tone' | 'noise' | 'silence' }] (looped by
// Chromium's fake microphone): e.g. silence, finger knocks, a shout.
export async function segmentsWav(name, segs) {
  const rate = 48000, n = Math.round(rate * segs.reduce((a, s) => a + s.secs, 0)), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let i = 0;
  for (const s of segs) {
    const m = Math.round(rate * s.secs);
    for (let k = 0; k < m && i < n; k++, i++) {
      const v = s.kind === 'tone' ? Math.sin(2 * Math.PI * 300 * k / rate) * s.amp : s.kind === 'noise' ? (Math.random() * 2 - 1) * s.amp : 0;
      buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
    }
  }
  const file = join(tmpdir(), `nocturne-${name}.wav`);
  await writeFile(file, buf);
  return file;
}

export async function launch({ micWav } = {}) {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  if (micWav) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${micWav}`);
  return chromium.launch({ args });
}

// New context. three.js is served from vendor/ (the minified bundle) like on the site; abortVendor =
// simulate it failing to load. Service workers are blocked unless sw: true (they would cache between
// pages and keep requests away from the routes); the service-worker tests opt in.
export async function newContext(browser, options = {}, { abortVendor = false, sw = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: sw ? 'allow' : 'block', ...options });
  if (abortVendor) await ctx.route('**/vendor/**', (route) => route.abort('connectionrefused'));
  return ctx;
}

// Collects page errors and console errors.
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
