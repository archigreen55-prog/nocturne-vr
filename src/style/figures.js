// W17 «Стиль» S2 (plan-W17-style.md §2): the characters, built in code from simple shapes on "rigid
// bones" — every part follows one bone with weight 1, the whole figure is one SkinnedMesh (one draw
// call) plus its outline (the same parts a little bigger, back faces, ink colour: one more call).
// No model files, no loader. The figures move by style/anim.js; the game's logic never reads them.
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

const BONES = ['root', 'hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'poz'];
const PARENT = { hips: 'root', torso: 'hips', head: 'torso', armL: 'torso', armR: 'torso', legL: 'hips', legR: 'hips', poz: 'torso' };
const fq = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('figures') : null;
export const FIGURES_ON = STYLE_ON && (fq === 'on' || (fq !== 'off' && !!CFG.style.figures));
let EMPTY = null;   // made on first use, with crypto's random numbers (a module-level geometry would move the game's sequence even with the style off)

// A figure's parts: each shape in the figure's space (feet at y = 0, facing -Z), on one bone.
class Parts {
  constructor() { this.list = []; }
  add(bone, geo, color, { hull = true, t = 0.016 } = {}) {
    this.list.push({ bone: BONES.indexOf(bone), geo, color, hull, t });   // every shape used here is indexed (mergeGeometries)
    return this;
  }
  box(bone, x0, y0, z0, x1, y1, z1, color, o) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(bone, g, color, o);
  }
  // a sphere of radius r at (x, y, z), stretched by (sx, sy, sz)
  ball(bone, r, x, y, z, color, sx = 1, sy = 1, sz = 1, o) {
    const [w, h] = (o && o.seg) || (r < 0.035 ? [5, 3] : r < 0.08 ? [6, 4] : r < 0.16 ? [7, 4] : [9, 6]);   // few triangles (20 / 36 / 42 / 90): a toon ball reads by its outline
    const g = new THREE.SphereGeometry(r, w, h);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    return this.add(bone, g, color, o);
  }
  // a cylinder from its bottom centre; axis: 'y' (up) or 'z' (pointing forward, -Z)
  cyl(bone, rTop, rBot, h, x, y, z, color, axis = 'y', o) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, Math.max(rTop, rBot) < 0.08 ? 6 : 8);
    if (axis === 'z') { g.rotateX(-Math.PI / 2); g.translate(x, y, z - h / 2); } else g.translate(x, y + h / 2, z);
    return this.add(bone, g, color, o);
  }
}

// one geometry with the skin attributes; hull: every part grown by its t around its own centre
function skinGeometry(parts, hull) {
  const geos = [];
  const box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();
  for (const p of parts) {
    if (hull && !p.hull) continue;
    let g = p.geo.clone();
    if (hull) {
      g.computeBoundingBox(); box.copy(g.boundingBox); box.getCenter(c); box.getSize(s);
      g.translate(-c.x, -c.y, -c.z);
      g.scale(1 + 2 * p.t / Math.max(s.x, 0.02), 1 + 2 * p.t / Math.max(s.y, 0.02), 1 + 2 * p.t / Math.max(s.z, 0.02));
      g.translate(c.x, c.y, c.z);
    }
    colored(g, hull ? PAL.ink : p.color);
    g.attributes.ink.array.fill(0);   // figures get the outline, not face lines
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? p.bone : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    geos.push(g);
  }
  const out = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return out;
}

const hullMaterial = () => new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide, fog: true });

// pivots: { hips: [x, y, z], torso, head, armL, armR, legL, legR, poz } in the figure's space
export function buildFigure(recipe) {
  const P = new Parts();
  const piv = recipe(P);
  const bones = {}, list = [];
  for (const name of BONES) {
    const b = new THREE.Bone(); b.name = name;
    const at = piv[name] || [0, 0, 0], par = PARENT[name] && piv[PARENT[name]] ? piv[PARENT[name]] : [0, 0, 0];
    if (name !== 'root') b.position.set(at[0] - par[0], at[1] - par[1], at[2] - par[2]);
    bones[name] = b; list.push(b);
  }
  for (const name of BONES) if (PARENT[name]) bones[PARENT[name]].add(bones[name]);
  const skeleton = new THREE.Skeleton(list);
  const mesh = new THREE.SkinnedMesh(skinGeometry(P.list, false), lit({ grade: 0.12 }));
  mesh.add(bones.root);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton);
  skeleton.computeBoneTexture();   // now, not at the first frame: its texture's name takes Math.random (see style/quiet.js)
  const hull = new THREE.SkinnedMesh(skinGeometry(P.list, true), hullMaterial());
  hull.bind(skeleton, mesh.bindMatrix);
  mesh.frustumCulled = hull.frustumCulled = false;
  const root = new THREE.Group();
  root.name = 'style: figure';
  root.add(mesh, hull);
  const rest = Object.fromEntries(BONES.map((n) => [n, bones[n].position.clone()]));
  return { root, mesh, hull, bones, rest, pivots: piv, headY: piv.hy || 1.66 };   // headY: the head's centre
}

