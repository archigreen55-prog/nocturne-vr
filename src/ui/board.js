// Scoreboard. During the round it stands next to the van: the clock, the sum in the van with the
// list of delivered items, the alarm. When the round ends it moves in front of the player (drawn on
// top of everything) with the result, the list, and the scream replay ("Ось як ти кричав о 3:12" is
// played once by itself, then "Ще раз послухати"). Buttons: controller ray + trigger; laptop:
// crosshair + click.
import * as THREE from 'three';
import { S } from '../i18n/index.js';

const W = 1024, H = 640;
const SIZE_W = 1.1, SIZE_H = SIZE_W * H / W;

// countdowns round up (never show 0:00 while time is left), elapsed times round down
export const fmtTime = (s, down = false) => { s = Math.max(0, down ? Math.floor(s) : Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const money = (v) => '$' + v.toLocaleString('en-US');

export class Board {
  constructor(stand) {
    this.stand = stand;
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
    this.mesh.position.set(this.stand.x, 1.1 + SIZE_H / 2, this.stand.z);
    this.mesh.rotation.set(0, this.stand.yaw, 0);
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
    for (const b of this.buttons) if (b.enabled !== false && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
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
    else if (s.phase === 'ready' && s.page === 'mic') this.drawMic(s);
    else if (s.phase === 'ready' && s.page === 'map' && s.maps) this.drawMap(s);
    else if (s.phase === 'ready') this.drawContract(s);
    else this.drawRound(s);
    for (const b of this.buttons) {
      if (b.enabled === undefined) b.enabled = true;
      const on = this.hover === b.id && b.enabled;
      g.fillStyle = !b.enabled ? '#1a2130' : on ? '#ffd166' : '#243049';
      roundRect(g, b.x, b.y, b.w, b.h, 18); g.fill();
      g.strokeStyle = b.enabled ? '#ffd166' : '#3a4560'; g.lineWidth = 4; g.stroke();
      g.fillStyle = on ? '#0b111c' : b.enabled ? '#ffd166' : '#5a6680';
      g.font = `bold ${b.font || 36}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.font || 36) * 0.36);
    }
    this.texture.needsUpdate = true;
  }

  // delivered items in two columns: "✓ Скриня  $1,200" (damaged ones in orange)
  drawList(list, y0, rows, step = 38) {
    const g = this.g;
    g.font = step < 38 ? '25px system-ui, sans-serif' : '28px system-ui, sans-serif';
    if (!list.length) {
      g.textAlign = 'left'; g.fillStyle = '#5a6680';
      g.fillText(S.board.emptyVan, 50, y0 + 30);
      return;
    }
    list.forEach((it, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const x = 50 + col * 470, y = y0 + 30 + row * step;
      g.textAlign = 'left'; g.fillStyle = it.damaged ? '#ffb347' : '#c9d3e3';
      g.fillText(`${it.damaged ? '✗' : '✓'} ${it.name}${it.damaged ? S.hud.damagedMark : ''}`, x, y);
      g.textAlign = 'right'; g.fillStyle = it.damaged ? '#ffb347' : '#5fd38d';
      g.fillText(money(it.value), x + 420, y);
    });
  }

  drawRound(s) {
    const g = this.g, T = s.tally;
    g.textAlign = 'left';
    g.fillStyle = '#93a1b8'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(s.phase === 'escape' ? S.board.toVan : s.phase === 'ready' ? S.board.contract : S.board.time, 50, 70);
    g.font = 'bold 120px system-ui, sans-serif';
    g.fillStyle = s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 ? '#ffb347' : '#e6ecf5';
    g.fillText(fmtTime(s.clock), 44, 180);
    g.textAlign = 'right';
    g.font = 'bold 30px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    g.fillText(S.board.inVan, W - 50, 70);
    g.font = 'bold 84px system-ui, sans-serif'; g.fillStyle = '#5fd38d';
    g.fillText(money(T.sum), W - 50, 160);
    g.font = '28px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(S.board.items(T.inVan, T.total), W - 50, 200);
    this.drawList(T.list, 215, 4);
    const al = [S.board.alert.calm, S.board.alert.check, S.board.alert.alarm][s.alertLevel];
    g.textAlign = 'left'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillStyle = ['#5fd38d', '#ffb347', '#ff4d4d'][s.alertLevel];
    g.fillText(S.board.house(al), 50, 420);
    g.fillStyle = s.progress && s.progress.done ? '#5fd38d' : '#c9d3e3'; g.font = 'bold 26px system-ui, sans-serif';
    g.fillText(`${s.contract.name}: ${s.progress ? s.progress.text : ''}${s.progress && s.progress.done ? ' ✓' : ''}`, 50, 462);
    g.textAlign = 'right'; g.fillStyle = '#93a1b8'; g.font = '24px system-ui, sans-serif';
    g.fillText(s.phase === 'escape' ? S.board.runToVan : `${s.diffName}`, W - 50, 420);
    this.buttons.push({ id: 'leave', label: S.board.leave, x: 50, y: 500, w: 330, h: 100, enabled: s.phase !== 'escape' });
    this.buttons.push({ id: 'play', label: s.playing ? S.board.playing : S.board.listen, x: 410, y: 500, w: 564, h: 100, enabled: !!s.clip && !s.playing });
  }

  // Before the round (at the van): pick the contract and the difficulty; the microphone page.
  drawContract(s) {
    const g = this.g, C = s.contract;
    g.textAlign = 'left';
    g.font = 'bold 26px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    g.fillText(S.board.contractN(s.contractIndex + 1, s.contractCount), 50, 62);
    g.textAlign = 'right'; g.fillText(S.board.timeLeft(fmtTime(s.clock)), W - 50, 62);
    g.textAlign = 'left'; g.font = 'bold 58px system-ui, sans-serif'; g.fillStyle = C.locked ? '#6f8396' : '#ffd166';   // W6: a locked placeholder is grey
    g.fillText(C.name, 50, 128);
    g.font = '27px system-ui, sans-serif'; g.fillStyle = C.locked ? '#93a1b8' : '#e6ecf5';
    wrap(g, C.brief, 50, 172, W - 100, 34);
    g.font = '25px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(S.board.goal(s.goalText), 50, 262);
    g.fillText(S.board.bonus(s.bonusText), 50, 296);
    g.fillText(S.board.hard, 50, 330);
    const B = s.best || {};
    g.fillStyle = '#93a1b8'; g.font = '24px system-ui, sans-serif';
    g.fillText(S.board.records(B), 50, 374);
    if (C.needsMic && s.noMic) { g.fillStyle = '#ff9f43'; g.fillText(S.board.needsMic, 50, 408); }
    g.fillStyle = '#6f8396'; g.font = '22px system-ui, sans-serif';
    g.fillText(S.board.pickHere, 50, 440);
    this.buttons.push({ id: 'cprev', label: '◀', x: 50, y: 470, w: 110, h: 120, font: 48 });
    this.buttons.push({ id: 'cnext', label: '▶', x: 175, y: 470, w: 110, h: 120, font: 48 });
    if (s.maps) {   // W6: more than one map: a «Карта…» page
      this.buttons.push({ id: 'diff', label: S.board.difficulty(s.diffName), x: 300, y: 470, w: 300, h: 120, font: 30 });
      this.buttons.push({ id: 'mappage', label: S.board.mapPage, x: 615, y: 470, w: 170, h: 120, font: 30 });
      this.buttons.push({ id: 'micpage', label: S.board.micPage, x: 800, y: 470, w: 174, h: 120, font: 30 });
    } else {
      this.buttons.push({ id: 'diff', label: S.board.difficulty(s.diffName), x: 300, y: 470, w: 380, h: 120, font: 32 });
      this.buttons.push({ id: 'micpage', label: S.board.micPage, x: 695, y: 470, w: 279, h: 120, font: 32 });
    }
  }

  // W6: the maps of the game; picking another one reloads the page with ?map=<id>
  drawMap(s) {
    const g = this.g;
    g.textAlign = 'left';
    g.font = 'bold 44px system-ui, sans-serif'; g.fillStyle = '#ffd166';
    g.fillText(S.board.mapTitle, 50, 80);
    g.font = '25px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    wrap(g, S.board.mapHint, 50, 130, W - 100, 32);
    let y = 230;
    for (const m of s.maps) {
      const label = m.current ? S.board.mapCurrent(m.name) : m.open ? m.name : S.board.mapSoon(m.name);
      this.buttons.push({ id: 'map:' + m.id, label, x: 50, y, w: 640, h: 90, font: 32, enabled: m.open && !m.current });
      g.font = '24px system-ui, sans-serif'; g.fillStyle = '#93a1b8'; g.textAlign = 'left';
      g.fillText(m.blurb || '', 720, y + 55);
      y += 110;
    }
    this.buttons.push({ id: 'back', label: '◀', x: 858, y: 510, w: 116, h: 90, font: 44 });
  }

  drawMic(s) {
    const g = this.g, M = s.mic;
    g.textAlign = 'left';
    g.font = 'bold 44px system-ui, sans-serif'; g.fillStyle = '#ffd166';
    g.fillText(S.board.micTitle, 50, 80);
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    const status = M.noMic ? S.board.mic.noMic : M.state !== 'on' ? S.board.mic.off : M.calibrated ? S.board.mic.calibrated : S.board.mic.notCalibrated;
    g.fillText(status, 320, 78);
    if (s.calib) {   // the wizard is running
      g.font = 'bold 40px system-ui, sans-serif'; g.fillStyle = s.calib.phase === 'rec' ? '#ff9f43' : '#93a1b8';
      g.fillText(S.board.calibStep(s.calib.i + 1, s.calib.total || 4, s.calib.step.title.toUpperCase(), s.calib.left.toFixed(1)), 50, 150);
      g.font = '28px system-ui, sans-serif'; g.fillStyle = '#e6ecf5';
      wrap(g, s.calib.phase === 'rec' ? s.calib.step.say : S.board.getReady, 50, 196, W - 100, 34);
    } else if (s.calibNotes) {
      g.font = '24px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
      wrap(g, s.calibNotes, 50, 140, W - 100, 30);
    }
    // live level with both boundaries
    if (M.state === 'on' && !M.noMic) {
      const x0 = 50, bw = W - 100, y = 262, h = 48;
      const pw = M.barPos(M.whisperDb), ps = M.barPos(M.shoutDb);
      g.fillStyle = '#1f3b2b'; g.fillRect(x0, y, bw * pw, h);
      g.fillStyle = '#3f3a1c'; g.fillRect(x0 + bw * pw, y, bw * (ps - pw), h);
      g.fillStyle = '#4a1c1c'; g.fillRect(x0 + bw * ps, y, bw * (1 - ps), h);
      g.fillStyle = s.levelColor; g.fillRect(x0, y + 10, bw * M.barPos(M.env), h - 20);
      g.fillStyle = '#fff'; g.fillRect(x0 + bw * pw - 2, y - 6, 4, h + 12); g.fillRect(x0 + bw * ps - 2, y - 6, 4, h + 12);
      g.font = '24px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
      g.fillText(S.board.whisperDb(M.whisperDb.toFixed(0)), 50, 346);
      g.textAlign = 'right'; g.fillText(S.board.shoutDb(M.shoutDb.toFixed(0)), W - 50, 346);
      g.textAlign = 'left'; g.font = 'bold 28px system-ui, sans-serif'; g.fillStyle = s.levelColor;
      g.fillText(S.board.levelDb(s.levelLabel, M.env.toFixed(0)), 50, 386);
    }
    const on = M.state === 'on' && !M.noMic, busy = !!s.calib;
    if (!on && !M.noMic) this.buttons.push({ id: 'micon', label: S.board.micOnButton, x: 50, y: 410, w: 420, h: 80, font: 30 });
    else this.buttons.push({ id: 'cal', label: s.calSteps === 5 ? S.board.calibrate5 : S.board.calibrate4, x: 50, y: 410, w: 420, h: 80, font: 30, enabled: on && !busy });
    this.buttons.push({ id: 'nomic', label: M.noMic ? S.board.noMicYes : S.board.noMicNo, x: 490, y: 410, w: 484, h: 80, font: 30, enabled: !busy });
    this.buttons.push({ id: 'wdn', label: S.board.whisperDown, x: 50, y: 510, w: 200, h: 90, font: 30, enabled: on && !busy });
    this.buttons.push({ id: 'wup', label: S.board.whisperUp, x: 262, y: 510, w: 200, h: 90, font: 30, enabled: on && !busy });
    this.buttons.push({ id: 'sdn', label: S.board.shoutDown, x: 474, y: 510, w: 180, h: 90, font: 30, enabled: on && !busy });
    this.buttons.push({ id: 'sup', label: S.board.shoutUp, x: 666, y: 510, w: 180, h: 90, font: 30, enabled: on && !busy });
    this.buttons.push({ id: 'back', label: '◀', x: 858, y: 510, w: 116, h: 90, font: 44, enabled: !busy });
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
    g.fillText(good ? S.board.res.kept(R.inVan, R.total, fmtTime(R.time, true)) : S.board.res.lost(fmtTime(R.time, true)), W - 50, 126);
    this.drawList(R.list, 140, 4, 34);
    g.textAlign = 'center';
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
    const extra = [];
    if (R.broken) extra.push(S.board.res.broken(R.broken));
    if (R.seen) extra.push(S.board.res.seen(R.seen));
    if (R.scares) extra.push(S.board.res.scared(R.scares));
    if (extra.length) g.fillText(extra.join(' · '), W / 2, 330);
    // the contract
    if (s.verdict) {
      const V = s.verdict;
      g.font = 'bold 34px system-ui, sans-serif'; g.fillStyle = V.stars ? '#ffd166' : '#ff9f43';
      g.fillText(`${s.contract.name}: ${'★'.repeat(V.stars)}${'☆'.repeat(3 - V.stars)}${V.newBest ? S.board.res.newBest : ''}`, W / 2, 368);
      g.font = '22px system-ui, sans-serif'; g.fillStyle = '#93a1b8';
      g.fillText(V.goal ? S.board.res.goalOk(s.bonusText, V.bonus, V.bonus && s.difficulty !== 'hard') : S.board.res.goalFail(V.why.join(', ')), W / 2, 396);
    }
    // the scream
    g.font = 'bold 32px system-ui, sans-serif';
    if (s.playing && s.clip) { g.fillStyle = '#ff9f43'; g.fillText(S.board.res.screamAt(fmtTime(s.clip.t, true)), W / 2, 440); }
    else if (R.shouts > 0) {
      g.fillStyle = '#ffb347';
      g.fillText(s.clip ? S.board.res.shouts(R.shouts, fmtTime(s.clip.t, true)) : S.board.res.shoutsNoClip(R.shouts, s.recMode || '—'), W / 2, 440);
    } else { g.fillStyle = '#7fc8ff'; g.fillText(s.noMic ? S.board.mic.noMic : S.board.res.noShouts, W / 2, 440); }
    g.font = '20px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText(S.board.res.memoryOnly, W / 2, 474);
    this.buttons.push({ id: 'play', label: s.playing ? S.board.playing : S.board.res.listenAgain, x: 50, y: 495, w: 560, h: 105, enabled: !!s.clip && !s.playing });
    this.buttons.push({ id: 'again', label: S.board.res.newRound, x: 640, y: 495, w: 334, h: 105, enabled: true });
  }
}

function wrap(g, text, x, y, maxW, lh) {
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = word; } else line = t;
  }
  if (line) g.fillText(line, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
