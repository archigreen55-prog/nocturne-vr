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
    this.cansFound = 0;             // W2a: thrown cans it has tidied away this round
    // habits of this round (difficulty picks which; each at its time +- jitter)
    const H = G.habits, run = CFG.run || {};
    this.habits = (run.habits || []).map((id) => ({ id, ...H[id], at: H[id].at + (Math.random() * 2 - 1) * G.jitter, done: false }));
    for (const h of this.habits) if (h.id.startsWith('tea') && run.teaExtra) h.dur += run.teaExtra;   // the thermos (shop)
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
      if (this.missing.has(it) || it.delivered || it.throwable) continue;
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
        q.push({ type: 'walk', to: h.stand, label: S.guard.act.kettle, onStart: say(h.say || S.guard.say.tea) });
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
    if (this.tidyUp(x, z)) return;   // W2a: a can or broken glass there: it tidies that up instead
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
        if (this.missing.has(it) || it.throwable) continue;   // a can is not loot (W2a)
        const [hx, hy, hz] = it.def.pos;
        const p = it.mesh.position;
        const there = !it.delivered && it.state === 'rest' && Math.hypot(p.x - hx, p.z - hz) < 0.5 && Math.abs(p.y - hy) < 0.3;
        if (there || !this.canSee(hx, hy + 0.2, hz)) continue;
        // W6 (contract 12): a prop in its place passes for it, unless the guard is close on hard
        if (this.env.loot.items.some((f) => f.prop && !f.held && Math.hypot(f.mesh.position.x - hx, f.mesh.position.z - hz) < 0.5 && Math.abs(f.mesh.position.y - hy) < 0.4
          && !(run.difficulty === 'hard' && Math.hypot(this.g.x - hx, this.g.z - hz) < 2))) continue;
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

  // ---------- W2a: devices, thrown cans, broken bottles ----------
  // A device it heard (or the lights went out): go and switch it off. Returns true when that is taken
  // care of (queued now, someone is on it, or it is busy with a noise and comes when the device is
  // heard again); false in a full alarm (then it hunts at the noise as usual).
  deviceTask(dev) {
    const g = this.g, D = CFG.devices, T = S.devices, say = (t) => () => this.env.say(t);
    if (this.env.alert.full) return false;
    if (dev.claimed || dev.dead || !(dev.on || dev.ringing)) return true;   // the breaker: on = tripped (the lights are out)
    if (g.state !== 'task' || g.queue.some((st) => st.dev)) return true;
    const L = D.levels[(CFG.run || {}).difficulty] || D.levels.medium, n = Math.max(1, dev.uses);
    dev.claimed = g;
    this.env.alert.add(D.points[Math.min(n, D.points.length) - 1] * L.pointsK, dev.x, dev.z);
    g.interrupt();
    g.state = 'task';
    const q = g.queue, face = [dev.x, dev.z], name = T.names[dev.kind];
    q.push({ type: 'walk', to: dev.stand, dev, maxT: 30, label: T.goesOff(name), onStart: say(n >= 2 ? T.again[dev.kind] : T.line[dev.kind]) });
    if (dev.kind === 'radio') q.push({ type: 'wait', t: D.radio.dance, dev, face, label: T.dances, onStart: say(T.danceLine) });
    if (dev.kind === 'phone') {
      const talk = { type: 'wait', t: D.phone.talk, dev, face, talk: true, label: T.talks, mods: { hearK: D.phone.hearK, fovK: D.phone.fovK } };
      talk.onStart = () => { if (dev.ringing) { dev.answer(g); this.env.say(T.hello); } else { talk.t = 1.5; talk.talk = false; talk.mods = null; this.env.say(T.missed); } };
      q.push(talk, { type: 'wait', t: 1, dev, face, label: T.talks, onStart: () => { if (dev.talking) this.env.say(T.bye); } });
    }
    q.push({ type: 'wait', t: dev.kind === 'breaker' ? D.breaker.flip : 1, dev, face, label: T.switchesOff(name),
      onEnd: () => { dev.guardOff(g, n >= D.unplugAt); if (n >= D.unplugAt) this.env.say(T.unplug[dev.kind]); } });
    q.push({ type: 'wait', t: D.look, sweep: true, dev, label: S.guard.act.searches });
    if (L.search && n >= 2) this.queueNear(dev.x, dev.z);
    return true;
  }
  // up to 2 hiding spots near (x, z), after the steps queued so far
  queueNear(x, z) {
    const near = this.cfg.spots.map((s) => ({ s, d: Math.hypot(s.at[0] - x, s.at[1] - z) })).filter((o) => o.d < 5).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const o of near) this.queueSpot(o.s, true);
  }

  // After looking at a noise at (x, z): a thrown can lying there is taken to the bin, broken glass is
  // swept up. Returns true when it queued that.
  tidyUp(x, z) {
    const g = this.g, T = CFG.throw, D = CFG.devices, W = S.throw, map = T.maps[this.env.level.id] || T.maps.dacha;
    const it = this.env.loot.items.find((i) => i.throwable && i.landedAt && !i.found && !i.gone && !i.carrier && !i.held && (i.state === 'rest' || i.state === 'broken')
      && Math.hypot(i.mesh.position.x - x, i.mesh.position.z - z) < T.findRadius && Math.abs(i.mesh.position.y - g.y) < 1.6);
    if (!it) return false;
    it.found = true;
    const p = it.mesh.position, at = [p.x, p.z, g.y > 1.5 ? 1 : 0], face = [p.x, p.z], q = g.queue;
    const L = D.levels[(CFG.run || {}).difficulty] || D.levels.medium;
    if (it.broken) {   // a bottle: «Тут хтось є!», it sweeps the glass up
      q.push({ type: 'walk', to: at, item: it, maxT: 20, label: W.toGlass, onStart: () => this.env.say(W.glassLine) });
      q.push({ type: 'wait', t: T.bottle.sweep, item: it, face, label: W.sweeps, onEnd: () => { it.gone = true; if (it.shards) it.shards.visible = false; } });
      q.push({ type: 'wait', t: T.bottle.look, sweep: true, label: S.guard.act.searches, search: true });
      return true;
    }
    this.cansFound++;
    const again = this.cansFound >= 2;
    q.push({ type: 'walk', to: at, item: it, maxT: 20, label: W.toCan, onStart: () => this.env.say(again ? W.whoAgain : W.who) });
    q.push({ type: 'wait', t: 1.2, item: it, face, label: W.picksUp, onStart: () => this.env.alert.add((again ? T.can.again : T.can.found) * L.pointsK, p.x, p.z), onEnd: () => { it.carrier = g; it.state = 'held'; } });
    q.push({ type: 'walk', to: map.binStand, item: it, maxT: T.carryTimeout, label: W.carries });
    q.push({ type: 'wait', t: 0.8, item: it, face: [map.bin[0], map.bin[1]], label: W.carries, onEnd: () => { it.carrier = null; it.gone = true; it.state = 'rest'; it.mesh.visible = false; } });
    if (again && L.search) this.queueNear(x, z);
    return true;
  }
}
