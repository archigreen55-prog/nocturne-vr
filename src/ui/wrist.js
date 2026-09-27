// Wrist panel on the left controller (plan §2: the tuk-tuk dashboard, moved to the wrist):
// breath ring (A), microphone level (whisper / normal / shout) with the calibrated thresholds, the
// clock and alarm, step loudness, crouch, what you hold / room, optional FPS block (X), message
// line and the build version.
import * as THREE from 'three';
import { LEVELS } from '../audio/mic.js';
import { fmtTime } from './board.js';

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
    this.mesh.position.set(-0.24, -0.13, -0.45);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.setScalar(1.1);
  }

  draw(s) {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.fillStyle = s.alertLevel === 2 ? 'rgba(40, 8, 10, 0.92)' : 'rgba(12, 16, 24, 0.9)';
    roundRect(g, 4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = ['#3d4a63', '#b07a2a', '#ff3b3b'][s.alertLevel || 0]; g.lineWidth = 5; g.stroke();
    g.textBaseline = 'alphabetic';

    // --- breath ring (A): blue = holding (time left), grey = cooldown, white = ready ---
    const b = s.breath, cx = 66, cy = 70, r = 40;
    g.lineWidth = 10;
    g.strokeStyle = '#26314a'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = b.state === 'holding' ? '#4fb3ff' : b.state === 'cooldown' ? '#6a7385' : '#c9d3e3';
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.ring); g.stroke();
    g.fillStyle = b.state === 'holding' ? '#4fb3ff' : '#c9d3e3'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('A', cx, cy + 11);

    // --- microphone ---
    const mic = s.mic;
    g.textAlign = 'center';
    if (mic.state === 'on') {
      const lv = LEVELS[mic.level];
      if (b.state === 'holding') { g.fillStyle = '#4fb3ff'; g.font = 'bold 50px system-ui, sans-serif'; g.fillText('ЗАТАМУВАВ', 300, 86); }
      else { g.fillStyle = lv.color; g.font = 'bold 56px system-ui, sans-serif'; g.fillText(lv.label, 300, 88); }
      // bar: zones, thresholds, level
      const x0 = 30, x1 = W - 30, y = 128, h = 38, bw = x1 - x0;
      const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
      g.fillStyle = '#1f3b2b'; g.fillRect(x0, y, bw * pw, h);
      g.fillStyle = '#3f3a1c'; g.fillRect(x0 + bw * pw, y, bw * (ps - pw), h);
      g.fillStyle = '#4a1c1c'; g.fillRect(x0 + bw * ps, y, bw * (1 - ps), h);
      const pe = mic.barPos(mic.env);
      g.fillStyle = b.state === 'holding' ? '#4fb3ff' : lv.color; g.fillRect(x0, y + 7, bw * pe, h - 14);
      g.fillStyle = '#ffffff';
      g.fillRect(x0 + bw * pw - 2, y - 5, 4, h + 10);
      g.fillRect(x0 + bw * ps - 2, y - 5, 4, h + 10);
      const problem = mic.problem;
      g.font = problem ? 'bold 22px system-ui, sans-serif' : '22px system-ui, sans-serif';
      g.fillStyle = problem ? '#ff5c5c' : '#6f8396';
      g.textAlign = problem ? 'center' : 'left';
      g.fillText(problem || `${mic.env.toFixed(0)} дБ`, problem ? W / 2 : x0, y + h + 26);
    } else {
      g.fillStyle = '#8a93a3'; g.font = 'bold 44px system-ui, sans-serif';
      g.fillText('МІК ВИМКНЕНО', 300, 88);
      g.font = '22px system-ui, sans-serif';
      g.fillText(mic.state === 'denied' ? 'дозвіл не надано' : 'дозволь його на стартовому екрані', W / 2, 150);
    }

    // --- clock and alarm ---
    g.textAlign = 'left'; g.font = 'bold 60px system-ui, sans-serif';
    g.fillStyle = s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 ? '#ffb347' : '#e6ecf5';
    g.fillText(s.phase === 'result' ? '—:—' : fmtTime(s.clock), 30, 262);
    g.textAlign = 'right'; g.font = 'bold 32px system-ui, sans-serif';
    g.fillStyle = ['#5fd38d', '#ffb347', '#ff4d4d'][s.alertLevel || 0];
    g.fillText(s.phase === 'escape' ? 'ДО ФУРГОНА!' : ['спокій', 'перевірка', 'ТРИВОГА'][s.alertLevel || 0], W - 30, 256);

    // --- body: steps, crouch; hands ---
    g.textAlign = 'left'; g.font = 'bold 28px system-ui, sans-serif';
    g.fillStyle = s.stepsAudible ? '#ffb347' : '#5fd38d';
    g.fillText(s.stepsAudible ? 'Кроки: чутно' : 'Кроки: тихо', 30, 306);
    g.textAlign = 'right';
    g.fillStyle = s.crouched ? '#7fc8ff' : '#56627a';
    g.fillText(s.crouched ? (s.virtualCrouch ? 'Присів (B)' : 'Присів') : 'Стоїш', W - 30, 306);
    g.textAlign = 'left'; g.font = '26px system-ui, sans-serif'; g.fillStyle = '#c9d3e3';
    g.fillText(s.holding ? `У руках: ${s.holding}` : s.room, 30, 344);
    if (s.holding) { g.textAlign = 'right'; g.fillStyle = '#6f8396'; g.fillText(s.room, W - 30, 344); }

    // --- FPS block ---
    if (this.showFps) {
      const target = s.hz || 72;
      g.textAlign = 'left';
      g.fillStyle = s.fps >= target - 2 ? '#6fe06f' : s.fps >= target * 0.8 ? '#ffd166' : '#ff5c5c';
      g.font = 'bold 36px system-ui, sans-serif';
      g.fillText(`${Math.round(s.fps)} FPS`, 30, 392);
      g.font = '20px system-ui, sans-serif'; g.fillStyle = '#9fb3c8';
      const ms = (v) => (v == null ? 'н/д' : v.toFixed(1));
      g.textAlign = 'right';
      g.fillText(`${s.hz ? s.hz + ' Гц · ' : ''}CPU ${ms(s.cpuMs)} · GPU ${ms(s.gpuMs)} мс`, W - 30, 378);
      g.fillText(`${s.calls} calls · ${(s.tris / 1000).toFixed(0)}k tris`, W - 30, 402);
    }

    // --- message ---
    if (s.msg) {
      g.textAlign = 'center'; g.fillStyle = s.msgColor || '#ffd166';
      let size = 34;
      do { g.font = `bold ${size}px system-ui, sans-serif`; size -= 2; } while (g.measureText(s.msg).width > W - 50 && size > 16);
      g.fillText(s.msg, W / 2, 452);
    }

    g.textAlign = 'right'; g.font = '20px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText(`v${this.version}`, W - 30, H - 22);
    this.texture.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
