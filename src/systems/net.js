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
import { openTransport, sim, turnState } from '../net/transport.js';
import { newCode, roomLink, roomFromUrl, playerId, validCode, prettyCode } from '../net/room.js';
import { RemotePlayer } from '../net/remotePlayer.js';
import { hostState, guestApply, guestGuardSounds, forgetSent, resetGuestView } from '../net/sync.js';
import { Lobby } from '../ui/lobby.js';
import { HostGone } from '../ui/hostGone.js';
import { loadSetting, saveSetting } from '../settings.js';
import { applyDifficulty } from '../game/difficulty.js';
import { contractById, goalText } from '../game/contracts.js';
import { newRound, caught, setContract, setDifficulty } from './contract.js';
import { pause2D } from './desktop.js';
import { travelShow } from './travel.js';
import { levelOf, CLASSIC } from '../game/campaign.js';
import { applyLevel } from './campaign.js';
import { levelGroups, pickLevel as pickLevelOf } from './levels.js';
import { syncStartScreen } from './startScreen.js';
import { useDevice } from './distract.js';
import { voiceNoise } from './heist.js';
import { ensureMic } from './micAuto.js';
import { storyNetEcho } from './story.js';
import { applyGuard, guardCentral, localBench, guardView } from './humanGuard.js';
import { playThud, playGlass, playHeartbeat, unlockAudio } from '../audio/audio.js';
import { mapOpen, travelNote } from '../world/maps.js';
import { S } from '../i18n/index.js';
import { hostClimb, climbDenied, hostLower } from './backWindow.js';
import { reachClear } from '../game/reach.js';
const _reachC = new THREE.Vector3();

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
let lobby = null, gone = null;   // gone: Б9's card (made the first time it is needed)

const isHost = () => N.role === 'host';
const send = (msg, to) => { if (N.t) { N.t.send(msg, to); N.stats.sent++; } };
const hostPlayers = () => [{ pid: N.pid, head: G.player.head, floorY: G.player.floorY, yaw: G.player.yaw, crouched: G.player.crouched || G.player.virtualCrouch, running: G.player.running, lost: false },
  ...[...N.remotes.values()].map((r) => ({ pid: r.id, head: r.head, floorY: r.floorY, yaw: r.yaw, crouched: r.crouched, running: r.running, lost: r.lost || (!!r.away && !r.held) }))].filter((p) => p.pid !== G.guardPid);   // the guard is drawn as the guard; Б2: one on pause is not drawn
const midRound = () => G.round.phase === 'heist' || G.round.phase === 'escape';
const nameOf = (pid) => (pid === N.pid ? N.name : (N.info.get(pid) || {}).name || '?');

// T3: why a guest is not in the room — nobody answered, or the host was found but the connection failed
const lostText = () => (N.connectFail ? S.net.status.cantConnect : S.net.status.noHost(prettyCode(N.code)));
// tips: a list under the line (Б10: what to do); retry: the host's «Спробувати ще раз» with it
function setStatus(text, bad = false, tips = null, retry = false) { N.status = text; N.statusBad = bad; N.tips = tips; N.retry = retry; refreshLobby(); }
function lobbyPlayers() {
  const me = { pid: N.pid, name: N.name, thief: N.thief, host: isHost(), you: true, mic: G.mic.state === 'on' && !G.mic.noMic, guard: G.guardPid === N.pid };
  if (isHost()) return [me, ...[...N.remotes.values()].map((r) => ({ pid: r.id, name: r.name, thief: r.thief, lost: r.lost, away: !!r.away, mic: (N.info.get(r.id) || {}).mic, guard: G.guardPid === r.id }))];
  return N.lobbyList ? N.lobbyList.map((p) => ({ ...p, you: p.pid === N.pid })) : [me];
}
function refreshLobby() {
  if (!lobby) return;
  lobby.show({ guardPid: G.guardPid, myPid: N.pid, inRoom: !!N.t, code: N.code, link: N.code ? roomLink(N.code, G.level.id) : '', players: lobbyPlayers(), status: N.status, statusBad: N.statusBad, tips: N.tips, retry: N.retry, card: N.t ? '' : N.card, lost: N.hostLost, version: VERSION,
    back: backLine(),   // Б2: «Повернутись у раунд» / after a reload between rounds the tap for the sound
    canStart: isHost() && [...N.remotes.values()].every((r) => !r.lost), house: isHost() ? { name: houseName(otherMap()), open: mapOpen(otherMap()) && G.round.phase !== 'heist' && G.round.phase !== 'escape' } : null,
    role: N.role, choice: N.t ? choiceText() : '', levels: N.t ? levelsForRoom() : null, diffs: N.t ? diffsForRoom() : null, goal: N.t ? goalLine() : '' });
}
// T4a: the mission in the room — what the host picked (its contract on this house, the difficulty)
const setupNow = () => ({ map: G.level.id, c: G.contract.id, diff: G.difficulty, lock: levelGroups().flatMap((g) => g.levels.filter((l) => l.locked).map((l) => l.id)) });
const houseName = (map) => (map === 'mansion' ? S.mansion.name : S.mansion.mapDacha);
function levelLabel(c) { const l = !CLASSIC && levelOf(c.id); return `${l ? `${S.net.levelN(l.n)} · ` : ''}${c.name}`; }
function choiceText() {
  const s = isHost() ? setupNow() : N.setup;
  if (!s) return '';
  const c = CFG.contracts.find((x) => x.id === s.c);
  const diff = (CFG.difficulties[s.diff] || {}).name || '';
  return S.net.hostChose(houseName(s.map), c ? levelLabel(c) : s.c, diff);
}
// every level of the ladder by house, the same cards as «Грати». A guest sees the host's picture: the host's
// choice lit, the levels the host has closed shut (its own stars decide, not the guest's)
function levelsForRoom() {
  const groups = levelGroups();
  if (isHost() || !N.setup) return groups;
  const closed = new Set(N.setup.lock || []);
  for (const g of groups) for (const l of g.levels) { l.locked = closed.has(l.id); l.current = l.id === N.setup.c; }
  return groups;
}
const goalLine = () => {
  const id = isHost() ? G.contract.id : (N.setup && N.setup.c), c = CFG.contracts.find((x) => x.id === id);
  return c ? S.levels.goal(goalText(c, G.loot.items)) : '';
};
const diffsForRoom = () => ['easy', 'medium', 'hard'].map((d) => ({ id: d, name: CFG.difficulties[d].name, current: d === G.difficulty }));
// the host's pick in the room: a finished round goes back to the van first (setContract works only before the clock)
// (a level of the other house: remembered, and the host reopens the same room there — T4b's «Інший будинок»)
function pickLevel(id) {
  if (!isHost()) return;
  pickLevelOf(id, { setContract, newRound, switchMap: () => otherHouse() });
}
function pickDiff(d) {
  if (!isHost()) return;
  if (G.round.phase !== 'ready') newRound();
  setDifficulty(d);
}
// the host's choice changed (systems/contract.js calls it): the guests learn it at once
// T4b: «Почати» — everybody goes into the round at once (a guest's tap on «Увійти» was its gesture)
function hostStart() {
  if (!isHost()) return;
  if (G.round.phase !== 'ready') newRound();
  netEvent('start', {});
  travelShow(G.level.id, CFG.net.startTravel);   // decision of 7.11: everybody sees the van «Їдемо…», then the game
  G.start.play();
}
const otherMap = () => (G.level.id === 'mansion' ? 'dacha' : 'mansion');
// the host picks the other house: one page = one map, so the page reloads and opens the same room again;
// the guests are asked to say hello again (rehello) and reload for the new map
function otherHouse() {
  if (!isHost() || G.round.phase === 'heist' || G.round.phase === 'escape' || !mapOpen(otherMap())) return;
  saveSetting('map', otherMap());
  travelNote(otherMap(), 'room');   // campaign v2: «Їдемо в …» instead of a bare reload
  if (N.t) { send({ type: 'bye', pid: N.pid, why: 'house' }); N.t.close(); N.t = null; }   // Б9: no card for the guests, they say hello again
  location.replace(roomLink(N.code, otherMap(), location.href, { host: '1' }));
}
function netSetupChanged() { if (N.t && isHost()) send(lobbyMessage()); refreshLobby(); }
function lobbyMessage() { return { type: 'lobby', gp: G.guardPid || '', players: lobbyPlayers().map(({ you, ...p }) => p), setup: setupNow() }; }

