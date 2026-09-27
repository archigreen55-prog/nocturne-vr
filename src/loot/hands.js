// Hands and loot (plan stage 2). Grip near an item picks it up with that hand; a two-handed item
// needs both grips on it and then sits between the hands (the "slot" carry of the net test:
// its pose is a function of the two hand poses, no physics solver). Hands more than
// CFG.loot.twoHandMaxSpan apart or one grip let go = it drops. The crystal vase slips out of a
// hand that moves too fast and tips over if you reach for it too fast.
// On a laptop, E picks the item in front up / puts it down (two-handed items too).
import * as THREE from 'three';
import { CFG } from '../game/config.js';
import { CARGO } from '../world/level.js';
import { playTick } from '../audio/audio.js';

const HANDS = ['left', 'right'];
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Hands {
  // env: { loot, rig (player rig), grips: { left, right } (Object3D), pulse(hand, s, ms), onMessage(text, color) }
  constructor(env) {
    this.env = env;
    this.h = {};
    // pos: world; local/prev: in the rig (real hand motion only, so stick walking and snap turns
    // do not count as a fast hand); vel: that real motion turned into world axes
    for (const n of HANDS) this.h[n] = { name: n, pos: new THREE.Vector3(), local: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), item: null, rel: new THREE.Matrix4(), ok: false, down: false, aloneT: 0 };
    this.inv = new THREE.Matrix4();
    this.rigQ = new THREE.Quaternion();
    this.two = null;      // { item, off: Vector3 (in the hands frame), yawOff }
    this.desk = null;     // item carried on the laptop
  }

  // What the player carries: 'none' | 'light' | 'medium'
  get carrying() {
    if (this.two || (this.desk && this.desk.twoHanded)) return 'medium';
    if (this.desk || this.h.left.item || this.h.right.item) return 'light';
    return 'none';
  }
  // Both hands on a two-handed item: doors cannot be opened.
  get busy() { return !!this.two; }
  heldItems() {
    const s = new Set();
    if (this.desk) s.add(this.desk);
    for (const n of HANDS) if (this.h[n].item) s.add(this.h[n].item);
    return [...s];
  }
  handPos(n) { return this.h[n].ok ? this.h[n].pos : null; }

  reset() {
    for (const n of HANDS) { const h = this.h[n]; h.item = null; h.aloneT = 0; }
    this.two = null; this.desk = null;
  }

  // Reach test: hand within the item's size + grabReach of its centre.
  nearest(pos, except) {
    let best = null, bestD = Infinity;
    for (const it of this.env.loot.items) {
      if (it.state === 'broken' || it === except) continue;
      it.centre(_c);
      const d = pos.distanceTo(_c) - Math.max(it.r, it.h / 2) - CFG.loot.grabReach;
      if (d < 0 && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  // Called every VR frame after the rig and controllers moved. down: { left, right } grip states.
  update(dt, down) {
    const { grips, rig } = this.env;
    rig.updateWorldMatrix(true, false);
    this.inv.copy(rig.matrixWorld).invert();
    rig.getWorldQuaternion(this.rigQ);
    for (const n of HANDS) {
      const h = this.h[n], g = grips[n];
      const wasOk = h.ok;
      h.ok = !!g;
      if (!g) continue;
      g.updateWorldMatrix(true, false);
      h.pos.setFromMatrixPosition(g.matrixWorld);
      h.prev.copy(h.local);
      h.local.copy(h.pos).applyMatrix4(this.inv);
      if (dt > 0 && wasOk) {
        _v.subVectors(h.local, h.prev).divideScalar(dt).applyQuaternion(this.rigQ);
        h.vel.lerp(_v, Math.min(1, dt / 0.06));
      }
      const was = h.down;
      h.down = !!down[n];
      if (h.down && !was) this.grab(n);
      else if (!h.down && was) this.release(n);
    }
    this.carry(dt);
    this.updateHighlight();
  }

  grab(n) {
    const h = this.h[n];
    if (h.item) return;
    const it = this.nearest(h.pos);
    if (!it) return;
    const other = this.h[n === 'left' ? 'right' : 'left'];
    if (it.crystal && it.state === 'rest' && h.vel.length() > CFG.loot.crystal.grabSpeed) {
      this.env.loot.knock(it, h.vel.x * 0.5, h.vel.z * 0.5);
      return;
    }
    if (it.twoHanded) {
      h.item = it; h.aloneT = 0;
      if (!it.holders.includes(n)) it.holders.push(n);
      if (other.item === it && other.down) this.startTwo(it);
      else it.state = it.state === 'fall' ? 'fall' : 'rest';
    } else {
      if (other.item === it) other.item = null;          // hand it over
      h.item = it;
      it.holders.length = 0; it.holders.push(n);
      it.state = 'held';
      _m.copy(this.env.grips[n].matrixWorld).invert();
      h.rel.multiplyMatrices(_m, it.mesh.matrixWorld);
    }
    playTick();
    this.env.pulse(n, 0.25, 25);
  }

  startTwo(it) {
    const L = this.h.left.pos, R = this.h.right.pos;
    const mid = _v.addVectors(L, R).multiplyScalar(0.5);
    const yaw = Math.atan2(-(R.z - L.z), R.x - L.x);
    const e = new THREE.Euler().setFromQuaternion(it.mesh.quaternion, 'YXZ');
    const off = it.mesh.position.clone().sub(mid).applyAxisAngle(UP, -yaw);
    this.two = { item: it, off, yawOff: e.y - yaw };
    it.state = 'held';
  }

  release(n, silent = false) {
    const h = this.h[n], it = h.item;
    if (!it) return;
    h.item = null;
    it.holders = it.holders.filter((x) => x !== n);
    if (this.two && this.two.item === it) {
      // one hand let go of a two-handed item: it drops, the other hand is free again
      this.two = null;
      const o = this.h[n === 'left' ? 'right' : 'left'];
      if (o.item === it) o.item = null;
      this.dropItem(it, _s.addVectors(h.vel, o.vel).multiplyScalar(0.5));
      if (!silent) this.env.onMessage(`${it.name}: впустив`, '#ff9f43');
      return;
    }
    if (it.twoHanded) { if (it.state === 'held') this.dropItem(it, h.vel); return; }
    this.dropItem(it, h.vel);
  }

  dropItem(it, vel) {
    _v.copy(vel);
    if (_v.length() > 6) _v.setLength(6);
    // let go right in front of the open van: it slides into the cargo instead of the grass
    const p = it.mesh.position;
    if (p.x > CARGO.minX - 0.25 && p.x < CARGO.maxX + 0.25 && p.z > CARGO.minZ - 0.9 && p.z < CARGO.minZ + 0.2 && p.y > 0.25) {
      p.z = CARGO.minZ + 0.35; p.x = Math.max(CARGO.minX + 0.2, Math.min(CARGO.maxX - 0.2, p.x));
      _v.set(0, 0, 0);
    }
    it.drop(_v);
  }

  carry(dt) {
    const { grips, onMessage } = this.env;
    // two hands: between the hands, upright, turned with the line between them
    if (this.two) {
      const it = this.two.item, L = this.h.left.pos, R = this.h.right.pos;
      if (L.distanceTo(R) > CFG.loot.twoHandMaxSpan) {
        this.two = null; this.h.left.item = null; this.h.right.item = null;
        this.dropItem(it, _s.addVectors(this.h.left.vel, this.h.right.vel).multiplyScalar(0.5));
        onMessage('Розвів руки — впустив!', '#ff9f43');
        this.env.pulse('left', 0.6, 60); this.env.pulse('right', 0.6, 60);
      } else {
        const yaw = Math.atan2(-(R.z - L.z), R.x - L.x);
        it.mesh.position.addVectors(L, R).multiplyScalar(0.5).add(_v.copy(this.two.off).applyAxisAngle(UP, yaw));
        it.mesh.quaternion.setFromAxisAngle(UP, yaw + this.two.yawOff);
      }
    }
    for (const n of HANDS) {
      const h = this.h[n], it = h.item;
      if (!it || !grips[n]) continue;
      if (it.twoHanded) {
        if (!this.two) {   // one hand on a two-handed item: it does not move
          h.aloneT += dt;
          if (h.aloneT > 0.5 && h.aloneT - dt <= 0.5) onMessage('Це двома руками!', '#ffd166');
        }
        continue;
      }
      _m.multiplyMatrices(grips[n].matrixWorld, h.rel);
      _m.decompose(it.mesh.position, _q, _s);
      it.mesh.quaternion.copy(_q);
      if (it.crystal && h.vel.length() > CFG.loot.crystal.handSpeed) {
        h.item = null;
        this.dropItem(it, h.vel);
        onMessage('Кришталь вислизнув!', '#7fc8ff');
        this.env.pulse(n, 0.8, 80);
      }
    }
  }

  updateHighlight() {
    const lit = new Set();
    for (const n of HANDS) {
      const h = this.h[n];
      if (!h.ok || h.item) continue;
      const it = this.nearest(h.pos);
      if (it && !it.held) lit.add(it);
    }
    if (this.deskAim) lit.add(this.deskAim);
    for (const it of this.env.loot.items) if (it.lit !== lit.has(it)) it.highlight(lit.has(it));
  }

  // ---------- laptop ----------
  // Aim: item in front of the eyes within 1.8 m.
  aimDesk(head, yaw) {
    let best = null, bestD = 1.8;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const it of this.env.loot.items) {
      if (it.state === 'broken' || it.held || it.state === 'fall') continue;
      it.centre(_c);
      const dx = _c.x - head.x, dz = _c.z - head.z, d = Math.hypot(dx, dz);
      if (d > bestD || (d > 0.4 && (dx * fx + dz * fz) / d < 0.75)) continue;
      best = it; bestD = d;
    }
    this.deskAim = this.desk ? null : best;
    return best;
  }
  // E: pick up the aimed item, or put the carried one down in front (into the van when at it).
  toggleDesk(head, yaw, atVan) {
    if (this.desk) {
      const it = this.desk;
      this.desk = null;
      it.holders.length = 0;
      if (atVan) this.env.loot.stow(it);
      else it.drop(_v.set(0, 0, 0));
      return;
    }
    const it = this.deskAim;
    if (!it) return;
    this.desk = it;
    this.deskAim = null;
    it.holders.length = 0; it.holders.push('desk');
    it.state = 'held';
    playTick();
  }
  updateDesk(head, yaw, pitch) {
    const it = this.desk;
    if (!it) return;
    const fwd = it.twoHanded ? 0.6 : 0.5, down = it.twoHanded ? 0.75 : 0.45;
    it.mesh.position.set(head.x - Math.sin(yaw) * fwd, head.y - down + Math.max(-0.2, Math.min(0.2, pitch * 0.3)), head.z - Math.cos(yaw) * fwd);
    it.mesh.quaternion.setFromAxisAngle(UP, yaw);
  }
}
