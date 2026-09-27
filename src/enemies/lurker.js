// The lurker: sits in the bedroom wardrobe. Come close (or make a noise next to it) and it
// telegraphs - scratching, a growl, the doors rattle and glowing eyes show in the gap - then lunges
// into your face with a screech. The lunge only scares: the real danger is your own
// scream in the microphone. Back away during the telegraph and it calms down.
import * as THREE from 'three';
import { CFG } from '../game/config.js';
import { Builder, WARDROBE } from '../world/level.js';
import { Voice3D, playScratch, playStinger, playThud } from '../audio/audio.js';

const HOME = new THREE.Vector3(WARDROBE.x + 0.36, 1.05, WARDROBE.z);
const FRONT = { x: WARDROBE.x - 0.15, z: WARDROBE.z };

export class Lurker {
  // env: { level, onScare() }
  constructor(env) {
    this.env = env;
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
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
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
    this.door1 = new THREE.Group(); this.door1.position.set(WARDROBE.x - 0.02, 0, WARDROBE.minZ); this.door1.add(g1);
    this.door2 = new THREE.Group(); this.door2.position.set(WARDROBE.x - 0.02, 0, WARDROBE.maxZ); this.door2.add(g2);
    this.group.add(this.door1, this.door2);
    this.voice = new Voice3D(1.6);
    this.voice.setPos(HOME.x, HOME.y, HOME.z);
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.state = 'dormant';   // dormant | telegraph | lunge | hold | retreat | cooldown
    this.t = 0;
    this.scares = 0;
    this.creature.position.copy(HOME);
    this.creature.rotation.set(0, Math.PI / 2, 0);    // facing the room (-X)
    this.creature.visible = false;
    this.arms.scale.set(1, 1, 0.05);
    this.setDoors(0);
  }

  // doors: 0 closed .. 1 wide open
  setDoors(k) {
    this.door1.rotation.y = -k * 1.9;
    this.door2.rotation.y = k * 1.9;
  }

  hear(e) {
    if (this.state !== 'dormant' || e.source !== 'player') return;
    if (Math.hypot(e.x - FRONT.x, e.z - FRONT.z) < CFG.lurker.noiseTrigger) this.wake();
  }

  wake() {
    this.state = 'telegraph';
    this.t = 0;
    this.creature.visible = true;
    this.creature.position.copy(HOME);
    playScratch(this.voice, CFG.lurker.telegraph);
  }

  update(dt, player) {
    const L = CFG.lurker;
    this.t += dt;
    const d = Math.hypot(player.head.x - FRONT.x, player.head.z - FRONT.z);
    switch (this.state) {
      case 'dormant':
        if (d < L.trigger) this.wake();
        break;
      case 'telegraph': {
        // doors rattle, eyes glow in the gap
        this.setDoors(0.04 + 0.04 * Math.abs(Math.sin(this.t * 38)));
        if (d > L.cancel) { this.state = 'cooldown'; this.t = L.cooldown - 8; this.setDoors(0); this.creature.visible = false; break; }
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
        this.creature.position.lerpVectors(this.from, HOME, k * k);
        this.arms.scale.z = Math.max(0.05, 1 - k * 2);
        if (k >= 1) {
          this.creature.rotation.set(0, Math.PI / 2, 0);
          this.creature.visible = false;
          this.setDoors(0);
          playThud({ x: FRONT.x, y: 1, z: FRONT.z }, false, 0.6, true);   // doors slam (sound only)
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
    const dx = h.x - FRONT.x, dz = h.z - FRONT.z, d = Math.max(0.01, Math.hypot(dx, dz));
    const reach = Math.min(CFG.lurker.reach, Math.max(0.3, d - 0.5));
    this.target.set(FRONT.x + dx / d * reach, Math.max(0.6, h.y - 0.05), FRONT.z + dz / d * reach);
    playStinger();
    if (this.env.onScare) this.env.onScare();
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