// ---------- the room ----------
async function open(code, role) {
  if (N.opening) return;   // B03: a double tap on «Увійти» / «Створити» opened a second connection
  if (N.t) leave(true);
  const seq = N.openSeq = (N.openSeq || 0) + 1;
  N.opening = true;
  N.code = code; N.role = role; N.welcomed = role === 'host'; N.hostLost = false; N.findT = 0; N.stage = 'find'; N.connectFail = false;
  saveSetting('netName', N.name); saveSetting('netThief', N.thief);
  setStatus(role === 'host' ? S.net.status.opening : S.net.status.find);
  let t;
  try {
    t = await openTransport({
      kind: params.get('net') === 'local' ? 'local' : 'trystero', code, all: role === 'host',   // T3: the host listens on every relay
      onMessage, onPeerJoin, onPeerLeave,
      onStatus: (s) => {
        // Б10: the host hears that a friend was found but the connection failed (no TURN, different networks)
        if (role === 'host') { if (s.step === 'connectFail' && seq === N.openSeq) setStatus(S.net.status.someoneFailed, true); return; }
        if (N.welcomed) return;
        if (s.step === 'connectFail') { N.connectFail = true; setStatus(S.net.status.cantConnect, true); }   // T3: found, not connected
        else if (s.step === 'find' && N.t && !N.connectFail) setStatus(S.net.status.findNext);
      },
    });
  } catch (e) {
    N.opening = false;
    if (seq !== N.openSeq) return;
    N.t = null; N.role = null;
    setStatus(S.net.status.failed(String(e.message || e).slice(0, 120)), true);
    return;
  }
  N.opening = false;
  if (seq !== N.openSeq) { t.close(); return; }   // left (or another room) while connecting
  N.t = t;
  G.net = N;
  G.isHost = role === 'host';
  if (role === 'host') { N.hostPid = N.pid; watchRelays(); }
  else for (const id of N.t.peers()) hello(id);
  refreshLobby();
}
function leave(quiet) {
  N.openSeq = (N.openSeq || 0) + 1; N.opening = false;   // B03: a connection still opening closes itself
  clearInterval(N.relayTimer); N.relayTimer = null;
  if (N.t) { send({ type: 'bye', pid: N.pid, why: 'end' }); N.t.close(); }   // Б9: from the host = «Хост завершив гру»
  for (const r of N.remotes.values()) dropRemote(r);
  N.t = null; N.role = null; N.welcomed = false; N.hostPeer = null; N.lobbyList = null; N.away = false; N.backT = 0; N.rejoining = false; N.needTap = false;
  G.net = null; G.isGuest = false; G.isHost = true;
  G.players = [G.player];
  applyGuard(null, N.pid); G.benchT = 0;
  if (!quiet) setStatus('');
}
// B01: the guest found nobody (or could not connect): the connection closes and the join form comes back
// with the message; before, the lobby kept showing a room (its code, QR) that did not exist
function giveUp() {
  N.stage = 'lost';
  // Б10: this phone reaches no relay (or no network at all): that is why it sees nobody, not the code
  const r = relayCount(), off = navigator.onLine === false, none = off || (r && r.open === 0);
  const text = off ? S.net.status.offline : none ? S.net.status.guestNoRelays : lostText();
  forgetBack();
  leave(true);
  setStatus(text, true, none ? S.net.status.guestTips : null);
}