// ---------- the recipes: the owner's references (nocturne-vr-docs: concept/characters/*.jpg) ----------
// Simple shapes after the art: each keeps its silhouette, its colours and one or two props that say who
// it is. Faces: white eyes with dark pupils, brows, a nose; the moves add the rest (style/anim.js).
const EYE_WHITE = 0xfdfbf5, HAIR = 0x5a4234, SKIN_PALE = 0xf2dfc4, NAVY = 0x1f2a44, NAVY_D = 0x161d30, GINGER = 0xe6a24c, CREAM = PAL.paper, GOLD = 0xe8b448;
// the owner's colours: close to the references, the reds muted (never the alarm's #ff5468), the guards a
// step lighter than the walls (they must not sink into the night)
const TERRA = 0xb05a42, BORDO = 0x7e3442, NOSE = 0xcf7e6a;   // armbands, beanie, headphones / small dark reds / a round nose
const GUARD_NAVY = 0x55679a, GUARD_NAVY2 = 0x4d6094, GUARD_CAP = 0x3e4f7c, GUARD_LEGS = 0x34446a;   // a step lighter than the walls
const LILAC = 0xa48fd8, BLUE_OV = 0x6fa2d6, TEAL = 0x4f7d89;   // Nazar's teal: a step lighter than the first sheet
export const RITA = { wine: 0xa44a5c, powder: 0xdda6ae };   // a step lighter than the first sheet (in the shadow she sank)   // two muted reds for Rita: the owner picks (CFG.style.rita)
// legs, shoes, torso (a box, or a ball when round), a head; returns the bones' pivots
const HEAD_K = 1.3;   // the owner: heads 1.3x the first recipes, so the faces read from 5–6 m
function body(P, o) {
  const { legH, hipW, legW, torsoW, torsoH, torsoD, coat, legs, skin = SKIN_PALE, shoe = NAVY_D, sole = null } = o;
  const headR = o.headR * HEAD_K;
  const top = legH + torsoH;
  for (const s of [-1, 1]) {
    const leg = s < 0 ? 'legL' : 'legR', x = s * hipW;
    P.box(leg, x - legW, 0.08, -legW * 0.9, x + legW, legH + 0.04, legW * 0.9, legs);
    P.box(leg, x - legW - 0.015, 0.025, -legW - 0.09, x + legW + 0.015, 0.11, legW + 0.02, shoe);
    if (sole) P.box(leg, x - legW - 0.02, 0, -legW - 0.1, x + legW + 0.02, 0.03, legW + 0.025, sole, { hull: false });
  }
  if (o.round) P.ball('torso', torsoW / 2, 0, legH + torsoH * 0.47, 0, coat, 1, torsoH / torsoW * 1.05, torsoD / torsoW, { seg: [8, 5] });
  else P.box('torso', -torsoW / 2, legH - 0.02, -torsoD / 2, torsoW / 2, top, torsoD / 2, coat);
  const hy = top + headR * 0.95;
  P.ball('head', headR, 0, hy, 0, skin);
  return {
    hips: [0, legH, 0], torso: [0, legH, 0], head: [0, top, 0], headR, top, hy,
    armL: [-(torsoW / 2 + 0.05), top - 0.06, 0], armR: [torsoW / 2 + 0.05, top - 0.06, 0],
    legL: [-hipW, legH, 0], legR: [hipW, legH, 0],
  };
}
// eyes: big whites with a dark pupil (they must read as eyes from 5–6 m, not as dark glasses); sleepy = the
// upper lid a third down; bags = a faint shade under; thin brows above; a nose
function face(P, hy, r, { look = 'open', nose = null, noseR = 0.22, brows = NAVY_D, browsLow = 0, bags = false, skin = SKIN_PALE } = {}) {
  for (const s of [-1, 1]) {
    const x = s * r * 0.4, y = hy + r * 0.12, z = -r * 0.84;
    P.ball('head', r * 0.27, x, y, z, EYE_WHITE, 1, 1.15, 0.55, { hull: false });
    P.ball('head', r * 0.115, x - s * r * 0.02, y - r * 0.03, z - r * 0.12, PAL.ink, 1, 1.1, 0.6, { hull: false });
    if (look === 'sleepy') P.box('head', x - r * 0.29, y + r * 0.12, z - r * 0.17, x + r * 0.29, y + r * 0.34, z + r * 0.05, skin, { hull: false });
    if (bags) P.ball('head', r * 0.13, x, y - r * 0.32, z + r * 0.04, 0xb9a6b4, 1.6, 0.5, 0.45, { hull: false, seg: [5, 3] });
    if (brows) P.box('head', x - r * 0.26, y + r * (0.4 - browsLow), z + r * 0.02, x + r * 0.26, y + r * (0.46 - browsLow), z + r * 0.08, brows, { hull: false });
  }
  if (nose) P.ball('head', r * noseR, 0, hy - r * 0.16, -r * 0.98, nose, 1, 1, 1, { seg: [6, 4] });
}
// an arm hanging from the shoulder, its glove / hand at the end
function armDown(P, bone, sx, top, len, w, color, hand = NAVY_D) {
  P.box(bone, sx - w, top - len, -w, sx + w, top + 0.04, w, color);
  P.ball(bone, w * 1.25, sx, top - len - w * 0.7, 0, hand, 1, 1, 1, { seg: [6, 4] });
}
// the arm with the light, held forward: hand at (sx, y, -reach)
function armForward(P, bone, sx, top, y, reach, w, color, hand = NAVY_D) {
  P.box(bone, sx - w, Math.min(top, y) - w, -reach + 0.06, sx + w, Math.max(top, y) + w, w, color);
  P.ball(bone, w * 1.25, sx, y, -reach, hand, 1, 1, 1, { seg: [6, 4] });
}
const band = (P, bone, sx, y, w, color) => P.box(bone, sx - w - 0.012, y - 0.04, -w - 0.012, sx + w + 0.012, y + 0.04, w + 0.012, color);   // an armband / a cuff
// the flashlight: its lens where the spot light shines from (patrol.js: (0.29, 1.31, -0.62))
function flashlight(P, bone, r, len, ring = null) {
  P.cyl(bone, r * 0.7, r * 0.7, len * 0.6, 0.29, 1.31 - r * 0.7, -0.62 + len, NAVY, 'z');
  P.cyl(bone, r, r * 0.75, len * 0.4, 0.29, 1.31 - r, -0.62 + len * 0.4, NAVY, 'z');
  P.add(bone, new THREE.CircleGeometry(r * 0.9, 6).rotateY(Math.PI).translate(0.29, 1.31 - r * 0.9, -0.627), PAL.lamp, { hull: false });   // the lens
  if (ring) P.cyl(bone, r * 0.75, r * 0.75, 0.03, 0.29, 1.31 - r * 0.75, -0.62 + len * 0.55, ring, 'z', { hull: false });
}
// Pozikhailo on the left shoulder: a lump of shadow with whisper-coloured eyes
function pozikhailo(P, x, y) {
  P.ball('poz', 0.075, x, y + 0.06, 0.02, 0x232c48, 1.1, 0.85, 1);
  for (const s of [-1, 1]) P.ball('poz', 0.016, x + s * 0.028, y + 0.075, -0.045, PAL.whisper, 1, 1, 1, { hull: false });
  return [x, y, 0.02];
}
const ring = (P, bone, r, tube, x, y, z, color, vertical = false, o) => {
  const g = new THREE.TorusGeometry(r, tube, 3, 8);
  if (!vertical) g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return P.add(bone, g, color, o);
};

