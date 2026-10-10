// Playing with friends (W8a, plan-multiplayer §1, §4): the room, the host and the guests.
// The host counts the world as in solo play and keeps the friends' bodies in G.players (the guards see
// them, their steps are heard, they carry loot); 15 times a second it sends what changed. A guest moves
// its own body, sends where it is 20 times a second with what its microphone hears, asks the host to
// open a door / take or put down an item / use a device, and draws the host's world (G.isGuest: the
// systems that count the world stand still on a guest).
// Pre: what arrived (friends' poses, the host's state). Act (host): the friends' hands and the drop-off
// ring. World (host): the friends' voices. Present: what goes out. Frame: the lobby.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { VERSION } from '../version.js';
import { G, $, params } from './state.js';
import { flash } from './messages.js';
import { openTransport, sim } from '../net/transport.js';
import { newCode, roomLink, roomFromUrl, playerId, validCode, prettyCode } from '../net/room.js';
import { RemotePlayer } from '../net/remotePlayer.js';
import { hostState, guestApply, guestGuardSounds, forgetSent, resetGuestView } from '../net/sync.js';
import { Lobby } from '../ui/lobby.js';
import { loadSetting, saveSetting } from '../settings.js';
import { applyDifficulty } from '../game/difficulty.js';
import { contractById } from '../game/contracts.js';
import { newRound, caught } from './contract.js';
import { syncStartScreen } from './startScreen.js';
import { useDevice } from './distract.js';
import { voiceNoise } from './heist.js';
import { storyNetEcho } from './story.js';
import { playThud, playGlass, playHeartbeat } from '../audio/audio.js';
import { S } from '../i18n/index.js';

const UP = new THREE.Vector3(0, 1, 0);
const N = {
  t: null, role: null, code: null, pid: playerId(), name: '', thief: 'zoya',
  remotes: new Map(),        // pid -> RemotePlayer
  peerOf: new Map(), pidOf: new Map(),   // pid <-> transport peer id
  info: new Map(),           // pid -> { name, thief, mic }
  hostPeer: null, hostPid: null, hostName: '', welcomed: false, lastHost: 0, hostLost: false,
  status: '', statusBad: false, card: '', sendT: 0, findT: 0, stage: '',
  events: [], stats: { sent: 0, got: 0, snapshots: 0, rejoins: 0, intents: 0 },
};
let lobby = null;

const isHost = () => N.role === 'host';
const send = (msg, to) => { if (N.t) { N.t.send(msg, to); N.stats.sent++; } };
const hostPlayers = () => [{ pid: N.pid, head: G.player.head, floorY: G.player.floorY, yaw: G.player.yaw, crouched: G.player.crouched || G.player.virtualCrouch, running: G.player.running, lost: false }, ...N.remotes.values()].map((p) => (p.pid ? p : Object.assign(p, { pid: p.id })));
const nameOf = (pid) => (pid === N.pid ? N.name : (N.info.get(pid) || {}).name || '?');

function setStatus(text, bad = false) { N.status = text; N.statusBad = bad; refreshLobby(); }
function lobbyPlayers() {
  const me = { pid: N.pid, name: N.name, thief: N.thief, host: isHost(), you: true, mic: G.mic.state === 'on' && !G.mic.noMic };
  if (isHost()) return [me, ...[...N.remotes.values()].map((r) => ({ pid: r.id, name: r.name, thief: r.thief, lost: r.lost, mic: (N.info.get(r.id) || {}).mic }))];
  return N.lobbyList ? N.lobbyList.map((p) => ({ ...p, you: p.pid === N.pid })) : [me];
}
function refreshLobby() {
  if (!lobby) return;
  lobby.show({ inRoom: !!N.t, code: N.code, link: N.code ? roomLink(N.code, G.level.id) : '', players: lobbyPlayers(), status: N.status, statusBad: N.statusBad, card: N.t ? '' : N.card, lost: N.hostLost });
}
function lobbyMessage() { return { type: 'lobby', players: lobbyPlayers().map(({ you, ...p }) => p) }; }

