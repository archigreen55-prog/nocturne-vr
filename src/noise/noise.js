// Noise events (both layers: the microphone and the game) + ripples on the floor that show them.
// emit() hands every event to the listeners (patrol, lurker) and draws a ring that grows to the
// noise radius, so a noise is readable without sound (also readable with the sound off).
import * as THREE from 'three';

const MAX = 24;
const LIFE = 0.9;          // s a ripple lives
const VISUAL_MAX = 9;      // m, rings are capped (a shout "fills the zone")
const COLORS = {
  step: 0x6f9fd8, voice: 0xffd166, door: 0xc9a27a, drop: 0xff9f43, glass: 0xffffff, shout: 0xff4040,
};

export class NoiseSystem {
  constructor() {
    this.listeners = [];
    this.ripples = [];
    const geo = new THREE.RingGeometry(0.93, 1, 48);
    geo.rotateX(-Math.PI / 2);
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

  // kind: step | voice | door | drop | glass | shout; source: 'player' | 'world' | 'patrol'
  emit(x, z, radius, kind, { y = 0.03, source = 'player', ripple = true } = {}) {
    const e = { x, z, y, radius, kind, source, time: performance.now() };
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    for (const fn of this.listeners) fn(e);
    if (ripple) {
      if (this.ripples.length >= MAX) this.ripples.shift();
      this.ripples.push({ x, y: y + 0.01, z, r: Math.min(VISUAL_MAX, radius), t: 0, color: COLORS[kind] || 0xffffff, rings: kind === 'shout' ? 3 : 1 });
    }
    return e;
  }

  clear() { this.ripples.length = 0; this.mesh.count = 0; }

  update(dt) {
    let n = 0;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t >= LIFE * r.rings) { this.ripples.splice(i, 1); continue; }
    }
    for (const r of this.ripples) {
      for (let k = 0; k < r.rings && n < MAX; k++) {
        const t = (r.t - k * 0.25) / LIFE;
        if (t <= 0 || t >= 1) continue;
        const s = r.r * (0.15 + 0.85 * Math.sqrt(t));
        this.m.makeScale(s, 1, s).setPosition(r.x, r.y, r.z);
        this.mesh.setMatrixAt(n, this.m);
        this.c.setHex(r.color).multiplyScalar((1 - t) * 0.9);
        this.mesh.setColorAt(n, this.c);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
