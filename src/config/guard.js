// The guard and what it notices: sight and hearing, the suspicion, the lurker in the wardrobe, its rounds and habits.
// Units: metres, seconds, m/s (see src/config/index.js).

export const patrol = {
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
};

// Stealth read-out: lit spots (lamps) where you are seen as far as in the flashlight beam, and what
// counts as cover (furniture at least this close below your eyes, within `coverDist`).
export const stealth = {
  lamps: [{ x: 0.6, z: 5.6, r: 3 }, { x: 1.5, z: -12.9, r: 2.5 }, { x: -3.0, z: -6.0, r: 2.2 }],
  coverBelowEyes: 0.3, coverDist: 0.9,
};

export const alert = {
  points: { step: 12, voice: 18, door: 25, drop: 30, glass: 60 },  // suspicion per heard noise
  full: 100,             // suspicion that triggers full alarm (a shout or being seen does it at once)
  decay: 4,              // suspicion lost per second
};

export const lurker = {
  trigger: 2.3,          // your head this close to the wardrobe: it wakes up
  noiseTrigger: 3,       // or a noise this close
  telegraph: 1.3,        // s of scratching and growling before the lunge
  cancel: 3.5,           // back away this far during the telegraph and it calms down
  reach: 2.6,            // max lunge distance from the wardrobe
  hold: 0.9,             // s in your face
  cooldown: 45,
};

// ---------- the guard's mind (enemies/brain.js) ----------
export const guard = {
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
};
