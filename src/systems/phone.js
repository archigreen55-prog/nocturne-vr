// Phone: the pause (menu, minimised page, call), the settings, vibration / edge flashes, the round
// summary screen. Frame: the summary screen replaces the floating result board.
import { CFG } from '../config/index.js';
import { saveSetting, loadSetting } from '../settings.js';
import { LOOK_SPEEDS } from '../input/touch.js';
import { ensureFullscreen, holdScreen } from '../platform/screen.js';
import { Feedback } from '../platform/feedback.js';
import { PauseMenu } from '../ui/menu.js';
import { Summary } from '../ui/summary.js';
import { bindPress } from '../ui/press.js';
import { unlockAudio, setAudioStateHook, setPanning, suspendAudio } from '../audio/audio.js';
import { DIFFS } from '../game/difficulty.js';
import { goalText, bonusText } from '../game/contracts.js';
import { PRESETS } from '../perf/quality.js';
import { copyReport } from '../debug/report.js';
import { G, $ } from './state.js';
import { flash } from './messages.js';
import { phoneLayout } from './flatScreen.js';
import { pause2D } from './desktop.js';
import { newRound, setContract, setDifficulty, pressBoard, goHome } from './contract.js';
import { reportText } from './startScreen.js';
import { restartTutorial } from './tutorial.js';
import { openProgress } from './progressCode.js';
import { brightnessStep, toggleOutdoor, brightnessLabel, outdoorLabel } from './brightness.js';
import { shopRows, buyUpgrade, lockText, incomeText } from './economy.js';
import { wallet } from '../game/economy.js';
import { money } from '../ui/board.js';
import { S } from '../i18n/index.js';

export const pauseLog = [];                 // for the report: { reason, t (s of game time) }
export const optVal = {};
export let OPTS = null;

export function setOpt(key, v) {
  const o = OPTS[key];
  if (!o.values.includes(v)) v = o.def;
  optVal[key] = v; saveSetting(o.save, v); o.apply(v);
  const el = $(o.id);
  if (el.tagName === 'BUTTON') el.textContent = optLabel(key); else el.value = v;
}
export const optLabel = (key) => {
  const o = OPTS[key], v = optVal[key];
  if (key === 'fx' && v === 'auto') return `${o.title}: ${G.feedback.canVibrate ? S.settings.fx.vibrationNow : S.settings.fx.flashNow}`;
  if (key === 'quality' && v === 'auto') return `${o.title}: ${S.settings.quality.autoNow(PRESETS[G.quality.preset].name)}`;
  if (key === 'gyro' && v === 'on' && G.gyro.state !== 'on' && G.gyro.state !== 'off') return `${o.title}: ${G.gyro.state === 'denied' ? S.settings.gyro.denied : S.settings.gyro.none}`;
  return `${o.title}: ${o.names[v]}`;
};
export function pauseOpen(reason = 'user') {
  const { touch, menu } = G;
  if (!touch || !G.playingDesktop || G.inVR) return;
  if (G.paused) { if (reason !== 'user') menu.reason = reason; return; }
  G.paused = true;
  if (reason !== 'user') pauseLog.push({ reason, t: +G.simT.toFixed(1) });
  touch.reset();
  if (G.holdDoor) { G.holdDoor.release(); G.holdDoor = null; }
  suspendAudio();          // the whole mix: siren, creaks, the guard's kettle
  holdScreen(false);       // a paused phone may go to sleep
  menu.open(reason);
}
export function pauseResume() {
  const { touch, menu, gyro, mic } = G;
  if (!G.paused) return;
  G.paused = false;
  menu.close();
  touch.reset();
  unlockAudio();           // wake the mix after the pause / call (also after iPhone 'interrupted')
  holdScreen(true);
  ensureFullscreen();
  G.graceUntil = performance.now() + 2000;
  G.last = performance.now();
  gyro.look.x = gyro.look.y = 0;   // the phone may have been turned while paused
  phoneLayout();
  // the microphone after a call / a minimised page: re-opened right inside this tap if the system
  // stopped it (iPhone allows that only from a user gesture); muted = still held by the system
  mic.recover().then((r) => {
    if (r === 'reacquired') flash(S.messages.micBack, 2.5, '#5fd38d');
    else if (r === 'failed') flash(S.messages.micFailed, 6, '#ff9f43');
    else if (r === 'muted') flash(S.messages.micBusy, 4, '#ffb347');
  });
}
function pauseAuto(reason) { if (G.touch && G.playingDesktop && !G.inVR && !G.paused) pauseOpen(reason); }
export const summaryState = () => ({
  result: G.round.result, verdict: G.verdict, contractName: G.contract.name, difficulty: G.difficulty, bonusText: bonusText(G.contract),
  clip: G.scream.best, playing: !!G.scream.playing, recMode: G.scream.modeName, noMic: G.mic.noMic, income: incomeText(),
});
// phone: the board button under the crosshair (decision A + B: tap the board or aim and press «Натиснути»)
export const boardAim = () => (G.touch && G.playingDesktop && G.caughtT < 0 && !G.paused && !(G.summary && G.summary.isOpen) ? G.pointer.hover.desk : null);

