// «За сторожа» (W15, plan-multiplayer §2 (в)): in a room with friends one player may be the guard. The
// host still counts the world: the guard's body (on whichever device) gives the pose of the first guard
// (enemies/patrol.js, manual mode); the guard's screen shows thieves only as the game sees them (in the
// light, or close, with a line of sight) and only the noises the guard would hear. «Схопити» catches a
// thief in reach in front; walking into one catches it too. «Викликати Центральну» — the full alarm — only
// after the guard saw a thief or noticed missing loot. A caught thief sits in the van for a while
// (the bench), then plays on. The guard wins when every thief is in the van at once, or when the clock
// beats them; the thieves win by delivering the goal and gathering at the van.
// Pre: the guard's pose, the bench clocks, the fence round the van. World (host): who won. Present: the
// guard's own view (its body hidden, its flashlight from its eyes, thieves drawn only when seen).
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { progress } from '../game/contracts.js';
import { loadSetting, saveSetting } from '../settings.js';
import { money } from '../ui/board.js';
import { S } from '../i18n/index.js';

const H = { evidence: false, caught: 0, thieves: 0, gv: new Set(), lastPhase: null, benchShown: -1, fenceT: 0, said: null, breathWas: false, resultSaved: null, missed: 0 };
export const guardView = H;   // what the guard's device knows (from the host on a guest)
export const isGuard = () => G.role === 'guard';

// Everybody: who plays the guard now (null = the AI). The host also switches the first guard's mind off.
export function applyGuard(pid, myPid) {
  const was = G.guardPid;
  G.guardPid = pid || null;
  G.humanGuard = !!G.guardPid;
  if (G.alert) G.alert.manualOnly = G.humanGuard;
  if (G.isHost && was !== G.guardPid && G.patrol) G.patrol.setManual(G.humanGuard);
  const role = G.guardPid && G.guardPid === myPid ? 'guard' : 'thief';
  if (role !== G.role) setRole(role);
}

function guardStart() {
  const [x, z, y] = (G.patrol.env.guard && G.patrol.env.guard.start) || [-7.4, -10.4, 0];
  return { x, z, y: y || 0, yaw: Math.PI };
}
function setRole(role) {
  G.role = role;
  const P = G.patrol, me = G.player;
  if (role === 'guard') {
    const s = guardStart();
    me.teleport(s.x, s.z, s.yaw, s.y);
    if (G.noise) G.noise.filter = (e) => e.source === 'patrol' || P.audible(e, e.source === 'world' ? e.y : (e.who || me).floorY) > 0;
  } else {
    if (G.noise) G.noise.filter = null;
    P.body.material.visible = true;
    if (G.level) { const S0 = G.level.spawn; me.teleport(S0.x, S0.z, S0.yaw); }
  }
  G.boardDirty = true;
}

// ---------- the guard's buttons ----------
// a thief the guard's device thinks is in reach (the host decides for real)
function nearThief() {
  const H2 = CFG.humanGuard, P = G.player, list = G.netRemotes ? G.netRemotes() : [];
  return list.some((r) => !r.lost && r.group.visible && Math.hypot(r.head.x - P.head.x, r.head.z - P.head.z) < H2.grabDist + 0.4
    && Math.abs(Math.atan2(Math.sin(Math.atan2(-(r.head.x - P.head.x), -(r.head.z - P.head.z)) - P.yaw), Math.cos(Math.atan2(-(r.head.x - P.head.x), -(r.head.z - P.head.z)) - P.yaw))) < H2.grabHalfAngle + 0.2);
}
// what the context button says on the guard's phone, and whether it is grey
export function guardButton() {
  if (nearThief()) return { label: S.hguard.grab, off: false };
  return { label: S.hguard.central, off: !H.evidence || G.round.phase !== 'heist' || G.alert.full };
}
export function guardInteract() {
  if (nearThief()) { if (G.isGuest) G.netIntent('grab'); else G.patrol.grabAsk = true; return; }
  if (!H.evidence) { flash(S.hguard.needEvidence, 2.5, '#93a1b8'); return; }
  if (G.isGuest) G.netIntent('central'); else guardCentral();
}
// host: the alarm the guard asked for (or why not). Returns true when it rang.
export function guardCentral() {
  const P = G.patrol;
  if (CFG.humanGuard.needEvidence && !P.evidence) return false;
  if (G.round.phase !== 'heist' || G.alert.full) return false;
  G.alert.setFull(S.cause.central, P.x, P.z);
  flash(S.hguard.centralCalled, 3, '#ff5c5c');
  if (G.netEvent) G.netEvent('flash', { t: S.hguard.centralCalled, c: '#ff5c5c', s: 3 });
  return true;
}

