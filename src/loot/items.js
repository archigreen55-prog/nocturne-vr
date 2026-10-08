// Loot: 8 items built from primitives. Own simple physics, no engine: an item in a
// hand is kinematic; a dropped one falls with gravity, bounces once, lands on the floor or a
// furniture top. The landing speed decides the noise, the damage (value x damagedK) and, for the
// crystal vase, whether it shatters.
import * as THREE from 'three';
import { Builder, CARGO } from '../world/level.js';
import { CFG } from '../config/index.js';
import { playThud, playGlass } from '../audio/audio.js';

const G = 9.8;
const _up = new THREE.Vector3();
const GOLD = 0xc9a24a, SILVER = 0xb8bcc4;

// Mesh per item id: origin at the bottom centre. Returns { geo parts via builder, h, r }.
function buildItem(id, B) {
  switch (id) {
    case 'statuette':
      B.box(-0.06, 0, -0.06, 0.06, 0.03, 0.06, 0x3a3530);
      B.cyl(0.035, 0.05, 0.16, 0, 0.03, 0, GOLD);
      B.add(new THREE.SphereGeometry(0.042, 10, 8).translate(0, 0.23, 0), GOLD);
      B.box(-0.075, 0.14, -0.012, 0.075, 0.165, 0.012, GOLD);
      return { h: 0.27, r: 0.07 };
    case 'candelabrum':
      B.cyl(0.05, 0.07, 0.03, 0, 0, 0, SILVER);
      B.cyl(0.012, 0.012, 0.22, 0, 0.03, 0, SILVER);
      B.box(-0.11, 0.24, -0.01, 0.11, 0.26, 0.01, SILVER);
      for (const x of [-0.1, 0, 0.1]) {
        B.cyl(0.022, 0.015, 0.03, x, 0.26, 0, SILVER);
        B.cyl(0.012, 0.012, 0.08, x, 0.29, 0, 0xeee6d0);
      }
      return { h: 0.37, r: 0.12 };
    case 'jewelbox':
      B.box(-0.1, 0, -0.07, 0.1, 0.08, 0.07, 0x6a2a2a);
      B.box(-0.105, 0.08, -0.075, 0.105, 0.11, 0.075, 0x5a2020);
      B.box(-0.106, 0.075, -0.076, 0.106, 0.085, 0.076, GOLD);
      B.box(-0.015, 0.05, 0.07, 0.015, 0.09, 0.08, GOLD);
      return { h: 0.11, r: 0.12 };
    case 'painting':
      B.box(-0.23, 0, -0.015, 0.23, 0.36, 0.015, GOLD);
      B.box(-0.19, 0.04, -0.02, 0.19, 0.32, 0.02, 0x2d3f5c);
      B.add(new THREE.CircleGeometry(0.05, 12).translate(0.08, 0.24, 0.021), 0xe8e0b0);
      B.box(-0.19, 0.04, 0.02, 0.19, 0.12, 0.022, 0x1f3a2a);
      return { h: 0.36, r: 0.23 };
    case 'vase':
      B.cyl(0.12, 0.1, 0.1, 0, 0, 0, 0xd8dde8);
      B.cyl(0.19, 0.12, 0.18, 0, 0.1, 0, 0xd8dde8);
      B.cyl(0.195, 0.195, 0.04, 0, 0.2, 0, 0x2f4f9f);
      B.cyl(0.12, 0.19, 0.16, 0, 0.28, 0, 0xd8dde8);
      B.cyl(0.07, 0.12, 0.08, 0, 0.44, 0, 0x2f4f9f);
      B.cyl(0.09, 0.07, 0.04, 0, 0.52, 0, 0xd8dde8);
      return { h: 0.56, r: 0.2 };
    case 'chest':
      B.box(-0.3, 0, -0.2, 0.3, 0.3, 0.2, 0x6b4a2a);
      B.box(-0.31, 0.3, -0.21, 0.31, 0.38, 0.21, 0x5a3a22);
      for (const x of [-0.2, 0.2]) B.box(x - 0.025, 0, -0.212, x + 0.025, 0.385, 0.212, 0x777c85);
      B.box(-0.04, 0.24, 0.2, 0.04, 0.32, 0.225, GOLD);
      return { h: 0.38, r: 0.36 };
    case 'clock':
      B.box(-0.21, 0.03, -0.09, 0.21, 0.32, 0.09, 0x3b2418);
      B.box(-0.14, 0.32, -0.07, 0.14, 0.36, 0.07, 0x3b2418);
      B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16).rotateX(Math.PI / 2).translate(0, 0.18, 0.095), 0xe8e0c8);
      B.box(-0.004, 0.18, 0.105, 0.004, 0.26, 0.11, 0x111111);
      B.box(0, 0.176, 0.105, 0.06, 0.184, 0.11, 0x111111);
      for (const x of [-0.17, 0.17]) B.cyl(0.02, 0.025, 0.03, x, 0, 0, GOLD);
      return { h: 0.36, r: 0.23 };
    case 'crystal':
      B.cyl(0.05, 0.035, 0.05, 0, 0, 0, 0xa8dcff);
      B.cyl(0.07, 0.05, 0.12, 0, 0.05, 0, 0xa8dcff);
      B.cyl(0.045, 0.07, 0.1, 0, 0.17, 0, 0xc8ecff);
      B.cyl(0.06, 0.045, 0.04, 0, 0.27, 0, 0xa8dcff);
      return { h: 0.31, r: 0.07 };
  }
  throw new Error('unknown item ' + id);
}

