// The crew's van (owner's choice, claude/van-frol): a moving-company truck, «ПЕРЕЇЗДИ / Фрол і Ко».
// A mustard-yellow box (the будка) with the name on both sides and one thin brown stripe; a cab from the bulgy
// minibus (round headlamp «eyes», a sloping bonnet, a leaning windscreen, a chrome belt line) with a roof rack
// (a rug rolled across with fringe, a crate, a chair upside down); the crew's badge (a little wardrobe in a round
// plate) on the cab doors, on the rear doors and on the header over the rear opening. Built from the same kinds
// of parts as the rest of the world (boxes, a few cylinders) plus the lettering: flat polygons cut from the
// outlines of the game's heading font (below).
//
// The van is built in its own frame: x across (±1), y up, z from the rear (0, open doors) to the cab (5);
// kit.js turns it and puts it on the map. What the game relies on does not change: the footprint (2 x 5 m), the
// body's height for cover (2.2 m), the cargo's floor and size, the step in front of the ring, and the two rear
// door leaves (0.98 x 1.79 m, swung out 1.9 rad about their hinges: world/kit.js has their footprints). What it
// draws is all that is new. Roof-rack goods, the mirrors and the steps are decoration only.
//
// Texts come from the language file (S.van): this file has no player text. The lettering is Cyrillic only; a
// language without those letters gets the badge and no words.
import * as THREE from 'three';
import { S as STR } from '../i18n/index.js';
import { lit } from '../style/materials.js';

// ---------- the van's paint ----------
// The night grade (style/materials.js) pulls every colour of the world towards the night's blue and the moon's
// light is blue as well: a warm paint (yellow, orange, red) on the world's material comes out lilac grey, whatever
// it was. So the van is drawn as its own mesh with a gentler grade, like the loot («keeps more of its own»):
// the mustard stays mustard, and it is as bright as the rest of the world (no extra exposure, nothing glows).
// One more draw call, only while the van is in view.
export const VAN_GRADE = 0.1;
export function vanMaterial() { return lit({ grade: VAN_GRADE }); }

// the owner's palette: mustard body, brown trim, near-black brown letters, a cream plate for the badge
const PAL = { body: 0xdca621, accent: 0x5a3416, letters: 0x1c0e05, plate: 0xf3e7c0, ink: 0x2a1608, rug: [0xb5532b, 0xf0e2bb, 0x2f4a7a] };

// ---------- colours ----------
const K = {
  tyre: 0x1a1a1c, glass: 0x4a6784, chrome: 0xb4bac2, dark: 0x1b1c20, woodDark: 0x3b2d25, metal: 0x777c85,
  lens: 0xf3e7c0, wood: 0x9a6a3c, strap: 0x2a2523, tail: 0xc02a1a,
};

