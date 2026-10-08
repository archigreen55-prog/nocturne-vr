// Draws the home-screen icons (wave T4) in Chromium and writes icons/*.png (committed):
//   icon-192.png, icon-512.png           Android / manifest
//   icon-maskable-512.png                Android adaptive icon (the picture inside the safe circle)
//   apple-touch-icon-180.png             iPhone "На початковий екран"
//   node tools/make-icons.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
const draw = (size, pad) => page.evaluate(([size, pad]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), s = size * (1 - 2 * pad), o = size * pad, X = (v) => o + v * s;
  const bg = g.createRadialGradient(size * 0.7, size * 0.25, 0, size * 0.5, size * 0.5, size * 0.75);
  bg.addColorStop(0, '#1d2a4a'); bg.addColorStop(1, '#070b16');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  // crescent moon
  g.fillStyle = '#ffd98a';
  g.beginPath(); g.arc(X(0.7), X(0.27), s * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16213c';
  g.beginPath(); g.arc(X(0.76), X(0.22), s * 0.145, 0, Math.PI * 2); g.fill();
  // stars
  g.fillStyle = '#c9d3e3';
  for (const [x, y, r] of [[0.18, 0.18, 0.012], [0.32, 0.1, 0.008], [0.45, 0.24, 0.01], [0.9, 0.5, 0.008]]) { g.beginPath(); g.arc(X(x), X(y), s * r, 0, Math.PI * 2); g.fill(); }
  // house
  g.fillStyle = '#02040a';
  g.beginPath();
  g.moveTo(X(0.12), X(0.92)); g.lineTo(X(0.12), X(0.6)); g.lineTo(X(0.42), X(0.38)); g.lineTo(X(0.72), X(0.6)); g.lineTo(X(0.72), X(0.92)); g.closePath(); g.fill();
  g.fillRect(X(0.56), X(0.42), s * 0.07, s * 0.14);   // chimney
  g.fillRect(X(0), X(0.92), s, s * 0.08);
  // one lit window, and the flashlight beam
  g.fillStyle = '#ffb347'; g.fillRect(X(0.25), X(0.66), s * 0.11, s * 0.1);
  g.fillStyle = 'rgba(255, 220, 140, 0.18)';
  g.beginPath(); g.moveTo(X(0.48), X(0.72)); g.lineTo(X(0.98), X(0.6)); g.lineTo(X(0.98), X(0.86)); g.closePath(); g.fill();
  g.fillStyle = '#5fd38d'; g.beginPath(); g.arc(X(0.48), X(0.72), s * 0.022, 0, Math.PI * 2); g.fill();
  return c.toDataURL('image/png').split(',')[1];
}, [size, pad]);
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1], ['apple-touch-icon-180.png', 180, 0]]) {
  writeFileSync(join(root, 'icons', name), Buffer.from(await draw(size, pad), 'base64'));
  console.log('icons/' + name);
}
await browser.close();
