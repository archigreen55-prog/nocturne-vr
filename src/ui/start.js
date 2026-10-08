// Start screen (2D, before Enter VR): microphone permission, calibration and a live level meter.
// Asking here matters: inside an immersive session the permission dialog may not be reachable.
import { LEVELS } from '../audio/mic.js';
import { runCalibration, verifyMic, stepsFor } from '../audio/calibrate.js';
import { deniedHelp, promptHelp, HOLD_TEXT, IOS_SOUND } from '../audio/micHelp.js';
import { bindPress } from './press.js';
import { S } from '../i18n/index.js';

const $ = (id) => document.getElementById(id);

// phone: the "Звуки гри" step, the check after the wizard, the sound test (plan-phone-mode §2.3);
// dev: the device (for the permission instructions); playGame: plays the sample of game sounds
export function setupStartScreen({ mic, onPlay, onMicOn, onChange, phone = false, dev = null, playGame = null }) {
  const micBtn = $('micbtn'), calBtn = $('calbtn'), state = $('micstate'), step = $('calstep');
  const startBtn = $('start');
  let calibrating = false, meterT = 0;
  const nSteps = stepsFor(phone).length, stepsWord = S.start.steps(nSteps);
  const ios = dev && (dev.device === 'iPhone' || dev.device === 'iPad');
  if (phone) $('michold').textContent = HOLD_TEXT;
  if (ios) { $('iosnote').textContent = IOS_SOUND; $('iosnote').hidden = false; }

  function showState() {
    const s = mic.state;
    micBtn.disabled = s === 'on' || s === 'pending' || mic.noMic;
    calBtn.disabled = s !== 'on' || calibrating || mic.noMic;
    $('nomic').checked = mic.noMic;
    micBtn.textContent = s === 'on' ? S.start.micOn : S.start.allowMic;
    calBtn.textContent = mic.calibrated ? S.start.recalibrate(stepsWord) : S.start.calibrate(stepsWord);
    if (phone) $('verifybtn').disabled = s !== 'on' || calibrating || mic.noMic || !mic.calibrated;
    // permission help: refused -> where to allow it; not asked yet -> what the dialogs will be
    const help = mic.noMic ? '' : s === 'denied' || mic.permission === 'denied' ? deniedHelp(dev) : s !== 'on' && phone ? promptHelp(dev) : '';
    $('michelp').textContent = help;
    $('michelp').style.color = s === 'denied' || mic.permission === 'denied' ? '#ffb347' : '';
    // things to redo: another microphone / headphones, a calibration from before the "game sounds" step
    const notes = [];
    if (s === 'on' && mic.deviceChanged) notes.push(S.start.note.deviceChanged);
    if (phone && s === 'on' && mic.calibrated && !mic.bleedMeasured) notes.push(S.start.note.noGameStep);
    if (phone && s === 'on' && mic.agc) notes.push(S.start.note.agc);
    if (s === 'on' && mic.problem) notes.push(mic.problem);
    $('micnote').textContent = notes.join(' ');
    if (mic.noMic) state.textContent = S.start.state.noMic;
    else if (s === 'on') state.textContent = mic.calibrated ? S.start.state.calibrated(mic.cal.floor.toFixed(0), Number.isFinite(mic.cal.whisper) ? mic.cal.whisper.toFixed(0) : null, mic.cal.normal.toFixed(0)) : S.start.state.notCalibrated;
    else if (s === 'denied') state.textContent = S.start.state.denied;
    else if (s === 'none') state.textContent = S.start.state.none(mic.error);
    else if (s === 'pending') state.textContent = S.start.state.pending;
    else state.textContent = S.start.state.ask;
    const z = (id, a, b, color) => { const e = $(id); e.style.left = a * 100 + '%'; e.style.width = (b - a) * 100 + '%'; e.style.background = color; };
    const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
    z('zq', 0, pw, '#1f3b2b'); z('zn', pw, ps, '#3f3a1c'); z('zs', ps, 1, '#4a1c1c');
    $('tw').style.left = pw * 100 + '%'; $('ts').style.left = ps * 100 + '%';
    $('shoutrow').style.display = s === 'on' && !mic.noMic ? 'block' : 'none';
    const shift = (v) => (v ? S.start.shift(v > 0 ? '+' : '−', Math.abs(v)) : '');
    $('whisperdb').textContent = S.start.db(mic.whisperDb.toFixed(0), shift(mic.cal.adjW || 0));
    $('shoutdb').textContent = S.start.db(mic.shoutDb.toFixed(0), shift(mic.cal.adj || 0));
    const [wlo, whi] = mic.adjustRange('adjW'), [slo, shi] = mic.adjustRange('adj');
    $('wdn').disabled = (mic.cal.adjW || 0) <= wlo; $('wup').disabled = (mic.cal.adjW || 0) >= whi;
    $('sdn').disabled = (mic.cal.adj || 0) <= slo; $('sup').disabled = (mic.cal.adj || 0) >= shi;
    $('adjreset').disabled = !mic.cal.adj && !mic.cal.adjW;
  }
  // ± 1 dB; at a limit the button greys out and the note says why (the sane limit or the end of the range)
  const note = (t) => { $('adjnote').textContent = t; };
  const WHY = {
    adjW: { down: S.start.limit.whisperDown, up: S.start.limit.whisperUp, ui: [-10, 10] },
    adj: { down: S.start.limit.shoutDown, up: '', ui: [-12, 18] },
  };
  for (const [id, key, d] of [['wdn', 'adjW', -1], ['wup', 'adjW', 1], ['sdn', 'adj', -1], ['sup', 'adj', 1]]) {
    $(id).addEventListener('click', () => {
      mic.setAdjust(key, (mic.cal[key] || 0) + d);
      const v = mic.cal[key] || 0, [lo, hi] = mic.adjustRange(key), w = WHY[key];
      if (d < 0 && v <= lo) note(lo > w.ui[0] ? w.down : S.start.limit.minShift);
      else if (d > 0 && v >= hi) note(hi < w.ui[1] && w.up ? w.up : S.start.limit.maxShift);
      else note('');
      showState(); if (onChange) onChange();
    });
  }
  if (mic.clampedOnLoad) note(S.start.limit.clamped);
  $('adjreset').addEventListener('click', () => { mic.resetAdjust(); note(S.start.limit.reset); showState(); if (onChange) onChange(); });
  $('nomic').addEventListener('change', () => { mic.setNoMic($('nomic').checked); showState(); if (onChange) onChange(); });

  bindPress(micBtn, async () => {
    showState();
    await mic.enable();
    showState();
    if (mic.state === 'on' && !mic.calibrated) step.textContent = S.start.pressCalibrate;
    if (mic.state === 'on' && onMicOn) {
      const rec = $('recstate');
      rec.textContent = S.start.rec.checking;
      const mode = await onMicOn();
      rec.textContent = mode === 'none'
        ? S.start.rec.none
        : S.start.rec.works({ worklet: 'AudioWorklet', script: 'ScriptProcessor', recorder: 'MediaRecorder' }[mode] || mode);
      rec.style.color = mode === 'none' ? '#ff9f43' : '#5fd38d';
    }
  });

  bindPress(calBtn, async () => {
    if (calibrating || mic.state !== 'on') return;
    calibrating = true; showState();
    $('verifyres').textContent = '';
    const res = await runCalibration(mic, ({ i, step: st, phase, left, total }) => {
      step.textContent = phase === 'prep'
        ? S.start.cal.prep(i + 1, total, st.title, left.toFixed(1))
        : S.start.cal.rec(i + 1, total, st.title.toUpperCase(), st.say, left.toFixed(1));
    }, { phone, playGame });
    calibrating = false;
    if (res.ok) { mic.setCalibration(res.cal); step.textContent = S.calib.done + res.notes.join(' ') + (phone ? S.start.cal.nextPhone : S.start.cal.nextPc); }
    else step.textContent = res.notes.join(' ');
    showState();
    if (onChange) onChange();
  });

  // phone: the check after the wizard (three phrases, the game says what it heard) and a sound test
  if (phone) {
    bindPress($('verifybtn'), async () => {
      if (calibrating || mic.state !== 'on') return;
      calibrating = true; showState();
      const LBL = { quiet: S.mic.level.quiet, normal: S.mic.level.normal, shout: S.mic.level.shout };
      const res = await verifyMic(mic, ({ i, check, phase, left, total, level }) => {
        step.textContent = phase === 'prep' ? S.start.verify.prep(i + 1, total, check.title, left.toFixed(1))
          : S.start.verify.rec(i + 1, total, check.say, left.toFixed(1), LBL[level]);
      });
      calibrating = false;
      step.textContent = '';
      const line = (r) => S.start.verify.line({ quiet: S.start.verify.quiet, normal: S.start.verify.normal, shout: S.start.verify.shout }[r.id], r.skipped, LBL[r.got], r.ok);
      $('verifyres').textContent = `${res.results.map(line).join(' · ')}. ${res.notes.join(' ')}`;
      $('verifyres').style.color = res.results.every((r) => r.ok) ? '#5fd38d' : '#ffb347';
      showState();
    });
    bindPress($('soundtest'), () => { if (playGame) playGame(); });
  }
  mic.onChange = () => { showState(); if (onChange) onChange(); };

  const play = () => { if (!startBtn.disabled) onPlay(); };
  startBtn.addEventListener('click', play);
  startBtn.disabled = false;
  startBtn.textContent = S.start.playPc;
  showState();

  return {
    play,
    refresh: showState,
    // live meter while the start screen is visible (~15 Hz)
    tick(dt) {
      meterT -= dt;
      if (meterT > 0 || $('overlay').style.display === 'none') return;
      meterT = 1 / 15;
      const lv = LEVELS[mic.level];
      const on = mic.state === 'on';
      $('fill').style.width = on ? mic.barPos(mic.env) * 100 + '%' : '0';
      $('fill').style.background = lv.color;
      $('level').textContent = on ? S.start.level(lv.label, mic.env.toFixed(0)) : '';
      $('level').style.color = lv.color;
    },
  };
}
