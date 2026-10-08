// Test / debugging hook: window.__game. sim(seconds) runs the game logic with fixed 1/72 s steps
// (no rendering). The tests rely on these names.
import * as THREE from 'three';
import { VERSION } from '../version.js';
import { CFG } from '../config/index.js';
import { existingAudioContext } from '../audio/audio.js';
import { flashUniforms } from '../enemies/flashMask.js';
import { stealthState } from '../game/stealth.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { goHome, newRound, pressBoard, setContract, setDifficulty, caught } from './contract.js';
import { useDoor, nearestDoor } from './doors.js';
import { reportText } from './startScreen.js';
import { pause2D } from './desktop.js';
import { rotateBlocked, playGame } from './flatScreen.js';
import { pauseOpen, pauseResume } from './phone.js';

export function exposeDebugApi(simulate) {
  const g = G;
  window.__game = {
    THREE, CFG, renderer: g.renderer, scene: g.scene, camera: g.camera, player: g.player, level: g.level, mic: g.mic, comfort: g.comfort, xrIn: g.xrIn, wrist: g.wrist, perf: g.perf, VERSION, flash, goHome, useDoor, nearestDoor,
    loot: g.loot, hands: g.hands, noise: g.noise, nav: g.nav, alert: g.alert, patrol: g.patrol, lurker: g.lurker, board: g.board, round: g.round, scream: g.scream, breath: g.breath, pointer: g.pointer, newRound, pressBoard, zone: g.zone, flashUniforms,
    get speakT() { return g.speakT; }, get drags() { return g.drags; }, stealthState, setContract, setDifficulty,
    get verdict() { return g.verdict; }, get contract() { return g.contract; }, get difficulty() { return g.difficulty; }, get calib() { return g.calib; }, get calibNotes() { return g.calibNotes; },
    get inVR() { return g.inVR; }, get playing() { return g.playingDesktop; }, set playing(v) { g.playingDesktop = v; },
    get MODE() { return g.MODE; }, frameStats: g.frameStats, reportText, touch: g.touch, pause2D, rotateBlocked, hud: g.hud, menu: g.menu, summary: g.summary, feedback: g.feedback, pauseOpen, pauseResume, get paused() { return g.paused; }, get audio() { return existingAudioContext(); }, playGame, siren: g.siren, start: g.start, quality: g.quality, gyro: g.gyro, points: g.points, get simT() { return g.simT; }, caught, get caughtT() { return g.caughtT; },
    sim(seconds, dt = 1 / 72) { for (let t = 0; t < seconds; t += dt) simulate(dt, null, performance.now()); },
  };
}
