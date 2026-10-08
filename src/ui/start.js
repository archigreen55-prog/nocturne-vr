// Start screen (2D, before Enter VR): microphone permission, calibration and a live level meter.
// Asking here matters: inside an immersive session the permission dialog may not be reachable.
import { LEVELS } from '../audio/mic.js';
import { runCalibration, verifyMic, stepsFor } from '../audio/calibrate.js';
import { deniedHelp, promptHelp, HOLD_TEXT, IOS_SOUND } from '../audio/micHelp.js';
import { bindPress } from './press.js';

const $ = (id) => document.getElementById(id);

// phone: the "Звуки гри" step, the check after the wizard, the sound test (plan-phone-mode §2.3);
// dev: the device (for the permission instructions); playGame: plays the sample of game sounds
export function setupStartScreen({ mic, onPlay, onMicOn, onChange, phone = false, dev = null, playGame = null }) {
  const micBtn = $('micbtn'), calBtn = $('calbtn'), state = $('micstate'), step = $('calstep');
  const startBtn = $('start');
  let calibrating = false, meterT = 0;
  const nSteps = stepsFor(phone).length, stepsWord = nSteps === 4 ? '4 кроки' : `${nSteps} кроків`;
  const ios = dev && (dev.device === 'iPhone' || dev.device === 'iPad');
  if (phone) $('michold').textContent = HOLD_TEXT;
  if (ios) { $('iosnote').textContent = IOS_SOUND; $('iosnote').hidden = false; }

  function showState() {
    const s = mic.state;
    micBtn.disabled = s === 'on' || s === 'pending' || mic.noMic;
    calBtn.disabled = s !== 'on' || calibrating || mic.noMic;
    $('nomic').checked = mic.noMic;
    micBtn.textContent = s === 'on' ? 'Мікрофон увімкнено' : 'Дозволити мікрофон';
    calBtn.textContent = mic.calibrated ? `Перекалібрувати (${stepsWord})` : `Калібрувати (${stepsWord})`;
    if (phone) $('verifybtn').disabled = s !== 'on' || calibrating || mic.noMic || !mic.calibrated;
    // permission help: refused -> where to allow it; not asked yet -> what the dialogs will be
    const help = mic.noMic ? '' : s === 'denied' || mic.permission === 'denied' ? deniedHelp(dev) : s !== 'on' && phone ? promptHelp(dev) : '';
    $('michelp').textContent = help;
    $('michelp').style.color = s === 'denied' || mic.permission === 'denied' ? '#ffb347' : '';
    // things to redo: another microphone / headphones, a calibration from before the "game sounds" step
    const notes = [];
    if (s === 'on' && mic.deviceChanged) notes.push('Змінився мікрофон або навушники — перекалібруй, щоб межі відповідали новому звуку.');
    if (phone && s === 'on' && mic.calibrated && !mic.bleedMeasured) notes.push('Калібрування зроблене без кроку «Звуки гри»: пройди його ще раз, щоб звуки гри з динаміка не рахувались як твій голос.');
    if (phone && s === 'on' && mic.agc) notes.push('Браузер не вимкнув автопідсилення мікрофона: межа крику за замовчуванням ближча до голосу. Калібрування з кроком «Крик» точніше.');
    if (s === 'on' && mic.problem) notes.push(mic.problem);
    $('micnote').textContent = notes.join(' ');
    if (mic.noMic) state.textContent = 'Гра без мікрофона: голос не рахується, контракт «Ні звуку» не зараховується.';
    else if (s === 'on') state.textContent = mic.calibrated ? `калібровано: тиша ${mic.cal.floor.toFixed(0)}, ${Number.isFinite(mic.cal.whisper) ? `шепіт ${mic.cal.whisper.toFixed(0)}, ` : ''}голос ${mic.cal.normal.toFixed(0)} дБ` : 'ще не калібровано — натисни «Калібрувати»';
    else if (s === 'denied') state.textContent = 'Дозвіл не надано.';
    else if (s === 'none') state.textContent = `Мікрофон недоступний: ${mic.error}`;
    else if (s === 'pending') state.textContent = 'Чекаю на дозвіл…';
    else state.textContent = 'Без дозволу гра працюватиме, але без головної механіки.';
    const z = (id, a, b, color) => { const e = $(id); e.style.left = a * 100 + '%'; e.style.width = (b - a) * 100 + '%'; e.style.background = color; };
    const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
    z('zq', 0, pw, '#1f3b2b'); z('zn', pw, ps, '#3f3a1c'); z('zs', ps, 1, '#4a1c1c');
    $('tw').style.left = pw * 100 + '%'; $('ts').style.left = ps * 100 + '%';
    $('shoutrow').style.display = s === 'on' && !mic.noMic ? 'block' : 'none';
    const shift = (v) => (v ? ` (зсув ${v > 0 ? '+' : '−'}${Math.abs(v)})` : '');
    $('whisperdb').textContent = `${mic.whisperDb.toFixed(0)} дБ${shift(mic.cal.adjW || 0)}`;
    $('shoutdb').textContent = `${mic.shoutDb.toFixed(0)} дБ${shift(mic.cal.adj || 0)}`;
    const [wlo, whi] = mic.adjustRange('adjW'), [slo, shi] = mic.adjustRange('adj');
    $('wdn').disabled = (mic.cal.adjW || 0) <= wlo; $('wup').disabled = (mic.cal.adjW || 0) >= whi;
    $('sdn').disabled = (mic.cal.adj || 0) <= slo; $('sup').disabled = (mic.cal.adj || 0) >= shi;
    $('adjreset').disabled = !mic.cal.adj && !mic.cal.adjW;
  }
  // ± 1 dB; at a limit the button greys out and the note says why (the sane limit or the end of the range)
  const note = (t) => { $('adjnote').textContent = t; };
  const WHY = {
    adjW: { down: 'Нижче не можна: твій шепіт став би «НОРМАЛЬНО».', up: 'Вище не можна: твій звичайний голос став би «ШЕПІТ», і гра його не чула б.', ui: [-10, 10] },
    adj: { down: 'Нижче не можна: межа крику має бути хоча б на 4 дБ вища за твій звичайний голос, інакше звичайна мова стане «КРИК!».', up: '', ui: [-12, 18] },
  };
  for (const [id, key, d] of [['wdn', 'adjW', -1], ['wup', 'adjW', 1], ['sdn', 'adj', -1], ['sup', 'adj', 1]]) {
    $(id).addEventListener('click', () => {
      mic.setAdjust(key, (mic.cal[key] || 0) + d);
      const v = mic.cal[key] || 0, [lo, hi] = mic.adjustRange(key), w = WHY[key];
      if (d < 0 && v <= lo) note(lo > w.ui[0] ? w.down : 'Це найбільший зсув униз.');
      else if (d > 0 && v >= hi) note(hi < w.ui[1] && w.up ? w.up : 'Це найбільший зсув угору.');
      else note('');
      showState(); if (onChange) onChange();
    });
  }
  if (mic.clampedOnLoad) note('Збережені зсуви робили межі безглуздими (звичайна мова була б «КРИК!» або шепіт — «НОРМАЛЬНО»), тому їх обмежено. «Скинути зсуви» поверне межі з калібрування.');
  $('adjreset').addEventListener('click', () => { mic.resetAdjust(); note('Зсуви скинуто: межі такі, як дало калібрування.'); showState(); if (onChange) onChange(); });
  $('nomic').addEventListener('change', () => { mic.setNoMic($('nomic').checked); showState(); if (onChange) onChange(); });

  bindPress(micBtn, async () => {
    showState();
    await mic.enable();
    showState();
    if (mic.state === 'on' && !mic.calibrated) step.textContent = 'Тепер натисни «Калібрувати».';
    if (mic.state === 'on' && onMicOn) {
      const rec = $('recstate');
      rec.textContent = 'Перевіряю запис для повтору крику…';
      const mode = await onMicOn();
      rec.textContent = mode === 'none'
        ? 'Запис для повтору крику не працює в цьому браузері (гра працює, але табло не програє крик).'
        : `Запис для повтору крику працює (${{ worklet: 'AudioWorklet', script: 'ScriptProcessor', recorder: 'MediaRecorder' }[mode] || mode}).`;
      rec.style.color = mode === 'none' ? '#ff9f43' : '#5fd38d';
    }
  });

  bindPress(calBtn, async () => {
    if (calibrating || mic.state !== 'on') return;
    calibrating = true; showState();
    $('verifyres').textContent = '';
    const res = await runCalibration(mic, ({ i, step: st, phase, left, total }) => {
      step.textContent = phase === 'prep'
        ? `${i + 1}/${total} ${st.title}: приготуйся… ${left.toFixed(1)} с`
        : `${i + 1}/${total} ${st.title.toUpperCase()}: ${st.say} — ${left.toFixed(1)} с`;
    }, { phone, playGame });
    calibrating = false;
    if (res.ok) { mic.setCalibration(res.cal); step.textContent = 'Готово. ' + res.notes.join(' ') + (phone ? ' Тепер натисни «Перевірити: шепіт, голос, крик».' : ' Перевір: шепни, скажи звичайно, крикни.'); }
    else step.textContent = res.notes.join(' ');
    showState();
    if (onChange) onChange();
  });

  // phone: the check after the wizard (three phrases, the game says what it heard) and a sound test
  if (phone) {
    bindPress($('verifybtn'), async () => {
      if (calibrating || mic.state !== 'on') return;
      calibrating = true; showState();
      const LBL = { quiet: 'ШЕПІТ', normal: 'НОРМАЛЬНО', shout: 'КРИК!' };
      const res = await verifyMic(mic, ({ i, check, phase, left, total, level }) => {
        step.textContent = phase === 'prep' ? `Перевірка ${i + 1}/${total}: ${check.title}… ${left.toFixed(1)} с`
          : `Перевірка ${i + 1}/${total}: ${check.say} — ${left.toFixed(1)} с · чую: ${LBL[level]}`;
      });
      calibrating = false;
      step.textContent = '';
      const line = (r) => `${{ quiet: 'Шепіт', normal: 'Голос', shout: 'Крик' }[r.id]}: ${r.skipped ? 'пропущено' : `${LBL[r.got]} ${r.ok ? '✓' : '✗'}`}`;
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
  startBtn.textContent = 'Грати на ПК';
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
      $('level').textContent = on ? `${lv.label} ${mic.env.toFixed(0)} дБ` : '';
      $('level').style.color = lv.color;
    },
  };
}
