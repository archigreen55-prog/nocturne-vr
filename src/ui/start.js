// Start screen (2D, before Enter VR): microphone permission, calibration and a live level meter.
// Asking here matters: inside an immersive session the permission dialog may not be reachable.
import { LEVELS } from '../audio/mic.js';

const $ = (id) => document.getElementById(id);

export function setupStartScreen({ mic, onPlay, onMicOn }) {
  const micBtn = $('micbtn'), calBtn = $('calbtn'), state = $('micstate'), step = $('calstep');
  const startBtn = $('start');
  let calibrating = false, meterT = 0;

  function showState() {
    const s = mic.state;
    micBtn.disabled = s === 'on' || s === 'pending';
    calBtn.disabled = s !== 'on' || calibrating;
    micBtn.textContent = s === 'on' ? 'Мікрофон увімкнено' : 'Дозволити мікрофон';
    calBtn.textContent = mic.calibrated ? 'Перекалібрувати' : 'Калібрувати';
    if (s === 'on') state.textContent = mic.calibrated ? `калібровано: тиша ${mic.cal.floor.toFixed(0)} дБ, голос ${mic.cal.normal.toFixed(0)} дБ` : 'ще не калібровано — натисни «Калібрувати»';
    else if (s === 'denied') state.textContent = 'Дозвіл не надано. Гра працюватиме без мікрофона. Дозвіл можна змінити в налаштуваннях сайту браузера.';
    else if (s === 'none') state.textContent = `Мікрофон недоступний: ${mic.error}`;
    else if (s === 'pending') state.textContent = 'Чекаю на дозвіл…';
    else state.textContent = 'Без дозволу гра працюватиме, але без головної механіки.';
    const z = (id, a, b, color) => { const e = $(id); e.style.left = a * 100 + '%'; e.style.width = (b - a) * 100 + '%'; e.style.background = color; };
    const pw = mic.barPos(mic.whisperDb), ps = mic.barPos(mic.shoutDb);
    z('zq', 0, pw, '#1f3b2b'); z('zn', pw, ps, '#3f3a1c'); z('zs', ps, 1, '#4a1c1c');
    $('tw').style.left = pw * 100 + '%'; $('ts').style.left = ps * 100 + '%';
  }

  micBtn.addEventListener('click', async () => {
    showState();
    await mic.enable();
    showState();
    if (mic.state === 'on' && onMicOn) {
      const rec = $('recstate');
      rec.textContent = 'Перевіряю запис для повтору крику…';
      const mode = await onMicOn();
      rec.textContent = mode === 'none'
        ? 'Запис для повтору крику не працює в цьому браузері (гра працює, але табло не програє крик).'
        : `Запис для повтору крику працює (${{ worklet: 'AudioWorklet', script: 'ScriptProcessor', recorder: 'MediaRecorder' }[mode] || mode}).`;
      rec.style.color = mode === 'none' ? '#ff9f43' : '#5fd38d';
    }
    if (mic.state === 'on' && !mic.calibrated) step.textContent = 'Тепер натисни «Калібрувати».';
  });

  calBtn.addEventListener('click', async () => {
    if (calibrating || mic.state !== 'on') return;
    calibrating = true; showState();
    const countdown = async (text, seconds, pct) => {
      const until = performance.now() + seconds * 1000;
      const timer = setInterval(() => { step.textContent = `${text} ${Math.max(0, (until - performance.now()) / 1000).toFixed(1)} с`; }, 100);
      const v = await mic.measure(seconds, pct);
      clearInterval(timer);
      return v;
    };
    step.textContent = 'Приготуйся мовчати…';
    await new Promise((r) => setTimeout(r, 1200));
    const floor = await countdown('1/2 Тиша: мовчи й не рухайся…', 3, 0.5);
    step.textContent = 'Тепер говоритимеш звичайним голосом, як у розмові…';
    await new Promise((r) => setTimeout(r, 1500));
    const normal = await countdown('2/2 Кажи звичайним голосом: «Раз, два, три, ми заходимо в будинок»…', 3.5, 0.85);
    calibrating = false;
    if (floor == null || normal == null) step.textContent = 'Не вдалося отримати звук з мікрофона. Спробуй ще раз.';
    else if (normal - floor < 8) step.textContent = `Голос майже не гучніший за тишу (${floor.toFixed(0)} і ${normal.toFixed(0)} дБ). Перевір мікрофон і повтори.`;
    else {
      mic.setCalibration(floor, normal);
      step.textContent = 'Готово. Перевір: шепни, скажи звичайно, крикни — шкала нижче.';
    }
    showState();
  });

  const play = () => { if (!startBtn.disabled) onPlay(); };
  startBtn.addEventListener('click', play);
  startBtn.disabled = false;
  startBtn.textContent = 'Грати на ПК';
  showState();

  return {
    play,
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
