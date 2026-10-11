// W17 «Стиль»: the character sheet (?page=figures) — the owner approves the figures' look here before
// they go into the game (S2). Every figure of style/figures.js stands on a little stage in the game's
// style: all in a row turning slowly, or one in three views (front, side, back) plus one that walks
// and looks around, or the four thieves side by side 8 m away (do they read apart?). The light: under
// a lamp, in the shadow, in the alarm. «Старий / новий» swaps in the figures the game has had so far.
// «Зразок поруч»: the owner's approved sample (style/toon.js as the sample builds it) next to the game's
// figure, in the same view and light — front and three-quarter, one character at a time.
// The game itself does not run on this page (the sheet takes the frame loop over).
import * as THREE from 'three';
import { G } from '../systems/state.js';
import { S } from '../i18n/index.js';
import { PAL } from './palette.js';
import { lit, styleUniforms as U, setZones } from './materials.js';
import { makeFigure, lurkerGeometries, hullMaterial, RITA, TURN, SOCK_AT } from './figures.js';
import { kit, TOON } from './toon.js';
import { animateGuard, animateThief } from './anim.js';
import { RemotePlayer } from '../net/remotePlayer.js';
import { Builder } from '../world/level.js';
import { quietRandom } from './quiet.js';

// who stands on the sheet: [id, kind, the old figure's description]
const CAST = [
  ['petrovych', 'guard', {}], ['valera', 'guard', {}], ['zhora', 'guard', { coat: 0x4a3b2f, cap: 0x3a2a22, lamp: true }],
  ['zoya', 'thief', 'zoya'], ['frol', 'thief', 'frol'], ['ritaWine', 'thief', 'rita'], ['ritaPowder', 'thief', 'rita'], ['nazar', 'thief', 'nazar'],
  ['shafnyk', 'lurker', null],
];
const FAR = ['zoya', 'frol', 'ritaWine', 'nazar'];   // the four thieves at 8 m

// ---------- the old figures (copies of the builds in enemies/patrol.js and enemies/lurker.js, for comparing only) ----------
function oldGuard(GC) {
  const COAT = GC.coat || 0x2f3b52, CAP = GC.cap || 0x1d2433, mat = lit(), g = new THREE.Group();
  const B = new Builder();
  for (const x of [-0.11, 0.11]) B.box(x - 0.07, 0, -0.08, x + 0.07, 0.82, 0.08, 0x23262e);
  for (const x of [-0.11, 0.11]) B.box(x - 0.08, 0, -0.14, x + 0.08, 0.07, 0.08, 0x121316);
  B.box(-0.24, 0.8, -0.15, 0.24, 1.44, 0.15, COAT);
  B.box(-0.245, 0.86, -0.155, 0.245, 0.92, 0.155, 0x111318);
  B.box(-0.34, 0.86, -0.06, -0.24, 1.42, 0.06, COAT);
  B.box(-0.33, 0.78, -0.05, -0.25, 0.86, 0.05, 0xd9c9b0);
  const Ub = new Builder();
  Ub.add(new THREE.SphereGeometry(0.21, 14, 10).translate(0, 1.66, 0), 0xd9c9b0);
  Ub.cyl(0.215, 0.215, 0.09, 0, 1.78, 0, CAP, 14);
  Ub.box(-0.14, 1.78, -0.33, 0.14, 1.8, -0.18, CAP);
  for (const x of [-0.075, 0.075]) Ub.add(new THREE.SphereGeometry(0.028, 8, 6).translate(x, 1.7, -0.19), 0x0b0b0d);
  Ub.add(new THREE.ConeGeometry(0.045, 0.12, 8).rotateX(-Math.PI / 2).translate(0, 1.64, -0.24), 0xc9a890);
  Ub.box(-0.08, 1.54, -0.2, 0.08, 1.56, -0.18, 0x5a2a2a);
  Ub.box(0.24, 1.26, -0.45, 0.34, 1.36, 0.05, COAT);
  if (!GC.lamp) Ub.add(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 10).rotateX(Math.PI / 2).translate(0.29, 1.31, -0.52), 0x16181c);
  else Ub.add(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8).translate(0.29, 1.2, -0.5), 0x2a2a30);
  const upper = Ub.mesh(mat);
  g.add(B.mesh(mat), upper);
  g.userData.upper = upper;
  return g;
}
const oldThief = (thief) => RemotePlayer.prototype.build.call({ id: 'sheet', thief });

