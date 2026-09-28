// The patrol: walks a loop kitchen - library - hall with a flashlight. Hears both noise
// layers (walls and closed doors halve a noise's reach), sees in a cone (crouching shortens its
// sight, furniture taller than the line of sight hides you, the flashlight beam lengthens it).
// Ladder: patrol -> investigate a noise -> look around -> back; seen -> chase -> caught.
// In full alarm it hunts: runs to the last thing heard or seen, then searches rooms.
import * as THREE from 'three';
import { CFG } from '../game/config.js';
import { Builder } from '../world/level.js';
import { ROUTE } from './nav.js';
import { Voice3D, playStep, playGrunt } from '../audio/audio.js';
import { nearLamp, targetY } from '../game/stealth.js';

const EYE = 1.62;
const RADIUS = 0.28;
const TURN = 5;            // rad/s
const AI_DT = 0.1;         // vision checks 10 times a second

function angleDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

export class Patrol {
  // env: { level, nav, alert, listener() -> { x, z } }
  constructor(env) {
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'patrol';
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // body: legs, coat, one arm hanging
    const B = new Builder();
    for (const x of [-0.11, 0.11]) B.box(x - 0.07, 0, -0.08, x + 0.07, 0.82, 0.08, 0x23262e);
    for (const x of [-0.11, 0.11]) B.box(x - 0.08, 0, -0.14, x + 0.08, 0.07, 0.08, 0x121316);
    B.box(-0.24, 0.8, -0.15, 0.24, 1.44, 0.15, 0x2f3b52);
    B.box(-0.245, 0.86, -0.155, 0.245, 0.92, 0.155, 0x111318);
    B.box(-0.34, 0.86, -0.06, -0.24, 1.42, 0.06, 0x2f3b52);
    B.box(-0.33, 0.78, -0.05, -0.25, 0.86, 0.05, 0xd9c9b0);
    this.body = B.mesh(mat);
    // upper: big head, cap, face, flashlight arm (turns with the gaze)
    const U = new Builder();
    U.add(new THREE.SphereGeometry(0.21, 14, 10).translate(0, 1.66, 0), 0xd9c9b0);
    U.cyl(0.215, 0.215, 0.09, 0, 1.78, 0, 0x1d2433, 14);
    U.box(-0.14, 1.78, -0.33, 0.14, 1.8, -0.18, 0x1d2433);
    for (const x of [-0.075, 0.075]) U.add(new THREE.SphereGeometry(0.028, 8, 6).translate(x, 1.7, -0.19), 0x0b0b0d);
    U.add(new THREE.ConeGeometry(0.045, 0.12, 8).rotateX(-Math.PI / 2).translate(0, 1.64, -0.24), 0xc9a890);
    U.box(-0.08, 1.54, -0.2, 0.08, 1.56, -0.18, 0x5a2a2a);
    U.box(0.24, 1.26, -0.45, 0.34, 1.36, 0.05, 0x2f3b52);
    U.add(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 10).rotateX(Math.PI / 2).translate(0.29, 1.31, -0.52), 0x16181c);
    this.upper = U.mesh(mat);
    this.group.add(this.body, this.upper);
    // flashlight: a real spot light + a faint visible beam
    this.spot = new THREE.SpotLight(0xfff0d0, 30, 14, 0.36, 0.45, 1.4);
    this.spot.position.set(0.29, 1.31, -0.62);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0.29, 0.1, -6);
    this.spot.target = this.spotTarget;
    this.upper.add(this.spot, this.spotTarget);
    const cone = new THREE.ConeGeometry(1.25, 5, 20, 1, true);
    cone.translate(0, -2.5, 0);
    cone.rotateX(Math.PI / 2 - 0.23);
    cone.translate(0.29, 1.31, -0.62);
    this.beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.name = 'flashlight beam';
    this.upper.add(this.beam);
    // "?" / "!" above the head
    this.markCanvas = document.createElement('canvas');
    this.markCanvas.width = this.markCanvas.height = 128;
    this.markTex = new THREE.CanvasTexture(this.markCanvas);
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, depthTest: false, fog: false, transparent: true }));
    this.mark.scale.set(0.35, 0.35, 1);
    this.mark.position.set(0, 2.45, 0);
    this.mark.renderOrder = 20;
    this.group.add(this.mark);
    this.markChar = null;
    // suspicion bar over the head: fills with the detection meter (yellow -> red), full = chase
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 128; this.barCanvas.height = 20;
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthTest: false, fog: false, transparent: true }));
    this.bar.scale.set(0.7, 0.11, 1);
    this.bar.position.set(0, 2.15, 0);
    this.bar.renderOrder = 20;
    this.group.add(this.bar);
    this.barShown = -1;
    this.voice = new Voice3D(1.4);
    this.reset();
  }

  reset() {
    this.routeI = 9;                       // starts in the library
    const [x, z] = ROUTE[this.routeI];
    this.x = x; this.z = z;
    this.heading = Math.PI;
    this.headYaw = 0;
    this.state = 'patrol';
    this.path = [ROUTE[this.routeI]];
    this.timer = 0;
    this.meter = 0;
    this.aiT = 0;
    this.visible = false;
    this.lastSeen = null;
    this.lostT = 0;
    this.stepAcc = 0;
    this.phase = 0;
    this.speed = 0;
    this.doorWait = 0;
    this.stuckT = 0; this.stuckX = x; this.stuckZ = z;
    this.occT = 0;
    this.repathT = 0;
    this.seenCount = 0;
    this.reactAt = null;
    this.setMark(null);
    this.drawBar(0);
    this.place();
  }

  drawBar(k) {
    if (Math.abs(k - this.barShown) < 0.02 && !(k === 0 && this.barShown !== 0)) return;
    this.barShown = k;
    this.bar.visible = k > 0.01;
    if (!this.bar.visible) return;
    const g = this.barCanvas.getContext('2d');
    g.clearRect(0, 0, 128, 20);
    g.fillStyle = 'rgba(0, 0, 0, 0.75)'; g.fillRect(0, 0, 128, 20);
    g.fillStyle = k < 0.5 ? '#ffd166' : k < 0.8 ? '#ff9f43' : '#ff3b3b';
    g.fillRect(3, 3, 122 * k, 14);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 18);
    this.barTex.needsUpdate = true;
  }

  setMark(ch) {
    if (ch === this.markChar) return;
    this.markChar = ch;
    this.mark.visible = !!ch;
    if (!ch) return;
    const g = this.markCanvas.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.font = 'bold 110px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#000';
    g.strokeText(ch, 64, 70);
    g.fillStyle = ch === '!' ? '#ff3b3b' : '#ffd166';
    g.fillText(ch, 64, 70);
    this.markTex.needsUpdate = true;
  }

  // ---------- goals ----------
  goTo(x, z) { this.path = this.env.nav.path(this.x, this.z, x, z); this.goal = [x, z]; }

  investigate(x, z) {
    if (this.state !== 'investigate' && this.state !== 'look') playGrunt(this.voice, 'curious');
    this.state = this.env.alert.full ? 'hunt' : 'investigate';
    this.goTo(x, z);
  }

  // Noticed something at (x, z): stop, turn the head towards it for CFG.patrol.reactDelay s,
  // then "?" and come to look. Already curious: go straight there.
  react(x, z) {
    if (this.state === 'investigate' || this.state === 'look') { this.investigate(x, z); return; }
    if (this.state !== 'react') this.timer = 0;
    this.state = 'react';
    this.reactAt = [x, z];
  }

  hunt(x, z) {
    if (this.state === 'chase') return;
    this.state = 'hunt';
    if (x === undefined) [x, z] = this.env.nav.randomIndoor();
    this.goTo(x, z);
  }

  startChase(player) {
    if (this.state !== 'chase') { playGrunt(this.voice, 'alarm'); this.seenCount++; }
    this.state = 'chase';
    this.lostT = 0;
    this.lastSeen = { x: player.head.x, z: player.head.z };
    this.env.alert.setFull('побачили', player.head.x, player.head.z);
    this.goTo(player.head.x, player.head.z);
  }

  // Full alarm raised elsewhere (a shout, the timer): run to where it came from.
  onAlarm(x, z) {
    if (this.state === 'chase') return;
    playGrunt(this.voice, 'alarm');
    this.hunt(x, z);
  }

  // A noise event; returns true if heard.
  hear(e) {
    if (e.source === 'patrol') return false;
    const d = Math.hypot(e.x - this.x, e.z - this.z);
    if (d > e.radius) return false;
    const occluded = this.env.level.soundOccluded(this.x, this.z, e.x, e.z);
    if (d > e.radius * (occluded ? CFG.hearing.occludedK : 1)) return false;
    if (this.state === 'chase') return true;
    if (this.env.alert.full) this.hunt(e.x, e.z);
    else this.react(e.x, e.z);
    return true;
  }

  // ---------- per frame ----------
  // Returns 'caught' or null.
  update(dt, player) {
    const P = CFG.patrol;
    const alert = this.env.alert;
    this.timer += dt;
    // vision at 10 Hz
    this.aiT += dt;
    if (this.aiT >= AI_DT) { this.see(player, this.aiT); this.aiT = 0; }

    const dPlayer = Math.hypot(player.head.x - this.x, player.head.z - this.z);
    if (dPlayer < P.catchDist && (this.state === 'chase' || this.state === 'hunt' || (this.visible && dPlayer < 0.6))) return 'caught';

    let speed = P.walk, look = false;
    switch (this.state) {
      case 'patrol':
        if (this.follow(dt, P.walk)) {
          const i = this.routeI;
          this.routeI = (this.routeI + 1) % ROUTE.length;
          this.path = [ROUTE[this.routeI]];
          if (P.pauseAt.includes(i)) { this.state = 'pause'; this.timer = 0; }
        }
        break;
      case 'pause':
        speed = 0; look = true;
        if (this.timer > 2) this.state = 'patrol';
        break;
      case 'react':
        speed = 0; this.speed = 0;
        if (this.timer >= P.reactDelay) this.investigate(...this.reactAt);
        break;
      case 'investigate':
        speed = P.investigate;
        if (this.follow(dt, speed)) { this.state = 'look'; this.timer = 0; }
        break;
      case 'hunt':
        speed = P.hunt;
        if (this.follow(dt, speed)) { this.state = 'look'; this.timer = 0; }
        break;
      case 'look':
        speed = 0; look = true;
        if (this.timer > (alert.full ? 2 : P.lookAround)) {
          if (alert.full) this.hunt();
          else { this.state = 'return'; this.routeI = this.nearestRoute(); this.goTo(...ROUTE[this.routeI]); }
        }
        break;
      case 'return':
        if (this.follow(dt, P.walk)) { this.state = 'patrol'; this.path = [ROUTE[this.routeI]]; }
        break;
      case 'chase': {
        speed = P.chase;
        if (this.visible) {
          this.lostT = 0;
          this.lastSeen = { x: player.head.x, z: player.head.z };
          this.repathT -= dt;
          if (this.repathT <= 0) { this.repathT = 0.4; this.goTo(player.head.x, player.head.z); }
        } else this.lostT += dt;
        const arrived = this.follow(dt, speed);
        if (arrived && this.lostT > 0.5) { this.state = 'look'; this.timer = 0; }
        else if (this.lostT > P.loseSight) { this.state = 'hunt'; this.goTo(this.lastSeen.x, this.lastSeen.z); }
        break;
      }
    }
    alert.checking = this.state !== 'patrol' && this.state !== 'pause' && this.state !== 'return';

    // gaze: sweep while looking around, a little while walking
    const sweep = look ? Math.sin(this.timer * 1.6) * 0.9 : Math.sin(performance.now() / 1000 * 0.7) * 0.2;
    const lookAt = (x, z) => angleDiff(Math.atan2(-(x - this.x), -(z - this.z)), this.heading);
    const wantHead = this.state === 'chase' && this.visible ? lookAt(player.head.x, player.head.z)
      : this.state === 'react' ? lookAt(this.reactAt[0], this.reactAt[1]) : sweep;
    this.headYaw += (Math.max(-1.2, Math.min(1.2, wantHead)) - this.headYaw) * (1 - Math.exp(-dt / 0.15));

    // steps (positional, muffled behind walls)
    if (this.speed > 0.2) {
      this.stepAcc += this.speed * dt;
      const stride = this.speed > 1.7 ? 0.9 : 0.7;
      if (this.stepAcc > stride) { this.stepAcc = 0; playStep(this.voice, this.speed > 1.7 ? 1.3 : 0.9); }
    }
    this.occT -= dt;
    if (this.occT <= 0) {
      this.occT = 0.2;
      const L = this.env.listener();
      this.voice.setOccluded(this.env.level.soundOccluded(L.x, L.z, this.x, this.z));
    }
    this.voice.setPos(this.x, 1.0, this.z);

    if (this.state === 'chase') this.setMark('!');
    else if (this.state !== 'patrol' && this.state !== 'pause' && this.state !== 'return' && this.state !== 'react') this.setMark('?');
    else this.setMark(null);
    this.drawBar(this.state === 'chase' ? 0 : this.meter);
    this.place();
    return null;
  }

  nearestRoute() {
    let best = 0, bd = Infinity;
    ROUTE.forEach(([x, z], i) => { const d = Math.hypot(x - this.x, z - this.z); if (d < bd && this.env.nav.clear(this.x, this.z, x, z)) { bd = d; best = i; } });
    if (bd === Infinity) ROUTE.forEach(([x, z], i) => { const d = Math.hypot(x - this.x, z - this.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Walks along this.path; returns true when the last point is reached.
  follow(dt, speed) {
    if (this.doorWait > 0) { this.doorWait -= dt; this.speed = 0; return false; }
    if (!this.path.length) { this.speed = 0; return true; }
    const [tx, tz] = this.path[0];
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.35) { this.path.shift(); if (!this.path.length) { this.speed = 0; return true; } return false; }
    const want = Math.atan2(-dx, -dz);
    const diff = angleDiff(want, this.heading);
    this.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    this.openDoors(tx, tz);
    if (this.doorWait > 0) { this.speed = 0; return false; }
    const v = speed * Math.max(0.15, Math.cos(diff));
    const px = this.x, pz = this.z;
    let nx = this.x + (-Math.sin(this.heading)) * v * dt, nz = this.z + (-Math.cos(this.heading)) * v * dt;
    [nx, nz] = this.env.level.world.resolveCircle(nx, nz, RADIUS);
    this.x = nx; this.z = nz;
    this.speed = dt > 0 ? Math.hypot(nx - px, nz - pz) / dt : 0;
    this.phase += this.speed * dt * 6;
    // stuck (furniture corner, a door): try a fresh path
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (Math.hypot(this.x - this.stuckX, this.z - this.stuckZ) < 0.15) {
        const goal = this.path[this.path.length - 1];
        this.path = this.env.nav.path(this.x, this.z, goal[0], goal[1]);
        if (this.path.length === 1 && Math.hypot(goal[0] - this.x, goal[1] - this.z) < 1.2) this.path = [];
      }
      this.stuckT = 0; this.stuckX = this.x; this.stuckZ = this.z;
    }
    return false;
  }

  // Opens a closed door between it and the next point (a creak the player can hear).
  openDoors(tx, tz) {
    for (const door of this.env.level.doors) {
      if (door.locked || door.open) continue;
      if (Math.hypot(door.cx - this.x, door.cz - this.z) > 1.3) continue;
      const nx = -Math.sin(door.base), nz = -Math.cos(door.base);   // normal of the closed leaf
      const s1 = (this.x - door.hx) * nx + (this.z - door.hz) * nz, s2 = (tx - door.hx) * nx + (tz - door.hz) * nz;
      if (Math.sign(s1) === Math.sign(s2)) continue;
      door.toggle(this.x, this.z);
      door.lastUser = 'patrol';      // the creak is played by main (a warning for you, not a noise for it)
      this.doorWait = 0.45;
      return;
    }
  }

  // Vision check (10 Hz): updates the detection meter and reacts.
  see(player, dt) {
    const P = CFG.patrol, alert = this.env.alert;
    const hx = player.head.x, hz = player.head.z;
    const dx = hx - this.x, dz = hz - this.z, d = Math.hypot(dx, dz);
    const gaze = this.heading + this.headYaw;
    const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), gaze));
    // light: in the flashlight beam or next to a lamp you are seen further
    const lit = ang < P.beamHalf || nearLamp(hx, hz);
    const range = P.sight * (player.crouched ? P.crouchK : 1) * (lit ? P.beamK : 1) * (alert.full ? P.alarmK : 1);
    this.visible = false;
    // crouched, it has to see your face, not just the top of your head behind the furniture
    if (d < range && ang < P.fov / 2 && !this.env.level.losBlocked(this.x, EYE, this.z, hx, targetY(player), hz)) this.visible = true;
    const feel = d < P.feelDist && !this.env.level.soundOccluded(this.x, this.z, hx, hz);
    if (this.visible || feel) {
      const rate = this.visible ? P.meterBase + P.meterNear * (1 - d / range) : P.feelRate;
      this.meter += dt * rate * (alert.full ? 1.5 : 1);
    } else this.meter = Math.max(0, this.meter - dt * P.meterDecay);
    if (this.meter >= 1) { this.meter = 1; if (this.visible || feel) { this.visible = true; this.startChase(player); } }
    else if (this.meter > P.noticeAt && (this.state === 'patrol' || this.state === 'pause' || this.state === 'return')) {
      this.react(hx, hz);   // stops, looks, then "hm? what was that?" and comes to look
    }
  }

  place() {
    const bob = Math.abs(Math.sin(this.phase)) * 0.035;
    this.group.position.set(this.x, bob, this.z);
    this.group.rotation.y = this.heading;
    this.upper.rotation.y = this.headYaw;
  }
}
