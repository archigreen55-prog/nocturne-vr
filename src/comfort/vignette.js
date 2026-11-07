// VR comfort overlay (from the tuk-tuk project): tunnel vignette while walking with the stick and on
// snap turns, + fade to black. One quad drawn directly in clip space, so each eye gets it centred on
// its own optical axis with no stereo offset and no FOV guessing; the radius is an angle from the view axis.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

export const VIGNETTE_LEVELS = [
  { id: 'off', label: S.vignette.off, k: 0 },
  { id: 'weak', label: S.vignette.weak, k: 0.6 },
  { id: 'standard', label: S.vignette.standard, k: 1 },
  { id: 'strong', label: S.vignette.strong, k: 1.4 },
];
const STORE_KEY = 'nocturne.vignette';

export function loadVignetteLevel() {
  let id = null;
  try { id = localStorage.getItem(STORE_KEY); } catch { /* storage blocked */ }
  return VIGNETTE_LEVELS.find((l) => l.id === id) || VIGNETTE_LEVELS[2];
}
export function saveVignetteLevel(level) {
  try { localStorage.setItem(STORE_KEY, level.id); } catch { /* storage blocked */ }
}

const vertexShader = /* glsl */ `
varying vec2 vTan;
void main() {
  // tangent of the view angle at this clip-space position, from this eye's projection
  vTan = vec2((position.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
              (position.y + projectionMatrix[2][1]) / projectionMatrix[1][1]);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const fragmentShader = /* glsl */ `
uniform float uRadius;   // angle (rad) from the view axis where the darkening starts
uniform float uFeather;  // angle over which it goes to black
uniform float uFade;     // 0..1 full-screen black
uniform float uFlash;    // 0..1 full-screen colour flash (scares)
uniform vec3 uFlashColor;
varying vec2 vTan;
void main() {
  float v = max(smoothstep(uRadius, uRadius + uFeather, atan(length(vTan))), uFade);
  float a = max(v, uFlash);
  gl_FragColor = vec4(uFlashColor * uFlash * (1.0 - v) / max(a, 0.001), a);
}`;

export class ComfortOverlay {
  constructor() {
    this.uniforms = { uRadius: { value: 1 }, uFeather: { value: 0.35 }, uFade: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) } };
    this.flash = 0;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.mesh.name = 'comfort overlay';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10000;
    this.mesh.visible = false;
    this.level = loadVignetteLevel();
    this.intensity = 0;  // 0..1 vignette strength after smoothing
    this.impactT = 0;    // remaining time of a snap-turn pulse
    this.fade = 0;
    this.fadeRate = 0;   // per second; 0 = hold
  }

  setLevel(level) { this.level = level; saveVignetteLevel(level); }
  cycleLevel() {
    const i = VIGNETTE_LEVELS.indexOf(this.level);
    this.setLevel(VIGNETTE_LEVELS[(i + 1) % VIGNETTE_LEVELS.length]);
    return this.level;
  }

  blackout() { this.fade = 1; this.fadeRate = 0; }                // hold black until fadeIn()
  fadeIn(seconds) { this.fade = 1; this.fadeRate = 1 / seconds; }

  // Short full-screen colour flash (fades in ~0.2 s).
  flashColor(hex, strength = 0.6) { this.uniforms.uFlashColor.value.setHex(hex); this.flash = strength; }

  // Snap-turn pulse (plan §4.2: 0.5)
  pulse() { this.impactT = 0.2; }

  // speed: stick walking speed (m/s); enabled: vignette on at all
  update(dt, speed, enabled) {
    this.impactT = Math.max(0, this.impactT - dt);

    let target = 0;
    if (enabled && this.level.k > 0) {
      // 0 up to 0.8 m/s, 0.35 at 2.0 m/s; running: CFG.sprint.vignette at 2.8 m/s (the same line, capped)
      const walk = Math.min(CFG.sprint.vignette, Math.max(0, speed - 0.8) / 1.2 * 0.35);
      const turn = this.impactT > 0 ? 0.5 : 0;
      target = Math.min(1, Math.max(walk, turn) * this.level.k);
    }
    // rise in ~0.15 s, fall in ~0.4 s
    const tau = target > this.intensity ? 0.05 : 0.13;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / tau));
    if (this.intensity < 0.005) this.intensity = 0;

    this.fade = Math.max(0, this.fade - this.fadeRate * dt);

    this.uniforms.uRadius.value = 0.95 - 0.65 * this.intensity; // 54° .. 17°
    this.uniforms.uFade.value = this.fade;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.uniforms.uFlash.value = this.flash;
    this.mesh.visible = this.intensity > 0 || this.fade > 0 || this.flash > 0;
  }
}
