// Traps (W2b). Bought in the shop (game/economy.js: stock), they lie in the van when a round starts
// (CFG.traps.limit per round, contract 7 twice as many; none in «Без тривоги»). Put one down (the
// hand in VR, «Покласти» / E on a phone and a PC; the bucket on a door, the rope across a doorway)
// and the guard who steps on it, opens that door or walks through is knocked out
// (patrol.knockOut), then picks itself up and is angry (brain.afterTrap). The same kind again: it
// sees it and picks it up («Не цього разу»). The alarm clock rings 30 s after it is put down; the
// guard goes to switch it off like a W2a device. Each trick scores (game/mischief.js); the HUD line
// shows the score and the combo. Numbers: CFG.traps; texts: S.traps (story-texts-uk.md §4.5).
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { stockOf, spendTrap, trialSoap } from '../game/economy.js';
import { mischief } from '../game/mischief.js';
import { inCargo } from '../loot/items.js';
import { Builder } from '../world/level.js';
import { playSlip, playMarbles, playBucket, playTrip, playAlarmClock } from '../audio/trapSfx.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { nearestDoor } from './doors.js';
import { S } from '../i18n/index.js';

const _v = new THREE.Vector3();
const local = { lastPhase: null, stats: null, spread: new Map() };
const newStats = () => ({ placed: {}, sprung: {}, avoided: 0, self: 0 });
const isTrap = (it) => !!it.trap;
const floorsY = () => (G.level.floorIndex ? [0, 3] : [0]);   // the floor heights a floor trap may lie on (W6: two)

// ---------- the mischief line (the customer's and the crew's lines: systems/story.js, W7) ----------
// «Шкода: 340 · комбо ×2» (empty while nothing has scored)
export function mischiefText() {
  if (!mischief.score) return '';
  return S.traps.score(mischief.score) + (mischief.best > 1 ? ` · ${S.traps.combo(mischief.best)}` : '');
}

// ---------- the report ----------
export const trapsReport = () => ({ ...local.stats, ...mischief.report(), stock: Object.fromEntries(CFG.traps.order.map((k) => [k, stockOf(k)])) });

// How many traps this round may hold (contract 7: x mods.trapsK); 0 in «Без тривоги» (§5.2).
export const roundLimit = (c = G.contract) => (c.goal.noAlarm ? 0 : Math.round(CFG.traps.limit * ((c.mods && c.mods.trapsK) || 1)));

// ---------- the van ----------
// Every trap item hidden; then the stock (up to the round's limit) laid on the cargo floor by the rear.
function loadVan() {
  if (G.isGuest) return 0;   // with friends the van is the host's (systems/net.js)
  const items = G.loot.items.filter(isTrap);
  for (const it of items) { Object.assign(it, { gone: true, armed: false, door: null, inVan: false, avoided: false, dev: null, clockT: 0, ringT: 0, state: 'rest' }); it.mesh.visible = false; it.mesh.position.set(0, -20, 0); }
  for (const s of local.spread.values()) s.visible = false;
  const lim = roundLimit();
  if (G.contract.goal.mischief && lim) trialSoap();   // decision R2 A: one free soap for the first round of contract 7
  const c = G.level.cargo || { minX: 3.5, maxX: 5.3, minZ: 7.85, maxZ: 11.4, y: 0.4 };
  const z = c.rear === 'max' ? c.maxZ - 0.18 : c.minZ + 0.18;
  let n = 0;
  for (const kind of CFG.traps.order) {
    const k = Math.min(stockOf(kind), lim - n);
    const pool = items.filter((i) => i.trap === kind);
    for (let i = 0; i < k && i < pool.length; i++, n++) {
      const it = pool[i];
      it.gone = false; it.mesh.visible = true;
      it.mesh.position.set(c.minX + 0.2 + n * Math.min(0.28, (c.maxX - c.minX - 0.4) / Math.max(1, lim - 1)), c.y, z);
      it.mesh.rotation.set(0, 0, 0);
      it.inVan = true;
    }
  }
  if (!lim && CFG.traps.order.some((k) => stockOf(k) > 0)) flash(S.traps.noTraps, 3, '#93a1b8');
  return n;
}