// ---------- the room ----------
async function open(code, role) {
  if (N.t) leave(true);
  N.code = code; N.role = role; N.welcomed = role === 'host'; N.hostLost = false; N.findT = 0; N.stage = 'find';
  saveSetting('netName', N.name); saveSetting('netThief', N.thief);
  setStatus(role === 'host' ? S.net.status.opening : S.net.status.find);
  try {
    N.t = await openTransport({
      kind: params.get('net') === 'local' ? 'local' : 'trystero', code,
      onMessage, onPeerJoin, onPeerLeave,
      onStatus: (s) => { if (s.step === 'find' && N.t && role === 'guest') setStatus(S.net.status.findNext); },
    });
  } catch (e) {
    N.t = null; N.role = null;
    setStatus(S.net.status.failed(String(e.message || e).slice(0, 120)), true);
    return;
  }
  G.net = N;
  G.isHost = role === 'host';
  if (role === 'host') { N.hostPid = N.pid; setStatus(S.net.status.waiting); }
  else for (const id of N.t.peers()) hello(id);
  refreshLobby();
}
function leave(quiet) {
  if (N.t) { send({ type: 'bye', pid: N.pid }); N.t.close(); }
  for (const r of N.remotes.values()) dropRemote(r);
  N.t = null; N.role = null; N.welcomed = false; N.hostPeer = null; N.lobbyList = null;
  G.net = null; G.isGuest = false; G.isHost = true;
  G.players = [G.player];
  if (!quiet) setStatus('');
}
function hello(peer) {
  send({ type: 'hello', pid: N.pid, v: VERSION, proto: CFG.net.protocol, map: G.level.id, name: N.name, thief: N.thief, q: CFG.player.quietSpeed, sh: N.shouts || 0, mic: G.mic.state === 'on' && !G.mic.noMic, dev: G.MODE.mode }, peer);
}
function onPeerJoin(peer) {
  if (N.role === 'guest' && !N.welcomed) { setStatus(S.net.status.connecting(S.net.host)); hello(peer); }
}
function onPeerLeave(peer) {
  const pid = N.pidOf.get(peer);
  if (pid && N.remotes.has(pid)) N.remotes.get(pid).lastHeard = Math.min(N.remotes.get(pid).lastHeard, performance.now() - CFG.net.peerLostAfter * 1000);
}

// ---------- messages ----------
function onMessage(m, peer) {
  if (!m || typeof m !== 'object') return;
  N.stats.got++;
  if (isHost()) hostMessage(m, peer);
  else guestMessage(m, peer);
}

function hostMessage(m, peer) {
  const pid = N.pidOf.get(peer);
  const r = pid && N.remotes.get(pid);
  if (m.type === 'hello') {
    if (m.proto !== CFG.net.protocol || m.v !== VERSION) { send({ type: 'deny', why: 'version' }, peer); return; }
    let rp = N.remotes.get(m.pid);
    if (!rp && N.remotes.size + 1 >= CFG.net.maxThieves) { send({ type: 'deny', why: 'full' }, peer); return; }
    if (rp) { N.stats.rejoins++; if (rp.lost) flash(S.net.friendBack(rp.name), 2.5, '#5fd38d'); }
    else {
      rp = new RemotePlayer({ id: m.pid, name: String(m.name || '?').slice(0, 12), thief: m.thief });
      rp.pid = m.pid;
      N.remotes.set(m.pid, rp);
      G.scene.add(rp.group);
      const S0 = G.level.spawn;
      rp.push({ x: S0.x, z: S0.z, y: 1.65, fy: 0, yaw: S0.yaw });
      flash(S.net.friendJoined(rp.name), 2.5, '#5fd38d');
    }
    rp.quietSpeed = +m.q || CFG.player.quietSpeed;
    rp.lastHeard = performance.now();
    rp.mic.shouts = rp.mic.shoutSeen = +m.sh || 0;   // its shout counter as it is now (a reloaded tab starts from 0)
    N.info.set(m.pid, { name: rp.name, thief: rp.thief, mic: !!m.mic, dev: m.dev });
    N.peerOf.set(m.pid, peer); N.pidOf.set(peer, m.pid);
    forgetSent();
    send({ type: 'welcome', you: m.pid, map: G.level.id, host: N.name, hostPid: N.pid, snap: hostState(true, N.pid, hostPlayers()) }, peer);
    N.stats.snapshots++;
    send(lobbyMessage());
    refreshLobby();
    return;
  }
  if (!r) { if (m.type === 'pose') send({ type: 'rehello' }, peer); return; }   // gone too long: it joins anew
  r.lastHeard = performance.now();
  if (m.type === 'pose') {
    r.push({ x: +m.x, z: +m.z, y: +m.y, fy: +m.fy, yaw: +m.yaw, pitch: +m.pitch, cr: m.cr, sp: +m.sp, run: m.run });
    r.mic.live = !!m.ml; r.mic.level = m.lv || 'quiet'; r.mic.breath = !!m.br;
    r.mic.whisper = !!m.wh;   // W7: the guest whispers (Шепотун hears it; an older guest without the field: never)
    if (m.sh > r.mic.shouts) r.mic.shouts = m.sh;
  } else if (m.type === 'act') hostIntent(r, m);
  else if (m.type === 'bye') { r.lastHeard = 0; }
}

