// What the host tells everybody and how a guest shows it (plan-multiplayer §1.4). The host counts the
// world as it always did (the guards, the lurkers, the alarm, the loot, the doors, the round clock); 15
// times a second it sends what changed, and a full snapshot when somebody joins or comes back. A guest
// never runs the guards' minds: it moves its own body, sends where it is, and draws the host's world.
// Indexes (guards, doors, items, lurkers) are positions in the lists the map builds: the same map on
// every device builds them in the same order.
import { G } from '../systems/state.js';
import { power } from '../world/devices.js';
import { playStep, playScratch, playStinger, playThud } from '../audio/audio.js';

const GUARD_STATES = ['task', 'react', 'investigate', 'look', 'hunt', 'chase'];
const ITEM_STATES = ['rest', 'held', 'fall', 'fly', 'broken'];
const LURK_STATES = ['dormant', 'telegraph', 'lunge', 'hold', 'retreat', 'cooldown'];
const POSES = [null, 'flip', 'kneel', 'bucket', 'blind'];
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

// ---------- the host ----------
const sent = { items: [], doors: [] };   // what the guests already have: only changes go out
export function forgetSent() { sent.items = []; sent.doors = []; }

// pid of who holds an item: this device's player (the host) or a remote player
function holderOf(it, hostPid) {
  if (!it.held) return '';
  if (it.netHolder) return it.netHolder;
  return hostPid;
}

export function hostState(full, hostPid, players) {
  const { round, alert, level, loot } = G;
  const s = {
    type: 'state', full: full ? 1 : 0,
    r: [round.phase, r2(round.t), r2(round.escapeLeft), round.warned ? 1 : 0, round.alarmed ? 1 : 0],
    a: [alert.level, r2(alert.suspicion), alert.full ? 1 : 0, alert.flicker ? 1 : 0, alert.checking ? 1 : 0],
    pw: power.on ? 1 : 0,
    c: [G.contract.id, G.difficulty],
    p: players.map((p) => [p.pid, r3(p.head.x), r3(p.head.z), r3(p.head.y), r3(p.floorY || 0), r3(p.yaw), p.crouched ? 1 : 0, p.running ? 1 : 0, p.lost ? 1 : 0]),
    g: G.guards.map((g) => [r3(g.x), r3(g.y || 0), r3(g.z), r3(g.heading), r3(g.headYaw), GUARD_STATES.indexOf(g.state), r2(g.meter), g.visible ? 1 : 0, Math.max(0, POSES.indexOf(g.pose || null)), r2(g.speed || 0), g.activity || '']),
    l: (G.lurkers || []).map((l) => [LURK_STATES.indexOf(l.state), l.creature.visible ? 1 : 0, r3(l.creature.position.x), r3(l.creature.position.y), r3(l.creature.position.z), r3(l.creature.rotation.y), r2(l.lid ? l.lid.rotation.x / 1.7 : -l.door1.rotation.y / 1.9), r2(l.arms.scale.z), l.victim && l.victim.pid ? l.victim.pid : hostPid]),
    d: [], i: [],
  };
  level.doors.forEach((d, idx) => {
    const v = [idx, r3(d.angle), r3(d.target)], k = v.join();
    if (full || sent.doors[idx] !== k) { s.d.push(v); sent.doors[idx] = k; }
  });
  loot.items.forEach((it, idx) => {
    const p = it.mesh.position, q = it.mesh.quaternion;
    const flags = (it.damaged ? 1 : 0) | (it.broken ? 2 : 0) | (it.delivered ? 4 : 0) | (it.gone ? 8 : 0) | (it.mesh.visible ? 16 : 0);
    const v = [idx, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), ITEM_STATES.indexOf(it.state), holderOf(it, hostPid), flags, it.order || 0], k = v.join();
    if (full || sent.items[idx] !== k) { s.i.push(v); sent.items[idx] = k; }
  });
  return s;
}

// ---------- a guest ----------
const guestPrev = { phase: null, lurk: [] };
export function resetGuestView() { guestPrev.phase = null; guestPrev.lurk = []; }

