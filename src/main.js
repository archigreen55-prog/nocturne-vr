import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { VERSION } from './version.js';
import { buildLevel, roomAt, SPAWN } from './world/level.js';
import { Player } from './xr/player.js';
import { ComfortOverlay, VIGNETTE_LEVELS } from './comfort/vignette.js';
import { KeyboardInput } from './input/keyboard.js';
import { XRInput } from './input/xrInput.js';
import { WristPanel } from './ui/wrist.js';
import { Mic } from './audio/mic.js';
import { unlockAudio, playCreak, playKnock } from './audio/audio.js';
import { setupStartScreen } from './ui/start.js';
import { GpuTimer } from './perf/gpuTimer.js';
import { loadSetting, saveSetting } from './settings.js';

const NIGHT = 0x0a0f1c;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
$('version').textContent = `версія ${VERSION}`;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); // MSAA 4x in XR too
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(params.has('fov') ? +params.get('fov') : 1);
renderer.xr.setFramebufferScaleFactor(params.has('fbs') ? +params.get('fbs') : 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(NIGHT);
scene.fog = new THREE.Fog(NIGHT, 6, 25);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);

// Lights (plan §7): dim sky, moonlight, 3 point lights. No shadows.
scene.add(new THREE.HemisphereLight(0x46587f, 0x17130f, 1.5));
const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.55);
moonLight.position.set(-0.6, 0.8, 0.7);
scene.add(moonLight);
for (const [x, y, z, color, intensity, dist] of [
  [0.6, 2.8, 5.6, 0xffc98a, 6, 12],     // yard lamp over the path
  [1.5, 0.6, -12.9, 0xff7a3a, 3.5, 8],  // fireplace embers
  [-3.0, 2.3, -6.0, 0x7f9cff, 3, 10],   // corridor night light
]) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
}

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- world ----------
const t0 = performance.now();
const level = buildLevel();
scene.add(level.group);
const buildMs = performance.now() - t0;
console.log(`Level built in ${buildMs.toFixed(0)} ms, ${level.triangles} triangles, ${level.world.edgeCount} collision edges, ${level.doors.length} doors`);

const player = new Player(renderer, camera);
scene.add(player.rig);
player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);

// controllers: small dark bodies; the wrist panel lives on the left one
const wrist = new WristPanel(VERSION);
wrist.attachToCamera(camera);
const grips = { left: null, right: null };
{
  const geo = new THREE.BoxGeometry(0.035, 0.03, 0.11);
  geo.translate(0, -0.01, 0.02);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
  for (let i = 0; i < 2; i++) {
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(new THREE.Mesh(geo, mat));
    grip.addEventListener('connected', (e) => {
      grips[e.data.handedness] = grip;
      if (e.data.handedness === 'left') wrist.attachToGrip(grip);
    });
    grip.addEventListener('disconnected', () => {
      for (const h of ['left', 'right']) if (grips[h] === grip) grips[h] = null;
    });
    player.rig.add(grip);
  }
}

const comfort = new ComfortOverlay();
scene.add(comfort.mesh);
const mic = new Mic();
const keys = new KeyboardInput();
const xrIn = new XRInput();
let snapDeg = loadSetting('snap', 45) === 30 ? 30 : 45;

// ---------- messages ----------
let flashText = '', flashT = 0, flashColor = '#ffd166';
function flash(text, seconds = 2, color = '#ffd166') { flashText = text; flashT = seconds; flashColor = color; wristTimer = 0; }

// ---------- doors ----------
const _hand = new THREE.Vector3();
// Door nearest to (x, z) within maxDist of its doorway centre; if dirYaw is given, only in front.
function nearestDoor(x, z, maxDist, dirYaw) {
  let best = null, bestD = maxDist;
  for (const d of level.doors) {
    const dx = d.cx - x, dz = d.cz - z;
    const dist = Math.hypot(dx, dz);
    if (dist >= bestD) continue;
    if (dirYaw !== undefined && dist > 0.5 && (-Math.sin(dirYaw) * dx - Math.cos(dirYaw) * dz) / dist < 0.3) continue;
    best = d; bestD = dist;
  }
  return best;
}
function useDoor(door, hand) {
  if (!door) return;
  const r = door.toggle(player.head.x, player.head.z);
  if (r === 'locked') { playKnock(); flash('Замкнено'); if (hand) xrIn.pulse(hand, 0.6, 60); }
  else { playCreak(r === 'open' ? 0.6 : 0.4); if (hand) xrIn.pulse(hand, 0.3, 30); }
}
function useWithHand(hand) {
  const grip = grips[hand];
  let door = null;
  if (grip) { grip.getWorldPosition(_hand); door = nearestDoor(_hand.x, _hand.z, 0.9); }
  if (!door) door = nearestDoor(player.head.x, player.head.z, 1.5, player.yaw);
  useDoor(door, hand);
}

