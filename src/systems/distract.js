// Throwing and devices (W2a). Input (phone, PC): hold the context button / the left mouse button / G
// with a one-hand item = aim (an arc shows where it lands), let go = throw; the ✕ / the right button =
// not. World: the devices' timers (the radio plays and is heard, the house phone rings 3 s after the
// handset, the breaker's lights flicker and go out until a guard flips it back), a thrown item hitting
// a guard («Ай!»), a can in a guard's hand. Present: the arc. The guard's side (switch X off, take
// the can to the bin, sweep the glass) is enemies/brain.js; the devices' meshes and the power,
// world/devices.js; the numbers, CFG.throw and CFG.devices.
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { Devices, power } from '../world/devices.js';
import { ThrowArc, aimVelocity } from '../loot/throw.js';
import { Builder } from '../world/level.js';
import { RadioVoice, playSwitch, playBreaker, playHouseRing, playOuch } from '../audio/distractSfx.js';
import { G } from './state.js';
import { flash } from './messages.js';
import { score } from './traps.js';
import { S } from '../i18n/index.js';

const _v = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
const local = { aim: null, mouseStart: false, mouseEnd: false, cancel: false, lastPhase: null, voices: new Map(), stats: null, arc: null };
const newStats = () => ({ throws: { can: 0, bottle: 0, loot: 0 }, hits: 0, uses: {}, windows: [] });

// ---------- the report («Скопіювати звіт»: game.distract) ----------
export function distractReport() {
  const D = G.devices;
  return {
    ...local.stats, power: power.on,
    devices: D ? D.list.map((d) => ({ id: d.id, uses: d.uses, dead: d.dead })) : [],
    cansFound: (G.guards || []).reduce((n, g) => n + (g.brain.cansFound || 0), 0),
  };
}

// ---------- devices ----------
const voiceOf = (dev) => { if (!local.voices.has(dev)) local.voices.set(dev, new RadioVoice()); return local.voices.get(dev); };
const at = (dev) => ({ x: dev.x, y: dev.y + 0.1, z: dev.z });
const occ = (dev) => { const h = G.player.head; return G.level.soundOccluded(h.x, h.z, dev.x, dev.z); };
function setMask(dev, on) {   // a playing radio: a guard right beside it hears worse (like the mansion's fountain)
  const M = G.level.maskZones;
  const i = M.findIndex((m) => m.dev === dev);
  if (on && i < 0) M.push({ x: dev.x, z: dev.z, r: CFG.devices.radio.mask, dev });
  if (!on && i >= 0) M.splice(i, 1);
}
function radioOff(dev) { dev.on = false; voiceOf(dev).stop(); setMask(dev, false); }
function powerBack(dev) { power.on = true; power.flicker = 0; dev.on = false; dev.t = 0; dev.toldOther = false; }
const used = (dev) => { local.stats.uses[dev.id] = (local.stats.uses[dev.id] || 0) + 1; };

// The guard's side of a device (enemies/brain.js calls these): it answers the phone, it switches off.
function wire(dev) {
  dev.answer = () => { dev.ringing = false; dev.talking = true; G.devices.show(dev); };
  dev.guardOff = (g, unplug) => {
    if (dev.kind === 'radio') radioOff(dev);
    else if (dev.kind === 'phone') { dev.talking = false; dev.ringing = false; }
    else if (dev.kind === 'breaker') { playBreaker(at(dev), occ(dev)); powerBack(dev); }
    if (dev.kind !== 'breaker') playSwitch(at(dev), occ(dev));
    if (dev.onAt !== undefined) local.stats.windows.push({ id: dev.id, s: +(G.simT - dev.onAt).toFixed(1) });
    dev.claimed = null;
    if (unplug) dev.dead = true;
    G.devices.show(dev);
  };
}