// a trap bought at the van, another contract: into the van at once (only before the clock starts)
export function reloadVan() { if (G.round.phase === 'ready' && local.stats) loadVan(); }
// a new round (systems/contract.js, after loot.reset put every item back): the van, the points, the stats
export function newRoundTraps() { if (!local.stats) return; loadVan(); mischief.reset(); local.stats = newStats(); local.lastPhase = G.round.phase; }

// ---------- placing ----------
// phone / PC: «Покласти» with the bucket / the rope near a door puts it on the door / across the doorway.
// Returns true when it did (systems/player.js then does not put the item down).
export function placeAtDoor(it) {
  if (!it || (it.trap !== 'bucket' && it.trap !== 'rope')) return false;
  const p = G.player, d = nearestDoor(p.head.x, p.head.z, CFG.traps.doorReach, p.yaw);
  if (!d || d.locked) { flash(S.traps.noDoor, 2, '#93a1b8'); return true; }   // not put down on the floor either: it is only for doors
  G.hands.detach(it);
  attach(it, d);
  return true;
}
function attach(it, d) {
  it.door = d; it.angle0 = d.angle; it.armed = true; it.state = 'rest'; it.inVan = false;   // angle0: it springs when the door moves from here
  it.vel.set(0, 0, 0);
  if (it.trap === 'bucket') it.mesh.position.set(d.cx, d.y0 + 2.08, d.cz);
  else { it.mesh.position.set(d.cx, d.y0 + 0.02, d.cz); it.mesh.rotation.set(0, d.base, Math.PI / 2); }
  local.stats.placed[it.trap] = (local.stats.placed[it.trap] || 0) + 1;
  flash(S.traps.placed(S.traps.names[it.trap]), 2, '#5fd38d');
}
// VR: the hand let go of the bucket high by a door / the rope low in a doorway
function vrAttach(it) {
  const V = CFG.traps.vrDoor, p = it.mesh.position;
  for (const d of G.level.doors) {
    if (d.locked || Math.hypot(d.cx - p.x, d.cz - p.z) > V.reach) continue;
    const h = p.y - d.y0;
    if ((it.trap === 'bucket' && h > V.top) || (it.trap === 'rope' && h < V.low)) { attach(it, d); return true; }
  }
  return false;
}
// a floor trap at rest on a floor (not the van, not the stairs, not on furniture) is armed
function onFloor(it) {
  const p = it.mesh.position;
  if (inCargo(p.x, p.z) && p.y > 0.2) return false;
  if (G.level.onStairs && G.level.onStairs(p.x, p.z, p.y)) return false;
  if (it.trap === 'clock') return true;   // the alarm clock may stand on furniture too
  return floorsY().some((y) => Math.abs(p.y - y) < 0.05);
}

// ---------- springing ----------
function consume(it) {
  spendTrap(it.trap);
  it.gone = true; it.armed = false; it.mesh.visible = false; it.door = null;
  const s = local.spread.get(it); if (s) s.visible = false;
}
const posOf = (it) => ({ x: it.mesh.position.x, y: it.mesh.position.y + 0.2, z: it.mesh.position.z });
const occ = (it) => { const h = G.player.head, p = it.mesh.position; return G.level.soundOccluded(h.x, h.z, p.x, p.z); };
function spring(it, g) {
  const K = CFG.traps.kinds[it.trap], k = CFG.traps.stunK[G.difficulty] || 1;
  g.knockOut(it.trap, K.stun * k, K.pose);
  g.env.say(g.brain.trapLine(it.trap));
  const at = posOf(it), o = occ(it);
  if (it.trap === 'soap') playSlip(at, o); else if (it.trap === 'marbles') playMarbles(at, o); else if (it.trap === 'bucket') playBucket(at, o); else playTrip(at, o);
  local.stats.sprung[it.trap] = (local.stats.sprung[it.trap] || 0) + 1;
  score('trap');
  consume(it);
  // the mansion: the other guard heard the cry and comes to look
  for (const o2 of G.guards) if (o2 !== g && o2.stunT <= 0 && o2.state === 'task') o2.react(g.x, g.z, g.floor);
}
// a trick that worked: points and the combo, on screen
export function score(kind) {
  const r = mischief.add(kind, G.simT);
  if (!r) return;
  const combo = r.mult > 1 ? ` · ${S.traps.combo(r.mult)}` : '';
  flash(`+${r.points}${combo}${r.mult >= CFG.traps.combo.max ? ` · ${S.traps.masterpiece}!` : ''}`, 2.2, r.mult >= CFG.traps.combo.max ? '#ff9f43' : '#ffd166');
  G.boardDirty = true;
}