export const RECIPES = {
  // Петрович: very round in a quilted navy jacket, a flat cap, a big ginger moustache, a red nose, sleepy
  // eyes with bags, a red armband, an orange thermos at the belt, the flashlight
  petrovych(P) {
    const c = body(P, { legH: 0.6, hipW: 0.11, legW: 0.08, torsoW: 0.72, torsoH: 0.7, torsoD: 0.6, headR: 0.21, coat: GUARD_NAVY, legs: GUARD_LEGS, round: true });
    const { top, hy, headR: r } = c;
    for (const y of [1.08]) ring(P, 'torso', 0.33 * Math.sqrt(Math.max(0.2, 1 - ((y - 0.93) / 0.4) ** 2)), 0.008, 0, y, 0, NAVY_D, false, { hull: false });   // the quilting
    ring(P, 'torso', 0.315, 0.035, 0, 0.77, 0, NAVY_D, false, { hull: false });   // the belt
    P.cyl('torso', 0.055, 0.055, 0.22, 0.3, 0.66, 0.12, 0xf0a040);            // the thermos
    P.box('torso', 0.245, 0.88, 0.065, 0.355, 0.93, 0.175, TERRA, { hull: false });   // its cap
    face(P, hy, r, { look: 'sleepy', nose: NOSE, noseR: 0.28, bags: true, brows: GINGER });
    P.ball('head', r * 0.36, -r * 0.3, hy - r * 0.38, -r * 0.82, GINGER, 1.4, 0.75, 0.7, { seg: [6, 4] });   // the moustache
    P.ball('head', r * 0.36, r * 0.3, hy - r * 0.38, -r * 0.82, GINGER, 1.4, 0.75, 0.7, { seg: [6, 4] });
    P.cyl('head', r * 1.18, r * 1.05, 0.08, 0, hy + r * 0.62, 0.02, GUARD_CAP);    // the cap
    P.box('head', -r * 0.75, hy + r * 0.62, -r * 1.5, r * 0.75, hy + r * 0.62 + 0.025, -r * 0.6, GUARD_CAP);
    armDown(P, 'armL', -0.38, top - 0.08, 0.38, 0.075, GUARD_NAVY);
    armForward(P, 'armR', 0.36, top - 0.08, 1.31, 0.5, 0.075, GUARD_NAVY);
    band(P, 'armR', 0.36, top - 0.18, 0.075, TERRA);
    flashlight(P, 'armR', 0.045, 0.24);
    c.poz = pozikhailo(P, -0.22, top - 0.04);
    return c;
  },
  // Валера: broad and square, navy with a paper stripe across the chest, a gold badge, a red armband, a
  // peaked cap with a badge, a heavy jaw, a grumpy look, the BIG flashlight with a red ring
  valera(P) {
    const c = body(P, { legH: 0.84, hipW: 0.13, legW: 0.09, torsoW: 0.74, torsoH: 0.72, torsoD: 0.42, headR: 0.19, coat: GUARD_NAVY2, legs: GUARD_LEGS, sole: 0x8fb2d6 });
    const { top, hy, headR: r } = c;
    P.box('torso', -0.375, 1.2, -0.215, 0.375, 1.28, 0.215, CREAM, { hull: false });   // the stripe
    P.box('torso', -0.2, 1.36, -0.222, -0.14, 1.42, -0.212, GOLD, { hull: false });     // the badge
    P.box('torso', -0.37, 0.84, -0.215, 0.37, 0.9, 0.215, NAVY_D);
    P.box('torso', -0.04, 0.84, -0.222, 0.04, 0.9, -0.212, GOLD, { hull: false });
    face(P, hy, r, { look: 'open', nose: 0xe8c8a8, browsLow: 0.12, bags: true });
    P.box('head', -r * 0.7, hy - r * 1.05, -r * 0.75, r * 0.7, hy - r * 0.35, r * 0.4, SKIN_PALE);   // the jaw
    P.box('head', -r * 0.3, hy - r * 0.62, -r * 0.78, r * 0.3, hy - r * 0.56, -r * 0.74, 0x8a5048, { hull: false });   // a firm mouth
    P.cyl('head', r * 1.15, r * 0.98, 0.12, 0, hy + r * 0.55, 0, GUARD_CAP);  // the cap with a cockade
    P.box('head', -r * 0.8, hy + r * 0.55, -r * 1.55, r * 0.8, hy + r * 0.55 + 0.025, -r * 0.7, NAVY_D);
    P.box('head', -0.03, hy + r * 0.75, -r * 1.12, 0.03, hy + r * 0.95, -r * 1.08, GOLD, { hull: false });
    armDown(P, 'armL', -0.43, top - 0.05, 0.5, 0.09, GUARD_NAVY2);
    band(P, 'armL', -0.43, top - 0.16, 0.09, TERRA);
    armForward(P, 'armR', 0.43, top - 0.05, 1.31, 0.5, 0.09, GUARD_NAVY2);
    flashlight(P, 'armR', 0.07, 0.36, BORDO);
    c.poz = pozikhailo(P, -0.24, top);
    return c;
  },
  // Жора: long, thin and stooping, a mustard hoodie with the hood up over a cap, red headphones round the
  // neck, the phone in one hand (its screen glows), the hand lamp in the other, white trainers
  zhora(P) {
    const c = body(P, { legH: 0.9, hipW: 0.08, legW: 0.065, torsoW: 0.46, torsoH: 0.6, torsoD: 0.3, headR: 0.18, coat: 0xa8742c, legs: GUARD_NAVY2, shoe: CREAM, sole: TERRA });
    const { top, hy, headR: r } = c;
    for (const s of [-1, 1]) P.ball(s < 0 ? 'legL' : 'legR', 0.022, s * 0.08, 0.07, -0.12, TERRA, 1, 1, 1, { hull: false });   // the dots on the trainers
    face(P, hy, r, { look: 'sad', bags: true, brows: HAIR });
    P.box('head', -r * 0.8, hy + r * 0.6, -r * 0.92, r * 0.8, hy + r * 0.72, -r * 0.6, HAIR, { hull: false });   // the fringe under the cap
    P.box('head', -r * 0.8, hy + r * 0.62, -r * 1.45, r * 0.8, hy + r * 0.66, -r * 0.7, NAVY_D);    // the cap's brim
    P.ball('head', r * 1.2, 0, hy + r * 0.18, r * 0.42, 0xa8742c, 1, 1.05, 1.05);                   // the hood, up (behind the face)
    ring(P, 'torso', 0.16, 0.03, 0, top + 0.02, 0, TERRA);                                          // headphones
    for (const s of [-1, 1]) P.ball('torso', 0.055, s * 0.15, top + 0.03, -0.05, TERRA);
    armDown(P, 'armL', -0.28, top - 0.04, 0.48, 0.055, 0xa8742c, SKIN_PALE);
    P.box('armL', -0.32, top - 0.6, -0.11, -0.24, top - 0.45, -0.09, NAVY_D);                       // the phone
    P.box('armL', -0.315, top - 0.59, -0.115, -0.245, top - 0.46, -0.112, PAL.whisper, { hull: false });   // its screen
    armDown(P, 'armR', 0.28, top - 0.04, 0.48, 0.055, 0xa8742c, SKIN_PALE);
    P.cyl('armR', 0.06, 0.06, 0.03, 0.28, top - 0.72, 0, NAVY_D);                                  // the lantern: top
    P.cyl('armR', 0.05, 0.05, 0.14, 0.28, top - 0.86, 0, PAL.lamp, 'y', { hull: false });          //   the glass
    P.cyl('armR', 0.065, 0.065, 0.03, 0.28, top - 0.89, 0, NAVY_D);                                //   the base
    c.lampAt = [0.28, top - 0.79, 0];
    c.slouch = -0.22;
    c.poz = pozikhailo(P, -0.17, top - 0.02);
    return c;
  },
  zoya: (P) => thief(P, 'zoya'), frol: (P) => thief(P, 'frol'), rita: (P) => thief(P, 'rita', CFG.style.rita), nazar: (P) => thief(P, 'nazar'), malyi: (P) => thief(P, 'malyi'),
  ritaWine: (P) => thief(P, 'rita', 'wine'), ritaPowder: (P) => thief(P, 'rita', 'powder'),   // the sheet shows both
};

