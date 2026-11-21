// «Засоби бригади»: the menu's guide to the helpers (systems/crewGuide.js). Which cards there are, in which
// group, and what opens them. The words are S.crewTools (i18n/uk.js); the numbers in the words and the
// prices come from the other configs (shop, campaign), never from here, so a text cannot drift from the game.
// The pictures are files in icons/crew/ (a card's `img`): renders of the game's own models made by
// tools/render-crew-icons.mjs (the things in the house) and drawn SVGs (the shop's upgrades, not in the house);
// a locked card shows its picture as a dark silhouette with a padlock (icons/crew/lock.svg). The traps' pictures
// are made the same way (`node tools/render-crew-icons.mjs --traps`): when the guide gets a trap card, add its `img`.
// Not in the guide on purpose: the traps (no level has them yet) and the cart and the blanket (no heavy
// items yet) — they join when the game has them.
import { player } from './player.js';

// The quiet walking speed as the game starts: the boots raise CFG.player.quietSpeed later (game/difficulty.js),
// this module is read before any of that, so it keeps the base.
export const quietBase = player.quietSpeed;

export const crewTools = {
  imgDir: 'icons/crew/',
  lockImg: 'lock.svg',
  // the sections of the page, in order
  groups: ['buy', 'throw', 'devices'],
  // id: the key in S.crewTools.cards; group; upgrade: the shop's id (price, «Є ✓»); mech: the mechanic that opens
  // the card (config/campaign.js mechanics: the card is a lock until the player has reached that level)
  cards: [
    { id: 'thermos', group: 'buy', img: 'thermos.svg', upgrade: 'thermos' },
    { id: 'gloves', group: 'buy', img: 'gloves.svg', upgrade: 'gloves' },
    { id: 'mask', group: 'buy', img: 'mask.svg', upgrade: 'mask' },
    { id: 'sneakers', group: 'buy', img: 'sneakers.svg', upgrade: 'sneakers' },
    { id: 'boots', group: 'buy', img: 'boots.svg', upgrade: 'boots' },
    { id: 'can', group: 'throw', img: 'can.webp', mech: 'throw' },
    { id: 'bottle', group: 'throw', img: 'bottle.webp', mech: 'throw' },
    { id: 'radio', group: 'devices', img: 'radio.webp', mech: 'devices' },
    { id: 'phone', group: 'devices', img: 'phone.webp', mech: 'devices' },
    { id: 'breaker', group: 'devices', img: 'breaker.webp', mech: 'devices' },
  ],
};