// ---------- Б10: the host's relays ----------
// The room opens at once, the relays (Nostr, the trackers) connect behind it: the host now says when none
// answered in connectTimeout s (friends would never find the room) and what to do; a relay that comes
// back puts «Чекаю друзів» back by itself. A library file without getRelaySockets (an old cache) says nothing.
function relayCount() {
  const r = N.t && N.t.relays ? N.t.relays() : null;
  if (!r) return null;
  const v = Object.values(r);
  return v.length ? { open: v.reduce((n, x) => n + x.open, 0), total: v.reduce((n, x) => n + x.total, 0) } : null;
}
function watchRelays() {
  clearInterval(N.relayTimer);
  N.relayOpenT = performance.now(); N.relayState = '';
  checkRelays();
  N.relayTimer = setInterval(checkRelays, CFG.net.relayCheck * 1000);
}
function checkRelays() {
  if (!N.t || !isHost()) return;
  if (N.remotes.size) { N.relayState = 'ok'; return; }   // friends are in: they talk directly, the relays matter no more
  const r = relayCount();
  const state = navigator.onLine === false ? 'offline' : !r || r.open > 0 ? 'ok' : performance.now() - N.relayOpenT > CFG.net.connectTimeout * 1000 ? 'down' : 'wait';
  if (state === N.relayState) return;
  N.relayState = state;
  if (state === 'ok') setStatus(S.net.status.waiting);
  else if (state === 'wait') setStatus(S.net.status.relays);
  else setStatus(state === 'offline' ? S.net.status.offline : S.net.status.noRelays, true, S.net.status.hostTips, true);
}
// «Спробувати ще раз»: the same room, the same code, a fresh page (the library gives up on a relay for good
// after ~100 s of failures, only a new page asks again); the reload path of «Інший будинок» (host=1)
function retryRoom() {
  if (!isHost() || !N.code) return;
  const code = N.code;
  leave(true);
  location.replace(roomLink(code, G.level.id, location.href, { host: '1' }));
}
function hello(peer) {
  send({ type: 'hello', pid: N.pid, v: N.fakeVersion || VERSION, proto: CFG.net.protocol, map: G.level.id, name: N.name, thief: N.thief, q: CFG.player.quietSpeed, sh: N.shouts || 0, mic: G.mic.state === 'on' && !G.mic.noMic, dev: G.MODE.mode }, peer);
}
function onPeerJoin(peer) {
  if (N.role === 'guest' && !N.welcomed) { setStatus(S.net.status.connecting(S.net.host)); hello(peer); }
  else if (N.role === 'guest' && (peer === N.hostPeer || N.rejoining)) hello(peer);   // Б2: the host found again (a new connection): its snapshot again
}
function onPeerLeave(peer) {
  const pid = N.pidOf.get(peer);
  if (pid && N.peerOf.get(pid) !== peer) return;   // Б2: an old connection of a friend that is already back through a new one
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
    if (!rp && (G.round.phase === 'heist' || G.round.phase === 'escape')) { send({ type: 'deny', why: 'started' }, peer); return; }   // decision P5: only before the round starts
    if (rp) { N.stats.rejoins++; if (rp.lost || rp.away) flash(S.net.friendBack(rp.name), 2.5, '#5fd38d'); rp.away = false; }   // Б2: its place was kept
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
    const snap = hostState(true, N.pid, hostPlayers()); snap.hg = guardState();
    // Б2: the round's number (a guest that missed the end or a new round goes where the host is) and the result on the screen now
    send({ type: 'welcome', you: m.pid, map: G.level.id, host: N.name, hostPid: N.pid, snap, rn: N.roundNo || 0, res: G.round.phase === 'result' ? { R: G.round.result, alarmed: G.round.alarmed } : null }, peer);
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
  else if (m.type === 'bye') { r.lastHeard = 0; r.left = true; }   // it left the room itself: gone now, also in the middle of a round
  else if (m.type === 'away') { if (!r.away) { r.away = true; r.awaySince = performance.now(); flash(S.net.friendAway(r.name), 2.5, '#93a1b8'); send(lobbyMessage()); refreshLobby(); } }   // Б2: its pause / a call
  else if (m.type === 'back') { if (r.away) { r.away = false; flash(S.net.friendBack(r.name), 2.5, '#5fd38d'); send(lobbyMessage()); refreshLobby(); } }
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
    d.lastUser = r.id === G.guardPid ? 'patrol' : 'player';   // the guard's own doors are no news to the guards
    d.toggle(r.head.x, r.head.z, +m.time || CFG.doors.fastTime);
  } else if (m.a === 'climb') {   // the back window: the guest climbs at once; the host opens the sash or says no (systems/backWindow.js)
    hostClimb(r, m, (why) => send({ type: 'ev', k: 'climbNo', why }, N.peerOf.get(r.id)));
  } else if (m.a === 'lower') {   // campaign v2: a guest's big item over the back window's sill — the host decides, all see it fly
    hostLower(r, m, () => send({ type: 'ev', k: 'lowerNo' }, N.peerOf.get(r.id)));
  } else if (m.a === 'take') {
    const it = loot.items[m.i];
    if (!it || r.desk || !it.takeable || it.held || it.state === 'fall') return;
    if (Math.hypot(it.mesh.position.x - r.head.x, it.mesh.position.z - r.head.z) > 2.5) return;
    it.centre(_reachC);   // plan 2026-11-19: the host takes it for the guest only with no wall, closed door or floor between
    if (!reachClear(level, r.head.x, r.head.z, r.floorY || 0, _reachC.x, _reachC.y, _reachC.z, it.r)) return;
    r.desk = it; it.netHolder = r.id; it.thrown = false;
    it.holders.length = 0; it.holders.push('friend'); it.state = 'held';
  } else if (m.a === 'put') {
    const it = r.desk;
    if (!it) return;
    r.desk = null; it.netHolder = null; it.holders.length = 0;
    if (m.atVan && !it.throwable && G.round.atVan(r.head)) loot.deliver(it);
    else it.drop(new THREE.Vector3());
  } else if (m.a === 'grab') {
    if (r.id === G.guardPid) G.patrol.grabAsk = true;
  } else if (m.a === 'central') {
    if (r.id === G.guardPid && !guardCentral()) send({ type: 'ev', k: 'flash', t: S.hguard.needEvidence, c: '#93a1b8', s: 2.5 }, N.peerOf.get(r.id));
  } else if (m.a === 'role') {
    setGuard(r.id, !!m.guard);
  } else if (m.a === 'dev') {
    const dev = G.devices && G.devices.byId(m.id);
    if (dev && G.devices.enabled && reachClear(level, r.head.x, r.head.z, r.floorY || 0, dev.x, dev.y, dev.z, 0.12)) useDevice(dev);   // B04: not on a level without devices; not through a wall (plan 2026-11-19)
  }
}