// a wardrobe with its doors open and the lurker in the gap (the old look: the game's own lurker meshes)
function wardrobe(isNew) {
  const g = new THREE.Group(), B = new Builder();
  B.box(-0.5, 0.08, 0.0, 0.5, 2.1, 0.62, 0x3b2d25);               // the carcass, its front at z = 0
  B.box(-0.55, 2.1, -0.04, 0.55, 2.22, 0.66, 0x2e231d);           // the crown
  B.box(-0.5, 0, 0, -0.42, 0.08, 0.6, 0x2e231d); B.box(0.42, 0, 0, 0.5, 0.08, 0.6, 0x2e231d);   // feet
  B.box(-0.46, 0.12, 0.02, 0.46, 2.06, 0.05, 0x07090f);           // the dark inside
  const mat = lit();
  g.add(B.mesh(mat));
  // the doors: the lurker's own door leaf (enemies/lurker.js D1: thin in x, its width along z, hinged at
  // z = 0), turned so it spans the front and swung open towards the camera
  const door = (s) => {
    const D = new Builder();
    D.box(-0.015, 0.08, 0, 0.015, 2.04, 0.5, 0x4a3a2e);
    D.box(-0.03, 0.9, 0.4, -0.015, 1.1, 0.44, 0xc2a15a);
    const m = new THREE.Group(); m.add(D.mesh(mat));
    m.position.set(s * 0.5, 0, 0); m.rotation.y = -s * (Math.PI / 2 + 1.2);
    return m;
  };
  const d1 = door(-1), d2 = door(1);
  g.add(d1, d2);
  const creature = new THREE.Group();
  creature.position.set(0, 1.25, -0.05);
  if (isNew) {
    const L = lurkerGeometries();
    const body = new THREE.Mesh(L.body, mat), arms = new THREE.Mesh(L.arms, mat), eyes = new THREE.Mesh(L.eyes, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    body.add(new THREE.Mesh(L.bodyHull, hullMaterial())); arms.add(new THREE.Mesh(L.armsHull, hullMaterial())); eyes.add(new THREE.Mesh(L.eyesHull, hullMaterial()));
    arms.rotation.x = 0.35; arms.scale.z = 0.55;   // reaching out of the gap, down (the lunge stretches them in the game)
    creature.add(body, eyes, arms);
    const sock = new THREE.Mesh(L.sock, mat);
    sock.add(new THREE.Mesh(L.sockHull, hullMaterial()));
    sock.position.set(SOCK_AT[0], SOCK_AT[1], SOCK_AT[2] - 0.25);   // on the left door's knob (the game's door is wider)
    d1.add(sock);
  } else if (G.lurker) {
    for (const m of [G.lurker.body, G.lurker.arms, G.lurker.eyes]) creature.add(new THREE.Mesh(m.geometry, m.material));
  }
  g.add(creature);
  return g;   // its front faces -Z, like the figures
}

// ---------- one figure on the stage: its group, what moves it ----------
function makeOne(id, kind, old, isNew) {
  if (kind === 'lurker') return { root: wardrobe(isNew), kind, id };
  if (!isNew) {
    const root = kind === 'guard' ? oldGuard(old) : oldThief(old);
    return { root, kind, id, old: true };
  }
  const fig = makeFigure(id);
  const root = new THREE.Group(); root.add(fig.root);
  fig.who = id === 'ritaWine' || id === 'ritaPowder' ? 'rita' : id;
  if (kind === 'guard') return { root, kind, id, fig, p: { fig, speed: 0, phase: 0, queue: [], upper: { rotation: { y: 0 } }, state: 'task', brain: { angryT: 0 }, pose: null, sitting: false } };
  return { root, kind, id, fig, rp: { fig, speed: 0, lookPitch: 0, crouched: false, desk: null, lost: false } };
}

// the owner's sample of the same character, as the sample page builds it (its segments, toon steps, outline);
// turned to face the camera the way the game's figure is (mirrored front to back, or turned round)
function makeSample(id, kind) {
  if (kind === 'lurker') { const t = TOON.wardrobe(kit(false)), root = new THREE.Group(); t.root.rotation.y = Math.PI; root.add(t.root); return { root, kind, id, sample: true }; }
  const base = id.startsWith('rita') ? 'rita' : id;
  const t = TOON[base](kit(false), id === 'ritaWine' ? RITA.wine : id === 'ritaPowder' ? RITA.powder : undefined);
  const root = new THREE.Group(); root.add(t.root);
  if (TURN.has(base)) t.root.rotation.y = Math.PI; else t.root.scale.z = -1;
  return { root, kind, id, sample: true };
}

export function startSheet() {
  const { renderer } = G;
  for (const id of ['overlay', 'hud', 'touch', 'hint', 'crosshair', 'debug', 'summary', 'pausemenu', 'rotate', 'edgeflash']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const T = S.style.sheet;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.night);
  scene.fog = new THREE.Fog(PAL.dusk, 6, 24);   // the game's fog
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  // the stage: a floor and a wall behind (the guards must stand out from the walls)
  quietRandom(() => {
    const B = new Builder();
    B.box(-20, -0.05, -14, 20, 0, 8, 0x4d3b2f);
    B.box(-20, 0, 2.2, 20, 2.7, 2.4, 0x6f7686);
    scene.add(B.mesh(lit()));
  });
  const hemi = new THREE.HemisphereLight(0x46587f, 0x17130f, 1.5), moon = new THREE.DirectionalLight(0x9fb4ff, 0.55);
  moon.position.set(-0.6, 0.8, -0.7);
  const lamp = new THREE.PointLight(0xffc98a, 6, 16, 1.6);
  scene.add(hemi, moon, lamp);
  const st = { mode: 'all', light: 'lamp', isNew: true, walk: false, look: false, spin: true, pick: 0, t: 0 };
  let cast = [], labels = [];
  const labelBox = document.createElement('div');
  labelBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;font:600 12px system-ui,sans-serif;color:#efe6d4';
  document.body.appendChild(labelBox);

  function setLight() {
    const L = st.light;
    hemi.color.setHex(0x46587f); lamp.color.setHex(0xffc98a);
    if (L === 'alarm') { hemi.color.lerp(new THREE.Color(0xa01818), 0.8); lamp.color.lerp(new THREE.Color(0xff3030), 0.7); }
    lamp.intensity = L === 'shadow' ? 0 : 6;
    const c = lamp.position;
    setZones(L === 'shadow' ? [] : [{ x: c.x, z: c.z, r: 40, y: 0 }]);   // under the lamp = the «you are seen» step
    scene.fog.color.setHex(PAL.dusk); if (L === 'alarm') scene.fog.color.lerp(new THREE.Color(PAL.alarm), 0.25);
  }
  function rebuild() {
    for (const c of cast) scene.remove(c.root);
    labelBox.textContent = ''; cast = []; labels = [];
    const cmp = st.mode === 'cmp';
    const list = st.mode === 'far' ? CAST.filter((c) => FAR.includes(c[0])) : st.mode === 'one' || cmp ? [CAST[st.pick], CAST[st.pick], CAST[st.pick], CAST[st.pick]] : CAST;
    const gap = st.mode === 'far' ? 1.1 : st.mode === 'one' ? 1.4 : cmp ? (CAST[st.pick][2] === null || CAST[st.pick][0] === 'frol' ? 1.6 : 1.25) : 1.35;
    quietRandom(() => list.forEach(([id, kind, old], i) => {
      const one = cmp && i % 2 === 0 ? makeSample(id, kind) : makeOne(id, kind, old, st.isNew);
      const x = -(i - (list.length - 1) / 2) * gap;   // the camera looks along +Z: the list reads left to right
      one.root.position.set(x, 0, 0);
      one.yaw0 = st.mode === 'one' ? [0, Math.PI / 2, Math.PI, 0][i] : cmp ? [0, 0, -0.7, -0.7][i] : 0;
      one.moving = cmp ? false : st.mode !== 'one' || i === 3;
      scene.add(one.root); cast.push(one);
      const lab = document.createElement('div');
      lab.style.cssText = 'position:absolute;transform:translate(-50%,0);text-align:center;white-space:nowrap;text-shadow:0 1px 2px #000';
      lab.textContent = st.mode === 'one' ? T.views[i] : cmp ? `${T.names[id]} · ${i % 2 ? T.game : T.sample}` : T.names[id];
      labelBox.appendChild(lab); labels.push(lab);
    }));
    // the camera: the row in view; the far row 8 m away
    const width = (list.length - 1) * gap + 1.6;
    const dist = st.mode === 'far' ? 8 : Math.max(3.2, width / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.max(0.6, camera.aspect) + 0.6);
    camera.position.set(0, st.mode === 'far' ? 1.6 : 1.35, -dist);
    camera.lookAt(0, st.mode === 'far' ? 1.0 : 1.05, 0);
    lamp.position.set(0, 2.9, -1.2);
    setLight();
    if (st.mode === 'far') document.title = T.far;
  }

  // the toolbar
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;top:8px;right:8px;z-index:30;display:flex;flex-wrap:wrap;gap:6px;align-items:center';
  document.body.appendChild(bar);
  const buttons = {};
  const btn = (key, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.k = key;
    b.style.cssText = 'font-size:13px;padding:5px 10px';
    b.addEventListener('click', () => { fn(); paint(); });
    bar.appendChild(b); buttons[key] = b;
    return b;
  };
  const paint = () => {
    const on = { all: st.mode === 'all', one: st.mode === 'one', cmp: st.mode === 'cmp', far: st.mode === 'far', lamp: st.light === 'lamp', shadow: st.light === 'shadow', alarm: st.light === 'alarm', walk: st.walk, look: st.look, spin: st.spin };
    for (const [k, b] of Object.entries(buttons)) if (k in on) { b.style.background = on[k] ? '#ffb347' : 'transparent'; b.style.color = on[k] ? '#0d1322' : ''; }
    buttons.ver.textContent = st.isNew ? T.isNew : T.isOld;
    buttons.next.hidden = buttons.prev.hidden = st.mode !== 'one' && st.mode !== 'cmp';
  };
  btn('all', T.modeAll, () => { st.mode = 'all'; rebuild(); });
  btn('one', T.modeOne, () => { st.mode = 'one'; rebuild(); });
  btn('cmp', T.modeCmp, () => { st.mode = 'cmp'; rebuild(); });
  btn('prev', '◀', () => { st.pick = (st.pick + CAST.length - 1) % CAST.length; rebuild(); });
  btn('next', '▶', () => { st.pick = (st.pick + 1) % CAST.length; rebuild(); });
  btn('far', T.modeFar, () => { st.mode = 'far'; st.light = 'shadow'; rebuild(); });
  btn('lamp', T.lamp, () => { st.light = 'lamp'; setLight(); });
  btn('shadow', T.shadow, () => { st.light = 'shadow'; setLight(); });
  btn('alarm', T.alarm, () => { st.light = 'alarm'; setLight(); });
  btn('walk', T.walk, () => { st.walk = !st.walk; });
  btn('look', T.look, () => { st.look = !st.look; });
  btn('spin', T.spin, () => { st.spin = !st.spin; });
  btn('ver', T.isNew, () => { st.isNew = !st.isNew; rebuild(); });

  const V = new THREE.Vector3();
  function frame(now) {
    const dt = Math.min(0.1, (now - (frame.last || now)) / 1000); frame.last = now; st.t += dt;
    U.uStyleExp.value = 1; U.uStyleWarn.value = 1;
    for (const one of cast) {
      if (one.moving && st.spin && st.mode !== 'far') one.yaw = (one.yaw || 0) + dt * 0.5;
      one.root.rotation.y = one.yaw0 + (one.moving ? (one.yaw || 0) : 0);
      const walk = one.moving && st.walk, look = one.moving && st.look;
      if (one.p) {
        one.p.speed = walk ? 1.1 : 0; one.p.phase += one.p.speed * dt * 6;
        one.p.upper.rotation.y = look ? Math.sin(st.t * 0.9) * 0.9 : 0;
        animateGuard(one.p, dt, st.t);
      } else if (one.rp) {
        one.rp.speed = walk ? 1.1 : 0;
        animateThief(one.rp, dt);
        one.fig.bones.head.rotation.y = look ? Math.sin(st.t * 0.9) * 0.8 : 0;
      } else if (one.old && one.root.userData.upper) one.root.userData.upper.rotation.y = look ? Math.sin(st.t * 0.9) * 0.9 : 0;
    }
    if (camera.aspect !== innerWidth / innerHeight) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); rebuild(); }
    renderer.render(scene, camera);
    cast.forEach((one, i) => {
      V.set(one.root.position.x, -0.12, 0).project(camera);
      labels[i].style.left = `${(V.x + 1) / 2 * innerWidth}px`; labels[i].style.top = `${(1 - V.y) / 2 * innerHeight}px`;
    });
  }
  rebuild(); paint();
  renderer.setAnimationLoop(frame);
  return { state: st, get cast() { return cast.map((c) => ({ id: c.id, kind: c.kind, isNew: !c.old, sample: !!c.sample })); }, scene, camera, rebuild, setLight };
}
