import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { VERSION } from './version.js';
import { CFG } from './game/config.js';
import { buildLevel, roomAt, SPAWN } from './world/level.js';
import { Player } from './xr/player.js';
import { ComfortOverlay, VIGNETTE_LEVELS } from './comfort/vignette.js';
import { KeyboardInput } from './input/keyboard.js';
import { XRInput } from './input/xrInput.js';
import { WristPanel } from './ui/wrist.js';
import { Board, money } from './ui/board.js';
import { Pointer } from './ui/pointer.js';
import { Mic, Breath } from './audio/mic.js';
import { ScreamRecorder } from './audio/scream.js';
import { unlockAudio, existingAudioContext, setListener, CreakVoice, playKnock, playCash, playHeartbeat, Siren, playGrunt, playKettle, playFlush, playRing, playMurmur, playYawn, playRadio } from './audio/audio.js';
import { applyDifficulty, DIFFS } from './game/difficulty.js';
import { contractById, goalText, bonusText, progress, evaluate, bestStars, recordStars } from './game/contracts.js';
import { runCalibration } from './audio/calibrate.js';
import { LEVELS } from './audio/mic.js';
import { NoiseSystem } from './noise/noise.js';
import { Loot } from './loot/items.js';
import { Hands } from './loot/hands.js';
import { Nav } from './enemies/nav.js';
import { Alert } from './enemies/alert.js';
import { Patrol } from './enemies/patrol.js';
import { Lurker } from './enemies/lurker.js';
import { Round } from './game/round.js';
import { DropZone } from './game/dropzone.js';
import { stealthState } from './game/stealth.js';
import { maskScene, maskBeam, updateFlashMask, flashUniforms } from './enemies/flashMask.js';
import { setupStartScreen } from './ui/start.js';
import { GpuTimer } from './perf/gpuTimer.js';
import { loadSetting, saveSetting, PREVIEW } from './settings.js';
import { currentMode, MODE_NAMES } from './platform/mode.js';
import { FrameStats, prepareReport, buildReport, copyReport } from './debug/report.js';

const NIGHT = 0x0a0f1c;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
$('version').textContent = `версія ${VERSION}${PREVIEW ? ' · тестова (превʼю)' : ''}`;
// vr / phone / pc (src/platform/mode.js). Phone controls come in the next wave (plan-phone-mode T1).
const MODE = currentMode();

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

// Lights (plan §7): dim sky, moonlight, 3 point lights + the patrol's flashlight. No shadows.
const hemi = new THREE.HemisphereLight(0x46587f, 0x17130f, 1.5);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.55);
moonLight.position.set(-0.6, 0.8, 0.7);
scene.add(moonLight);
const points = [];
for (const [x, y, z, color, intensity, dist] of [
  [0.6, 2.8, 5.6, 0xffc98a, 6, 12],     // yard lamp over the path
  [1.5, 0.6, -12.9, 0xff7a3a, 3.5, 8],  // fireplace embers
  [-3.0, 2.3, -6.0, 0x7f9cff, 3, 10],   // corridor night light
]) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
  points.push(l);
}

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- messages ----------
let flashText = '', flashT = 0, flashColor = '#ffd166', wristTimer = 0;
function flash(text, seconds = 2, color = '#ffd166') { flashText = text; flashT = seconds; flashColor = color; wristTimer = 0; }

// ---------- contract and difficulty (applied before the guard is built) ----------
let contractId = loadSetting('contract', 'first'), difficulty = loadSetting('difficulty', 'medium');
if (!DIFFS.includes(difficulty)) difficulty = 'medium';
let contract = contractById(contractId);
applyDifficulty(difficulty, contract);
let verdict = null;
// the guard's spoken lines: subtitles on the wrist
let guardLine = '', guardLineT = 0;

// ---------- world ----------
const t0 = performance.now();
const level = buildLevel();
scene.add(level.group);

const player = new Player(renderer, camera);
scene.add(player.rig);
player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
const listener = () => player.head;