// ---------- the bench ----------
// host: a guard caught `who` (contract.js caught() calls this while a friend plays the guard)
export function onBench(who) {
  const s = CFG.humanGuard.bench, name = who === G.player ? (G.netName ? G.netName() : '') : who.name;
  if (who === G.player) localBench(s);
  else {
    who.benchT = s;
    if (who.desk) { who.desk.netHolder = null; who.desk.drop(new THREE.Vector3()); who.desk = null; }
  }
  flash(S.hguard.benched(name, s), 3, '#ff5c5c');
  if (G.netEvent) G.netEvent('bench', { pid: who === G.player ? G.netPid() : who.id, name, s });
}
// this device's thief goes to the van for s seconds (its loot falls where it was)
export function localBench(s) {
  const { hands, player, level } = G;
  if (!G.isGuest) for (const it of hands.heldItems()) { hands.detach(it); it.drop(new THREE.Vector3()); }
  else hands.desk = null;
  G.benchT = s; H.benchShown = -1;
  const S0 = level.spawn;
  player.teleport(S0.x, S0.z, S0.yaw);
  G.comfort.fadeIn(0.6);
}

// guard device: the result line on the summary instead of the wallet line; the guard's own record
export function guardResultText() {
  const R = G.round.result;
  if (!R) return '';
  const total = G.loot.items.filter((i) => !i.throwable && !i.trap && !i.prop && !i.heavy).reduce((n, i) => n + i.def.value, 0);
  return S.hguard.result(R.kind === 'caught' || R.kind === 'late', H.caught, money(Math.max(0, total - R.sum)));
}