export function inCargo(x, z) {
  return x > CARGO.minX && x < CARGO.maxX && z > CARGO.minZ && z < CARGO.maxZ;
}

// Places in the van for delivered loot (2 columns, front to back).
const SLOTS = [[3.95, 8.3], [4.85, 8.3], [3.95, 9.0], [4.85, 9.0], [3.95, 9.7], [4.85, 9.7], [3.95, 10.4], [4.85, 10.4], [4.4, 11.0]];

class Item {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.kind = def.kind;
    this.twoHanded = def.kind === 'medium';
    this.crystal = def.kind === 'crystal';
    const B = new Builder();
    const { h, r } = buildItem(def.id, B);
    this.h = h; this.r = r;
    this.baseEmissive = this.crystal ? 0x16324a : 0x000000;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: this.baseEmissive });
    this.mesh = B.mesh(this.mat);
    this.mesh.name = 'loot: ' + def.id;
    this.vel = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.holders = [];       // hands holding it ('left' / 'right' / 'desk')
    if (this.crystal) {
      const S = new Builder();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, d = 0.05 + (i % 3) * 0.08;
        S.add(new THREE.TetrahedronGeometry(0.02 + (i % 2) * 0.012).rotateY(a).translate(Math.cos(a) * d, 0.012, Math.sin(a) * d), 0xc8ecff);
      }
      this.shards = S.mesh(this.mat);
      this.shards.visible = false;
    }
    this.reset();
  }

  reset() {
    const [x, y, z] = this.def.pos;
    this.mesh.position.set(x, y, z);
    this.mesh.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.def.yaw || 0);
    this.mesh.visible = true;
    this.state = 'rest';     // rest | held | fall | fly (into the van) | broken
    this.damaged = false;
    this.broken = false;
    this.bounced = false;
    this.landed = true;
    this.vel.set(0, 0, 0);
    this.holders.length = 0;
    this.delivered = false;
    this.order = 0;          // delivery order, for the list on the board
    this.fly = null;
    this.mat.color.setHex(0xffffff);
    this.highlight(false);
    if (this.shards) this.shards.visible = false;
  }

  get value() { return this.broken ? 0 : Math.round(this.def.value * (this.damaged ? CFG.loot.damagedK : 1)); }
  get held() { return this.holders.length > 0; }
  // can a hand pick it up? (not broken, not flying, not already in the van)
  get takeable() { return this.state !== 'broken' && this.state !== 'fly' && !this.delivered; }

  centre(out) { return out.copy(this.mesh.position).addScaledVector(_up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion), this.h / 2); }

  highlight(on) {
    this.lit = on;
    this.mat.emissive.setHex(on ? (this.crystal ? 0x3a6a8a : 0x2a2a1c) : this.baseEmissive);
  }

  // Let go: fall from where it is with velocity v.
  drop(v) {
    this.holders.length = 0;
    this.state = 'fall';
    this.bounced = false;
    this.landed = false;
    this.vel.copy(v);
    this.spinAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.spin = Math.min(6, v.length() * 2);
  }
}

