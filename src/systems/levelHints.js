// Campaign v2 (decisions R9 А and of 16.11): the hints of a puzzle level come in steps, only when the player does not
// get on — first Зоя whispers (a subtitle of the crew), then Зоя's chalk shows the way. Level 5 («Годинник»): the
// clock still in the house after `zoya` s of the round (or the guard got a «?» while you held it) — «Петрович дивиться
// на двері. А вікна?»; after `chalk` s (or from the start after `fails` rounds of this level without the goal) —
// a chalk ring on the flowerbed under the back window and arrows round the house («В ОБХІД»). The numbers:
// CFG.campaign.levels[].hints. Nothing reaches the guards. The round's report has which steps were shown.
//   CFG.campaign.levels[n].hints = { zoya: s, chalk: s, fails: n }; the level's `goal.item` is what must get out.
import * as THREE from 'three';
import { G } from './state.js';
import { CLASSIC, levelOf } from '../game/campaign.js';
import { loadSetting, saveSetting } from '../settings.js';
import { chalkArrow } from './yardGuide.js';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const local = { group: null, zoya: false, chalk: false, phase: '', fails: {} };
export const hintsShown = () => ({ zoya: local.zoya, chalk: local.chalk });

function ringTexture(word) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (const [w, a] of [[16, 0.3], [10, 0.65], [6, 0.9]]) { g.strokeStyle = `rgba(245,245,235,${a})`; g.lineWidth = w; g.beginPath(); g.ellipse(128, 128, 108, 108, 0, 0, Math.PI * 2); g.stroke(); }
  if (word) { g.fillStyle = 'rgba(245,245,235,0.9)'; g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(word, 128, 140); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function build() {
  const grp = new THREE.Group(); grp.name = 'level hints (chalk)';
  const FB = CFG.backWindow.flowerbed;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: ringTexture(''), transparent: true, depthWrite: false, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set((FB.x0 + FB.x1) / 2, 0.09, (FB.z0 + FB.z1) / 2); ring.renderOrder = 6; grp.add(ring);
  const mat = new THREE.MeshBasicMaterial({ map: chalkArrow(), transparent: true, opacity: 0.8, depthWrite: false });
  // round the house's east side: from the front garden north, then west to the window (the texture points to +x)
  for (const [x, z, a] of [[11.4, 1.6, Math.PI / 2], [11.4, -4.5, Math.PI / 2], [11.4, -10.5, Math.PI / 2], [8.6, -15.2, Math.PI], [6.4, -15.2, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), mat);
    m.rotation.set(-Math.PI / 2, 0, a); m.position.set(x, 0.05, z); m.renderOrder = 6; grp.add(m);
  }
  const word = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: ringTexture(S.campaign2.window.around), transparent: true, depthWrite: false, opacity: 0.9 }));
  word.rotation.x = -Math.PI / 2; word.position.set(11.4, 0.06, 3.4); word.renderOrder = 6; grp.add(word);
  grp.visible = false;
  return grp;
}
const failsOf = (id) => (loadSetting('levelFails', {})[id] || 0);
function setFails(id, n) { const all = loadSetting('levelFails', {}); all[id] = n; saveSetting('levelFails', all); }

export const levelHints = {
  id: 'levelHints',
  init() {
    if (CLASSIC || !G.level || G.level.id !== 'dacha') return;
    local.group = build(); G.scene.add(local.group); G.levelHintsGroup = local.group;
  },
  world() {
    const { round, contract } = G;
    if (!local.group || !round || !contract) return;
    const l = levelOf(contract.id), H = l && l.hints;
    if (round.phase !== local.phase) {
      const was = local.phase; local.phase = round.phase;
      if (round.phase === 'ready') { local.zoya = false; local.chalk = !!(H && failsOf(contract.id) >= H.fails); }
      if (round.phase === 'result' && H && was !== 'result') setFails(contract.id, G.verdict && G.verdict.goal ? 0 : failsOf(contract.id) + 1);
    }
    local.group.visible = !!H && local.chalk && round.phase !== 'result';
    if (!H || (round.phase !== 'heist' && round.phase !== 'escape') || G.isGuest) return;
    const it = contract.goal.item && G.loot.items.find((i) => i.id === contract.goal.item), HS = G.level.house;
    if (!it || it.delivered || it.lowering) return;
    const p = it.mesh.position, inside = p.x > HS.minX && p.x < HS.maxX && p.z > HS.minZ && p.z < HS.maxZ;
    if (!inside) return;
    const doubted = it.held && (G.guards || []).some((g) => (g.doubts || 0) > 0 || g.state === 'chase');
    if (!local.zoya && (round.t >= H.zoya || doubted)) {
      local.zoya = true;
      const L = S.campaign2.hint[contract.id];
      if (L) { G.crewLine = { name: S.crew.names[L.who] || L.who, line: L.line }; G.crewLineT = CFG.story.crew.show + 2; G.wristTimer = 0; }
    }
    if (!local.chalk && round.t >= H.chalk) local.chalk = true;
  },
};
