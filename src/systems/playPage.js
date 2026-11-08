// The menu's «Грати» page (menu design, stage 1): the level cards by house (ui/levelPick.js, the same as the
// friends' room), the chosen level in short (its number and house, name, goal or why it is closed), three
// difficulty buttons and one big «Грати» — disabled on a closed level (T1: a closed level never starts).
// The old selects (#contract, #difficulty) stay in step, hidden (the code and the tests use them).
import { CFG } from '../config/index.js';
import { G, $ } from './state.js';
import { LevelPick } from '../ui/levelPick.js';
import { levelGroups, pickLevel, whyClosed } from './levels.js';
import { setContract, setDifficulty, newRound } from './contract.js';
import { switchMap } from '../world/maps.js';
import { goalText } from '../game/contracts.js';
import { levelOf, CLASSIC } from '../game/campaign.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

let pick = null, diffs = null;
const DIFFS = ['easy', 'medium', 'hard'];

function build() {
  const box = $('levelpick');
  if (!box) return false;
  pick = new LevelPick(box, (id) => { if (!pickLevel(id, { setContract, newRound, switchMap })) flash(S.levels.cannot, 2, '#ffb347'); renderPlayPage(); });
  diffs = $('diffpick');
  for (const d of DIFFS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.diff = d; b.textContent = CFG.difficulties[d].name;
    b.addEventListener('click', () => { if (G.isGuest) return; if (G.round.phase !== 'ready') newRound(); setDifficulty(d); renderPlayPage(); });
    diffs.append(b);
  }
  return true;
}

export function renderPlayPage() {
  if (!G.level || !G.loot || !G.contract) return;   // before the world is built
  if (!pick && !build()) return;
  pick.show(levelGroups());
  const c = G.contract, why = whyClosed(c), l = !CLASSIC && levelOf(c.id);
  $('lvinfon').textContent = l ? `${S.campaign.level(l.n)} · ${S.campaign.house[G.level.id] || ''}` : S.campaign.house[G.level.id] || '';
  $('lvinfoname').textContent = c.name;
  $('lvinfogoal').textContent = why ? '' : S.levels.goal(goalText(c, G.loot.items));
  $('lvinfowhy').textContent = why;
  for (const b of diffs.children) { const on = b.dataset.diff === G.difficulty; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const start = $('start');
  if (start && start.dataset.ready === '1') start.disabled = !!why && !G.isGuest;   // T1: a closed level does not start (the button is enabled once the game is loaded)
}