// s: a 'state' message; me: this tab's pid. Returns the phase it moved to (or null).
export function guestApply(s, me) {
  const { round, alert, level, loot, hands } = G;
  // round and alarm
  const [phase, t, esc, warned, alarmed] = s.r;
  let moved = null;
  if (phase !== round.phase && phase !== 'result') { moved = phase; round.phase = phase; }
  round.t = t; round.escapeLeft = esc; round.warned = !!warned; round.alarmed = !!alarmed;
  const [lvl, susp, full, flicker, checking] = s.a;
  alert.suspicion = susp; alert.full = !!full; alert.flicker = !!flicker; alert.checking = !!checking; alert.level = lvl;
  if (s.pw !== undefined) power.on = !!s.pw;
  // guards: where they are and what they do; their marks and bars as the host draws them
  s.g.forEach((v, i) => {
    const g = G.guards[i];
    if (!g) return;
    const [x, y, z, heading, headYaw, st, meter, visible, pose, speed, activity] = v;
    g.x = x; g.y = y; g.z = z; g.heading = heading; g.headYaw = headYaw;
    g.state = GUARD_STATES[st] || 'task'; g.meter = meter; g.visible = !!visible; g.pose = POSES[pose] || null; g.speed = speed;
    g.netActivity = activity;
  });
  // lurkers: the creature, its doors; the sounds come from the change of state
  (s.l || []).forEach((v, i) => {
    const l = G.lurkers && G.lurkers[i];
    if (!l) return;
    const [st, vis, x, y, z, ry, k, arms, victim] = v, state = LURK_STATES[st] || 'dormant', was = guestPrev.lurk[i];
    l.state = state; l.creature.visible = !!vis; l.creature.position.set(x, y, z); l.creature.rotation.set(0, ry, 0);
    l.setDoors(k); l.arms.scale.z = arms;
    if (was !== undefined && was !== state) {
      if (state === 'telegraph') playScratch(l.voice, 1.3);
      if (state === 'lunge' && victim === me) { playStinger(1); if (l.env.onScare) l.env.onScare(G.player); }
      if (state === 'cooldown' && was === 'retreat') playThud({ x: l.FRONT.x, y: 1, z: l.FRONT.z }, false, 0.6, true);
    }
    guestPrev.lurk[i] = state;
  });
  // doors: the host's target; a big difference (a lost packet, a join) snaps
  for (const [idx, angle, target] of s.d) {
    const d = level.doors[idx];
    if (!d) continue;
    d.target = target;
    if (Math.abs(d.angle - angle) > 0.35) d.angle = angle;
  }
  // loot: the item this player carries stays in front of its own eyes (hands.desk); the rest as the host has it
  for (const v of s.i) {
    const it = loot.items[v[0]];
    if (!it) continue;
    const [, x, y, z, qx, qy, qz, qw, st, holder, flags, order] = v;
    const wasDelivered = it.delivered;
    it.state = ITEM_STATES[st] || 'rest';
    it.damaged = !!(flags & 1); it.broken = !!(flags & 2); it.delivered = !!(flags & 4); it.gone = !!(flags & 8);
    it.mesh.visible = !!(flags & 16);
    it.order = order;
    it.netHolder = holder;
    it.holders.length = 0; if (holder) it.holders.push(holder === me ? 'desk' : 'friend');
    if (holder === me) { if (hands.desk !== it) hands.desk = it; }
    else {
      if (hands.desk === it) hands.desk = null;
      it.mesh.position.set(x, y, z); it.mesh.quaternion.set(qx, qy, qz, qw);
    }
    if (it.delivered && !wasDelivered && !s.full && loot.env.onDeliver) loot.env.onDeliver(it);
  }
  return moved;
}

// A guest's guards: the steps it hears and where their voice comes from (their minds run on the host).
export function guestGuardSounds(dt) {
  const L = G.player.head;
  for (const g of G.guards) {
    if (g.speed > 0.2) {
      g.stepAcc = (g.stepAcc || 0) + g.speed * dt;
      if (g.stepAcc > (g.speed > 1.7 ? 0.9 : 0.7)) { g.stepAcc = 0; playStep(g.voice, g.speed > 1.7 ? 1.3 : 0.9); }
    }
    g.voice.setOccluded(G.level.soundOccluded(L.x, L.z, g.x, g.z));
    g.voice.setPos(g.x, (g.y || 0) + 1.0, g.z);
    if (g.state === 'chase') g.setMark('!');
    else if (g.state !== 'task' && g.state !== 'react') g.setMark('?');
    else g.setMark(null);
    g.drawBar(g.state === 'chase' ? 0 : g.meter);
    g.place();
  }
}
