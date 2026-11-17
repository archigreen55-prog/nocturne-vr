// Campaign v2, a change of house (the owner's decisions of 16.11): no splash and no button. The page that left wrote
// a note (world/maps.js travelNote); index.html showed the crew's notebook at once, its pages turning, over
// everything, while the other house loads. As soon as the game is up (and at least CFG.campaign.travel.minShow s
// have passed: one page turn, no flash) the notebook goes and the menu's «Грати» page is there with the next level's
// card picked (the level was remembered before the switch) — its start button is the tap that turns the sound and
// the full screen on. With friends it only goes (the room is where it was).
import { G, $ } from './state.js';
import { CFG } from '../config/index.js';
import { goPage } from './menu.js';

const local = { trip: null, done: false };

export const travel = {
  id: 'travel',
  init() { local.trip = (typeof window !== 'undefined' && window.__travel) || null; },
  frame() {
    if (!local.trip || local.done) return;
    if (performance.now() / 1000 < CFG.campaign.travel.minShow) return;
    local.done = true;
    const el = $('travel'), trip = local.trip;
    if (trip.from !== 'room') goPage('play');
    if (el) { el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 260); }
  },
};
// tests / the debug API: is the notebook up
export const travelState = () => ({ on: !!$('travel') && !$('travel').hidden });