// The crew after the art. THIEF_COLOURS: each one's colour for the lobby and the names (S4)
export const THIEF_COLOURS = { zoya: LILAC, frol: BLUE_OV, rita: RITA.wine, nazar: TEAL, malyi: 0x9ccc3c };
function thief(P, who, variant = 'wine') {
  if (who === 'zoya') {   // small: a ginger bun, big round glasses, a light-blue cardigan with red trim, a dark skirt, a book; «Тссс»
    const c = body(P, { legH: 0.52, hipW: 0.07, legW: 0.05, torsoW: 0.42, torsoH: 0.5, torsoD: 0.3, headR: 0.18, coat: LILAC, legs: SKIN_PALE, shoe: NAVY_D });
    const { top, hy, headR: r } = c;
    P.cyl('hips', 0.17, 0.26, 0.42, 0, 0.18, 0, NAVY_D);                                   // the skirt
    for (const s of [-1, 1]) P.box('torso', s * 0.06 - 0.02, 0.52, -0.155, s * 0.06 + 0.02, top, -0.145, BORDO, { hull: false });   // trim
    P.box('torso', -0.04, 0.6, -0.152, 0.04, top - 0.02, -0.148, NAVY, { hull: false });   // the blouse
    face(P, hy, r, { look: 'open', nose: 0xf0c8b0, noseR: 0.16, brows: GINGER });
    for (const s of [-1, 1]) ring(P, 'head', r * 0.3, 0.012, s * r * 0.36, hy + r * 0.12, -r * 0.92, NAVY_D, true, { hull: false });   // glasses
    P.ball('head', r * 1.02, 0, hy + r * 0.2, r * 0.05, GINGER, 1, 0.85, 1);                // the hair
    P.ball('head', r * 0.55, 0, hy + r * 1.05, r * 0.15, GINGER);                           // the bun
    armDown(P, 'armL', -0.26, top - 0.04, 0.38, 0.055, LILAC);
    band(P, 'armL', -0.26, top - 0.38, 0.055, BORDO);
    P.box('armL', -0.31, top - 0.5, -0.09, -0.22, top - 0.32, 0.04, 0xc08a3a);             // the book
    armDown(P, 'armR', 0.26, top - 0.04, 0.38, 0.055, LILAC);
    band(P, 'armR', 0.26, top - 0.38, 0.055, BORDO);
    c.shush = true;
    return c;
  }
  if (who === 'frol') {   // huge and round: a red beanie, the movers' blanket round the shoulders, light-blue overalls, bare arms, big gloves, a coil of rope
    const c = body(P, { legH: 0.78, hipW: 0.15, legW: 0.11, torsoW: 0.9, torsoH: 0.82, torsoD: 0.66, headR: 0.2, coat: BLUE_OV, legs: 0x26324f, shoe: NAVY_D, sole: 0x8fb2d6, round: true });
    const { top, hy, headR: r } = c;
    P.ball('torso', 0.42, 0, top - 0.24, 0.02, 0x1c2333, 1, 0.55, 0.78);                   // the T-shirt above the bib
    for (const s of [-1, 1]) P.box('torso', s * 0.16 - 0.025, top - 0.42, -0.31, s * 0.16 + 0.025, top - 0.12, -0.27, BLUE_OV, { hull: false });   // straps
    ring(P, 'torso', 0.36, 0.1, 0, top - 0.04, 0.02, CREAM);                                // the blanket
    ring(P, 'torso', 0.36, 0.104, 0, top - 0.04, 0.02, NAVY, false, { hull: false });       // its stripe
    P.box('torso', -0.32, top - 0.62, 0.22, 0.32, top, 0.36, CREAM);                        // ...and down the back
    face(P, hy, r, { look: 'open', nose: 0xe8c0a0, noseR: 0.24, brows: NAVY_D });
    P.ball('head', r * 0.8, 0, hy - r * 0.55, -r * 0.35, 0xc8a890, 1, 0.55, 0.9, { seg: [7, 4], hull: false });   // stubble
    P.cyl('head', r * 0.95, r * 1.02, r * 0.75, 0, hy + r * 0.38, 0, TERRA);                // the beanie
    P.cyl('head', r * 1.05, r * 1.05, r * 0.22, 0, hy + r * 0.38, 0, 0x8e4634, 'y', { hull: false });
    armDown(P, 'armL', -0.5, top - 0.1, 0.52, 0.1, SKIN_PALE, NAVY_D);
    armDown(P, 'armR', 0.5, top - 0.1, 0.52, 0.1, SKIN_PALE, NAVY_D);
    ring(P, 'armR', 0.12, 0.022, 0.5, top - 0.85, 0, 0xf0a040, true);                       // the rope
    return c;
  }
  if (who === 'rita') {   // slim: a red jacket with tails, a big dark ponytail, a black domino mask, a light-blue scarf, dark trousers, boots with red soles
    const c = body(P, { legH: 0.82, hipW: 0.08, legW: 0.06, torsoW: 0.4, torsoH: 0.56, torsoD: 0.26, headR: 0.17, coat: RITA[variant], legs: 0x2a3150, shoe: NAVY_D, sole: BORDO });
    const { top, hy, headR: r } = c;
    P.box('torso', -0.2, 0.62, 0.0, 0.2, 0.84, 0.13, RITA[variant]);                             // the tails
    for (const y of [1.08, 1.2, 1.32]) P.box('torso', -0.05, y, -0.135, 0.05, y + 0.022, -0.128, CREAM, { hull: false });   // frogging
    P.box('torso', -0.205, 0.84, -0.135, 0.205, 0.9, 0.135, NAVY_D);                       // the belt
    face(P, hy, r, { look: 'open', nose: 0xf0c8b0, noseR: 0.15, brows: NAVY_D });
    P.box('head', -r * 0.82, hy - r * 0.04, -r * 0.95, r * 0.82, hy + r * 0.3, -r * 0.6, PAL.ink, { hull: false });   // the mask: a band behind the eyes
    P.ball('head', r * 1.03, 0, hy + r * 0.2, r * 0.08, NAVY_D, 1, 0.82, 1);                // the hair
    P.ball('head', r * 0.75, 0, hy + r * 1.35, r * 1.0, NAVY_D, 0.9, 1.6, 0.9);             // the ponytail
    P.box('head', -r * 0.1, hy + r * 0.8, r * 1.4, r * 0.1, hy + r * 1.9, r * 1.55, CREAM, { hull: false });   // its highlight
    P.cyl('head', r * 0.25, r * 0.25, r * 0.2, 0, hy + r * 0.72, r * 0.62, BORDO);          // the hair tie
    ring(P, 'torso', 0.12, 0.04, 0, top + 0.02, 0, 0xbfe0f0);                               // the scarf
    P.box('torso', 0.1, top - 0.12, 0.05, 0.3, top - 0.04, 0.12, 0xbfe0f0);
    armDown(P, 'armL', -0.24, top - 0.04, 0.44, 0.05, RITA[variant]);
    band(P, 'armL', -0.24, top - 0.42, 0.05, 0xf0a040);
    armDown(P, 'armR', 0.24, top - 0.04, 0.44, 0.05, RITA[variant]);
    band(P, 'armR', 0.24, top - 0.42, 0.05, 0xf0a040);
    return c;
  }
  if (who === 'nazar') {   // a dark teal hoodie with the hood up, a dark fringe, tired eyes, a red notebook held to the chest
    const c = body(P, { legH: 0.82, hipW: 0.09, legW: 0.07, torsoW: 0.5, torsoH: 0.58, torsoD: 0.3, headR: 0.18, coat: TEAL, legs: 0x2e3a56, shoe: 0x26324f, sole: CREAM });
    const { top, hy, headR: r } = c;
    P.box('torso', -0.15, 0.86, -0.16, 0.15, 1.0, -0.15, 0x426c78, { hull: false });       // the pocket
    for (const s of [-1, 1]) P.box('torso', s * 0.05 - 0.008, top - 0.2, -0.16, s * 0.05 + 0.008, top - 0.02, -0.152, CREAM, { hull: false });   // strings
    face(P, hy, r, { look: 'sleepy', bags: true, brows: HAIR });
    P.box('head', -r * 0.8, hy + r * 0.6, -r * 0.9, r * 0.8, hy + r * 0.74, -r * 0.6, HAIR, { hull: false });   // the fringe (brown: a black bar over the eyes read as dark glasses)
    P.ball('head', r * 1.2, 0, hy + r * 0.18, r * 0.42, TEAL, 1, 1.05, 1.05);           // the hood (behind the face)
    armDown(P, 'armL', -0.29, top - 0.04, 0.42, 0.06, TEAL, SKIN_PALE);
    P.box('armL', -0.34, top - 0.56, -0.1, -0.22, top - 0.36, -0.06, BORDO);                // the notebook
    P.box('armL', -0.335, top - 0.555, -0.107, -0.225, top - 0.365, -0.1, CREAM, { hull: false });
    armDown(P, 'armR', 0.29, top - 0.04, 0.42, 0.06, TEAL, SKIN_PALE);
    c.book = true;
    return c;
  }
  // Малий (W4): the smallest, a lime hoodie, a cap turned backwards, headphones
  const c = body(P, { legH: 0.74, hipW: 0.09, legW: 0.065, torsoW: 0.44, torsoH: 0.52, torsoD: 0.27, headR: 0.18, coat: 0x9ccc3c, legs: 0x26324a });
  const { top, hy, headR: r } = c;
  face(P, hy, r, { look: 'open', nose: 0xf0c8b0, noseR: 0.16 });
  P.cyl('head', r * 0.95, r * 0.98, r * 0.5, 0, hy + r * 0.45, 0, 0x3a4a6a);
  P.box('head', -r * 0.6, hy + r * 0.45, r * 0.6, r * 0.6, hy + r * 0.55, r * 1.35, 0x3a4a6a);
  for (const s of [-1, 1]) P.ball('head', r * 0.28, s * r * 1.0, hy, 0, 0x22252c);
  armDown(P, 'armL', -0.26, top - 0.04, 0.42, 0.055, 0x9ccc3c, SKIN_PALE);
  armDown(P, 'armR', 0.26, top - 0.04, 0.42, 0.055, 0x9ccc3c, SKIN_PALE);
  return c;
}

