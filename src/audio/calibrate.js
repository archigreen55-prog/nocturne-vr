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

// Phone only (plan-phone-mode §2.3): after the silence, the game plays its loud sounds from the
// speaker while you keep quiet; the microphone measures how much of the game it hears ("bleed").
export const GAME_STEP = { id: 'game', title: 'Звуки гри', say: 'Мовчи: гра зіграє кроки, скрип і сирену — так вона дізнається, скільки її чути в мікрофоні', secs: 3.2, pct: 0.9, game: true };
export const stepsFor = (phone) => (phone ? [STEPS[0], GAME_STEP, ...STEPS.slice(1)] : STEPS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// onStep({ i, step, phase: 'prep' | 'rec', left, total }) ~10 times a second. Resolves with judge(...).
// opts.phone adds the "Звуки гри" step; opts.playGame() plays the sample sounds (audio.playSampleSounds).
export async function runCalibration(mic, onStep, { phone = false, playGame = null } = {}) {
  const m = {}, steps = stepsFor(phone), total = steps.length;
  for (let i = 0; i < total; i++) {
    const s = steps[i];
    for (let k = 15; k > 0; k--) { onStep({ i, step: s, phase: 'prep', left: k / 10, total }); await sleep(100); }
    const t0 = performance.now();
    const timer = setInterval(() => onStep({ i, step: s, phase: 'rec', left: Math.max(0, s.secs - (performance.now() - t0) / 1000), total }), 100);
    if (s.game) {
      if (playGame) playGame();
      const r = await mic.measure(s.secs, s.pct, true);
      m.game = r.db; m.gameBus = r.bus;
    } else m[s.id] = await mic.measure(s.secs, s.pct);
    clearInterval(timer);
  }
  return judge(m, { phone });
}

// Measured dB -> { ok, cal, notes }
export function judge(m, { phone = false } = {}) {
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
  if (phone) {
    if (m.game == null || m.gameBus == null || m.gameBus < -70) notes.push('Звуки гри не зіграли (звук вимкнено?) — захист від них стоїть за оцінкою; повтори калібрування зі звуком.');
    else if (m.game - m.floor < 3) { cal.bleed = -80; notes.push('Звуків гри в мікрофоні майже не чути (навушники?) — гра не сплутає їх із твоїм голосом.'); }
    else {
      cal.bleed = m.game - m.gameBus;
      notes.push('Звуки гри чути в мікрофоні: поки вони звучать, гра сама піднімає межі над ними.');
      if (m.game > m.normal - 3) notes.push('Гра в мікрофоні майже така гучна, як твій голос: зменш гучність телефона або грай у навушниках.');
    }
  }
  return { ok: true, cal, notes };
}

// Check after the wizard (phone): say three things the way you will in the game; the game shows
// what it heard. Each: { id, title, say, secs, expect } -> result { id, got, heard, ok, skipped }.
export const CHECKS = [
  { id: 'quiet', title: 'Шепни', say: 'Шепни, як у грі: «тихо, тихо»', secs: 3, expect: 'quiet' },
  { id: 'normal', title: 'Скажи', say: 'Скажи звичайно: «раз, два, три»', secs: 3, expect: 'normal' },
  { id: 'shout', title: 'Крикни', say: 'Крикни коротко (або мовчи — пропустимо)', secs: 2.5, expect: 'shout', optional: true },
];
const RANK = { quiet: 0, normal: 1, shout: 2 };
export async function verifyMic(mic, onStep) {
  const results = [];
  for (let i = 0; i < CHECKS.length; i++) {
    const c = CHECKS[i];
    for (let k = 10; k > 0; k--) { onStep({ i, check: c, phase: 'prep', left: k / 10, total: CHECKS.length }); await sleep(100); }
    let got = 'quiet', maxEnv = -100;
    const t0 = performance.now();
    while (performance.now() - t0 < c.secs * 1000) {
      if (RANK[mic.level] > RANK[got]) got = mic.level;
      maxEnv = Math.max(maxEnv, mic.env);
      onStep({ i, check: c, phase: 'rec', left: Math.max(0, c.secs - (performance.now() - t0) / 1000), total: CHECKS.length, level: mic.level });
      await sleep(50);
    }
    const heard = maxEnv > mic.cal.floor + 3;
    const skipped = !!c.optional && !heard;
    results.push({ id: c.id, got, heard, skipped, ok: skipped || got === c.expect });
  }
  return { results, notes: verifyNotes(results) };
}
// What to do about a mismatch (the ± buttons next to the boundaries)
export function verifyNotes(results) {
  const notes = [], r = Object.fromEntries(results.map((x) => [x.id, x]));
  if (r.quiet && !r.quiet.ok) notes.push(r.quiet.got === 'shout' ? 'Шепіт став «КРИК!»: перекалібруй.' : 'Шепіт гра чує як голос: натисни «+» біля межі шепіт / голос.');
  if (r.normal && !r.normal.ok) notes.push(r.normal.got === 'quiet' ? 'Звичайний голос гра чує як шепіт: натисни «−» біля межі шепіт / голос.' : 'Звичайний голос став «КРИК!»: натисни «+» біля межі крику.');
  if (r.shout && !r.shout.ok) notes.push('Крик гра чує як звичайний голос: натисни «−» біля межі крику.');
  if (!notes.length) notes.push('Усе так, як у грі: шепіт — ШЕПІТ, голос — НОРМАЛЬНО' + (r.shout && !r.shout.skipped ? ', крик — КРИК!' : '') + '.');
  return notes;
}
