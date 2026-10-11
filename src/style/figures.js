// W17 «Стиль» S2 (plan-W17-style.md §2): the characters after the owner's approved sample (style/toon.js:
// the sample's own recipes — big heads, big light eyes with pupils and lids, round bodies of revolution,
// capsules and spheres, the accessories). Each figure is baked into one SkinnedMesh on "rigid bones" (every
// part follows one bone with weight 1), its outline (the sample's inverted hull: each part pushed out along
// its normals, back faces, ink) and its glowing bits (a lens, a lantern, a phone's screen): 3 draw calls,
// no model files, no loader. The figures move by style/anim.js; the game's logic never reads them.
//
// The switch «Стиль: вимк» keeps the old figures: restyle*() below do nothing then, and the old code
// that builds them (enemies/patrol.js, enemies/lurker.js, net/remotePlayer.js) stays until W17 is
// tested (the owner's rule; removed in a separate step after S5).
// The owner approves the figures' look first (style/sheet.js, ?page=figures): until then the game keeps
// the old figures even with the style on (CFG.style.figures = false); ?figures=on shows the new ones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colored } from '../world/level.js';
import { lit, STYLE_ON } from './materials.js';
import { CFG } from '../config/index.js';
import { PAL } from './palette.js';
import { quietRandom } from './quiet.js';
import { kit, TOON, shafnyk } from './toon.js';

const BONES = ['root', 'hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'poz'];
const PARENT = { hips: 'root', torso: 'hips', head: 'torso', armL: 'torso', armR: 'torso', legL: 'hips', legR: 'hips', poz: 'torso' };
const fq = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('figures') : null;
export const FIGURES_ON = STYLE_ON && (fq === 'on' || (fq !== 'off' && !!CFG.style.figures));
let EMPTY = null;   // made on first use, with crypto's random numbers (a module-level geometry would move the game's sequence even with the style off)

const hullMaterial = () => new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide, fog: true });
const glowMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
const hex = (c) => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c);

// Rita's jacket: the owner picks on the sheet (CFG.style.rita) — wine or powder pink, saturated like the
// sample's red but never the alarm's #ff5468
export const RITA = { wine: '#a83a52', powder: '#e6a0ae' };
// each thief's colour for the lobby and the names (S4): the sample's
export const THIEF_COLOURS = { zoya: 0x8ec5ea, frol: 0x8fc0e8, rita: hex(RITA.wine), nazar: 0x3a6068 };
// the figures the game and the sheet know
export const FIGURES = ['petrovych', 'valera', 'zhora', 'zoya', 'frol', 'rita', 'ritaWine', 'ritaPowder', 'nazar'];
// the sample's figures face +Z, the game's -Z: most are mirrored front to back (the hand with the
// flashlight stays on the right, where the game's beam starts); Zhora and Nazar are turned round instead
// (their lantern / notebook then lands in the hand style/anim.js moves)
export const TURN = new Set(['zhora', 'nazar']);

