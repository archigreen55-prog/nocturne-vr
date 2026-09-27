// Wrist panel on the left controller (plan §2: the tuk-tuk dashboard, moved to the wrist):
// microphone level (whisper / normal / shout) with the calibrated thresholds, step loudness,
// crouch, room, optional FPS block (X), message line and the build version.
import * as THREE from 'three';
import { LEVELS } from '../audio/mic.js';

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
    g.fillStyle = 'rgba(12, 16, 24, 0.9)';
    roundRect(g, 4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = '#3d4a63'; g.lineWidth = 4; g.stroke();
    g.textBaseline = 'alphabetic';

    // --- microphone ---
    const mic = s.mic;
    g.textAlign = 'center';
    if (mic.state === 'on') {
      const lv = LEVELS[mic.level];
      g.fillStyle = lv.color;
      g.font = 'bold 64px system-ui, sans-serif';
      g.fillText(lv.label, W / 2, 84);
      // bar: zones, thresholds, level
      const x0 = 30, x1 = W - 30, y = 108, h = 44, bw = x1 - x0;
      const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
      g.fillStyle = '#1f3b2b'; g.fillRect(x0, y, bw * pw, h);
      g.fillStyle = '#3f3a1c'; g.fillRect(x0 + bw * pw, y, bw * (ps - pw), h);
      g.fillStyle = '#4a1c1c'; g.fillRect(x0 + bw * ps, y, bw * (1 - ps), h);
      const pe = mic.barPos(mic.env);
      g.fillStyle = lv.color; g.fillRect(x0, y + 8, bw * pe, h - 16);
      g.fillStyle = '#ffffff';
      g.fillRect(x0 + bw * pw - 2, y - 6, 4, h + 12);
      g.fillRect(x0 + bw * ps - 2, y - 6, 4, h + 12);
      g.font = '24px system-ui, sans-serif'; g.fillStyle = '#9fb3c8';
      g.textAlign = 'left'; g.fillText(`${mic.env.toFixed(0)} дБ`, x0, y + h + 30);
      g.textAlign = 'right'; g.fillText(mic.calibrated ? `пороги ${mic.whisperDb.toFixed(0)} / ${mic.shoutDb.toFixed(0)}` : 'без калібрування', x1, y + h + 30);
      const problem = mic.problem;
      if (problem) { g.textAlign = 'center'; g.fillStyle = '#ff5c5c'; g.font = 'bold 22px system-ui, sans-serif'; g.fillText(problem, W / 2, 212); }
    } else {
      g.fillStyle = '#8a93a3'; g.font = 'bold 50px system-ui, sans-serif';
      g.fillText('МІК ВИМКНЕНО', W / 2, 90);
      g.font = '24px system-ui, sans-serif';
      g.fillText(mic.state === 'denied' ? 'дозвіл не надано' : 'дозволь його на стартовому екрані', W / 2, 136);
    }

    // --- body: steps, crouch, room ---
    g.textAlign = 'left'; g.font = 'bold 32px system-ui, sans-serif';
    g.fillStyle = s.stepsAudible ? '#ffb347' : '#5fd38d';
    g.fillText(s.stepsAudible ? 'Кроки: чутно' : 'Кроки: тихо', 30, 254);
    g.textAlign = 'right';
    g.fillStyle = s.crouched ? '#7fc8ff' : '#56627a';
    g.fillText(s.crouched ? (s.virtualCrouch ? 'Присів (B)' : 'Присів') : 'Стоїш', W - 30, 254);
    g.textAlign = 'left'; g.fillStyle = '#c9d3e3'; g.font = '30px system-ui, sans-serif';
    g.fillText(s.room, 30, 298);

    // --- FPS block ---
    if (this.showFps) {
      const target = s.hz || 72;
      g.fillStyle = s.fps >= target - 2 ? '#6fe06f' : s.fps >= target * 0.8 ? '#ffd166' : '#ff5c5c';
      g.font = 'bold 44px system-ui, sans-serif';
      g.fillText(`${Math.round(s.fps)} FPS`, 30, 358);
      g.font = '22px system-ui, sans-serif'; g.fillStyle = '#9fb3c8';
      const ms = (v) => (v == null ? 'н/д' : v.toFixed(1));
      g.textAlign = 'right';
      g.fillText(`${s.hz ? s.hz + ' Гц · ' : ''}CPU ${ms(s.cpuMs)} · GPU ${ms(s.gpuMs)} мс`, W - 30, 344);
      g.fillText(`${s.calls} calls · ${(s.tris / 1000).toFixed(0)}k tris`, W - 30, 370);
    }

    // --- message ---
    if (s.msg) {
      g.textAlign = 'center'; g.fillStyle = s.msgColor || '#ffd166';
      let size = 34;
      do { g.font = `bold ${size}px system-ui, sans-serif`; size -= 2; } while (g.measureText(s.msg).width > W - 50 && size > 16);
      g.fillText(s.msg, W / 2, 430);
    }

    g.textAlign = 'right'; g.font = '22px system-ui, sans-serif'; g.fillStyle = '#6f8396';
    g.fillText(`v${this.version}`, W - 30, H - 26);
    this.texture.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