export class Loot {
  // env: { level, noise, listener() -> {x, z}, onMessage(text, color), onDeliver(item) }
  constructor(env) {
    this.env = env;
    this.items = CFG.items.map((d) => new Item(d));
    this.group = new THREE.Group();
    this.group.name = 'loot';
    for (const it of this.items) { this.group.add(it.mesh); if (it.shards) this.group.add(it.shards); }
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.orderN = 0;
  }

  get crystal() { return this.items.find((i) => i.crystal); }
  reset() { for (const it of this.items) it.reset(); this.orderN = 0; }

  // Summary for the board and the wrist; list = delivered items in delivery order.
  tally() {
    const s = { inVan: 0, sum: 0, intact: 0, damaged: 0, broken: 0, total: this.items.length, list: [] };
    for (const it of this.items) {
      if (it.broken) s.broken++;
      if (!it.delivered) continue;
      s.inVan++; s.sum += it.value;
      if (it.damaged) s.damaged++; else s.intact++;
      s.list.push({ name: it.name, value: it.value, damaged: it.damaged, order: it.order });
    }
    s.list.sort((a, b) => a.order - b.order);
    return s;
  }

  nextSlot() {
    const used = this.items.filter((i) => i.delivered || i.state === 'fly').length;
    return SLOTS[Math.min(used, SLOTS.length - 1)];
  }

