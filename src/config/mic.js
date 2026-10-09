// The microphone: thresholds, talking and shouting as noise, the phone's game-sound protection; the scream replay buffer.
// Units: metres, seconds, m/s (see src/config/index.js).

export const mic = {
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
  // Phone (plan-phone-mode §2.3, decision §9 p. 10): the game's own sound from the phone speaker is
  // not your voice. bleed = how loud the game bus is in the microphone (dB, measured by the
  // calibration step "Звуки гри"); while the game sounds, your whisper boundary / shout threshold sit
  // at least maskWhisper / maskShout dB above the game as the microphone hears it.
  bleedDefault: -34,     // estimate until the step is done (speaker; headphones measure far lower)
  maskWhisper: 4,
  maskShout: 8,
  shoutOverAgc: 6,       // shout step skipped and the browser keeps auto gain on (iPhone): voice + this
  coverDrop: 10,         // "microphone covered?": the level this many dB under your calibrated silence...
  coverSecs: 3,          // ...for this many seconds
};

export const scream = { buffer: 4, before: 2, after: 1 };   // mic ring buffer (memory only) and the saved clip
