// Scoreboard. During the round it stands next to the van: the clock, the sum in the van with the
// list of delivered items, the alarm. When the round ends it moves in front of the player (drawn on
// top of everything) with the result, the list, and the scream replay ("Ось як ти кричав о 3:12" is
// played once by itself, then "Ще раз послухати"). Buttons: controller ray + trigger; laptop:
// crosshair + click.
import * as THREE from 'three';
import { BOARD } from '../world/level.js';

const W = 1024, H = 640;
const SIZE_W = 1.1, SIZE_H = SIZE_W * H / W;

// countdowns round up (never show 0:00 while time is left), elapsed times round down
export const fmtTime = (s, down = false) => { s = Math.max(0, down ? Math.floor(s) : Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const money = (v) => '$' + v.toLocaleString('en-US');

export class Board {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE_W, SIZE_H), new THREE.MeshBasicMaterial({ map: this.texture, fog: false }));
    this.mesh.name = 'scoreboard';
    this.buttons = [];
    this.hover = null;
    this.placeAtStand();
  }

  placeAtStand() {
    this.mesh.position.set(BOARD.x, 1.1 + SIZE_H / 2, BOARD.z);
    this.mesh.rotation.set(0, BOARD.yaw, 0);
    this.mesh.material.depthTest = true;
    this.mesh.renderOrder = 0;
    this.floating = false;
  }

  // 1.3 m in front of the eyes, facing them, drawn over walls and the van.
  placeInFront(head, yaw) {
    const d = 1.3;
    this.mesh.position.set(head.x - Math.sin(yaw) * d, Math.max(1.0, Math.min(1.9, head.y - 0.12)), head.z - Math.cos(yaw) * d);
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.material.depthTest = false;
    this.mesh.renderOrder = 50;
    this.floating = true;
  }

  // Button under a uv point on the board, or null.
  hit(uv) {
    const x = uv.x * W, y = (1 - uv.y) * H;
    for (const b of this.buttons) if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  // s: { phase, clock, alertLevel, tally, result, clip: { t } | null, playing, recMode }
  draw(s) {
    const g = this.g;
    g.fillStyle = '#0b111c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = s.phase === 'escape' ? '#ff4040' : s.phase === 'result' ? '#ffd166' : '#3d4a63';
    g.lineWidth = 12; g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = 'alphabetic';
    this.buttons = [];
    if (s.phase === 'result') this.drawResult(s);
    else this.drawRound(s);
    for (const b of this.buttons) {
      const on = this.hover === b.id && b.enabled;
      g.fillStyle = !b.enabled ? '#1a2130' : on ? '#ffd166' : '#243049';
      roundRect(g, b.x, b.y, b.w, b.h, 18); g.fill();
      g.strokeStyle = b.enabled ? '#ffd166' : '#3a4560'; g.lineWidth = 4; g.stroke();
      g.fillStyle = on ? '#0b111c' : b.enabled ? '#ffd166' : '#5a6680';
      g.font = 'bold 36px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 13);
    }
    this.texture.needsUpdate = true;
  }

  // delivered items in two columns: "✓ Скриня  $1,200" (damaged ones in orange)
  drawList(list, y0, rows) {
    const g = this.g;
    g.font = '28px system-ui, sans-serif';
    if (!list.length) {
      g.textAlign = 'left'; g.fillStyle = '#5a6680';
      g.fillText('Поки порожньо: зайди з лутом у бурштинове кільце за фургоном.', 50, y0 + 30);
      return;
    }
    list.forEach((it, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const x = 50 + col * 470, y = y0 + 30 + row * 38;
      g.textAlign = 'left'; g.fillStyle = it.damaged ? '#ffb347' : '#c9d3e3';
      g.fillText(`${it.damaged ? '✗' : '✓'} ${it.name}${it.damaged ? ' (пошкодж.)' : ''}`, x, y);
      g.textAlign = 'right'; g.fillStyle = it.damaged ? '#ffb347' : '#5fd38d';
      g.fillText(money(it.value), x + 420, y);
    });
  }

  drawRound(s) {
    const g = this.g, T = s.tally;
    g.textAlign = 'left';
    g.fillStyle = '#93a1b8'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(s.phase === 'escape' ? 'ДО ФУРГОНА!' : s.phase === 'ready' ? 'КОНТРАКТ' : 'ЧАС', 50, 70);
    g.font = 'bold 120px system-ui, sans-serif';
    g.fillStyle = s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 ? '#ffb347' : '#e6ecf5';
    g.fillText(fmtTime(s.clock), 44, 180);
    g.textAlign = 'right';
    g.font = 'bold 30px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    g.fillText('У ФУРГОНІ', W - 50, 70);
    g.font = 'bold 84px system-ui, sans-serif'; g.fillStyle = '#5fd38d';
    g.fillText(money(T.sum), W - 50, 160);
    g.font = '28px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(`${T.inVan} з ${T.total} предметів`, W - 50, 200);
    this.drawList(T.list, 215, 4);
    const al = ['спокій', 'перевірка', 'ТРИВОГА'][s.alertLevel];
    g.textAlign = 'left'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillStyle = ['#5fd38d', '#ffb347', '#ff4d4d'][s.alertLevel];
    g.fillText(`Будинок: ${al}`, 50, 420);
    g.fillStyle = '#93a1b8'; g.font = '26px system-ui, sans-serif';
    g.fillText(s.phase === 'escape' ? 'Добіжи до фургона — втеча зарахується сама.' : 'Зайди з лутом у кільце за фургоном — він сам полетить у кузов.', 50, 462);
    this.buttons.push({ id: 'leave', label: 'Поїхати', x: 50, y: 500, w: 330, h: 100, enabled: s.phase !== 'escape' });
    this.buttons.push({ id: 'play', label: s.playing ? 'Грає…' : 'Послухати свій крик', x: 410, y: 500, w: 564, h: 100, enabled: !!s.clip && !s.playing });
  }

  drawResult(s) {
    const g = this.g, R = s.result;
    const good = R.kind === 'left' || R.kind === 'escaped';
    g.textAlign = 'left';
    g.font = 'bold 76px system-ui, sans-serif'; g.fillStyle = good ? '#5fd38d' : '#ff4d4d';
    g.fillText(R.title, 50, 95);
    g.textAlign = 'right'; g.font = 'bold 56px system-ui, sans-serif'; g.fillStyle = good ? '#e6ecf5' : '#ff9f43';
    g.fillText(good ? money(R.sum) : `−${money(R.lostLoot)}`, W - 50, 90);
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    g.fillText(good ? `у фургоні ${R.inVan} з ${R.total} · час ${fmtTime(R.time, true)}` : `лут у фургоні втрачено · час ${fmtTime(R.time, true)}`, W - 50, 126);
    this.drawList(R.list, 140, 4);
    g.textAlign = 'center';
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    const extra = [];
    if (R.broken) extra.push(`розбито ${R.broken}`);
    if (R.seen) extra.push(`помітили ${R.seen}×`);
    if (R.scares) extra.push(`налякали ${R.scares}×`);
    if (extra.length) g.fillText(extra.join(' · '), W / 2, 338);
    // the scream
    g.font = 'bold 40px system-ui, sans-serif';
    if (s.playing && s.clip) { g.fillStyle = '#ff9f43'; g.fillText(`Ось як ти кричав о ${fmtTime(s.clip.t, true)}`, W / 2, 400); }
    else if (R.shouts > 0) {
      g.fillStyle = '#ffb347';
      g.fillText(s.clip ? `Кричав: ${R.shouts}× · найгучніше о ${fmtTime(s.clip.t, true)}` : `Кричав: ${R.shouts}×`, W / 2, 400);
      if (!s.clip) { g.font = '24px system-ui, sans-serif'; g.fillStyle = '#6f8396'; g.fillText(`Запис крику не вдався (${s.recMode || 'немає запису'})`, W / 2, 436); }
    } else { g.fillStyle = '#7fc8ff'; g.fillText('Жодного крику. Професіонал.', W / 2, 400); }
    g.font = '22px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText('Запис крику живе лише в пам\'яті гри й зникне з новим раундом.', W / 2, 470);
    this.buttons.push({ id: 'play', label: s.playing ? 'Грає…' : 'Ще раз послухати', x: 50, y: 495, w: 560, h: 105, enabled: !!s.clip && !s.playing });
    this.buttons.push({ id: 'again', label: 'Новий раунд', x: 640, y: 495, w: 334, h: 105, enabled: true });
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
