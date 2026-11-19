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
import { goalText, starRows, bestBits, isLevel } from '../game/contracts.js';
import { levelOf, CLASSIC, introOf } from '../game/campaign.js';
import { lootRecord } from '../game/economy.js';
import { howCards, openHow } from './howCard.js';
import { money, fmtTime } from '../ui/board.js';
import { flash } from './messages.js';
import { S } from '../i18n/index.js';

let pick = null, diffs = null;
const DIFFS = ['easy', 'medium', 'hard'];

function build() {
  const box = $('levelpick');
  if (!box) return false;
  pick = new LevelPick(box, (id) => { if (!pickLevel(id, { setContract, newRound, switchMap })) flash(S.levels.cannot, 2, '#ffb347'); renderPlayPage(); });
  diffs = $('diffpick');
  // campaign v2 (decision R2 Б): one difficulty for the whole game, in the settings; the stars do not depend on it
  const dbox = $('diffbox');
  if (!CLASSIC && $('diffpick2')) { diffs.hidden = true; diffs = $('diffpick2'); if (dbox) dbox.hidden = false; }
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
  renderStars(c, why);
  for (const b of diffs.children) { const on = b.dataset.diff === G.difficulty; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const start = $('start');
  if (start && start.dataset.ready === '1') start.disabled = !!why && !G.isGuest;   // T1: a closed level does not start (the button is enabled once the game is loaded)
}

// Campaign v2, card A «Записка» (plan §3.5): the level's three stars with their money (✓ the ones won), what is
// new, the round's time on this difficulty and the loot record
function renderStars(c, why) {
  const box = $('lvinfostars'), meta = $('lvinfometa');
  if (!box || !meta) return;
  if (!isLevel(c) || why) { box.replaceChildren(); meta.textContent = ''; if ($('lvinfohow')) $('lvinfohow').hidden = true; return; }
  $('lvinfogoal').textContent = '';   // the goal is the first star's row
  const got = bestBits(c.id), rows = starRows(c, G.loot.items);
  box.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div'); row.className = 'st3' + (got[r.n - 1] ? ' got' : '');
    const i = document.createElement('i'); i.textContent = '★'.repeat(r.n);
    const t = document.createElement('span'); t.textContent = r.text;
    const m = document.createElement('b'); m.textContent = S.campaign2.star.money(money(r.price));
    const e = document.createElement('em'); e.textContent = got[r.n - 1] ? S.campaign2.star.got : '';
    row.append(i, t, m, e); return row;
  }));
  const how = $('lvinfohow');
  if (how) { how.hidden = !howCards(c).length; if (!how.dataset.wired) { how.dataset.wired = '1'; how.addEventListener('click', () => openHow(G.contract)); } }
  const l = levelOf(c.id), parts = [];
  if (c.bonus === 'none') parts.push(S.campaign2.star.practice);
  const isNew = introOf(l, S.campaign.mechanics).filter((x) => x.id !== 'basics').map((x) => x.name);
  if (isNew.length) parts.push(S.campaign.isNew(isNew.join(', ')));
  if (c.mods && c.mods.levelTime) parts.push(S.campaign2.card.time(fmtTime(Math.round(c.mods.levelTime * (CFG.campaign.levelTimeK[G.difficulty] || 1)))));
  const rec = lootRecord(c.id);
  if (rec > 0 && c.bonus !== 'none') parts.push(S.campaign2.card.record(money(rec)));
  meta.textContent = parts.join(' · ');
}
