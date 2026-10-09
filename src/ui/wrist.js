// Wrist panel on the left controller (plan §2: the tuk-tuk dashboard, moved to the wrist):
// breath ring (A), microphone level (whisper / normal / shout) with the calibrated thresholds, the
// clock and alarm, step loudness, crouch, what you hold / room, optional FPS block (X), message
// line and the build version.
import * as THREE from 'three';
import { LEVELS } from '../audio/mic.js';
import { fmtTime, money } from './board.js';
import { S } from '../i18n/index.js';

const W = 512, H = 512;
const SIZE = 0.12;   // m

export class WristPanel {
  constructor(version) {
    this.version = version;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, fog: false, depthTest: true }));
    this.mesh.name = 'wrist panel';
    this.mesh.renderOrder = 10;
    this.showFps = false;
    this.onGrip = false;
  }

  // Place on the left controller grip (VR) or in the corner of the laptop view.
  // Grip space -Z runs along the handle (tilted ~45° up from where the controller points), so +Z
  // is the bottom of the handle, next to the wrist; +X is towards the thumb side of the left hand.
  attachToGrip(grip) {
    grip.add(this.mesh);
    this.mesh.material.depthTest = true;
    this.mesh.renderOrder = 10;
    this.mesh.position.set(0.02, 0, 0.13);
    this.mesh.scale.setScalar(1);
    this.onGrip = true;
  }
  // On the wrist the panel always turns to face the eyes (readable at any hand angle).
  faceEye(eye) {
    if (!this.onGrip) return;
    this.mesh.parent.updateWorldMatrix(true, false);
    this.mesh.lookAt(eye);
  }
  attachToCamera(camera) {
    this.onGrip = false;
    camera.add(this.mesh);
    this.mesh.material.depthTest = false;   // laptop HUD: never hidden by furniture right in front of you
    this.mesh.renderOrder = 60;
    this.mesh.position.set(-0.24, -0.13, -0.45);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.setScalar(1.1);
  }

  // Phone: top-left corner of the view, a little larger (the joystick owns the bottom left).
  placeCorner(camera) {
    if (this.onGrip) return;
    const d = 0.45, halfH = d * Math.tan(camera.fov * Math.PI / 360), halfW = halfH * camera.aspect, s = Math.min(1.9, halfH * 0.85 / SIZE), half = SIZE * s / 2;
    this.mesh.position.set(-halfW + half + 0.012, halfH - half - 0.012, -d);
    this.mesh.scale.setScalar(s);
  }

  draw(s) {
    const g = this.g, b = s.breath, holding = b.state === 'holding';
    g.clearRect(0, 0, W, H);
    g.fillStyle = holding ? 'rgba(8, 22, 44, 0.94)' : s.alertLevel === 2 ? 'rgba(40, 8, 10, 0.92)' : 'rgba(12, 16, 24, 0.9)';
    roundRect(g, 4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = holding ? '#4fb3ff' : ['#3d4a63', '#b07a2a', '#ff3b3b'][s.alertLevel || 0];
    g.lineWidth = holding ? 10 : 5; g.stroke();
    g.textBaseline = 'alphabetic';

    // --- breath ring (A / Shift): blue = holding (time left), grey = recovering, white = ready ---
    const cx = 66, cy = 70, r = 40;
    g.lineWidth = 10;
    g.strokeStyle = '#26314a'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = holding ? '#4fb3ff' : b.state === 'cooldown' ? '#6a7385' : '#c9d3e3';
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.ring); g.stroke();
    g.fillStyle = holding ? '#4fb3ff' : '#c9d3e3'; g.textAlign = 'center';
    if (b.state === 'ready') { g.font = 'bold 30px system-ui, sans-serif'; g.fillText('A', cx, cy + 11); }
    else { g.font = 'bold 26px system-ui, sans-serif'; g.fillText(b.left.toFixed(b.left < 10 ? 1 : 0), cx, cy + 9); }

    // --- microphone ---
    const mic = s.mic;
    g.textAlign = 'center';
    if (holding) {
      // holding the breath: the game does not hear the mic at all
      g.fillStyle = '#4fb3ff'; g.font = 'bold 50px system-ui, sans-serif'; g.fillText(S.wrist.breathHeld, 300, 80);
      g.font = 'bold 26px system-ui, sans-serif'; g.fillStyle = '#9fd4ff';
      g.fillText(S.wrist.breathLeft(b.left.toFixed(1)), 300, 120);
      if (mic.state === 'on') {
        const x0 = 30, bw = W - 60, y = 142;
        g.fillStyle = '#16324f'; g.fillRect(x0, y, bw, 24);
        g.fillStyle = '#2e6aa0'; g.fillRect(x0, y + 5, bw * mic.barPos(mic.env), 14);
      }
    } else if (mic.state === 'on') {
      const lv = LEVELS[mic.level];
      g.fillStyle = lv.color; g.font = 'bold 56px system-ui, sans-serif'; g.fillText(lv.label, 300, 88);
      // bar: zones, thresholds, level
      const x0 = 30, x1 = W - 30, y = 120, h = 36, bw = x1 - x0;
      const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
      g.fillStyle = '#1f3b2b'; g.fillRect(x0, y, bw * pw, h);
      g.fillStyle = '#3f3a1c'; g.fillRect(x0 + bw * pw, y, bw * (ps - pw), h);
      g.fillStyle = '#4a1c1c'; g.fillRect(x0 + bw * ps, y, bw * (1 - ps), h);
      g.fillStyle = lv.color; g.fillRect(x0, y + 7, bw * mic.barPos(mic.env), h - 14);
      g.fillStyle = '#ffffff';
      g.fillRect(x0 + bw * pw - 2, y - 5, 4, h + 10);
      g.fillRect(x0 + bw * ps - 2, y - 5, 4, h + 10);
      const problem = mic.problem;
      g.font = problem ? 'bold 22px system-ui, sans-serif' : '22px system-ui, sans-serif';
      g.fillStyle = problem ? '#ff5c5c' : '#6f8396';
      g.textAlign = problem ? 'center' : 'left';
      g.fillText(problem || S.hud.micDb(mic.env.toFixed(0), s.speaking), problem ? W / 2 : x0, y + h + 26);
    } else {
      g.fillStyle = '#8a93a3'; g.font = 'bold 44px system-ui, sans-serif';
      g.fillText(S.hud.micOff, 300, 88);
      g.font = '22px system-ui, sans-serif';
      g.fillText(mic.state === 'denied' ? S.mic.err.denied : S.wrist.allowOnStart, W / 2, 150);
    }

    // --- clock and alarm ---
    g.textAlign = 'left'; g.font = 'bold 56px system-ui, sans-serif';
    g.fillStyle = s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 ? '#ffb347' : '#e6ecf5';
    g.fillText(s.phase === 'result' ? '—:—' : fmtTime(s.clock), 30, 244);
    g.textAlign = 'right'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillStyle = ['#5fd38d', '#ffb347', '#ff4d4d'][s.alertLevel || 0];
    g.fillText(s.phase === 'escape' ? S.board.toVan : [S.board.alert.calm, S.board.alert.check, S.board.alert.alarm][s.alertLevel || 0], W - 30, 238);

    // --- body: steps, crouch; hands; the van ---
    g.textAlign = 'left'; g.font = 'bold 26px system-ui, sans-serif';
    g.fillStyle = s.stepsAudible ? '#ffb347' : '#5fd38d';
    g.fillText(s.stepsAudible ? S.hud.stepsLoud : S.hud.stepsQuiet, 30, 284);
    // visibility: eye open (seen from afar) / half (crouched) / closed (hidden behind cover)
    const st = s.stealth;
    if (st) {
      const color = st.eye === 'closed' ? '#5fd38d' : st.eye === 'half' ? '#ffd166' : st.lit ? '#ff5c5c' : '#ffb347';
      const text = st.eye === 'closed' ? S.hud.hidden : S.hud.stanceRange(s.virtualCrouch ? S.wrist.crouchedB : s.crouched ? S.hud.crouched : S.hud.standing, st.range.toFixed(1));
      g.textAlign = 'right'; g.fillStyle = color; g.font = 'bold 24px system-ui, sans-serif';
      g.fillText(text, W - 30, 284);
      drawEye(g, W - 30 - g.measureText(text).width - 32, 276, st.eye, color);
    }
    g.textAlign = 'left'; g.font = '24px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(s.holding ? S.hud.holding(s.holding) : s.room, 30, 320);
    if (s.holding) { g.textAlign = 'right'; g.fillStyle = '#6f8396'; g.fillText(s.room, W - 30, 320); }
    g.textAlign = 'left'; g.font = 'bold 26px system-ui, sans-serif';
    if (s.goal) { g.fillStyle = s.goal.done ? '#5fd38d' : '#c9d3e3'; g.fillText(S.hud.goal(s.goal.text, s.goal.done), 30, 360); }
    else { g.fillStyle = '#5fd38d'; g.fillText(S.wrist.van(money(s.vanSum || 0), s.vanCount || 0), 30, 360); }

    // --- FPS block ---
    if (this.showFps) {
      const target = s.hz || 72;
      g.textAlign = 'left';
      g.fillStyle = s.fps >= target - 2 ? '#6fe06f' : s.fps >= target * 0.8 ? '#ffd166' : '#ff5c5c';
      g.font = 'bold 30px system-ui, sans-serif';
      g.fillText(`${Math.round(s.fps)} FPS`, 30, 400);
      g.font = '18px system-ui, sans-serif'; g.fillStyle = '#9fb3c8';
      const ms = (v) => (v == null ? S.wrist.na : v.toFixed(1));
      g.textAlign = 'right';
      g.fillText(S.wrist.timing(s.hz, ms(s.cpuMs), ms(s.gpuMs)), W - 30, 388);
      g.fillText(`${s.calls} calls · ${(s.tris / 1000).toFixed(0)}k tris`, W - 30, 410);
    }

    // --- door hint while dragging a door, else the message line ---
    let msg = s.msg, color = s.msgColor;
    if (!msg && s.guardText) { msg = s.guardText; color = '#9fb3c8'; }
    if (s.door) {
      msg = s.door.creak > 0 ? S.wrist.doorCreaks(s.door.creak > 0.5) : S.wrist.doorQuiet;
      color = s.door.creak > 0 ? (s.door.creak > 0.5 ? '#ff5c5c' : '#ffb347') : '#5fd38d';
    }
    if (msg) {
      g.textAlign = 'center'; g.fillStyle = color || '#ffd166';
      let size = 34;
      do { g.font = `bold ${size}px system-ui, sans-serif`; size -= 2; } while (g.measureText(msg).width > W - 50 && size > 16);
      g.fillText(msg, W / 2, 454);
    }

    g.textAlign = 'right'; g.font = '18px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText(`v${this.version}`, W - 30, H - 20);
    this.texture.needsUpdate = true;
  }
}

// Almond eye: 'open' (with pupil), 'half' (upper lid down), 'closed' (a lid line).
function drawEye(g, cx, cy, state, color) {
  const w = 22, h = 15;
  g.save();
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3.5; g.lineCap = 'round';
  if (state === 'closed') {
    g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy + h, cx + w, cy); g.stroke();
    for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(cx + k * w, cy + h * 0.45 * (1 - k * k)); g.lineTo(cx + k * w * 1.2, cy + h * 0.9); g.stroke(); }
    g.restore();
    return;
  }
  g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy - h * 1.3, cx + w, cy); g.quadraticCurveTo(cx, cy + h * 1.3, cx - w, cy); g.closePath(); g.stroke();
  g.save(); g.clip();
  g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
  if (state === 'half') { g.fillStyle = 'rgba(12, 16, 24, 1)'; g.fillRect(cx - w, cy - h * 1.3, w * 2, h * 1.3); }
  g.restore();
  if (state === 'half') { g.beginPath(); g.moveTo(cx - w, cy); g.lineTo(cx + w, cy); g.stroke(); }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