const noise = new NoiseSystem();
scene.add(noise.mesh);
const loot = new Loot({
  level, noise, listener,
  onMessage: (t, c) => flash(t, 2, c),
  onDeliver: (it) => {
    playCash();
    const delay = Math.max(0, lastPop + 0.35 - simT);   // several items: the labels rise one after another
    lastPop = simT + delay;
    zone.pop('+' + money(it.value), delay);
    flash(`${it.name}${it.damaged ? ' (пошкодж.)' : ''} у фургоні: ${money(it.value)}`, 2.5, it.damaged ? '#ffb347' : '#5fd38d');
    boardDirty = true;
  },
});
scene.add(loot.group);
const zone = new DropZone();
scene.add(zone.group);
let simT = 0, lastPop = -1;
const nav = new Nav(level);
const alert = new Alert({ hemi, moon: moonLight, points, glow: level.glowMaterial });
const patrol = new Patrol({
  level, nav, alert, listener, loot,
  roundTime: () => (round.phase === 'heist' ? round.t : null),
  say: (text) => { guardLine = text; guardLineT = 3.5; wristTimer = 0; },
  sound: (kind, x, z, o) => {
    const L = player.head, v = patrol.voice;
    const at = (px, pz) => ({ pos: { x: px, y: 1, z: pz }, occ: level.soundOccluded(L.x, L.z, px, pz) });
    if (kind === 'kettle') { const a = at(x, z); playKettle(a.pos, a.occ, o.dur, o.whistleAt, o.whistleFor); }
    else if (kind === 'flush') { const a = at(x, z); playFlush(a.pos, a.occ); }
    else if (kind === 'ring') playRing(v);
    else if (kind === 'murmur') playMurmur(v);
    else if (kind === 'yawn') playYawn(v);
    else if (kind === 'radio') playRadio(v);
    else if (kind === 'grunt') playGrunt(v, 'alarm');
  },
});
scene.add(patrol.group);
const lurker = new Lurker({ level, onScare: () => { comfort.flashColor(0xffffff, 0.55); xrIn.pulse('both', 1, 250); } });
scene.add(lurker.group);
const board = new Board();
scene.add(board.mesh);
const mic = new Mic();
const scream = new ScreamRecorder(mic);
scream.onEnded = () => { boardDirty = true; };
const breath = new Breath();
const siren = new Siren();
const round = new Round({
  loot, alert, patrol, lurker, scream,
  get hands() { return hands; },
  onMessage: (t, c, s) => flash(t, s || 3, c),
  onPhase: (phase) => {
    boardDirty = true;
    if (phase === 'result') {
      siren.set(false);
      patrol.reset(); lurker.reset(); alert.reset();
      const R = round.result;
      if (R.kind === 'caught' || R.kind === 'late') {   // back at the van, facing it
        player.teleport(SPAWN.x, SPAWN.z, Math.atan2(-(CFG.dropZone.x - SPAWN.x), -(CFG.dropZone.z - SPAWN.z)));
        comfort.fadeIn(0.8);
      }
      resultT = 0; autoPlayed = false;
      verdict = evaluate(contract, R, { alarmed: round.alarmed, noMic: mic.noMic || mic.state !== 'on', difficulty, loot });
      verdict.newBest = recordStars(contract.id, difficulty, verdict.stars, MODE.mode);
      flash(`${R.title} ${'★'.repeat(verdict.stars)}${'☆'.repeat(3 - verdict.stars)}`, 4, R.kind === 'left' || R.kind === 'escaped' ? '#5fd38d' : '#ff5c5c');
    }
  },
});
console.log(`Level built in ${(performance.now() - t0).toFixed(0)} ms, ${level.triangles} triangles, ${level.world.edgeCount} collision edges, ${level.doors.length} doors`);

// noise -> who hears it
noise.on((e) => {
  if (round.phase === 'result') return;
  if (patrol.hear(e)) alert.add(CFG.alert.points[e.kind] || 20, e.x, e.z);
  lurker.hear(e);
});
alert.onFull = (cause, x, z) => {
  if (round.phase === 'result') return;
  patrol.onAlarm(x, z);
  round.startEscape(cause);
  siren.set(true);
};

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
const xrIn = new XRInput();
const hands = new Hands({ loot, rig: player.rig, grips, pulse: (h, s, ms) => xrIn.pulse(h, s, ms), onMessage: (t, c) => flash(t, 2, c) });
const pointer = new Pointer(renderer, player.rig, board);
pointer.addTo(scene);

const comfort = new ComfortOverlay();
scene.add(comfort.mesh);
const keys = new KeyboardInput();
let snapDeg = loadSetting('snap', 45) === 30 ? 30 : 45;