// a guest asks for something; the host does it as if that player did it here
function hostIntent(r, m) {
  N.stats.intents++;
  const { level, loot } = G;
  if (m.a === 'door' || m.a === 'doorStop' || m.a === 'doorSwing') {
    const d = level.doors[m.i];
    if (!d) return;
    if (m.a === 'doorStop') { d.release(); return; }
    if (m.a === 'doorSwing') { d.swingTime(+m.time || CFG.doors.fastTime); return; }
    d.lastUser = 'player';
    d.toggle(r.head.x, r.head.z, +m.time || CFG.doors.fastTime);
  } else if (m.a === 'take') {
    const it = loot.items[m.i];
    if (!it || r.desk || !it.takeable || it.held || it.state === 'fall') return;
    if (Math.hypot(it.mesh.position.x - r.head.x, it.mesh.position.z - r.head.z) > 2.5) return;
    r.desk = it; it.netHolder = r.id; it.thrown = false;
    it.holders.length = 0; it.holders.push('friend'); it.state = 'held';
  } else if (m.a === 'put') {
    const it = r.desk;
    if (!it) return;
    r.desk = null; it.netHolder = null; it.holders.length = 0;
    if (m.atVan && !it.throwable && G.round.atVan(r.head)) loot.deliver(it);
    else it.drop(new THREE.Vector3());
  } else if (m.a === 'dev') {
    const dev = G.devices && G.devices.byId(m.id);
    if (dev) useDevice(dev);
  }
}

function guestMessage(m, peer) {
  if (m.type === 'deny') { setStatus(m.why === 'full' ? S.net.status.full : S.net.status.version, true); leave(true); refreshLobby(); return; }
  if (m.type === 'welcome') {
    if (m.map !== G.level.id) { setStatus(S.net.status.reloadMap); location.replace(roomLink(N.code, m.map)); return; }
    N.welcomed = true; N.hostPeer = peer; N.hostPid = m.hostPid; N.hostName = m.host; N.lastHost = performance.now(); N.hostLost = false;
    becomeGuest();
    guestState(m.snap);
    N.stats.snapshots++;
    setStatus(S.net.status.inRoom(m.host));
    return;
  }
  if (peer !== N.hostPeer) return;   // the logic talks host <-> guest only
  if (m.type === 'rehello') { hello(peer); return; }
  N.lastHost = performance.now();
  if (N.hostLost) { N.hostLost = false; setStatus(S.net.status.inRoom(N.hostName)); }
  if (m.type === 'state') guestState(m);
  else if (m.type === 'ev') guestEvent(m);
  else if (m.type === 'lobby') { N.lobbyList = m.players; for (const p of m.players) N.info.set(p.pid, p); refreshLobby(); }
}

// a guest from now on: the world comes from the host
function becomeGuest() {
  G.isGuest = true; G.isHost = false;
  resetGuestView();
  for (const g of G.guards) if (!Object.getOwnPropertyDescriptor(g, 'activity')) Object.defineProperty(g, 'activity', { get() { return this.netActivity || ''; }, configurable: true });
}

