// The microphone: thresholds, talking and shouting as noise, the phone's game-sound protection; the scream replay buffer.
// Units: metres, seconds, m/s (see src/config/index.js).

export const mic = {
  whisperK: 0.5,         // whisper threshold = silence + K x (voice - silence), from calibration
  shoutOver: 7,          // dB above the calibrated voice (when the shout step of the calibration was skipped; was 9)
  // A shout (plan «голос і кільця», 15.11): shoutShare of the analyses over the last shoutWindow s above the
  // threshold — a steady loud voice is a shout too (no sudden jump needed any more); a knock on the phone,
  // a cough or one loud syllable is shorter than the window
  shoutWindow: 0.4,
  shoutShare: 0.75,
  // the threshold from the calibration: voice + the larger of shoutGapMin dB and shoutGapK of the way from
  // your voice to your shout (was half the way: a loud voice never reached it)
  shoutGapK: 0.35,
  shoutGapMin: 5,
  voicePct: 0.95,        // calibration: "normal" = this percentile of the voice (its loud syllables)
  normalAfter: 0.7,      // talking: a noise only after this much continuous speech (pauses under 0.35 s do not break it; the difficulty sets it)
  normalEvery: 1,        // ...and then once per this many seconds while it lasts
  // What the guard hears of your voice (m; x the difficulty's hearing CFG.hearing.radiusK; through a wall x
  // wallK, else CFG.hearing.occludedK). The ring on the floor is this radius: what you see is what it hears.
  voice: { radius: 6 },                         // talking: a room (3 m through a wall on medium)
  whisper: { radius: 1.2, every: 1.5, wallK: 0 },   // whispering: right next to it only, never through a wall
  // shouting: the whole house hears it (walls barely stop it); closer than alarmK of the way to the ring's
  // edge = the full alarm (medium, hard), farther = `points` suspicion and it comes to look at once
  shout: { radius: 18, wallK: 0.85, alarmK: 0.5, points: 60 },
  // sane limits for the player's ± corrections (dB): the shout threshold stays this far above the
  // calibrated voice, the whisper boundary this far above the whisper (or silence) and below the voice
  limitMargin: { shoutOverVoice: 4, whisper: 3, voiceOverWhisper: 3 },
  // Phone (plan-phone-mode §2.3, decision §9 p. 10): the game's own sound from the phone speaker is
  // not your voice. bleed = how loud the game bus is in the microphone (dB, measured by the
  // calibration step "Звуки гри"); while the game sounds, your whisper boundary / shout threshold sit
  // at least maskWhisper / maskShout dB above the game as the microphone hears it.
  bleedDefault: -34,     // estimate until the step is done (speaker; headphones measure far lower)
  // mic v2 stage 1: the same protection on a laptop and in a headset (owner's condition 09.11); estimates
  // until «Звуки гри» is done there (the microphone lab of stage 2 will measure them)
  bleedDefaultPc: -40,   // laptop speakers, the microphone in the lid
  bleedDefaultVr: -30,   // headset speakers a few cm from its microphone
  maskWhisper: 4,
  maskShout: 8,
  shoutOverAgc: 6,       // shout step skipped and the browser keeps auto gain on (iPhone): voice + this
  coverDrop: 10,         // "microphone covered?": the level this many dB under your calibrated silence...
  coverSecs: 3,          // ...for this many seconds
};

export const scream = { buffer: 4, before: 2, after: 1 };   // mic ring buffer (memory only) and the saved clip