// ---------- doors ----------
const _hand = new THREE.Vector3(), _handle = new THREE.Vector3();
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
// Quick swing (creaks) or slow (quiet).
function useDoor(door, hand, time = CFG.doors.fastTime) {
  if (!door) return;
  if (hands.busy) { flash('Руки зайняті'); return; }
  door.lastUser = 'player';
  const r = door.toggle(player.head.x, player.head.z, time);
  if (r === 'locked') { playKnock({ x: door.cx, y: 1, z: door.cz }); flash('Замкнено'); if (hand) xrIn.pulse(hand, 0.6, 60); }
  else if (hand) xrIn.pulse(hand, 0.3, 30);
}
// VR trigger: hand on the handle = drag the door (slow = quiet); elsewhere near a door = quick swing.
const drags = { left: null, right: null };
function triggerDown(hand) {
  if (hands.busy) { flash('Руки зайняті'); return; }
  const g = grips[hand];
  if (!g) return;
  g.getWorldPosition(_hand);
  for (const door of level.doors) {
    door.handle(_handle);
    if (Math.hypot(_handle.x - _hand.x, _handle.z - _hand.z) < CFG.doors.handleReach && Math.abs(_hand.y - 1) < 0.6) {
      if (!door.grab(_hand.x, _hand.z)) { useDoor(door, hand); return; }   // locked
      door.lastUser = 'player';
      drags[hand] = { door, t: 0, a0: door.angle };
      xrIn.pulse(hand, 0.2, 20);
      return;
    }
  }
  let door = nearestDoor(_hand.x, _hand.z, 0.9);
  if (!door) door = nearestDoor(player.head.x, player.head.z, 1.5, player.yaw);
  useDoor(door, hand);
}
function updateDrags(dt) {
  for (const hand of ['left', 'right']) {
    const d = drags[hand];
    if (!d) continue;
    d.t += dt;
    if (!xrIn.trigger[hand] || !grips[hand] || hands.busy) {
      d.door.release();
      drags[hand] = null;
      // a tap on the handle (no pull) = quick swing
      if (d.t < 0.3 && Math.abs(d.door.angle - d.a0) < 0.09) useDoor(d.door, hand);
      continue;
    }
    grips[hand].getWorldPosition(_hand);
    d.door.drag(_hand.x, _hand.z);
  }
}
// Hinge creaks: a continuous voice per moving door (loudness follows the swing speed) and, for the
// patrol, a noise per creak (radius from its loudest moment; the patrol's own doors only warn you,
// they do not alarm it).
const creakVoices = new Map();
const _doorPos = { x: 0, y: 1.2, z: 0 };
function updateDoors(dt) {
  for (const d of level.doors) {
    const loud = d.update(dt);
    let v = creakVoices.get(d);
    if (loud > 0 && !v) { v = new CreakVoice(); creakVoices.set(d, v); }
    if (v) {
      _doorPos.x = d.cx; _doorPos.z = d.cz;
      if (!v.set(loud, _doorPos, level.soundOccluded(player.head.x, player.head.z, d.cx, d.cz), dt)) { v.stop(); creakVoices.delete(d); }
    }
    // one noise per creak burst (when it stops), or every 0.5 s while it goes on; radius from its peak
    d.creakPeak = Math.max(d.creakPeak || 0, loud);
    if (d.creakPeak > 0) d.creakAge = (d.creakAge || 0) + dt;
    if (d.creakPeak > 0 && (loud === 0 || d.creakAge >= 0.5)) {
      if (d.lastUser !== 'patrol') noise.emit(d.cx, d.cz, CFG.doors.creakRadius * Math.pow(d.creakPeak, 0.7), 'door');
      d.creakPeak = 0; d.creakAge = 0;
    }
  }
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
  $('crosshair').style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
  if (hands.desk) { hands.desk.drop(new THREE.Vector3()); hands.desk = null; }
  if (round.phase === 'escape') siren.set(true);
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
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } hands.release(h, true); }
  player.exitVR();
  camera.scale.set(1, 1, 1);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  wrist.attachToCamera(camera);
  comfort.fade = 0;
  siren.set(false);
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
  if (!playingDesktop || inVR) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (pointer.hover.desk) pressBoard(pointer.hover.desk);
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
    $('crosshair').style.display = 'none';
    siren.set(false);
  }
});

