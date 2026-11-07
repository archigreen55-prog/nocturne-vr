// Draws the home-screen icons (wave T4) in Chromium and writes icons/*.png (committed):
//   icon-192.png, icon-512.png           Android / manifest
//   icon-maskable-512.png                Android adaptive icon (the picture inside the safe circle)
//   apple-touch-icon-180.png             iPhone "На початковий екран"
//   node tools/make-icons.mjs
// W17 «Стиль» S4 (plan-W17-style.md §3.8, decision 9): the monogram «HJ» (H in paper, J in the lamp's colour,
// an ink outline and a stamp's shadow, the headings' font Unbounded 800 from fonts/) on the night, under a
// flashlight's beam. The maskable one keeps it all inside the safe circle.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = readFileSync(join(root, 'fonts', 'unbounded-latin-800.woff2')).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.evaluate(async (font) => {
  const f = new FontFace('Unbounded', `url(data:font/woff2;base64,${font})`, { weight: '800' });
  document.fonts.add(await f.load());
}, font);
const draw = (size, pad) => page.evaluate(([size, pad]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), s = size * (1 - 2 * pad), o = size * pad, X = (v) => o + v * s;
  const bg = g.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.75);
  bg.addColorStop(0, '#1b2742'); bg.addColorStop(1, '#0d1322');   // the night (src/style/palette.js UI.night)
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  // the flashlight's beam from the bottom left, over the letters
  const beam = g.createLinearGradient(X(0.12), X(0.92), X(0.85), X(0.25));
  beam.addColorStop(0, 'rgba(255, 179, 71, 0.42)'); beam.addColorStop(1, 'rgba(255, 179, 71, 0)');
  g.fillStyle = beam;
  g.beginPath(); g.moveTo(X(0.13), X(0.9)); g.lineTo(X(0.62), X(0.06)); g.lineTo(X(1.02), X(0.5)); g.closePath(); g.fill();
  // HJ: the stamp's shadow, the ink outline, then the letters
  const fs = s * 0.44, y = X(0.56);
  g.font = `800 ${fs}px Unbounded`; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const wH = g.measureText('H').width, wJ = g.measureText('J').width, gap = fs * 0.02, x0 = size / 2 - (wH + gap + wJ) / 2;
  const letters = [['H', x0, '#efe6d4'], ['J', x0 + wH + gap, '#ffb347']];
  g.fillStyle = '#05070d'; g.strokeStyle = '#05070d'; g.lineWidth = fs * 0.09;
  for (const [t, x] of letters) { g.fillText(t, x + fs * 0.07, y + fs * 0.07); g.strokeText(t, x + fs * 0.07, y + fs * 0.07); }
  for (const [t, x] of letters) g.strokeText(t, x, y);
  for (const [t, x, col] of letters) { g.fillStyle = col; g.fillText(t, x, y); }
  // the lamp: where the beam starts
  g.fillStyle = '#ffb347'; g.strokeStyle = '#05070d'; g.lineWidth = s * 0.012;
  g.beginPath(); g.arc(X(0.15), X(0.88), s * 0.035, 0, Math.PI * 2); g.fill(); g.stroke();
  return c.toDataURL('image/png').split(',')[1];
}, [size, pad]);
for (const [name, size, pad] of [['icon-192.png', 192, 0.04], ['icon-512.png', 512, 0.04], ['icon-maskable-512.png', 512, 0.12], ['apple-touch-icon-180.png', 180, 0.04]]) {
  writeFileSync(join(root, 'icons', name), Buffer.from(await draw(size, pad), 'base64'));
  console.log('icons/' + name);
}
await browser.close();
