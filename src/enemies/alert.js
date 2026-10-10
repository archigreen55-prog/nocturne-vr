// Alert level of the house: 0 calm, 1 checking (the patrol heard something or is
// looking), 2 full alarm (a shout, being seen, enough suspicion, or the timer ran out).
// The level is shown by the light: cold blue at rest -> amber slow pulse -> red fast pulse,
// police blue/red in the windows. The last minute of the timer makes the lights flicker.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { power } from '../world/devices.js';
import { S } from '../i18n/index.js';

const AMBER = new THREE.Color(0x8a6a40), RED = new THREE.Color(0xa01818), RED_PT = new THREE.Color(0xff3030);
const POLICE_R = new THREE.Color(0xff2020), POLICE_B = new THREE.Color(0x2040ff);

export class Alert {
  // lights: { hemi, moon, points: [PointLight], glow: Material }
  constructor(lights) {
    this.lights = lights;
    this.base = {
      hemi: lights.hemi.color.clone(), hemiI: lights.hemi.intensity, moonI: lights.moon.intensity,
      points: lights.points.map((p) => ({ c: p.color.clone(), i: p.intensity })),
    };
    this.gain = 1;            // display brightness (systems/brightness.js): every light x gain; nothing else reads it
    this.glowGain = 1;        // ... and the window / lamp glow (a warning: a little more)
    this.onFull = null;
    this.reset();
  }

  reset() {
    this.suspicion = 0;
    this.full = false;
    this.cause = '';
    this.level = 0;
    this.lastKnown = null;    // { x, z } of the last thing heard or seen
    this.checking = false;    // set by the patrol while it investigates
    this.flicker = false;
    this.flickT = 0;
    this.t = 0;
    this.k = 0;               // smoothed alarm colour weight
  }

  add(points, x, z) {
    this.lastKnown = { x, z };
    if (this.full || this.manualOnly) return;   // W15: a human guard decides on the alarm itself
    this.suspicion += points;
    if (this.suspicion >= CFG.alert.full) this.setFull(S.cause.noise, x, z);
  }

  setFull(cause, x, z) {
    if (x !== undefined) this.lastKnown = { x, z };
    if (this.full) return;
    if (this.manualOnly && (cause === S.cause.noise || cause === S.cause.shout)) return;   // W15: noise does not ring by itself
    this.full = true;
    this.cause = cause;
    if (this.onFull) this.onFull(cause, x, z);
  }

  update(dt) {
    this.t += dt;
    if (!this.full) this.suspicion = Math.max(0, this.suspicion - CFG.alert.decay * dt);
    this.level = this.full ? 2 : (this.suspicion > 1 || this.checking ? 1 : 0);
    this.applyLights(dt);
  }

  applyLights(dt) {
    const L = this.lights, B = this.base, t = this.t;
    const target = this.level;
    this.k += (target - this.k) * (1 - Math.exp(-dt / 0.4));
    let hemiI = B.hemiI, moonI = B.moonI;
    L.hemi.color.copy(B.hemi);
    if (this.k > 0.01) {
      if (this.k <= 1) {
        L.hemi.color.lerp(AMBER, 0.45 * this.k);
        hemiI *= 1 + 0.12 * this.k * Math.sin(t * 2 * Math.PI * 0.4);
      } else {
        const a = this.k - 1;
        L.hemi.color.lerp(AMBER, 0.45 * (1 - a)).lerp(RED, 0.8 * a);
        hemiI *= 1 + a * (0.45 * Math.sin(t * 2 * Math.PI * 1.6));
      }
    }
    // point lights: redder in full alarm
    L.points.forEach((p, i) => {
      p.color.copy(B.points[i].c);
      if (this.k > 1) p.color.lerp(RED_PT, 0.7 * (this.k - 1));
      p.intensity = B.points[i].i * this.gain * power.k(i);   // W2a: the breaker
    });
    // windows: police lights outside during full alarm
    if (this.level === 2) L.glow.color.copy(Math.sin(t * 2 * Math.PI * 2) > 0 ? POLICE_R : POLICE_B).multiplyScalar(2.2 * this.glowGain);
    else L.glow.color.setHex(0xffffff).multiplyScalar(this.glowGain * (power.on ? 1 : 0.35));   // W2a: the lamps' glow goes with the power
    // last minute: the lights flicker in bursts
    if (this.flicker) {
      this.flickT -= dt;
      if (this.flickT < -6) this.flickT = 1.2 + Math.random() * 0.6;
      if (this.flickT > 0 && Math.random() < 0.45) {
        const k = 0.15 + Math.random() * 0.3;
        hemiI *= k; moonI *= k;
        for (const p of L.points) p.intensity *= k;
      }
    }
    L.hemi.intensity = hemiI * this.gain;
    L.moon.intensity = moonI * this.gain;
  }
}
