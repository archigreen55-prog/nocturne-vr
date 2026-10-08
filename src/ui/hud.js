// HTML HUD for the phone (plan-phone-mode §1.8 B + the "minimal" mode): what the wrist panel shows in
// VR, as text that stays sharp at any size and costs the GPU nothing (the wrist canvas, 512², was
// re-uploaded ten times a second). Nothing here takes touches (pointer-events: none).
//   top left   the eye (how visible you are) + stance; steps, what you hold, room (smaller)
//   top centre the clock, the alarm word, the contract goal
//   top right  microphone: label, bar with both thresholds (left of the pause button)
//   bottom     messages and the guard's lines (centre, between the joystick and the buttons)
// The breath ring is the breath button itself (touch.js). Minimal mode keeps the eye, the microphone
// and the clock; the rest shows for 2.5 s when it changes (alarm, goal) or while it matters (loud steps).
import { LEVELS } from '../audio/mic.js';
import { fmtTime } from './board.js';
import { S } from '../i18n/index.js';

const REVEAL_MS = 2500;
const ALARM_WORDS = [S.board.alert.calm, S.board.alert.check, S.board.alert.alarm];
const ALARM_COLORS = ['#5fd38d', '#ffb347', '#ff4d4d'];

const EYE_SVG = `<svg viewBox="0 0 48 32" aria-hidden="true">
  <path class="almond" d="M4 16 Q24 -2 44 16 Q24 34 4 16 Z"/>
  <circle class="pupil" cx="24" cy="16" r="6"/>
  <path class="lid" d="M4 16 L44 16"/>
  <path class="shut" d="M4 14 Q24 30 44 14 M14 22 L12 28 M24 25 L24 31 M34 22 L36 28"/>
</svg>`;

