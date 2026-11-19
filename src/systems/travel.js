// Campaign v2, a change of house (the owner's decisions of 16.11): no splash and no button. The page that left wrote
// a note (world/maps.js travelNote); index.html showed the loading screen at once — our van «ПЕРЕЇЗДИ / Фрол і Ко»
// and «Їдемо в Маєток…» — over everything, while the other house loads. As soon as the game is up (and at least
// CFG.campaign.travel.minShow s have passed: no flash) it goes and the menu's «Грати» page is there with the next level's
// card picked (the level was remembered before the switch) — its start button is the tap that turns the sound and
// the full screen on. With friends it only goes (the room is where it was).
import { G, $ } from './state.js';
import { CFG } from '../config/index.js';
import { goPage } from './menu.js';
import { S } from '../i18n/index.js';

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
// With friends (decision of 7.11): «Почати» shows everybody the same van, «Їдемо на Дачу…», for `seconds`, while the
// round starts under it (the clock goes only when you leave the van)
export function travelShow(mapId, seconds) {
  const el = $('travel');
  if (!el) return;
  const put = (id, t) => { const e = $(id); if (e) e.textContent = t || ''; };
  put('traveltext', S.campaign2.travel.to[mapId]); put('travelsign', S.van.sign); put('travelcrew', S.van.crew);
  el.classList.remove('out'); el.hidden = false;
  clearTimeout(local.goT);
  local.goT = setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 260); }, seconds * 1000);
}
// tests / the debug API: is the loading screen up
export const travelState = () => ({ on: !!$('travel') && !$('travel').hidden });
