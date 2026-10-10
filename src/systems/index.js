// The registry: every system of the game, one line each. A new system = a new file in src/systems/
// and one line here.
//
// The order matters twice:
//   init      runs top to bottom when the page loads (a system may use what the systems above built)
//   phases    every frame of game logic runs the phases in this order, and inside a phase the systems
//             in the order of this list:
//               pre      the head pose, the microphone's audio
//               input    the controls of this frame
//               act      the player acts (breath, walking, hands, doors, the drop-off ring)
//               world    the world answers (doors, noise, the guard, the round clock)
//               result   the end of the round
//               present  what the world shows (noise ripples, the board)
//             then, after the frame is drawn:
//               frame    HUD / wrist panel, messages, the start screen
// A system is { id, init(), pre(dt, now, xrFrame), input(...), act(...), world(...), result(...),
// present(...), frame(dt, now) }, every part optional; the shared state is G (src/systems/state.js).
import { render } from './render.js';
import { messages } from './messages.js';
import { contract } from './contract.js';
import { world } from './world.js';
import { rig } from './rig.js';
import { doors } from './doors.js';
import { vr } from './vr.js';
import { flatScreen } from './flatScreen.js';
import { phone } from './phone.js';
import { desktop } from './desktop.js';
import { stats } from './stats.js';
import { controls } from './controls.js';
import { sprint } from './sprint.js';
import { player } from './player.js';
import { tutorial } from './tutorial.js';
import { economy } from './economy.js';
import { heist } from './heist.js';
import { board } from './board.js';
import { panel } from './panel.js';
import { startScreen } from './startScreen.js';
import { flashlight } from './flashlight.js';
import { progressCode } from './progressCode.js';
import { distract } from './distract.js';
import { mapView } from './mapView.js';
import { guards } from './guards.js';
import { brightness } from './brightness.js';

export const SYSTEMS = [
  render,        // renderer, scene, lights, quality (phone), resize
  messages,      // flash() / fx()
  contract,      // contract, difficulty, round control; act: caught; result: the result board
  world,         // the house, player, loot, guard, lurker, board, mic, round; pre: mic
  rig,           // controllers, wrist, hands, pointer, comfort, keyboard
  doors,         // doors; world: drags and creaks
  vr,            // the VR session; pre: head pose
  flatScreen,    // phone touch controls and HUD, portrait
  phone,         // phone pause, menu, settings, summary, feedback
  desktop,       // laptop mouse, back to the start screen
  stats,         // FPS, GPU / CPU time, battery
  controls,      // input: keyboard, touch, VR controllers
  sprint,        // input: running (stamina, doors, crystal, breath); world: running steps, breathing
  player,        // act: breath, walking, hands, doors, the drop-off ring
  tutorial,      // act: the first-run tutorial (phone, PC)
  economy,       // the wallet and the shop; world: a closed contract is not played; result: the round's money
  distract,      // W2a: throwing (phone, PC: aim, arc), the devices (radio, phone, breaker), a can on the guard's head
  heist,         // world: noise, voice, guard, lurker, alarm, round clock; present: ripples
  board,         // present: the board
  panel,         // frame: wrist panel / HUD
  startScreen,   // the start screen, report, PWA
  flashlight,    // the flashlight's room mask (after everything is in the scene)
  progressCode,  // start screen: progress as a code, «Навчання ще раз»
  mapView,       // W6: the player's floor decides which rooms are drawn; the point lights follow the nearest lamps
  guards,        // W6: the second guard (its step of the frame, its lamp's mask) and the radio chatter between the two
  brightness,    // display brightness and «Надворі» (phone, PC): the picture only
];

export const PHASES = ['pre', 'input', 'act', 'world', 'result', 'present'];
