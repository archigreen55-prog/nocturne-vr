// Noise events (both layers: the microphone and the game) + ripples on the floor that show them.
// emit() hands every event to the listeners (patrol, lurker) and draws one thin ring, so a noise is
// readable with the sound off. The ring is only a hint: CFG.ripple.radiusK of the hearing radius,
// at most CFG.ripple.maxRadius; the hearing radius itself is what the enemies use. A running step
// draws two orange rings (the second a moment later), up to CFG.sprint.rippleMax.
import * as THREE from 'three';
import { CFG } from '../config/index.js';

const MAX = 24;
const COLORS = {
  step: 0x6f9fd8, voice: 0xffd166, door: 0xc9a27a, drop: 0xff9f43, glass: 0xffffff, shout: 0xff4040,
  run: 0xff7a1a, breath: 0xffd166,
};

export class NoiseSystem {
  constructor() {
    this.listeners = [];
    this.ripples = [];
    const geo = new THREE.RingGeometry(0.965, 1, 48);
    geo.rotateX(-Math.PI / 2);
    this.gain = 1;   // display brightness (systems/brightness.js): the rings stay as visible on a brighter picture
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'noise ripples';
    this.mesh.renderOrder = 5;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, this.c.setHex(0));  // create colours up front (no shader switch later)
    this.log = [];          // recent events, for tests and the report
  }

  on(fn) { this.listeners.push(fn); }

  // kind: step | run | breath | voice | door | drop | glass | shout; source: 'player' | 'world' | 'patrol'
  emit(x, z, radius, kind, { y = 0.03, source = 'player', ripple = true } = {}) {
    const e = { x, z, y, radius, kind, source, time: performance.now() };
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    for (const fn of this.listeners) fn(e);
    if (ripple) {
      if (this.ripples.length >= MAX) this.ripples.shift();
      const run = kind === 'run';
      const r = Math.min(run ? CFG.sprint.rippleMax : CFG.ripple.maxRadius, radius * CFG.ripple.radiusK);
      this.ripples.push({ x, y: y + 0.01, z, r, t: 0, color: COLORS[kind] || 0xffffff });
      if (run) {   // the second ring, smaller, a moment later (t < 0 = not drawn yet)
        if (this.ripples.length >= MAX) this.ripples.shift();
        this.ripples.push({ x, y: y + 0.01, z, r: r * 0.6, t: -CFG.sprint.rippleDelay, color: COLORS.run });
      }
    }
    return e;
  }

  clear() { this.ripples.length = 0; this.mesh.count = 0; }

  update(dt) {
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
      this.c.setHex(r.color).multiplyScalar((1 - t) * 0.8 * this.gain);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
