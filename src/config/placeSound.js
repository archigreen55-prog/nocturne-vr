// The sounds and little noises of the dacha's yard (claude/dacha-yard-stage1): a puddle, the gate,
// the place's own ambience. The game listens to the microphone, so every new sound is held to a rule
// (audio/placeSfx.js, tests/placesound.test.mjs): a sound from the speaker must not be taken for your voice.
// Units: metres, seconds, m/s (see src/config/index.js).

// A step into a puddle («плюх»): louder than a step at the same speed — a step noise x radiusK, at least
// `minRadius` — one per `stride` m walked inside it, also at a silent speed. kind 'splash' (CFG.alert.points.splash).
export const puddle = {
  stride: 0.55,          // m walked in a puddle per splash
  minSpeed: 0.25,        // m/s: standing still in it is silent
  radiusK: 1.7,          // x the step noise of this speed (CFG.player.stepRadius)
  minRadius: 3.2,        // m: even a silent walking speed splashes this far
  maxRadius: 8,
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
    crickets: { yard: 0.012, lane: 0.006 },
    wind: { yard: 0.02, lane: 0.014 },
    traffic: { lane: 0.03, yard: 0.012 },    // a far car passes now and then
    trafficEvery: [18, 45],                  // s between two far cars
  },
  splashGain: 3.4,       // the splash's own gain: ~7 dB under a patrol step on the bus (measured by tests/placesound.test.mjs)
};