function guestMessage(m, peer) {
  if (m.type === 'deny' && N.welcomed && peer !== N.hostPeer) return;   // Б12: only the host turns a guest away
  if (m.type === 'deny') {
    const text = m.why === 'full' ? S.net.status.full : m.why === 'started' ? (N.welcomed || N.returning ? S.net.status.startedBack : S.net.status.started) : S.net.status.version;
    forgetBack();
    // Б2: turned away with the host's half-world (its clock, guards, doors) here: a clean page on «Грати з друзями», with the reason
    if (G.isGuest && G.round.phase !== 'ready') { leave(true); cleanPage({ page: 'friends' }, text); return; }
    setStatus(text, true); leave(true); refreshLobby(); return;
  }
  if (m.type === 'welcome') {
    if (m.map !== G.level.id) {
      // a fuse: this page was already loaded for that map and still is not on it — say so, never reload again (no loop)
      if (params.get('map') === m.map) { leave(true); setStatus(S.net.status.mapFailed, true); refreshLobby(); return; }
      setStatus(S.net.status.reloadMap); travelNote(m.map, 'room', true); location.replace(roomLink(N.code, m.map, location.href, { join: '1' })); return;
    }
    const again = N.welcomed || N.returning;   // Б2: back after a pause, a lost connection or a reload
    N.welcomed = true; N.hostPeer = peer; N.hostPid = m.hostPid; N.hostName = m.host; N.lastHost = performance.now(); N.hostLost = N.hostEnded = false;
    N.backT = 0; if (N.rejoining) { N.rejoining = false; N.stats.rejoins++; }
    // Б2: the round changed while this guest was away (it missed the end or a new round): as on «newround»
    const missed = again && N.roundNo !== undefined && m.rn !== N.roundNo;
    if (missed) newRound(true);
    N.roundNo = m.rn || 0;
    becomeGuest();
    guestState(m.snap);
    if (m.res && G.round.phase !== 'result') guestEvent({ k: 'result', ...m.res });
    // a reloaded tab stands where the host saw it last (Р1-C: the same place; its item is in its hands by the snapshot)
    const me = N.returning && m.snap.p.find((p) => p[0] === N.pid);
    if (me) G.player.teleport(me[1], me[2], me[5], me[4]);
    if (N.returning) N.needTap = true;   // a reloaded page has had no tap yet: no sound on an iPhone until one
    N.returning = false;
    if (missed && G.round.phase === 'ready' && G.playingDesktop) pause2D();   // the host is in the room: so is this guest (T4c)
    N.stats.snapshots++;
    setStatus(S.net.status.inRoom(m.host));
    rememberBack();
    return;
  }
  if (m.type === 'rehello') { hello(peer); return; }   // also a new host peer: the host reloaded (another house, T4b)
  if (peer !== N.hostPeer) return;   // the logic talks host <-> guest only (Б12: a «bye» from another guest is nothing)
  N.lastHost = performance.now(); N.backT = 0;   // Б2: the host answers after this guest's pause
  if (m.type === 'bye') { if (m.why === 'end') { N.hostEnded = N.hostLost = true; setStatus(S.net.status.hostEnded, true); } return; }   // Б9; 'house': its rehello follows
  if (N.hostLost && !N.hostEnded) { N.hostLost = false; N.waitUntil = 0; setStatus(S.net.status.inRoom(N.hostName)); }   // Б9: the card goes by itself (a host that ended the game: only its welcome again)
  if (m.type === 'state') guestState(m);
  else if (m.type === 'ev') guestEvent(m);
  else if (m.type === 'lobby') { N.lobbyList = m.players; if (m.setup) N.setup = m.setup; for (const p of m.players) N.info.set(p.pid, p); applyGuard(m.gp || null, N.pid); refreshLobby(); }
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
    applyLevel();   // B04: the host's level decides the devices here too (W19: from level 7)
    syncStartScreen(); G.boardDirty = true;
  }
  if (s.hg) { applyGuard(s.hg[0] || null, N.pid); guardView.evidence = !!s.hg[1]; guardView.caught = s.hg[2]; guardView.thieves = s.hg[3]; guardView.gv = new Set(s.hg[4] || []); guardView.stunT = +s.hg[5] || 0; guardView.stunKind = s.hg[6] || null; }
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
      noise.emit(m.x, m.z, m.r, m.kind, { y: m.y, source: 'net', wallK: Number.isFinite(m.w) ? m.w : null });
      const pos = { x: m.x, y: (m.y || 0) + 0.3, z: m.z }, occ = G.level.soundOccluded(G.player.head.x, G.player.head.z, m.x, m.z);
      if (m.kind === 'drop') playThud(pos, occ, 1, false);
      else if (m.kind === 'glass') playGlass(pos, occ);
      break;
    }
    case 'flash': flash(m.t, m.s || 2.5, m.c); break;
    case 'shoutHeard': if (G.scream) G.scream.markHeard(+m.t || 0, typeof m.g === 'string' && m.g ? m.g.slice(0, 30) : true); break;   // 22.11 §4: a guard came to this device's shout — its replay is «the one with the guard» (the clip itself never leaves the device)
    case 'climbNo': climbDenied(m.why); break;
    case 'lowerNo': flash(S.campaign2.window.hostNo, 2.5, '#ffb347'); break;
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
    case 'newround': newRound(true); N.roundNo = m.rn ?? (N.roundNo || 0) + 1; break;
    case 'pause': flash(S.net.hostPaused, 3, '#93a1b8'); break;
    case 'start': N.needTap = false; if (!G.inVR) travelShow(G.level.id, CFG.net.startTravel); if (!G.playingDesktop && !G.inVR && G.start) G.start.play(); break;   // T4b: the host pressed «Почати»
    case 'bench': if (m.pid === N.pid) localBench(m.s); else flash(S.hguard.benched(m.name || nameOf(m.pid), m.s), 3, '#ff5c5c'); break;
    case 'guardnote': if (G.role === 'guard') flash(m.t, 3, '#ffd166'); break;
  }
}

