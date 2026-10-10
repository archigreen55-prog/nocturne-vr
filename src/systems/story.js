// The story in the game (W7; story-bible.md, story-texts-uk.md; logic without DOM in game/story.js):
//   - the customer's and the crew's lines before / after a contract (board, the phone's menu and
//     summary, the start screen read them from here);
//   - the crew's subtitles from the thief you play (one line, under the guard's; at most one per 20 s);
//   - Petrovych's start line, his lines at the whisperer's grate;
//   - the notes (on this device only: taken = read, gone, in «Папери»);
//   - Тихарник (the cards open on the first meeting);
//   - Шепотун (enemies/whisperer.js): the grate, the whispers it hears, the echo, «fed»;
//   - the wardrobe lurker's box (only while it sleeps), its «lost you» when you hold the breath;
//   - the report block game.story.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { Builder } from '../world/level.js';
import { Whisperer } from '../enemies/whisperer.js';
import { playShh, playWhisperEcho, whisperInfo } from '../audio/whisperSfx.js';
import { storyBefore, storyAfter, crewSays, meetLurker, findNote, noteOut, thief } from '../game/story.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const local = {
  notes: [], whisperer: null, phase: null, said: new Set(), crewT: -1e9, guardNearT: -1e9, spokeT: -1e9,
  houseSaid: false, held: new Set(), damaged: 0, alarm: false, scares: 0, boxHint: false, grateLine: 0,
  echoAt: null, hintT: 0, stats: null,
};
const newStats = () => ({ notes: [], cards: [], crew: [], lost: 0, box: false, echoes: 0, whispers: 0, fed: false, cans: 0 });

// ---------- what the board, the menu, the summary and the start screen show ----------
export const beforeNow = (c = G.contract) => storyBefore(c);
export const afterNow = () => (G.round && G.round.result ? storyAfter(G.contract, G.round.result, G.verdict, { alarmed: G.round.alarmed, loot: G.loot }) : null);
export const storyReport = () => ({ ...local.stats, thief: thief(), whisper: whisperInfo.last });

// ---------- the crew's subtitles ----------
// situation: start | take | guardNear | lurker | scared | damaged | heavy | alarm | caught | clean
function crew(situation) {
  const C = CFG.story.crew, now = G.simT;
  if (situation !== 'alarm' && G.alert && G.alert.full) return;   // in a full alarm only «alarm»
  if (situation === 'guardNear') { if (now - local.guardNearT < C.guardNearEvery) return; }
  else if (local.said.has(situation)) return;
  if (situation !== 'alarm' && situation !== 'caught' && situation !== 'clean' && now - local.crewT < C.every) return;
  const L = crewSays(situation);
  if (!L) return;
  local.said.add(situation); local.crewT = now;
  if (situation === 'guardNear') local.guardNearT = now;
  G.crewLine = L; G.crewLineT = C.show; G.wristTimer = 0;
  local.stats.crew.push(situation);
}

// ---------- the lurkers (called from systems/world.js) ----------
// the wardrobe lurker woke for `p`: a card when you see it (in front, close), the crew's line
export function storyLurkerWake(p) {
  if (!p || p !== G.player) return;
  const l = (G.lurkers || []).find((x) => x.victim === p) || G.lurker;
  if (l && seen(l.FRONT.x, (l.y0 || 0) + 1, l.FRONT.z, CFG.story.crew.lurkerSeen)) card('wardrobe');
  crew('lurker');
}
// you held the breath in its telegraph: it lost you
export function storyLurkerLost(p) {
  if (p !== G.player) return;
  flash(S.lurkers.hud.wardrobeLost, 3, '#7fc8ff');
  local.stats.lost++;
}
function card(id) {
  if (meetLurker(id)) { flash(S.lurkers.hud.newCard(S.lurkers.cards[id].name), 4, '#ffd166'); local.stats.cards.push(id); G.boardDirty = true; }
}
// (x, y, z) in front of the eyes within `dist` m
function seen(x, y, z, dist) {
  const h = G.player.head;
  _v.set(x - h.x, y - h.y, z - h.z);
  const d = _v.length();
  if (d > dist) return false;
  if (d < 0.8) return true;
  G.camera.getWorldDirection(_f);
  return _v.normalize().dot(_f) > CFG.story.wardrobe.seenCos;
}

