// The lurker: sits in the bedroom wardrobe. Come close (or make a noise next to it) and it
// telegraphs - scratching, a growl, the doors rattle and glowing eyes show in the gap - then lunges
// into your face with a screech. The lunge only scares: the real danger is your own
// scream in the microphone. Back away during the telegraph and it calms down.
// It only reacts to a player in its own room with no wall or closed door between (never through a
// wall from outside), and its lunge stays inside that room.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { Builder, WARDROBE } from '../world/level.js';
import { Voice3D, playScratch, playStinger, playThud } from '../audio/audio.js';
import { asList } from '../game/players.js';
import { lit } from '../style/materials.js';


export class Lurker {
  // env: { level, onScare() }
  constructor(env) {
    this.env = env;
    const W = this.spec = env.spec || (env.level && env.level.wardrobe) || WARDROBE;   // the wardrobe (or crate, W6) it sits in
    this.y0 = W.y0 || 0;
    this.kind = W.kind || 'wardrobe';
    this.HOME = this.kind === 'crate' ? new THREE.Vector3(W.x, this.y0 + 0.45, W.z) : new THREE.Vector3(W.x + 0.36, this.y0 + 1.05, W.z);
    this.FRONT = this.kind === 'crate' ? { x: W.x, z: W.z } : { x: W.x - 0.15, z: W.z };
    this.group = new THREE.Group();
    this.group.name = 'lurker';
    // body: dark lumpy ball, long arms with claws, wide jaw full of teeth; faces -Z
    const B = new Builder();
    const ball = new THREE.IcosahedronGeometry(0.3, 1);
    const p = ball.attributes.position;
    for (let i = 0; i < p.count; i++) {   // lumpy: displacement from the position, so shared corners stay shared
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * Math.sin(x * 23 + y * 17 + z * 29);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    ball.computeVertexNormals();
    B.add(toIndexed(ball), 0x1a1420);
    B.box(-0.17, -0.12, -0.3, 0.17, -0.02, -0.22, 0x5a0f18);           // mouth
    for (let i = 0; i < 7; i++) {
      const x = -0.15 + i * 0.05;
      B.add(new THREE.ConeGeometry(0.018, 0.06, 4).translate(x, -0.03, -0.29), 0xf0ead8);
      B.add(new THREE.ConeGeometry(0.016, 0.05, 4).rotateX(Math.PI).translate(x + 0.025, -0.11, -0.29), 0xf0ead8);
    }
    const mat = lit();
    this.body = B.mesh(mat);
    // long arms with claws: folded away inside the wardrobe, shoot out with the lunge
    const A = new Builder();
    for (const s of [-1, 1]) {
      A.add(new THREE.CylinderGeometry(0.025, 0.035, 0.55, 6).rotateX(Math.PI / 2).translate(s * 0.26, -0.05, -0.28), 0x1a1420);
      for (let f = -1; f <= 1; f++) A.add(new THREE.ConeGeometry(0.012, 0.09, 4).rotateX(-Math.PI / 2).translate(s * 0.26 + f * 0.025, -0.05, -0.6), 0xd8d0c0);
    }
    this.arms = A.mesh(mat);
    const eyes = new Builder();
    for (const s of [-1, 1]) {
      eyes.add(new THREE.SphereGeometry(0.065, 10, 8).translate(s * 0.1, 0.08, -0.25), 0xfff3a0);
      eyes.add(new THREE.SphereGeometry(0.025, 8, 6).translate(s * 0.1, 0.08, -0.31), 0x100808);
    }
    this.eyes = eyes.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.creature = new THREE.Group();
    this.creature.add(this.body, this.eyes, this.arms);
    this.group.add(this.creature);
    // wardrobe doors, hinged at the outer edges, opening into the room (-X)
    const D1 = new Builder(), D2 = new Builder();
    D1.box(-0.015, 0.08, 0, 0.015, 2.04, 0.79, 0x3b2d25);
    D1.box(-0.03, 0.9, 0.66, -0.015, 1.1, 0.7, 0xc2a15a);
    D2.box(-0.015, 0.08, -0.79, 0.015, 2.04, 0, 0x3b2d25);
    D2.box(-0.03, 0.9, -0.7, -0.015, 1.1, -0.66, 0xc2a15a);
    const g1 = D1.mesh(mat), g2 = D2.mesh(mat);
    this.door1 = new THREE.Group(); this.door1.position.set(W.x - 0.02, this.y0, W.minZ); this.door1.add(g1);
    this.door2 = new THREE.Group(); this.door2.position.set(W.x - 0.02, this.y0, W.maxZ); this.door2.add(g2);
    if (this.kind === 'crate') {
      // a crate: its lid, hinged on the far edge, pops up in the telegraph and flies open with the lunge
      const s = W.size || 0.9, Ld = new Builder();
      Ld.box(-s / 2, 0, -s, s / 2, 0.05, 0, 0x7a6a4a);
      Ld.box(-s / 2 + 0.05, 0.05, -s + 0.05, s / 2 - 0.05, 0.07, -0.05, 0x5a4a30);
      this.lid = new THREE.Group(); this.lid.position.set(W.x, this.y0 + s * 0.8, W.z + s / 2); this.lid.add(Ld.mesh(mat));
      this.group.add(this.lid);
    } else this.group.add(this.door1, this.door2);
    this.voice = new Voice3D(1.6);
    this.voice.setPos(this.HOME.x, this.HOME.y, this.HOME.z);
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();
    const L = env.level;
    this.room = L && L.roomAt ? L.roomAt(this.FRONT.x, this.FRONT.z, this.y0) : null;   // its room (on its floor, W6)
    this.reset();
  }

  // (x, z) is in the wardrobe's room and nothing solid stands between it and the wardrobe
  near(x, z) {
    const L = this.env.level;
    if (!L || !L.roomAt) return true;
    return L.roomAt(x, z, this.y0) === this.room && !L.soundOccluded(this.FRONT.x, this.FRONT.z, x, z, this.y0, this.y0);
  }

  reset() {
    this.state = 'dormant';   // dormant | telegraph | lunge | hold | retreat | cooldown
    this.t = 0;
    this.scares = 0;
    this.creature.position.copy(this.HOME);
    this.creature.rotation.set(0, Math.PI / 2, 0);    // facing the room (-X)
    this.creature.visible = false;
    this.arms.scale.set(1, 1, 0.05);
    this.setDoors(0);
  }

  // doors: 0 closed .. 1 wide open (a crate: its lid)
  setDoors(k) {
    if (this.lid) { this.lid.rotation.x = k * 1.7; return; }
    this.door1.rotation.y = -k * 1.9;
    this.door2.rotation.y = k * 1.9;
  }

  hear(e) {
    if (this.state !== 'dormant' || e.source !== 'player') return;
    if (Math.hypot(e.x - this.FRONT.x, e.z - this.FRONT.z) < CFG.lurker.noiseTrigger && this.near(e.x, e.z)) this.wake();
  }

  wake() {
    this.state = 'telegraph';
    this.t = 0;
    this.creature.visible = true;
    this.creature.position.copy(this.HOME);
    playScratch(this.voice, CFG.lurker.telegraph);
  }

  // players: everybody in the round (one player is taken as a list of one). Once awake it keeps to
  // the one who woke it (this.victim); asleep it reacts to the nearest one in its own room.
  update(dt, players) {
    const L = CFG.lurker;
    this.t += dt;
    players = asList(players);
    if (!players.length) return;
    const measure = (p) => {
      const d = Math.hypot(p.head.x - this.FRONT.x, p.head.z - this.FRONT.z, (p.floorY || 0) - this.y0);
      return { p, d, near: d < L.cancel && this.near(p.head.x, p.head.z) };
    };
    let m;
    if (this.state !== 'dormant' && players.includes(this.victim)) m = measure(this.victim);
    else for (const p of players) { const r = measure(p); if (!m || (r.near && !m.near) || (r.near === m.near && r.d < m.d)) m = r; }
    const player = this.victim = m.p, d = m.d, near = m.near;
    switch (this.state) {
      case 'dormant':
        if (d < L.trigger && near) this.wake();
        break;
      case 'telegraph': {
        // doors rattle, eyes glow in the gap
        this.setDoors(0.04 + 0.04 * Math.abs(Math.sin(this.t * 38)));
        if (!near) { this.state = 'cooldown'; this.t = L.cooldown - 8; this.setDoors(0); this.creature.visible = false; break; }
        if (this.t >= L.telegraph) this.lunge(player);
        break;
      }
      case 'lunge': {
        const k = Math.min(1, this.t / 0.22);
        this.setDoors(Math.min(1, this.t / 0.12));
        this.arms.scale.z = 0.05 + 0.95 * k;
        this.creature.position.lerpVectors(this.from, this.target, 1 - (1 - k) * (1 - k));
        this.face(player);
        if (k >= 1) { this.state = 'hold'; this.t = 0; }
        break;
      }
      case 'hold':
        this.creature.position.copy(this.target);
        this.creature.position.y += Math.sin(this.t * 40) * 0.01;          // jaw chatter shake
        this.face(player);
        if (this.t >= L.hold) { this.state = 'retreat'; this.t = 0; this.from.copy(this.creature.position); }
        break;
      case 'retreat': {
        const k = Math.min(1, this.t / 0.7);
        this.creature.position.lerpVectors(this.from, this.HOME, k * k);
        this.arms.scale.z = Math.max(0.05, 1 - k * 2);
        if (k >= 1) {
          this.creature.rotation.set(0, Math.PI / 2, 0);
          this.creature.visible = false;
          this.setDoors(0);
          playThud({ x: this.FRONT.x, y: 1, z: this.FRONT.z }, false, 0.6, true);   // doors slam (sound only)
          this.state = 'cooldown'; this.t = 0;
        } else this.setDoors(1 - k);
        break;
      }
      case 'cooldown':
        if (this.t >= L.cooldown) { this.state = 'dormant'; this.t = 0; }
        break;
    }
  }

  lunge(player) {
    this.state = 'lunge';
    this.t = 0;
    this.scares++;
    this.from.copy(this.creature.position);
    // 0.5 m in front of the face, but no further than `reach` from the wardrobe
    const h = player.head;
    const dx = h.x - this.FRONT.x, dz = h.z - this.FRONT.z, d = Math.max(0.01, Math.hypot(dx, dz));
    let reach = Math.min(CFG.lurker.reach, Math.max(0.3, d - 0.5));
    // never through a wall: shorter until the whole lunge stays in the room
    while (reach > 0.3 && !this.near(this.FRONT.x + dx / d * reach, this.FRONT.z + dz / d * reach)) reach -= 0.1;
    this.target.set(this.FRONT.x + dx / d * reach, Math.max(0.6, h.y - 0.05), this.FRONT.z + dz / d * reach);
    playStinger((CFG.run && CFG.run.scareK) || 1);   // the mask (shop): quieter
    if (this.env.onScare) this.env.onScare(player);
  }

  face(player) {
    const c = this.creature.position, h = player.head;
    this.creature.rotation.set(0, Math.atan2(-(h.x - c.x), -(h.z - c.z)), 0);
  }
}

function toIndexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
