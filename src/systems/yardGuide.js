// Level 0 only («Репетиція», contract.practice): the way from the van to the gate is marked — chalk arrows on
// the lane's apron, a blue ring and a pale column of light over the gate (visible above the fence from the yard
// too, for the way back), and one hint at the closed gate. The other levels have none of it.
// All visual (MeshBasicMaterial, fog on); nothing here reaches the guard.
import * as THREE from 'three';
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';
import { GATE, YARD_FENCE_Z } from '../world/yard.js';

const BLUE = 0x78aaff, HEIGHT = 3.4;
let group = null, ring = null, ringMat = null, colMat = null, t = 0, hinted = false, wasOn = false, phase = '';

function chalkArrow() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, a] of [[16, 0.35], [10, 0.7], [6, 0.9]]) {
    g.strokeStyle = `rgba(245,245,235,${a})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(26, 66); g.lineTo(208, 62); g.moveTo(208, 62); g.lineTo(158, 24); g.moveTo(208, 62); g.lineTo(160, 104); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const yardGuide = {
  id: 'yardGuide',
  init() {
    if (!G.level || G.level.id !== 'dacha') return;
    group = new THREE.Group(); group.name = 'level 0 guide';
    const gx = (GATE.x0 + GATE.x1) / 2, gz = YARD_FENCE_Z + 2.2;
    // chalk arrows from the van towards the gate
    const tex = chalkArrow(), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false });
    for (const x of [6.7, 5.5, 4.3]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.475), mat);
      m.rotation.set(-Math.PI / 2, 0, Math.PI); m.position.set(x, 0.04, 9.85); m.renderOrder = 6; group.add(m);
    }
    // the beacon: a ring on the ground outside the gate and a pale column
    const rg = new THREE.RingGeometry(0.75, 0.9, 48); rg.rotateX(-Math.PI / 2);
    ringMat = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    ring = new THREE.Mesh(rg, ringMat); ring.position.set(gx, 0.05, gz); ring.renderOrder = 6; group.add(ring);
    const cg = new THREE.CylinderGeometry(0.85, 0.85, HEIGHT, 32, 10, true); cg.translate(0, HEIGHT / 2, 0);
    const pos = cg.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(BLUE);
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(1 - pos.getY(i) / HEIGHT, 1.7); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    colMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
    colMat.color.setScalar(0.22);
    const column = new THREE.Mesh(cg, colMat); column.position.set(gx, 0, gz); column.renderOrder = 6; group.add(column);
    group.visible = false;
    G.scene.add(group);
    G.yardGuide = group;
  },
  world(dt) {
    if (!group) return;
    const on = !!(G.contract && G.contract.practice);
    if (on !== wasOn) { group.visible = on; wasOn = on; hinted = false; }
    if (!on) return;
    if (G.round && G.round.phase !== phase) { phase = G.round.phase; if (phase === 'ready') hinted = false; }   // a new round: the hint again
    t += dt;
    ringMat.color.setHex(BLUE).multiplyScalar(0.45 + 0.25 * Math.sin(t * 2.4));
    // one hint at the closed gate, once per round
    if (!hinted && G.active && G.player) {
      const gate = G.level.doors.find((d) => d.gate);
      if (gate && !gate.open && Math.hypot(G.player.head.x - gate.cx, G.player.head.z - gate.cz) < 2.2) { hinted = true; flash(S.yard.gateHint, 4, '#78aaff'); }
    }
  },
};