function guestState(s) {
  // the contract and the difficulty are the host's
  const [cid, diff] = s.c || [];
  if (cid && (cid !== G.contract.id || diff !== G.difficulty)) {
    G.contract = contractById(cid); G.contractId = G.contract.id; G.difficulty = diff;
    applyDifficulty(G.difficulty, G.contract);
    syncStartScreen(); G.boardDirty = true;
  }
  const moved = guestApply(s, N.pid);
  if (moved && G.round.env.onPhase) G.round.env.onPhase(moved);
  // the other players (the host and other guests)
  const now = performance.now(), seen = new Set();
  for (const [pid, x, z, y, fy, yaw, cr, run, lost] of s.p) {
    if (pid === N.pid) continue;
    seen.add(pid);
    let r = N.remotes.get(pid);
    if (!r) {
      const inf = N.info.get(pid) || {};
      r = new RemotePlayer({ id: pid, name: inf.name || (pid === N.hostPid ? N.hostName : '?'), thief: inf.thief });
      r.pid = pid; N.remotes.set(pid, r); G.scene.add(r.group);
    }
    if (!lost) r.push({ x, z, y, fy, yaw, cr, run, sp: 0 }, now);
  }
  for (const [pid, r] of N.remotes) if (!seen.has(pid)) { dropRemote(r); N.remotes.delete(pid); }
  G.boardDirty = true;
}

function guestEvent(m) {
  const { noise, round } = G;
  switch (m.k) {
    case 'noise': {
      noise.emit(m.x, m.z, m.r, m.kind, { y: m.y, source: 'net' });
      const pos = { x: m.x, y: (m.y || 0) + 0.3, z: m.z }, occ = G.level.soundOccluded(G.player.head.x, G.player.head.z, m.x, m.z);
      if (m.kind === 'drop') playThud(pos, occ, 1, false);
      else if (m.kind === 'glass') playGlass(pos, occ);
      break;
    }
    case 'flash': flash(m.t, m.s || 2.5, m.c); break;
    case 'say': { const g = G.guards[m.g]; if (g) g.env.say(m.text, true); break; }
    case 'wecho': storyNetEcho(m, m.who === N.pid); break;   // W7: Шепотун's echo (yours: its card)
    case 'gsnd': { const g = G.guards[m.g]; if (g) g.env.sound(m.kind, m.x, m.z, m.o || {}); break; }
    case 'caught':
      if (m.pid === N.pid) caught(G.player);
      else flash(S.net.caughtFriend(nameOf(m.pid)), 2.5, '#ff5c5c');
      break;
    case 'result':
      G.hands.desk = null;
      round.result = m.R; round.alarmed = !!m.alarmed; round.phase = 'result'; G.caughtT = -1;
      if (round.env.onPhase) round.env.onPhase('result');
      break;
    case 'newround': newRound(true); break;
    case 'pause': flash(S.net.hostPaused, 3, '#93a1b8'); break;
  }
}

// ---------- what the rest of the game calls ----------
// the host sends an event to everybody (nothing offline or on a guest)
export function netEvent(k, data) {
  if (!N.t || !isHost() || !N.remotes.size) return;
  send({ type: 'ev', k, ...data });
  if (k === 'newround') forgetSent();   // the guests reset their copy: the next state is whole
}
// a guest asks the host to do something (door, take, put, device)
export function netIntent(a, data = {}) { if (N.t && N.role === 'guest' && N.hostPeer) send({ type: 'act', a, ...data }, N.hostPeer); }
// the friends' items still in hand when the round ends (game/round.js: stowed when you get away)
export function netHeld() { return [...N.remotes.values()].map((r) => r.desk).filter(Boolean); }
// for the report and the tests
export function netState() {
  return {
    role: N.role, code: N.code, pid: N.pid, welcomed: N.welcomed, hostLost: N.hostLost, status: N.status,
    players: lobbyPlayers().map((p) => ({ pid: p.pid, name: p.name, thief: p.thief, host: !!p.host, lost: !!p.lost })),
    remotes: [...N.remotes.values()].map((r) => ({ pid: r.id, x: +r.head.x.toFixed(2), z: +r.head.z.toFixed(2), lost: r.lost, desk: r.desk ? r.desk.id : null, inGame: G.players.includes(r) })),
    stats: { ...N.stats }, transport: N.t ? N.t.diag() : null,
  };
}

// a caught friend (host): the guest gets its 1 s of black; the round ends for everybody (W10 adds the bench)
export function netCaught(who) {
  flash(S.net.caughtFriend(who.name), 2.5, '#ff5c5c');
  netEvent('caught', { pid: who.id });
}

function dropRemote(r) {
  if (r.desk) { r.desk.netHolder = null; if (G.isHost) r.desk.drop(new THREE.Vector3()); r.desk = null; }   // it falls where the friend was
  r.dispose();
}

