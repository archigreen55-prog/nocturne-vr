// One contract: the clock starts when you leave the van; at warnAt the lights start
// flickering; full alarm or the end of the clock gives escapeTime s to get back to the van.
// Results: escaped (reached the van during the escape), left (drove off from the board before any
// alarm), caught, late (the escape time ran out).
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';
import { asList } from './players.js';

export const RESULT_TITLES = {
  left: S.result.left, escaped: S.result.escaped, caught: S.result.caught, late: S.result.late,
};

export class Round {
  // env: { loot, hands, alert, patrol, lurker, scream, onMessage(text, color, s), onPhase(phase) }
  constructor(env) {
    this.env = env;
    this.reset();
  }

  reset() {
    this.phase = 'ready';    // ready | heist | escape | result
    this.t = 0;              // heist time
    this.escapeLeft = CFG.round.escapeTime;
    this.warned = false;
    this.result = null;
    this.shouts = 0;
    this.cause = '';
    this.alarmed = false;      // a full alarm happened this round (for the contracts)
  }

  atVan(head) {
    const Z = CFG.round.vanZone;
    return Math.hypot(head.x - Z.x, head.z - Z.z) < Z.r;
  }

  // Seconds left on the clock that matters now (heist timer or escape timer).
  get clock() {
    if (this.phase === 'escape') return Math.max(0, this.escapeLeft);
    if (this.phase === 'ready') return CFG.round.time;
    if (this.phase === 'heist') return Math.max(0, CFG.round.time - this.t);
    return 0;
  }

  // Full alarm (any cause) during the heist: the escape begins.
  startEscape(cause) {
    if (this.phase !== 'heist' && this.phase !== 'ready') return;
    this.phase = 'escape';
    this.cause = cause;
    this.alarmed = true;
    this.escapeLeft = CFG.round.escapeTime;
    this.env.onMessage(S.round.alarm(CFG.round.escapeTime), '#ff5c5c', 4);
    this.env.onPhase('escape');
  }

  // players: everybody in the round (one player is taken as a list of one). The clock starts when
  // anybody leaves the van; the escape ends when everybody is back at it.
  update(dt, players) {
    const R = CFG.round;
    players = asList(players);
    if (this.phase === 'ready') {
      if (players.some((p) => Math.hypot(p.head.x - R.vanZone.x, p.head.z - R.vanZone.z) > R.startDist)) {
        this.phase = 'heist';
        this.env.onMessage(S.round.clockStarts, '#ffd166', 3);
        this.env.onPhase('heist');
      }
    } else if (this.phase === 'heist') {
      this.t += dt;
      if (this.t >= R.warnAt && !this.warned) {
        this.warned = true;
        this.env.alert.flicker = true;
        this.env.onMessage(S.round.warn, '#ffb347', 4);
      }
      if (this.t >= R.time) this.env.alert.setFull(S.cause.time);   // no position: the patrol searches the rooms
    } else if (this.phase === 'escape') {
      this.t += dt;
      this.escapeLeft -= dt;
      if (players.length && players.every((p) => this.atVan(p.head))) this.finish('escaped');
      else if (this.escapeLeft <= 0) this.finish('late');
    }
  }

  // kind: left | escaped | caught | late
  finish(kind) {
    if (this.phase === 'result') return;
    const { loot, hands } = this.env;
    // items still in hand at the van go into it; on a failure they are lost
    for (const it of hands.heldItems()) {
      if (kind === 'left' || kind === 'escaped') loot.stow(it);
      else { it.holders.length = 0; it.state = 'rest'; }
    }
    hands.reset();
    for (const it of loot.items) if (it.state === 'fall') { it.state = 'rest'; }
    const tally = loot.tally();
    const lost = kind === 'caught' || kind === 'late';
    this.result = {
      kind,
      title: RESULT_TITLES[kind],
      time: this.t,
      sum: lost ? 0 : tally.sum,
      inVan: tally.inVan, intact: tally.intact, damaged: tally.damaged, broken: tally.broken, total: tally.total, list: tally.list,
      shouts: this.shouts,
      scares: (this.env.lurkers || [this.env.lurker]).reduce((n, l) => n + l.scares, 0),
      seen: this.env.patrol.seenCount,
      lostLoot: lost ? tally.sum : 0,
    };
    this.phase = 'result';
    this.env.onPhase('result');
  }
}
