// Difficulty and contract modifiers over the base numbers in config.js. apply() restores the base
// values first, so switching back and forth is safe. CFG.run holds the settings of the current round
// that are not plain numbers elsewhere (habits, missing-loot rules, shout rule, guard read-out).
import { CFG } from './config.js';

const BASE = JSON.parse(JSON.stringify({ patrol: CFG.patrol, hearing: CFG.hearing, round: CFG.round, lurker: CFG.lurker, mic: CFG.mic, loot: CFG.loot }));
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
  // contract modifiers
  const M = (contract && contract.mods) || {};
  if (M.time) Object.assign(CFG.round, { time: M.time, warnAt: M.warnAt, escapeTime: M.escapeTime });
  if (M.lurkerCooldown) CFG.lurker.cooldown = Math.min(CFG.lurker.cooldown, M.lurkerCooldown);
  if (M.teaAtStart) CFG.run.teaAtStart = M.teaAtStart;
  return D;
}
