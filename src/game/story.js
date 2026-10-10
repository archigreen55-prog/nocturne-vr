// The story's logic without DOM (W7): the customer's lines before and after a contract (the order of
// story-texts-uk.md §9.2), the crew's lines, Тихарник (the lurker cards met) and «Папери» (the notes
// found), both kept on this device next to the stars (so the progress code carries them). The board,
// the phone's menu and W17's start pages draw from these functions; systems/story.js calls the
// «met» / «found» ones from the game.
import { CFG } from '../config/index.js';
import { S } from '../i18n/index.js';
import { loadSetting, saveSetting } from '../settings.js';
import { bestStars } from './contracts.js';

export const THIEVES = ['zoya', 'frol', 'rita', 'nazar'];
// the thief this device plays (the choice of «Грати з друзями», decision R1 A); Зоя by default
export function thief() { const t = loadSetting('netThief', 'zoya'); return THIEVES.includes(t) ? t : 'zoya'; }
// «Ім'я: рядок» of a crew line object { who, line }
export const crewLine = (o) => (o ? `${S.crew.names[o.who] || o.who}: ${o.line}` : '');

// ---------- the customer ----------
// Before a contract: { lines: [2-3], crew: 'Зоя: …' } or null (a contract without lines)
export function storyBefore(c) {
  const lines = c && S.story.before[c.id];
  if (!lines) return null;
  const C = S.story.crew[c.id];
  return { lines, crew: crewLine(C && C.before) };
}
// The kind of a round's ending (story-texts-uk.md §9.2):
//   caught | late | fail (got away, goal not met) | damaged (contract «clock» only: met, the clock damaged)
//   | shout (met, a shout) | alarm (met, a full alarm, no shout) | clean (met, neither)
// r: round.result; v: the verdict; o: { alarmed, loot }
export function endingOf(c, r, v, o = {}) {
  if (!r) return null;
  if (r.kind === 'caught') return 'caught';
  if (r.kind === 'late') return 'late';
  if (!v || !v.goal) return 'fail';
  if (c.id === 'clock' && o.loot) { const it = o.loot.items.find((i) => i.id === 'clock'); if (it && it.damaged) return 'damaged'; }
  if (r.shouts > 0) return 'shout';
  if (o.alarmed) return 'alarm';
  return 'clean';
}
// After a round: { line, crew } (crew only when the goal was met) or null
export function storyAfter(c, r, v, o = {}) {
  const kind = endingOf(c, r, v, o);
  if (!kind) return null;
  const A = S.story.after, own = A[c.id] || {};
  const line = own[kind] || (['shout', 'alarm', 'clean', 'damaged'].includes(kind) ? own.done : undefined) || A.common[kind];
  const C = S.story.crew[c.id];
  return { kind, line: line || '', crew: v && v.goal ? crewLine(C && C.after) : '' };
}

// ---------- Тихарник ----------
const metSet = () => new Set(loadSetting('lurkers', []));
// Every card in the page's order: { id, name, wants, warns, avoid, met } (a card not met: name '???', no lines)
export function lurkerCards() {
  const met = metSet();
  return CFG.story.lurkers.map((id) => {
    const C = S.lurkers.cards[id], m = met.has(id);
    return m ? { id, met: true, ...C } : { id, met: false, name: S.lurkers.locked, wants: '', warns: '', avoid: '' };
  });
}
export const lurkersMet = () => ({ n: CFG.story.lurkers.filter((id) => metSet().has(id)).length, total: CFG.story.lurkers.length });
export const hasMet = (id) => metSet().has(id);
// A first meeting: true when the card is new (saved)
export function meetLurker(id) {
  const met = metSet();
  if (met.has(id) || !CFG.story.lurkers.includes(id)) return false;
  met.add(id); saveSetting('lurkers', [...met]);
  return true;
}

// ---------- «Папери» ----------
const foundList = () => { const v = loadSetting('notes', []); return Array.isArray(v) ? v : []; };
export const hasNote = (id) => foundList().includes(id);
// A note taken: true when it is new (saved, in the order found)
export function findNote(id) {
  const f = foundList();
  if (f.includes(id) || !S.notes.items[id]) return false;
  f.push(id); saveSetting('notes', f);
  return true;
}
// The notes found, in the order found: { id, where, text }
export const papers = () => foundList().filter((id) => S.notes.items[id]).map((id) => ({ id, ...S.notes.items[id] }));
// How many notes there are to find (every map's that exist now) and how many are found
export function notesCount() {
  const all = Object.values(CFG.story.notes).flat().map((n) => n.id);
  return { n: foundList().filter((id) => all.includes(id)).length, total: all.length };
}
// Does this note lie in the house now? (not found yet; «after»: a star on that contract; «unless»: replaced)
const afterMet = (n) => { if (!n.after) return true; const b = bestStars(n.after); return !!(b.easy || b.medium || b.hard); };
export function noteOut(n) {
  if (hasNote(n.id) || !afterMet(n)) return false;
  if (n.unless) { const o = Object.values(CFG.story.notes).flat().find((x) => x.id === n.unless); if (o && afterMet(o)) return false; }   // replaced on the same spot
  return true;
}

// ---------- the crew's subtitles ----------
// A crew line for a situation (start | take | guardNear | lurker | scared | damaged | heavy | alarm | caught | clean)
export function crewSays(situation, who = thief()) {
  const L = S.crew.lines[who] || S.crew.lines.zoya;
  return L[situation] ? { who, name: S.crew.names[who], line: L[situation] } : null;
}
// The signature under the scream replay: «Фрол: «Я не кричав.»»
export const screamBy = (who = thief()) => S.board.res.screamBy(S.crew.names[who], S.crew.scream[who]);
