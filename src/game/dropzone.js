// Drop-off marker behind the open van: a pulsing ring on the ground and a translucent amber column
// of light that fades upwards. It barely glows while your hands are empty and brightens when you
// carry loot. Walk in with loot in your hands and it flies into the van ("+$500" over the ring).
import * as THREE from 'three';
import { CFG } from './config.js';

const AMBER = 0xffb347;
const HEIGHT = 2.6;

export class DropZone {
  constructor() {
    const Z = CFG.dropZone;
    this.group = new THREE.Group();
    this.group.name = 'drop-off zone';
    this.group.position.set(Z.x, 0, Z.z);
    // ring on the ground
    const ringGeo = new THREE.RingGeometry(Z.r * 0.9, Z.r, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 6;
    // faint disc inside
    const discGeo = new THREE.CircleGeometry(Z.r * 0.9, 48);
    discGeo.rotateX(-Math.PI / 2);
    this.discMat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.disc.position.y = 0.025;
    this.disc.renderOrder = 6;
    // column: open cylinder whose vertex colours fade to black upwards (additive = transparent)
    const colGeo = new THREE.CylinderGeometry(Z.r, Z.r, HEIGHT, 48, 12, true);
    colGeo.translate(0, HEIGHT / 2, 0);
    const pos = colGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(AMBER);
    for (let i = 0; i < pos.count; i++) {
      const k = Math.pow(1 - pos.getY(i) / HEIGHT, 1.8);
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    colGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // front faces only: seen from outside it glows, from inside (standing in it) it does not tint the view
    this.colMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
    this.column = new THREE.Mesh(colGeo, this.colMat);
    this.column.renderOrder = 6;
    this.group.add(this.disc, this.ring, this.column);
    // "+$500" labels rising over the ring
    this.labels = [];
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
      sprite.scale.set(0.6, 0.225, 1);
      sprite.visible = false;
      sprite.renderOrder = 40;
      this.group.add(sprite);
      this.labels.push({ sprite, canvas, tex, t: 9 });
    }
    this.k = 0.25;       // brightness 0..1
    this.t = 0;
  }

  // Head (x, z) inside the ring?
  contains(x, z) {
    const Z = CFG.dropZone;
    return Math.hypot(x - Z.x, z - Z.z) < Z.r;
  }

  // "+$500" rising from the ring; delay (s) staggers several items.
  pop(text, delay = 0) {
    const L = this.labels.reduce((a, b) => (a.t > b.t ? a : b));   // the oldest one
    const g = L.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#1a1206'; g.strokeText(text, 128, 50);
    g.fillStyle = '#ffd166'; g.fillText(text, 128, 50);
    L.tex.needsUpdate = true;
    L.t = -delay;
    L.sprite.visible = false;
  }

  // carrying: loot in hand; head: the player's head (the column fades as you walk into it)
  update(dt, carrying, head) {
    const Z = CFG.dropZone;
    const dist = Math.hypot(head.x - Z.x, head.z - Z.z), inside = dist < Z.r;
    this.t += dt;
    const target = carrying ? (inside ? 1 : 0.8) : 0.22;
    this.k += (target - this.k) * (1 - Math.exp(-dt / 0.25));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (carrying ? 5 : 2.2));
    this.ringMat.color.setHex(AMBER).multiplyScalar(this.k * (0.65 + 0.35 * pulse));
    this.discMat.color.setHex(AMBER).multiplyScalar(this.k * 0.12);
    const near = Math.min(1, Math.max(0, (dist - Z.r) / 1.2));   // 0 inside the ring .. 1 from 1.8 m out
    this.colMat.color.setScalar(this.k * (0.12 + 0.05 * pulse) * near);
    this.column.visible = near > 0.01;
    const s = 1 + 0.05 * pulse * this.k;
    this.ring.scale.set(s, 1, s);
    for (const L of this.labels) {
      if (L.t >= 1.4) { L.sprite.visible = false; continue; }
      L.t += dt;
      if (L.t < 0) continue;
      const k = L.t / 1.4;
      L.sprite.visible = true;
      L.sprite.position.set(0, 1.6 + k * 0.7, 0);
      L.sprite.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
  }
}
