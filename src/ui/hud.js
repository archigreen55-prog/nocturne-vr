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
import { UI } from '../style/palette.js';   // W17 S4: the palette's meanings (decision 10: no green)
import { guardPortrait } from '../style/portraits.js';
import { CFG } from '../config/index.js';

const REVEAL_MS = 2500;
const ALARM_WORDS = [S.board.alert.calm, S.board.alert.check, S.board.alert.alarm];
const ALARM_COLORS = [UI.whisper, UI.lamp, UI.alarm];

const EYE_SVG = `<svg viewBox="0 0 48 32" aria-hidden="true">
  <path class="almond" d="M4 16 Q24 -2 44 16 Q24 34 4 16 Z"/>
  <circle class="pupil" cx="24" cy="16" r="6"/>
  <path class="lid" d="M4 16 L44 16"/>
  <path class="shut" d="M4 14 Q24 30 44 14 M14 22 L12 28 M24 25 L24 31 M34 22 L36 28"/>
</svg>`;

// a watcher's face: the portrait, or (no portrait: the style is off / nobody drew it yet) a letter or an icon; the mark in its corner
const FACE = '<span class="gsus-ph" data-mk="0"><img class="gsus-pic" alt=""><span class="gsus-ini gone"></span><b class="gsus-mark"></b></span>';

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
        <div class="gsus">
          <div class="gmain">${FACE}<div class="gmain-r"><span class="gsus-name"></span><span class="gsus-bar"><i></i></span></div></div>
          <div class="gminis"></div>
        </div>
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
    this.minis = [];       // the small cards: { box, face }
    this.el = {
      eye: q('.hud-eye'), stance: q('.stance'), steps: q('.steps'), hold: q('.hold'), room: q('.room'),
      time: q('.time'), alarm: q('.alarm'), goal: q('.goal'),
      gsus: q('.gsus'), gminis: q('.gminis'), gsusFill: q('.gsus-bar i'), gsusName: q('.gsus-name'),
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

  faceOf(box) { return { ph: box.querySelector('.gsus-ph'), pic: box.querySelector('.gsus-pic'), ini: box.querySelector('.gsus-ini') }; }
  addMini() {
    const box = document.createElement('span');
    box.className = 'gmini gone';
    box.innerHTML = `${FACE}<span class="gsus-seen"><i></i></span>`;
    this.el.gminis.appendChild(box);
    this.minis.push({ box, face: this.faceOf(box), seen: box.querySelector('.gsus-seen i') });
  }
  // one card's face: the portrait, else the kind's icon (config/hud.js kinds), else the first letter of the name; mk = its mark 0/1/2
  face(key, c, w, mk) {
    const src = guardPortrait(w.id) || '';
    const K = CFG.hud.kinds[w.kind], glyph = src ? '' : (K && K.icon ? 'icon:' + w.kind : 'letter:' + (w.name || '?').trim().charAt(0).toUpperCase());
    const sig = src + '|' + glyph;
    if (this.cache[key + 'face'] !== sig) {
      this.cache[key + 'face'] = sig;
      c.pic.setAttribute('src', src);
      c.pic.classList.toggle('gone', !src);
      c.ini.classList.toggle('gone', !!src);
      if (!src) { if (K && K.icon) c.ini.innerHTML = `<svg viewBox="0 0 32 32">${K.icon}</svg>`; else c.ini.textContent = glyph.slice(7); }
    }
    this.attr(key + 'mk', c.ph, 'data-mk', String(mk));
  }

  // s: { stealth, stance, stepsAudible, held, room, clock, phase, alertLevel, goal, vanSum, mic, breath,
  //      speaking, msg, msgColor, guardText, guardSpeech }
  update(s, now) {
    const e = this.el, mic = s.mic, holding = s.breath.state === 'holding';
    // eye + stance
    const st = s.stealth;
    this.attr('eye', e.eye, 'data-eye', st.eye);
    this.style('eye', e.eye, 'color', st.eye === 'closed' ? UI.whisper : st.eye === 'half' ? UI.paper2 : st.lit ? UI.lamp : UI.paper);
    this.text('stance', e.stance, st.eye === 'closed' ? S.hud.hidden : S.hud.stanceRange(s.stance, st.range.toFixed(1)));
    // steps / hands / room
    // running (W1): «Кроки: БІГ» while running, «Захекався N с» while out of breath (always shown)
    const R = s.run, running = !!(R && R.running), winded = R && R.winded > 0;
    const steps = winded ? S.sprint.winded(Math.ceil(R.winded)) : running ? S.sprint.stepsRun : s.stepsAudible ? S.hud.stepsLoud : S.hud.stepsQuiet;
    this.text('steps', e.steps, steps);
    this.style('steps', e.steps, 'color', winded ? UI.muted : running ? UI.lamp : s.stepsAudible ? UI.lamp : UI.whisper);
    this.shown('steps', e.steps, steps, now, s.stepsAudible || running || winded);
    this.text('hold', e.hold, s.holding ? S.hud.holding(s.holding) : '');
    this.shown('hold', e.hold, s.holding, now);
    this.text('room', e.room, s.room);
    this.shown('room', e.room, s.room, now);
    // clock + alarm + goal
    this.text('time', e.time, s.phase === 'result' ? '—:—' : fmtTime(s.clock));
    this.style('time', e.time, 'color', s.phase === 'escape' ? UI.alarm : s.clock < 60 && s.phase !== 'ready' ? UI.lamp : s.phase === 'ready' ? UI.muted : UI.paper);
    const word = s.phase === 'escape' ? S.board.toVan : ALARM_WORDS[s.alertLevel || 0];
    this.text('alarm', e.alarm, word);
    this.style('alarm', e.alarm, 'color', s.phase === 'escape' ? UI.alarm : ALARM_COLORS[s.alertLevel || 0]);
    this.attr('alarm', e.alarm, 'data-lvl', s.phase === 'escape' ? 'escape' : String(s.alertLevel || 0));   // W17 S4: the alarm's banner (style/hud.css)
    this.shown('alarm', e.alarm, word, now, s.phase === 'escape' || s.alertLevel > 0);
    // the guards panel: the main watcher's big card (the house scale beside it) + small cards for the rest, each with
    // its own thin «sees you» line. The list comes from the panel (G.guards); nothing here knows how many or who.
    const ws = s.susOn && s.watchers ? s.watchers : [];
    if (ws.length) {
      const lvl = s.alertLevel || 0, house = Math.max(0, Math.min(100, Math.round(s.house || 0)));
      const main = ws.find((w) => w.main) || ws[0];
      this.attr('gsus', e.gsus, 'data-lvl', String(lvl));
      this.style('gsusfill', e.gsusFill, 'width', house + '%');
      this.text('gname', e.gsusName, main.name);
      this.face('gm', this.mainFace || (this.mainFace = this.faceOf(e.gsus.querySelector('.gmain'))), main, Math.max(main.mark, lvl));
      const rest = ws.filter((w) => w !== main).slice(0, Math.max(0, CFG.hud.maxCards - 1));
      while (this.minis.length < rest.length) this.addMini();
      this.minis.forEach((m, i) => {
        const w = rest[i];
        m.box.classList.toggle('gone', !w);
        if (!w) return;
        this.face('gs' + i, m.face, w, w.mark);
        this.style('gs' + i, m.seen, 'width', w.seen + '%');
      });
      // the minimal mode: it stays visible as long as there is something to hear (suspicion > 0 / a mark / a watcher sees you)
      this.shown('gsus', e.gsus, main.id, now, house > 0 || lvl > 0 || ws.some((w) => w.mark > 0 || w.seen > 0));
    } else {
      this.reveal.gsus = 0;
      e.gsus.classList.add('gone');
    }
    const goal = s.goal ? S.hud.goal(s.goal.text, s.goal.done) : '';
    this.text('goal', e.goal, goal);
    this.style('goal', e.goal, 'color', s.goal && s.goal.done ? UI.paper : UI.paper2);
    this.shown('goal', e.goal, goal, now);
    // microphone
    if (holding) {
      this.text('miclabel', e.miclabel, S.hud.breathHeld(s.breath.left.toFixed(1)));
      this.style('miclabel', e.miclabel, 'color', UI.whisper);
    } else if (mic.state === 'on' && !mic.noMic) {
      const lv = LEVELS[mic.level];
      this.text('miclabel', e.miclabel, lv.label);
      this.style('miclabel', e.miclabel, 'color', lv.color);
    } else {
      this.text('miclabel', e.miclabel, mic.noMic ? S.hud.noMic : S.hud.micOff);
      this.style('miclabel', e.miclabel, 'color', UI.dim);
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
      this.style('fill', e.fill, 'background', holding ? '#3d6f99' : LEVELS[mic.level].color);
    }
    const db = !live ? '' : mic.problem ? mic.problem : mic.masking >= 3 ? S.hud.masking(mic.masking.toFixed(0)) : S.hud.micDb(mic.env.toFixed(0), s.speaking);
    this.text('micdb', e.micdb, db);
    this.style('micdb', e.micdb, 'color', mic.problem ? UI.alarm : UI.dim);
    // message line: the latest message, else the guard
    let msg = s.msg, color = s.msgColor;
    if (!msg && s.guardText) {
      msg = s.guardText; color = s.crewSpeech ? UI.lamp : UI.paper2;   // W7: the crew's line is yellow
      this.shown('guard', e.msg, s.guardText, now, s.guardSpeech || s.crewSpeech);
    } else e.msg.classList.remove('gone');
    this.text('msg', e.msg, msg || '');
    this.style('msg', e.msg, 'color', color || UI.lamp);
  }

  state() { return { minimal: this.minimal, hidden: this.root.hidden }; }
}