// ---------- the lettering ----------
// Outlines of the letters used (Unbounded ExtraBold, SIL OFL 1.1, fonts/OFL.txt), flattened to polygons and
// simplified: code point -> [advance, [contour, ...]], a contour = x0, y0, x1, y1, ...; units of the cap height.
// A contour wound the other way is a hole. Horizontally the letters are squeezed to SX: the sign has to fit the
// box's side, and a narrower letter reads from further away.
const FONT = {
  1055: [1.257, [[1.171,1,1.171,0,0.86,0,0.86,0.725,0.397,0.725,0.397,0,0.087,0,0.087,1]]],
  1045: [1.071, [[0.96,0.609,0.96,0.391,0.412,0.391,0.388,0.248,1.007,0.248,1.007,0,0.059,0,0.133,0.5,0.059,1,1,1,1,0.752,0.388,0.752,0.412,0.609]]],
  1056: [1.1, [[0.659,1,0.883,0.956,1.027,0.833,1.076,0.645,1.027,0.459,0.941,0.368,0.817,0.31,0.397,0.291,0.397,0,0.087,0,0.087,1],[0.397,0.536,0.705,0.549,0.759,0.614,0.748,0.705,0.675,0.752,0.397,0.755]]],
  1031: [0.483, [[0.088,1.065,-0.009,1.101,-0.043,1.2,-0.009,1.301,0.088,1.336,0.184,1.301,0.219,1.2,0.184,1.101],[0.396,1.065,0.299,1.101,0.265,1.2,0.299,1.301,0.396,1.336,0.492,1.301,0.527,1.2,0.492,1.101],[0.087,1,0.397,1,0.397,0,0.087,0]]],
  1047: [1.147, [[0.572,-0.023,0.373,-0.003,0.149,0.098,0.06,0.207,0.027,0.343,0.336,0.343,0.404,0.247,0.505,0.218,0.727,0.24,0.781,0.316,0.733,0.381,0.4,0.4,0.4,0.603,0.703,0.621,0.75,0.658,0.749,0.728,0.673,0.775,0.511,0.782,0.418,0.754,0.353,0.664,0.045,0.664,0.056,0.728,0.163,0.895,0.297,0.974,0.479,1.017,0.766,1.007,0.91,0.96,1.046,0.843,1.073,0.74,1.056,0.655,1.001,0.581,0.863,0.513,1.047,0.43,1.093,0.345,1.092,0.233,1.037,0.129,0.931,0.048,0.775,-0.005]]],
  1044: [1.447, [[0.027,-0.2,0.027,0.275,0.157,0.275,0.241,0.509,0.231,1,1.235,1,1.235,0.275,1.407,0.275,1.407,-0.2,1.115,-0.2,1.115,0,0.319,0,0.319,-0.2],[0.472,0.272,0.924,0.272,0.924,0.731,0.536,0.731,0.526,0.442]]],
  1048: [1.327, [[0.087,0,0.087,1,0.393,1,0.393,0.313,0.835,1,1.24,1,1.24,0,0.933,0,0.933,0.707,0.48,0]]],
  1060: [1.701, [[0.477,0.145,0.238,0.192,0.126,0.271,0.056,0.384,0.032,0.524,0.056,0.664,0.126,0.776,0.238,0.855,0.389,0.896,0.696,0.901,0.696,1.037,1.007,1.037,1.007,0.901,1.313,0.896,1.463,0.855,1.576,0.776,1.647,0.664,1.665,0.451,1.576,0.271,1.393,0.166,1.007,0.145,1.007,-0.037,0.696,-0.037,0.696,0.145],[0.696,0.388,0.696,0.659,0.466,0.657,0.363,0.597,0.347,0.497,0.394,0.416],[1.007,0.659,1.007,0.388,1.236,0.39,1.339,0.451,1.355,0.551,1.308,0.63]]],
  1088: [1.099, [[0.069,0.764,0.375,0.764,0.375,0.632,0.491,0.737,0.615,0.781,0.756,0.781,0.881,0.737,1.013,0.595,1.055,0.46,1.039,0.234,0.977,0.114,0.821,0,0.684,-0.023,0.491,0.028,0.375,0.133,0.375,-0.22,0.069,-0.22],[0.752,0.381,0.696,0.516,0.588,0.556,0.464,0.516,0.364,0.381,0.438,0.268,0.588,0.208,0.696,0.248]]],
  1086: [1.068, [[0.533,-0.023,0.352,0,0.146,0.114,0.064,0.234,0.043,0.46,0.099,0.595,0.204,0.699,0.352,0.764,0.629,0.781,0.795,0.737,0.969,0.595,1.024,0.46,1.024,0.305,0.969,0.17,0.864,0.066,0.716,0],[0.535,0.201,0.662,0.239,0.723,0.381,0.662,0.525,0.535,0.563,0.406,0.525,0.345,0.383,0.406,0.239]]],
  1083: [1.123, [[0.199,0.764,1.053,0.764,1.053,0,0.748,0,0.748,0.539,0.491,0.539,0.464,0.164,0.367,0.027,0.192,-0.017,0.019,0.025,0.019,0.241,0.145,0.229,0.209,0.319]]],
  1110: [0.445, [[0.069,0.779,0.223,0.747,0.375,0.779,0.375,0,0.069,0],[0.223,0.829,0.133,0.847,0.071,0.897,0.055,1.013,0.133,1.099,0.272,1.112,0.376,1.048,0.392,0.931,0.315,0.847]]],
  1050: [1.176, [[0.087,0,0.087,1,0.395,1,0.395,0.413,0.847,1,1.172,1,0.836,0.581,1.187,0,0.835,0,0.64,0.339,0.368,0]]],
};
const SX = 0.72, TRACK = 0.07, SPACE = 0.9;

