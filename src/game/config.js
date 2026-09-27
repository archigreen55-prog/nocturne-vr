// All gameplay numbers of the prototype in one place. Starting values, to be tuned after headset
// tests: change a number here, run tools/bump-version.mjs, push.
// Units: metres, seconds, m/s; radii are how far a noise carries in the open (walls halve it).

export const CFG = {
  round: {
    time: 7 * 60,          // contract timer
    warnAt: 6 * 60,        // lights start flickering ("the neighbours noticed")
    escapeTime: 60,        // after full alarm or the timer: this long to reach the van
    startDist: 1.5,        // the timer starts when you walk this far from the van
    vanZone: { x: 2.6, z: 7.3, r: 1.7 },  // standing here = "at the van" (escape ends, auto-deposit)
  },

  player: {
    maxSpeed: 2.0,         // stick fully forward
    quietSpeed: 1.0,       // up to this the steps are silent
    stepLength: 0.7,       // one step noise per this many metres above quietSpeed
    stepRadius: [1.5, 6],  // step noise radius at quietSpeed .. maxSpeed
    carryMediumK: 0.6,     // speed multiplier while carrying a two-handed item
  },

  mic: {
    whisperK: 0.5,         // whisper threshold = silence + K x (voice - silence), from calibration
    shoutOver: 9,          // dB above the calibrated voice
    shoutRise: 6,          // dB rise within 0.1 s needed to start a shout
    normalRadius: 5,       // talking normally: noise every normalEvery s while it lasts
    normalEvery: 0.5,
  },

  breath: { hold: 6, cooldown: 20 },   // A: the mic is ignored for up to `hold` s

  doors: {
    fastTime: 0.7,         // trigger tap: quick swing (creaks)
    slowTime: 2.2,         // keyboard Q: slow swing (quiet)
    creakSpeed: 1.2,       // rad/s (~70°/s): faster swings creak
    creakRadius: 7,
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
    sight: 8,                  // sees a standing player this far in the dark
    crouchK: 0.6,              // ... crouched: sight x this
    beamK: 1.4,                // ... inside the flashlight beam: sight x this
    beamHalf: 0.35,            // flashlight half-angle, rad (~20°)
    alarmK: 1.25,              // sight x this during full alarm
    feelDist: 1.0,             // notices you this close even without seeing
    noticeAt: 0.35,            // detection meter: turn and come to look
    lookAround: 4,             // s spent looking around at a noise
    loseSight: 3,              // s without seeing you in a chase before it gives up
    pauseAt: [2, 9, 17],       // route points where it stops and looks around (2 s): kitchen, library, hall
  },

  hearing: { occludedK: 0.5 },   // a noise behind walls / closed doors carries this much of its radius

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
};
