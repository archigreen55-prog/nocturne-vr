// The ambience of the dacha's yard: crickets, wind, a far car in the lane (audio/placeSfx.js). It plays only
// when the game's sound cannot reach the microphone (headphones, or no microphone): the owner's rule for
// every new sound. The zone follows the player: inside the house it is far away, in the yard near, in the lane
// the road is nearer.
import { G } from './state.js';
import { loadSetting, saveSetting } from '../settings.js';
import { PlaceAmbience, ambienceAllowed } from '../audio/placeSfx.js';
import { HOUSE } from '../world/level.js';
import { YARD_FENCE_Z } from '../world/yard.js';

const amb = new PlaceAmbience();
export const zoneOf = (x, z) => (z > YARD_FENCE_Z + 0.1 ? 'lane' : x > HOUSE.minX && x < HOUSE.maxX && z > HOUSE.minZ && z < HOUSE.maxZ ? 'house' : 'yard');

export const placeSound = {
  id: 'placeSound',
  init() {
    G.placeAmbience = amb;
    // «Звуки вулиці» (settings, both phone and PC): the crickets and the other street backgrounds; saved between runs
    G.streetSounds = loadSetting('streetSounds', 'on') !== 'off';
    const sel = typeof document !== 'undefined' && document.getElementById('streetsounds');
    if (sel) {
      sel.value = G.streetSounds ? 'on' : 'off';
      sel.addEventListener('change', () => {
        G.streetSounds = sel.value !== 'off'; saveSetting('streetSounds', G.streetSounds ? 'on' : 'off');
        if (!G.streetSounds) amb.update(0, 'yard', false);   // at once, also in a pause / the menu (the world's tick does not run there): the crickets fade out within a second
      });
    }
  },
  world(dt) {
    if (!G.level || G.level.id !== 'dacha' || !G.active || !G.player) return;
    amb.update(dt, zoneOf(G.player.head.x, G.player.head.z), ambienceAllowed(G.mic) && G.streetSounds !== false);
  },
};
