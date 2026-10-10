// A friend's body in this game (plan-multiplayer §4.1): what the network says about another player,
// drawn as a little thief in that player's colour and shaped like a Player for the systems that count
// the world (the guards see it, the lurkers wake for it, its steps are heard). Poses arrive 15-20 times
// a second; it is drawn CFG.net.interpDelay in the past, between the two poses around that moment.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { Builder } from '../world/level.js';
import { MAX_SPEED } from '../xr/player.js';
import { lit } from '../style/materials.js';

const SKIN = 0xd9c9b0;

export class RemotePlayer {
  constructor({ id, name, thief }) {
    this.id = id; this.remote = true;
    this.name = name || ''; this.thief = thief || 'zoya';
    this.head = new THREE.Vector3(0, 1.65, 0);
    this.yaw = 0; this.lookPitch = 0; this.floorY = 0;
    this.crouched = false; this.virtualCrouch = false;
    this.speed = 0; this.running = false;
    this.stepNoise = 0; this.stepKind = 'step'; this.stepAcc = 0;
    this.quietSpeed = CFG.player.quietSpeed;   // its own boots (the guest says in its hello)
    this.buf = [];                               // [{ t (ms, received), x, z, y, fy, yaw, pitch, cr, sp, run }]
    this.lastHeard = performance.now();
    this.lost = false;                           // no packets for a while: drawn faded, the guards ignore it
    this.mic = { live: false, level: 'quiet', shouts: 0, shoutSeen: 0 };
    this.speak = { speakT: 0, quietT: 0, voiceT: 0 };   // like G.speakT / quietT / voiceT for this device's player
    this.desk = null;                            // the item it carries (the host keeps it in front of it)
    this.group = this.build();
  }

  build() {
    const g = new THREE.Group();
    g.name = `friend ${this.id}`;
    const coat = CFG.net.thieves[this.thief] || 0x888888, dark = new THREE.Color(coat).multiplyScalar(0.55).getHex();
    const mat = lit();
    const B = new Builder();
    for (const x of [-0.1, 0.1]) B.box(x - 0.065, 0, -0.07, x + 0.065, 0.8, 0.07, 0x23262e);
    B.box(-0.22, 0.78, -0.13, 0.22, 1.38, 0.13, coat);
    for (const x of [-0.29, 0.29]) B.box(x - 0.05, 0.82, -0.05, x + 0.05, 1.36, 0.05, coat);
    this.body = B.mesh(mat);
    const H = new Builder();
    H.add(new THREE.SphereGeometry(0.17, 12, 8).translate(0, 0, 0), SKIN);
    H.box(-0.16, 0.05, -0.16, 0.16, 0.13, 0.16, dark);            // a knitted cap
    H.box(-0.17, -0.02, -0.18, 0.17, 0.04, -0.15, 0x111318);       // the mask band
    for (const x of [-0.06, 0.06]) H.add(new THREE.SphereGeometry(0.022, 6, 5).translate(x, 0.01, -0.165), 0xf2f2f2);
    this.headMesh = H.mesh(mat);
    this.headMesh.position.y = 1.52;
    g.add(this.body, this.headMesh);
    return g;
  }

  // a pose from the network (now: when it arrived, ms)
  // a jump of more than 3 m (a teleport: back at the van, a new round) is not flown through: it snaps
  push(s, now = performance.now()) {
    const last = this.buf[this.buf.length - 1];
    if (last && Math.hypot(s.x - last.x, s.z - last.z) > 3) this.buf.length = 0;
    this.buf.push({ t: now, ...s });
    if (this.buf.length > 12) this.buf.shift();
    this.lastHeard = now;
  }

  // Interpolates to now - interpDelay. steps: the host counts its steps (noise for the guards).
  update(dt, now = performance.now(), steps = false) {
    const b = this.buf, at = now - CFG.net.interpDelay * 1000;
    if (b.length) {
      const last = b[b.length - 1];
      let a = last, c = last;
      if (at <= b[0].t) a = c = b[0];
      else if (at < last.t) for (let i = 0; i < b.length - 1; i++) if (b[i + 1].t >= at) { a = b[i]; c = b[i + 1]; break; }
      const k = c === a ? 1 : Math.max(0, Math.min(1, (at - a.t) / Math.max(1, c.t - a.t)));
      const L = (u, v) => u + (v - u) * k;
      const dy = Math.atan2(Math.sin(c.yaw - a.yaw), Math.cos(c.yaw - a.yaw));
      this.head.set(L(a.x, c.x), L(a.y, c.y), L(a.z, c.z));
      this.floorY = L(a.fy || 0, c.fy || 0);
      this.yaw = a.yaw + dy * k;
      this.lookPitch = L(a.pitch || 0, c.pitch || 0);
      this.crouched = !!c.cr;
      this.speed = Math.min(CFG.net.maxSpeed, c.sp || 0);
      this.running = !!c.run;
    }
    this.lost = now - this.lastHeard > CFG.net.peerLostAfter * 1000;
    this.stepNoise = 0;
    if (steps && !this.lost) this.countSteps(dt);
    this.place();
  }

  // the same rule as a player's own steps (xr/player.js): above the quiet speed one noise per stride
  countSteps(dt) {
    const quiet = this.quietSpeed, runStep = this.running && this.speed > MAX_SPEED * 0.9;
    if (this.speed > quiet) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc >= (runStep ? CFG.sprint.stepLength : CFG.player.stepLength)) {
        this.stepAcc = 0;
        const [r0, r1] = CFG.player.stepRadius, k = Math.min(1, (this.speed - quiet) / (MAX_SPEED - quiet));
        this.stepNoise = runStep ? CFG.sprint.radius : r0 + (r1 - r0) * k;
        this.stepKind = runStep ? 'run' : 'step';
      }
    } else this.stepAcc = 0;
  }

  place() {
    const g = this.group, crouch = this.crouched ? 0.62 : 1;
    g.position.set(this.head.x, this.floorY, this.head.z);
    g.rotation.y = this.yaw;
    this.body.scale.y = crouch;
    this.headMesh.position.y = Math.max(0.5, this.head.y - this.floorY - 0.13);
    this.headMesh.rotation.x = Math.max(-0.6, Math.min(0.6, this.lookPitch));
    g.visible = !this.lost;
  }

  dispose() { this.group.removeFromParent(); }
}