export const humanGuard = {
  id: 'humanGuard',
  init() {
    G.role = 'thief'; G.guardPid = null; G.humanGuard = false; G.benchT = 0;
    G.onBench = onBench; G.guardHudText = () => S.hguard.hud(H.caught, H.thieves, H.evidence);
  },
  input() {
    // VR: the guard's button is A (the breath button of a thief)
    if (isGuard() && G.inVR) { if (G.breathDown && !H.breathWas) guardInteract(); H.breathWas = !!G.breathDown; }
  },
  pre(dt) {
    const { player, round } = G;
    // this device's thief on the bench: stays in the van, a line every second
    if (G.benchT > 0) {
      G.benchT -= dt;
      const S0 = G.level.spawn;
      if (Math.hypot(player.head.x - S0.x, player.head.z - S0.z) > 0.6) player.teleport(S0.x, S0.z, player.yaw);
      const left = Math.ceil(Math.max(0, G.benchT));
      if (left !== H.benchShown) { H.benchShown = left; flash(left > 0 ? S.hguard.benchMe(left) : S.hguard.free, 1.2, left > 0 ? '#ffb347' : '#5fd38d'); }
      if (G.benchT <= 0) G.benchT = 0;
    }
    if (!G.humanGuard) return;
    // the host: the first guard stands where the guard player is
    if (G.isHost) {
      const src = isGuard() ? player : (G.netRemote ? G.netRemote(G.guardPid) : null);
      if (src) G.patrol.manualPose = { x: src.head.x, z: src.head.z, floorY: src.floorY || 0, yaw: src.yaw };
      G.patrol.manualArmed = round.phase === 'heist' || round.phase === 'escape';   // nobody is caught before the clock or after the end
      H.evidence = !!G.patrol.evidence; H.caught = G.patrol.caughtCount || 0;
      H.gv = new Set([...(G.patrol.humanSees || [])].map((p) => (p === player ? G.netPid() : p.id)));
      // the guard's device hears «зникло» / «бачу» once
      if (G.patrol.evidence && H.said !== G.patrol.evidence) {
        H.said = G.patrol.evidence;
        const t = G.patrol.evidence === 'missing' ? S.hguard.missing(G.patrol.evidenceItem || '') : S.hguard.seen;
        if (isGuard()) flash(t, 3, '#ffd166'); else if (G.netEvent) G.netEvent('guardnote', { t });
      }
      if (!G.patrol.evidence) H.said = null;
      if ((G.patrol.missed || 0) !== H.missed) {   // «Схопити» with nobody in reach
        H.missed = G.patrol.missed || 0;
        if (H.missed) { if (isGuard()) flash(S.hguard.missed, 1.5, '#93a1b8'); else if (G.netEvent) G.netEvent('guardnote', { t: S.hguard.missed }); }
      }
    }
    // the guard keeps away from the van (the thieves' drop-off ring is beside it)
    if (isGuard() && round.phase !== 'result') {
      const V = CFG.round.vanZone, d = Math.hypot(player.head.x - V.x, player.head.z - V.z), F = CFG.humanGuard.vanFence;
      if (d < F) {
        const k = F / Math.max(0.01, d);
        player.teleport(V.x + (player.head.x - V.x) * k, V.z + (player.head.z - V.z) * k, player.yaw, player.floorY);
        if ((H.fenceT -= dt) <= 0) { H.fenceT = 3; flash(S.hguard.fence, 2, '#93a1b8'); }
      }
    }
    // a new round: the guard starts where the guard starts
    if (round.phase !== H.lastPhase) {
      if (round.phase === 'ready') {   // a new round: the van is empty, nothing seen, nobody caught yet
        G.benchT = 0; for (const r of (G.netRemotes ? G.netRemotes() : [])) r.benchT = 0;
        if (G.isHost && G.patrol.manual) { G.patrol.evidence = null; G.patrol.evidenceItem = null; G.patrol.caughtCount = 0; }
      }
      if (round.phase === 'ready' && H.lastPhase && isGuard()) { const s = guardStart(); player.teleport(s.x, s.z, s.yaw, s.y); }
      if (round.phase === 'result' && isGuard() && H.resultSaved !== round.result) {   // the guard's own record
        H.resultSaved = round.result;
        const R = round.result, rec = loadSetting('guard', { rounds: 0, wins: 0, caught: 0 });
        rec.rounds++; rec.caught += H.caught; if (R && (R.kind === 'caught' || R.kind === 'late')) rec.wins++;
        saveSetting('guard', rec);
      }
      H.lastPhase = round.phase;
    }
  },
  // host: who won
  world() {
    if (!G.humanGuard || !G.isHost || !G.net) return;
    const { round, loot } = G;
    if (round.phase !== 'heist' && round.phase !== 'escape') return;
    const thieves = [...(isGuard() ? [] : [G.player]), ...(G.netRemotes ? G.netRemotes().filter((r) => r.id !== G.guardPid) : [])];
    H.thieves = thieves.length;
    if (!thieves.length) return;
    const benched = (p) => (p === G.player ? G.benchT > 0 : p.benchT > 0);
    if (thieves.every(benched)) { flash(S.hguard.allCaught, 4, '#ff5c5c'); if (G.netEvent) G.netEvent('flash', { t: S.hguard.allCaught, c: '#ff5c5c', s: 4 }); round.finish('caught'); return; }
    if (round.phase === 'heist') {
      const active = thieves.filter((p) => !benched(p) && !p.lost), pr = progress(G.contract, loot.tally(), loot);
      if (pr && pr.done && active.length && active.every((p) => round.atVan(p.head))) {
        flash(S.hguard.thievesLeft, 4, '#5fd38d'); if (G.netEvent) G.netEvent('flash', { t: S.hguard.thievesLeft, c: '#5fd38d', s: 4 });
        round.finish('left');
      }
    }
  },
  // the guard's own view: its body hidden, its flashlight from its eyes; thieves only when the game sees them
  present() {
    if (!G.humanGuard) return;
    const P = G.patrol, list = G.netRemotes ? G.netRemotes() : [];
    if (isGuard()) {
      const me = G.player;
      P.x = me.head.x; P.z = me.head.z; P.y = me.floorY || 0; P.heading = me.yaw; P.headYaw = 0;
      P.body.material.visible = false;
      P.setMark(null); P.drawBar(0); P.place();
      for (const r of list) r.group.visible = !r.lost && H.gv.has(r.id);
    }
  },
};