// ---------- round control ----------
let boardDirty = true, boardT = 0, caughtT = -1, heartT = 0, voiceT = 0, speakT = 0, quietT = 0;
let resultT = -1, autoPlayed = false, wasHidden = false;
function newRound() {
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
  applyDifficulty(difficulty, contract);
  verdict = null; boardPage = 'contract';
  loot.reset(); hands.reset(); level.reset(); patrol.reset(); lurker.reset(); alert.reset();
  round.reset(); scream.clear(); breath.reset(); noise.clear(); siren.set(false);
  caughtT = -1; resultT = -1;
  board.placeAtStand();
  player.virtualCrouch = false;
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  comfort.fadeIn(0.5);
  boardDirty = true;
  flash('Новий раунд. Годинник піде, щойно рушиш до будинку', 4);
}
// Contract / difficulty can change only before the clock starts (at the van, or on the start screen).
function setContract(id) {
  if (round.phase !== 'ready') return;
  contract = contractById(id); contractId = contract.id; saveSetting('contract', contractId);
  applyDifficulty(difficulty, contract); patrol.reset(); lurker.reset(); round.reset();
  syncStartScreen(); boardDirty = true;
}
function setDifficulty(id) {
  if (round.phase !== 'ready') return;
  difficulty = id; saveSetting('difficulty', id);
  applyDifficulty(difficulty, contract); patrol.reset(); lurker.reset(); round.reset();
  syncStartScreen(); boardDirty = true;
}
let boardPage = 'contract', calib = null, calibNotes = '';
async function calibrateInVR() {
  if (calib || mic.state !== 'on') return;
  calib = { i: 0, step: { title: '', say: '' }, phase: 'prep', left: 1.5 };
  const res = await runCalibration(mic, (st) => { calib = st; boardDirty = true; });
  calib = null;
  if (res.ok) mic.setCalibration(res.cal);
  calibNotes = (res.ok ? 'Готово. ' : '') + res.notes.join(' ');
  start.refresh(); boardDirty = true;
}
async function micOnInVR() {
  await mic.enable();
  if (mic.state === 'on') { scream.start(); calibNotes = 'Мікрофон увімкнено. Відкалібруй його (4 кроки).'; }
  else calibNotes = `Мікрофон не ввімкнувся (${mic.error || mic.state}). Зніми шолом і дозволь його на стартовому екрані.`;
  start.refresh(); boardDirty = true;
}
function pressBoard(id) {
  const all = CFG.contracts, i = all.indexOf(contract);
  if (id === 'leave' && (round.phase === 'heist' || round.phase === 'ready')) round.finish('left');
  else if (id === 'play') scream.play();
  else if (id === 'again') newRound();
  else if (id === 'cprev') setContract(all[(i + all.length - 1) % all.length].id);
  else if (id === 'cnext') setContract(all[(i + 1) % all.length].id);
  else if (id === 'diff') setDifficulty(DIFFS[(DIFFS.indexOf(difficulty) + 1) % DIFFS.length]);
  else if (id === 'micpage') { boardPage = 'mic'; calibNotes = ''; }
  else if (id === 'back') boardPage = 'contract';
  else if (id === 'cal') calibrateInVR();
  else if (id === 'micon') micOnInVR();
  else if (id === 'nomic') { mic.setNoMic(!mic.noMic); start.refresh(); }
  else if (id === 'wdn') mic.adjustWhisper(-2);
  else if (id === 'wup') mic.adjustWhisper(2);
  else if (id === 'sdn') mic.adjustShout(-2);
  else if (id === 'sup') mic.adjustShout(2);
  if (['wdn', 'wup', 'sdn', 'sup'].includes(id)) start.refresh();
  boardDirty = true;
}
function caught() {
  caughtT = 0;
  comfort.blackout();
  xrIn.pulse('both', 1, 400);
  flash('СПІЙМАЛИ', 3, '#ff5c5c');
  for (const h of ['left', 'right']) { if (drags[h]) { drags[h].door.release(); drags[h] = null; } }
}
function goHome() {
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
  comfort.fadeIn(0.4);
  flash('Біля фургона');
}

