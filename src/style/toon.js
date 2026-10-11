// W17 «Стиль»: the characters after the owner's approved sample (nocturne-vr-docs, hushjob-characters.html,
// «2 · 3D, зроблені як слід»). The recipes below are the sample's own functions, nearly word for word;
// only their tools come from a kit:
//   kit(false) — the sample as it is (its segments, MeshToonMaterial in 3 steps, the outline as an inverted
//                hull) — the character sheet shows it next to the game's figure (?page=figures);
//   kit(true)  — the game's figure: fewer segments, and every part only records its colour, its outline
//                and its bone; style/figures.js bakes the parts into one skinned mesh on rigid bones.
// The sample faces +Z; the game's figures face -Z (style/figures.js turns them round).
import * as THREE from 'three';

// RoundedBoxGeometry (three.js examples, MIT): the game's three.js bundle has no add-ons but two, so the
// few lines are here (segments 3 for the sample, 1 in the game)
// segments 0 (the game): 2 cuts a side — a bevelled box, 48 triangles instead of 108
function roundedBox(width, height, depth, segments, radius) {
  const n = segments ? segments * 2 + 1 : 2;
  radius = Math.min(width / 2, height / 2, depth / 2, radius);
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), box = new THREE.Vector3(width, height, depth).divideScalar(2).subScalar(radius);
  const half = 0.5 / n;
  for (let i = 0; i < pos.length; i += 3) {
    p.fromArray(pos, i); q.copy(p);
    if (n === 2) for (const k of ['x', 'y', 'z']) if (Math.abs(p[k]) < 1e-6) { p[k] = 0; q[k] = 0; }   // the face's middle row stays on the face
    q.x -= Math.sign(q.x) * half; q.y -= Math.sign(q.y) * half; q.z -= Math.sign(q.z) * half;
    q.normalize();
    pos[i] = box.x * Math.sign(p.x) + q.x * radius; pos[i + 1] = box.y * Math.sign(p.y) + q.y * radius; pos[i + 2] = box.z * Math.sign(p.z) + q.z * radius;
    nor[i] = q.x; nor[i + 1] = q.y; nor[i + 2] = q.z;
  }
  return g;
}

// the sample's toon look (only kit(false) makes these)
let toonGrad = null;
const refMats = new Map(), olMats = new Map();
function refMat(color, opts = {}) {
  if (!toonGrad) {
    toonGrad = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
    toonGrad.minFilter = toonGrad.magFilter = THREE.NearestFilter; toonGrad.needsUpdate = true;
  }
  const key = color + JSON.stringify(opts);
  if (!refMats.has(key)) refMats.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGrad, ...opts }));
  return refMats.get(key);
}
function refOutline(t) {
  if (!olMats.has(t)) olMats.set(t, new THREE.ShaderMaterial({
    uniforms: { t: { value: t } },
    vertexShader: 'uniform float t; void main(){ vec3 p = position + normalize(normal) * t; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.02, 0.025, 0.045, 1.0); }',
    side: THREE.BackSide,
  }));
  return olMats.get(t);
}

export const SKIN = '#f2dcc0', INK = '#111725', WHITE = '#fbf7ee';

