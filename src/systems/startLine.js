// The chalk start line, on every map that has one (level.startMark): where the clock starts, so the start is not a guess.
//   the dacha: a line across the gate, just inside it («СТАРТ») — the clock starts when anybody is through (CFG.round.startRegion);
//   the mansion: a dashed arc round the van, on the ring CFG.round.startDist from the drop-off ring — the old rule, now visible.
// Shown only before the start (phase «ready»); the banner and the sound come when it is crossed (systems/goBanner.js). All visual
// (MeshBasicMaterial); nothing here reaches the guard.
import * as THREE from 'three';
import { G } from './state.js';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

let group = null, mats = [], t = 0;

// the chalk word on a plane (white, a soft halo); `line`: a bar over it (the dacha's line)
function chalkWord(text, line) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  if (line) for (const [w, a] of [[24, 0.3], [15, 0.6], [9, 0.97]]) { g.strokeStyle = `rgba(250,246,236,${a})`; g.lineWidth = w; g.beginPath(); g.moveTo(20, 40); g.lineTo(1004, 40); g.stroke(); }
  g.textAlign = 'center'; g.font = '800 118px system-ui, sans-serif';
  for (const [w, a] of [[22, 0.25], [12, 0.5]]) { g.strokeStyle = `rgba(250,246,236,${a})`; g.lineWidth = w; g.lineJoin = 'round'; g.strokeText(text, 512, 200); }
  g.fillStyle = 'rgba(250,246,236,0.98)'; g.fillText(text, 512, 200);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const basic = (tex) => { const m = new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : 0xfaf6ec, transparent: true, depthWrite: false, opacity: 0.95 }); mats.push(m); return m; };

export const startLine = {
  id: 'startLine',
  init() {
    group = null; mats = [];
    const M = G.level && G.level.startMark;
    if (!M) return;
    group = new THREE.Group(); group.name = 'start line';
    if (M.kind === 'line') {
      const w = M.x1 - M.x0, m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25), basic(chalkWord(S.yard.start, true)));
      m.rotation.set(-Math.PI / 2, 0, 0);   // the word reads for someone coming through the gate northwards (-Z)
      m.position.set((M.x0 + M.x1) / 2, 0.05, M.z + w * 0.25 * 0.5 - 0.11); m.renderOrder = 7; group.add(m);
    } else if (M.kind === 'arc') {
      const V = CFG.round.vanZone, r = CFG.round.startDist, a = Math.acos(Math.max(-1, Math.min(1, (M.minX - V.x) / r)));
      const dash = CFG.start.mark.dash / r, step = (CFG.start.mark.dash + CFG.start.mark.gap) / r, mat = basic(null);
      for (let th = -a; th + dash <= a; th += step) {
        const g = new THREE.RingGeometry(r - 0.07, r + 0.07, 4, 1, th, dash); g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, mat); m.position.set(V.x, 0.05, V.z); m.renderOrder = 7; group.add(m);
      }
      // the word on the ground at the north and the south point, upright for someone walking out from the van
      for (const dir of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), basic(chalkWord(S.yard.start, false)));
        m.rotation.set(-Math.PI / 2, 0, dir > 0 ? Math.PI : 0);
        m.position.set(V.x, 0.05, V.z + dir * (r + 0.55)); m.renderOrder = 7; group.add(m);
      }
    }
    G.scene.add(group);
  },
  world(dt) {
    if (!group) return;
    group.visible = !!G.round && G.round.phase === 'ready' && G.active !== false;
    if (!group.visible) return;
    t += dt;
    const o = 0.82 + 0.15 * Math.sin(t * 2.2);
    for (const m of mats) m.opacity = o;
  },
};
