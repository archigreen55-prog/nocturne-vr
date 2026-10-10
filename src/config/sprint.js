// Running: the third tempo (faster than walking, loud steps the guard hears far away), stamina and
// "out of breath", how it is switched on (phone, PC, VR), the guard's answer to it.
// The numbers that depend on the difficulty are in `levels`; game/difficulty.js copies the row of the
// current difficulty over the fields above it (stamina ... react), so the game reads CFG.sprint.<field>.

export const sprint = {
  speed: 2.8,            // m/s while running (walking tops out at player.maxSpeed)
  stepLength: 0.9,       // one running step noise per this many metres
  minStart: 1.5,         // s of stamina needed to start running again
  lightK: 1.3,           // stamina used x this with a one-handed item in the hands
  rippleMax: 5,          // m, the floor rings of a running step (walking: ripple.maxRadius)
  rippleDelay: 0.12,     // s, the second ring of a running step
  breathPoints: 12,      // suspicion for one heard breath while out of breath
  whisperRaise: 3,       // dB the whisper boundary goes up while out of breath (real heavy breathing)
  vignette: 0.55,        // VR: vignette strength while running (walking: 0.35 at 2.0 m/s)
  vrSpeeds: { fast: 2.8, slow: 2.4, off: 0 },   // VR comfort setting «Біг у VR»
  // the direction that counts as "forward" (degrees from straight ahead): starts within `on`, keeps
  // running within `hold` (so steering with the thumb does not drop it)
  sector: { on: 35, hold: 50 },
  // phone joystick (px are CSS px; the joystick's travel is 64 px)
  touch: {
    over: 1.25,          // the finger this far out (x travel) in the forward sector...
    off: 1.1,            // ...and running stops below this
    delay: 0.15,         // s the finger must stay there before running starts
    lockDist: 130,       // px from the joystick centre up to the lock icon
    lockMin: 110,        // px: no closer, when the icon has to move away from the top of the screen
    lockTilt: 35,        // degrees: how far the icon may lean to the right when there is no room above
    lockSize: 44,        // px, drawn
    lockHit: 64,         // px, the area that takes the finger
    lockDwell: 0.1,      // s the finger rests on the icon (or is lifted on it) to lock
    topMargin: 28,       // px kept free above the icon
    unlockZone: 0.5,     // while locked, a touch on this left part of the screen unlocks
  },
  doubleTap: 0.3,        // PC: two Space presses within this many s, then held = running
  vrStick: { on: 0.7, off: 0.5 },   // VR: stick press with the stick pushed this far; stops below `off`
  // doors: running into a closed door shoulders it open (loud), into a locked one = a knock and a stop
  doorAhead: 0.7,        // m from the head to the doorway in the running direction
  bashTime: 0.2,         // s, the leaf swings open this fast (the creak is full: doors.creakRadius)
  knockRadius: 5,        // m, the knock on a locked door
  knockEvery: 1,         // s, at most one knock per this
  // the guard
  lineEvery: 8,          // s, «Хто там бігає?!» at most this often
  retarget: 0.4,         // s, it re-aims at the latest running step at most this often
  guardSprint: { k: 1.15, time: 4, winded: 3, windedSpeed: 2.0, rest: 10 },   // hard: its dash in a chase
  // stairs (the second map applies these): the ramp speed limit is for VR only; on a phone and a PC
  // the stairs are walked like a floor, running there is x runK and every step creaks
  stairs: { vrMaxSpeed: 1.2, runK: 0.8, creakEveryStepWhenRunning: true },

  // per difficulty (game/difficulty.js copies these over the fields below)
  levels: {
    easy: { stamina: 7, refill: 7, radius: 10, points: 12, winded: 2, pantRadius: 0, crystalSlip: 3, adrenaline: 2, react: 'normal', sprint: false, showRun: true },
    medium: { stamina: 5, refill: 10, radius: 12, points: 15, winded: 4, pantRadius: 2, crystalSlip: 1.5, adrenaline: 1.5, react: 'fast', sprint: false, showRun: false },
    hard: { stamina: 4, refill: 12, radius: 14, points: 20, winded: 6, pantRadius: 3, crystalSlip: 0, adrenaline: 1, react: 'fast', sprint: true, showRun: false },
  },
  stamina: 5,            // s of running from full
  refill: 10,            // s from empty to full (standing or walking)
  radius: 12,            // m, a running step (x the difficulty's hearing, x habits; walls x occludedK)
  points: 15,            // suspicion per heard running step
  winded: 4,             // s out of breath after running the stamina out
  pantRadius: 2,         // m, the noise of the breathing while out of breath (0 = none), once a second
  crystalSlip: 1.5,      // s of running with the crystal vase before it slips out
  adrenaline: 1.5,       // stamina refills x this after a full alarm
  react: 'fast',         // the guard: 'fast' = at once, «Хто там бігає?!», follows the steps; 'normal' = like any noise
  sprint: false,         // the guard's dash in a chase
  showRun: false,        // the guard line on the wrist / HUD says it hears someone running
};
