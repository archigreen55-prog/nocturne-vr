// Шепотун (W7, story-bible.md §4.3): a lurker that lives behind a grate (the dacha: the living-room
// fireplace) and eats whispers. Somebody whispers within `hear` m of the grate, in its room with
// nothing between: «ш-ш-ш» and dust (the telegraph, 1 s); 3 s after the whisper it repeats it louder
// from the grate (a synthesised whisper, audio/whisperSfx.js) — for the guard a 'voice' noise there.
// Three whispers close by within 15 s: «fed» — till the end of the round it whispers where the guard
// is. Asleep in the contracts before its own (CFG.story.whisperer.maps[map].from) and without a
// microphone (then a can landing next to the grate wakes one echo). The sounds and the noise are
// made by the caller (systems/story.js) through the callbacks.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { Builder } from '../world/level.js';

export class Whisperer {
  // env: { level, spec: { x, y, z }, onTelegraph(), onEcho({ dur, env, who }), onFed(who) }
  constructor(env) {
    this.env = env;
    const P = this.spec = env.spec;
    this.room = env.level.roomAt ? env.level.roomAt(P.x, P.z, 0) : null;
    // the grate: dark iron bars across the fireplace opening
    const B = new Builder();
    B.box(-0.55, 0, -0.02, 0.55, 0.05, 0.02, 0x1c1c20);
    B.box(-0.55, 0.42, -0.02, 0.55, 0.47, 0.02, 0x1c1c20);
    for (let i = 0; i < 9; i++) B.box(-0.52 + i * 0.13, 0.05, -0.012, -0.5 + i * 0.13, 0.42, 0.012, 0x26262c);
    this.grate = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.grate.name = 'whisperer grate';
    this.grate.position.set(P.x, P.y - 0.15, P.z);
    // dust over the grate in the telegraph (a few grey specks)
    const D = new Builder();
    for (let i = 0; i < 18; i++) D.box(-0.01, -0.01, -0.01, 0.01, 0.01, 0.01, 0xb8b0a0);
    this.dust = D.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }));
    this.dust.name = 'whisperer dust';
    this.dust.visible = false;
    this.dust.position.set(P.x, P.y + 0.3, P.z + 0.1);
    this.group = new THREE.Group();
    this.group.add(this.grate, this.dust);
    this.reset();
  }

  reset() {
    this.state = 'idle';         // idle | telegraph | wait (the echo is coming)
    this.t = 0; this.coolT = 0;
    this.pending = null;         // { dur, env, who }
    this.listeners = new Map();  // who -> { t (s of whisper), env [dB] }
    this.fedLog = [];            // times of whispers close by
    this.fed = null;             // who fed it (once a round)
    this.stats = { whispers: 0, echoes: 0, fed: false };
    this.dust.visible = false;
  }

  // can (x, z, floorY) be heard: within `hear`, the same room, nothing solid between
  hears(x, z, y = 0) {
    const P = this.spec, L = this.env.level;
    if (Math.abs(y) > 1) return false;   // the ground floor only
    if (Math.hypot(x - P.x, z - P.z) > CFG.story.whisperer.hear) return false;
    if (L.roomAt && L.roomAt(x, z, 0) !== this.room) return false;
    return !(L.soundOccluded && L.soundOccluded(P.x, P.z + 0.4, x, z));
  }

  // A whisper heard (dur s, env: its loudness curve in dB or []): the telegraph now, the echo after `delay`
  heard(who, dur, envDb, near, now) {
    const W = CFG.story.whisperer;
    this.stats.whispers++;
    if (near) {
      this.fedLog = this.fedLog.filter((t) => now - t < W.fed.within);
      this.fedLog.push(now);
      if (!this.fed && this.fedLog.length >= W.fed.n) { this.fed = who; this.stats.fed = true; if (this.env.onFed) this.env.onFed(who); }
    }
    if (this.state !== 'idle' || this.coolT > 0) return false;
    this.state = 'telegraph'; this.t = 0;
    this.pending = { dur: Math.min(W.maxEcho, Math.max(0.4, dur)), env: envDb.slice(-Math.round(W.maxEcho * 30)), who };
    this.dust.visible = true;
    if (this.env.onTelegraph) this.env.onTelegraph(who);
    return true;
  }

  // listeners: [{ who, x, z, y, whispering, db (this frame's dB, or null) }]; awake: false = asleep
  update(dt, listeners, awake, now) {
    const W = CFG.story.whisperer;
    if (this.coolT > 0) this.coolT -= dt;
    // dust drifts up while it whispers back
    if (this.dust.visible) { this.dust.rotation.y += dt * 2; this.dust.position.y = this.spec.y + 0.3 + 0.1 * Math.sin(now * 5); }
    if (this.state === 'telegraph') {
      this.t += dt;
      if (this.t >= W.telegraph) { this.state = 'wait'; this.dust.visible = false; }
    } else if (this.state === 'wait') {
      this.t += dt;
      if (this.t >= W.delay) {
        const p = this.pending;
        this.state = 'idle'; this.t = 0; this.pending = null; this.coolT = W.cooldown;
        this.stats.echoes++;
        if (this.env.onEcho) this.env.onEcho(p);
      }
    }
    if (!awake) { this.listeners.clear(); return; }
    for (const L of listeners) {
      const st = this.listeners.get(L.who) || { t: 0, env: [], near: false };
      const inRange = L.whispering && this.hears(L.x, L.z, L.y);
      if (inRange) {
        st.t += dt;
        if (L.db !== null && L.db !== undefined) st.env.push(+L.db.toFixed(1));
        st.near = st.near || Math.hypot(L.x - this.spec.x, L.z - this.spec.z) < W.fed.near;
        if (st.t >= W.maxEcho) { this.heard(L.who, st.t, st.env, st.near, now); st.t = 0; st.env = []; st.near = false; }
      } else if (st.t > 0) {   // the whisper ended
        if (st.t >= W.minT) this.heard(L.who, st.t, st.env, st.near, now);
        st.t = 0; st.env = []; st.near = false;
      }
      this.listeners.set(L.who, st);
    }
  }

  // no microphone: a can landing next to the grate gives one echo
  knock(now) {
    if (this.state !== 'idle' || this.coolT > 0) return false;
    this.state = 'telegraph'; this.t = 0;
    this.pending = { dur: 1.2, env: [], who: null };
    this.dust.visible = true;
    if (this.env.onTelegraph) this.env.onTelegraph(null);
    this.coolT = 0;
    return true;
  }
}