// ---------- the notes ----------
function buildNotes() {
  for (const n of local.notes) G.scene.remove(n.mesh);
  local.notes = [];
  for (const def of CFG.story.notes[G.level.id] || []) {
    const B = new Builder();
    if (def.wall) { B.box(-0.06, 0, -0.002, 0.06, 0.15, 0.002, 0xeee4c8); B.box(-0.045, 0.03, 0.002, 0.03, 0.12, 0.003, 0x8a8070); }
    else { B.box(-0.06, 0, -0.075, 0.06, 0.004, 0.075, 0xeee4c8); B.box(-0.045, 0.004, -0.05, 0.03, 0.005, 0.05, 0x8a8070); }
    const mesh = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a1810 }));
    mesh.name = 'note: ' + def.id;
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    mesh.rotation.y = def.yaw || 0;
    G.scene.add(mesh);
    local.notes.push({ ...def, mesh, x: def.pos[0], y: def.pos[1] + (def.wall ? 0.08 : 0.01), z: def.pos[2], out: false });
  }
}
const wardrobeOpen = () => (G.lurkers || []).some((l) => l.env.ajar && l.state === 'cooldown');
function syncNotes() {
  const open = wardrobeOpen();
  for (const n of local.notes) { n.out = noteOut(n) && (!n.inWardrobe || open); n.mesh.visible = n.out; }
}
// phone / PC: the note in front of the eyes (nothing in hand)
export function aimedNote() {
  if (!local.notes.length || G.hands.desk) return null;
  const p = G.player, R = CFG.story.noteUse.reach, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let best = null, bestD = R;
  for (const n of local.notes) {
    if (!n.out || Math.abs(n.y - (p.floorY || 0)) > 2.2) continue;
    const dx = n.x - p.head.x, dz = n.z - p.head.z, d = Math.hypot(dx, dz);
    if (d > bestD || (d > 0.4 && (dx * fx + dz * fz) / d < 0.7)) continue;
    best = n; bestD = d;
  }
  return best;
}
// VR: the trigger with a hand at a note reads it; false when none is in reach
export function readNoteAtHand(hand) {
  const g = G.grips && G.grips[hand];
  if (!g || !local.notes.length) return false;
  g.getWorldPosition(_v);
  const n = local.notes.find((x) => x.out && Math.hypot(_v.x - x.x, _v.y - x.y, _v.z - x.z) < CFG.story.noteUse.hand);
  if (!n) return false;
  readNote(n);
  G.xrIn.pulse(hand, 0.2, 20);
  return true;
}
export function readNote(n) {
  if (!n || !n.out) return false;
  findNote(n.id);
  n.out = false; n.mesh.visible = false;
  flash(S.notes.found(S.notes.items[n.id].text), 6, '#f0e6c8');
  local.stats.notes.push(n.id);
  G.boardDirty = true;
  return true;
}

