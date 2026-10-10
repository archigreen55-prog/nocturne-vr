// The story in the game (W7, story-bible.md, story-texts-uk.md): where the notes lie, the whisperer
// (Шепотун) in the fireplace, the wardrobe lurker's box, the crew's subtitles. Texts: S.story, S.crew,
// S.lurkers, S.notes. Units: metres, seconds, m/s (see src/config/index.js).
export const story = {
  // the crew's subtitles (hud.crewSays): one line at most every `every` s, each situation once a round
  // (guardNear: once per `guardNearEvery` s); a full alarm shows its line at once; `show` s on screen
  crew: { every: 20, guardNearEvery: 60, guardNear: 4, show: 4, spokeEvery: 30, lurkerSeen: 6 },
  // the guard's line on the start of a round («Ну що, хато…») after this many s of the clock
  houseAfter: 4,
  // Тихарник: the cards in the order of the page; open in the release: wardrobe, whisperer
  lurkers: ['wardrobe', 'whisperer', 'snorer', 'grabber', 'speaker', 'yawner', 'chime', 'mannequin', 'mute'],
  // the wardrobe lurker (Шафник): a box inside the wardrobe, taken only while it sleeps (doors ajar)
  wardrobe: { ajar: 0.3, seen: 6, seenCos: 0.6 },
  // Шепотун: a grate in a fireplace; awake from contract `from` on (the order of the map's contracts)
  whisperer: {
    maps: { dacha: { x: 1.5, y: 0.25, z: -13.3, from: 'silent' } },
    overFloor: 6,        // dB above your calibrated silence = a whisper (below the voice boundary)
    uncalibrated: 4,     // dB under the voice boundary when the silence is not calibrated
    minT: 0.4,           // s of whisper
    hear: 4,             // m from the grate, the same room
    telegraph: 1,        // s of «ш-ш-ш» and dust
    delay: 3,            // s from the whisper to the echo
    radius: 6,           // m: the echo as a 'voice' noise for the guard
    cooldown: 10,        // s between echoes
    maxEcho: 2,          // s of synthesised whisper at most
    fed: { n: 3, within: 15, near: 1.5, every: 20 },   // three whispers this close within 15 s: it whispers where the guard is
    can: { near: 1.5, every: 20 },                     // no microphone: a can landing this close wakes one echo
  },
  // the notes (S.notes.items): a sheet on this device only (not loot, not shared with friends): taken =
  // read, gone, its text in «Папери». wall: upright (yaw: its face); inWardrobe: only while the wardrobe is open
  noteUse: { reach: 1.6, hand: 0.25 },   // phone / PC: in front within this; VR: the trigger with a hand this close
  notes: {
    dacha: [
      { id: 'saucer', pos: [-9.13, 1.2, -0.75], yaw: Math.PI / 2, wall: true, unless: 'saucer2' },
      { id: 'saucer2', pos: [-9.13, 1.2, -0.75], yaw: Math.PI / 2, wall: true, after: 'evening' },   // after a star on contract 7
      { id: 'shout', pos: [9.77, 1.25, -9.55], yaw: -Math.PI / 2, wall: true, inWardrobe: true },   // inside, on the back
      { id: 'kettle', pos: [-5.8, 0.76, -2.35], yaw: 0.3 },
      { id: 'owners', pos: [-3.5, 1.25, -5.09], yaw: Math.PI, wall: true },
    ],
  },
};
