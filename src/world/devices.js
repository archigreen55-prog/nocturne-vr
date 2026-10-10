// Devices of a map (W2a): the radio, the house phone and its second handset, the breaker. Here: their
// meshes, their state and the house's power; what happens when one is used is systems/distract.js,
// the guard's «go and switch it off» is enemies/brain.js. Numbers and places: CFG.devices.
import * as THREE from 'three';
import { Builder } from './level.js';
import { CFG } from '../config/index.js';

// The house's lights (the breaker). Read where the lamps' intensity is written (systems/render.js,
// enemies/alert.js), by the stealth read-out (game/stealth.js) and by the guard's sight (patrol.js).
export const power = {
  on: true, flicker: 0, keep: [],
  // the factor of the scene's point light i: 1, flickering, or 0 while the breaker is off (some lights,
  // like the fireplace's embers, are not electric)
  k(i) {
    if (this.keep.includes(i)) return 1;
    if (this.flicker > 0) return Math.sin(this.flicker * 47) > 0 ? 1 : 0.1;
    return this.on ? 1 : 0;
  },
  get dark() { return !this.on; },
  reset() { this.on = true; this.flicker = 0; },
};

const C = { wood: 0x5a3a22, dark: 0x1d1f24, grey: 0x7a808a, red: 0x7a2420, cream: 0xe8e0c8, black: 0x111214, metal: 0x9aa0a8 };

function buildDevice(kind, B) {
  switch (kind) {
    case 'radio':
      B.box(-0.16, 0, -0.06, 0.16, 0.17, 0.06, C.wood);
      B.box(-0.13, 0.03, 0.06, 0.02, 0.14, 0.065, C.dark);        // speaker
      B.cyl(0.018, 0.018, 0.012, 0.08, 0.1, 0.06, C.cream, 10);    // dial
      B.box(0.06, 0.03, 0.06, 0.12, 0.05, 0.066, C.metal);
      B.cyl(0.004, 0.004, 0.3, -0.12, 0.17, -0.03, C.metal, 4);    // antenna
      return { led: [0.105, 0.135, 0.063] };
    case 'phone':
      B.box(-0.1, 0, -0.08, 0.1, 0.07, 0.08, C.red);
      B.box(-0.11, 0.07, -0.03, 0.11, 0.1, 0.03, C.red);           // the handset on its cradle
      B.cyl(0.035, 0.035, 0.01, 0, 0.07, 0.05, C.cream, 12);       // the dial
      return { led: [0.08, 0.071, 0.06] };
    case 'handset':
      B.box(-0.035, 0, -0.08, 0.035, 0.03, 0.08, C.black);
      B.box(-0.03, 0.03, -0.06, 0.03, 0.035, 0.04, C.grey);        // keys
      return { led: [0, 0.036, 0.06] };
    case 'breaker':
      B.box(-0.18, -0.22, 0, 0.18, 0.22, 0.09, C.grey);
      B.box(-0.14, -0.15, 0.09, 0.14, 0.15, 0.1, C.dark);
      for (let i = 0; i < 4; i++) B.box(-0.12 + i * 0.07, -0.03, 0.1, -0.08 + i * 0.07, 0.05, 0.13, C.cream);
      B.box(0.1, -0.2, 0.09, 0.15, -0.05, 0.14, C.red);            // the main switch
      return { led: [-0.13, 0.18, 0.095] };
  }
  throw new Error('unknown device ' + kind);
}

export class Devices {
  constructor(mapId) {
    const M = CFG.devices.maps[mapId] || { list: [], keepLights: [] };
    power.keep = M.keepLights || [];
    power.reset();
    this.group = new THREE.Group();
    this.group.name = 'devices';
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.list = M.list.map((def) => {
      const B = new Builder();
      const { led } = buildDevice(def.kind, B);
      const mesh = B.mesh(mat);
      mesh.name = 'device: ' + def.id;
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
      mesh.rotation.y = def.yaw || 0;
      // a small light: on / ringing / the power is on (green for the breaker)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.006), new THREE.MeshBasicMaterial({ color: def.kind === 'breaker' ? 0x5fd38d : 0xffb347, fog: false }));
      lamp.position.set(led[0], led[1], led[2]);
      mesh.add(lamp);
      this.group.add(mesh);
      return {
        def, id: def.id, kind: def.kind, x: def.pos[0], y: def.pos[1], z: def.pos[2], floor: def.floor || 0, stand: def.stand, mesh, lamp,
        on: false, uses: 0, dead: false, claimed: null, t: 0, noiseT: 0, ringing: false, talking: false, delayT: -1,
      };
    });
    this.reset();
  }

  byId(id) { return this.list.find((d) => d.id === id) || null; }

  reset() {
    power.reset();
    for (const d of this.list) {
      Object.assign(d, { on: false, uses: 0, dead: false, claimed: null, t: 0, noiseT: 0, ringing: false, talking: false, delayT: -1 });
      this.show(d);
    }
  }

  // the small light: lit while it plays / rings (the breaker: while the power is on)
  show(d) { d.lamp.visible = d.kind === 'breaker' ? power.on : d.on || d.ringing; }

  // VR: the device within reach of the hand (3D distance to its middle)
  nearHand(p) {
    let best = null, bestD = CFG.devices.reach;
    for (const d of this.list) {
      const dd = Math.hypot(p.x - d.x, p.y - (d.y + 0.08), p.z - d.z);
      if (dd < bestD) { best = d; bestD = dd; }
    }
    return best;
  }
  // phone / PC: the device in front of the eyes (like the items: within aimReach, roughly ahead)
  aimed(head, yaw, floorY = 0) {
    let best = null, bestD = CFG.devices.aimReach;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const d of this.list) {
      if (Math.abs(d.y - floorY) > 2.2 || d.y < floorY - 0.3) continue;
      const dx = d.x - head.x, dz = d.z - head.z, dist = Math.hypot(dx, dz);
      if (dist > bestD || (dist > 0.4 && (dx * fx + dz * fz) / dist < 0.75)) continue;
      best = d; bestD = dist;
    }
    return best;
  }
}
