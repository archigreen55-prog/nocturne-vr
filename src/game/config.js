// All gameplay numbers of the prototype in one place. Starting values, to be tuned after headset
// tests: change a number here, run tools/bump-version.mjs, push.
// Units: metres, seconds, m/s; radii are how far a noise carries in the open (walls halve it).

export const CFG = {
  round: {
    time: 7 * 60,          // contract timer
    warnAt: 6 * 60,        // lights start flickering ("the neighbours noticed")
    escapeTime: 60,        // after full alarm or the timer: this long to reach the van
    startDist: 4.5,        // the timer starts when you walk this far from the drop-off ring (the board is closer)
    vanZone: { x: 4.4, z: 6.75, r: 2.0 },  // this close to the drop-off ring = "at the van" (the escape ends here)
  },

  // Drop-off ring behind the open van: head inside + loot in hands = it flies into the van.
  dropZone: { x: 4.4, z: 6.75, r: 0.6, flyTime: 0.3 },

  player: {
    maxSpeed: 2.0,         // stick fully forward
    quietSpeed: 1.0,       // up to this the steps are silent
    stepLength: 0.7,       // one step noise per this many metres above quietSpeed
    stepRadius: [1.5, 6],  // step noise radius at quietSpeed .. maxSpeed
    carryMediumK: 0.6,     // speed multiplier while carrying a two-handed item
  },

  mic: {
    whisperK: 0.5,         // whisper threshold = silence + K x (voice - silence), from calibration
    shoutOver: 9,          // dB above the calibrated voice (when the shout step of the calibration was skipped)
    shoutRise: 6,          // dB rise within 0.1 s needed to start a shout
    shoutMin: 0.25,        // s the level must stay above the shout threshold (a plosive or one loud syllable is not a shout)
    voicePct: 0.95,        // calibration: "normal" = this percentile of the voice (its loud syllables)
    normalRadius: 3,       // talking normally: a noise of this radius...
    normalAfter: 0.7,      // ...only after this much continuous speech (pauses under 0.35 s do not break it)
    normalEvery: 1,        // ...and then once per this many seconds while it lasts
    // sane limits for the player's ± corrections (dB): the shout threshold stays this far above the
    // calibrated voice, the whisper boundary this far above the whisper (or silence) and below the voice
    limitMargin: { shoutOverVoice: 4, whisper: 3, voiceOverWhisper: 3 },
  },

  // A / Shift: the mic is ignored for up to `hold` s. Cooldown = cooldown x (time held / hold), at least
  // cooldownMin; a tap shorter than `tap` costs nothing (an accidental press is not punished).
  breath: { hold: 6, cooldown: 20, cooldownMin: 2, tap: 0.25 },

  doors: {
    fastTime: 0.35,        // trigger tap / keyboard T: quick shove (creaks)
    slowTime: 2.2,         // keyboard Q: slow swing (quiet)
    creakFrom: 150,        // deg/s: the hinge starts creaking (quietly) above this swing speed...
    creakFull: 300,        // ...and creaks at full loudness from this speed
    speedSmooth: 0.2,      // s, smoothing of the swing speed (hand jitter does not creak)
    creakRadius: 9,        // noise radius of a full-loudness creak
    handleReach: 0.3,      // hand this close to the handle + trigger = drag the door by hand
  },

  loot: {
    grabReach: 0.2,        // hand within the item's size + this
    twoHandMaxSpan: 0.9,   // hands further apart than this drop a two-handed item
    damageSpeed: 4.4,      // landing faster than this (a ~1 m fall) damages
    wallDamageSpeed: 2.5,  // hitting a wall faster than this damages
    damagedK: 0.4,         // value multiplier when damaged
    quietLanding: 1.0,     // landing slower than this makes no noise
    noiseRadius: { light: 3, medium: 8, glass: 12 },
    crystal: {
      breakSpeed: 1.6,     // landing faster than this (~13 cm fall) breaks the crystal vase
      handSpeed: 1.8,      // moving the hand faster than this while holding it: it slips out
      grabSpeed: 1.0,      // reaching for it faster than this knocks it over
      bumpSpeed: 1.0,      // walking past within 0.4 m faster than this knocks it over
    },
  },

  // 8 items. kind: light = one hand, medium = two hands, crystal = one hand, fragile.
  // pos: where it stands (bottom centre), y = the surface it stands on.
  items: [
    { id: 'painting', name: 'Картина', kind: 'light', value: 500, pos: [-1.72, 0.8, -4.15], yaw: Math.PI / 2 },
    { id: 'candelabrum', name: 'Канделябр', kind: 'light', value: 250, pos: [-5.2, 0.76, -2.55], yaw: 0 },
    { id: 'statuette', name: 'Статуетка', kind: 'light', value: 300, pos: [-6.0, 0.76, -9.2], yaw: 0.4 },
    { id: 'jewelbox', name: 'Шкатулка', kind: 'light', value: 400, pos: [9.35, 0.55, -13.6], yaw: -0.3 },
    { id: 'vase', name: 'Ваза', kind: 'medium', value: 900, pos: [4.3, 0, -13.35], yaw: 0 },
    { id: 'chest', name: 'Скриня', kind: 'medium', value: 1200, pos: [7.0, 0, -1.3], yaw: 0.1 },
    { id: 'clock', name: 'Годинник', kind: 'medium', value: 1500, pos: [1.5, 1.3, -13.55], yaw: 0 },
    { id: 'crystal', name: 'Кришталева ваза', kind: 'crystal', value: 2000, pos: [4.76, 0.7, -7.38], yaw: 0 },
  ],

  patrol: {
    walk: 1.1, investigate: 1.4, hunt: 1.9, chase: 2.1,   // speeds
    catchDist: 0.8,
    fov: 80 * Math.PI / 180,   // vision cone (full angle)
    sight: 5,                  // sees a standing player this far in the dark
    crouchK: 0.5,              // ... crouched: sight x this (2.5 m in the dark, 4 m in the light)
    beamK: 1.6,                // ... in the flashlight beam or next to a lamp: sight x this (5 x 1.6 = 8 m)
    beamHalf: 0.35,            // flashlight half-angle, rad (~20°)
    alarmK: 1.25,              // sight x this during full alarm
    feelDist: 1.0,             // notices you this close even without seeing
    // detection meter (the bar over its head), per second while it sees you:
    // meterBase + meterNear x (1 - distance / sight range) -> ~1.7 s to a chase at mid range
    meterBase: 0.25, meterNear: 0.7, meterDecay: 0.3, feelRate: 2,
    noticeAt: 0.35,            // meter level at which it stops, turns and comes to look
    reactDelay: 0.6,           // s between noticing something (sight or sound) and the "?"
    coverDrop: 0.25,           // crouched, it must see this far below your eyes (your face, not your hair)
    lookAround: 4,             // s spent looking around at a noise
    loseSight: 3,              // s without seeing you in a chase before it gives up
    pauseAt: [2, 9, 17],       // route points where it stops and looks around (2 s): kitchen, library, hall
  },

  // A noise behind walls / closed doors carries occludedK of its radius; radiusK scales every noise
  // (difficulty); a kettle or running water masks noises near it (maskK within maskR).
  hearing: { occludedK: 0.5, radiusK: 1, maskK: 0.4 },

  // Stealth read-out: lit spots (lamps) where you are seen as far as in the flashlight beam, and what
  // counts as cover (furniture at least this close below your eyes, within `coverDist`).
  stealth: {
    lamps: [{ x: 0.6, z: 5.6, r: 3 }, { x: 1.5, z: -12.9, r: 2.5 }, { x: -3.0, z: -6.0, r: 2.2 }],
    coverBelowEyes: 0.3, coverDist: 0.9,
  },

  alert: {
    points: { step: 12, voice: 18, door: 25, drop: 30, glass: 60 },  // suspicion per heard noise
    full: 100,             // suspicion that triggers full alarm (a shout or being seen does it at once)
    decay: 4,              // suspicion lost per second
  },

  lurker: {
    trigger: 2.3,          // your head this close to the wardrobe: it wakes up
    noiseTrigger: 3,       // or a noise this close
    telegraph: 1.3,        // s of scratching and growling before the lunge
    cancel: 3.5,           // back away this far during the telegraph and it calms down
    reach: 2.6,            // max lunge distance from the wardrobe
    hold: 0.9,             // s in your face
    cooldown: 45,
  },

  scream: { buffer: 4, before: 2, after: 1 },   // mic ring buffer (memory only) and the saved clip

  // Floor ripples that show a noise: one thin ring, visual only (the hearing radius is not changed).
  ripple: { life: 0.7, radiusK: 0.4, maxRadius: 3 },

  // ---------- the guard's mind (enemies/brain.js) ----------
  guard: {
    // rooms it walks through: a few points of open floor each; it picks the next room by weight
    // (seconds since its last visit / 60 + lootWeight x items there, x random 0.7..1.3)
    rooms: {
      'Кухня': [[-3.6, -3.9], [-7.6, -0.9], [-7.8, -3.6]],
      'Хол': [[0, -2.5], [1.5, -1.2]],
      'Комора': [[6, -2], [8.6, -2]],
      'Коридор': [[-7, -6], [0, -6], [6.5, -6]],
      'Бібліотека': [[-7.4, -10.4], [-6, -12.6]],
      'Передпокій': [[-3, -10.5]],
      'Вітальня': [[1.5, -8], [-0.9, -12.6], [3.9, -9]],
      'Спальня': [[7.5, -10.2], [6.2, -12.8]],
    },
    lootWeight: 0.5,
    lookTime: 2.5,         // s it looks around in a room
    spotChance: 0.3,       // chance to check a hiding spot in the room it visits
    yawnChance: 0.15,      // between rooms: a 3 s yawn (a micro-window)
    // Hiding spots: where a crouching thief hides; `from` is where the guard stands to look there.
    spots: [
      { name: 'за диваном', at: [1.5, -9.25], from: [1.5, -8.0] },
      { name: 'біля холодильника', at: [-8.8, -1.3], from: [-7.6, -0.9] },
      { name: 'за ящиками в коморі', at: [5.4, -2.6], from: [6.1, -1.7] },
      { name: 'за комодом', at: [5.95, -8.9], from: [7.3, -9.3] },
      { name: 'за кріслом у бібліотеці', at: [-8.2, -12.2], from: [-6.2, -12.6] },
      { name: 'за столом у бібліотеці', at: [-6.2, -10.0], from: [-7.4, -10.4] },
      { name: 'за лавкою в холі', at: [2.1, -2.25], from: [0, -2.5] },
    ],
    closeDoorTime: 1.2,    // s: it closes doors behind itself, slowly (quieter than a shove)
    // things it notices on its rounds (difficulty decides whether it notices missing loot)
    seeChanges: 6,         // m: it checks item places and doors within this distance, in its cone
    missingPoints: 40, doorPoints: 25,
    agitatedK: 1.15,       // walks faster after 2 missing items
    // Habits: windows of opportunity (heist time, s; +-jitter). mods while it lasts:
    // hearK (noise radius x), sightK (sight x), fovK (cone x). Which ones run depends on difficulty.
    jitter: 20,
    habits: {
      tea: { at: 120, dur: 35, label: 'п\'є чай на кухні', stand: [-8.7, -3.1], face: [-9.6, -3.1], hearK: 0.6, mask: 6, whistleAt: 8, whistleFor: 10 },
      tea2: { at: 300, dur: 35, label: 'п\'є чай на кухні', stand: [-8.7, -3.1], face: [-9.6, -3.1], hearK: 0.6, mask: 6, whistleAt: 8, whistleFor: 10 },
      toilet: { at: 210, dur: 25, label: 'у туалеті (комора)', stand: [8.6, -2], face: [9.6, -2], hearK: 0.3, sightK: 0.3, closeDoor: [6.5, -5] },
      phone: { at: 75, dur: 40, label: 'говорить по телефону', walk: [[0, -2.5], [0, -6], [3, -6], [0, -6]], hearK: 0.5, fovK: 0.6 },
      armchair: { at: 360, dur: 20, label: 'сидить у кріслі', stand: [-0.55, -11.6], face: [1.5, -11.6], sit: true, hearK: 0.6, sightK: 0.6 },
    },
  },

  // ---------- difficulty (game/difficulty.js applies these over the numbers above) ----------
  difficulties: {
    easy: {
      name: 'легкий', walk: 0.9, investigate: 1.2, hunt: 1.6, chase: 1.8, sight: 4, beamK: 1.5, crouchK: 0.45, fov: 70,
      hearK: 0.8, occludedK: 0.4, meterBase: 0.18, meterNear: 0.5, meterDecay: 0.45, reactDelay: 0.9, loseSight: 2,
      noticeMissing: false, missingToAlarm: 99, habits: ['tea', 'phone', 'toilet', 'tea2', 'armchair'],
      time: 540, warnAt: 480, escapeTime: 90, lurkerCooldown: 60, shoutFull: false,
      voiceRadius: 2, voiceAfter: 1.0, damagedK: 0.6, crystalBreak: 1.6, showGuard: true,
    },
    medium: {
      name: 'середній', walk: 1.1, investigate: 1.4, hunt: 1.9, chase: 2.1, sight: 5, beamK: 1.6, crouchK: 0.5, fov: 80,
      hearK: 1, occludedK: 0.5, meterBase: 0.25, meterNear: 0.7, meterDecay: 0.3, reactDelay: 0.6, loseSight: 3,
      noticeMissing: true, missingToAlarm: 3, habits: ['tea', 'phone', 'toilet', 'armchair'],
      time: 420, warnAt: 360, escapeTime: 60, lurkerCooldown: 45, shoutFull: true,
      voiceRadius: 3, voiceAfter: 0.7, damagedK: 0.4, crystalBreak: 1.6, showGuard: false,
    },
    hard: {
      name: 'важкий', walk: 1.25, investigate: 1.6, hunt: 2.1, chase: 2.4, sight: 6.5, beamK: 1.54, crouchK: 0.6, fov: 100,
      hearK: 1.25, occludedK: 0.65, meterBase: 0.4, meterNear: 1.1, meterDecay: 0.2, reactDelay: 0.35, loseSight: 5,
      noticeMissing: true, missingToAlarm: 2, habits: ['tea', 'toilet'],
      time: 330, warnAt: 270, escapeTime: 40, lurkerCooldown: 25, shoutFull: true,
      voiceRadius: 4, voiceAfter: 0.4, damagedK: 0.25, crystalBreak: 1.2, showGuard: false,
    },
  },

  // ---------- contracts in this house (game/contracts.js) ----------
  // goal: sum (deliver at least $sum) | item (deliver this item); noAlarm / noShout: extra conditions.
  // bonus (2nd star): clean = no full alarm and no shout; intact = nothing damaged or broken.
  // 3rd star: goal + bonus on the hard difficulty. mods override round / guard numbers.
  contracts: [
    { id: 'first', name: 'Перша справа', brief: 'Винеси щонайменше $2,000. Будь-що.', goal: { sum: 2000 }, bonus: 'clean' },
    { id: 'clock', name: 'Замовлення: годинник', brief: 'Клієнт хоче лише годинник з каміна у вітальні. Решта не рахується.', goal: { item: 'clock' }, bonus: 'clean' },
    { id: 'quiet', name: 'Без тривоги', brief: '$1,500 так, щоб будинок жодного разу не підняв тривогу.', goal: { sum: 1500, noAlarm: true }, bonus: 'intact' },
    { id: 'silent', name: 'Ні звуку', brief: '$1,500 без жодного крику. Причаєний сьогодні неспокійний.', goal: { sum: 1500, noShout: true }, bonus: 'intact', mods: { lurkerCooldown: 20 }, needsMic: true },
    { id: 'rush', name: 'На час', brief: '$2,500 за 3 хвилини. Перші 60 с сторож п\'є чай.', goal: { sum: 2500 }, bonus: 'clean', mods: { time: 180, warnAt: 150, escapeTime: 45, teaAtStart: 60 } },
  ],
};
