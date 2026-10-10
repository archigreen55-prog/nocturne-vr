// The start screen: contract and difficulty, the microphone, "Грати" / Enter VR, the mode line, the
// report, the vignette and snap-turn settings; the phone's service worker and install. Frame: its
// microphone meter.
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { VERSION } from '../version.js';
import { CFG } from '../config/index.js';
import { saveSetting, PREVIEW } from '../settings.js';
import { refineAndroid, MODE_NAMES } from '../platform/mode.js';
import { enterPhonePlay, screenState } from '../platform/screen.js';
import { setupPwa, pwaState } from '../platform/pwa.js';
import { VIGNETTE_LEVELS } from '../comfort/vignette.js';
import { setupStartScreen } from '../ui/start.js';
import { unlockAudio, existingAudioContext, audioSessionState } from '../audio/audio.js';
import { goalText, bonusText, bestStars } from '../game/contracts.js';
import { prepareReport, buildReport, copyReport, deviceData } from '../debug/report.js';
import { G, $ } from './state.js';
import { flash } from './messages.js';
import { playGame, phoneLayout } from './flatScreen.js';
import { optVal, pauseLog } from './phone.js';
import { lockPointer } from './desktop.js';
import { setContract, setDifficulty, goHome, newRound } from './contract.js';
import { S } from '../i18n/index.js';

export function syncStartScreen() {
  const { contract, difficulty } = G;
  $('contract').value = contract.id;
  $('difficulty').value = difficulty;
  const b = bestStars(contract.id);
  $('contractinfo').textContent = S.start.contractInfo(contract.brief, goalText(contract, G.loot.items), bonusText(contract),
    ['easy', 'medium', 'hard'].map((d) => `${CFG.difficulties[d].name} ${'★'.repeat(b[d] || 0)}${'☆'.repeat(3 - (b[d] || 0))}`).join(', '));
}
function showMode() {
  const MODE = G.MODE;
  const other = Object.keys(MODE_NAMES).filter((m) => m !== MODE.mode).map((m) => `<a href="?mode=${m}">${MODE_NAMES[m]}</a>`);
  if (!MODE.auto) other.push(S.start.modeAuto);
  $('modeline').innerHTML = S.start.modeLine(MODE_NAMES[MODE.mode], MODE.os && !MODE.os.startsWith(MODE.device) ? `${MODE.device}, ${MODE.os}` : MODE.os || MODE.device, MODE.auto, MODE_NAMES[MODE.detected], other.join(' · '), MODE.mode === 'phone');
}
export const reportText = () => {
  const { touch, renderer, mic, frameStats, perf, round, quality, gyro, battery } = G;
  return buildReport({
    version: VERSION, mode: G.MODE, renderer, mic, audio: existingAudioContext(), frames: frameStats, perf,
    game: { phase: round.phase, contract: G.contract.id, difficulty: G.difficulty, inVR: G.inVR, playing: G.playingDesktop, simSeconds: +G.simT.toFixed(1),
      run: G.runStats && { ...G.runStats, vrRun: G.vrRun } },   // running: starts, short (< 0.4 s: accidental?), auto-runs, out of breath, doors
    screen: touch ? {
      ...screenState(), lookSpeed: optVal.look, breathMode: optVal.breath, hud: optVal.hud, paused: G.paused, pauses: pauseLog.slice(-10),
      feedback: G.feedback.state(), audioState: existingAudioContext() ? existingAudioContext().state : 'not started', audioSession: audioSessionState(),
      quality: quality.state(), gyro: { setting: optVal.gyro, state: gyro.state, events: gyro.events }, battery: { ...battery }, pwa: pwaState(), boardDraws: perf.boardDraws || 0,
    } : undefined,
  });
};

export const startScreen = {
  id: 'startScreen',
  init() {
    const { touch, mic, scream, renderer, round, comfort, gyro } = G;
    for (const c of CFG.contracts) $('contract').add(new Option(c.name, c.id));
    $('contract').addEventListener('change', () => { if (round.phase === 'ready') setContract($('contract').value); else syncStartScreen(); });
    $('difficulty').addEventListener('change', () => { if (round.phase === 'ready') setDifficulty($('difficulty').value); else syncStartScreen(); });
    const start = G.start = setupStartScreen({
      mic, phone: !!touch, dev: G.MODE, playGame,
      onMicOn: () => scream.start(),
      onChange: () => { G.boardDirty = true; },
      onPlay() {
        unlockAudio();
        G.playingDesktop = true;
        $('overlay').style.display = 'none';
        $('crosshair').style.display = 'block';
        if (touch) {
          G.paused = false; G.menu.close();
          touch.reset();
          $('touch').hidden = false;
          G.hud.show(true);
          document.body.classList.add('phone-playing');
          enterPhonePlay();
          G.graceUntil = performance.now() + 2500;   // entering full screen may blur the page for a moment
          G.gyroReady = true; gyro.look.x = gyro.look.y = 0;
          if (optVal.gyro === 'on' && !gyro.on) gyro.enable().then(() => G.menu.refresh());
          phoneLayout();
        } else {
          $('hint').style.display = 'block';
          lockPointer();
        }
        if (round.phase === 'escape') G.siren.set(true);
      },
    });
    syncStartScreen();
    // microphone changes (permission, a stream re-opened, headphones in / out): besides the start screen
    {
      const startChange = mic.onChange;
      let devSeen = 0;
      mic.onChange = () => {
        startChange();
        if (G.menu) G.menu.refresh();
        if (touch && mic.events.deviceChanges > devSeen) {
          devSeen = mic.events.deviceChanges;
          if (G.playingDesktop) flash(S.messages.micDeviceChanged, 5, '#ffb347');
        }
      };
    }
    const vrButton = VRButton.createButton(renderer);
    vrButton.id = 'vrbutton';
    vrButton.addEventListener('click', () => unlockAudio(), true);
    // phones: no "Enter VR" (Android may offer Cardboard) and no laptop play (it needs a mouse)
    if (G.MODE.mode !== 'phone') $('buttons').appendChild(vrButton);
    else {
      $('start').textContent = S.start.play;
      // the settings (look speed, breath, HUD, vibration) are wired with the pause menu (systems/phone.js)
      $('phonehome').addEventListener('click', () => { goHome(); start.play(); });
      $('phonenew').addEventListener('click', () => { newRound(); start.play(); });
    }
    showMode();
    // phone: the service worker (offline, updates) and installing to the home screen (src/platform/pwa.js)
    if (G.PHONE) setupPwa({ phone: true, ios: G.IOS, preview: PREVIEW });
    prepareReport().then(() => { G.MODE = refineAndroid(G.MODE, deviceData()); showMode(); });
    $('report').addEventListener('click', () => copyReport(reportText()));

    const vsel = $('vignette');
    for (const l of VIGNETTE_LEVELS) vsel.add(new Option(l.label, l.id));
    vsel.value = comfort.level.id;
    vsel.addEventListener('change', () => comfort.setLevel(VIGNETTE_LEVELS.find((l) => l.id === vsel.value)));
    $('snap').value = String(G.snapDeg);
    $('snap').addEventListener('change', () => { G.snapDeg = +$('snap').value; saveSetting('snap', G.snapDeg); });
  },
  frame(dt) { G.start.tick(dt); },
};
