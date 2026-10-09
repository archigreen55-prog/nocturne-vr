// Difficulty and contract modifiers over the base numbers in config.js. apply() restores the base
// values first, so switching back and forth is safe. CFG.run holds the settings of the current round
// that are not plain numbers elsewhere (habits, missing-loot rules, shout rule, guard read-out).
import { CFG } from '../config/index.js';
import { wallet, upgrade } from './economy.js';

const BASE = JSON.parse(JSON.stringify({ patrol: CFG.patrol, hearing: CFG.hearing, round: CFG.round, lurker: CFG.lurker, mic: CFG.mic, loot: CFG.loot, player: CFG.player }));
export const DIFFS = ['easy', 'medium', 'hard'];

export function applyDifficulty(id, contract) {
  const D = CFG.difficulties[id] || CFG.difficulties.medium;
  // restore
  for (const k of Object.keys(BASE)) Object.assign(CFG[k], JSON.parse(JSON.stringify(BASE[k])));
  const P = CFG.patrol;
  Object.assign(P, {
    walk: D.walk, investigate: D.investigate, hunt: D.hunt, chase: D.chase, sight: D.sight, beamK: D.beamK,
    crouchK: D.crouchK, fov: D.fov * Math.PI / 180, meterBase: D.meterBase, meterNear: D.meterNear,
    meterDecay: D.meterDecay, reactDelay: D.reactDelay, loseSight: D.loseSight,
  });
  CFG.hearing.radiusK = D.hearK;
  CFG.hearing.occludedK = D.occludedK;
  Object.assign(CFG.round, { time: D.time, warnAt: D.warnAt, escapeTime: D.escapeTime });
  CFG.lurker.cooldown = D.lurkerCooldown;
  CFG.mic.normalRadius = D.voiceRadius;
  CFG.mic.normalAfter = D.voiceAfter;
  CFG.loot.damagedK = D.damagedK;
  CFG.loot.crystal.breakSpeed = D.crystalBreak;
  CFG.run = {
    difficulty: id, habits: D.habits.slice(), noticeMissing: D.noticeMissing, missingToAlarm: D.missingToAlarm,
    shoutFull: D.shoutFull, showGuard: D.showGuard, teaAtStart: 0,
  };
  // running (config/sprint.js): the difficulty's row; suspicion for a running step and for a breath
  Object.assign(CFG.sprint, CFG.sprint.levels[id] || CFG.sprint.levels.medium);
  CFG.alert.points.run = CFG.sprint.points;
  CFG.alert.points.breath = CFG.sprint.breathPoints;
  // contract modifiers
  const M = (contract && contract.mods) || {};
  if (M.time) Object.assign(CFG.round, { time: M.time, warnAt: M.warnAt, escapeTime: M.escapeTime });
  if (M.lurkerCooldown) CFG.lurker.cooldown = Math.min(CFG.lurker.cooldown, M.lurkerCooldown);
  if (M.teaAtStart) CFG.run.teaAtStart = M.teaAtStart;
  applyUpgrades();
  return D;
}

// The upgrades bought in the shop (config/shop.js), over the difficulty and the contract: the numbers
// above were just restored from their base, so an upgrade never adds up from round to round.
export function applyUpgrades() {
  const owned = wallet().owned, R = CFG.run;
  R.upgrades = owned.slice(); R.teaExtra = 0; R.scareK = 1;
  for (const id of owned) {
    const u = upgrade(id);
    if (!u || u.soon) continue;
    if (id === 'boots') CFG.player.quietSpeed = u.quietSpeed;
    else if (id === 'gloves') { CFG.loot.crystal.handSpeed = Infinity; CFG.loot.crystal.grabSpeed *= u.grabK; CFG.sprint.crystalSlip = Infinity; }
    else if (id === 'thermos') R.teaExtra = u.teaExtra;
    else if (id === 'mask') R.scareK = u.scareK;
    else if (id === 'sneakers') CFG.sprint.stamina += u.stamina;
  }
}
