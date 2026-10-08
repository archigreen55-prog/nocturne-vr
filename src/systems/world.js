// The world: the house, the player, noise, loot and the drop-off ring, the guard and the lurker, the
// board, the microphone, the scream replay, the breath, the siren, the round. Who hears a noise; the
// full alarm. Pre: the microphone and the scream recorder take this frame's audio.
import { CFG } from '../config/index.js';
import { buildCurrentLevel } from '../world/maps.js';
import { setMapBase } from '../game/difficulty.js';
import { Player } from '../xr/player.js';
import { Board, money } from '../ui/board.js';
import { Mic, Breath } from '../audio/mic.js';
import { ScreamRecorder } from '../audio/scream.js';
import { playCash, Siren, playGrunt, playKettle, playFlush, playRing, playMurmur, playYawn, playRadio } from '../audio/audio.js';
import { evaluate, recordStars } from '../game/contracts.js';
import { NoiseSystem } from '../noise/noise.js';
import { Loot } from '../loot/items.js';
import { Nav } from '../enemies/nav.js';
import { Alert } from '../enemies/alert.js';
import { Patrol } from '../enemies/patrol.js';
import { Lurker } from '../enemies/lurker.js';
import { Round } from '../game/round.js';
import { DropZone } from '../game/dropzone.js';
import { G } from './state.js';
import { flash, fx } from './messages.js';
import { S } from '../i18n/index.js';

