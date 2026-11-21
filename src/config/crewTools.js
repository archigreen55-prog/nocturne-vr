// «Засоби бригади»: the menu's guide to the helpers (systems/crewGuide.js). Which cards there are, in which
// group, and what opens them. The words are S.crewTools (i18n/uk.js); the numbers in the words and the
// prices come from the other configs (shop, campaign), never from here, so a text cannot drift from the game.
// Not in the guide on purpose: the traps (no level has them yet) and the cart and the blanket (no heavy
// items yet) — they join when the game has them.
import { player } from './player.js';

// The quiet walking speed as the game starts: the boots raise CFG.player.quietSpeed later (game/difficulty.js),
// this module is read before any of that, so it keeps the base.
export const quietBase = player.quietSpeed;

export const crewTools = {
  // the sections of the page, in order
  groups: ['buy', 'throw', 'devices'],
  // id: the key in S.crewTools.cards; group; upgrade: the shop's id (price, «Є ✓»); mech: the mechanic that opens
  // the card (config/campaign.js mechanics: the card is a lock until the player has reached that level)
  cards: [
    { id: 'thermos', group: 'buy', upgrade: 'thermos' },
    { id: 'gloves', group: 'buy', upgrade: 'gloves' },
    { id: 'mask', group: 'buy', upgrade: 'mask' },
    { id: 'sneakers', group: 'buy', upgrade: 'sneakers' },
    { id: 'boots', group: 'buy', upgrade: 'boots' },
    { id: 'can', group: 'throw', mech: 'throw' },
    { id: 'bottle', group: 'throw', mech: 'throw' },
    { id: 'radio', group: 'devices', mech: 'devices' },
    { id: 'phone', group: 'devices', mech: 'devices' },
    { id: 'breaker', group: 'devices', mech: 'devices' },
  ],
};