// ---------- restyling the game's figures (one call in each file; nothing when the style is off) ----------
function hideOld(mesh) {
  if (!EMPTY) EMPTY = quietRandom(() => new THREE.BufferGeometry());
  if (mesh && mesh.isMesh) mesh.geometry = EMPTY;
}

// a guard (enemies/patrol.js): the old body / upper stay as the anchors of the lamp, the beam and the
// bucket (they keep turning with the gaze); the figure turns its torso the same way (style/anim.js)
export function restyleGuard(p, GC = {}) {
  if (!FIGURES_ON) return;
  const id = RECIPES[GC.id] ? GC.id : 'petrovych';
  const fig = quietRandom(() => buildFigure(RECIPES[id]));   // the game's random numbers untouched (style/quiet.js)
  hideOld(p.body); hideOld(p.upper);
  p.group.add(fig.root);
  p.fig = fig; fig.kind = 'guard'; fig.who = id;
  // a hand lamp shines from the lantern in the hand (the light only: stealth counts from the guard)
  if (p.lamp && fig.pivots.lampAt) { p.lamp.position.fromArray(fig.pivots.lampAt); if (p.halo) p.halo.position.fromArray(fig.pivots.lampAt); }
}
// a friend (net/remotePlayer.js)
export function restyleFriend(rp) {
  if (!FIGURES_ON) return;
  const fig = quietRandom(() => buildFigure(RECIPES[rp.thief] || RECIPES.zoya));
  hideOld(rp.body); hideOld(rp.headMesh);
  rp.group.add(fig.root);
  rp.fig = fig; fig.kind = 'thief'; fig.who = rp.thief; fig.phase = 0;
}