// ---------- what the rest of the game calls ----------
// the host sends an event to everybody (nothing offline or on a guest)
export function netEvent(k, data) {
  if (k === 'newround') { N.roundNo = (N.roundNo || 0) + 1; data = { ...data, rn: N.roundNo }; }   // Б2: the round's number
  if (!N.t || !isHost() || !N.remotes.size) return;
  send({ type: 'ev', k, ...data });
  if (k === 'newround') forgetSent();   // the guests reset their copy: the next state is whole
}
// the host tells a guest that a guard came to its shout (round time t, the guard's name): its replay keeps that clip
export function netShoutHeard(pid, t, guard) { if (N.t && isHost()) send({ type: 'ev', k: 'shoutHeard', t: +(+t).toFixed(2), g: guard }, N.peerOf.get(pid)); }
// a guest asks the host to do something (door, take, put, device)
export function netIntent(a, data = {}) { if (N.t && N.role === 'guest' && N.hostPeer) send({ type: 'act', a, ...data }, N.hostPeer); }
// the friends' items still in hand when the round ends (game/round.js: stowed when you get away)
export function netHeld() { return [...N.remotes.values()].map((r) => r.desk).filter(Boolean); }
// for the report and the tests
// W8c: the report's «net» block — the room, how the friends are connected (directly / through TURN), the
// TURN permission (asked, got, why not); no addresses, no codes of other rooms
export function netReport() {
  const turn = { configured: !!CFG.net.turnWorker, ...turnState };
  if (!N.t) return { room: false, turn };
  const byPeer = N.links || {}, types = Object.values(byPeer).filter((x) => x !== 'unknown');
  const link = !types.length ? 'none' : types.every((x) => x === 'relay') ? 'turn' : types.some((x) => x === 'relay') ? 'mixed' : 'direct';
  const d = N.t.diag();
  return {
    room: true, role: N.role, welcomed: N.welcomed, players: lobbyPlayers().length, transport: d.kind, strategies: d.strategies, errors: d.errors,
    rejoins: N.stats.rejoins, away: isHost() ? [...N.remotes.values()].filter((r) => r.away).length : N.away ? 1 : 0,   // Б2
    relays: Object.fromEntries(Object.entries((N.t.relays && N.t.relays()) || {}).map(([k, v]) => [k, `${v.open}/${v.total}`])),   // Б10: open / all
    link, connection: S.net.link[link],
    links: Object.fromEntries(Object.entries(byPeer).map(([peer, type]) => [nameOf(N.pidOf.get(peer)) || peer.slice(0, 6), type])),
    turn,
  };
}
export function netState() {
  return {
    role: N.role, code: N.code, pid: N.pid, welcomed: N.welcomed, hostLost: N.hostLost, hostEnded: !!N.hostEnded, card: gone && gone.isOpen ? gone.kind : '', status: N.status,
    players: lobbyPlayers().map((p) => ({ pid: p.pid, name: p.name, thief: p.thief, host: !!p.host, lost: !!p.lost })),
    remotes: [...N.remotes.values()].map((r) => ({ pid: r.id, x: +r.head.x.toFixed(2), z: +r.head.z.toFixed(2), lost: r.lost, away: !!r.away, held: !!r.held, desk: r.desk ? r.desk.id : null, inGame: G.players.includes(r), drawn: !!r.group.visible, bench: r.benchT > 0 })),
    away: !!N.away, rejoining: !!N.rejoining, back: backToRound(),
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
    G.netSetup = netSetupChanged;   // T4a
    G.netEvent = netEvent; G.netShoutHeard = netShoutHeard; G.netIntent = netIntent; G.netHeld = netHeld; G.netCaught = netCaught;
    G.netRemotes = () => [...N.remotes.values()]; G.netRemote = (pid) => N.remotes.get(pid) || null; G.netPid = () => N.pid; G.netName = () => N.name;   // W15
    N.name = loadSetting('netName', ''); N.thief = loadSetting('netThief', 'zoya');
    const box = $('netbox');
    if (!box) return;
    const code = roomFromUrl();
    lobby = new Lobby(box, {
      create: (name, thief) => { ensureMic({ ask: true }); N.name = name; N.thief = thief; open(newCode(), 'host'); },
      // T4b: the tap on «Увійти» is the guest's gesture for the sound (the host's «Почати» starts its round later)
      join: (c, name, thief) => { unlockAudio(); ensureMic({ ask: true });   // Б1: the guest's own tap (the host's «Почати» is not one)
        N.name = name; N.thief = thief; if (!validCode(c)) { setStatus(S.net.status.notFound(prettyCode(c)), true); return; } open(c, 'guest'); },
      // B05: a guest that leaves in the middle of a round would keep the host's half-world (its clock, guards,
      // doors): the page reloads clean on «Грати з друзями» instead
      leave: () => {
        const halfWorld = N.role === 'guest' && N.welcomed && G.round.phase !== 'ready';
        forgetBack();
        leave(); refreshLobby();
        if (halfWorld) cleanPage({ page: 'friends' });
      },
      back: () => {   // Б2: the tap iPhone needs for the sound and the microphone
        const k = backToRound();
        N.needTap = false;
        if (k === 'round') G.start.play();
        else if (k === 'room') { unlockAudio(); ensureMic({ ask: true }); }
        refreshLobby();
      },
      role: (want) => netRole(want),
      pickLevel, pickDiff, start: () => hostStart(), house: () => otherHouse(), retry: () => retryRoom(),
      solo: () => { forgetBack(); const u = new URL(location.href); u.searchParams.delete('room'); location.replace(u.toString()); },
      share: async () => {
        const link = roomLink(N.code, G.level.id);
        try { if (navigator.share && G.PHONE) { await navigator.share({ title: S.net.title, text: S.net.shareText(prettyCode(N.code)), url: link }); return; } } catch { /* cancelled */ }
        try { await navigator.clipboard.writeText(link); flash(S.net.copied, 2); setStatus(S.net.copied); } catch { /* the link is on the screen */ }
      },
    }, { name: N.name, thief: N.thief, code: code || '' });
    if (code) { N.card = S.net.joinCard(prettyCode(code), G.level.id === 'mansion' ? S.mansion.name : S.mansion.mapDacha); refreshLobby(); }
    const said = takeNote();   // Б2: why the page was reloaded clean (turned away in the middle of a round)
    if (said) setStatus(said, true);
    // T4b: back after a reload for another map — the guest joins and the host reopens the room by themselves
    // Б2: a tab the phone reloaded in a room (the marker < backFor min): back into the room by itself
    const back = readBack();
    if (code && params.get('join') !== '1' && params.get('host') !== '1' && back && back.code === code) { N.card = ''; N.returning = true; open(code, 'guest'); }
    else if (code && params.get('join') === '1') { N.card = ''; open(code, 'guest'); }
    else if (code && params.get('host') === '1') { N.card = ''; open(code, 'host'); }
    // a minimized host draws no frames: «пауза» for the guests and a timer says «I am here» (Android keeps
    // timers going once a second in the background; iPhone stops the page, the guests then wait for it)
    // Б9: the host closes the page — the guests are told at once (not always delivered: Android may kill the
    // browser first; then the guests' hostLostAfter s of silence)
    addEventListener('pagehide', () => { if (N.t && isHost() && N.remotes.size) send({ type: 'bye', pid: N.pid, why: 'end' }); });
    document.addEventListener('visibilitychange', () => {
      clearInterval(N.kaTimer); N.kaTimer = null;
      // Б9: a host back from sleep (iPhone stops the page): its own pre did not run, every friend looks 30 s
      // silent at once — they get wakeGrace s to be heard again instead of all being dropped together
      if (N.t && isHost() && !document.hidden) {
        const keep = performance.now() - Math.max(0, CFG.net.peerGoneAfter - CFG.net.wakeGrace) * 1000;
        for (const r of N.remotes.values()) if (r.lastHeard < keep) r.lastHeard = keep;
      }
      // Б2: a minimised guest says «I am here» from a timer (frames stop; Android keeps timers, iPhone does not)
      clearInterval(N.awayTimer); N.awayTimer = null;
      if (N.t && N.role === 'guest' && document.hidden) { guestPresence(); N.awayTimer = setInterval(guestPresence, 1000); }
      if (!N.t || !isHost() || !N.remotes.size || !document.hidden) return;
      netEvent('pause', {});
      N.kaTimer = setInterval(() => send({ type: 'ka' }), 1000);
    });
    // the host's voice lines, guard sounds, noises and messages for the guests (offline nothing listens)
    G.noise.on((e) => {
      if (!isHost() || e.source === 'net' || !N.t || !N.remotes.size) return;
      const msg = { type: 'ev', k: 'noise', x: +e.x.toFixed(2), z: +e.z.toFixed(2), y: +(e.y || 0).toFixed(2), r: +e.radius.toFixed(2), kind: e.kind, w: e.wallK ?? undefined };   // w: how far through a wall (its faint ring)
      const ey = e.source === 'world' ? e.y : (e.who || G.player).floorY;
      for (const [pid, r] of N.remotes) {
        if (pid === G.guardPid && e.source !== 'patrol' && !(G.patrol.audible(e, ey) > 0)) continue;   // W15: the guard hears what a guard would
        if (!r.lost) send(msg, N.peerOf.get(pid));
      }
    });
  },

  pre(dt, now) {
    if (!N.t) return;
    const t = performance.now();
    // W8c: how each friend is connected (directly or through TURN), for the report; every 5 s
    if (N.t.links && t - (N.linksT || 0) > 5000) { N.linksT = t; const tr = N.t; tr.links().then((l) => { if (N.t === tr) N.links = l; }, () => {}); }
    if (isHost()) {
      // Б2 (decision Р2-a): in the middle of a round a friend on pause or silent keeps its place to the round's end;
      // after it (and before the round) the old rule: peerGoneAfter s of silence, counted from the round's end
      const mid = midRound();
      if (N.wasMid && !mid) N.roundEndT = t;
      N.wasMid = mid;
      // friends: drawn where they were a moment ago; a silent one stays out of the guards' sight
      for (const [pid, r] of N.remotes) {
        const wasLost = r.lost;
        r.update(dt, t, true);
        // Б2 (owner, 19.11): a pause does not save from a chase. A guard that saw or chased this friend in the
        // last chaseSeen s keeps it: the body stays where it was, visible and catchable, chaseHold s more;
        // otherwise it is gone for the guards and the friends at once (once per pause / silence)
        if (G.guards.some((g) => g.target === r && (g.visible || g.state === 'chase' || g.state === 'hunt'))) r.seenT = t;
        const quiet = r.away || r.lost;
        if (!quiet) { r.holdUntil = 0; r.holdDone = false; }
        else if (!r.holdDone) { r.holdDone = true; if (t - (r.seenT ?? -1e9) < CFG.net.chaseSeen * 1000) r.holdUntil = t + CFG.net.chaseHold * 1000; }
        r.held = quiet && r.holdUntil > t;
        if (r.held) { r.lost = false; r.speed = 0; r.running = false; r.stepNoise = 0; r.group.visible = true; }
        else if (r.away) r.group.visible = false;
        if (r.lost && !wasLost && !r.away) flash(S.net.friendLost(r.name), 2.5, '#ffb347');
        // Р1-C: its item stays in its hands, after awayDropAfter s it falls where it stood
        const awayFor = r.away ? t - r.awaySince : r.lost ? t - r.lastHeard : 0;
        if (r.desk && awayFor > CFG.net.awayDropAfter * 1000) { const it = r.desk; r.desk = null; it.netHolder = null; it.holders.length = 0; it.drop(new THREE.Vector3()); }
        if (r.left || (!mid && t - Math.max(r.lastHeard, N.roundEndT || 0) > CFG.net.peerGoneAfter * 1000)) { flash(S.net.friendGone(r.name), 2.5, '#93a1b8'); dropRemote(r); N.remotes.delete(pid); N.info.delete(pid); if (pid === G.guardPid) applyGuard(null, N.pid); send(lobbyMessage()); refreshLobby(); continue; }
        if (r.benchT > 0) r.benchT = Math.max(0, r.benchT - dt);   // W15: a caught thief in the van
        if (r.lost !== wasLost) { send(lobbyMessage()); refreshLobby(); }
        // its item in front of it, the way a laptop player carries one
        const it = r.desk;
        if (it) {
          const fwd = it.twoHanded ? 0.6 : 0.5, down = it.twoHanded ? 0.75 : 0.45;
          it.mesh.position.set(r.head.x - Math.sin(r.yaw) * fwd, r.head.y - down, r.head.z - Math.cos(r.yaw) * fwd);
          it.mesh.quaternion.setFromAxisAngle(UP, r.yaw);
        }
      }
      // the thieves in the house: not the guard (W15), not the ones on the bench, not the silent ones
      G.players = [...(G.guardPid === N.pid || G.benchT > 0 ? [] : [G.player]), ...[...N.remotes.values()].filter((r) => !r.lost && (!r.away || r.held) && r.id !== G.guardPid && !(r.benchT > 0))];
      for (const r of N.remotes.values()) if (r.id === G.guardPid) r.group.visible = false;   // its body is the guard
      // the round is over: the friends' items were stowed or lost with it (game/round.js)
      if (G.round.phase === 'result') for (const r of N.remotes.values()) if (r.desk) { r.desk.netHolder = null; r.desk = null; }
    } else {
      for (const r of N.remotes.values()) r.update(dt, t, false);
      if (N.welcomed && !N.hostLost && !N.away && t - N.lastHost > CFG.net.hostLostAfter * 1000) { N.hostLost = true; setStatus(S.net.status.hostLost, true); flash(S.net.status.hostLost, 5, '#ff5c5c'); }
      if (!N.welcomed) {   // still looking: after findTimeout try the next kind of relay, then give up
        N.findT += dt;
        if (N.findT > CFG.net.findTimeout && N.stage === 'find') {
          N.findT = 0;
          const t = N.t;
          if (t.nextStrategy) t.nextStrategy().then((ok) => { if (!ok && N.t === t) giveUp(); });
          else giveUp();
        }
      }
    }
  },

  // host: a friend with loot in the drop-off ring delivers it
  act() {
    if (!N.t || !isHost() || !G.active || G.round.phase === 'result' || G.caughtT >= 0) return;
    for (const r of N.remotes.values()) {
      const it = r.desk;
      if (it && !r.lost && !r.away && !it.throwable && G.zone.contains(r.head.x, r.head.z)) { r.desk = null; it.netHolder = null; it.holders.length = 0; G.loot.deliver(it); }
    }
  },

  // host: the friends' voices (their microphones measure, the host makes the noise in the house)
  world(dt) {
    if (!N.t || !isHost() || !G.active || G.round.phase === 'result') return;
    for (const r of N.remotes.values()) {
      if (r.lost || r.away) continue;
      if (r.id === G.guardPid || r.benchT > 0) { r.mic.shoutSeen = r.mic.shouts; continue; }
      const shout = r.mic.shouts > r.mic.shoutSeen;
      r.mic.shoutSeen = r.mic.shouts;
      const live = r.mic.live && !r.mic.breath && G.caughtT < 0;
      voiceNoise(r, r.speak, dt, live, r.mic.level, shout, false, live && r.mic.whisper);   // W7's `wh`: the friend whispers
    }
  },

  present(dt) {
    if (!N.t) return;
    N.sendT -= dt;
    if (isHost()) {
      if (N.remotes.size && N.sendT <= 0) { N.sendT = 1 / CFG.net.stateHz; const st = hostState(false, N.pid, hostPlayers()); st.hg = guardState(); send(st); }
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
    guestPresence();
    hostGoneCard();
  },
};

// ---------- Б2: a guest on pause, after a call, after a reload ----------
// On pause (the phone's menu, a call, a minimised page) a guest says «на паузі», then «I am here» once a second
// (the frame phase runs while paused; a minimised page: the timer above); back = «back» and hello: the host,
// which kept its place, answers with the whole world (doors, items, guards, clock as they are now). No answer
// in backWait s (the connection died during the call): the guest opens the same room again by itself — the same
// player id, no reload; while the host stays silent it tries again every rejoinEvery s.
function guestPresence() {
  if (N.role !== 'guest' || !N.welcomed || !N.t) return;
  const now = performance.now(), away = !!G.paused || document.hidden;
  if (away !== !!N.away) {
    N.away = away;
    if (away) { send({ type: 'away' }, N.hostPeer); N.kaSentT = now; }
    else {
      send({ type: 'back' }, N.hostPeer); hello(N.hostPeer);
      N.backT = now; N.lastHost = Math.max(N.lastHost, now);   // its own pause is not the host's silence
    }
  }
  if (away && now - (N.kaSentT || 0) > 1000) { N.kaSentT = now; send({ type: 'ka' }, N.hostPeer); }
  if (away) return;
  if (N.rejoining && now - N.rejoinT > CFG.net.findTimeout * 1000) N.rejoining = false;   // that try found nobody
  if (N.backT && now - N.backT > CFG.net.backWait * 1000) { N.backT = 0; rejoin(); }
  else if (N.hostLost && !N.hostEnded && !N.rejoining && now - (N.rejoinT || 0) > CFG.net.rejoinEvery * 1000) rejoin();
  if (now - (N.backSaveT || 0) > 10000) rememberBack();
}
async function rejoin() {
  if (N.role !== 'guest' || !N.welcomed || N.rejoining || !N.t) return;
  N.rejoining = true; N.rejoinT = performance.now();
  N.rejoinTry = (N.rejoinTry || 0) + 1;
  flash(S.net.status.rejoining, 3, '#93a1b8'); setStatus(S.net.status.rejoining);
  const old = N.t, L = CFG.net.strategies, k = N.rejoinTry % L.length;
  let t;
  try {
    t = await openTransport({ kind: params.get('net') === 'local' ? 'local' : 'trystero', code: N.code, all: false, order: L.slice(k).concat(L.slice(0, k)), onMessage, onPeerJoin, onPeerLeave });
  } catch { N.rejoining = false; return; }
  if (N.t !== old || !N.welcomed) { t.close(); return; }   // left (or the old one came back) meanwhile
  N.t = t; old.close();   // no «bye»: the host keeps this guest's place
  for (const id of t.peers()) hello(id);
}
// 'round': the round goes on while this guest is in the room screen (back after a reload, or it missed «Почати»);
// 'room': back after a reload between rounds — one tap, so an iPhone gives the sound and the microphone
function backToRound() {
  if (N.role !== 'guest' || !N.welcomed || G.playingDesktop || G.inVR) return '';
  return midRound() ? 'round' : N.needTap ? 'room' : '';
}
function backLine() {
  const k = backToRound();
  return k === 'round' ? { text: S.net.roundOn(N.hostName), button: S.net.backToRound } : k === 'room' ? { text: S.net.backInRoom(N.hostName), button: S.net.backTap } : null;
}
// a reload: the address keeps the room (a guest that typed the code had none) and the tab remembers it for backFor min
const BACK = 'nocturne.net.back', NOTE = 'nocturne.net.note';
function rememberBack() {
  if (N.role !== 'guest' || !N.welcomed) return;
  N.backSaveT = performance.now();
  try { sessionStorage.setItem(BACK, JSON.stringify({ code: N.code, t: Date.now() })); } catch { /* private mode */ }
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('room') !== N.code || u.searchParams.get('map') !== G.level.id || u.searchParams.has('join')) {
      u.searchParams.set('room', N.code); u.searchParams.set('map', G.level.id); u.searchParams.delete('join');
      history.replaceState(history.state, '', u.toString());
    }
  } catch { /* no history here */ }
}
function readBack() {
  try { const b = JSON.parse(sessionStorage.getItem(BACK) || 'null'); return b && Date.now() - b.t < CFG.net.backFor * 60000 ? b : null; } catch { return null; }
}
function forgetBack() { try { sessionStorage.removeItem(BACK); } catch { /* private mode */ } }
function takeNote() { try { const t = sessionStorage.getItem(NOTE); sessionStorage.removeItem(NOTE); return t; } catch { return null; } }
// a clean page (B05): no room in the address; note = the line to show there
function cleanPage(set = {}, note = '') {
  try { if (note) sessionStorage.setItem(NOTE, note); } catch { /* private mode */ }
  const u = new URL(location.href);
  for (const k of ['room', 'join', 'host', 'page']) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(set)) u.searchParams.set(k, v);
  location.replace(u.toString());
}

