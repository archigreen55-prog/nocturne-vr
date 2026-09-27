// Scoreboard on a stand next to the van. During the round: the clock, loot in the van, the alarm.
// After it: the result, sum, intact / damaged / broken, whether you screamed, and buttons
// (pointed at with a controller ray and pressed with the trigger; on a laptop: crosshair + click).
import * as THREE from 'three';
import { BOARD } from '../world/level.js';

const W = 1024, H = 640;
const SIZE_W = 1.1, SIZE_H = SIZE_W * H / W;

// countdowns round up (never show 0:00 while time is left), elapsed times round down
export const fmtTime = (s, down = false) => { s = Math.max(0, down ? Math.floor(s) : Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const money = (v) => '$' + v.toLocaleString('en-US');

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
    this.mesh.position.set(BOARD.x, 1.1 + SIZE_H / 2, BOARD.z);
    this.mesh.rotation.y = BOARD.yaw;
    this.buttons = [];
    this.hover = null;
    this.t = 0;
  }

  // Button under a uv point on the board, or null.
  hit(uv) {
    const x = uv.x * W, y = (1 - uv.y) * H;
    for (const b of this.buttons) if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  // s: { phase, clock, alertLevel, tally, result, clip: { t, db } | null, playing, shouts }
  draw(s) {
    const g = this.g;
    g.fillStyle = '#0b111c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = s.phase === 'escape' ? '#ff4040' : '#3d4a63'; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, H - 12);
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

  drawRound(s) {
    const g = this.g, T = s.tally;
    g.textAlign = 'left';
    g.fillStyle = '#93a1b8'; g.font = 'bold 34px system-ui, sans-serif';
    g.fillText(s.phase === 'escape' ? 'ДО ФУРГОНА!' : s.phase === 'ready' ? 'КОНТРАКТ' : 'ЧАС', 50, 80);
    g.font = 'bold 150px system-ui, sans-serif';
    g.fillStyle = s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 ? '#ffb347' : '#e6ecf5';
    g.fillText(fmtTime(s.clock), 44, 225);
    if (s.phase === 'ready') {
      g.font = '30px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
      g.fillText('Годинник піде, щойно відійдеш від фургона', 50, 280);
    }
    g.textAlign = 'right';
    g.font = 'bold 34px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    g.fillText('У ФУРГОНІ', W - 50, 80);
    g.font = 'bold 88px system-ui, sans-serif'; g.fillStyle = '#5fd38d';
    g.fillText(money(T.sum), W - 50, 180);
    g.font = '32px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(`${T.inVan} з ${T.total} предметів`, W - 50, 228);
    const al = ['спокій', 'перевірка', 'ТРИВОГА'][s.alertLevel];
    g.textAlign = 'left'; g.font = 'bold 36px system-ui, sans-serif';
    g.fillStyle = ['#5fd38d', '#ffb347', '#ff4d4d'][s.alertLevel];
    g.fillText(`Будинок: ${al}`, 50, 350);
    g.fillStyle = '#93a1b8'; g.font = '30px system-ui, sans-serif';
    g.fillText('Клади лут у фургон (відпусти grip над кузовом).', 50, 400);
    g.fillText(s.phase === 'escape' ? 'Добіжи до фургона — втеча зарахується сама.' : 'Досить? «Поїхати» завершує контракт.', 50, 442);
    this.buttons.push({ id: 'leave', label: 'Поїхати', x: 50, y: 500, w: 330, h: 100, enabled: s.phase !== 'escape' });
    this.buttons.push({ id: 'play', label: s.playing ? 'Грає…' : 'Послухати свій крик', x: 410, y: 500, w: 564, h: 100, enabled: !!s.clip && !s.playing });
  }

  drawResult(s) {
    const g = this.g, R = s.result;
    const good = R.kind === 'left' || R.kind === 'escaped';
    g.textAlign = 'center';
    g.font = 'bold 110px system-ui, sans-serif'; g.fillStyle = good ? '#5fd38d' : '#ff4d4d';
    g.fillText(R.title, W / 2, 130);
    g.font = 'bold 64px system-ui, sans-serif'; g.fillStyle = '#e6ecf5';
    g.fillText(good ? `Здобич: ${money(R.sum)}` : `Втрачено: ${money(R.lostLoot)}`, W / 2, 215);
    g.font = '34px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(`У фургоні ${R.inVan} з ${R.total}: цілі ${R.intact} · пошкоджені ${R.damaged}${R.broken ? ` · розбито ${R.broken}` : ''}`, W / 2, 272);
    g.fillText(`Час: ${fmtTime(R.time, true)}${R.seen ? ` · помітили ${R.seen}×` : ''}${R.scares ? ` · налякали ${R.scares}×` : ''}`, W / 2, 318);
    g.font = 'bold 40px system-ui, sans-serif';
    if (R.shouts > 0) {
      g.fillStyle = '#ffb347';
      g.fillText(`Кричав: ${R.shouts}×${s.clip ? ` · найгучніше о ${fmtTime(s.clip.t, true)}` : ''}`, W / 2, 392);
    } else {
      g.fillStyle = '#7fc8ff';
      g.fillText('Жодного крику. Професіонал.', W / 2, 392);
    }
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText('Запис крику живе лише в пам\'яті гри й зникне з новим раундом.', W / 2, 440);
    this.buttons.push({ id: 'play', label: s.playing ? 'Грає…' : 'Послухати свій крик', x: 60, y: 490, w: 560, h: 110, enabled: !!s.clip && !s.playing });
    this.buttons.push({ id: 'again', label: 'Ще раз', x: 650, y: 490, w: 314, h: 110, enabled: true });
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