  // Drop-off ring: the item flies from where it is into its place in the van (CFG.dropZone.flyTime).
  deliver(it) {
    if (!it.takeable) return false;
    const [x, z] = this.nextSlot();
    this.e.setFromQuaternion(it.mesh.quaternion);
    it.holders.length = 0;
    it.state = 'fly';
    it.fly = {
      t: 0, from: it.mesh.position.clone(), q0: it.mesh.quaternion.clone(),
      to: new THREE.Vector3(x, CARGO.y, z), q1: new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.e.y),
    };
    return true;
  }

  // Put an item straight into the van (items still in hand when you escape or drive off).
  stow(it) {
    if (it.delivered || it.broken) return;
    const [x, z] = this.nextSlot();
    it.holders.length = 0;
    it.mesh.position.set(x, CARGO.y, z);
    this.e.setFromQuaternion(it.mesh.quaternion); it.mesh.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.e.y);
    it.state = 'rest'; it.landed = true; it.vel.set(0, 0, 0); it.fly = null;
    this.markDelivered(it, true);
  }

  // An item resting on the cargo floor (flown in, stowed, or thrown in) counts, once and for good.
  markDelivered(it, force = false) {
    if (it.delivered || it.broken || it.state !== 'rest') return;
    if (!force && !(inCargo(it.mesh.position.x, it.mesh.position.z) && it.mesh.position.y > 0.2)) return;
    it.delivered = true;
    it.order = ++this.orderN;
    if (this.env.onDeliver) this.env.onDeliver(it);
  }

  // Knock the crystal vase over (bumped, or grabbed too fast).
  knock(it, vx, vz) {
    if (it.state !== 'rest') return;
    it.drop(this.v.set(vx, 0.6, vz));
    this.env.onMessage('Зачепив кришталь!', '#7fc8ff');
  }

  update(dt, player) {
    const cr = this.crystal;
    if (cr && cr.state === 'rest' && !cr.delivered) {
      const p = cr.mesh.position;
      const d = Math.hypot(player.head.x - p.x, player.head.z - p.z);
      if (d < 0.45 && player.speed > CFG.loot.crystal.bumpSpeed && p.y > 0.3) {
        this.knock(cr, (p.x - player.head.x) / d * 0.8, (p.z - player.head.z) / d * 0.8);
      }
    }
    for (const it of this.items) {
      if (it.state === 'fly') { this.flyStep(it, dt); continue; }
      if (it.state !== 'fall') { if (it.state === 'rest') this.markDelivered(it); continue; }
      const steps = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < steps && it.state === 'fall'; i++) this.fallStep(it, dt / steps);
    }
  }

  flyStep(it, dt) {
    const f = it.fly;
    f.t = Math.min(1, f.t + dt / CFG.dropZone.flyTime);
    const k = f.t * f.t * (3 - 2 * f.t);                       // ease in-out
    it.mesh.position.lerpVectors(f.from, f.to, k);
    it.mesh.position.y += Math.sin(Math.PI * f.t) * 0.35;      // a little arc over the sill
    it.mesh.quaternion.slerpQuaternions(f.q0, f.q1, k);
    if (f.t >= 1) {
      it.mesh.position.copy(f.to); it.mesh.quaternion.copy(f.q1);
      it.state = 'rest'; it.fly = null; it.landed = true; it.vel.set(0, 0, 0);
      this.markDelivered(it, true);
    }
  }

  fallStep(it, dt) {
    const p = it.mesh.position, v = it.vel;
    const prevY = p.y;
    v.y -= G * dt;
    p.addScaledVector(v, dt);
    if (it.spin > 0) it.mesh.rotateOnWorldAxis(it.spinAxis, it.spin * dt);
    // walls and doors
    let hit = 0;
    const [nx, nz] = this.env.level.resolveWalls(p.x, p.z, Math.min(0.15, it.r), (cx, cz) => {
      const vn = v.x * cx + v.z * cz;
      if (vn < 0) { hit = Math.max(hit, -vn); v.x -= 1.4 * vn * cx; v.z -= 1.4 * vn * cz; }
    });
    p.x = nx; p.z = nz;
    if (hit > CFG.loot.wallDamageSpeed) this.impact(it, hit, true);
    // landing
    const support = this.env.level.surfaceAt(p.x, p.z, prevY + 0.02);
    if (p.y > support) return;
    p.y = support;
    const speed = -v.y;
    if (!it.landed) { it.landed = true; this.impact(it, speed, false); }
    if (it.state === 'broken') return;
    if (!it.bounced && speed > 1.5) {
      it.bounced = true;
      v.y = speed * 0.22; v.x *= 0.4; v.z *= 0.4;
      it.spin *= 0.5;
      return;
    }
    // at rest, upright, keeping its yaw
    v.set(0, 0, 0);
    it.state = 'rest';
    this.e.setFromQuaternion(it.mesh.quaternion);
    it.mesh.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.e.y);
    this.markDelivered(it);
  }

  // First hit after a drop (floor or wall): damage, noise, sound.
  impact(it, speed, wall) {
    const env = this.env, p = it.mesh.position, L = env.listener();
    const occ = env.level.soundOccluded(L.x, L.z, p.x, p.z);
    const pos = { x: p.x, y: p.y + 0.1, z: p.z };
    if (it.crystal && speed > CFG.loot.crystal.breakSpeed) {
      it.broken = true; it.damaged = true; it.state = 'broken';
      it.mesh.visible = false;
      it.shards.position.set(p.x, p.y, p.z); it.shards.visible = true;
      playGlass(pos, occ);
      env.noise.emit(p.x, p.z, CFG.loot.noiseRadius.glass, 'glass', { y: p.y + 0.02, source: 'world' });
      env.onMessage('Кришталь розбився!', '#ff5c5c');
      return;
    }
    if (speed > (wall ? CFG.loot.wallDamageSpeed : CFG.loot.damageSpeed) && !it.damaged) {
      it.damaged = true;
      it.mat.color.setHex(0x9a8a80);
      env.onMessage(`${it.name}: пошкоджено`, '#ff9f43');
    }
    if (speed < CFG.loot.quietLanding) return;
    const base = it.twoHanded ? CFG.loot.noiseRadius.medium : CFG.loot.noiseRadius.light;
    const radius = base * Math.max(0.35, Math.min(1.3, speed / 4));
    playThud(pos, occ, speed / 4, it.twoHanded);
    env.noise.emit(p.x, p.z, radius, 'drop', { y: p.y + 0.02, source: 'world' });
  }
}