// the lurker (enemies/lurker.js; the wardrobe's and the garage crate's), Шафник, after the owner's
// reference: a lump of shadow in the wardrobe's gap with big whisper-coloured eyes WITHOUT pupils (it is
// blind), a round open mouth with four rounded teeth, long thin arms with four-fingered hands; a sock
// hangs on the wardrobe's door. Its parts keep their pivots, so the lurker's own animation (telegraph,
// lunge, sleep) moves them as before.
export function lurkerGeometries() {
  const B = (parts) => { const g = mergeGeometries(parts.map(([geo, col]) => colored(geo, col)), false); parts.forEach(([geo]) => geo.dispose()); return g; };
  const lump = new THREE.SphereGeometry(0.3, 10, 7); lump.scale(1.05, 0.95, 0.9);
  const mouth = new THREE.SphereGeometry(0.11, 8, 5); mouth.scale(1.2, 0.8, 0.4); mouth.translate(0, -0.08, -0.25);
  const teeth = [-1, 1].flatMap((s) => [new THREE.SphereGeometry(0.025, 5, 3).translate(s * 0.05, -0.03, -0.29), new THREE.SphereGeometry(0.022, 5, 3).translate(s * 0.045, -0.13, -0.29)]);
  const body = B([[lump, 0x141a2c], [mouth, 0x07090f], ...teeth.map((t) => [t, PAL.paper])]);
  const armParts = [];
  for (const s of [-1, 1]) {
    armParts.push([new THREE.CylinderGeometry(0.018, 0.028, 0.75, 6).rotateX(Math.PI / 2).translate(s * 0.27, -0.05, -0.38), 0x141a2c]);
    armParts.push([new THREE.SphereGeometry(0.04, 6, 4).scale(1.3, 0.6, 1).translate(s * 0.27, -0.05, -0.77), 0x141a2c]);   // the palm
    for (let f = 0; f < 4; f++) {   // four long fingers, spread
      const a = (f - 1.5) * 0.32;
      armParts.push([new THREE.CylinderGeometry(0.008, 0.012, 0.12, 4).rotateX(Math.PI / 2).rotateY(a).translate(s * 0.27 + Math.sin(a) * 0.08, -0.05, -0.79 - Math.cos(a) * 0.06), 0x141a2c]);
    }
  }
  const arms = B(armParts);
  const eyes = B([-1, 1].map((s) => [new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1.1, 0.6).translate(s * 0.1, 0.09, -0.24), PAL.whisper]));   // blind: no pupils
  // the sock on the door (in the door leaf's space: lurker.js D1, the knob at x -0.03, y 0.9..1.1, z 0.66..0.7)
  const sock = B([[new THREE.BoxGeometry(0.03, 0.26, 0.09).translate(-0.035, 0.8, 0.66), TERRA], [new THREE.BoxGeometry(0.03, 0.07, 0.15).translate(-0.035, 0.7, 0.62), TERRA], [new THREE.BoxGeometry(0.032, 0.04, 0.092).translate(-0.035, 0.91, 0.66), CREAM]]);
  return { body, arms, eyes, sock };
}
export function restyleLurker(L) {
  if (!FIGURES_ON) return;
  quietRandom(() => {
    const g = lurkerGeometries();
    L.body.geometry = g.body; L.arms.geometry = g.arms; L.eyes.geometry = g.eyes;
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 7).scale(1.05 * 1.07, 0.95 * 1.07, 0.9 * 1.07), hullMaterial());   // its outline
    hull.name = 'style: wardrobe outline';
    L.body.add(hull);
    if (L.door1 && L.kind !== 'crate') { const sock = new THREE.Mesh(g.sock, L.body.material); sock.name = 'style: sock'; L.door1.add(sock); }
  });
}
export { hullMaterial };
