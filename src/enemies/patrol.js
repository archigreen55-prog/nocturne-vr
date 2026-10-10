// The guard: walks the house with a flashlight. Calm time is planned by its Brain (brain.js): rooms
// it has not seen for a while, habits (tea, toilet, phone, armchair), hiding spots; it closes the
// doors behind itself and notices what changed. Hears both noise layers (walls and closed doors
// weaken a noise), sees in a cone (crouching shortens its sight, furniture taller than the line of
// sight hides you, the flashlight beam and lamps lengthen it).
// Ladder: calm -> react (0.6 s) -> investigate -> look around -> search hiding spots -> calm;
// seen -> chase -> caught. In full alarm it radios for help and hunts.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { Builder } from '../world/level.js';
import { Brain } from './brain.js';
import { Voice3D, playStep, playGrunt } from '../audio/audio.js';
import { nearLamp, targetY } from '../game/stealth.js';
import { S } from '../i18n/index.js';
import { power } from '../world/devices.js';
import { asList } from '../game/players.js';
import { lit } from '../style/materials.js';

const EYE = 1.62;
const RADIUS = 0.28;
const TURN = 5;            // rad/s
const AI_DT = 0.1;         // vision checks 10 times a second

function angleDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

export class Patrol {
  // env: { level, nav, alert, listener() -> { x, z } }
  constructor(env) {
    this.env = env;
    const GC = env.guard || {};            // the map's description of this guard (W6): colours, a lamp instead of the flashlight
    const COAT = GC.coat || 0x2f3b52, CAP = GC.cap || 0x1d2433;
    this.group = new THREE.Group();
    this.group.name = GC.id ? `patrol ${GC.id}` : 'patrol';
    const mat = lit();
    // body: legs, coat, one arm hanging
    const B = new Builder();
    for (const x of [-0.11, 0.11]) B.box(x - 0.07, 0, -0.08, x + 0.07, 0.82, 0.08, 0x23262e);
    for (const x of [-0.11, 0.11]) B.box(x - 0.08, 0, -0.14, x + 0.08, 0.07, 0.08, 0x121316);
    B.box(-0.24, 0.8, -0.15, 0.24, 1.44, 0.15, COAT);
    B.box(-0.245, 0.86, -0.155, 0.245, 0.92, 0.155, 0x111318);
    B.box(-0.34, 0.86, -0.06, -0.24, 1.42, 0.06, COAT);
    B.box(-0.33, 0.78, -0.05, -0.25, 0.86, 0.05, 0xd9c9b0);
    this.body = B.mesh(mat);
    // upper: big head, cap, face, flashlight arm (turns with the gaze)
    const U = new Builder();
    U.add(new THREE.SphereGeometry(0.21, 14, 10).translate(0, 1.66, 0), 0xd9c9b0);
    U.cyl(0.215, 0.215, 0.09, 0, 1.78, 0, CAP, 14);
    U.box(-0.14, 1.78, -0.33, 0.14, 1.8, -0.18, CAP);
    for (const x of [-0.075, 0.075]) U.add(new THREE.SphereGeometry(0.028, 8, 6).translate(x, 1.7, -0.19), 0x0b0b0d);
    U.add(new THREE.ConeGeometry(0.045, 0.12, 8).rotateX(-Math.PI / 2).translate(0, 1.64, -0.24), 0xc9a890);
    U.box(-0.08, 1.54, -0.2, 0.08, 1.56, -0.18, 0x5a2a2a);
    U.box(0.24, 1.26, -0.45, 0.34, 1.36, 0.05, COAT);
    if (!GC.lamp) U.add(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 10).rotateX(Math.PI / 2).translate(0.29, 1.31, -0.52), 0x16181c);
    else U.add(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8).translate(0.29, 1.2, -0.5), 0x2a2a30);   // a hand lamp
    this.upper = U.mesh(mat);
    this.group.add(this.body, this.upper);
    this.lampR = 0;
    this.sightK = GC.sightK || 1;   // W6: the second guard sees a little worse in the dark
    if (GC.lamp) {
      // a hand lamp: a point light around it (masked by its rooms, see enemies/flashMask.js) and a halo
      // you can see from behind a corner; no spot light, no beam (plan-W6 §3.2, §6)
      this.lamp = new THREE.PointLight(0xffd9a0, GC.lamp.intensity || 2.2, GC.lamp.distance || 7, 1.6);
      this.lamp.position.set(0.29, 1.25, -0.5);
      this.lampR = GC.lamp.lit || 3;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,225,170,0.9)'); grad.addColorStop(0.4, 'rgba(255,200,120,0.35)'); grad.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      this.halo.scale.set(0.9, 0.9, 1);
      this.halo.position.set(0.29, 1.25, -0.5);
      this.upper.add(this.lamp, this.halo);
      this.spot = null; this.beam = null;
    } else {
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
    }
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
    this.queue = [];
    this.brain = new Brain(this, env);
    this.reset();
  }

  // What it is doing, in words (the wrist shows it on the easy difficulty).
  get activity() {
    if (CFG.sprint.showRun && this.heardRunT > 0 && this.state !== 'chase') return S.sprint.guardHears;   // easy: it hears someone running
    switch (this.state) {
      case 'chase': return S.guard.state.chase;
      case 'hunt': return S.guard.state.hunt;
      case 'react': return S.guard.state.react;
      case 'investigate': return S.guard.state.investigate;
      case 'look': return S.guard.state.look;
      default: return (this.queue[0] && this.queue[0].label) || S.guard.state.thinks;
    }
  }

  reset() {
    const [x, z, y] = (this.env.guard && this.env.guard.start) || [-7.4, -10.4, 0];   // starts in the library
    this.x = x; this.z = z; this.y = y || 0;   // y: the floor it stands on (W6: maps with stairs)
    this.heading = Math.PI;
    this.headYaw = 0;
    this.state = 'task';
    this.path = [];
    this.queue.length = 0;
    this.toClose = [];
    this.mods = null;
    this.maskR = 0;
    this.sitting = false;
    this.talkT = 0;
    this.brain.reset();
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
    this.stay = false;
    this.occT = 0;
    this.repathT = 0;
    this.seenCount = 0;
    this.reactAt = null;
    this.stay = false;        // posted at an exit during a full alarm (W6: the second guard)
    // running (CFG.sprint): it goes to look fast and follows the steps; on hard it dashes in a chase
    this.runFollow = false; this.runRetarget = 0; this.runLineT = 0; this.heardRunT = 0;
    this.dashLeft = CFG.sprint.guardSprint.time; this.dashWinded = 0; this.dashRest = 0; this.dashing = false;
    this.stunT = 0; this.pose = null;   // W2b: knocked out by a trap; the pose drawn (flip / kneel / bucket)
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
  // toFloor: the floor index of the target (W6); by default the one it is on
  goTo(x, z, toFloor) { this.path = this.env.nav.path(this.x, this.z, x, z, this.floor, toFloor); this.goal = [x, z]; }
  get floor() { return this.env.level.floorIndex ? this.env.level.floorIndex(this.y) : 0; }

  investigate(x, z, f) {
    if (this.state !== 'investigate' && this.state !== 'look') playGrunt(this.voice, 'curious');
    this.state = this.env.alert.full ? 'hunt' : 'investigate';
    this.runFollow = false;
    this.goTo(x, z, f);
  }

  // A running step heard in calm time (CFG.sprint.react 'fast'): no pause, «Хто там бігає?!», it goes
  // at its search speed to the step and, while it keeps hearing them, re-aims at the latest step.
  heardRun(x, z, f) {
    if (this.state === 'investigate' && this.runFollow) {
      if (this.runRetarget <= 0) { this.runRetarget = CFG.sprint.retarget; this.goTo(x, z, f); }
      return;
    }
    this.interrupt();
    if (this.state !== 'investigate' && this.state !== 'look') playGrunt(this.voice, 'curious');
    if (this.runLineT <= 0) { this.runLineT = CFG.sprint.lineEvery; this.env.say(S.sprint.guardLine); }
    this.state = 'investigate'; this.timer = 0;
    this.runFollow = true; this.runRetarget = CFG.sprint.retarget;
    this.goTo(x, z, f);
  }

  // Noticed something at (x, z): stop, turn the head towards it for CFG.patrol.reactDelay s,
  // then "?" and come to look. Already curious: go straight there.
  react(x, z, f) {
    this.interrupt();
    if (this.state === 'investigate' || this.state === 'look') { this.investigate(x, z, f); return; }
    if (this.state !== 'react') this.timer = 0;
    this.state = 'react';
    this.reactAt = [x, z, f];
  }

  // Drop the calm plan (stand up from the armchair, forget the doors to close).
  interrupt() {
    if (this.sitting) { this.sitting = false; [this.x, this.z] = this.standBack; }
    this.queue.length = 0;
    this.toClose.length = 0;
    this.mods = null;
    this.maskR = 0;
  }

  hunt(x, z, f) {
    if (this.state === 'chase') return;
    this.interrupt();
    this.state = 'hunt';
    if (x === undefined) [x, z, f] = this.env.nav.randomIndoor();
    this.goTo(x, z, f);
  }

  // Full alarm with two guards (W6): stand at an exit and watch it until the alarm is over.
  post(x, z, f) {
    if (this.state === 'chase') return;
    this.interrupt();
    this.stay = true;
    this.state = 'hunt';
    this.goTo(x, z, f);
  }

  startChase(player) {
    this.interrupt();
    if (this.state !== 'chase') { playGrunt(this.voice, 'alarm'); this.seenCount++; }
    this.state = 'chase';
    this.stay = false;
    this.lostT = 0;
    this.lastSeen = { x: player.head.x, z: player.head.z };
    this.env.alert.setFull(S.cause.seen, player.head.x, player.head.z);
    this.goTo(player.head.x, player.head.z);
  }

  // Full alarm raised elsewhere (a shout, the timer): run to where it came from.
  onAlarm(x, z, f) {
    this.env.sound('radio');
    this.env.say(S.guard.say.radio);
    if (this.state === 'chase') return;
    this.hunt(x, z, f);
  }

  // A noise event; returns true if heard (and reacts to it).
  hear(e, ey) {
    if (!this.audible(e, ey)) return false;
    this.reactTo(e, ey);
    return true;
  }
  // How loud a noise is to it: 0 = not heard, up to 1 right next to it. ey: the height of the noise
  // (W6: floors; a noise on another floor is muffled by the slab, except through the stair well).
  audible(e, ey = 0) {
    if (e.source === 'patrol' || this.stunT > 0) return 0;   // W2b: knocked out by a trap: hears nothing
    const d = Math.hypot(e.x - this.x, e.z - this.z, ey - this.y);
    // difficulty, habits (tea, toilet, phone: hears worse), a whistling kettle next to it
    let r = e.radius * CFG.hearing.radiusK * (this.mods && this.mods.hearK ? this.mods.hearK : 1);
    if (this.maskR && d < this.maskR) r *= CFG.hearing.maskK;
    if (e.kind !== 'device') for (const m of this.env.level.maskZones || []) if (Math.hypot(m.x - this.x, m.z - this.z) < m.r) { r *= CFG.hearing.maskK; break; }   // W6: a fountain nearby (W2a: a playing radio too, but not for itself)
    if (d > r) return 0;
    const L = this.env.level;
    const k = L.soundK ? L.soundK(this.x, this.z, e.x, e.z, this.y, ey) : (L.soundOccluded(this.x, this.z, e.x, e.z) ? CFG.hearing.occludedK : 1);
    if (d > r * k) return 0;
    return Math.max(0.01, 1 - d / (r * k));
  }
  // React to a noise it heard: come to look, or hunt there during a full alarm.
  reactTo(e, ey = 0) {
    if (e.kind === 'run') this.heardRunT = 2;
    if (this.state === 'chase') return;
    if (e.device && this.brain.deviceTask(e.device)) return;   // W2a: a device: it goes to switch it off
    const f = this.env.level.floorIndex ? this.env.level.floorIndex(ey) : undefined;
    if (this.env.alert.full) this.hunt(e.x, e.z, f);
    else if (e.kind === 'run' && CFG.sprint.react === 'fast') this.heardRun(e.x, e.z, f);
    else this.react(e.x, e.z, f);
  }

  // ---------- per frame ----------
  // players: everybody in the round (G.players; one player is taken as a list of one). It watches the
  // one it sees best (this.target) and catches whoever it reaches.
  // Returns 'caught' (this.caughtWho: who) or null.
  update(dt, players) {
    const P = CFG.patrol;
    const alert = this.env.alert;
    players = asList(players);
    this.caughtWho = null;
    if (this.stunT > 0) return this.knockedOut(dt);   // W2b: a trap: sees, hears and catches nothing
    if (!players.includes(this.target)) this.target = players[0] || null;
    if (!this.target) return null;
    this.timer += dt;
    // vision at 10 Hz
    this.aiT += dt;
    if (this.aiT >= AI_DT) { this.see(players, this.aiT); this.aiT = 0; }

    for (const p of players) {
      const dPlayer = Math.hypot(p.head.x - this.x, p.head.z - this.z, (p.floorY || 0) - this.y);
      if (dPlayer < P.catchDist && (this.state === 'chase' || this.state === 'hunt' || (this.visible && p === this.target && dPlayer < 0.6))) { this.caughtWho = p; return 'caught'; }
    }
    const player = this.target;

    let speed = P.walk, look = false;
    this.runRetarget -= dt; this.runLineT -= dt; this.heardRunT -= dt;
    this.dashing = false;
    if (this.dashWinded > 0 && this.state !== 'chase') this.dashWinded = Math.max(0, this.dashWinded - dt);
    if (this.state !== 'investigate') this.runFollow = false;
    switch (this.state) {
      case 'task':
        look = this.runTask(dt);
        break;
      case 'react':
        speed = 0; this.speed = 0;
        if (this.timer >= P.reactDelay) this.investigate(this.reactAt[0], this.reactAt[1], this.reactAt[2]);
        break;
      case 'investigate':
        speed = this.runFollow ? P.hunt : P.investigate;
        if (this.follow(dt, speed)) { this.state = 'look'; this.timer = 0; }
        break;
      case 'hunt':
        speed = P.hunt;
        if (this.follow(dt, speed)) { this.state = 'look'; this.timer = 0; }
        break;
      case 'look':
        speed = 0; look = true;
        if (this.timer > (alert.full ? 2 : P.lookAround)) {
          if (alert.full && this.stay) this.timer = 0;   // posted at an exit: keeps looking around there
          else if (alert.full) this.hunt();
          else {   // nobody there: check the hiding spots nearby, then back to its own plans
            this.state = 'task'; this.queue.length = 0; this.timer = 0;
            if (this.goal) this.brain.afterInvestigate(this.goal[0], this.goal[1]);
          }
        }
        break;
      case 'chase': {
        speed = P.chase * this.dash(dt, player);
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
    if (!this.dashing && this.dashLeft < CFG.sprint.guardSprint.time && (this.dashRest += dt) >= CFG.sprint.guardSprint.rest) this.dashLeft = CFG.sprint.guardSprint.time;
    const step = this.state === 'task' ? this.queue[0] : null;
    const checking = this.state !== 'task' || !!(step && step.search);
    alert.checking = this.env.secondary ? alert.checking || checking : checking;   // W6: two guards share the flag
    // on the phone: murmur now and then
    if (step && step.talk) { this.talkT -= dt; if (this.talkT <= 0) { this.talkT = 2 + Math.random(); this.env.sound('murmur'); } }

    // gaze: sweep while looking around, a little while walking
    const sweep = look ? Math.sin(this.timer * 1.6) * 0.9 : Math.sin(performance.now() / 1000 * 0.7) * 0.2;
    const lookAt = (x, z) => angleDiff(Math.atan2(-(x - this.x), -(z - this.z)), this.heading);
    const wantHead = this.state === 'chase' && this.visible ? lookAt(player.head.x, player.head.z)
      : this.state === 'react' ? lookAt(this.reactAt[0], this.reactAt[1])
        : step && step.face && step.type === 'wait' ? 0 : sweep;
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
    this.voice.setPos(this.x, this.y + 1.0, this.z);

    if (this.state === 'chase') this.setMark('!');
    else if ((this.state !== 'task' && this.state !== 'react') || (step && step.search)) this.setMark('?');
    else this.setMark(null);
    this.drawBar(this.state === 'chase' ? 0 : this.meter);
    this.place();
    return null;
  }

  // Calm time: run the step at the head of the queue (the Brain refills it). Returns true while
  // it is looking around (the head sweeps).
  runTask(dt) {
    // doors opened on the way get closed behind once it is through
    for (let k = this.toClose.length - 1; k >= 0; k--) {
      const c = this.toClose[k], d = c.door;
      const side = Math.sign((this.x - d.hx) * -Math.sin(d.base) + (this.z - d.hz) * -Math.cos(d.base));
      if (!d.open) { this.toClose.splice(k, 1); continue; }
      if (side !== c.side && Math.hypot(d.cx - this.x, d.cz - this.z) > 1.0) {
        this.toClose.splice(k, 1);
        this.queue.unshift({ type: 'close', door: d, label: S.guard.act.closesBehind });
      }
    }
    if (!this.queue.length) this.brain.plan();
    const st = this.queue[0];
    if (!st) return false;
    if (!st.started) {
      st.started = true; this.timer = 0;
      if (st.onStart) st.onStart();
      if (st.type === 'walk') this.goTo(st.to[0], st.to[1], st.to[2]);
      if (st.sit) { this.standBack = [this.x, this.z]; this.x = st.sit[0]; this.z = st.sit[1]; this.sitting = true; }
    }
    this.mods = st.mods || null;
    this.maskR = st.mask || 0;
    let done = false;
    switch (st.type) {
      case 'walk':
        done = this.follow(dt, (st.slow ? 0.6 : CFG.patrol.walk) * this.brain.speedK) || (st.maxT > 0 && this.timer > st.maxT);   // maxT: stuck (W2a)
        break;
      case 'wait':
        this.speed = 0;
        if (st.face) this.turnTo(st.face, dt);
        done = this.timer >= st.t;
        break;
      case 'close': {
        this.speed = 0;
        const d = st.door;
        if (!d) { done = true; break; }
        this.turnTo([d.cx, d.cz], dt);
        if (!st.closing && this.timer > 0.3) {
          st.closing = true;
          if (d.open) { d.toggle(this.x, this.z, CFG.guard.closeDoorTime); d.lastUser = 'patrol'; }
          this.brain.closed(d);
        }
        done = this.timer > 0.3 + CFG.guard.closeDoorTime;
        break;
      }
    }
    if (done) {
      this.queue.shift();
      if (st.onEnd) st.onEnd();
      if (st.type === 'walk') this.brain.arrived(st);
      if (st.sit) { this.sitting = false; [this.x, this.z] = this.standBack; }
      this.mods = null; this.maskR = 0; this.timer = 0;
    }
    return st.type === 'wait' && !!st.sweep;
  }

  turnTo(p, dt) {
    const diff = angleDiff(Math.atan2(-(p[0] - this.x), -(p[1] - this.z)), this.heading);
    this.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
  }

  // Hard (CFG.sprint.sprint): while it sees you running in a chase it dashes (speed x k) for up to
  // `time` s in total, then it is out of breath for `winded` s (windedSpeed); the dash comes back
  // after `rest` s without dashing. Returns the chase speed multiplier for this frame.
  dash(dt, player) {
    const D = CFG.sprint.guardSprint;
    if (!CFG.sprint.sprint) return 1;
    if (this.dashWinded > 0) { this.dashWinded -= dt; return D.windedSpeed / CFG.patrol.chase; }
    if (this.visible && player.running && this.dashLeft > 0) {
      this.dashing = true; this.dashRest = 0;
      this.dashLeft -= dt;
      if (this.dashLeft <= 0) { this.dashLeft = 0; this.dashWinded = D.winded; }
      return D.k;
    }
    return 1;
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
    [nx, nz] = this.env.level.resolveBody(nx, nz, RADIUS, this.y);
    this.x = nx; this.z = nz;
    this.y = this.env.level.floorY(nx, nz, this.y);
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
      if (door.locked || door.open || door.floor !== this.floor) continue;
      if (Math.hypot(door.cx - this.x, door.cz - this.z) > 1.3) continue;
      const nx = -Math.sin(door.base), nz = -Math.cos(door.base);   // normal of the closed leaf
      const s1 = (this.x - door.hx) * nx + (this.z - door.hz) * nz, s2 = (tx - door.hx) * nx + (tz - door.hz) * nz;
      if (Math.sign(s1) === Math.sign(s2)) continue;
      door.toggle(this.x, this.z);
      door.lastUser = 'patrol';      // the creak is played by main (a warning for you, not a noise for it)
      this.doorWait = 0.45;
      if (this.state === 'task') this.toClose.push({ door, side: Math.sign(s1) });   // close it behind itself
      return;
    }
  }

  // What it makes of one player now: { visible, feel, d, range }.
  look(player) {
    const P = CFG.patrol, alert = this.env.alert;
    const hx = player.head.x, hz = player.head.z;
    const dx = hx - this.x, dz = hz - this.z, d = Math.hypot(dx, dz, (player.floorY || 0) - this.y);   // a floor above is far
    const gaze = this.heading + this.headYaw;
    const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), gaze));
    // light: in the flashlight beam (or by its hand lamp) or next to a lamp you are seen further
    const lit = (this.lampR ? d < this.lampR : ang < P.beamHalf) || nearLamp(hx, hz);
    const M = this.mods || {};
    const dark = power.dark && !lit ? CFG.devices.breaker.darkSightK : 1;   // W2a: the breaker is off, outside its beam
    const range = P.sight * this.sightK * (player.crouched ? P.crouchK : 1) * (lit ? P.beamK : 1) * (alert.full ? P.alarmK : 1) * (M.sightK || 1) * dark;
    // crouched, it has to see your face, not just the top of your head behind the furniture
    const visible = d < range && ang < P.fov * (M.fovK || 1) / 2 && !this.env.level.losBlocked(this.x, this.y + EYE, this.z, hx, targetY(player), hz);
    const feel = d < P.feelDist && !this.env.level.soundOccluded(this.x, this.z, hx, hz);
    return { visible, feel, d, range };
  }

  // Vision check (10 Hz): the player it notices most becomes the target; updates the detection meter
  // and reacts. One meter for everybody: two of you in its view do not fill it twice as fast.
  see(players, dt) {
    const P = CFG.patrol, alert = this.env.alert;
    players = asList(players);
    // seen beats felt beats neither; then the nearer (for its range); the current target wins a tie
    const score = (r) => (r.visible ? 2 : r.feel ? 1 : 0) + (1 - Math.min(1, r.d / Math.max(0.01, r.range))) * 0.5;
    let player = this.target && players.includes(this.target) ? this.target : players[0];
    let seen = this.look(player);
    for (const p of players) {
      if (p === player) continue;
      const r = this.look(p);
      if (score(r) > score(seen)) { player = p; seen = r; }
    }
    this.target = player;
    const hx = player.head.x, hz = player.head.z;
    const { feel, d, range } = seen;
    this.visible = seen.visible;
    if (this.visible || feel) {
      const rate = this.visible ? P.meterBase + P.meterNear * (1 - d / range) : P.feelRate;
      this.meter += dt * rate * (alert.full ? 1.5 : 1);
    } else this.meter = Math.max(0, this.meter - dt * P.meterDecay);
    if (this.meter >= 1) { this.meter = 1; if (this.visible || feel) { this.visible = true; this.startChase(player); } }
    else if (this.meter > P.noticeAt && this.state === 'task') {
      this.react(hx, hz);   // stops, looks, then "hm? what was that?" and comes to look
    }
    if (this.state === 'task') this.brain.watch(dt);   // missing loot, doors left open
  }

  place() {
    const bob = Math.abs(Math.sin(this.phase)) * 0.035;
    this.group.position.set(this.x, this.y + bob - (this.sitting ? 0.45 : 0), this.z);
    this.group.rotation.y = this.heading;
    this.upper.rotation.y = this.headYaw;
    // W2b: a trap's pose — lying feet up, on its knees (picking marbles up), the bucket on its head
    const P = this.pose;
    this.group.rotation.order = 'YXZ';
    this.group.rotation.x = P === 'flip' ? -1.45 : 0;
    if (P === 'flip') this.group.position.y += 0.25;
    else if (P === 'kneel') this.group.position.y -= 0.42;
    if (this.bucketMesh) this.bucketMesh.visible = P === 'bucket';
  }

  // ---------- W2b: knocked out by a trap ----------
  // For s seconds: lies (or stands blind) in `pose`, sees and hears nothing, catches nobody; then its
  // Brain queues what follows (find the flashlight, pick the marbles up, take the bucket off, ...).
  knockOut(kind, s, pose) {
    this.wasChasing = (this.state === 'chase' || this.state === 'hunt') && !!this.lastSeen;   // after it, it goes where it saw you last
    this.interrupt();
    this.state = 'task'; this.queue.length = 0; this.path = [];
    this.stunT = s; this.stunKind = kind; this.pose = pose;
    this.speed = 0; this.visible = false; this.meter = 0; this.timer = 0; this.stay = false;
    this.setMark(null);
  }
  knockedOut(dt) {
    this.stunT -= dt;
    this.speed = 0; this.visible = false;
    if (this.stunT <= 0) { this.stunT = 0; this.pose = null; this.brain.afterTrap(this.stunKind); }
    this.drawBar(0);
    this.place();
    return null;
  }
}