// ---------- VR session ----------
let inVR = false, firstRecenter = false, vrStart = 0, autoHzDone = false;
const fpsWindow = { frames: 0, since: 0 };
renderer.xr.addEventListener('sessionstart', () => {
  inVR = true;
  firstRecenter = true;
  unlockAudio();
  player.enterVR();
  player.recenterTo(player.head.x, player.head.z, player.yaw, true);
  comfort.blackout();   // black until the head pose is known, then fade in
  $('overlay').style.display = 'none';
  $('hint').style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
  // the system recentre (holding the Meta button) resets the space: keep the head where it was
  const space = renderer.xr.getReferenceSpace();
  if (space && space.addEventListener) space.addEventListener('reset', () => player.recenterTo(player.head.x, player.head.z, player.yaw));
  const session = renderer.xr.getSession();
  vrStart = performance.now();
  fpsWindow.frames = 0; fpsWindow.since = vrStart;
  if (params.has('hz') && session.updateTargetFrameRate) session.updateTargetFrameRate(+params.get('hz')).catch(() => {});
  session.addEventListener('inputsourceschange', (e) => {
    for (const i of e.added) console.log(`XR input ${i.handedness}: ${i.profiles[0]}, ${i.gamepad ? i.gamepad.buttons.length + ' buttons, ' + i.gamepad.axes.length + ' axes' : 'no gamepad'}`);
  });
});
renderer.xr.addEventListener('sessionend', () => {
  inVR = false;
  player.exitVR();
  camera.scale.set(1, 1, 1);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  wrist.attachToCamera(camera);
  comfort.fade = 0;
  $('overlay').style.display = 'flex';
});

// Drop to 72 Hz once if the headset cannot hold its current rate (steady 72 beats jittery 80-90).
function autoFrameRate(now) {
  fpsWindow.frames++;
  if (autoHzDone || params.has('hz') || now - vrStart < 6000) { if (now - fpsWindow.since > 3000) { fpsWindow.frames = 0; fpsWindow.since = now; } return; }
  if (now - fpsWindow.since < 3000) return;
  const fps = fpsWindow.frames * 1000 / (now - fpsWindow.since);
  fpsWindow.frames = 0; fpsWindow.since = now;
  const s = renderer.xr.getSession();
  const rates = s && s.supportedFrameRates;
  if (!s || !s.updateTargetFrameRate || !rates || !Array.from(rates).includes(72) || !(s.frameRate > 73)) return;
  if (fps < 86) {
    autoHzDone = true;
    s.updateTargetFrameRate(72).then(() => flash(`Частота 72 Гц (було ${fps.toFixed(0)} FPS)`, 4)).catch(() => {});
  }
}