export class Hud {
  constructor(root) {
    this.root = root;
    this.minimal = false;
    this.cache = {};       // key -> last value written
    this.reveal = {};      // key -> time (ms) until which a minimal-mode item stays visible
    root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-eye" data-eye="open">${EYE_SVG}<b class="stance"></b></div>
        <div class="hud-sub"><span class="steps rev"></span><span class="hold rev"></span><span class="room rev"></span></div>
      </div>
      <div class="hud-tc">
        <div class="time"></div>
        <div class="alarm rev"></div>
        <div class="goal rev"></div>
      </div>
      <div class="hud-tr">
        <div class="miclabel"></div>
        <div class="bar"><i class="zq"></i><i class="zn"></i><i class="zs"></i><i class="fill"></i><i class="tick tw"></i><i class="tick ts"></i></div>
        <div class="micdb"></div>
      </div>
      <div class="hud-msg"></div>`;
    const q = (s) => root.querySelector(s);
    this.el = {
      eye: q('.hud-eye'), stance: q('.stance'), steps: q('.steps'), hold: q('.hold'), room: q('.room'),
      time: q('.time'), alarm: q('.alarm'), goal: q('.goal'),
      miclabel: q('.miclabel'), micdb: q('.micdb'), bar: q('.bar'), fill: q('.fill'),
      zq: q('.zq'), zn: q('.zn'), zs: q('.zs'), tw: q('.tw'), ts: q('.ts'), msg: q('.hud-msg'),
    };
  }

  setMinimal(on) { this.minimal = !!on; this.root.classList.toggle('minimal', this.minimal); this.reveal = {}; }
  show(on) { this.root.hidden = !on; }

  text(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; return true; } return false; }
  style(key, el, prop, v) { const k = key + prop; if (this.cache[k] !== v) { this.cache[k] = v; el.style[prop] = v; } }
  attr(key, el, name, v) { const k = key + name; if (this.cache[k] !== v) { this.cache[k] = v; el.setAttribute(name, v); } }
  // Minimal mode: an item whose value changed stays visible for a while; `always` keeps it visible.
  shown(key, el, value, now, always = false) {
    const first = this.cache['v' + key] === undefined;
    if (!first && this.cache['v' + key] !== value) this.reveal[key] = now + REVEAL_MS;
    this.cache['v' + key] = value;
    const on = !this.minimal || always || (this.reveal[key] || 0) > now;
    el.classList.toggle('gone', !on);
  }

  // s: { stealth, stance, stepsAudible, held, room, clock, phase, alertLevel, goal, vanSum, mic, breath,
  //      speaking, msg, msgColor, guardText, guardSpeech }
  update(s, now) {
    const e = this.el, mic = s.mic, holding = s.breath.state === 'holding';
    // eye + stance
    const st = s.stealth;
    this.attr('eye', e.eye, 'data-eye', st.eye);
    this.style('eye', e.eye, 'color', st.eye === 'closed' ? '#5fd38d' : st.eye === 'half' ? '#ffd166' : st.lit ? '#ff5c5c' : '#ffb347');
    this.text('stance', e.stance, st.eye === 'closed' ? S.hud.hidden : S.hud.stanceRange(s.stance, st.range.toFixed(1)));
    // steps / hands / room
    const steps = s.stepsAudible ? S.hud.stepsLoud : S.hud.stepsQuiet;
    this.text('steps', e.steps, steps);
    this.style('steps', e.steps, 'color', s.stepsAudible ? '#ffb347' : '#5fd38d');
    this.shown('steps', e.steps, steps, now, s.stepsAudible);
    this.text('hold', e.hold, s.holding ? S.hud.holding(s.holding) : '');
    this.shown('hold', e.hold, s.holding, now);
    this.text('room', e.room, s.room);
    this.shown('room', e.room, s.room, now);
    // clock + alarm + goal
    this.text('time', e.time, s.phase === 'result' ? '—:—' : fmtTime(s.clock));
    this.style('time', e.time, 'color', s.phase === 'escape' ? '#ff4d4d' : s.clock < 60 && s.phase !== 'ready' ? '#ffb347' : s.phase === 'ready' ? '#93a1b8' : '#e6ecf5');
    const word = s.phase === 'escape' ? S.board.toVan : ALARM_WORDS[s.alertLevel || 0];
    this.text('alarm', e.alarm, word);
    this.style('alarm', e.alarm, 'color', s.phase === 'escape' ? '#ff4d4d' : ALARM_COLORS[s.alertLevel || 0]);
    this.shown('alarm', e.alarm, word, now, s.phase === 'escape' || s.alertLevel > 0);
    const goal = s.goal ? S.hud.goal(s.goal.text, s.goal.done) : '';
    this.text('goal', e.goal, goal);
    this.style('goal', e.goal, 'color', s.goal && s.goal.done ? '#5fd38d' : '#c9d3e3');
    this.shown('goal', e.goal, goal, now);
    // microphone
    if (holding) {
      this.text('miclabel', e.miclabel, S.hud.breathHeld(s.breath.left.toFixed(1)));
      this.style('miclabel', e.miclabel, 'color', '#4fb3ff');
    } else if (mic.state === 'on' && !mic.noMic) {
      const lv = LEVELS[mic.level];
      this.text('miclabel', e.miclabel, lv.label);
      this.style('miclabel', e.miclabel, 'color', lv.color);
    } else {
      this.text('miclabel', e.miclabel, mic.noMic ? S.hud.noMic : S.hud.micOff);
      this.style('miclabel', e.miclabel, 'color', '#8a93a3');
    }
    const live = mic.state === 'on' && !mic.noMic;
    e.bar.classList.toggle('off', !live);
    if (live) {
      // the boundaries in effect now (raised while the game's own sound is loud: decision §9 p. 10)
      const pw = mic.barPos(mic.whisperEff ?? mic.whisperDb), ps = mic.barPos(mic.shoutEff ?? mic.shoutDb), pct = (v) => (v * 100).toFixed(1) + '%';
      this.style('zq', e.zq, 'width', pct(pw));
      this.style('zn', e.zn, 'left', pct(pw)); this.style('zn', e.zn, 'width', pct(ps - pw));
      this.style('zs', e.zs, 'left', pct(ps)); this.style('zs', e.zs, 'width', pct(1 - ps));
      this.style('tw', e.tw, 'left', pct(pw)); this.style('ts', e.ts, 'left', pct(ps));
      this.style('fill', e.fill, 'width', pct(mic.barPos(mic.env)));
      this.style('fill', e.fill, 'background', holding ? '#2e6aa0' : LEVELS[mic.level].color);
    }
    const db = !live ? '' : mic.problem ? mic.problem : mic.masking >= 3 ? S.hud.masking(mic.masking.toFixed(0)) : S.hud.micDb(mic.env.toFixed(0), s.speaking);
    this.text('micdb', e.micdb, db);
    this.style('micdb', e.micdb, 'color', mic.problem ? '#ff5c5c' : '#6f8396');
    // message line: the latest message, else the guard
    let msg = s.msg, color = s.msgColor;
    if (!msg && s.guardText) {
      msg = s.guardText; color = '#9fb3c8';
      this.shown('guard', e.msg, s.guardText, now, s.guardSpeech);
    } else e.msg.classList.remove('gone');
    this.text('msg', e.msg, msg || '');
    this.style('msg', e.msg, 'color', color || '#ffd166');
  }

  state() { return { minimal: this.minimal, hidden: this.root.hidden }; }
}
