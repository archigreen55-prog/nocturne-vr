// The walking player. `rig` is the XR reference space ('local-floor') placed in the world: the real
// floor stays at y = 0 (minus the virtual crouch), real steps and ducking always work, the stick
// moves the rig, snap turns rotate it about the head. On a laptop the camera sits in the rig at eye
// height and turns with the mouse.
import * as THREE from 'three';
import { loadSetting, saveSetting } from '../settings.js';
import { CFG } from '../config/index.js';

const MAX_SPEED = CFG.player.maxSpeed;       // m/s at full stick (plan §4.2)
const QUIET_SPEED = CFG.player.quietSpeed;   // up to this, steps are silent (the base value; the game reads CFG.player.quietSpeed: an upgrade raises it)
const ACCEL_TAU = 0.08;      // s, velocity smoothing (~0.15 s to full speed)
const RADIUS = 0.22;         // body circle around the head, m
const CROUCH_DROP = 0.55;    // virtual crouch lowers the rig by this, m
const CROUCH_TIME = 0.3;
const CROUCH_K = 0.72;       // head below 72 % of standing height = crouched
const DESKTOP_EYE = 1.65;

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export class Player {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.rig = new THREE.Group();
    this.rig.name = 'player rig';
    this.rig.add(camera);
    this.inVR = false;
    this.headLocal = new THREE.Vector3(0, DESKTOP_EYE, 0);  // head in rig space
    this.headYawLocal = 0;
    this.head = new THREE.Vector3();                        // head in world space
    this.yaw = 0;                                           // world yaw of the view
    this.lookYaw = 0;                                       // desktop only
    this.lookPitch = 0;
    this.vel = new THREE.Vector2();                         // stick velocity, world XZ
    this.speed = 0;
    this.virtualCrouch = false;
    this.crouchT = 0;
    this.standingHeight = loadSetting('height', 1.65);
    this.pendingRecenter = null;
    this.turnedThisFrame = 0;
    this.stepAcc = 0;
    this.stepNoise = 0;       // radius of a step noise made this frame (0 = none); real steps are silent
    this.stepKind = 'step';   // 'step' or 'run' (systems/sprint.js sets runSpeed while running)
    this.runSpeed = 0;        // m/s while running (0 = walking)
  }

  get crouched() { return this.head.y < CROUCH_K * this.standingHeight; }
  get stepsAudible() { return this.speed > CFG.player.quietSpeed; }
  get running() { return this.runSpeed > 0; }

  enterVR() {
    this.inVR = true;
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
  }
  exitVR() {
    this.inVR = false;
    // keep standing where the head was, looking the same way
    this.rig.position.x = this.head.x; this.rig.position.z = this.head.z;
    this.rig.rotation.set(0, 0, 0);
    this.lookYaw = this.yaw;
    this.headLocal.set(0, DESKTOP_EYE, 0);
  }

  // Place the head at (x, z) looking along yaw, once the next XR pose is known.
  recenterTo(x, z, yaw, measureHeight = false) { this.pendingRecenter = { x, z, yaw, measureHeight }; }

  teleport(x, z, yaw) {
    if (this.inVR) { this.recenterTo(x, z, yaw); return; }
    this.rig.position.x = x; this.rig.position.z = z;
    this.lookYaw = yaw; this.lookPitch = 0;
    this.vel.set(0, 0);
  }

  // Reads the head pose. Returns an event string when a recentre was applied ('recentred') or null.
  updatePose(xrFrame) {
    let event = null;
    if (this.inVR && xrFrame) {
      const pose = xrFrame.getViewerPose(this.renderer.xr.getReferenceSpace());
      if (pose) {
        const p = pose.transform.position, o = pose.transform.orientation;
        this.headLocal.set(p.x, p.y, p.z);
        _v.set(0, 0, -1).applyQuaternion(_q.set(o.x, o.y, o.z, o.w));
        this.headYawLocal = Math.atan2(-_v.x, -_v.z);
        const r = this.pendingRecenter;
        if (r) {
          this.rig.rotation.set(0, r.yaw - this.headYawLocal, 0);
          _v.set(p.x, 0, p.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rig.rotation.y);
          this.rig.position.x = r.x - _v.x;
          this.rig.position.z = r.z - _v.z;
          if (r.measureHeight && p.y > 1.0) { this.standingHeight = p.y; saveSetting('height', p.y); }
          this.pendingRecenter = null;
          event = 'recentred';
        }
      }
    } else if (!this.inVR) {
      this.headLocal.set(0, DESKTOP_EYE, 0);
      this.headYawLocal = 0;
      this.rig.rotation.set(0, 0, 0);
      this.camera.position.set(0, DESKTOP_EYE, 0);
      this.camera.rotation.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
    }
    this.rig.updateMatrixWorld();
    this.head.copy(this.headLocal).applyMatrix4(this.rig.matrixWorld);
    this.yaw = this.inVR ? this.rig.rotation.y + this.headYawLocal : this.lookYaw;
    return event;
  }

  // Snap turn about the head (rad, positive = left).
  snapTurn(angle) {
    const r = this.rig.position;
    const dx = r.x - this.head.x, dz = r.z - this.head.z;
    const c = Math.cos(angle), s = Math.sin(angle);
    r.x = this.head.x + dx * c + dz * s;
    r.z = this.head.z - dx * s + dz * c;
    if (this.inVR) this.rig.rotation.y += angle;
    else this.lookYaw = this.lookYaw + angle;
    this.turnedThisFrame = angle;
  }

  // move: stick vector (x right, y forward), each -1..1, already shaped; speedK: carrying penalty
  update(dt, move, level, speedK = 1) {
    // velocity relative to where the head looks
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // running: the stick's direction at the running speed (how far it is pushed does not matter)
    const m = Math.hypot(move.x, move.y), run = this.runSpeed > 0 && m > 0;
    const k = run ? this.runSpeed / m : MAX_SPEED * speedK;
    const tx = (move.x * cos - move.y * sin) * k;
    const tz = (-move.x * sin - move.y * cos) * k;
    const ka = 1 - Math.exp(-dt / ACCEL_TAU);
    this.vel.x += (tx - this.vel.x) * ka;
    this.vel.y += (tz - this.vel.y) * ka;
    if (Math.abs(this.vel.x) < 1e-3 && Math.abs(this.vel.y) < 1e-3 && !move.x && !move.y) this.vel.set(0, 0);
    this.speed = this.vel.length();

    // crouch toggle eases the rig down / up
    const target = this.virtualCrouch ? 1 : 0;
    const step = dt / CROUCH_TIME;
    this.crouchT += Math.max(-step, Math.min(step, target - this.crouchT));
    this.rig.position.y = -CROUCH_DROP * this.crouchT;

    // move the head circle and push it out of walls, furniture and doors; the rig follows the head
    const hx = this.head.x, hz = this.head.z;
    const [nx, nz] = level.resolve(hx + this.vel.x * dt, hz + this.vel.y * dt, RADIUS);
    this.rig.position.x += nx - hx;
    this.rig.position.z += nz - hz;
    // actual speed after collisions (sliding along a wall is slower)
    if (dt > 0) this.speed = Math.min(this.speed, Math.hypot(nx - hx, nz - hz) / dt);
    // stick steps above the quiet speed make noise, one per stride, louder the faster
    // running faster than walking can go: a running step (longer stride, far louder: CFG.sprint)
    this.stepNoise = 0;
    const runStep = run && this.speed > MAX_SPEED * 1.05;
    const quiet = CFG.player.quietSpeed;
    if (this.speed > quiet) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc >= (runStep ? CFG.sprint.stepLength : CFG.player.stepLength)) {
        this.stepAcc = 0;
        const [r0, r1] = CFG.player.stepRadius, k = Math.min(1, (this.speed - quiet) / (MAX_SPEED - quiet));
        this.stepNoise = runStep ? CFG.sprint.radius : r0 + (r1 - r0) * k;
        this.stepKind = runStep ? 'run' : 'step';
      }
    } else this.stepAcc = 0;
    this.rig.updateMatrixWorld();
    this.head.copy(this.headLocal).applyMatrix4(this.rig.matrixWorld);
  }

  // Desktop mouse look
  look(dx, dy) {
    this.lookYaw = this.lookYaw - dx * 0.0025;
    this.lookPitch = Math.max(-1.3, Math.min(1.3, this.lookPitch - dy * 0.0025));
  }
}

export { MAX_SPEED, QUIET_SPEED, CROUCH_DROP };