export const net = {
  id: 'net',
  init() {
    G.net = null; G.isGuest = false; G.isHost = true;
    G.netEvent = netEvent; G.netIntent = netIntent; G.netHeld = netHeld; G.netCaught = netCaught;
    N.name = loadSetting('netName', ''); N.thief = loadSetting('netThief', 'zoya');
    const box = $('netbox');
    if (!box) return;
    const code = roomFromUrl();
    lobby = new Lobby(box, {
      create: (name, thief) => { N.name = name; N.thief = thief; open(newCode(), 'host'); },
      join: (c, name, thief) => { N.name = name; N.thief = thief; if (!validCode(c)) { setStatus(S.net.status.notFound(prettyCode(c)), true); return; } open(c, 'guest'); },
      leave: () => { leave(); refreshLobby(); },
      solo: () => { const u = new URL(location.href); u.searchParams.delete('room'); location.replace(u.toString()); },
      share: async () => {
        const link = roomLink(N.code, G.level.id);
        try { if (navigator.share && G.PHONE) { await navigator.share({ title: S.net.title, text: S.net.shareText(prettyCode(N.code)), url: link }); return; } } catch { /* cancelled */ }
        try { await navigator.clipboard.writeText(link); flash(S.net.copied, 2); setStatus(S.net.copied); } catch { /* the link is on the screen */ }
      },
    }, { name: N.name, thief: N.thief, code: code || '' });
    if (code) { N.card = S.net.joinCard(prettyCode(code), G.level.id === 'mansion' ? S.mansion.name : S.mansion.mapDacha); refreshLobby(); }
    // a minimized host draws no frames: «пауза» for the guests and a timer says «I am here» (Android keeps
    // timers going once a second in the background; iPhone stops the page, the guests then wait for it)
    document.addEventListener('visibilitychange', () => {
      clearInterval(N.kaTimer); N.kaTimer = null;
      if (!N.t || !isHost() || !N.remotes.size || !document.hidden) return;
      netEvent('pause', {});
      N.kaTimer = setInterval(() => send({ type: 'ka' }), 1000);
    });
    // the host's voice lines, guard sounds, noises and messages for the guests (offline nothing listens)
    G.noise.on((e) => { if (isHost() && e.source !== 'net') netEvent('noise', { x: +e.x.toFixed(2), z: +e.z.toFixed(2), y: +(e.y || 0).toFixed(2), r: +e.radius.toFixed(2), kind: e.kind }); });
  },

  pre(dt, now) {
    if (!N.t) return;
    const t = performance.now();
    if (isHost()) {
      // friends: drawn where they were a moment ago; a silent one stays out of the guards' sight
      for (const [pid, r] of N.remotes) {
        const wasLost = r.lost;
        r.update(dt, t, true);
        if (r.lost && !wasLost) flash(S.net.friendLost(r.name), 2.5, '#ffb347');
        if (t - r.lastHeard > CFG.net.peerGoneAfter * 1000) { flash(S.net.friendGone(r.name), 2.5, '#93a1b8'); dropRemote(r); N.remotes.delete(pid); N.info.delete(pid); send(lobbyMessage()); refreshLobby(); continue; }
        if (r.lost !== wasLost) { send(lobbyMessage()); refreshLobby(); }
        // its item in front of it, the way a laptop player carries one
        const it = r.desk;
        if (it) {
          const fwd = it.twoHanded ? 0.6 : 0.5, down = it.twoHanded ? 0.75 : 0.45;
          it.mesh.position.set(r.head.x - Math.sin(r.yaw) * fwd, r.head.y - down, r.head.z - Math.cos(r.yaw) * fwd);
          it.mesh.quaternion.setFromAxisAngle(UP, r.yaw);
        }
      }
      G.players = [G.player, ...[...N.remotes.values()].filter((r) => !r.lost)];
      // the round is over: the friends' items were stowed or lost with it (game/round.js)
      if (G.round.phase === 'result') for (const r of N.remotes.values()) if (r.desk) { r.desk.netHolder = null; r.desk = null; }
    } else {
      for (const r of N.remotes.values()) r.update(dt, t, false);
      if (N.welcomed && !N.hostLost && t - N.lastHost > CFG.net.hostLostAfter * 1000) { N.hostLost = true; setStatus(S.net.status.hostLost, true); flash(S.net.status.hostLost, 5, '#ff5c5c'); }
      if (!N.welcomed) {   // still looking: after findTimeout try the next kind of relay, then give up
        N.findT += dt;
        if (N.findT > CFG.net.findTimeout && N.stage === 'find') {
          N.findT = 0;
          if (N.t.nextStrategy) N.t.nextStrategy().then((ok) => { if (!ok) { N.stage = 'lost'; setStatus(S.net.status.notFound(prettyCode(N.code)), true); } });
          else { N.stage = 'lost'; setStatus(S.net.status.notFound(prettyCode(N.code)), true); }
        }
      }
    }
  },

  // host: a friend with loot in the drop-off ring delivers it
  act() {
    if (!N.t || !isHost() || !G.active || G.round.phase === 'result' || G.caughtT >= 0) return;
    for (const r of N.remotes.values()) {
      const it = r.desk;
      if (it && !r.lost && !it.throwable && G.zone.contains(r.head.x, r.head.z)) { r.desk = null; it.netHolder = null; it.holders.length = 0; G.loot.deliver(it); }
    }
  },

  // host: the friends' voices (their microphones measure, the host makes the noise in the house)
  world(dt) {
    if (!N.t || !isHost() || !G.active || G.round.phase === 'result') return;
    for (const r of N.remotes.values()) {
      if (r.lost) continue;
      const shout = r.mic.shouts > r.mic.shoutSeen;
      r.mic.shoutSeen = r.mic.shouts;
      voiceNoise(r, r.speak, dt, r.mic.live && !r.mic.breath && G.caughtT < 0, r.mic.level, shout, false);
    }
  },

  present(dt) {
    if (!N.t) return;
    N.sendT -= dt;
    if (isHost()) {
      if (N.remotes.size && N.sendT <= 0) { N.sendT = 1 / CFG.net.stateHz; send(hostState(false, N.pid, hostPlayers())); }
    } else if (N.welcomed && N.sendT <= 0) {
      N.sendT = 1 / CFG.net.poseHz;
      const p = G.player, mic = G.mic;
      send({ type: 'pose', x: +p.head.x.toFixed(3), z: +p.head.z.toFixed(3), y: +p.head.y.toFixed(3), fy: +(p.floorY || 0).toFixed(3), yaw: +p.yaw.toFixed(3), pitch: +(p.lookPitch || 0).toFixed(3),
        cr: p.crouched || p.virtualCrouch ? 1 : 0, sp: +p.speed.toFixed(2), run: p.running ? 1 : 0,
        ml: mic.state === 'on' && !mic.noMic ? 1 : 0, lv: mic.level, br: G.breath.holding ? 1 : 0, sh: N.shouts || 0,
        wh: mic.whispering ? 1 : 0 }, N.hostPeer);   // W7: whispering now (a level, not a sound): the host's Шепотун
    }
    // a guest: what the host's world sounds like (guards' steps, the siren, the heartbeat while escaping)
    if (G.isGuest) {
      guestGuardSounds(dt);
      G.siren.set(G.round.phase === 'escape');
      if (G.round.phase === 'escape' && G.active) { G.heartT -= dt; if (G.heartT <= 0) { G.heartT = 0.9; playHeartbeat(); } }
    }
  },

  // after every frame, also while paused: the host's pause is everybody's pause («Хост поставив паузу»),
  // and a paused host still says it is there (the guests would think it gone after hostLostAfter s)
  frame(dt) {
    if (N.t && isHost() && N.remotes.size) {
      if (G.paused !== !!N.wasPaused) { N.wasPaused = G.paused; if (G.paused) netEvent('pause', {}); }
      if (G.paused && (N.kaT = (N.kaT || 0) - dt) <= 0) { N.kaT = 1; send({ type: 'ka' }); }
    }
    if (lobby && N.t && (N.lobbyTick = (N.lobbyTick || 0) + 1) % 30 === 0) refreshLobby();
  },
};

// a guest's own shouts (heist.js counts them; the host turns them into the noise in the house)
// tests (__game.net) and the lobby: open a room as the host or join one as a guest
export function netOpen(code, role, name = N.name || 'Test', thief = N.thief) { N.name = name; N.thief = thief; return open(code, role); }
export function netLeave() { leave(); refreshLobby(); }

export function guestShout() { N.shouts = (N.shouts || 0) + 1; }
export { sim as netSim };
