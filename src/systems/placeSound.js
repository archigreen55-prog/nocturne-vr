// The ambience of the dacha's yard: crickets, wind, a far car in the lane (audio/placeSfx.js). It plays only
// when the game's sound cannot reach the microphone (headphones, or no microphone): the owner's rule for
// every new sound. The zone follows the player: inside the house it is far away, in the yard near, in the lane
// the road is nearer.
import { G } from './state.js';
import { PlaceAmbience, ambienceAllowed } from '../audio/placeSfx.js';
import { HOUSE } from '../world/level.js';
import { YARD_FENCE_Z } from '../world/yard.js';

const amb = new PlaceAmbience();
export const zoneOf = (x, z) => (z > YARD_FENCE_Z + 0.1 ? 'lane' : x > HOUSE.minX && x < HOUSE.maxX && z > HOUSE.minZ && z < HOUSE.maxZ ? 'house' : 'yard');

export const placeSound = {
  id: 'placeSound',
  init() { G.placeAmbience = amb; },
  world(dt) {
    if (!G.level || G.level.id !== 'dacha' || !G.active || !G.player) return;
    amb.update(dt, zoneOf(G.player.head.x, G.player.head.z), ambienceAllowed(G.mic));
  },
};