// ---------- stats ----------
const perf = { fps: 0, frames: 0, since: performance.now(), calls: 0, tris: 0 };
const frameStats = new FrameStats();   // for the report: last 60 s and per minute
const debugEl = $('debug');
wrist.showFps = params.has('fps');
const gpu = new GpuTimer(renderer.getContext());
const cpu = { sum: 0, n: 0, ms: null };
const move = { x: 0, y: 0 };
function toggleStats() { wrist.showFps = !wrist.showFps; wristTimer = 0; }
function cycleVignette() {
  const l = comfort.cycleLevel();
  $('vignette').value = l.id;
  flash(`Віньєтка: ${l.label}`);
}

// ---------- simulation (one frame of game logic) ----------
let heightMsg = false;
function simulate(dt, xrFrame, now) {
  simT += dt;
  mic.update(dt);
  scream.update();
  if (player.updatePose(xrFrame) === 'recentred') {
    comfort.fadeIn(firstRecenter ? 0.5 : 0.25);
    if (firstRecenter) flash('Подивись на ліве зап\'ястя', 5);
    else if (heightMsg) flash(`Зріст: ${player.standingHeight.toFixed(2)} м`);
    heightMsg = false;
    firstRecenter = false;
  }
  const active = inVR || playingDesktop;

  // input
  if (keys.take('KeyF')) toggleStats();
  if (keys.take('KeyV')) cycleVignette();
  if (keys.take('KeyR')) goHome();
  if (keys.take('KeyN')) newRound();
  if (keys.take('KeyC')) player.virtualCrouch = !player.virtualCrouch;
  keys.readMove(move);
  let breathDown = keys.any('ShiftLeft', 'ShiftRight');
  if (inVR) {
    const act = xrIn.read(renderer.xr.getSession(), dt);
    if (Math.hypot(xrIn.move.x, xrIn.move.y) > Math.hypot(move.x, move.y)) { move.x = xrIn.move.x; move.y = xrIn.move.y; }
    breathDown = breathDown || xrIn.breath;
    if (act.turn) { player.snapTurn(act.turn * snapDeg * Math.PI / 180); comfort.fadeIn(0.08); comfort.pulse(); }
    if (act.fps) toggleStats();
    if (act.vignette) cycleVignette();
    if (act.crouch) { player.virtualCrouch = !player.virtualCrouch; flash(player.virtualCrouch ? 'Присів (B — встати)' : 'Встав'); }
    if (act.recenter) { player.recenterTo(player.head.x, player.head.z, player.yaw, true); heightMsg = true; }
    if (act.home) goHome();
    for (const [hand, used] of [['left', act.useLeft], ['right', act.useRight]]) {
      if (!used || caughtT >= 0) continue;
      if (pointer.hover[hand]) { pressBoard(pointer.hover[hand]); xrIn.pulse(hand, 0.3, 30); }
      else triggerDown(hand);
    }
    autoFrameRate(now);
  } else if (!playingDesktop) {
    move.x = move.y = 0;
  }
  if (!active || caughtT >= 0) { move.x = move.y = 0; }

  // caught: 1 s of black, then the result at the van
  if (caughtT >= 0) {
    caughtT += dt;
    if (caughtT > 1 && round.phase !== 'result') {
      round.finish('caught');   // onPhase: back to the van, board in front
      caughtT = -1;
    }
  }

  // breath (A / Shift)
  const b = breath.update(dt, active && breathDown);
  if (b === 'start') { flash('Затамував подих: мікрофон не чути', 1.5, '#4fb3ff'); xrIn.pulse('right', 0.2, 30); wristTimer = 0; }
  else if (b === 'end') { flash(`Видих. Відпочинок ${breath.cool.toFixed(0)} с`, 2, '#93a1b8'); wristTimer = 0; }
  else if (b === 'busy') flash(`Ще не віддихався: ${breath.left.toFixed(0)} с`, 1.5, '#93a1b8');

  // player + hands
  player.update(dt, move, level, hands.carrying === 'medium' ? CFG.player.carryMediumK : 1);
  if (inVR) hands.update(dt, xrIn.grip);
  else if (playingDesktop) {
    hands.aimDesk(player.head, player.yaw);
    if (keys.take('KeyE')) hands.toggleDesk(player.head, player.yaw, round.atVan(player.head));
    hands.updateDesk(player.head, player.yaw, player.lookPitch);
    hands.updateHighlight();
  }
  if (!inVR) {
    if (keys.take('KeyQ')) useDoor(nearestDoor(player.head.x, player.head.z, 1.6, player.yaw), null, CFG.doors.slowTime);
    if (keys.take('KeyT')) useDoor(nearestDoor(player.head.x, player.head.z, 1.6, player.yaw), null, CFG.doors.fastTime);
  }
  // drop-off ring: head inside with loot in hand = the loot flies into the van
  const carried = hands.heldItems().filter((it) => !it.twoHanded || hands.desk === it || (hands.two && hands.two.item === it));
  const inRing = zone.contains(player.head.x, player.head.z);
  if (active && inRing && carried.length && round.phase !== 'result' && caughtT < 0) {
    for (const it of carried) { hands.detach(it); loot.deliver(it); }
    xrIn.pulse('both', 0.3, 40);
  }
  zone.update(dt, carried.length > 0, player.head);

  updateDrags(dt);
  updateDoors(dt);
  updateFlashMask(patrol.x, patrol.z, level.doors);
  if (inVR) wrist.faceEye(player.head);
  setListener(player.head.x, player.head.y, player.head.z, player.yaw);

  if (active && round.phase !== 'result') {
    // noise from the player: stick steps, voice, shout
    if (player.stepNoise) noise.emit(player.head.x, player.head.z, player.stepNoise, 'step');
    const micLive = mic.state === 'on' && !mic.noMic && !breath.holding && !scream.playing && caughtT < 0;
    const shout = mic.takeShout();
    if (micLive && shout) {
      round.shouts++;
      scream.onShout(round.t);
      noise.emit(player.head.x, player.head.z, 40, 'shout');
      if (CFG.run.shoutFull) { alert.setFull('крик', player.head.x, player.head.z); flash('КРИК! Тебе почув весь будинок', 3, '#ff4d4d'); }
      else { alert.add(70, player.head.x, player.head.z); flash('КРИК! Сторож іде перевірити', 3, '#ff4d4d'); }   // easy
    }
    // talking: heard only after CFG.mic.normalAfter s of continuous speech (short pauses allowed)
    if (micLive && mic.level !== 'quiet') { speakT += dt; quietT = 0; }
    else { quietT += dt; if (quietT > 0.35) speakT = 0; }
    if (micLive && speakT >= CFG.mic.normalAfter) {
      voiceT -= dt;
      if (voiceT <= 0) { voiceT = CFG.mic.normalEvery; noise.emit(player.head.x, player.head.z, CFG.mic.normalRadius, 'voice'); }
    } else voiceT = 0;

    // world
    loot.update(dt, player);
    if (caughtT < 0) {
      if (patrol.update(dt, player) === 'caught') caught();
      lurker.update(dt, player);
    }
    alert.update(dt);
    round.update(dt, player);
    // heartbeat while escaping (plan §5: 1 Hz)
    if (round.phase === 'escape') {
      heartT -= dt;
      if (heartT <= 0) { heartT = 0.9; playHeartbeat(); xrIn.pulse('both', 0.35, 60); }
    }
  } else {
    mic.takeShout();
    speakT = 0;
    if (round.phase === 'result') { loot.update(dt, player); alert.update(dt); }
  }
  if (round.phase === 'result' && resultT >= 0) {
    resultT += dt;
    if (!board.floating && resultT > 0.2) { board.placeInFront(player.head, player.yaw); boardDirty = true; }
    if (!autoPlayed && resultT > 1.2 && !scream.pending && !scream.busy) {
      autoPlayed = true;
      if (scream.best && scream.play()) boardDirty = true;
    }
  }
  noise.update(dt);

  // board: pointer hover + redraw 4 times a second (8 on the microphone page: a live level bar)
  if (pointer.update(inVR, camera)) boardDirty = true;
  boardT -= dt;
  if (boardDirty || boardT <= 0) {
    boardT = round.phase === 'ready' && boardPage === 'mic' ? 0.125 : 0.25; boardDirty = false;
    const T = loot.tally(), lv = LEVELS[mic.level];
    board.draw({
      phase: round.phase, clock: round.clock, alertLevel: alert.level, tally: T, result: round.result,
      clip: scream.best, playing: !!scream.playing, recMode: scream.modeName,
      page: boardPage, contract, contractIndex: CFG.contracts.indexOf(contract), contractCount: CFG.contracts.length,
      goalText: goalText(contract, loot.items), bonusText: bonusText(contract), best: bestStars(contract.id),
      diffName: CFG.difficulties[difficulty].name, difficulty, progress: progress(contract, T, loot), verdict,
      noMic: mic.noMic, mic, calib, calibNotes, levelColor: lv.color, levelLabel: lv.label,
    });
  }
}