// ---------- baking the sample's parts ----------
// a non-indexed copy of a part's geometry with only what the figure needs
function plain(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
// mirrored geometry keeps facing out: swap two corners of each triangle
function flipWinding(g) {
  for (const a of Object.values(g.attributes)) {
    const s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i = (t + 1) * s + k, j = (t + 2) * s + k; const x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
  }
}
// the outline: the part pushed out along its normals (the sample's shader does it in the part's own space)
function pushOut(g, t) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    p[i] += n[i] / l * t; p[i + 1] += n[i + 1] / l * t; p[i + 2] += n[i + 2] / l * t;
  }
}
// the parts of a toon character in the game's figure space: { bone, geo, hull, color, glow }, the bones'
// pivots, the lens (where its light shines from)
export function toonParts(id, far = false) {
  const base = id.startsWith('rita') ? 'rita' : id;
  const K = kit(true, far);
  const jacket = id === 'ritaWine' ? RITA.wine : id === 'ritaPowder' ? RITA.powder : id === 'rita' ? RITA[CFG.style.rita] || RITA.wine : undefined;
  const t = TOON[base](K, jacket);
  const turn = TURN.has(base);
  const S = turn ? new THREE.Matrix4().makeRotationY(Math.PI) : new THREE.Matrix4().makeScale(1, 1, -1);
  t.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), W = new THREE.Matrix4();
  const at = (o) => v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(S).toArray().map((x) => +x.toFixed(4));
  const side = (g) => (at(g)[0] < 0 ? 'L' : 'R');
  const tagOf = (m) => { for (let o = m.parent; o; o = o.parent) if (o.userData.bone) return o; return null; };
  const parts = [];
  let lens = null;
  t.root.traverse((m) => {
    if (!m.isMesh) return;
    const g = tagOf(m), tag = g ? g.userData.bone : 'torso';
    const bone = tag === 'leg' || tag === 'arm' ? tag + side(g) : tag;
    W.multiplyMatrices(S, m.matrixWorld);
    const geo = plain(m.geometry);
    let hull = null;
    if (m.userData.ol > 0) { hull = geo.clone(); pushOut(hull, m.userData.ol); hull.applyMatrix4(W); if (!turn) flipWinding(hull); }
    geo.applyMatrix4(W); if (!turn) flipWinding(geo);
    parts.push({ bone, geo, hull, color: hex(m.material.color), glow: m.material.glow });
    if (m.userData.lens) { geo.computeBoundingBox(); lens = geo.boundingBox.getCenter(new THREE.Vector3()).toArray(); }
  });
  // the pivots: hips at the legs' top, the shoulders and hips from the sample's groups, the neck under the head
  const piv = {};
  const legs = t.legs.map(at), hipY = legs.length ? Math.max(...legs.map((p) => p[1])) : 1;
  piv.hips = [0, hipY, 0]; piv.torso = [0, hipY, 0];
  for (const g of t.legs) piv['leg' + side(g)] = at(g);
  for (const g of t.arms) piv['arm' + side(g)] = at(g);
  const hc = at(t.head), R = t.head.userData.R || 0.25;
  piv.head = [hc[0], hc[1] - R * 0.85, hc[2]]; piv.hy = hc[1];
  if (t.shush) piv.shush = true;
  if (t.book) piv.book = true;
  // Pozikhailo on a guard's left shoulder (story-bible: «тінь на плечі»; the sample has none): a lump of
  // shadow with whisper-coloured eyes
  if (['petrovych', 'valera', 'zhora'].includes(base) && piv.armL) {
    const [x, y, z] = piv.armL, py = y + 0.1;
    const lump = new THREE.SphereGeometry(0.08, 8, 6).scale(1.1, 0.85, 1).translate(x * 0.9, py, z + 0.02);
    const h = plain(lump); const hl = h.clone(); pushOut(hl, 0.012);
    parts.push({ bone: 'poz', geo: h, hull: hl, color: 0x232c48, glow: false });
    for (const s of [-1, 1]) parts.push({ bone: 'poz', geo: plain(new THREE.SphereGeometry(0.018, 6, 4).translate(x * 0.9 + s * 0.03, py + 0.015, z - 0.05)), hull: null, color: PAL.whisper, glow: true });
    piv.poz = [x * 0.9, py, z];
  } else piv.poz = piv.torso;
  return { parts, piv, lens, h: t.h };
}

// one geometry with the skin attributes (every part on its bone, weight 1)
function skinMerge(list) {
  if (!list.length) return null;
  const geos = list.map(({ geo, color, bone }) => {
    const g = colored(geo, color);
    g.attributes.ink.array.fill(0);   // figures get the outline, not face lines
    const n = g.attributes.position.count, b = BONES.indexOf(bone);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? b : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    return g;
  });
  const out = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return out;
}