// ---------- Б9: the host is gone (decision Р3-A) ----------
// In the game (not in the room screen, where the line and «Грати самому» stay): the host closed the game =
// «Хост завершив гру» [В меню]; hostLostAfter s of silence = «Хост не відповідає…» [Чекати] [В меню]; the host
// back = the card goes by itself. In VR the HTML is not seen: the wrist keeps a line (the card waits outside VR).
function hostGoneCard() {
  const now = performance.now();
  const inGame = G.playingDesktop || G.inVR || (gone && gone.isOpen);
  const kind = N.role !== 'guest' || !N.welcomed || !inGame ? '' : N.hostEnded ? 'end' : N.hostLost && now > (N.waitUntil || 0) ? 'silent' : '';
  if (!kind) { if (gone && gone.isOpen) gone.hide(); return; }
  if (!gone) gone = new HostGone({ wait: () => { N.waitUntil = performance.now() + CFG.net.hostWaitMore * 1000; gone.hide(); }, menu: () => toMenu() });
  if (G.inVR && now - (N.vrLineT || 0) > 500) { N.vrLineT = now; flash(S.net.gone.vr, 1, '#ff5c5c'); }
  if (!gone.isOpen && document.pointerLockElement) document.exitPointerLock();   // a PC: the mouse is free to press
  gone.show(kind, N.hostName, Math.round((now - N.lastHost) / 1000));
}
// «В меню»: a clean page on the main menu, as B05 (the host's half-world never stays)
function toMenu() {
  forgetBack();
  leave(true);
  cleanPage();
}