// ---------- Шепотун ----------
function buildWhisperer() {
  if (local.whisperer) { G.scene.remove(local.whisperer.group); local.whisperer = null; }
  const spec = CFG.story.whisperer.maps[G.level.id];
  if (!spec) return;
  const w = local.whisperer = new Whisperer({
    level: G.level, spec,
    onTelegraph: () => playShh(grateAt(), grateOcc()),
    onFed: (who) => {
      local.stats.fed = true;
      if (who === 'me') { flash(S.lurkers.hud.whispererFed, 4, '#7fc8ff'); card('whisperer'); local.hintT = CFG.story.whisperer.fed.every; }
    },
    onEcho: (p) => echo(p),
  });
  G.scene.add(w.group);
}
const grateAt = () => { const P = local.whisperer.spec; return { x: P.x, y: P.y + 0.3, z: P.z }; };
const grateOcc = () => { const P = local.whisperer.spec, h = G.player.head; return G.level.soundOccluded(h.x, h.z, P.x, P.z + 0.4); };
// the echo: the synthesised whisper at the grate and a 'voice' noise there (the guard goes to look)
function echo(p) {
  const W = CFG.story.whisperer, P = local.whisperer.spec;
  playWhisperEcho(grateAt(), grateOcc(), p.dur, p.env);
  if (!G.isGuest) G.noise.emit(P.x, P.z + 0.4, W.radius, 'voice', { y: 0, source: 'world' });
  if (G.netEvent) G.netEvent('wecho', { dur: p.dur, who: p.who });   // the friends hear it too (systems/net.js)
  local.stats.echoes++;
  local.echoAt = { x: P.x, z: P.z + 0.6, t: G.simT };
  if (p.who === 'me') { flash(S.lurkers.hud.whispererEcho, 3, '#7fc8ff'); card('whisperer'); }   // a new card's line replaces the echo's
}
// a guest hears the host's echo (systems/net.js)
export function storyNetEcho(m, mine) {
  if (!local.whisperer) return;
  playWhisperEcho(grateAt(), grateOcc(), m.dur || 1, []);
  if (mine) { flash(S.lurkers.hud.whispererEcho, 3, '#7fc8ff'); card('whisperer'); }
}
// is it awake in this contract? (from its contract on, in the order of the map's contracts; decision R4 A)
function whispererAwake() {
  const spec = CFG.story.whisperer.maps[G.level.id];
  if (!spec) return false;
  const ids = CFG.contracts.map((c) => c.id), from = ids.indexOf(spec.from), here = ids.indexOf(G.contract.id);
  return from >= 0 && here >= from;
}
// the players who may whisper: this device's (the microphone's level) and the friends' (their «wh», R5 A)
function listeners() {
  const out = [], mic = G.mic, p = G.player;
  const live = mic.state === 'on' && !mic.noMic && !G.breath.holding && G.caughtT < 0;
  out.push({ who: 'me', x: p.head.x, z: p.head.z, y: p.floorY || 0, whispering: live && mic.whispering, db: mic.env });
  for (const r of G.players || []) {
    if (r === p || !r.mic) continue;
    out.push({ who: r.id || r.pid, x: r.head.x, z: r.head.z, y: r.floorY || 0, whispering: !!(r.mic.whisper && r.mic.live && !r.mic.breath), db: null });
  }
  return out;
}

// ---------- a new round ----------
function roundStarts() {
  local.said = new Set(); local.crewT = -1e9; local.guardNearT = -1e9; local.houseSaid = false; local.held = new Set();
  local.damaged = 0; local.alarm = false; local.scares = (G.lurkers || []).reduce((n, l) => n + l.scares, 0); local.boxHint = false;
  local.echoAt = null; local.grateLine = local.grateLine || 0; local.stats = newStats();
  G.crewLineT = 0;
  if (local.whisperer) local.whisperer.reset();
}