const area = (c) => { let a = 0; for (let i = 0, n = c.length / 2; i < n; i++) { const j = (i + 1) % n; a += c[i * 2] * c[j * 2 + 1] - c[j * 2] * c[i * 2 + 1]; } return a / 2; };
const within = (c, x, y) => { let r = false; for (let i = 0, n = c.length / 2, j = n - 1; i < n; j = i++) { const xi = c[i * 2], yi = c[i * 2 + 1], xj = c[j * 2], yj = c[j * 2 + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };

// A line of text in the sign's own frame (u to the right, v up, facing +z; the baseline at v = 0, the left
// end at u = 0): [{ geometries }, width]. cap = the capital's height in metres.
function line(text, cap) {
  const geos = []; let u = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 32) { u += SPACE * SX * cap; continue; }
    const g = FONT[cp];
    if (!g) continue;
    const scaled = g[1].map((c) => c.map((v, i) => (i % 2 ? v * cap : v * SX * cap + u)));
    const outers = scaled.filter((c) => area(c) < 0), holes = scaled.filter((c) => area(c) > 0);
    const pts = (c) => { const p = []; for (let i = 0; i < c.length; i += 2) p.push(new THREE.Vector2(c[i], c[i + 1])); return p; };
    const shapes = outers.map((c) => new THREE.Shape(pts(c)));
    for (const h of holes) (shapes[Math.max(0, outers.findIndex((o) => within(o, h[0], h[1])))]).holes.push(new THREE.Path(pts(h)));
    if (shapes.length) geos.push(new THREE.ShapeGeometry(shapes));
    u += (g[0] * SX + TRACK) * cap;
  }
  return [geos, Math.max(0, u - TRACK * cap)];
}