// the alarm clock: a W2a-style device for the guard's «switch X off» (brain.deviceTask)
function clockDevice(it) {
  const p = it.mesh.position, f = G.level.floorIndex ? G.level.floorIndex(p.y) : 0;
  const dev = { kind: 'clock', id: it.id, x: p.x, y: p.y, z: p.z, floor: f, stand: [p.x + 0.5, p.z + 0.5, f], on: true, ringing: true, uses: 1, dead: false, claimed: null };
  dev.guardOff = () => { dev.on = false; dev.ringing = false; dev.claimed = null; consume(it); };
  dev.answer = () => {};
  return dev;
}

// the player on their own soap / marbles (decision §7.2): a fall noise and «Ой!»; a slide off it on a
// phone / PC (not in VR: moving you against your will is sickening)
function selfTrip(it) {
  const p = G.player, S2 = CFG.traps.self;
  G.noise.emit(p.head.x, p.head.z, S2.noise, 'drop', { source: 'player' });
  playSlip({ x: p.head.x, y: 0.3, z: p.head.z }, false);
  flash(S.traps.selfSlip, 2, '#ff9f43');
  local.stats.self++;
  if (!G.inVR) {
    const dx = p.head.x - it.mesh.position.x, dz = p.head.z - it.mesh.position.z, d = Math.hypot(dx, dz) || 1;
    p.teleport(p.head.x + dx / d * S2.slide, p.head.z + dz / d * S2.slide, p.yaw, p.floorY);
  }
}

// the marbles, spread round where the bag was put down
function spreadOf(it) {
  let m = local.spread.get(it);
  if (!m) {
    const B = new Builder();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996, r = 0.15 + (i % 5) * 0.17;
      B.add(new THREE.SphereGeometry(0.014, 6, 4).translate(Math.cos(a) * r, 0.014, Math.sin(a) * r), [0x3f8ad8, 0xe84a3a, 0x5fd38d, 0xffd166][i % 4]);
    }
    m = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.name = 'marbles';
    G.scene.add(m);
    local.spread.set(it, m);
  }
  return m;
}

