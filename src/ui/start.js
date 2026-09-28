// Start screen (2D, before Enter VR): microphone permission, calibration and a live level meter.
// Asking here matters: inside an immersive session the permission dialog may not be reachable.
import { LEVELS } from '../audio/mic.js';
import { runCalibration } from '../audio/calibrate.js';

const $ = (id) => document.getElementById(id);

export function setupStartScreen({ mic, onPlay, onMicOn, onChange }) {
  const micBtn = $('micbtn'), calBtn = $('calbtn'), state = $('micstate'), step = $('calstep');
  const startBtn = $('start');
  let calibrating = false, meterT = 0;

  function showState() {
    const s = mic.state;
    micBtn.disabled = s === 'on' || s === 'pending' || mic.noMic;
    calBtn.disabled = s !== 'on' || calibrating || mic.noMic;
    $('nomic').checked = mic.noMic;
    micBtn.textContent = s === 'on' ? 'Мікрофон увімкнено' : 'Дозволити мікрофон';
    calBtn.textContent = mic.calibrated ? 'Перекалібрувати (4 кроки)' : 'Калібрувати (4 кроки)';
    if (mic.noMic) state.textContent = 'Гра без мікрофона: голос не рахується, контракт «Ні звуку» не зараховується.';
    else if (s === 'on') state.textContent = mic.calibrated ? `калібровано: тиша ${mic.cal.floor.toFixed(0)}, ${Number.isFinite(mic.cal.whisper) ? `шепіт ${mic.cal.whisper.toFixed(0)}, ` : ''}голос ${mic.cal.normal.toFixed(0)} дБ` : 'ще не калібровано — натисни «Калібрувати»';
    else if (s === 'denied') state.textContent = 'Дозвіл не надано. Можна грати без мікрофона (галочка). Дозвіл змінюється в налаштуваннях сайту браузера.';
    else if (s === 'none') state.textContent = `Мікрофон недоступний: ${mic.error}`;
    else if (s === 'pending') state.textContent = 'Чекаю на дозвіл…';
    else state.textContent = 'Без дозволу гра працюватиме, але без головної механіки.';
    const z = (id, a, b, color) => { const e = $(id); e.style.left = a * 100 + '%'; e.style.width = (b - a) * 100 + '%'; e.style.background = color; };
    const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
    z('zq', 0, pw, '#1f3b2b'); z('zn', pw, ps, '#3f3a1c'); z('zs', ps, 1, '#4a1c1c');
    $('tw').style.left = pw * 100 + '%'; $('ts').style.left = ps * 100 + '%';
    $('shoutrow').style.display = s === 'on' && !mic.noMic ? 'block' : 'none';
    $('whisperdb').textContent = `${mic.whisperDb.toFixed(0)} дБ`;
    $('shoutdb').textContent = `${mic.shoutDb.toFixed(0)} дБ`;
    $('adjw').value = mic.cal.adjW || 0;
    $('adjs').value = mic.cal.adj || 0;
  }
  $('adjw').addEventListener('input', () => { mic.setAdjust('adjW', +$('adjw').value); showState(); });
  $('adjs').addEventListener('input', () => { mic.setAdjust('adj', +$('adjs').value); showState(); });
  $('nomic').addEventListener('change', () => { mic.setNoMic($('nomic').checked); showState(); if (onChange) onChange(); });

  micBtn.addEventListener('click', async () => {
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

  calBtn.addEventListener('click', async () => {
    if (calibrating || mic.state !== 'on') return;
    calibrating = true; showState();
    const res = await runCalibration(mic, ({ i, step: st, phase, left }) => {
      step.textContent = phase === 'prep'
        ? `${i + 1}/4 ${st.title}: приготуйся… ${left.toFixed(1)} с`
        : `${i + 1}/4 ${st.title.toUpperCase()}: ${st.say} — ${left.toFixed(1)} с`;
    });
    calibrating = false;
    if (res.ok) { mic.setCalibration(res.cal); step.textContent = 'Готово. ' + res.notes.join(' ') + ' Перевір: шепни, скажи звичайно, крикни.'; }
    else step.textContent = res.notes.join(' ');
    showState();
    if (onChange) onChange();
  });

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