// W15: [guard pid, evidence, caught, thieves, pids the guard's screen shows, knocked down s, by which trap]
function guardState() { return [G.guardPid || '', guardView.evidence ? 1 : 0, guardView.caught || 0, guardView.thieves || 0, [...guardView.gv], +(guardView.stunT || 0).toFixed(2), guardView.stunKind || '']; }
// W15: who plays the guard; only before the clock starts, one guard per room (host)
function setGuard(pid, want) {
  if (G.round.phase !== 'ready') { if (pid === N.pid) flash(S.hguard.rolesBeforeClock, 2.5, '#93a1b8'); else send({ type: 'ev', k: 'flash', t: S.hguard.rolesBeforeClock, c: '#93a1b8', s: 2.5 }, N.peerOf.get(pid)); return; }
  if (want && G.guardPid && G.guardPid !== pid) { if (pid === N.pid) flash(S.hguard.taken, 2.5, '#93a1b8'); else send({ type: 'ev', k: 'flash', t: S.hguard.taken, c: '#93a1b8', s: 2.5 }, N.peerOf.get(pid)); return; }
  applyGuard(want ? pid : (G.guardPid === pid ? null : G.guardPid), N.pid);
  forgetSent();
  send(lobbyMessage());
  refreshLobby();
}
export function netRole(want) { if (isHost()) setGuard(N.pid, want); else netIntent('role', { guard: !!want }); }

// a guest's own shouts (heist.js counts them; the host turns them into the noise in the house)
// tests (__game.net) and the lobby: open a room as the host or join one as a guest
export function netOpen(code, role, name = N.name || 'Test', thief = N.thief) { N.name = name; N.thief = thief; return open(code, role); }
export function netFakeVersion(v) { N.fakeVersion = v; }   // tests: a guest of another build
export function netLeave() { leave(); refreshLobby(); }

export function guestShout() { N.shouts = (N.shouts || 0) + 1; }
export { sim as netSim };
