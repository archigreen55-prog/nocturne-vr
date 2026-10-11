// W17 «Стиль» S4 (plan-W17-style.md §3.3, decision 7): the live scene behind the menu. While the menu is up
// (not playing, not in VR), the picture comes from a camera of its own that slowly circles the house from
// above (the lit windows, the yard, the guard's light), at 30 frames a second; on the phone's «низька» one
// still frame. Only the picture changes: the game's camera, the simulation and its trace stay as they are
// (tools/snapshot.mjs); the picture is drawn at half the resolution. «Стиль: вимк» and the tests' all-pages view (tests/harness.mjs) keep the old view.
import * as THREE from 'three';
import { STYLE_ON } from './materials.js';
import { quietRandom } from './quiet.js';
import { G, $ } from '../systems/state.js';

const TEST = (typeof window !== 'undefined' && window.__NOCTURNE_TEST) || {};
const SPEED = 0.03;   // rad/s: once round the house in 3.5 min
let cam = null, live = false, pr = 0, half = 0, last = -1e9, still = false, t0 = 0, R = 18, C = new THREE.Vector3();
const fog = { near: 0, far: 0 };

function setup() {
  cam = quietRandom(() => new THREE.PerspectiveCamera(45, 1, 0.1, 200));   // made here, with crypto's numbers (style/quiet.js)
  // the fog moves out for this camera only, for the time of its picture
  const before = G.scene.onBeforeRender, after = G.scene.onAfterRender;
  G.scene.onBeforeRender = function (r, s, c, ...rest) {
    if (c === cam) { fog.near = s.fog.near; fog.far = s.fog.far; s.fog.near = R - 4; s.fog.far = R + 26; }
    before.call(this, r, s, c, ...rest);
  };
  G.scene.onAfterRender = function (r, s, c, ...rest) {
    if (c === cam) { s.fog.near = fog.near; s.fog.far = fog.far; }
    after.call(this, r, s, c, ...rest);
  };
}

// main.js, each frame: the camera to draw with, false = no picture this frame, null = the game's camera
export function menuView(now) {
  const shown = STYLE_ON && TEST.pages !== 'all' && G.scene && !G.inVR && !G.playingDesktop && $('overlay') && $('overlay').style.display !== 'none';
  if (live !== !!shown) {
    live = !!shown;
    document.body.classList.toggle('menu-live', live);   // the overlay lets the scene through (style/menu.css)
    if (!live && half) { G.renderer.setPixelRatio(G.quality ? G.quality.pr : pr); half = 0; }   // the game's own resolution back
  }
  // behind the tinted overlay half the resolution is enough (the whole house is in view: a quarter of the pixels
  // to light); the quality chosen meanwhile («Для тестерів») is followed
  if (live && G.renderer.getPixelRatio() !== half) { pr = G.renderer.getPixelRatio(); half = pr * 0.5; G.renderer.setPixelRatio(half); }
  if (!shown) { still = false; return null; }
  if (!cam) setup();
  const H = G.level && G.level.house;
  if (H) { C.set((H.minX + H.maxX) / 2, 0, (H.minZ + H.maxZ) / 2); R = Math.hypot(H.maxX - H.minX, H.maxZ - H.minZ) / 2 + 7; }
  const asp = innerWidth / innerHeight;
  if (cam.aspect !== asp) { cam.aspect = asp; cam.fov = asp < 1 ? 70 : 45; cam.updateProjectionMatrix(); still = false; }   // a phone held upright: wider; a new size, a new still
  const low = G.quality && G.quality.preset === 'low';
  if (low && still) return false;                // «низька»: one still frame
  if (!low && now - last < 1000 / 30 - 2) return false;   // 30 frames a second
  if (!t0) t0 = now;
  last = now; still = true;
  const a = 0.35 + (low ? 0 : (now - t0) / 1000 * SPEED);   // from the yard's side (+Z), where the van stands
  cam.position.set(C.x + Math.sin(a) * R, 7.5, C.z + Math.cos(a) * R);
  cam.lookAt(C.x, 0.8, C.z);
  return cam;
}
