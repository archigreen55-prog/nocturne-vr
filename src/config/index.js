// All gameplay numbers in one place, one file per topic. Starting values, to be tuned after device
// tests: change a number in src/config/<topic>.js, run tools/bump-version.mjs, push.
// Units: metres, seconds, m/s; radii are how far a noise carries in the open (walls halve it).
// CFG is the one object the game reads (game/difficulty.js writes the difficulty's numbers into it);
// a new topic = a new file here + its keys below.
import { round, dropZone } from './round.js';
import { player, breath } from './player.js';
import { mic, scream } from './mic.js';
import { doors } from './doors.js';
import { loot, items } from './items.js';
import { hearing, ripple } from './noise.js';
import { patrol, stealth, alert, lurker, guard } from './guard.js';
import { difficulties } from './difficulty.js';
import { contracts } from './contracts.js';
import { sprint } from './sprint.js';
import { shop } from './shop.js';

export const CFG = {
  round, dropZone, player, mic, breath, doors, loot, items, patrol, hearing, stealth, alert, lurker, scream, ripple, guard,
  difficulties, contracts, sprint, shop,
};
