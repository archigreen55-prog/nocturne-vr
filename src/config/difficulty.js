// Difficulty levels (game/difficulty.js applies these over the other numbers).
// Units: metres, seconds, m/s (see src/config/index.js).
import { S } from '../i18n/index.js';

// ---------- difficulty (game/difficulty.js applies these over the numbers above) ----------
export const difficulties = {
  easy: {
    name: S.difficulty.easy, walk: 0.9, investigate: 1.2, hunt: 1.6, chase: 1.8, sight: 4, beamK: 1.5, crouchK: 0.45, fov: 70,
    hearK: 0.8, occludedK: 0.4, meterBase: 0.18, meterNear: 0.5, meterDecay: 0.45, reactDelay: 0.9, loseSight: 2,
    noticeMissing: false, missingToAlarm: 99, habits: ['tea', 'phone', 'toilet', 'tea2', 'armchair'],
    time: 540, warnAt: 480, escapeTime: 90, lurkerCooldown: 60, shoutFull: false,
    voiceRadius: 2, voiceAfter: 1.0, damagedK: 0.6, crystalBreak: 1.6, showGuard: true,
  },
  medium: {
    name: S.difficulty.medium, walk: 1.1, investigate: 1.4, hunt: 1.9, chase: 2.1, sight: 5, beamK: 1.6, crouchK: 0.5, fov: 80,
    hearK: 1, occludedK: 0.5, meterBase: 0.25, meterNear: 0.7, meterDecay: 0.3, reactDelay: 0.6, loseSight: 3,
    noticeMissing: true, missingToAlarm: 3, habits: ['tea', 'phone', 'toilet', 'armchair'],
    time: 420, warnAt: 360, escapeTime: 60, lurkerCooldown: 45, shoutFull: true,
    voiceRadius: 3, voiceAfter: 0.7, damagedK: 0.4, crystalBreak: 1.6, showGuard: false,
  },
  hard: {
    name: S.difficulty.hard, walk: 1.25, investigate: 1.6, hunt: 2.1, chase: 2.4, sight: 6.5, beamK: 1.54, crouchK: 0.6, fov: 100,
    hearK: 1.25, occludedK: 0.65, meterBase: 0.4, meterNear: 1.1, meterDecay: 0.2, reactDelay: 0.35, loseSight: 5,
    noticeMissing: true, missingToAlarm: 2, habits: ['tea', 'toilet'],
    time: 330, warnAt: 270, escapeTime: 40, lurkerCooldown: 25, shoutFull: true,
    voiceRadius: 4, voiceAfter: 0.4, damagedK: 0.25, crystalBreak: 1.2, showGuard: false,
  },
};