// The player uses a device (VR trigger, the phone's context button, E).
export function useDevice(dev) {
  const T = S.devices, D = CFG.devices;
  if (G.round.phase !== 'heist') { flash(T.notYet, 2, '#93a1b8'); return; }
  if (dev.dead) { flash(T.dead[dev.kind] || T.dead.radio, 2.5, '#93a1b8'); return; }
  switch (dev.kind) {
    case 'radio':
      playSwitch(at(dev), false);
      if (dev.on) { radioOff(dev); flash(T.radioOff, 1.5); break; }
      dev.on = true; dev.uses++; dev.noiseT = 0; dev.onAt = G.simT; used(dev);
      voiceOf(dev).start(at(dev)); setMask(dev, true);
      flash(T.radioOn, 2.5, '#b48cff');
      break;
    case 'handset': {
      const ph = G.devices.byId(dev.def.rings);
      playSwitch(at(dev), false);
      if (!ph || ph.dead) flash(T.dead.phone, 2.5, '#93a1b8');
      else if (ph.talking) flash(T.busy, 2.5, '#93a1b8');
      else if (ph.ringing || ph.delayT > 0) flash(T.calling, 2, '#93a1b8');
      else { ph.delayT = D.phone.delay; ph.uses++; ph.onAt = G.simT + D.phone.delay; used(ph); flash(T.dialing, 3, '#b48cff'); }
      break;
    }
    case 'phone':
      if (dev.ringing) { dev.ringing = false; dev.t = 0; playSwitch(at(dev), false); flash(T.hungUp, 2); }
      else flash(T.phoneHint, 3, '#93a1b8');
      break;
    case 'breaker':
      playBreaker(at(dev), false);
      if (dev.on || power.flicker > 0) { powerBack(dev); flash(T.lightsBack, 2); break; }
      dev.uses++; used(dev);
      power.flicker = D.breaker.flicker;
      G.noise.emit(dev.x, dev.z, D.breaker.click, 'device', { y: dev.y, source: 'world' });
      flash(T.lightsOff, 2.5, '#b48cff');
      break;
  }
  G.devices.show(dev);
}
// VR: the trigger with a hand at a device uses it; returns false when no device is in reach (doors then)
export function useDeviceAtHand(hand) {
  const g = G.grips && G.grips[hand];
  if (!g || !G.devices) return false;
  g.getWorldPosition(_h);
  const d = G.devices.nearHand(_h);
  if (!d) return false;
  useDevice(d);
  G.xrIn.pulse(hand, 0.2, 20);
  return true;
}
// phone / PC: the device in front of the eyes (nothing in hand, no item under the crosshair)
export const aimedDevice = () => (G.devices && !G.hands.desk && !G.hands.deskAim ? G.devices.aimed(G.player.head, G.player.yaw, G.player.floorY || 0) : null);

// the lights went out: the nearest guard going about its business goes to the breaker; the other one
// (the mansion) asks over the radio
function sendToBreaker(dev) {
  const gs = (G.guards || []).filter((g) => g.state === 'task').map((g) => ({ g, d: Math.hypot(g.x - dev.x, g.z - dev.z) + 8 * Math.abs((g.floor || 0) - (dev.stand[2] || 0)) })).sort((a, b) => a.d - b.d);
  for (const { g } of gs) if (g.brain.deviceTask(dev) && dev.claimed === g) break;
  if (dev.claimed && !dev.toldOther) {
    dev.toldOther = true;
    for (const g of G.guards) if (g !== dev.claimed) g.env.say(S.devices.radioDark);
  }
}

// ---------- throwing (phone, PC) ----------
const canAim = () => !!G.hands.desk && !G.hands.desk.twoHanded && G.caughtT < 0 && !G.paused && G.playingDesktop && !G.inVR;
function cancelAim(say) { if (local.aim && say) flash(S.throw.cancelled, 1.2, '#93a1b8'); local.aim = null; if (local.arc) local.arc.hide(); }
function doThrow() {
  const { hands, player } = G;
  aimVelocity(player.yaw, player.lookPitch, _v);
  const it = hands.throwDesk(_v);
  local.aim = null; local.arc.hide();
  if (!it) return;
  local.stats.throws[it.throwable ? (it.bottle ? 'bottle' : 'can') : 'loot']++;
}

