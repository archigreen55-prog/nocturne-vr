// Map 2 (W6): the second guard and the radio between the two. World: the second guard's step of the
// frame (the first one's is in heist.js), the room mask of its hand lamp, and the radio chatter — a
// telegraph: every minute or so one guard calls the other and gets an answer, so you hear where both
// are. On a map with one guard nothing here runs.
import { CFG } from '../config/index.js';
import { updateFlashMask, flashUniforms } from '../enemies/flashMask.js';
import { G } from './state.js';
import { caught } from './contract.js';
import { S } from '../i18n/index.js';

export const guards = {
  id: 'guards',
  init() {
    this.radioT = 0;
    this.answer = null;         // { t, who, line }: the reply due in a moment
    this.lineI = 0;
    const g2 = G.patrol2;
    // the hand lamp is the point light after the three of the scene's pool (they were added first)
    flashUniforms.uLampIndex.value = g2 && g2.lamp ? G.points.length : -1;
    this.resetRadio();
  },
  resetRadio() {
    const R = CFG.mansion.radio;
    this.radioT = R.every * 0.5 + Math.random() * R.jitter;
    this.answer = null;
  },
  world(dt) {
    const { patrol2, player, round, level, alert } = G;
    if (!patrol2) return;
    if (!G.active || round.phase === 'result') { if (round.phase === 'result') this.answer = null; return; }
    if (G.caughtT < 0 && patrol2.update(dt, player) === 'caught') caught();
    if (patrol2.lamp) updateFlashMask(patrol2.x, patrol2.z, level.doors, patrol2.y, 1);
    // radio chatter while both are calm (the alarm has its own calls)
    if (round.phase !== 'heist' || alert.full) return;
    if (this.answer) {
      if ((this.answer.t -= dt) <= 0) { const a = this.answer; this.answer = null; a.who.env.sound('radio'); a.who.env.say(a.line); }
      return;
    }
    if ((this.radioT -= dt) > 0) return;
    const R = CFG.mansion.radio, lines = S.mansion.radio.lines;
    this.radioT = R.every + (Math.random() * 2 - 1) * R.jitter;
    const pair = lines[this.lineI++ % lines.length];
    const first = Math.random() < 0.5 ? G.patrol : patrol2, second = first === G.patrol ? patrol2 : G.patrol;
    const [q, a] = first === G.patrol ? pair : [pair[1], pair[0]];
    first.env.sound('radio'); first.env.say(q);
    this.answer = { t: R.answerAfter, who: second, line: a };
  },
};
