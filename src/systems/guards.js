// Map 2 (W6): the second guard and the radio between the two. World: the second guard's step of the
// frame (the first one's is in heist.js), the room mask of its hand lamp, and the radio chatter — a
// telegraph: every minute or so one guard calls the other and gets an answer, so you hear where both
// are. On a map with one guard nothing here runs.
import { CFG } from '../config/index.js';
import { updateFlashMask, flashUniforms } from '../enemies/flashMask.js';
import { lampWalls } from '../enemies/flashWalls.js';
import * as THREE from 'three';
import { G, params } from './state.js';
import { caught } from './contract.js';
import { S } from '../i18n/index.js';
import { flash } from './messages.js';
import { playStairCreak } from '../audio/stairSfx.js';

const lampFrom = new THREE.Vector3();

export const guards = {
  id: 'guards',
  init() {
    this.radioT = 0;
    this.answer = null;         // { t, who, line }: the reply due in a moment
    this.lineI = 0;
    const g2 = G.patrol2;
    // the hand lamp is the point light after the three of the scene's pool (they were added first)
    flashUniforms.uLampIndex.value = g2 && g2.lamp ? G.points.length : -1;
    // the lamp stops at walls like the flashlight (?flashwalls=off: to measure the cost)
    G.lampWallsOn = !!(g2 && g2.lamp) && params.get('flashwalls') !== 'off' && (params.get('flash') || 'mask') === 'mask';
    lampWalls.uniforms.uLampWallOn.value = G.lampWallsOn ? 1 : 0;
    this.resetRadio();
  },
  resetRadio() {
    const R = CFG.mansion.radio;
    this.radioT = R.every * 0.5 + Math.random() * R.jitter;
    this.answer = null;
  },
  world(dt) {
    const { patrol2, player, round, level, alert } = G;
    if (!G.active || round.phase === 'result') { if (round.phase === 'result') this.answer = null; return; }
    // the other lurkers of the map (heist.js steps the first one)
    if (G.caughtT < 0 && !G.isGuest) for (const l of (G.lurkers || []).slice(1)) l.update(dt, G.players);   // a guest: the host's lurkers
    // running on the stairs: every tread creaks (player.js sets stairCreak on the step)
    if (player.stairCreak) playStairCreak();
    // a heavy item (a two-carrier stand-in, W5): coming up to it says why it cannot be taken
    let heavy = false;
    for (const it of G.loot.items) {
      if (!it.heavy) continue;
      const p = it.mesh.position;
      if (Math.hypot(p.x - player.head.x, p.z - player.head.z) < 1.3 && Math.abs(p.y - player.floorY) < 1) heavy = true;
    }
    if (heavy && !this.nearHeavy) flash(S.mansion.items.heavy, 2.5);
    this.nearHeavy = heavy;
    if (!patrol2) return;
    if (G.caughtT < 0 && !G.isGuest && patrol2.update(dt, G.players) === 'caught') caught(patrol2.caughtWho);
    if (patrol2.lamp) {
      updateFlashMask(patrol2.x, patrol2.z, level.doors, patrol2.y, 1);
      // the lamp's own shadow map on the floor plan (enemies/flashWalls.js): the walls of its floor, within its reach
      if (G.lampWallsOn) { patrol2.lamp.getWorldPosition(lampFrom); lampWalls.update(lampFrom, level, (patrol2.lamp.distance || 7) + 1); }
    }
    // radio chatter while both are calm (the alarm has its own calls)
    if (round.phase !== 'heist' || alert.full || G.isGuest) return;
    if (this.answer) {
      if ((this.answer.t -= dt) <= 0) { const a = this.answer; this.answer = null; a.who.env.sound('radio'); a.who.env.say(a.line); }
      return;
    }
    if ((this.radioT -= dt) > 0) return;
    const R = CFG.mansion.radio, lines = S.mansion.radio.lines;
    this.radioT = (CFG.run && CFG.run.difficulty === 'easy' && R.easyEvery ? R.easyEvery : R.every) + (Math.random() * 2 - 1) * R.jitter;
    const pair = lines[this.lineI++ % lines.length];
    const first = Math.random() < 0.5 ? G.patrol : patrol2, second = first === G.patrol ? patrol2 : G.patrol;
    const [q, a] = first === G.patrol ? pair : [pair[1], pair[0]];
    first.env.sound('radio'); first.env.say(q);
    this.answer = { t: R.answerAfter, who: second, line: a };
  },
};
