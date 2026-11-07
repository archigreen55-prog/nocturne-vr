// Throwing on a phone and a PC (W2a): the throw's velocity from the view, the arc that shows where it
// lands (dots + a ring, one mesh each, unlit), the cans and bottles of the map. In VR the hand's own
// swing throws (loot/hands.js). Numbers: CFG.throw.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const G = 9.8;

// The map's cans and bottles as item definitions (loot/items.js builds them with the loot).
// W2b: + the traps' pool (each kind as many as a round may hold; hidden until bought and in the van).
export function throwablesFor(mapId) {
  const M = CFG.throw.maps[mapId];
  const cans = M ? M.items.map((d) => ({ ...d, mesh: d.kind, throwable: true, value: 0, name: d.kind === 'bottle' ? S.throw.bottle : S.throw.can })) : [];
  const T = CFG.traps, n = T.limit * 2, pool = [];
  for (const kind of T.order) for (let i = 0; i < n; i++) pool.push({ id: `trap_${kind}${i}`, kind: 'light', trap: kind, mesh: kind === 'clock' ? 'alarm' : kind, throwable: true, value: 0, name: S.traps.names[kind], pos: [0, -20, 0], yaw: 0 });
  return cans.concat(pool);
}

// The aimed throw: CFG.throw.aim.speed along the view's yaw, at the view's pitch + `up`, clamped.
export function aimVelocity(yaw, pitch, out = new THREE.Vector3()) {
  const A = CFG.throw.aim, a = Math.max(A.minPitch, Math.min(A.maxPitch, pitch + A.up));
  return out.set(-Math.sin(yaw) * Math.cos(a), Math.sin(a), -Math.cos(yaw) * Math.cos(a)).multiplyScalar(A.speed);
}

// Where a throw from p with velocity v lands: fills `pts` (Vector3s) along the way and returns the
// landing point (a wall stops it there). The item's own fall (loot/items.js) is the truth; this is
// the same gravity in bigger steps.
export function predictArc(level, p, v, pts, floorY = 0) {
  const x = p.clone(), u = v.clone(), dt = 0.025;
  let n = 0, every = 1;
  for (let i = 0; i < 160; i++) {
    const prevY = x.y;
    u.y -= G * dt;
    x.addScaledVector(u, dt);
    const [nx, nz] = level.resolveWalls(x.x, x.z, 0.04, () => {}, x.y);
    const hitWall = Math.abs(nx - x.x) > 1e-4 || Math.abs(nz - x.z) > 1e-4;
    x.x = nx; x.z = nz;
    const support = level.surfaceAt(x.x, x.z, prevY + 0.02);
    if (x.y <= support || x.y < floorY - 4) { x.y = Math.max(support, floorY - 4); break; }
    if (i % every === 0 && n < pts.length) pts[n++].copy(x);
    if (hitWall) { u.x *= -0.3; u.z *= -0.3; }
  }
  for (let k = n; k < pts.length; k++) pts[k].copy(x);
  return x;
}

// The arc's dots and the landing ring.
export class ThrowArc {
  constructor() {
    const N = CFG.throw.aim.points;
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.dots = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: 0xffd166, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.dots.frustumCulled = false;
    const rg = new THREE.RingGeometry(0.22, 0.27, 28); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    this.group = new THREE.Group();
    this.group.name = 'throw arc';
    this.group.add(this.dots, this.ring);
    this.group.visible = false;
    this.landing = new THREE.Vector3();
  }
  show(level, from, v, floorY) {
    const end = predictArc(level, from, v, this.pts, floorY);
    const a = this.geo.attributes.position;
    this.pts.forEach((p, i) => a.setXYZ(i, p.x, p.y, p.z));
    a.needsUpdate = true;
    this.ring.position.set(end.x, end.y + 0.02, end.z);
    this.landing.copy(end);
    this.group.visible = true;
  }
  hide() { this.group.visible = false; }
}