export const distract = {
  id: 'distract',
  init() {
    const { scene, level, renderer } = G;
    local.stats = newStats();
    level.maskZones = level.maskZones || [];
    const devs = G.devices = new Devices(level.id);
    for (const d of devs.list) wire(d);
    scene.add(devs.group);
    // the bin the guard takes the cans to
    const M = CFG.throw.maps[level.id];
    if (M) {
      const B = new Builder();
      B.cyl(0.17, 0.15, 0.45, 0, 0, 0, 0x4a5058, 10); B.cyl(0.18, 0.18, 0.03, 0, 0.45, 0, 0x30343a, 10);
      const bin = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
      bin.position.set(M.bin[0], (M.bin[2] || 0) * 3, M.bin[1]);
      bin.name = 'bin';
      scene.add(bin);
    }
    local.arc = new ThrowArc();
    scene.add(local.arc.group);
    if (G.touch) G.touch.canAim = canAim;
    // PC: the left button held = aim, released = throw; the right button = not (the board takes a click first)
    renderer.domElement.addEventListener('mousedown', (e) => {
      if (G.touch || document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 0 && !G.pointer.hover.desk) local.mouseStart = true;
      if (e.button === 2) local.cancel = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) local.mouseEnd = true; });
    renderer.domElement.addEventListener('contextmenu', (e) => { if (document.pointerLockElement === renderer.domElement) e.preventDefault(); });
  },
  input() {
    const { touch, keys } = G;
    const ok = canAim();
    if (touch) {
      if (touch.take('aimStart') && ok) local.aim = { src: 'touch' };
      if (touch.take('aimCancel')) cancelAim(true);
      if (touch.take('aimQuiet')) cancelAim(false);   // it was a press after all («Покласти»)
      if (touch.take('throw') && local.aim) doThrow();
    } else {
      const gk = keys.any('KeyG');
      if (!local.aim && ok && (gk || local.mouseStart)) local.aim = { src: gk ? 'key' : 'mouse' };
      else if (local.aim && local.cancel) cancelAim(true);
      else if (local.aim && ((local.aim.src === 'key' && !gk) || (local.aim.src === 'mouse' && local.mouseEnd))) doThrow();
    }
    local.mouseStart = local.mouseEnd = local.cancel = false;
    if (local.aim && !ok) cancelAim(false);
  },
  world(dt) {
    const { round, loot, devices } = G, D = CFG.devices;
    // a new round: every device off, the lights on
    if (round.phase !== local.lastPhase) {
      if (round.phase === 'ready' && local.lastPhase) {
        for (const d of devices.list) if (d.kind === 'radio') radioOff(d);
        devices.reset(); G.level.maskZones.length = 0;
        for (const g of G.guards || []) g.brain.cansFound = 0;
        local.stats = newStats();
      }
      local.lastPhase = round.phase;
    }
    for (const dev of devices.list) {
      if (dev.claimed && !dev.claimed.queue.some((st) => st.dev === dev)) dev.claimed = null;   // interrupted (a noise, a chase)
      if (dev.kind === 'radio' && dev.on) {
        if ((dev.noiseT -= dt) <= 0) { dev.noiseT = D.radio.every; G.noise.emit(dev.x, dev.z, D.radio.noise, 'device', { y: dev.y, source: 'world', device: dev }); }
        const v = voiceOf(dev); v.setOccluded(occ(dev)); v.update(dt);
      } else if (dev.kind === 'phone') {
        if (dev.delayT > 0 && (dev.delayT -= dt) <= 0) { dev.delayT = -1; dev.ringing = true; dev.t = D.phone.ring; dev.noiseT = 0; }
        if (dev.ringing) {
          if ((dev.noiseT -= dt) <= 0) { dev.noiseT = D.phone.every; playHouseRing(at(dev), occ(dev)); G.noise.emit(dev.x, dev.z, D.phone.noise, 'device', { y: dev.y, source: 'world', device: dev }); }
          if ((dev.t -= dt) <= 0) dev.ringing = false;   // nobody answered
        }
      } else if (dev.kind === 'breaker') {
        if (power.flicker > 0 && (power.flicker -= dt) <= 0) { power.flicker = 0; power.on = false; dev.on = true; dev.t = 0; dev.onAt = G.simT; G.boardDirty = true; }
        if (dev.on) {
          if ((dev.t += dt) > D.breaker.backAfter) powerBack(dev);
          else if (!dev.claimed) sendToBreaker(dev);
        }
      }
      devices.show(dev);
    }
    // a thrown item hits a guard: «Ай!», it bounces off, the guard looks where it came from
    const H = CFG.throw.hit;
    for (const it of loot.items) {
      if (it.state !== 'fall' || !it.thrown || it.hitGuard) continue;
      const p = it.mesh.position;
      for (const g of G.guards || []) {
        const h = p.y - g.y;
        if (Math.hypot(p.x - g.x, p.z - g.z) > H.radius || h < H.height[0] || h > H.height[1]) continue;
        it.hitGuard = true; it.vel.x *= -0.25; it.vel.z *= -0.25;
        local.stats.hits++; score('hit');   // W2b: mischief points
        g.env.say(S.throw.ouch); playOuch(g.voice);
        G.alert.add(H.points, g.x, g.z);
        const f = it.thrownFrom;
        if (g.state !== 'chase' && !G.alert.full && f) g.react(f.x, f.z, G.level.floorIndex ? G.level.floorIndex(f.y - 1) : undefined);
        break;
      }
    }
    // a can in a guard's right hand (dropped where it stands if something called it away)
    for (const it of loot.items) {
      const g = it.carrier;
      if (!g) continue;
      if (g.state !== 'task' || !g.queue.some((st) => st.item === it)) { it.carrier = null; it.found = false; it.thrown = false; it.drop(_v.set(0, 0, 0)); continue; }   // not a throw: no «Ай!»
      const fx = -Math.sin(g.heading), fz = -Math.cos(g.heading);
      it.mesh.position.set(g.x - fz * 0.3 + fx * 0.25, g.y + 0.85, g.z + fx * 0.3 + fz * 0.25);
    }
  },
  present() {
    const { hands, player, level } = G;
    if (!local.aim || !hands.desk) { local.arc.hide(); return; }
    hands.desk.centre(_c);
    local.arc.show(level, _c, aimVelocity(player.yaw, player.lookPitch, _v), player.floorY || 0);
  },
};