// The tools. game: fewer segments, parts are tokens { color, glow } (no materials are made); far: the
// figure seen from beyond style/figures.js FAR metres (fewer still)
export function kit(game, far = false) {
  const K = { game, far };
  const F = far ? 0.55 : 1;   // the far figure: about half the segments again
  const sg = (n, k, min) => (game ? Math.max(far ? Math.min(min, 5) : min, Math.round(n * k * F)) : n);
  K.M = (color, opts = {}) => (game ? { color, glow: false } : refMat(color, opts));
  K.glow = (color) => (game ? { color, glow: true } : new THREE.MeshBasicMaterial({ color }));
  // the game's coarser bodies of revolution enclose the sample's (K.lathe); the rings that lie on them
  // without an outline (a belt, the quilting, Zoya's trim, the blanket's stripes) grow as much
  const ringK = game ? 1 / Math.cos(Math.PI / sg(18, 0.45, 8)) : 1;
  K.P = (geo, mat, parent, pos = [0, 0, 0], o = {}) => {
    if (ringK !== 1 && o.ol === 0 && geo.type === 'TorusGeometry' && geo.parameters.radius > 0.2) geo.scale(ringK, ringK, ringK);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (o.r) m.rotation.set(...o.r);
    if (o.s) m.scale.set(...o.s);
    parent.add(m);
    const ol = o.ol ?? 0.014;
    if (game) m.userData.ol = ol;
    else if (ol !== 0) m.add(new THREE.Mesh(geo, refOutline(ol)));
    return m;
  };
  K.G = {
    sph: (r, w = 16, h = 12) => (game && r < 0.03 ? new THREE.SphereGeometry(r, 4, 3) : new THREE.SphereGeometry(r, sg(w, 0.37, 6), sg(h, 0.37, 4))),   // a dot: 16 triangles
    part: (r, w, h, ps, pl, ts, tl) => new THREE.SphereGeometry(r, sg(w, 0.37, 8), sg(h, 0.37, 5), ps, pl, ts, tl),
    cap: (r, len) => new THREE.CapsuleGeometry(r, len, game ? (far || r < 0.03 ? 1 : 2) : 4, game ? (far || r < 0.03 ? 5 : 6) : 9),
    cyl: (rt, rb, h, s = 18, open = false) => new THREE.CylinderGeometry(rt, rb, h, sg(s, 0.33, 6), 1, open),
    box: (w, h, d, r = 0.04) => {
      const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
      return game && rr < (far ? 0.08 : 0.045) ? new THREE.BoxGeometry(w, h, d) : roundedBox(w, h, d, game ? 0 : 3, rr);   // small roundings: a plain box (12 triangles, not 108)
    },
    tor: (r, t, a = Math.PI * 2) => new THREE.TorusGeometry(r, t, game ? 3 : 8, game ? (far ? 6 : 8) : 20, a),
  };
  // a body of revolution from a radius profile [[r, y], ...]
  K.lathe = (profile, seg = 18) => {
    const pts = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(game ? (far ? 4 : 5) : 18);
    pts.unshift(new THREE.Vector2(0, profile[0][1])); pts.push(new THREE.Vector2(0, profile[profile.length - 1][1]));
    const n = sg(seg, 0.45, 8);
    // the game's coarser body encloses the sample's (its corners on r / cos(π/n)): what the sample hides
    // inside a body (Frol's bib, a belt) stays hidden instead of poking through the flat faces
    if (game) { const k = 1 / Math.cos(Math.PI / n); for (const p of pts) p.x *= k; }
    return new THREE.LatheGeometry(pts, n);
  };
  // a tube that thins out along a curve
  K.taper = (points, r0, r1, seg = 24) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const n = sg(seg, 0.4, 5), rad = game ? (far ? 3 : 4) : 10;
    const geo = new THREE.TubeGeometry(curve, n, 1, rad, false);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const c = curve.getPointAt(i / n), k = r0 + (r1 - r0) * (i / n);
      for (let j = 0; j <= rad; j++) { const idx = i * (rad + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c); pos.setXYZ(idx, v.x, v.y, v.z); }
    }
    geo.computeVertexNormals(); return geo;
  };
  const { P, G, M } = K;
  K.leg = (parent, x, hipY, len, r, color, shoe, shoeL = 1) => {
    const g = new THREE.Group(); g.position.set(x, hipY, 0); parent.add(g); g.userData.bone = 'leg';
    P(G.cap(r, len), M(color), g, [0, -len / 2 - r * 0.2, 0]);
    P(G.box(r * 2.5, r * 1.5, r * 3.3 * shoeL, game && !far ? Math.max(r * 0.6, 0.046) : r * 0.6), M(shoe), g, [0, -hipY + r * 0.75, r * 0.55]);   // the game: a shoe stays rounded
    return g;
  };
  K.arm = (parent, side, x, y, len, r, color, hand, handR = r * 1.25) => {
    const g = new THREE.Group(); g.position.set(side * x, y, 0); g.rotation.z = side * 0.12; parent.add(g); g.userData.bone = 'arm';
    P(G.cap(r, len), M(color), g, [0, -len / 2, 0]);
    const h = P(G.sph(handR, 14, 10), M(hand), g, [0, -len - r * 0.4, 0]);
    g.userData.hand = h; return g;
  };
  // the sample points an arm at a target; in the game the moves own some arms ('anim': the «Тссс», the
  // notebook, the phone — style/anim.js raises them), so those stay down
  K.aim = (armG, tx, ty, tz, anim = false) => {
    if (game && anim) return;
    const d = new THREE.Vector3(tx, ty, tz).sub(armG.position).normalize();
    armG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
  };
  // eyes on a head of radius R (head centre at 0,0,0 of `head`); glow = no pupils, they shine
  K.eyes = (head, R, o = {}) => {
    const { y = 0.08, x = 0.36, r = 0.2, lid = 0, tilt = 0, pupil = 0.45, look = [0, 0], white = WHITE, lidColor = SKIN, glow = null } = o;
    const out = [];
    for (const s of [-1, 1]) {
      const ex = s * R * x, ey = R * y;
      const ez = Math.sqrt(Math.max(R * R - ex * ex - ey * ey, 0)) * 0.93;
      const g = new THREE.Group(); g.position.set(ex, ey, ez); head.add(g);
      const er = R * r;
      if (glow) P(G.sph(er, 16, 12), K.glow(glow), g, [0, 0, 0], { s: [1, 1.1, 0.5], ol: 0.008 });
      else {
        P(G.sph(er, 16, 12), M(white), g, [0, 0, 0], { s: [1, 1.15, 0.55], ol: 0.008 });
        if (pupil) P(G.sph(er * pupil, 12, 10), M(INK), g, [look[0] * er * 0.4, look[1] * er * 0.4, er * 0.42], { s: [1, 1.1, 0.5], ol: 0 });
        if (lid > 0) P(G.part(er * 1.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * lid), M(lidColor), g, [0, 0, 0], { s: [1, 1.15, 0.62], r: [0.25, 0, -s * tilt], ol: 0.006 });
      }
      out.push(g);
    }
    return out;
  };
  K.brows = (head, R, color, y, tilt, w = 0.28, x = 0.36) => {
    for (const s of [-1, 1]) {
      const bx = s * R * x, by = R * y, bz = Math.sqrt(Math.max(R * R - bx * bx - by * by, 0));
      P(G.box(R * w, R * 0.09, R * 0.08, 0.01), M(color), head, [bx, by, bz], { r: [0, 0, s * tilt], ol: 0 });
    }
  };
  K.ears = (head, R) => { for (const s of [-1, 1]) P(G.sph(R * 0.2, 10, 8), M(SKIN), head, [s * R * 0.97, 0, 0], { s: [0.6, 1, 0.8], ol: 0.008 }); };
  // the flashlight (the sample's light cone is left out: the game draws its own beam)
  K.flashlight = (hand, big = 1) => {
    const g = new THREE.Group(); hand.add(g); g.rotation.x = Math.PI;
    P(G.cyl(0.035 * big, 0.03 * big, 0.2 * big), M('#2b3450'), g, [0, 0.06 * big, 0]);
    P(G.cyl(0.055 * big, 0.04 * big, 0.07 * big), M('#2b3450'), g, [0, 0.18 * big, 0]);
    const lens = P(G.cyl(0.048 * big, 0.048 * big, 0.01), K.glow('#ffd28a'), g, [0, 0.22 * big, 0], { ol: 0 });
    lens.userData.lens = true;
    return g;
  };
  // a head group: its bone, its radius (the neck is below it)
  K.head = (parent, x, y, z, R) => { const h = new THREE.Group(); h.position.set(x, y, z); parent.add(h); h.userData.bone = 'head'; h.userData.R = R; return h; };
  return K;
}