// A figure: { root, mesh, hull, glow, bones, rest, pivots, headY, lens, lod(far) }. Two levels of detail on
// one skeleton: near, and from FAR metres one with about half the segments (style system: by the distance
// to the camera). Off screen a figure is not drawn (a fixed bounding sphere that holds every pose).
export const FAR = 9;
export function makeFigure(id) {
  const who = FIGURES.includes(id) ? id : 'zoya';
  const near = toonParts(who), far = toonParts(who, true), piv = near.piv;
  const bones = {}, list = [];
  for (const name of BONES) {
    const b = new THREE.Bone(); b.name = name;
    const p = piv[name] || [0, 0, 0], par = PARENT[name] && piv[PARENT[name]] ? piv[PARENT[name]] : [0, 0, 0];
    if (name !== 'root') b.position.set(p[0] - par[0], p[1] - par[1], p[2] - par[2]);
    bones[name] = b; list.push(b);
  }
  for (const name of BONES) if (PARENT[name]) bones[PARENT[name]].add(bones[name]);
  const skeleton = new THREE.Skeleton(list);
  const root = new THREE.Group();
  root.name = 'style: figure';
  const bound = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
  let first = null;
  const level = ({ parts }) => {
    const mesh = new THREE.SkinnedMesh(skinMerge(parts.filter((p) => !p.glow)), lit({ grade: 0, lift: CFG.style.figureLift }));   // the characters keep their colours (the dusk grade is the world's)
    if (!first) { first = mesh; mesh.add(bones.root); mesh.updateMatrixWorld(true); mesh.bind(skeleton); skeleton.computeBoneTexture(); }   // the bone texture now, not at the first frame: its name takes Math.random (style/quiet.js)
    else mesh.bind(skeleton, first.bindMatrix);
    const hull = new THREE.SkinnedMesh(skinMerge(parts.filter((p) => p.hull).map((p) => ({ ...p, geo: p.hull, color: PAL.ink }))), hullMaterial());
    hull.bind(skeleton, first.bindMatrix);
    const lights = parts.filter((p) => p.glow);
    let glow = null;
    if (lights.length) { glow = new THREE.SkinnedMesh(skinMerge(lights), glowMaterial()); glow.bind(skeleton, first.bindMatrix); }
    const out = [mesh, hull, glow].filter(Boolean);
    for (const m of out) { m.boundingSphere = bound; root.add(m); }
    for (const p of parts) { p.geo.dispose(); if (p.hull) p.hull.dispose(); }
    return { mesh, hull, glow, all: out };
  };
  const N = level(near), F = level(far);
  for (const m of F.all) m.visible = false;
  const rest = Object.fromEntries(BONES.map((n) => [n, bones[n].position.clone()]));
  const fig = { root, mesh: N.mesh, hull: N.hull, glow: N.glow, far: F, near: N, bones, rest, pivots: piv, headY: piv.hy || 1.66, lens: near.lens, isFar: false };
  fig.lod = (isFar) => { if (isFar === fig.isFar) return; fig.isFar = isFar; for (const m of N.all) m.visible = !isFar; for (const m of F.all) m.visible = isFar; };
  return fig;
}

// ---------- restyling the game's figures (one call in each file; nothing when the style is off) ----------
function hideOld(mesh) {
  if (!EMPTY) EMPTY = quietRandom(() => new THREE.BufferGeometry());
  if (mesh && mesh.isMesh) mesh.geometry = EMPTY;
}

