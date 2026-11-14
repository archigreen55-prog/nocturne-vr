// The start of a round (game/round.js, systems/goBanner.js, systems/startLine.js): the big «ПІШЛИ!» and its sound when the
// clock starts, the chalk line where it starts. The line itself is the map's: the dacha's gate (CFG.round.startRegion), the
// mansion's ring round the van (CFG.round.startDist). Units: seconds.
export const start = {
  hold: 1.3,            // s the banner stays at full size
  fade: 0.6,            // s it fades out
  sound: {
    gain: 0.18,         // the whole sound's gain before the microphone rule (audio/placeSfx.js placeK): three knocks and a bell; the loudest bit is 6 dB under the patrol step (tests/startline.test.mjs)
    knocks: [0, 0.22, 0.44],   // s: the three soft knocks
    bellAt: 0.72,       // s: the bell after the last knock
  },
  mark: { dash: 0.45, gap: 0.25 },   // m: the dashes of the mansion's start arc
};