export function buildVan() {
  const parts = [];   // [geometry, colour, glow]
  const push = (g, col, glow = false) => parts.push([g, col, glow]);
  const B = (x0, y0, z0, x1, y1, z1, col, glow = false) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); push(g, col, glow);
  };
  // a box centred at (cx, cy, cz), size w x h x d, turned about X, Y, Z (radians)
  const R = (cx, cy, cz, w, h, d, rx, ry, rz, col) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(cx, cy, cz); push(g, col);
  };
  const Y = (x, y, z, r, len, axis, col, seg = 10, glow = false) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z); push(g, col, glow);
  };
  const disc = (x, y, z, r, dir, col, seg = 10) => { const g = new THREE.CircleGeometry(r, seg); g.rotateY(dir * Math.PI / 2); g.translate(x, y, z); push(g, col); };
  const wheel = (x, z, r = 0.38) => {
    Y(x, r, z, r, 0.26, 'x', K.tyre, 10);
    Y(x + Math.sign(x) * 0.135, r, z, r * 0.45, 0.02, 'x', K.chrome, 8);
  };
  const frame = (x, y, z, ry) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const stick = (list, M, du = 0, dv = 0, dz = 0) => { for (const [g, col] of list) { const k = g.clone(); k.translate(du, dv, dz); k.applyMatrix4(M); push(k, col); } };
  const words = (text, cap, col) => { const [geos, w] = line(text, cap); return [geos.map((g) => [g, col]), w]; };
  // the crew's badge: a ROUND plate (18 sides) with a little wardrobe
  const badge = (u, v, r, plateCol, ink, seg = 18) => {
    const w = r * 0.62, h = r * 1.1, plate = new THREE.CylinderGeometry(r, r, 0.02, seg);
    plate.rotateX(Math.PI / 2); plate.translate(u, v, 0.011);
    const box = (bw, bh, bd, x, y, z) => { const g = new THREE.BoxGeometry(bw, bh, bd); g.translate(u + x, v + y, z); return g; };
    return [[plate, plateCol], [box(w, h, 0.012, 0, 0, 0.026), ink], [box(w * 1.22, h * 0.1, 0.012, 0, h * 0.55, 0.026), ink],
      [box(r * 0.05, h * 0.86, 0.008, 0, 0, 0.03), plateCol]];
  };
  const BODY = PAL.body, ACC = PAL.accent;

  // ---------- chassis and wheels ----------
  B(-0.75, 0.26, 0, 0.75, 0.35, 5.0, K.dark);
  wheel(-0.95, 0.9); wheel(0.95, 0.9); wheel(-0.95, 4.2); wheel(0.95, 4.2);
  for (const s of [-1, 1]) {   // mudguards over the wheels, in the accent colour
    B(s * 1.04 - (s < 0 ? 0.1 : 0), 0.76, 0.4, s * 1.04 + (s < 0 ? 0 : 0.1), 0.82, 1.4, ACC);
    B(s * 1.04 - (s < 0 ? 0.1 : 0), 0.76, 3.7, s * 1.04 + (s < 0 ? 0 : 0.1), 0.82, 4.7, ACC);
  }

  // ---------- the box (будка): open at the back, the same inside; the roof corners rounded ----------
  B(-1.0, 0.35, 0, -0.95, 2.0, 3.65, BODY); B(0.95, 0.35, 0, 1.0, 2.0, 3.65, BODY);
  for (const s of [-1, 1]) R(s * 0.93, 2.135, 1.82, 0.31, 0.05, 3.65, 0, 0, -s * 1.09, BODY);   // the shoulders
  B(-0.86, 2.22, 0, 0.86, 2.27, 3.65, BODY);                                                       // the roof
  B(-0.95, 0.35, 3.6, 0.95, 2.2, 3.7, BODY);                                                      // its front wall
  B(-0.95, 0.4, 0.02, -0.94, 2.12, 3.6, 0x2e3036); B(0.94, 0.4, 0.02, 0.95, 2.12, 3.6, 0x2e3036);
  B(-0.9, 0.36, 0.02, 0.9, 0.4, 3.6, K.woodDark);
  B(-0.9, 2.1, 0.05, 0.9, 2.12, 3.65, 0x3a3c40);
  B(-0.94, 0.4, 3.64, 0.94, 2.12, 3.65, 0x0b0d12, true);
  B(-0.4, 2.13, 0.8, 0.4, 2.14, 1.1, 0x8a6a40, true);
  B(-0.999, 0.28, -0.04, 0.999, 0.36, 0.02, K.metal);
  B(-0.7, 0.2, -0.35, 0.7, 0.3, 0, K.metal);
  B(-0.97, 0.6, -0.03, -0.9, 0.76, 0.0, K.tail, true); B(0.9, 0.6, -0.03, 0.97, 0.76, 0.0, K.tail, true);   // small tail lights
  for (const s of [-1, 1]) {
    const o = s < 0 ? -1 : 0;
    B(s + o * 0.012, 0.66, 0.12, s + (o + 1) * 0.012, 0.7, 3.55, ACC);                    // ONE thin stripe along the foot
  }
  {
    const [big, bw] = words(STR.van.sign, 0.325, PAL.letters), [small, sw] = words(STR.van.crew, 0.18, PAL.letters);
    const z0 = 1.3, span = 2.22;
    for (const M of [frame(-1.016, 0, z0, -Math.PI / 2), frame(1.016, 0, z0 + span, Math.PI / 2)]) {
      stick(big, M, (span - bw) / 2, 1.3); stick(small, M, (span - sw) / 2, 0.94);
    }
  }
  // the rear header: the accent colour, the badge and the name
  B(-0.93, 1.86, -0.04, 0.93, 2.16, 0.02, ACC);
  {
    const [list, w] = words(STR.van.crew, 0.13, PAL.plate), total = 0.26 + 0.12 + w, u0 = -total / 2;
    const M = frame(0, 0, -0.048, Math.PI);
    stick(badge(u0 + 0.13, 2.01, 0.13, PAL.plate, ACC, 14), M); stick(list, M, u0 + 0.38, 1.965);
  }

  // ---------- the cab: the bulgy minibus's (round eyes, a sloping bonnet, a leaning windscreen, chrome belt line) ----------
  B(-0.9, 0.35, 3.7, 0.9, 1.9, 3.78, K.dark);                                            // the gap behind the cab
  B(-0.98, 0.35, 3.78, 0.98, 1.15, 4.55, BODY);                                          // lower body, bulging out
  B(-0.96, 0.35, 4.55, 0.96, 1.0, 5.0, BODY);                                            // the nose
  R(0, 1.07, 4.78, 1.94, 0.08, 0.58, 0.17, 0, 0, BODY);                                  // the sloping bonnet
  B(-0.9, 1.15, 3.78, 0.9, 1.86, 4.3, BODY);                                             // the cab proper, a little narrower
  for (const s of [-1, 1]) R(s * 0.83, 1.86, 4.04, 0.3, 0.05, 0.48, 0, 0, -s * 0.8, BODY);   // rounded roof edges
  B(-0.68, 1.88, 3.78, 0.68, 1.93, 4.3, BODY);                                           // the roof
  B(-0.9, 1.15, 4.3, 0.9, 1.22, 4.62, BODY);                                             // scuttle
  R(0, 1.52, 4.43, 1.76, 0.8, 0.04, -0.42, 0, 0, K.glass);                               // the windscreen, leaning back
  B(-1.02, 1.1, 3.8, -0.95, 1.17, 4.98, K.chrome); B(0.95, 1.1, 3.8, 1.02, 1.17, 4.98, K.chrome);   // the chrome belt line
  B(-0.975, 0.97, 4.99, 0.975, 1.03, 5.04, K.chrome);                                      // ... round the nose
  B(-0.42, 0.5, 5.0, 0.42, 0.74, 5.03, K.dark); B(-0.42, 0.6, 5.03, 0.42, 0.64, 5.05, K.chrome);   // grille
  B(-1.03, 0.4, 4.95, 1.03, 0.54, 5.12, K.chrome);                                       // bumper
  for (const s of [-1, 1]) {
    Y(s * 0.62, 0.84, 5.0, 0.17, 0.1, 'z', K.lens, 14); Y(s * 0.62, 0.84, 4.985, 0.205, 0.06, 'z', K.chrome, 14);   // the round "eyes"
    B(s * 0.905 + (s < 0 ? -0.01 : 0), 1.34, 3.86, s * 0.905 + (s < 0 ? 0 : 0.01), 1.8, 4.22, K.glass);   // side window
    B(s * 0.97, 1.58, 4.42, s * 1.22, 1.64, 4.46, K.dark); Y(s * 1.22, 1.5, 4.44, 0.1, 0.03, 'x', K.chrome, 10);   // round mirror
    stick(badge(0, 0, 0.2, PAL.plate, PAL.ink), s < 0 ? frame(-0.99, 0.78, 4.15, -Math.PI / 2) : frame(0.99, 0.78, 4.15, Math.PI / 2));   // the door badge
  }
  // ---------- the roof rack: a rug rolled across (stripes, a pattern and fringe at the ends), a crate, an upturned chair ----------
  for (const z of [3.84, 4.2]) B(-0.88, 1.955, z - 0.02, 0.88, 1.985, z + 0.02, K.chrome);
  for (const x of [-0.84, 0.84]) B(x - 0.02, 1.95, 3.8, x + 0.02, 1.99, 4.24, K.chrome);
  {
    const [r1, r2, r3] = PAL.rug, x0 = -0.82, len = 1.0, cy = 2.16, cz = 4.02, r = 0.16;
    Y(x0 + len / 2, cy, cz, r, len, 'x', r1, 10);
    for (const x of [x0 + 0.2, x0 + 0.5, x0 + 0.8]) Y(x, cy, cz, r + 0.006, 0.05, 'x', r3, 10);      // stripes
    for (const dir of [-1, 1]) {   // the ends: fringe + the spiral of the roll
      const xe = dir < 0 ? x0 : x0 + len;
      Y(xe + dir * 0.04, cy, cz, r * 0.96, 0.08, 'x', r2, 10);                                          // fringe
      disc(xe + dir * 0.082, cy, cz, r * 0.9, dir, r1); disc(xe + dir * 0.084, cy, cz, r * 0.66, dir, r2);
      disc(xe + dir * 0.086, cy, cz, r * 0.44, dir, r3); disc(xe + dir * 0.088, cy, cz, r * 0.2, dir, r2);
    }
  }
  B(0.28, 1.99, 3.84, 0.8, 2.37, 4.2, K.wood);                                            // the crate
  B(0.275, 2.1, 3.835, 0.805, 2.14, 4.205, K.strap);
  {   // the chair upside down on the crate: it rests on the top of its back and the front edge of its seat (43 degrees)
    const th = 0.75, M = new THREE.Matrix4().makeTranslation(0.54, 2.37 + 0.18 * Math.sin(th), 4.02).multiply(new THREE.Matrix4().makeRotationX(th));
    const cb = (x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.applyMatrix4(M); push(g, K.wood); };
    cb(-0.18, 0, -0.18, 0.18, 0.04, 0.18);                                                  // the seat
    for (const lx of [-0.15, 0.15]) for (const lz of [-0.15, 0.15]) cb(lx - 0.025, 0.04, lz - 0.025, lx + 0.025, 0.4, lz + 0.025);   // the legs, up
    for (const lz of [-0.15, 0.15]) cb(-0.15, 0.2, lz - 0.015, 0.15, 0.23, lz + 0.015);   // rungs
    for (const lx of [-0.15, 0.15]) cb(lx - 0.015, -0.34, -0.2, lx + 0.015, 0, -0.16);      // the back's posts, hanging down
    cb(-0.185, -0.34, -0.205, 0.185, -0.27, -0.155);                                          // the back's top rail
  }

  // ---------- the rear doors: folded back along the sides as before; the face to the player carries the badge and the name ----------
  {
    const [small, sw] = words(STR.van.crew, 0.12, PAL.letters);
    for (const s of [-1, 1]) {
      const hx = s < 0 ? -1.0 : 1.0, cx = -s * 0.49;
      const leaf = (yc, h, col) => { const g = new THREE.BoxGeometry(0.98, h, 0.05); g.translate(cx, yc, 0); g.rotateY(s * 1.9); g.translate(hx, 0, 0); push(g, col); };
      leaf(0.675, 0.55, ACC); leaf(1.57, 1.24, BODY);
      const M = new THREE.Matrix4().makeTranslation(hx, 0, 0).multiply(new THREE.Matrix4().makeRotationY(s * 1.9));
      stick(badge(cx, 1.76, 0.25, PAL.plate, PAL.ink), M, 0, 0, 0.025); stick(small, M, cx - sw / 2, 1.25, 0.029);
    }
  }
  return { parts };
}