// ---------- loop ----------
let last = performance.now();
function frame(now, xrFrame) {
  const cpuStart = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  frameStats.add(now - last);
  last = now;

  simulate(dt, xrFrame, now);
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
    const held = hands.heldItems()[0];
    const T = loot.tally();
    const dragging = drags.left || drags.right;
    const st = stealthState(player, level, patrol);
    if (st.hidden && !wasHidden && inVR) xrIn.pulse('left', 0.15, 20);   // a small tick: you are hidden
    wasHidden = st.hidden;
    guardLineT -= 0.1;
    const guardText = guardLineT > 0 ? `Сторож: «${guardLine}»` : CFG.run.showGuard && round.phase !== 'result' ? `Сторож: ${patrol.activity}` : '';
    wrist.draw({
      stealth: st, goal: round.phase === 'result' ? null : progress(contract, T, loot), guardText,
      vanSum: T.sum, vanCount: T.inVan, speaking: speakT >= CFG.mic.normalAfter && !breath.holding,
      door: dragging ? { creak: dragging.door.creak } : null,
      mic, breath, stepsAudible: player.stepsAudible, crouched: player.crouched, virtualCrouch: player.virtualCrouch,
      room: roomAt(player.head.x, player.head.z),
      holding: held ? `${held.name}${held.damaged ? ' (пошкодж.)' : ''}` : '',
      clock: round.clock, phase: round.phase, alertLevel: alert.level,
      fps: perf.fps, calls: perf.calls, tris: perf.tris, hz: session && session.frameRate ? Math.round(session.frameRate) : 0,
      gpuMs: (perf.gpuMs = gpu.take()), cpuMs: (perf.cpuMs = cpu.n ? (cpu.ms = cpu.sum / cpu.n, cpu.sum = cpu.n = 0, cpu.ms) : cpu.ms),
      msg: flashT > 0 ? flashText : '', msgColor: flashColor,
    });
    debugEl.style.display = wrist.showFps && !inVR ? 'block' : 'none';
    if (wrist.showFps) debugEl.textContent = `${perf.fps.toFixed(0)} FPS\ncalls ${perf.calls}  tris ${perf.tris}\npos ${player.head.x.toFixed(1)}, ${player.head.z.toFixed(1)}  h ${player.head.y.toFixed(2)}\npatrol ${patrol.state} ${patrol.x.toFixed(1)}, ${patrol.z.toFixed(1)}  alert ${alert.level} ${alert.suspicion.toFixed(0)}`;
  }
  start.tick(dt);
  keys.endFrame();
  cpu.sum += performance.now() - cpuStart; cpu.n++;
}

