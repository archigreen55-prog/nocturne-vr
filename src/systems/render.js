// Renderer, scene, camera, lights; the phone's quality presets and gyroscope; window resizing.
// Frame: the low preset turns far lamps off.
import * as THREE from 'three';
import { VERSION } from '../version.js';
import { PREVIEW, loadSetting, saveSetting } from '../settings.js';
import { currentMode } from '../platform/mode.js';
import { Quality, PRESETS, startPreset } from '../perf/quality.js';
import { Gyro } from '../input/gyro.js';
import { setPanning } from '../audio/audio.js';
import { G, $, params } from './state.js';
import { phoneLayout } from './flatScreen.js';
import { S } from '../i18n/index.js';

const NIGHT = 0x0a0f1c;

function onResize() {
  const { renderer, camera } = G;
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  G.lastRender = 0;   // a paused phone redraws at once after a resize
  phoneLayout();
}

export const render = {
  id: 'render',
  init() {
    $('version').textContent = S.start.version(VERSION, PREVIEW);
    // vr / phone / pc (src/platform/mode.js)
    G.MODE = currentMode();

    // phone (T4): the quality preset decides MSAA when the page starts (WebGL cannot switch it later)
    const PHONE = G.PHONE = G.MODE.mode === 'phone';
    const IOS = G.IOS = G.MODE.device === 'iPhone' || G.MODE.device === 'iPad';
    const qSetting = loadSetting('quality', 'auto'), qAuto = loadSetting('qualityAuto', null);
    const renderer = G.renderer = new THREE.WebGLRenderer({ antialias: PHONE ? PRESETS[startPreset(qSetting, qAuto, IOS)].aa : true, powerPreference: 'high-performance' }); // MSAA 4x in VR and on a PC
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // VR / PC as before; the phone's Quality sets it below
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFoveation(params.has('fov') ? +params.get('fov') : 1);
    renderer.xr.setFramebufferScaleFactor(params.has('fbs') ? +params.get('fbs') : 1);
    document.body.appendChild(renderer.domElement);
    // phone: presets, dynamic resolution, the 30 / 60 cap (src/perf/quality.js)
    G.quality = PHONE ? new Quality({
      renderer, setting: qSetting, autoPick: qAuto, ios: IOS, cap: +loadSetting('fpsCap', '60'),
      onAutoPick: (preset) => { saveSetting('qualityAuto', preset); setPanning(PRESETS[preset].panning); if (G.menu) G.menu.refresh(); },
    }) : null;
    if (G.quality) setPanning(G.quality.p.panning);
    G.gyro = PHONE ? new Gyro() : null;

    const scene = G.scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT);
    scene.fog = new THREE.Fog(NIGHT, 6, 25);
    G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);

    // Lights (plan §7): dim sky, moonlight, 3 point lights + the patrol's flashlight. No shadows.
    const hemi = G.hemi = new THREE.HemisphereLight(0x46587f, 0x17130f, 1.5);
    scene.add(hemi);
    const moonLight = G.moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.55);
    moonLight.position.set(-0.6, 0.8, 0.7);
    scene.add(moonLight);
    const points = G.points = [];
    for (const [x, y, z, color, intensity, dist] of [
      [0.6, 2.8, 5.6, 0xffc98a, 6, 12],     // yard lamp over the path
      [1.5, 0.6, -12.9, 0xff7a3a, 3.5, 8],  // fireplace embers
      [-3.0, 2.3, -6.0, 0x7f9cff, 3, 10],   // corridor night light
    ]) {
      const l = new THREE.PointLight(color, intensity, dist, 1.6);
      l.position.set(x, y, z);
      scene.add(l);
      points.push(l);
      l.userData.base = intensity;
    }

    addEventListener('resize', onResize);
    if (window.visualViewport) visualViewport.addEventListener('resize', onResize);   // iOS Safari bars
  },
  // low preset: lamps further than 12 m are off (the number of lights never changes: no shader rebuild)
  frame(dt) {
    const { quality, player } = G;
    if (quality && (G.lampT -= dt) <= 0) {
      G.lampT = 0.5;
      for (const l of G.points) l.intensity = quality.p.farLights || Math.hypot(l.position.x - player.head.x, l.position.z - player.head.z) < 12 ? l.userData.base * G.lightK : 0;   // lightK: the display brightness (systems/brightness.js)
    }
  },
};
