// The sounds and little noises of the dacha's yard (claude/dacha-yard-stage1): a puddle, the gate,
// the place's own ambience. The game listens to the microphone, so every new sound is held to a rule
// (audio/placeSfx.js, tests/placesound.test.mjs): a sound from the speaker must not be taken for your voice.
// Units: metres, seconds, m/s (see src/config/index.js).

// A step into a puddle («плюх»): one per `stride` m walked inside it; kind 'splash' (CFG.alert.points.splash).
// How far it carries depends on the speed: creeping (0.25..1.0 m/s, the step itself is silent) a soft plop,
// a walk at full stick (2.0 m/s) and a run (2.8 m/s) louder. Chosen so that the guard in the living room
// hears a walking splash from EVERY puddle of the yard (tests/yard-stage1.test.mjs measures it): the farthest
// puddle is 16..23 m from the living room's points, and the house's wall halves a noise (CFG.hearing.occludedK),
// so a splash with walls in between would need ~46 m; with `wallK` 1 the splash is not muffled by the wall
// (it is the loudest thing in a quiet night yard: the guard hears it through the window) and 26 m is enough (23.2 m to the far corner).
export const puddle = {
  stride: 0.55,          // m walked in a puddle per splash
  minSpeed: 0.25,        // m/s: standing still in it is silent
  minRadius: 6,          // m: creeping (a silent step): the porch and the hall hear it, the far rooms do not
  walkRadius: 26,        // m: a walk at the stick's full (CFG.player.maxSpeed): the whole house on the ground floor
  runRadius: 32,         // m: running (CFG.sprint.speed)
  wallK: 1,              // share of the radius that gets through a wall (a step: CFG.hearing.occludedK = 0.5)
  crouchK: 0.8,          // crouched: a softer splash
};

// The gate (хвіртка): a door of the fence. Quick = a creak (heard from the porch), slow = silent.
export const gate = {
  creakK: 1,             // its creak x this (a door: 1, the back window: 0.35): a quick swing carries ~5 m, to the guard's leash line
};

// The ambience of the place and the rule for every new sound (audio/placeSfx.js).
export const placeSound = {
  // Who may hear what. The microphone is on and the game's sound comes from a speaker (a phone, a laptop,
  // a headset's speakers) = «speaker»: new one-shot sounds go at speakerK and the ambience is off.
  // With headphones — measured by the calibration (CFG.mic: bleed at most headphonesBleed dB, the
  // microphone hears almost nothing of the game) or ticked by the player (setting `headphones`) — or without
  // a microphone, everything plays at its own volume.
  headphonesBleed: -55,  // dB: the game's sound in the microphone at most this = headphones
  speakerK: 0.5,         // one-shot sounds' gain when the speaker may reach the microphone
  // the ambience (headphones / no microphone only), gain on the shared bus; the loudest is far under a step
  ambience: {
    fadeTime: 2.5,       // s to fade a layer in / out when the player changes zone or the rule changes
    crickets: { yard: 0.012, lane: 0.006 },   // how loud (as before); how they sing is `crickets` below
    wind: { yard: 0.02, lane: 0.014 },
    traffic: { lane: 0.03, yard: 0.012 },    // a far car passes now and then
    trafficEvery: [18, 45],                  // s between two far cars
  },
  // The crickets' song (audio/placeSfx.js): a few crickets sit in different places of the yard and each sings in
  // bouts — a series of chirps (3..5 clicks each, ~30 per second, a damped ring at ~4.5 kHz) that swells in and fades
  // out — then is silent for a random pause. Pitch and tempo differ a little per cricket and per bout.
  // `on: false` = no crickets at all (if the synthesis does not sound natural, this is the switch).
  crickets: {
    on: true,
    spots: [[-7.5, 3.5], [9.6, 4.8], [-1.0, 8.2]],   // x, z: by the barrel, by the woodpile, by the yard's fence
    carrier: [4300, 4900],        // Hz: the pitch of each cricket (picked once, within this range)
    bout: [1, 3],                 // s: a series of chirps
    pause: [2, 8],                // s: silence between two bouts of the same cricket
    chirpRate: [2.4, 4.2],        // chirps per second inside a bout (the tempo, new for every bout)
    pulses: [3, 5],               // clicks in a chirp
    pulseGap: 0.03,               // s between the clicks of a chirp
    fadeIn: 0.8, fadeOut: 1.0,   // s: the bout swells in over a few chirps and fades out (at most 40% / 50% of a short bout)
    peak: 7,                      // the loudest click before the zone's level above (the old continuous song's loudness: measured on the bus, see tests/placesound.test.mjs)
    refDistance: 3, rolloff: 0.4, // how the song fades with distance (gentle: a cricket in the next corner of the yard is a bit quieter, not far away)
  },
  splashGain: 3.4,       // the splash's own gain: ~7 dB under a patrol step on the bus (measured by tests/placesound.test.mjs)
};
