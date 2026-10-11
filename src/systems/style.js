// W17 «Стиль» (plan-W17-style.md): the night palette's sky and fog, the lamps' circles, soft shadows,
// water; every frame the style's shared uniforms (the display brightness, the circles where a guard
// sees you further, the line width of the quality preset) and the shadows of what moves.
// The switch «Стиль: увімк / вимк» (start screen; «Для тестерів» from S3): off = the picture as before
// W17. Runs after `flashlight` (the lit materials are patched) and before `brightness` (it takes the
// fog's distances from here).
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { PAL } from '../style/palette.js';
import { STYLE_ON, styleUniforms as U, setStyle, setZones } from '../style/materials.js';
import { buildDecor } from '../style/decor.js';
import { quietRandom } from '../style/quiet.js';
import { animateGuard, animateThief } from '../style/anim.js';
import { FAR } from '../style/figures.js';
import { power } from '../world/devices.js';
import { lampLights } from '../game/stealth.js';
import { G, $, params } from './state.js';
import { startSheet } from '../style/sheet.js';

let decor = null, t = 0;
// a figure far from the camera draws its lighter level (style/figures.js FAR; 1 m of hysteresis)
const camAt = new THREE.Vector3(), figAt = new THREE.Vector3();
function lodOf(f) {
  G.camera.getWorldPosition(camAt); f.root.getWorldPosition(figAt);
  const d = camAt.distanceTo(figAt);
  if (d > FAR + 0.5) f.lod(true); else if (d < FAR - 0.5) f.lod(false);
}
const fogBase = new THREE.Color(PAL.dusk), fogAlarm = new THREE.Color(PAL.alarm);
const spots = [];

// the circles of CFG.stealth.lamps, each on the floor of its lamp (the nearest light above it)
function lampCircles(level) {
  const lights = level.lampList || G.points.map((p) => [p.position.x, p.position.y, p.position.z]);
  return CFG.stealth.lamps.map((l) => {
    let best = null, bd = Infinity;
    for (const L of lights) { const d = Math.hypot(L[0] - l.x, L[2] - l.z); if (d < bd) { bd = d; best = L; } }
    return { x: l.x, z: l.z, r: l.r, y: l.y != null ? l.y : best && best[1] > 4 ? 3 : 0 };   // the lamp's floor (a fountain's rim is not a floor)
  });
}

export const style = {
  id: 'style',
  init() {
    // the character sheet (?page=figures): the owner approves the figures' look; it takes the frame loop
    // over once the page has started (main.js sets its loop after every system's init)
    if (params.get('page') === 'figures') setTimeout(() => { G.sheet = startSheet(); }, 0);
    const sel = $('stylesel');
    if (sel) { sel.value = STYLE_ON ? 'on' : 'off'; sel.addEventListener('change', () => setStyle(sel.value === 'on')); }
    if (!STYLE_ON) return;
    const { scene, level } = G;
    scene.background = new THREE.Color(PAL.night);
    scene.fog.color.copy(fogBase);
    scene.fog.near = CFG.style.fog.near; scene.fog.far = CFG.style.fog.far;
    this.circles = lampCircles(level);
    this.lampDoors = (level.doors || []).filter((d) => this.circles.some((c) => Math.hypot(d.hx - c.x, d.hz - c.z) < c.r + 1.5));   // the doors that can cut a circle
    decor = G.decor = quietRandom(() => buildDecor(scene, level, this.circles, CFG.style, level.floorY ? (x, z, y) => level.floorY(x, z, y) : () => 0));   // the game's random numbers untouched
  },
  frame(dt) {
    if (!STYLE_ON) return;
    const { level, quality, scene, alert } = G;
    const low = !!quality && quality.preset === 'low';
    t += dt;
    U.uStyleExp.value = G.lightK;
    U.uStyleWarn.value = alert && G.lightK ? alert.glowGain / G.lightK : 1;   // brightness.js: warnings get k x WARN, the rest k
    U.uStyleInk.value = low ? CFG.style.ink.pxLow : CFG.style.ink.px;
    // the circles: the lamps (none with the breaker off); a guard's hand lamp is lit by its own light (CFG.style.bands.hand)
    // ...cut by the walls and the closed doors as the stealth sees it (game/stealth.js lampLights)
    const lv = G.level, doorKey = this.lampDoors.map((d) => (Math.abs(d.angle) > 0.35 ? 1 : 0)).join('');
    setZones(power.dark ? [] : this.circles, (c, x, z) => lampLights(lv, c, x, z, c.y), doorKey);   // rebuilt only when they change
    if (decor.pools) decor.pools.visible = !power.dark;
    // the fog goes a little red in a full alarm
    scene.fog.color.copy(fogBase).lerp(fogAlarm, CFG.style.fog.alarm * Math.max(0, Math.min(1, (alert ? alert.k : 0) - 1)));
    // water: rings run (still on the low preset; no puddles there)
    for (const w of decor.water) {
      w.material.uniforms.uExp.value = G.lightK;
      if (!low) w.material.uniforms.uTime.value = t;
      w.visible = !(low && w.userData.puddle);
    }
    // the shadows of what moves
    const B = CFG.style.blobs, floorAt = level.floorY ? (x, z, y) => level.floorY(x, z, y) : () => 0;
    spots.length = 0;
    for (const g of G.guards || []) spots.push({ x: g.x, z: g.z, y: g.y || 0, h: 0, r: B.guard });
    for (const p of G.players || []) if (p.remote && !p.lost) spots.push({ x: p.head.x, z: p.head.z, y: p.floorY || 0, h: 0, r: B.friend });
    if (!low && G.loot) for (const it of G.loot.items) {
      if (!it.mesh || !it.mesh.visible || it.state === 'held' || it.state === 'fly' || it.delivered || it.gone) continue;
      const x = it.mesh.position.x, z = it.mesh.position.z, y0 = floorAt(x, z, it.mesh.position.y);
      const h = it.mesh.position.y - y0;
      if (it.state === 'rest' && h > 0.05) continue;   // on a table: the table's shadow
      spots.push({ x, z, y: y0, h, r: B.item });
    }
    decor.setBlobs(spots);
    // S2: the figures move (bones only; the game reads none of it)
    for (const g of G.guards || []) if (g.fig) { animateGuard(g, dt, t); lodOf(g.fig); }
    for (const p of G.players || []) if (p.fig) { animateThief(p, dt); lodOf(p.fig); }
  },
};