export const phone = {
  id: 'phone',
  init() {
    const { touch, hud, quality, gyro, mic, round, loot } = G;
    G.paused = false; G.lastRender = 0; G.graceUntil = 0;
    OPTS = touch ? {
      look: { id: 'lookspeed', save: 'lookSpeed', def: 'normal', values: ['slow', 'normal', 'fast'], title: S.settings.look.title, names: { slow: S.settings.look.slow, normal: S.settings.look.normal, fast: S.settings.look.fast }, apply: (v) => { touch.lookSpeed = LOOK_SPEEDS[v]; } },
      breath: { id: 'breathmode', save: 'breathMode', def: 'hold', values: ['hold', 'toggle'], title: S.settings.breath.title, names: { hold: S.settings.breath.hold, toggle: S.settings.breath.toggle }, apply: (v) => { touch.breathToggle = v === 'toggle'; } },
      hud: { id: 'hudmode', save: 'hudMode', def: 'full', values: ['full', 'min'], title: S.settings.hud.title, names: { full: S.settings.hud.full, min: S.settings.hud.min }, apply: (v) => hud.setMinimal(v === 'min') },
      fx: { id: 'feedback', save: 'feedback', def: 'auto', values: ['auto', 'flash', 'off'], title: S.settings.fx.title, names: { auto: S.settings.fx.auto, flash: S.settings.fx.flash, off: S.settings.fx.off }, apply: (v) => { G.feedback.mode = v; } },
      // T4: quality preset, frame cap, gyroscope
      quality: { id: 'quality', save: 'quality', def: 'auto', values: ['auto', 'low', 'medium', 'high'], title: S.settings.quality.title, names: { auto: S.settings.quality.auto, low: S.quality.low, medium: S.quality.medium, high: S.quality.high },
        apply: (v) => { quality.setSetting(v); setPanning(quality.p.panning); $('qualitynote').textContent = quality.needsReload ? S.settings.quality.aaReload : ''; } },
      fps: { id: 'fpscap', save: 'fpsCap', def: '60', values: ['60', '30'], title: S.settings.fps.title, names: { 60: S.settings.fps.fps60, 30: S.settings.fps.fps30 }, apply: (v) => quality.setCap(+v) },
      gyro: { id: 'gyrobtn', save: 'gyro', def: 'off', values: ['off', 'on'], title: S.settings.gyro.title, names: { off: S.settings.gyro.off, on: S.settings.gyro.on },
        apply: (v) => { if (v === 'off') gyro.disable(); else if (G.gyroReady) gyro.enable().then(() => { if (G.menu) G.menu.refresh(); G.start.refresh(); $('gyrobtn').textContent = optLabel('gyro'); }); } },
    } : null;
    G.gyroReady = false;   // the saved "on" is applied with the first tap (iPhone asks for the motion permission only from a tap)
    const menu = G.menu = touch ? new PauseMenu($('pausemenu'), {
      info: () => ({
        contractName: G.contract.name, diffName: CFG.difficulties[G.difficulty].name, phase: round.phase, clock: round.clock, vanSum: loot.tally().sum,
        canChange: round.phase === 'ready', brief: G.contract.brief, goalText: goalText(G.contract, loot.items), bonusText: bonusText(G.contract),
        micText: S.menu.micText(mic), lock: lockText(G.contract),
      }),
      shopRows, buy: (id) => buyUpgrade(id), walletText: () => S.shop.wallet(money(wallet().cash)),
      label: optLabel,
      cycle: (key) => { G.gyroReady = true; const o = OPTS[key]; setOpt(key, o.values[(o.values.indexOf(optVal[key]) + 1) % o.values.length]); },
      resume: pauseResume,
      home: () => { goHome(); pauseResume(); },
      newRound: () => { newRound(); pauseResume(); },
      toStart: () => { G.paused = false; menu.close(); unlockAudio(); pause2D(); },
      toMic: () => { G.paused = false; menu.close(); unlockAudio(); pause2D(); setTimeout(() => $('micbox').scrollIntoView({ block: 'start' }), 50); },
      report: () => copyReport(reportText()),
      contractStep: (d) => { const all = CFG.contracts, i = all.indexOf(G.contract); setContract(all[(i + d + all.length) % all.length].id); },
      difficultyNext: () => setDifficulty(DIFFS[(DIFFS.indexOf(G.difficulty) + 1) % DIFFS.length]),
      tutorial: () => { restartTutorial(); pauseResume(); },
      toProgress: () => { G.paused = false; menu.close(); unlockAudio(); pause2D(); openProgress(); },
      privacy: () => window.open('privacy.html', '_blank', 'noopener'),
      bright: (d) => brightnessStep(d), brightLabel: brightnessLabel, outdoor: () => toggleOutdoor(), outdoorLabel,
    }) : null;
    G.summary = touch ? new Summary($('summary'), {
      play: () => pressBoard('play'),
      again: () => pressBoard('again'),
      menu: () => pauseOpen('user'),
      report: () => copyReport(reportText()),
    }) : null;
    if (touch) {
      const feedback = G.feedback = new Feedback($('edgeflash'));
      feedback.enabled = () => !G.paused && G.playingDesktop && document.visibilityState === 'visible';
      for (const key of Object.keys(OPTS)) {
        const o = OPTS[key];
        setOpt(key, loadSetting(o.save, o.def));
        if ($(o.id).tagName === 'BUTTON') bindPress($(o.id), () => { G.gyroReady = true; setOpt(key, o.values[(o.values.indexOf(optVal[key]) + 1) % o.values.length]); menu.refresh(); });
        else $(o.id).addEventListener('change', () => { setOpt(key, $(o.id).value); menu.refresh(); });
      }
      // the page minimised, a call or a notification: the game waits behind the menu
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pauseAuto('hidden'); });
      addEventListener('pagehide', () => pauseAuto('hidden'));
      addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus() && performance.now() > G.graceUntil) pauseAuto('blur'); }, 250));
      // the system took the audio away (iPhone 'interrupted', Android 'suspended' during a call)
      setAudioStateHook((state) => { if (state !== 'running') pauseAuto('audio'); });
    }
    G.holdDoor = null;
  },
  // phone: the summary screen replaces the floating result board
  frame() { if (G.summary) G.board.mesh.visible = !G.summary.isOpen; },
};
