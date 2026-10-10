// «За сторожа» (W15, plan-multiplayer §2 (в)): a friend plays the guard. All numbers for the first test
// with two phones; tune them after it. Units: metres, seconds, radians.
export const humanGuard = {
  grabDist: 0.8,          // «Схопити»: a thief this close, in front of the guard and not behind a wall
  grabHalfAngle: 1.0,     // in front: within ±57° of where the guard looks
  autoGrab: 0.5,          // closer than this the guard catches without the button (Р13)
  darkSight: 2.0,         // the guard's screen shows a thief it sees outside the light only this close (Р12 А)
  bench: 60,              // a caught thief sits in the van this long, then plays on
  vanFence: 4,            // the guard cannot come closer than this to the van (the drop-off ring is beside it)
  needEvidence: true,     // «Викликати Центральну» only after the guard saw a thief or noticed missing loot
  // a trap knocks the guard player down like the AI guard: pose and s (x CFG.traps.stunK of the difficulty);
  // controls off meanwhile; the screen: dark (0..1) on a phone / PC and in VR (no forced camera turn in VR)
  traps: { soap: { pose: 'flip', s: 6 }, marbles: { pose: 'kneel', s: 5 }, bucket: { pose: 'bucket', s: 6 }, rope: { pose: 'kneel', s: 3 } },
  stunDark: { flip: 0.35, kneel: 0.2, bucket: 0.93 },
  vrDark: { flip: 0.6, kneel: 0.5, bucket: 0.93 },
};