// ---------- start screen ----------
function syncStartScreen() {
  $('contract').value = contract.id;
  $('difficulty').value = difficulty;
  const b = bestStars(contract.id);
  $('contractinfo').textContent = `${contract.brief} ★ ${goalText(contract, loot.items)} · ★★ ${bonusText(contract)} · ★★★ на важкому. `
    + `Рекорди: ${['easy', 'medium', 'hard'].map((d) => `${CFG.difficulties[d].name} ${'★'.repeat(b[d] || 0)}${'☆'.repeat(3 - (b[d] || 0))}`).join(', ')}.`;
}
for (const c of CFG.contracts) $('contract').add(new Option(c.name, c.id));
$('contract').addEventListener('change', () => { if (round.phase === 'ready') setContract($('contract').value); else syncStartScreen(); });
$('difficulty').addEventListener('change', () => { if (round.phase === 'ready') setDifficulty($('difficulty').value); else syncStartScreen(); });
const start = setupStartScreen({
  mic,
  onMicOn: () => scream.start(),
  onChange: () => { boardDirty = true; },
  onPlay() {
    unlockAudio();
    playingDesktop = true;
    $('overlay').style.display = 'none';
    $('hint').style.display = 'block';
    $('crosshair').style.display = 'block';
    lockPointer();
    if (round.phase === 'escape') siren.set(true);
  },
});
syncStartScreen();
const vrButton = VRButton.createButton(renderer);
vrButton.id = 'vrbutton';
vrButton.addEventListener('click', () => unlockAudio(), true);
// phones: no "Enter VR" (Android may offer Cardboard) and no laptop play (it needs a mouse)
if (MODE.mode !== 'phone') $('buttons').appendChild(vrButton);
else {
  $('start').disabled = true;
  $('start').textContent = 'Керування з телефона — у наступній версії';
}
{
  const other = Object.keys(MODE_NAMES).filter((m) => m !== MODE.mode).map((m) => `<a href="?mode=${m}">${MODE_NAMES[m]}</a>`);
  if (!MODE.auto) other.push('<a href="?mode=auto">визначати автоматично</a>');
  $('modeline').innerHTML = `Режим: <b>${MODE_NAMES[MODE.mode]}</b> (${MODE.os && !MODE.os.startsWith(MODE.device) ? `${MODE.device}, ${MODE.os}` : MODE.os || MODE.device}${MODE.auto ? ', визначено автоматично' : `, вибрано вручну; автоматично було б «${MODE_NAMES[MODE.detected]}»`}). Інший режим: ${other.join(' · ')}.`
    + (MODE.mode === 'phone' ? '<br>Грати з телефона ще не можна: керування з\'явиться в наступній версії. Зараз тут можна дозволити мікрофон і пройти калібрування, а «Скопіювати звіт» внизу передасть дані про телефон.' : '');
}
prepareReport();
const reportText = () => buildReport({
  version: VERSION, mode: MODE, renderer, mic, audio: existingAudioContext(), frames: frameStats, perf,
  game: { phase: round.phase, contract: contract.id, difficulty, inVR, playing: playingDesktop, simSeconds: +simT.toFixed(1) },
});
$('report').addEventListener('click', () => copyReport(reportText()));

