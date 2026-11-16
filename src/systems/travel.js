// Campaign v2, a change of house without the splash (the owner's decision of 16.11, variant В): the page that left
// wrote a note (world/maps.js travelNote); index.html showed «Їдемо в Маєток…» at once, over everything, instead of
// the splash. Here, once the game is up and at least CFG.campaign.travel.minShow s have passed, the line gets the
// button «Поїхали ▶»: its tap is the user gesture the phone needs for the sound (and the microphone). After the
// summary's «Далі: Маєток» it starts the round at the van (as «Грати»); from a level card in the menu it opens the
// menu's «Грати» page with that level; with friends it only closes (the room is where it was).
import { G, $ } from './state.js';
import { CFG } from '../config/index.js';
import { goPage } from './menu.js';

const local = { trip: null, shown: false, wired: false };

function go() {
  const trip = local.trip;
  $('travel').hidden = true; local.trip = null;
  if (!trip) return;
  if (trip.from === 'next' && !(G.net && G.net.t) && G.start) G.start.play();
  else if (trip.from === 'menu') goPage('play');
}

export const travel = {
  id: 'travel',
  init() {
    local.trip = (typeof window !== 'undefined' && window.__travel) || null;
    if (!local.trip || !$('travelgo')) return;
    $('travelgo').addEventListener('click', go);
  },
  frame() {
    if (!local.trip || local.shown) return;
    if (performance.now() / 1000 < CFG.campaign.travel.minShow) return;
    local.shown = true;
    $('travelgo').hidden = false;
  },
};
// tests / the debug API: is the line up, and is its button there
export const travelState = () => ({ on: !!$('travel') && !$('travel').hidden, button: !!$('travelgo') && !$('travelgo').hidden });