// ---------- desktop mouse look ----------
let playingDesktop = false;
function lockPointer() {
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not available */ }
}
renderer.domElement.addEventListener('click', () => {
  if (playingDesktop && !inVR && !document.pointerLockElement) lockPointer();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) player.look(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => {
  // Esc releases the mouse: show the menu (calibration, settings) again
  if (!document.pointerLockElement && playingDesktop && !inVR) {
    playingDesktop = false;
    $('overlay').style.display = 'flex';
    $('hint').style.display = 'none';
  }
});

// ---------- stats ----------
const perf = { fps: 0, frames: 0, since: performance.now(), calls: 0, tris: 0 };
const debugEl = $('debug');
wrist.showFps = params.has('fps');
let wristTimer = 0;
const gpu = new GpuTimer(renderer.getContext());
const cpu = { sum: 0, n: 0, ms: null };
const move = { x: 0, y: 0 };
function toggleStats() { wrist.showFps = !wrist.showFps; wristTimer = 0; }
function cycleVignette() {
  const l = comfort.cycleLevel();
  $('vignette').value = l.id;
  flash(`Віньєтка: ${l.label}`);
}
function goHome() {
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  comfort.fadeIn(0.4);
  flash('Біля фургона');
}

// ---------- loop ----------
let last = performance.now(), heightMsg = false;
function frame(now, xrFrame) {
  const cpuStart = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  mic.update(dt);
  if (player.updatePose(xrFrame) === 'recentred') {
    comfort.fadeIn(firstRecenter ? 0.5 : 0.25);
    if (firstRecenter) flash('Подивись на ліве зап\'ястя', 5);
    else if (heightMsg) flash(`Зріст: ${player.standingHeight.toFixed(2)} м`);
    heightMsg = false;
    firstRecenter = false;
  }

  // input
  if (keys.take('KeyF')) toggleStats();
  if (keys.take('KeyR')) goHome();
  if (keys.take('KeyC')) player.virtualCrouch = !player.virtualCrouch;
  if (keys.take('KeyV')) cycleVignette();
  if (keys.take('KeyE') && !inVR) useDoor(nearestDoor(player.head.x, player.head.z, 1.6, player.yaw));
  keys.readMove(move);
  if (inVR) {
    const act = xrIn.read(renderer.xr.getSession(), dt);
    if (Math.hypot(xrIn.move.x, xrIn.move.y) > Math.hypot(move.x, move.y)) { move.x = xrIn.move.x; move.y = xrIn.move.y; }
    if (act.turn) { player.snapTurn(act.turn * snapDeg * Math.PI / 180); comfort.fadeIn(0.08); comfort.pulse(); }
    if (act.fps) toggleStats();
    if (act.vignette) cycleVignette();
    if (act.crouch) { player.virtualCrouch = !player.virtualCrouch; flash(player.virtualCrouch ? 'Присів (B — встати)' : 'Встав'); }
    if (act.recenter) { player.recenterTo(player.head.x, player.head.z, player.yaw, true); heightMsg = true; }
    if (act.home) goHome();
    if (act.useLeft) useWithHand('left');
    if (act.useRight) useWithHand('right');
    autoFrameRate(now);
  } else if (!playingDesktop) {
    move.x = move.y = 0;
  }

  for (const d of level.doors) d.update(dt);
  player.update(dt, move, level);
  if (inVR) wrist.faceEye(player.head);
  comfort.update(dt, player.speed, inVR || params.has('vignette'));

  gpu.poll();
  gpu.begin();
  renderer.render(scene, camera);
  gpu.end();
  perf.calls = renderer.info.render.calls;
  perf.tris = renderer.info.render.triangles;

  perf.frames++;
  if (now - perf.since >= 500) {
    perf.fps = (perf.frames * 1000) / (now - perf.since);
    perf.frames = 0; perf.since = now;
  }
  flashT -= dt;
  wristTimer -= dt;
  if (wristTimer <= 0) {
    wristTimer = 0.1;   // 10 Hz
    const session = inVR && renderer.xr.getSession();
    wrist.draw({
      mic, stepsAudible: player.stepsAudible, crouched: player.crouched, virtualCrouch: player.virtualCrouch,
      room: roomAt(player.head.x, player.head.z),
      fps: perf.fps, calls: perf.calls, tris: perf.tris, hz: session && session.frameRate ? Math.round(session.frameRate) : 0,
      gpuMs: gpu.take(), cpuMs: cpu.n ? (cpu.ms = cpu.sum / cpu.n, cpu.sum = cpu.n = 0, cpu.ms) : cpu.ms,
      msg: flashT > 0 ? flashText : '', msgColor: flashColor,
    });
    debugEl.style.display = wrist.showFps && !inVR ? 'block' : 'none';
    if (wrist.showFps) debugEl.textContent = `${perf.fps.toFixed(0)} FPS\ncalls ${perf.calls}  tris ${perf.tris}\npos ${player.head.x.toFixed(1)}, ${player.head.z.toFixed(1)}  h ${player.head.y.toFixed(2)}`;
  }
  start.tick(dt);
  keys.endFrame();
  cpu.sum += performance.now() - cpuStart; cpu.n++;
}

// ---------- start screen ----------
const start = setupStartScreen({
  mic,
  onPlay() {
    unlockAudio();
    playingDesktop = true;
    $('overlay').style.display = 'none';
    $('hint').style.display = 'block';
    lockPointer();
  },
});
const vrButton = VRButton.createButton(renderer);
vrButton.id = 'vrbutton';
vrButton.addEventListener('click', () => unlockAudio(), true);
$('buttons').appendChild(vrButton);

const vsel = $('vignette');
for (const l of VIGNETTE_LEVELS) vsel.add(new Option(l.label, l.id));
vsel.value = comfort.level.id;
vsel.addEventListener('change', () => comfort.setLevel(VIGNETTE_LEVELS.find((l) => l.id === vsel.value)));
$('snap').value = String(snapDeg);
$('snap').addEventListener('change', () => { snapDeg = +$('snap').value; saveSetting('snap', snapDeg); });

renderer.setAnimationLoop(frame);
if (params.has('autostart')) start.play();

// test / debugging hook
window.__game = { THREE, renderer, scene, camera, player, level, mic, comfort, xrIn, wrist, perf, VERSION, flash, goHome, useDoor, nearestDoor, get inVR() { return inVR; } };
