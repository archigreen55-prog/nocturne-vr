// Noise events (both layers: the microphone and the game) + ripples on the floor that show them.
// emit() hands every event to the listeners (patrol, lurker) and draws its rings, so a noise is readable
// with the sound off. Plan «голос і кільця» (15.11, owner's rule: what you see is what the guard hears):
// the ring is the hearing radius itself (x the difficulty's hearing CFG.hearing.radiusK, at most
// CFG.ripple.maxRadius; a running step CFG.sprint.rippleMax), and a faint second ring shows how far it
// carries through a wall (x the noise's wallK, else CFG.hearing.occludedK; none when a wall stops it all).
// The line keeps CFG.ripple.line m wide at any radius (a shader on a thin band, not a scaled ring).
// Plan 2026-11-19 task 2 («radar», CFG.ripple.mode): one ring per source at its full radius, a ping that dims and
// comes again while the sound goes on, no wall ring, see-through near the camera (config/noise.js).
import * as THREE from 'three';
import { CFG } from '../config/index.js';

const MAX = 24;
const COLORS = {
  step: 0x6f9fd8, whisper: 0x7fd0ff, voice: 0xffd166, door: 0xc9a27a, drop: 0xff9f43, glass: 0xffffff, shout: 0xff4040,
  run: 0xff7a1a, breath: 0xffd166, can: 0xffb347, device: 0xb48cff, splash: 0x7fb8ff,
};

// The rings of a noise: r — how far the guard hears it in the open (the hearing radius x the difficulty),
// wall — how far through a wall (0: a wall stops it). Exported for the tests and the HUD's checks.
export function ringsOf(e) {
  const max = e.kind === 'run' ? CFG.sprint.rippleMax : CFG.ripple.maxRadius;
  const r = Math.min(max, e.radius * CFG.hearing.radiusK * CFG.ripple.radiusK);
  return { r, wall: r * (e.wallK ?? CFG.hearing.occludedK) };
}

export class NoiseSystem {
  constructor() {
    this.listeners = [];
    this.ripples = [];
    // a band 12 % of the radius wide (not a full square: a 15 m ring would cost the whole screen's pixels on
    // a weak phone); the shader draws the thin line inside it
    const geo = new THREE.RingGeometry(0.88, 1, 96, 1);
    geo.rotateX(-Math.PI / 2);
    this.gain = 1;   // display brightness (systems/brightness.js): the rings stay as visible on a brighter picture
    // on the floor (owner 16.11): depth-tested like the floor itself — walls and furniture hide it, the faint
    // ring through a wall shows in the next room where its floor is seen (a door); never drawn over everything
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // a ring of a constant width: the square's own radius (its instance scale) turns the line width into a
    // share of it, so a 15 m ring is as thin as a 1 m one
    // radar: see-through near the camera (uNear: from 0 at x to full at y, m from the eye); 'grow': never
    const near = CFG.ripple.mode === 'radar' ? CFG.ripple.near : [-2, -1];
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLine = { value: CFG.ripple.line };
      sh.uniforms.uNear = { value: new THREE.Vector2(near[0], near[1]) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRing; varying float vRingR; varying vec3 vRingW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRing = position.xz;\n#ifdef USE_INSTANCING\nvRingR = length(instanceMatrix[0].xyz);\nvRingW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvRingR = 1.0;\nvRingW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRing; varying float vRingR; varying vec3 vRingW; uniform float uLine; uniform vec2 uNear;')
        .replace('#include <opaque_fragment>', 'float rD = length(vRing);\nfloat rHw = max(0.5 * uLine / max(vRingR, 0.001), 0.9 * fwidth(rD));   // at least ~2 px on the screen: a far ring stays a line, not dots\nfloat ringA = 1.0 - smoothstep(0.35 * rHw, rHw, abs(rD - (1.0 - rHw)));\nringA *= smoothstep(uNear.x, uNear.y, distance(vRingW, cameraPosition));   // radar: see-through near the eye\nif (ringA < 0.01) discard;\noutgoingLight *= ringA;\n#include <opaque_fragment>');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'noise ripples';
    this.mesh.renderOrder = 5;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, this.c.setHex(0));  // create colours up front (no shader switch later)
    this.log = [];          // recent events, for tests and the report
    this.ids = new WeakMap(); this.nextId = 0;   // radar: a number for each source (keyOf)
  }

