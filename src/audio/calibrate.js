// Microphone calibration wizard, the same on the 2D start screen and on the board in VR:
// silence -> whisper -> normal voice -> shout (optional). Each step records the raw level for a few
// seconds and keeps a percentile. From that: the whisper/voice boundary sits between your whisper
// and your voice, the voice/shout boundary between your voice and your shout.
import { CFG } from '../game/config.js';

export const STEPS = [
  { id: 'floor', title: 'Тиша', say: 'Мовчи й не рухайся', secs: 3, pct: 0.5 },
  { id: 'whisper', title: 'Шепіт', say: 'Шепочи: «ми тихо-тихо заходимо в будинок»', secs: 3, pct: 0.9 },
  { id: 'normal', title: 'Голос', say: 'Говори звичайно, як у розмові: «раз, два, три, ми вже в будинку»', secs: 3.5, pct: 0.95 },
  { id: 'shout', title: 'Крик', say: 'КРИКНИ коротко й голосно (або мовчи — пропустимо)', secs: 2.5, pct: 0.98 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// onStep({ i, step, phase: 'prep' | 'rec', left }) ~10 times a second. Resolves with judge(...).
export async function runCalibration(mic, onStep) {
  const m = {};
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    for (let k = 15; k > 0; k--) { onStep({ i, step: s, phase: 'prep', left: k / 10 }); await sleep(100); }
    const t0 = performance.now();
    const timer = setInterval(() => onStep({ i, step: s, phase: 'rec', left: Math.max(0, s.secs - (performance.now() - t0) / 1000) }), 100);
    m[s.id] = await mic.measure(s.secs, s.pct);
    clearInterval(timer);
  }
  return judge(m);
}

// Measured dB -> { ok, cal, notes }
export function judge(m) {
  const notes = [];
  if (m.floor == null || m.normal == null) return { ok: false, notes: ['Не вдалося отримати звук з мікрофона. Спробуй ще раз.'] };
  if (m.normal - m.floor < 8) return { ok: false, notes: [`Голос майже не гучніший за тишу (${m.floor.toFixed(0)} і ${m.normal.toFixed(0)} дБ). Перевір мікрофон і повтори.`] };
  const cal = { floor: m.floor, normal: m.normal, whisper: null, shout: null };
  if (m.whisper == null || m.whisper - m.floor < 2) notes.push('Шепіт не почуто — межу шепіт/голос поставлено за замовчуванням.');
  else {
    cal.whisper = m.whisper;
    if (m.normal - m.whisper < 4) notes.push('Шепіт майже такий, як голос — межу поставлено між тишею й голосом; за потреби підкрути повзунком.');
  }
  if (m.shout != null && m.shout > m.normal + 6) { cal.shout = m.normal + Math.max(6, 0.5 * (m.shout - m.normal)); notes.push('Межа крику — посередині між твоїм голосом і криком.'); }
  else notes.push(`Крик пропущено — межа крику: голос +${CFG.mic.shoutOver} дБ.`);
  return { ok: true, cal, notes };
}