export const trapsSystem = {
  id: 'traps',
  init() {
    local.stats = newStats();
    mischief.reset();
    // the bucket the guards may wear (patrol.place shows it in the pose 'bucket')
    for (const g of G.guards || [G.patrol]) {
      const B = new Builder();
      B.cyl(0.2, 0.16, 0.3, 0, 1.52, 0, 0x8a9098, 12);
      g.bucketMesh = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
      g.bucketMesh.visible = false;
      g.upper.add(g.bucketMesh);
    }
    local.lastPhase = null;
  },
  world(dt) {
    if (G.isGuest) return;   // with friends the traps run on the host
    const { round, loot, player } = G;
    // a new round: the van loaded from the stock, the points from zero
    if (round.phase !== local.lastPhase) {
      if (round.phase === 'ready') { loadVan(); mischief.reset(); local.stats = newStats(); }
      local.lastPhase = round.phase;
    }
    if (round.phase === 'result') return;
    const T = CFG.traps;
    for (const it of loot.items) {
      if (!it.trap || it.gone) continue;
      if (it.held) { it.armed = false; it.door = null; it.inVan = false; it.warned = false; const s = local.spread.get(it); if (s) s.visible = false; continue; }
      // VR: let go by a door
      if (!it.armed && (it.trap === 'bucket' || it.trap === 'rope') && it.state === 'fall' && G.inVR && vrAttach(it)) continue;
      // a floor trap comes to rest: armed
      if (!it.armed && it.state === 'rest' && T.kinds[it.trap].place === 'floor' && !it.inVan && onFloor(it)) {
        it.armed = true; it.armedAt = G.simT; it.clockT = 0; it.playerClear = false;
        local.stats.placed[it.trap] = (local.stats.placed[it.trap] || 0) + 1;
        if (it.trap === 'marbles') { const m = spreadOf(it); m.position.copy(it.mesh.position); m.visible = true; }
        flash(S.traps.placed(S.traps.names[it.trap]), 2, '#5fd38d');
      }
      // put down where it cannot work (the stairs, on furniture): «Тут не можна» once; back in the van: quietly
      if (!it.armed && it.state === 'rest' && !it.inVan && !it.warned && T.kinds[it.trap].place === 'floor' && !(inCargo(it.mesh.position.x, it.mesh.position.z) && it.mesh.position.y > 0.2)) { it.warned = true; flash(S.traps.notHere, 2, '#ff9f43'); }
      if (!it.armed) continue;
      const p = it.mesh.position, K = T.kinds[it.trap];
      // the alarm clock: rings after `delay` s, the guard goes to switch it off (a W2a device task)
      if (it.trap === 'clock') {
        it.clockT += dt;
        if (it.clockT >= K.delay && !it.dev) it.dev = clockDevice(it);
        if (it.dev && it.dev.ringing) {
          if ((it.ringT = (it.ringT || 0) - dt) <= 0) { it.ringT = K.every; playAlarmClock(posOf(it), occ(it)); G.noise.emit(p.x, p.z, K.noise, 'device', { y: p.y, source: 'world', device: it.dev }); }
          if (it.dev.claimed && !it.dev.claimed.queue.some((st) => st.dev === it.dev)) it.dev.claimed = null;
          if (it.clockT >= K.delay + K.ring) { it.dev.ringing = false; consume(it); }
        }
        continue;
      }
      // you on your own soap / marbles
      if (K.place === 'floor') {
        const dp = Math.hypot(player.head.x - p.x, player.head.z - p.z);
        if (dp > K.radius + 0.3) it.playerClear = true;
        else if (it.playerClear && dp < K.radius && Math.abs((player.floorY || 0) - p.y) < 0.6) { it.playerClear = false; selfTrip(it); }
      }
      // the bucket: whoever opens that door gets it (the guard: knocked out; you: it just falls)
      if (it.door) {
        const d = it.door;
        if (Math.abs(d.angle - (it.angle0 || 0)) > 0.25) {
          const g = G.guards.filter((x) => x.stunT <= 0).sort((a, b) => Math.hypot(a.x - d.cx, a.z - d.cz) - Math.hypot(b.x - d.cx, b.z - d.cz))[0];
          if (it.trap === 'bucket' && d.lastUser === 'patrol' && g && Math.hypot(g.x - d.cx, g.z - d.cz) < 2) spring(it, g);
          else if (it.trap === 'bucket') { playBucket(posOf(it), occ(it)); flash(S.traps.bucketFell, 2, '#93a1b8'); consume(it); }
          else if (it.trap === 'rope') { /* the rope stays across an open doorway too */ }
          if (it.gone) continue;
        }
      }
      // a guard steps on it / walks through the rope
      for (const g of G.guards) {
        if (g.stunT > 0 || it.gone) continue;
        if (Math.abs((g.y || 0) - (it.door ? it.door.y0 : p.y)) > 0.8) continue;
        const cx = it.door ? it.door.cx : p.x, cz = it.door ? it.door.cz : p.z;
        const d = Math.hypot(g.x - cx, g.z - cz), r = K.radius || 0;
        if (it.trap === 'bucket') continue;   // the door does it
        if (g.brain.trapsHit.has(it.trap) && d < r + T.seeAhead && !it.avoided) {   // the same kind again: it sees it
          it.avoided = true; local.stats.avoided++;
          g.brain.avoidTrap(it, () => consume(it));
          continue;
        }
        if (d < r && (it.trap !== 'rope' || g.speed > 0.3)) spring(it, g);
      }
    }
  },
};