const vsel = $('vignette');
for (const l of VIGNETTE_LEVELS) vsel.add(new Option(l.label, l.id));
vsel.value = comfort.level.id;
vsel.addEventListener('change', () => comfort.setLevel(VIGNETTE_LEVELS.find((l) => l.id === vsel.value)));
$('snap').value = String(snapDeg);
$('snap').addEventListener('change', () => { snapDeg = +$('snap').value; saveSetting('snap', snapDeg); });

// Flashlight through walls: room mask by default. ?flash=nomask / shadow / off are for measuring the
// cost of the alternatives (shadow = one 256² shadow map for the flashlight only).
const flashMode = params.get('flash') || 'mask';
if (flashMode === 'mask') {
  const masked = maskScene(scene);
  maskBeam(patrol.beam.material);
  console.log(`flashlight room mask on ${masked} lit materials`);
} else if (flashMode === 'shadow') {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  patrol.spot.castShadow = true;
  patrol.spot.shadow.mapSize.set(256, 256);
  patrol.spot.shadow.camera.near = 0.2;
  patrol.spot.shadow.camera.far = 14;
  scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial) { o.castShadow = true; o.receiveShadow = true; } });
} else if (flashMode === 'off') patrol.spot.visible = false;

renderer.setAnimationLoop(frame);
if (params.has('autostart')) start.play();

// test / debugging hook: sim(seconds) runs the game logic with fixed 1/72 s steps (no rendering)
window.__game = {
  THREE, CFG, renderer, scene, camera, player, level, mic, comfort, xrIn, wrist, perf, VERSION, flash, goHome, useDoor, nearestDoor,
  loot, hands, noise, nav, alert, patrol, lurker, board, round, scream, breath, pointer, newRound, pressBoard, zone, flashUniforms,
  get speakT() { return speakT; }, get drags() { return drags; }, stealthState, setContract, setDifficulty,
  get verdict() { return verdict; }, get contract() { return contract; }, get difficulty() { return difficulty; }, get calib() { return calib; }, get calibNotes() { return calibNotes; },
  get inVR() { return inVR; }, get playing() { return playingDesktop; }, set playing(v) { playingDesktop = v; },
  MODE, frameStats, reportText,
  sim(seconds, dt = 1 / 72) { for (let t = 0; t < seconds; t += dt) simulate(dt, null, performance.now()); },
};
