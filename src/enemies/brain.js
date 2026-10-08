// The guard's mind for calm time: instead of a fixed loop it keeps a queue of small steps
// (walk / wait / close a door) and plans the next room itself. What it plans:
//   - habits on a schedule (tea, toilet, phone, armchair): windows of opportunity with loud tells;
//   - otherwise the room it has not seen for longest (+ rooms with loot, x random), look around,
//     sometimes check a hiding spot there, sometimes yawn;
// What it notices on its rounds (10 Hz, only what it can see): loot missing from its place,
// doors it keeps closed standing open. Both raise suspicion and make it search / close / look.
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';

const EYE = 1.62;
const angleDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Brain {
  // env: { level, loot, roundTime() -> s | null (null before the heist), say(text), sound(kind, x, z, opts) }
  constructor(guard, env) {
    this.g = guard;
    this.env = env;
    this.reset();
  }

  reset() {
    // the map's own rounds (rooms, spots, habits, start) over the numbers of CFG.guard (W6)
    const G = this.cfg = Object.assign({}, CFG.guard, this.env.guard || {});
    this.roomAt = (x, z, y = 0) => this.env.level.roomAt(x, z, y);
    this.lastVisit = {};
    for (const r of Object.keys(G.rooms)) this.lastVisit[r] = -Math.random() * 60;
    this.clock = 0;                 // own time, for room weights
    this.missing = new Set();       // items it has noticed gone
    this.noticedDoors = new Set();
    this.agitated = false;
    // habits of this round (difficulty picks which; each at its time +- jitter)
    const H = G.habits, run = CFG.run || {};
    this.habits = (run.habits || []).map((id) => ({ id, ...H[id], at: H[id].at + (Math.random() * 2 - 1) * G.jitter, done: false }));
    if (run.teaAtStart) this.habits.unshift({ id: 'tea0', ...H.tea, at: 0, dur: run.teaAtStart, done: false });
  }

  get speedK() { return this.agitated ? CFG.guard.agitatedK : 1; }

  // ---------- planning ----------
  plan() {
    const t = this.env.roundTime();
    if (t !== null) {
      const h = this.habits.find((x) => !x.done && t >= x.at);
      if (h) {
        h.done = true;
        if (t - h.at < 60) { this.queueHabit(h); return; }   // too late (it was busy chasing): skip
      }
    }
    this.queueRoom();
  }

  queueRoom() {
    const G = this.cfg, g = this.g;
    const here = this.roomAt(g.x, g.z, g.y);
    const lootIn = {};
    for (const it of this.env.loot.items) {
      if (this.missing.has(it) || it.delivered) continue;
      const r = this.roomAt(it.def.pos[0], it.def.pos[2], it.def.pos[1]);
      lootIn[r] = (lootIn[r] || 0) + 1;
    }
    let best = null, bestW = -1;
    for (const r of Object.keys(G.rooms)) {
      if (r === here) continue;
      const w = ((this.clock - this.lastVisit[r]) / 60 + G.lootWeight * (lootIn[r] || 0) + 0.2) * (0.7 + Math.random() * 0.6);
      if (w > bestW) { bestW = w; best = r; }
    }
    const to = pick(G.rooms[best]);
    const q = g.queue;
    q.push({ type: 'walk', to, label: S.guard.act.walksTo(best), room: best });
    q.push({ type: 'wait', t: G.lookTime, sweep: true, label: S.guard.act.looksAround(best) });
    const spots = G.spots.filter((s) => this.roomAt(s.at[0], s.at[1], g.y) === best);
    if (spots.length && Math.random() < G.spotChance) this.queueSpot(pick(spots), false);
    if (Math.random() < G.yawnChance) q.push({ type: 'wait', t: 3, label: S.guard.act.yawns, mods: { fovK: 0.3 }, onStart: () => this.env.sound('yawn') });
  }

  queueSpot(s, search, front = false) {
    const steps = [
      { type: 'walk', to: s.from, label: S.guard.act.checks(s.name), search },
      { type: 'wait', t: 1.6, face: s.at, label: S.guard.act.checks(s.name), search },
    ];
    if (front) this.g.queue.unshift(...steps); else this.g.queue.push(...steps);
  }

  queueHabit(h) {
    const q = this.g.queue, say = (text) => () => this.env.say(text);
    const mods = { hearK: h.hearK || 1, sightK: h.sightK || 1, fovK: h.fovK || 1 };
    switch (h.id) {
      case 'tea': case 'tea2': case 'tea0':
        q.push({ type: 'walk', to: h.stand, label: S.guard.act.kettle, onStart: say(S.guard.say.tea) });
        q.push({ type: 'wait', t: h.dur, face: h.face, label: h.label, mods, mask: h.mask,
          onStart: () => this.env.sound('kettle', h.stand[0], h.stand[1], { dur: h.dur, whistleAt: h.whistleAt, whistleFor: h.whistleFor }) });
        break;
      case 'toilet':
        q.push({ type: 'walk', to: h.go || [6, -2], label: S.guard.act.toilet, onStart: say(S.guard.say.toilet) });
        q.push({ type: 'close', door: this.doorAt(h.closeDoor), label: S.guard.act.locksIn });
        q.push({ type: 'walk', to: h.stand, label: h.label });
        q.push({ type: 'wait', t: h.dur, face: h.face, label: h.label, mods, onEnd: () => this.env.sound('flush', h.stand[0], h.stand[1]) });
        break;
      case 'phone': {
        q.push({ type: 'wait', t: 2.5, label: S.guard.act.phoneRings, mods, onStart: () => { this.env.sound('ring'); } });
        q.push({ type: 'wait', t: 1, label: h.label, mods, talk: true, onStart: say(S.guard.say.phoneHello) });
        let left = h.dur;
        for (let i = 0; left > 0; i = (i + 1) % h.walk.length) {
          q.push({ type: 'walk', to: h.walk[i], slow: true, label: h.label, mods, talk: true });
          q.push({ type: 'wait', t: 3, label: h.label, mods, talk: true });
          left -= 8;
        }
        q.push({ type: 'wait', t: 1, label: h.label, onStart: say(S.guard.say.phoneBye) });
        break;
      }
      case 'armchair':
        q.push({ type: 'walk', to: h.go || [-0.9, -12.6], label: S.guard.act.armchair, onStart: say(S.guard.say.armchair) });
        q.push({ type: 'wait', t: h.dur, face: h.face, sit: h.stand, label: h.label, mods });
        break;
    }
  }

  doorAt(p) { return this.env.level.doors.find((d) => Math.hypot(d.cx - p[0], d.cz - p[1]) < 0.4); }

  // After investigating a noise at (x, z) without finding anyone: check up to 2 hiding spots nearby.
  afterInvestigate(x, z) {
    const near = this.cfg.spots.map((s) => ({ s, d: Math.hypot(s.at[0] - x, s.at[1] - z) })).filter((o) => o.d < 4)
      .sort((a, b) => a.d - b.d).slice(0, 2);
    for (let i = near.length - 1; i >= 0; i--) this.queueSpot(near[i].s, true, true);
  }

  arrived(step) { if (step.room) this.lastVisit[step.room] = this.clock; }

  // ---------- noticing (10 Hz, calm only) ----------
  canSee(x, y, z) {
    const g = this.g, P = CFG.patrol;
    const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
    if (d > CFG.guard.seeChanges) return false;
    const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), g.heading + g.headYaw));
    if (ang > P.fov / 2) return false;
    return !this.env.level.losBlocked(g.x, g.y + EYE, g.z, x, y, z);
  }

  watch(dt) {
    this.clock += dt;
    const G = this.cfg, run = CFG.run || {}, g = this.g;
    // loot missing from its place
    if (run.noticeMissing) {
      for (const it of this.env.loot.items) {
        if (this.missing.has(it)) continue;
        const [hx, hy, hz] = it.def.pos;
        const p = it.mesh.position;
        const there = !it.delivered && it.state === 'rest' && Math.hypot(p.x - hx, p.z - hz) < 0.5 && Math.abs(p.y - hy) < 0.3;
        if (there || !this.canSee(hx, hy + 0.2, hz)) continue;
        this.missing.add(it);
        this.env.say(S.guard.say.whereIsItem(it.name.toLowerCase()));
        this.env.sound('grunt');
        this.env.alert.add(G.missingPoints, hx, hz);
        if (this.missing.size >= 2) this.agitated = true;
        if (this.missing.size >= run.missingToAlarm) { this.env.alert.setFull(S.cause.missingLoot, hx, hz); return; }
        // search the room where it stood
        const room = this.roomAt(hx, hz, hy);
        g.queue.length = 0;
        g.queue.push({ type: 'walk', to: [hx + (g.x - hx) * 0.3, hz + (g.z - hz) * 0.3], label: S.guard.act.searchesLoot, search: true });
        g.queue.push({ type: 'wait', t: 3, sweep: true, label: S.guard.act.searches, search: true });
        for (const s of G.spots.filter((sp) => this.roomAt(sp.at[0], sp.at[1], hy) === room).slice(0, 2)) this.queueSpot(s, true);
        return;
      }
    }
    // doors it keeps closed, found open (by you)
    for (const d of this.env.level.doors) {
      if (d.locked || this.noticedDoors.has(d) || d.lastUser !== 'player' || Math.abs(d.angle) < 0.3) continue;
      if (!this.canSee(d.cx, 1.0, d.cz)) continue;
      this.noticedDoors.add(d);
      this.env.say(S.guard.say.whoOpened);
      this.env.alert.add(G.doorPoints, d.cx, d.cz);
      const sx = Math.sign((g.x - d.cx) * -Math.sin(d.base) + (g.z - d.cz) * -Math.cos(d.base)) || 1;
      const nx = -Math.sin(d.base) * sx, nz = -Math.cos(d.base) * sx;   // stand on its own side of the doorway
      g.queue.unshift(
        { type: 'walk', to: [d.cx + nx * 0.9, d.cz + nz * 0.9], label: S.guard.act.toOpenDoor },
        { type: 'wait', t: 2, face: [d.cx - nx * 2, d.cz - nz * 2], label: S.guard.act.peeks, search: true },
        { type: 'close', door: d, label: S.guard.act.closesDoor },
      );
      return;
    }
  }

  closed(door) { this.noticedDoors.delete(door); }
}