  on(fn) { this.listeners.push(fn); }

  // kind: step | run | breath | voice | door | drop | glass | shout | can | device | splash; source: 'player' | 'world' | 'patrol'
  // device: the device making it (W2a: the guard goes to switch it off instead of looking around)
  // who: the player who made it (G.players; plan-multiplayer §4.1), null = this device's own player
  // wallK: the share of the radius that gets through a wall instead of CFG.hearing.occludedK (a splash in a quiet yard)
  // look: the guard comes to look even when the suspicion is still low (a lure: Шепотун's echo), not just a glance
  // y: the noise's height; none = the ground under it (this.groundAt: the floor of the player who made it — the
  // mansion's upper floor, the yard), so its rings lie on that floor (owner 16.11: they floated at y 0)
  emit(x, z, radius, kind, { y = null, source = 'player', ripple = true, device = null, who = null, wallK = null, look = false } = {}) {
    if (y === null) y = (this.groundAt ? this.groundAt(x, z, who) : 0) + 0.03;
    const e = { x, z, y, radius, kind, source, device, who, wallK, look, time: performance.now() };
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    for (const fn of this.listeners) fn(e);
    if (ripple && (!this.filter || this.filter(e))) {   // filter: W15, the guard's screen shows only what a guard hears
      const R = ringsOf(e), color = COLORS[kind] || 0xffffff;
      if (CFG.ripple.mode === 'radar') this.ping({ key: this.keyOf(e), x, y: y + 0.01, z, r: R.r, color });
      else {
        this.push({ x, y: y + 0.01, z, r: R.r, t: 0, color, k: 1 });
        if (R.wall > 0.05) this.push({ x, y: y + 0.01, z, r: R.wall, t: 0, color, k: CFG.ripple.wallRing, wall: true });   // how far through a wall
      }
    }
    return e;
  }

  push(rp) { if (this.ripples.length >= MAX) this.ripples.shift(); this.ripples.push(rp); }
  // radar: the source of a ring — a player (who) or a device, and the kind; a world sound without either: its spot
  keyOf(e) {
    let src = e.device ? e.device : e.who;
    if (src && typeof src === 'object') { if (!this.ids.has(src)) this.ids.set(src, ++this.nextId); src = 'o' + this.ids.get(src); }
    else src = e.source + '@' + Math.round(e.x * 2) + ',' + Math.round(e.z * 2);
    return src + '|' + e.kind;
  }
  // radar: the source's ring pings again (moved, its new radius) or a new one starts
  ping(rp) {
    const old = this.ripples.find((r) => r.key === rp.key);
    if (old) { Object.assign(old, rp); old.t = 0; return; }
    this.push({ ...rp, t: 0, k: 1 });
  }
  clear() { this.ripples.length = 0; this.mesh.count = 0; }

  update(dt) {
    if (CFG.ripple.mode === 'radar') { this.updateRadar(dt); return; }
    const life = CFG.ripple.life;
    let n = 0;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t >= life) this.ripples.splice(i, 1);
    }
    for (const r of this.ripples) {
      if (n >= MAX) break;
      if (r.t < 0) continue;
      const t = r.t / life;
      const s = r.r * (0.2 + 0.8 * Math.sqrt(t));
      this.m.makeScale(s, 1, s).setPosition(r.x, r.y, r.z);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setHex(r.color).multiplyScalar((1 - t) * 0.8 * this.gain * (r.k ?? 1));
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // radar: full radius; brightness: 1 at the ping -> `hold` after `ping` s -> kept -> out over `fade` s after `keep` s
  updateRadar(dt) {
    const P = CFG.ripple, end = P.keep + P.fade;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t >= end) this.ripples.splice(i, 1);
    }
    let n = 0;
    for (const r of this.ripples) {
      if (n >= MAX) break;
      if (r.t < 0) continue;
      const b = r.t < P.ping ? 1 - (1 - P.hold) * (r.t / P.ping) : r.t < P.keep ? P.hold : P.hold * (1 - (r.t - P.keep) / P.fade);
      this.m.makeScale(r.r, 1, r.r).setPosition(r.x, r.y, r.z);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setHex(r.color).multiplyScalar(b * 0.8 * this.gain * (r.k ?? 1));
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