export const world = {
  id: 'world',
  init() {
    const { renderer, camera, scene } = G;
    const t0 = performance.now();
    const level = G.level = buildCurrentLevel();
    scene.add(level.group);
    const SPAWN = level.spawn;
    // the map's own van: the drop-off ring and the "at the van" zone (kept across difficulty resets)
    if (level.dropZone) setMapBase({ dropZone: level.dropZone, round: { vanZone: level.vanZone } });
    if (level.lamps) CFG.stealth.lamps = level.lamps;
    // the three point lights go where this map's lamps are
    if (level.lights) G.points.forEach((l, i) => {
      const [x, y, z, color, intensity, dist] = level.lights[i] || level.lights[0];
      l.position.set(x, y, z); l.color.setHex(color); l.intensity = intensity; l.distance = dist; l.userData.base = intensity;
    });

    const player = G.player = new Player(renderer, camera);
    scene.add(player.rig);
    player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
    const listener = () => player.head;

    const noise = G.noise = new NoiseSystem();
    scene.add(noise.mesh);
    const loot = G.loot = new Loot({
      level, noise, listener,
      onMessage: (t, c) => flash(t, 2, c),
      onDeliver: (it) => {
        playCash(); fx('deliver');
        const delay = Math.max(0, G.lastPop + 0.35 - G.simT);   // several items: the labels rise one after another
        G.lastPop = G.simT + delay;
        G.zone.pop('+' + money(it.value), delay);
        flash(S.messages.delivered(it.name, it.damaged, money(it.value)), 2.5, it.damaged ? '#ffb347' : '#5fd38d');
        G.boardDirty = true;
      },
    });
    scene.add(loot.group);
    const zone = G.zone = new DropZone();
    scene.add(zone.group);
    G.simT = 0; G.lastPop = -1;
    const nav = G.nav = new Nav(level);
    const alert = G.alert = new Alert({ hemi: G.hemi, moon: G.moonLight, points: G.points, glow: level.glowMaterial });
    const guardEnv = (guard, secondary) => {
      const env = {
        level, nav, alert, listener, loot, guard, secondary,
        roundTime: () => (G.round.phase === 'heist' ? G.round.t : null),
        say: (text) => { G.guardLine = guard && guard.name ? `${guard.name}: ${text}` : text; G.guardLineT = 3.5; G.wristTimer = 0; },
        sound: (kind, x, z, o) => {
          const L = player.head, v = env.self.voice;
          const at = (px, pz) => ({ pos: { x: px, y: 1, z: pz }, occ: level.soundOccluded(L.x, L.z, px, pz) });
          if (kind === 'kettle') { const a = at(x, z); playKettle(a.pos, a.occ, o.dur, o.whistleAt, o.whistleFor); }
          else if (kind === 'flush') { const a = at(x, z); playFlush(a.pos, a.occ); }
          else if (kind === 'ring') playRing(v);
          else if (kind === 'murmur') playMurmur(v);
          else if (kind === 'yawn') playYawn(v);
          else if (kind === 'radio') playRadio(v);
          else if (kind === 'grunt') playGrunt(v, 'alarm');
        },
      };
      return env;
    };
    const env1 = guardEnv(level.guard, false);
    const patrol = G.patrol = env1.self = new Patrol(env1);
    scene.add(patrol.group);
    // the second guard of a map that has one (W6: the mansion)
    G.patrol2 = null;
    if (level.guard2) {
      const env2 = guardEnv(level.guard2, true);
      G.patrol2 = env2.self = new Patrol(env2);
      scene.add(G.patrol2.group);
    }
    const guards = G.guards = [patrol, G.patrol2].filter(Boolean);
    const onScare = () => { G.comfort.flashColor(0xffffff, 0.55); G.xrIn.pulse('both', 1, 250); fx('scare'); };
    const lurkers = G.lurkers = (level.lurkers || [level.wardrobe]).map((spec) => new Lurker({ level, onScare, spec }));
    const lurker = G.lurker = lurkers[0];
    for (const l of lurkers) scene.add(l.group);
    const board = G.board = new Board(level.board);
    scene.add(board.mesh);
    const mic = G.mic = new Mic();
    const scream = G.scream = new ScreamRecorder(mic);
    scream.onEnded = () => { G.boardDirty = true; };
    G.breath = new Breath();
    const siren = G.siren = new Siren();
    const round = G.round = new Round({
      loot, alert, patrol, lurker, lurkers, scream,
      get hands() { return G.hands; },
      onMessage: (t, c, s) => flash(t, s || 3, c),
      onPhase: (phase) => {
        G.boardDirty = true;
        if (phase === 'result') {
          siren.set(false);
          for (const g of guards) g.reset();
          for (const l of lurkers) l.reset();
          alert.reset();
          const R = round.result;
          if (R.kind === 'caught' || R.kind === 'late') {   // back at the van, facing it
            player.teleport(SPAWN.x, SPAWN.z, Math.atan2(-(CFG.dropZone.x - SPAWN.x), -(CFG.dropZone.z - SPAWN.z)));
            G.comfort.fadeIn(0.8);
          }
          G.resultT = 0; G.autoPlayed = false;
          const verdict = G.verdict = evaluate(G.contract, R, { alarmed: round.alarmed, noMic: mic.noMic || mic.state !== 'on', difficulty: G.difficulty, loot });
          verdict.newBest = recordStars(G.contract.id, G.difficulty, verdict.stars, G.MODE.mode);
          flash(`${R.title} ${'★'.repeat(verdict.stars)}${'☆'.repeat(3 - verdict.stars)}`, 4, R.kind === 'left' || R.kind === 'escaped' ? '#5fd38d' : '#ff5c5c');
        }
      },
    });
    console.log(`Level built in ${(performance.now() - t0).toFixed(0)} ms, ${level.triangles} triangles, ${level.world.edgeCount} collision edges, ${level.doors.length} doors`);

    // noise -> who hears it: with two guards, the one it is louder to (plan-W6 §3.2)
    noise.on((e) => {
      if (round.phase === 'result') return;
      const ey = e.source === 'world' ? e.y : player.floorY;   // a dropped item's noise is at its height; the player's noises on the player's floor
      let best = null, bestK = 0;
      for (const g of guards) { const k = g.audible(e, ey); if (k > bestK) { bestK = k; best = g; } }
      if (best) { best.reactTo(e, ey); alert.add(CFG.alert.points[e.kind] || 20, e.x, e.z); }
      for (const l of lurkers) l.hear(e);
    });
    alert.onFull = (cause, x, z) => {
      if (round.phase === 'result') return;
      const f = x === undefined ? undefined : level.floorIndex(player.floorY);
      const chaser = guards.find((g) => g.state === 'chase');
      const posts = level.alarmPosts;
      guards.forEach((g, i) => {
        // two guards: the one who saw you (or the first) hunts; the other stands at the exit nearest
        // to the alarm and watches it (plan-W6 §3.2)
        if (guards.length > 1 && posts && g !== chaser && (chaser || i > 0)) {
          const px = x === undefined ? g.x : x, pz = z === undefined ? g.z : z;
          const post = posts.map((p) => ({ p, d: Math.hypot(p[0] - px, p[1] - pz) })).sort((a, b) => a.d - b.d)[0].p;
          g.env.sound('radio'); g.env.say(S.mansion.radio.coming);
          g.post(post[0], post[1], post[2]);
        } else g.onAlarm(x, z, f);
      });
      round.startEscape(cause);
      siren.set(true);
      fx('alarm');
    };
  },
  pre(dt) {
    G.mic.update(dt);
    G.scream.update();
  },
};
