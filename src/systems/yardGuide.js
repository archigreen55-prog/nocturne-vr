// Level 0 only («Репетиція», contract.practice): the way from the van to the gate is marked — small chalk arrows on
// the lane's apron, a big bright chalk arrow with «ЗАХОДЬ» on the ground in front of the gate (readable from the van at
// night, no blue: the blue ring and column were taken for the drop-off zone), and one hint at the closed gate. The other
// levels have none of it. (The chalk start line behind the gate is on every level: systems/startLine.js.)
// All visual (MeshBasicMaterial, fog on); nothing here reaches the guard.
import * as THREE from 'three';
import { G } from './state.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';
import { GATE, YARD_FENCE_Z } from '../world/yard.js';

let group = null, bigMat = null, glowMat = null, t = 0, hinted = false, wasOn = false, phase = '';

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

// the big arrow: a thick chalk shaft and head, a dark rim so it holds on pale asphalt too, the word at the top (the gate end)
function bigArrow(word) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 768;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(256, 730); g.lineTo(256, 300); g.moveTo(256, 215); g.lineTo(122, 372); g.moveTo(256, 215); g.lineTo(390, 372); g.stroke(); };
  g.strokeStyle = 'rgba(5,7,13,0.55)'; g.lineWidth = 62; path();
  for (const [w, a] of [[50, 0.35], [38, 0.75], [30, 1]]) { g.strokeStyle = `rgba(252,249,240,${a})`; g.lineWidth = w; path(); }
  g.textAlign = 'center'; g.font = '900 108px system-ui, sans-serif'; g.lineWidth = 22; g.strokeStyle = 'rgba(5,7,13,0.6)'; g.strokeText(word, 256, 150);
  g.fillStyle = 'rgba(252,249,240,1)'; g.fillText(word, 256, 150);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,214,140,0.9)'); r.addColorStop(0.55, 'rgba(255,190,100,0.35)'); r.addColorStop(1, 'rgba(255,190,100,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const yardGuide = {
  id: 'yardGuide',
  init() {
    if (!G.level || G.level.id !== 'dacha') return;
    group = new THREE.Group(); group.name = 'level 0 guide';
    const gx = (GATE.x0 + GATE.x1) / 2;
    // chalk arrows from the van towards the gate
    const tex = chalkArrow(), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false });
    for (const x of [6.7, 5.5, 4.3]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.475), mat);
      m.rotation.set(-Math.PI / 2, 0, Math.PI); m.position.set(x, 0.04, 9.85); m.renderOrder = 6; group.add(m);
    }
    // the big arrow in front of the gate: bright chalk, a warm glow under it, pointing into the gate; the word at the gate end
    const big = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.45), bigMat = new THREE.MeshBasicMaterial({ map: bigArrow(S.yard.enter), transparent: true, depthWrite: false, opacity: 1 }));
    big.rotation.set(-Math.PI / 2, 0, 0); big.position.set(gx, 0.055, YARD_FENCE_Z + 1.95); big.renderOrder = 8; group.add(big);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.2), glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    glow.rotation.set(-Math.PI / 2, 0, 0); glow.position.set(gx, 0.045, YARD_FENCE_Z + 1.95); glow.renderOrder = 7; group.add(glow);
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
    bigMat.opacity = 0.86 + 0.14 * Math.sin(t * 2.6); glowMat.opacity = 0.4 + 0.22 * Math.sin(t * 2.6);   // it breathes: easy to catch in the corner of the eye
    // one hint at the closed gate, once per round
    if (!hinted && G.active && G.player) {
      const gate = G.level.doors.find((d) => d.gate);
      if (gate && !gate.open && Math.hypot(G.player.head.x - gate.cx, G.player.head.z - gate.cz) < 2.2) { hinted = true; flash(S.yard.gateHint, 4, '#ffb347'); }
    }
  },
};