// ---------- the cast (the sample's functions; `K` instead of the page's globals) ----------
export const TOON = {
  petrovych(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { coat: '#41537a', dark: '#2a3452', boot: '#151b2a', cap: '#2d3a5c', tache: '#e9a54b', nose: '#d9505e', glove: '#4b5a7c' };
    const legs = [K.leg(body, -0.15, 0.36, 0.14, 0.11, C.dark, C.boot), K.leg(body, 0.15, 0.36, 0.14, 0.11, C.dark, C.boot)];
    P(K.lathe([[0.3, 0.3], [0.42, 0.42], [0.46, 0.62], [0.4, 0.86], [0.24, 1.0]]), M(C.coat), body, [0, 0, 0], { s: [1, 1, 0.86] });
    P(G.tor(0.43, 0.025), M(C.dark), body, [0, 0.44, 0], { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], ol: 0 });
    P(G.tor(0.465, 0.012), M('#2f3d5e'), body, [0, 0.62, 0], { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], ol: 0 });
    P(G.tor(0.43, 0.012), M('#2f3d5e'), body, [0, 0.78, 0], { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], ol: 0 });
    P(G.box(0.08, 0.06, 0.03, 0.01), M('#8a93a8'), body, [0, 0.44, 0.39], { ol: 0 });
    const thermos = P(G.cyl(0.06, 0.06, 0.22), M('#f2a43a'), body, [0.4, 0.42, 0.12], { r: [0, 0, 0.15] });
    P(G.cyl(0.065, 0.065, 0.05), M('#c0444f'), thermos, [0, 0.13, 0], { ol: 0.008 });
    const arms = [K.arm(body, -1, 0.43, 0.9, 0.34, 0.085, C.coat, C.glove), K.arm(body, 1, 0.43, 0.9, 0.34, 0.085, C.coat, C.glove)];
    P(G.cyl(0.095, 0.095, 0.09), M('#b0434d'), arms[0], [0, -0.1, 0], { ol: 0.008 });
    K.aim(arms[1], 0.55, 0.72, 0.6); K.flashlight(arms[1].userData.hand, 1);
    const R = 0.27, head = K.head(body, 0, 1.2, 0.02, R);
    P(G.sph(R, 20, 14), M(SKIN), head);
    K.ears(head, R);
    K.eyes(head, R, { y: 0.12, x: 0.34, r: 0.24, lid: 0.5, tilt: -0.12, pupil: 0.42, look: [0, -0.3] });
    for (const s of [-1, 1]) P(G.sph(R * 0.16, 10, 8), M('#a9bdd0'), head, [s * R * 0.34, R * -0.14, R * 0.86], { s: [1.2, 0.5, 0.4], ol: 0 });
    P(G.sph(R * 0.2, 14, 12), M(C.nose), head, [0, -R * 0.12, R * 1.0]);
    for (const s of [-1, 1]) P(G.sph(R * 0.36, 14, 10), M(C.tache), head, [s * R * 0.32, -R * 0.38, R * 0.84], { s: [1.15, 0.55, 0.55], r: [0, 0, s * -0.38] });
    const cap = new THREE.Group(); cap.position.set(0, R * 0.62, -0.01); head.add(cap);
    P(G.cyl(R * 1.08, R * 1.02, R * 0.32, 24), M(C.cap), cap, [0, 0.03, 0], { s: [1, 1, 1.02] });
    P(G.cyl(R * 0.62, R * 0.62, 0.025, 20), M(C.cap), cap, [0, -0.02, R * 0.78], { s: [1, 1, 0.55] });
    return { root, body, legs, arms, head, h: 1.55, name: 'petrovych' };
  },
  valera(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { uni: '#36486f', pants: '#28344f', boot: '#151b2a', glove: '#46557a' };
    const legs = [K.leg(body, -0.17, 0.82, 0.58, 0.115, C.pants, C.boot), K.leg(body, 0.17, 0.82, 0.58, 0.115, C.pants, C.boot)];
    P(G.box(0.62, 0.22, 0.4, 0.08), M(C.pants), body, [0, 0.82, 0]);
    P(G.box(0.86, 0.72, 0.5, 0.13), M(C.uni), body, [0, 1.25, 0]);
    P(G.box(0.88, 0.1, 0.52, 0.03), M('#efe6d4'), body, [0, 1.3, 0], { ol: 0 });
    P(G.box(0.66, 0.06, 0.44, 0.02), M('#1f2840'), body, [0, 0.93, 0.0], { ol: 0 });
    P(G.box(0.08, 0.06, 0.03, 0.01), M('#f2b640'), body, [0, 0.93, 0.23], { ol: 0 });
    P(G.box(0.07, 0.09, 0.03, 0.015), M('#f2b640'), body, [0.2, 1.43, 0.26], { ol: 0.006 });
    const arms = [K.arm(body, -1, 0.5, 1.5, 0.48, 0.11, C.uni, C.glove), K.arm(body, 1, 0.5, 1.5, 0.48, 0.11, C.uni, C.glove)];
    P(G.cyl(0.12, 0.12, 0.1), M('#b0434d'), arms[1], [0, -0.14, 0], { ol: 0.008 });
    K.aim(arms[1], 0.62, 1.2, 0.75); K.flashlight(arms[1].userData.hand, 1.5);
    const R = 0.24, head = K.head(body, 0, 1.86, 0.02, R);
    P(G.box(R * 1.7, R * 1.9, R * 1.6, R * 0.5), M(SKIN), head);
    P(G.box(R * 1.8, R * 0.7, R * 1.55, R * 0.3), M(SKIN), head, [0, -R * 0.62, 0.01]);
    K.ears(head, R * 0.9);
    K.eyes(head, R * 0.86, { y: 0.1, x: 0.4, r: 0.22, lid: 0.42, tilt: 0.3, pupil: 0.5 });
    K.brows(head, R * 0.9, '#2a2a33', 0.36, 0.35, 0.36, 0.4);
    P(G.box(R * 0.34, R * 0.3, R * 0.3, 0.03), M('#e8c8a8'), head, [0, -R * 0.12, R * 0.84], { ol: 0.006 });
    P(G.box(R * 0.5, R * 0.06, R * 0.05, 0.01), M('#5a3a3a'), head, [0, -R * 0.55, R * 0.8], { ol: 0 });
    const cap = new THREE.Group(); cap.position.set(0, R * 0.95, 0); head.add(cap);
    P(G.cyl(R * 1.15, R * 0.95, R * 0.55, 24), M('#2a3756'), cap, [0, R * 0.2, -0.02]);
    P(G.cyl(R * 0.9, R * 0.9, 0.03, 20), M('#151b2a'), cap, [0, -0.01, R * 0.62], { s: [1, 1, 0.5] });
    P(G.box(0.07, 0.08, 0.02, 0.015), M('#f2b640'), cap, [0, R * 0.25, R * 0.98], { ol: 0.006 });
    return { root, body, legs, arms, head, h: 2.0, name: 'valera' };
  },
  zhora(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { hood: '#b9822f', jeans: '#2c3a5c', shoe: '#efe6d4' };
    const legs = [K.leg(body, -0.12, 0.88, 0.62, 0.095, C.jeans, C.shoe, 1.25), K.leg(body, 0.12, 0.88, 0.62, 0.095, C.jeans, C.shoe, 1.25)];
    for (const l of legs) for (const s of [-1, 1]) P(G.sph(0.03, 8, 6), M('#d8505a'), l, [s * 0.11, -0.83, 0.1], { ol: 0 });
    const torso = new THREE.Group(); torso.position.set(0, 0.86, 0); torso.rotation.x = 0.28; body.add(torso);
    P(K.lathe([[0.27, 0.0], [0.31, 0.2], [0.3, 0.5], [0.27, 0.72], [0.16, 0.8]]), M(C.hood), torso, [0, 0, 0], { s: [1, 1, 0.8] });
    P(G.box(0.3, 0.13, 0.05, 0.03), M('#a3732a'), torso, [0, 0.22, 0.24], { ol: 0.006 });
    const arms = [K.arm(torso, -1, 0.31, 0.68, 0.5, 0.075, C.hood, SKIN, 0.07), K.arm(torso, 1, 0.31, 0.68, 0.5, 0.075, C.hood, SKIN, 0.07)];
    arms[0].rotation.x = -0.25;
    const lantern = new THREE.Group(); arms[0].userData.hand.add(lantern); lantern.position.y = -0.2;
    P(G.cyl(0.06, 0.07, 0.03), M('#2b3450'), lantern, [0, 0.11, 0]);
    P(G.cyl(0.07, 0.07, 0.03), M('#2b3450'), lantern, [0, -0.1, 0]);
    const glass = P(G.cyl(0.055, 0.055, 0.18, 14), K.glow('#ffc46b'), lantern, [0, 0, 0], { ol: 0 });
    glass.userData.lens = true;
    K.aim(arms[1], 0.06, 0.62, 0.42, true);
    const phone = P(G.box(0.07, 0.13, 0.015, 0.008), M('#1b2133'), arms[1].userData.hand, [0, -0.04, 0.05], { r: [0.3, 0, 0] });
    P(G.box(0.058, 0.11, 0.004, 0.001), K.glow('#bfe6ff'), phone, [0, 0, 0.009], { ol: 0 });   // the screen (the sample: a plane)
    const R = 0.23, head = K.head(torso, 0, 0.95, 0.12, R); head.rotation.x = 0.35;
    P(G.sph(R, 20, 14), M(SKIN), head, [0, 0, 0], { s: [0.95, 1.08, 1] });
    P(G.part(R * 1.28, 22, 14, Math.PI * 0.5 + 0.85, Math.PI * 2 - 1.7), M(C.hood), head, [0, 0.03, -0.04], { s: [1, 1.05, 1] });
    P(G.sph(R * 0.7, 14, 10), M('#1e2433'), head, [0, R * 0.78, R * 0.2], { s: [1.15, 0.32, 0.85], ol: 0.006 });
    K.eyes(head, R, { y: 0.02, x: 0.36, r: 0.22, lid: 0.55, tilt: -0.1, pupil: 0.45, look: [0.3, -0.8] });
    P(G.sph(R * 0.13, 10, 8), M('#e8c8a8'), head, [0, -R * 0.22, R * 0.98], { ol: 0 });
    P(G.tor(R * 0.95, 0.035), M('#d8505a'), torso, [0, 0.78, 0.04], { r: [Math.PI / 2 - 0.2, 0, 0] });
    for (const s of [-1, 1]) P(G.cyl(0.07, 0.07, 0.05, 14), M('#d8505a'), torso, [s * 0.2, 0.8, 0.12], { r: [0, 0, Math.PI / 2] });
    return { root, body, legs, arms, head, h: 1.9, name: 'zhora', torso };
  },
  zoya(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { card: '#8ec5ea', trim: '#d8505a', skirt: '#232c46', hair: '#f2a944', shoe: '#1b2133' };
    const legs = [K.leg(body, -0.09, 0.3, 0.12, 0.07, '#e9d3b6', C.shoe), K.leg(body, 0.09, 0.3, 0.12, 0.07, '#e9d3b6', C.shoe)];
    P(K.lathe([[0.3, 0.25], [0.27, 0.38], [0.22, 0.5]]), M(C.skirt), body);
    for (let i = 0; i < 9; i++) { const a = i * 0.7; P(G.sph(0.018, 6, 5), M('#efe6d4'), body, [Math.cos(a) * 0.28, 0.3 + (i % 3) * 0.05, Math.sin(a) * 0.28], { ol: 0 }); }
    P(K.lathe([[0.31, 0.42], [0.29, 0.56], [0.26, 0.78], [0.16, 0.88]]), M(C.card), body, [0, 0, 0], { s: [1, 1, 0.82] });
    P(G.tor(0.305, 0.022), M(C.trim), body, [0, 0.43, 0], { r: [Math.PI / 2, 0, 0], s: [1, 0.82, 1], ol: 0 });
    P(G.box(0.05, 0.42, 0.03, 0.01), M(C.trim), body, [-0.05, 0.64, 0.23], { r: [0.12, 0, 0], ol: 0 });
    P(G.box(0.05, 0.42, 0.03, 0.01), M(C.trim), body, [0.05, 0.64, 0.23], { r: [0.12, 0, 0], ol: 0 });
    const arms = [K.arm(body, -1, 0.3, 0.8, 0.28, 0.065, C.card, '#2b3450', 0.065), K.arm(body, 1, 0.27, 0.8, 0.34, 0.065, C.card, '#2b3450', 0.065)];
    K.aim(arms[1], 0.03, 1.02, 0.36, true);
    P(G.cap(0.018, 0.06), M('#2b3450'), arms[1].userData.hand, [0, -0.06, 0.02], { ol: 0.005 });
    P(G.box(0.2, 0.26, 0.06, 0.015), M('#e0a03c'), arms[0].userData.hand, [0.02, 0.02, 0.07], { r: [0, 0.3, 0.1] });
    const R = 0.27, head = K.head(body, 0, 1.12, 0.03, R);
    P(G.sph(R, 20, 14), M(SKIN), head);
    K.ears(head, R);
    P(G.part(R * 1.07, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), M(C.hair), head, [0, 0.01, -0.02], { r: [-0.25, 0, 0] });
    P(G.sph(R * 0.52, 16, 12), M(C.hair), head, [0, R * 1.08, -R * 0.15]);
    P(G.sph(R * 0.3, 12, 10), M(C.hair), head, [R * 0.3, R * 1.3, -R * 0.1], { r: [0, 0, 0.6], s: [1.5, 0.6, 0.8] });
    K.eyes(head, R, { y: 0.05, x: 0.36, r: 0.24, pupil: 0.4 });
    for (const s of [-1, 1]) {
      const ex = s * R * 0.36, ey = R * 0.05, ez = Math.sqrt(R * R - ex * ex - ey * ey) + 0.025;
      P(G.tor(R * 0.29, 0.012), M('#1a2030'), head, [ex, ey, ez], { ol: 0 });
    }
    P(G.box(R * 0.2, 0.012, 0.012, 0.004), M('#1a2030'), head, [0, R * 0.05, R * 1.02], { ol: 0 });
    P(G.sph(R * 0.09, 8, 6), M('#e8b8a0'), head, [0, -R * 0.38, R * 0.93], { s: [1.3, 0.8, 0.6], ol: 0 });
    K.brows(head, R, '#d88a2c', 0.45, -0.15, 0.24);
    return { root, body, legs, arms, head, h: 1.4, name: 'zoya', shush: true };
  },
  frol(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const SK = '#e8c49e', C = { shirt: '#1f2840', over: '#8fc0e8', blank: '#c9cfd6', stripe: '#2b3654', beanie: '#c84a4a', glove: '#2a3248', pants: '#2c3552', boot: '#1b2133' };
    const legs = [K.leg(body, -0.22, 0.6, 0.34, 0.15, C.pants, C.boot), K.leg(body, 0.22, 0.6, 0.34, 0.15, C.pants, C.boot)];
    P(K.lathe([[0.42, 0.55], [0.58, 0.8], [0.62, 1.1], [0.56, 1.4], [0.32, 1.6]]), M(C.shirt), body, [0, 0, 0], { s: [1, 1, 0.82] });
    P(K.lathe([[0.44, 0.53], [0.6, 0.78], [0.635, 1.0], [0.6, 1.12]]), M(C.over), body, [0, 0, 0], { s: [1, 1, 0.84] });
    P(G.box(0.46, 0.34, 0.08, 0.04), M(C.over), body, [0, 1.18, 0.42], { r: [-0.12, 0, 0] });
    P(G.box(0.2, 0.13, 0.03, 0.02), M('#7aaed8'), body, [0, 1.12, 0.47], { r: [-0.12, 0, 0], ol: 0.006 });
    for (const s of [-1, 1]) P(G.box(0.07, 0.42, 0.05, 0.02), M(C.over), body, [s * 0.2, 1.3, 0.35], { r: [-0.3, 0, 0], ol: 0.006 });
    const arms = [K.arm(body, -1, 0.62, 1.42, 0.62, 0.13, SK, C.glove, 0.16), K.arm(body, 1, 0.62, 1.42, 0.62, 0.13, SK, C.glove, 0.16)];
    P(G.tor(0.12, 0.03), M('#e8a53a'), arms[0].userData.hand, [0, -0.17, 0.02], { r: [0, 1.2, 0] });
    P(K.lathe([[0.5, 1.26], [0.66, 1.32], [0.69, 1.45], [0.52, 1.6], [0.3, 1.67]], 20), M(C.blank), body, [0, 0, -0.02], { s: [1, 1, 0.86] });
    for (const [r, y] of [[0.68, 1.38], [0.6, 1.54]]) P(G.tor(r, 0.026), M(C.stripe), body, [0, y, -0.02], { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], ol: 0 });
    P(G.box(0.62, 0.9, 0.08, 0.04), M(C.blank), body, [0, 1.1, -0.5], { r: [0.12, 0, 0] });
    for (const s of [-1, 1]) P(G.box(0.05, 0.86, 0.085, 0.01), M(C.stripe), body, [s * 0.18, 1.1, -0.5], { r: [0.12, 0, 0], ol: 0 });
    const R = 0.26, head = K.head(body, 0, 1.86, 0.04, R);
    P(G.sph(R, 20, 14), M(SKIN), head, [0, 0, 0], { s: [1.05, 1, 1] });
    K.ears(head, R);
    P(G.sph(R * 0.95, 20, 12), M('#c9b399'), head, [0, -R * 0.32, R * 0.12], { s: [1.02, 0.62, 0.92], ol: 0 });
    P(G.part(R * 1.06, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), M(C.beanie), head, [0, R * 0.05, 0]);
    P(G.tor(R * 0.93, R * 0.14), M('#a83c3c'), head, [0, R * 0.42, 0], { r: [Math.PI / 2, 0, 0] });
    K.eyes(head, R, { y: 0.1, x: 0.34, r: 0.19, lid: 0.35, pupil: 0.5 });
    K.brows(head, R, '#2a2228', 0.33, -0.1, 0.32);
    P(G.sph(R * 0.17, 12, 10), M('#e8c0a0'), head, [0, -R * 0.08, R * 1.0], { s: [1, 0.9, 0.8] });
    P(G.tor(R * 0.18, 0.01, Math.PI), M('#5a3a3a'), head, [0, -R * 0.38, R * 0.92], { r: [0, 0, Math.PI], ol: 0 });
    return { root, body, legs, arms, head, h: 2.15, name: 'frol' };
  },
  // jacket: the sample's red; the game picks wine or powder (CFG.style.rita; the owner chooses on the sheet)
  rita(K, jacket = '#d9505a') {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { jacket, tights: '#1c2235', hair: '#1e2638', scarf: '#a8dcf5', boot: '#1c2235' };
    const legs = [K.leg(body, -0.09, 0.86, 0.66, 0.075, C.tights, C.boot), K.leg(body, 0.09, 0.86, 0.66, 0.075, C.tights, C.boot)];
    P(K.lathe([[0.3, 0.62], [0.24, 0.8], [0.2, 1.0], [0.24, 1.22], [0.2, 1.36], [0.1, 1.42]]), M(C.jacket), body, [0, 0, 0], { s: [1, 1, 0.75] });
    P(G.box(0.36, 0.05, 0.27, 0.02), M('#1c2235'), body, [0, 0.98, 0], { ol: 0 });
    for (let i = 0; i < 3; i++) P(G.box(0.12, 0.025, 0.02, 0.008), M('#efe6d4'), body, [0, 1.06 + i * 0.09, 0.19], { ol: 0 });
    const arms = [K.arm(body, -1, 0.26, 1.33, 0.48, 0.06, C.jacket, '#1c2235', 0.06), K.arm(body, 1, 0.26, 1.33, 0.48, 0.06, C.jacket, '#1c2235', 0.06)];
    arms[1].rotation.set(0.0, 0, 0.35);
    for (const a of arms) P(G.cyl(0.07, 0.07, 0.06), M('#f2a944'), a, [0, -0.44, 0], { ol: 0.006 });
    P(G.tor(0.16, 0.06), M(C.scarf), body, [0, 1.42, 0.02], { r: [Math.PI / 2 - 0.15, 0, 0] });
    P(K.taper([[0.08, 1.4, 0.17], [0.13, 1.28, 0.21], [0.17, 1.12, 0.2], [0.2, 1.0, 0.17]], 0.055, 0.04), M(C.scarf), body);
    const R = 0.22, head = K.head(body, 0, 1.66, 0.02, R);
    P(G.sph(R, 20, 14), M(SKIN), head, [0, 0, 0], { s: [0.95, 1.05, 1] });
    K.ears(head, R);
    P(G.part(R * 1.07, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), M(C.hair), head, [0, 0.0, -0.01], { r: [-0.3, 0, 0] });
    P(G.sph(R * 0.35, 12, 10), M(C.hair), head, [R * 0.45, R * 0.55, R * 0.62], { s: [1.4, 0.6, 0.7], r: [0, 0, -0.5] });
    P(G.tor(R * 0.22, 0.03), M('#c0444f'), head, [0, R * 1.0, -R * 0.55], { r: [1.2, 0, 0] });
    P(K.taper([[0, R * 0.95, -R * 0.55], [0, R * 1.45, -R * 1.25], [0, R * 0.9, -R * 2.2], [0, -R * 0.7, -R * 2.45], [0, -R * 2.3, -R * 1.9]], 0.13, 0.03, 28), M(C.hair), head);
    P(K.taper([[0.05, R * 1.4, -R * 1.3], [0.05, R * 0.85, -R * 2.25], [0.05, -R * 0.6, -R * 2.5]], 0.03, 0.01, 16), M('#c8d2e6'), head, [0, 0, 0], { ol: 0 });
    P(G.cyl(R * 0.99, R * 0.99, R * 0.42, 28, true), M('#0e1118', { side: THREE.DoubleSide }), head, [0, R * 0.12, 0.012], { ol: 0 });   // the mask
    K.eyes(head, R, { y: 0.12, x: 0.37, r: 0.2, pupil: 0.5, look: [0.4, 0] });
    P(G.sph(R * 0.09, 8, 6), M('#e8c0a0'), head, [0, -R * 0.12, R * 1.0], { ol: 0 });
    P(G.tor(R * 0.2, 0.012, Math.PI), M('#8a3a40'), head, [0, -R * 0.42, R * 0.9], { r: [0, 0, Math.PI + 0.25], ol: 0 });
    return { root, body, legs, arms, head, h: 1.78, name: 'rita' };
  },
  nazar(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { hood: '#3a6068', pants: '#1c2438', shoe: '#33405e' };
    const legs = [K.leg(body, -0.12, 0.82, 0.58, 0.095, C.pants, C.shoe, 1.1), K.leg(body, 0.12, 0.82, 0.58, 0.095, C.pants, C.shoe, 1.1)];
    P(K.lathe([[0.3, 0.74], [0.31, 0.95], [0.3, 1.2], [0.26, 1.36], [0.15, 1.44]]), M(C.hood), body, [0, 0, 0], { s: [1, 1, 0.78] });
    P(G.box(0.34, 0.15, 0.05, 0.03), M('#2f5058'), body, [0, 0.92, 0.23], { ol: 0.006 });
    for (const s of [-1, 1]) P(G.cap(0.008, 0.12), M('#efe6d4'), body, [s * 0.06, 1.24, 0.25], { ol: 0 });
    const arms = [K.arm(body, -1, 0.31, 1.33, 0.5, 0.075, C.hood, SKIN, 0.07), K.arm(body, 1, 0.31, 1.33, 0.5, 0.075, C.hood, SKIN, 0.07)];
    K.aim(arms[1], 0.08, 1.12, 0.3, true);
    P(G.box(0.17, 0.23, 0.05, 0.015), M('#c84a50'), arms[1].userData.hand, [-0.05, 0.02, 0.06], { r: [0.2, 0.4, 0] });
    const R = 0.23, head = K.head(body, 0, 1.64, 0.03, R);
    P(G.sph(R, 20, 14), M(SKIN), head, [0, 0, 0], { s: [0.95, 1.06, 1] });
    P(G.part(R * 1.3, 24, 16, Math.PI * 0.5 + 0.9, Math.PI * 2 - 1.8), M(C.hood), head, [0, 0.03, -0.03], { s: [1, 1.08, 1] });
    P(G.sph(R * 0.75, 16, 10), M('#141a26'), head, [0, R * 0.78, R * 0.22], { s: [1.12, 0.3, 0.85], ol: 0.006 });
    K.eyes(head, R, { y: 0.02, x: 0.36, r: 0.21, lid: 0.55, pupil: 0.5 });
    for (const s of [-1, 1]) P(G.sph(R * 0.14, 10, 8), M('#b8aec8'), head, [s * R * 0.36, R * -0.17, R * 0.88], { s: [1.2, 0.45, 0.4], ol: 0 });
    P(G.box(R * 0.32, 0.01, 0.01, 0.003), M('#5a3a3a'), head, [0, -R * 0.45, R * 0.9], { ol: 0 });
    return { root, body, legs, arms, head, h: 1.78, name: 'nazar', book: true };
  },
  // Шафник in the sample's wardrobe (the sheet's sample; the game keeps its own wardrobe and takes the eyes,
  // the arms and the sock from shafnyk() below)
  wardrobe(K) {
    const { P, G, M } = K;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const C = { wood: '#34436a', inner: '#05070c' };
    P(G.box(1.05, 1.9, 0.6, 0.04), M(C.wood), body, [0, 1.05, 0]);
    P(G.box(1.18, 0.12, 0.68, 0.03), M('#2a3756'), body, [0, 2.05, 0]);
    P(G.cyl(0.25, 0.25, 0.1, 20, false), M('#2a3756'), body, [0, 2.12, 0.0], { s: [1.4, 1, 0.3] });
    P(G.box(0.98, 1.72, 0.02, 0.01), M(C.inner), body, [0, 1.05, 0.301], { ol: 0 });
    for (const s of [-1, 1]) for (const y of [0.25, 1.98]) P(G.box(0.1, 0.12, 0.1, 0.02), M('#2a3756'), body, [s * 0.44, y - 0.18, 0.2], { ol: 0.008 });
    const doorL = new THREE.Group(); doorL.position.set(-0.49, 1.05, 0.31); body.add(doorL);
    P(G.box(0.47, 1.72, 0.04, 0.015), M(C.wood), doorL, [0.235, 0, 0]);
    P(G.box(0.36, 0.6, 0.02, 0.01), M('#2c3a5e'), doorL, [0.235, 0.4, 0.025], { ol: 0.006 });
    P(G.box(0.36, 0.6, 0.02, 0.01), M('#2c3a5e'), doorL, [0.235, -0.38, 0.025], { ol: 0.006 });
    P(G.sph(0.03, 8, 6), M('#f2b640'), doorL, [0.42, 0, 0.04], { ol: 0 });
    doorL.rotation.y = -0.55;
    const doorR = new THREE.Group(); doorR.position.set(0.49, 1.05, 0.31); body.add(doorR);
    P(G.box(0.47, 1.72, 0.04, 0.015), M(C.wood), doorR, [-0.235, 0, 0]);
    P(G.box(0.36, 0.6, 0.02, 0.01), M('#2c3a5e'), doorR, [-0.235, 0.4, 0.025], { ol: 0.006 });
    P(G.box(0.36, 0.6, 0.02, 0.01), M('#2c3a5e'), doorR, [-0.235, -0.38, 0.025], { ol: 0.006 });
    P(G.sph(0.03, 8, 6), M('#f2b640'), doorR, [-0.42, 0, 0.04], { ol: 0 });
    P(K.taper([[-0.3, 0.2, 0.05], [-0.31, -0.05, 0.06], [-0.24, -0.12, 0.07]], 0.04, 0.035, 12), M('#d8505a'), doorR, [0, 0, 0], { ol: 0.006 });   // the sock
    doorR.rotation.y = 0.45;
    const eyeG = new THREE.Group(); eyeG.position.set(0, 1.55, 0.36); body.add(eyeG);
    for (const s of [-1, 1]) P(G.sph(0.075, 16, 12), K.glow('#7fd0ff'), eyeG, [s * 0.1, 0, 0], { s: [1, 1.15, 0.5], ol: 0.01 });
    for (const s of [-1, 1]) {
      P(K.taper([[s * 0.2, 1.2, 0.33], [s * 0.45, 1.05, 0.5], [s * 0.62, 0.7, 0.42], [s * 0.7, 0.35, 0.5]], 0.03, 0.018, 24), M('#0d1220'), body, [0, 0, 0], { ol: 0.008 });
      for (let f = 0; f < 4; f++) P(K.taper([[s * 0.7, 0.35, 0.5], [s * (0.72 + f * 0.015), 0.22, 0.52 + (f - 1.5) * 0.04], [s * (0.73 + f * 0.02), 0.14, 0.55 + (f - 1.5) * 0.06]], 0.012, 0.006, 8), M('#0d1220'), body, [0, 0, 0], { ol: 0.005 });
    }
    return { root, body, legs: [], arms: [], head: eyeG, h: 2.2, name: 'shafnyk' };
  },
};