export const story = {
  id: 'story',
  init() {
    local.stats = newStats();
    G.crewLine = null; G.crewLineT = 0;
    buildNotes();
    buildWhisperer();
    syncNotes();
  },
  world(dt) {
    const { round, player, hands, loot } = G;
    G.crewLineT = Math.max(0, (G.crewLineT || 0) - dt);
    if (round.phase !== local.phase) {
      if (round.phase === 'ready') roundStarts();
      else if (round.phase === 'heist' && local.phase === 'ready') { roundStarts(); crew('start'); }
      else if (round.phase === 'result') {
        const R = round.result;
        if (R && R.kind === 'caught') crew('caught');
        else if (R && G.verdict && G.verdict.goal && !round.alarmed && !(R.shouts > 0)) crew('clean');
      }
      local.phase = round.phase;
    }
    syncNotes();
    // the box in the wardrobe: taken only while it sleeps (its doors ajar)
    const open = wardrobeOpen();
    for (const it of loot.items) if (it.inWardrobe) it.shut = !open && !it.held && !it.delivered && it.state === 'rest' && Math.hypot(it.mesh.position.x - it.def.pos[0], it.mesh.position.z - it.def.pos[2]) < 0.3;
    if (round.phase !== 'heist' && round.phase !== 'escape') return;
    const W = G.lurker;
    // «У шафі щось блищить»: once a round, close to the shut wardrobe with the box inside
    if (!local.boxHint && !(G.flashT > 0) && W && W.env.ajar && W.state === 'dormant' && loot.items.some((it) => it.inWardrobe && it.shut) && Math.hypot(player.head.x - W.FRONT.x, player.head.z - W.FRONT.z) < 2) {
      local.boxHint = true; flash(S.lurkers.hud.wardrobeItem, 3, '#ffd166');
    }
    if (loot.items.some((it) => it.inWardrobe && it.held)) local.stats.box = true;
    // Petrovych on the start of a round (the dacha's guard; the host's)
    if (!local.houseSaid && round.t >= CFG.story.houseAfter && !G.isGuest && G.level.id === 'dacha' && G.patrol.state === 'task') { local.houseSaid = true; G.patrol.env.say(S.guard.say.house); }
    // the crew's situations
    for (const it of hands.heldItems()) {
      if (it.throwable || it.prop || local.held.has(it)) continue;
      local.held.add(it);
      crew(it.twoHanded ? 'heavy' : 'take');
    }
    const dmg = loot.items.filter((i) => i.damaged || i.broken).length;
    if (dmg > local.damaged) crew('damaged');
    local.damaged = dmg;
    if (G.alert.full && !local.alarm) crew('alarm');
    local.alarm = G.alert.full;
    const sc = (G.lurkers || []).reduce((n, l) => n + l.scares, 0);
    if (sc > local.scares) { crew('scared'); if ((G.lurkers || []).some((l) => l.victim === player && l.state !== 'dormant')) card('wardrobe'); }
    local.scares = sc;
    if ((G.guards || [G.patrol]).some((g) => g.state === 'task' && !g.visible && g.stunT <= 0 && Math.hypot(g.x - player.head.x, g.z - player.head.z, (g.y || 0) - (player.floorY || 0)) < CFG.story.crew.guardNear)) crew('guardNear');
    // the thief Назар: its player spoke (≥ «НОРМАЛЬНО»)
    if (thief() === 'nazar' && G.speakT >= CFG.mic.normalAfter && G.simT - local.spokeT > CFG.story.crew.spokeEvery) { local.spokeT = G.simT; flash(S.crew.spoke, 2.5, '#ffd166'); }
    // Шепотун
    const w = local.whisperer;
    if (w) {
      const awake = whispererAwake() && G.caughtT < 0;
      w.update(dt, G.isGuest ? [] : listeners(), awake && !G.isGuest, G.simT);   // a guest: the host's whisperer (its echo comes as an event)
      // no microphone: a can landing close to the grate wakes one echo
      if (awake && !G.isGuest && (G.mic.state !== 'on' || G.mic.noMic)) {
        for (const it of loot.items) {
          if (!it.throwable || !it.landedAt || it.landedAt === it.knockSeen) continue;
          it.knockSeen = it.landedAt;
          if (Math.hypot(it.landedAt.x - w.spec.x, it.landedAt.z - w.spec.z) < CFG.story.whisperer.can.near && w.knock(G.simT)) local.stats.cans++;
        }
      }
      // fed: where the guard is, every 20 s (by subtitle)
      if (w.fed === 'me' && awake) {
        local.hintT -= dt;
        if (local.hintT <= 0) {
          local.hintT = CFG.story.whisperer.fed.every;
          const g = G.patrol, room = G.level.roomAt(g.x, g.z, g.y || 0);
          if (room) flash(S.lurkers.hud.whispererHint(room), 4, '#7fc8ff');
        }
      }
      local.stats.whispers = w.stats.whispers;
      // the guard came to the grate after an echo: «Протяг.» / «Миші…» in turn (the host's guards)
      if (local.echoAt && !G.isGuest) {
        if (G.simT - local.echoAt.t > 40) local.echoAt = null;
        else for (const g of G.guards || [G.patrol]) {
          if (Math.hypot(g.x - local.echoAt.x, g.z - local.echoAt.z) < 1.6 && (g.y || 0) < 1) {
            const L = ['draft', 'mice', 'settles', 'cat'];
            if (!g.env.guard) g.env.say(S.guard.say[L[local.grateLine++ % L.length]]);   // Petrovych's lines (the dacha)
            local.echoAt = null;
            break;
          }
        }
      }
    }
  },
};