// a guard (enemies/patrol.js): the old body / upper stay as the anchors of the lamp, the beam and the
// bucket (they keep turning with the gaze); the figure turns its torso the same way (style/anim.js). The
// flashlight's spot and beam (or the hand lamp's light) move to the figure's lens: light only, the
// stealth still counts from the guard
const OLD_LENS = [0.29, 1.31, -0.62], OLD_LAMP = [0.29, 1.25, -0.5];
export function restyleGuard(p, GC = {}) {
  if (!FIGURES_ON) return;
  const id = ['petrovych', 'valera', 'zhora'].includes(GC.id) ? GC.id : 'petrovych';
  const fig = quietRandom(() => makeFigure(id));   // the game's random numbers untouched (style/quiet.js)
  hideOld(p.body); hideOld(p.upper);
  p.group.add(fig.root);
  p.fig = fig; fig.kind = 'guard'; fig.who = id;
  if (fig.lens) {
    const d = (from) => new THREE.Vector3(fig.lens[0] - from[0], fig.lens[1] - from[1], fig.lens[2] - from[2]);
    if (p.spot) { const D = d(OLD_LENS); p.spot.position.add(D); if (p.spotTarget) p.spotTarget.position.add(D); if (p.beam) p.beam.position.add(D); }
    if (p.lamp) { const D = d(OLD_LAMP); p.lamp.position.add(D); if (p.halo) p.halo.position.add(D); }
  }
}
// a friend (net/remotePlayer.js)
export function restyleFriend(rp) {
  if (!FIGURES_ON) return;
  const fig = quietRandom(() => makeFigure(rp.thief));
  hideOld(rp.body); hideOld(rp.headMesh);
  rp.group.add(fig.root);
  rp.fig = fig; fig.kind = 'thief'; fig.who = rp.thief; fig.phase = 0;
}

// the lurker (enemies/lurker.js; the wardrobe's and the garage crate's), Шафник, after the sample: a lump
// of darkness in the gap, glowing whisper-coloured eyes WITHOUT pupils (it is blind), long thin arms
// with four fingers, a sock on the wardrobe's door. Its parts keep their pivots, so the lurker's own
// animation (telegraph, lunge, sleep) moves them as before. Each comes with its outline.
function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const geos = [], hulls = [];
  group.traverse((m) => {
    if (!m.isMesh) return;
    const g = plain(m.geometry);
    if (m.userData.ol > 0) { const h = g.clone(); pushOut(h, m.userData.ol); h.applyMatrix4(m.matrixWorld); hulls.push(h); }
    g.applyMatrix4(m.matrixWorld);
    geos.push(colored(g, hex(m.material.color)));
  });
  const geo = mergeGeometries(geos, false), hull = hulls.length ? mergeGeometries(hulls, false) : null;
  [...geos, ...hulls].forEach((g) => g.dispose());
  return { geo, hull };
}
export function lurkerGeometries() {
  const lump = plain(new THREE.SphereGeometry(0.3, 10, 7).scale(1.05, 0.95, 0.9));
  const lumpHull = lump.clone(); pushOut(lumpHull, 0.014);
  const S = shafnyk(kit(true));
  const eyes = bakeGroup(S.eyes), arms = bakeGroup(S.arms), sock = bakeGroup(S.sock);
  return { body: colored(lump, 0x0d1220), bodyHull: lumpHull, arms: arms.geo, armsHull: arms.hull, eyes: eyes.geo, eyesHull: eyes.hull, sock: sock.geo, sockHull: sock.hull };
}
// where the sock hangs in the lurker's door leaf (lurker.js D1: the knob at x -0.03, y 0.9..1.1, z 0.66..0.7)
export const SOCK_AT = [-0.04, 0.82, 0.66];
export function restyleLurker(L) {
  if (!FIGURES_ON) return;
  quietRandom(() => {
    const g = lurkerGeometries();
    L.body.geometry = g.body; L.arms.geometry = g.arms; L.eyes.geometry = g.eyes;
    const outline = (geo, name, parent) => { const h = new THREE.Mesh(geo, hullMaterial()); h.name = name; parent.add(h); return h; };
    outline(g.bodyHull, 'style: wardrobe outline', L.body);
    outline(g.armsHull, 'style: arms outline', L.arms);
    outline(g.eyesHull, 'style: eyes outline', L.eyes);
    if (L.door1 && L.kind !== 'crate') {
      const sock = new THREE.Mesh(g.sock, L.body.material); sock.name = 'style: sock'; sock.position.fromArray(SOCK_AT); L.door1.add(sock);
      outline(g.sockHull, 'style: sock outline', sock);
    }
  });
}
export { hullMaterial };