// Шафник for the game's lurker (enemies/lurker.js keeps its wardrobe, its doors and its moves): the sample's
// glowing eyes without pupils, the long thin arms with four fingers (here reaching forward, -Z, from the
// gap: the lunge pushes them out), the sock (the sample's, in the right door's space). Each part is a
// group of meshes; style/figures.js merges them.
export function shafnyk(K) {
  const { P, G, M } = K;
  const eyes = new THREE.Group(), arms = new THREE.Group(), sock = new THREE.Group();
  for (const s of [-1, 1]) P(G.sph(0.075, 16, 12), K.glow('#7fd0ff'), eyes, [s * 0.1, 0.09, -0.24], { s: [1, 1.15, 0.5], ol: 0.01 });
  for (const s of [-1, 1]) {
    P(K.taper([[s * 0.2, -0.02, -0.15], [s * 0.3, -0.06, -0.4], [s * 0.3, -0.1, -0.62], [s * 0.28, -0.08, -0.8]], 0.03, 0.018, 24), M('#0d1220'), arms, [0, 0, 0], { ol: 0.008 });
    for (let f = 0; f < 4; f++) P(K.taper([[s * 0.28, -0.08, -0.8], [s * (0.28 + (f - 1.5) * 0.03), -0.1, -0.9], [s * (0.28 + (f - 1.5) * 0.05), -0.16, -0.97]], 0.012, 0.006, 8), M('#0d1220'), arms, [0, 0, 0], { ol: 0.005 });
  }
  P(K.taper([[0, 0.2, 0], [0, -0.05, 0.01], [0.07, -0.12, 0.02]], 0.04, 0.035, 12), M('#d8505a'), sock, [0, 0, 0], { ol: 0.006 });
  return { eyes, arms, sock };
}
