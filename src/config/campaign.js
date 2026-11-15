// The campaign (W19, plan-W19-campaign.md): the ladder of levels — one clear goal each — and which
// mechanic opens on which level, so they come one at a time. A level is a contract (config/contracts.js,
// config/mansion.js): its stars and its texts stay under the contract's id; the number is the ladder's.
// Units: metres, seconds, m/s (see src/config/index.js).

// The tests' «classic» game: a page opened by the test harness (window.__NOCTURNE_TEST) without
// `campaign: true` keeps the contracts and the mechanics as they were before W19 (every mechanic open,
// no level 0 / 3 in the list), so the older tests stay as they are; tests/campaign.test.mjs turns it on.
const TEST = (typeof window !== 'undefined' && window.__NOCTURNE_TEST) || null;
export const CLASSIC = !!(TEST && !TEST.campaign);

export const campaign = {
  start: 'rehearsal',   // a new player's first level
  // the ladder: n (shown on the map), the contract's id, its act, `intro`: what is new on it (the hint
  // cards «Як це?», plan §5). Campaign v2 (plan 2026-11-15 «кампанія, зірки й економіка», the owner's
  // decisions of 15.11): the live test's ladder — the dacha 0–5, the mansion 6–8 — one new thing a level.
  // A level may set its own `goal` (over the contract's), `time` (s of the round on the normal difficulty;
  // x levelTimeK by difficulty) and `star3` — its ★★★, one of: { time: s } (done within), { sum: $ } (at
  // least), { intact: true } (nothing damaged or broken), { scares: 0 } (Шафник never scared you),
  // { doubts: 0 } (no guard ever got a «?» from you). ★★ is «Тихо» (no full alarm, no shout) on every level
  // but 0. The contracts left out (silent, rush, evening, m9, m11, m13, m14) are not in the campaign's lists
  // (config/contracts.js, config/mansion.js): their stars stay saved, the levels are not shown.
  // `window`: level 5 becomes the clock through the back window once that code is in (plan §7.2); until then
  // it is the old «Годинник» through the door (decision R1: fallback В).
  levels: [
    { n: 0, id: 'rehearsal', act: 1, intro: ['basics'] },
    { n: 1, id: 'first', act: 1, intro: ['guard'], goal: { sum: 500 }, time: 300, star3: { doubts: 0 } },
    { n: 2, id: 'chest', act: 1, intro: ['twoHanded'], time: 300, star3: { intact: true } },
    { n: 3, id: 'quiet', act: 1, intro: ['throw'], goal: { sum: 700 }, time: 360, star3: { sum: 1400 } },
    { n: 4, id: 'wardrobe', act: 1, intro: ['wardrobe'], goal: { item: 'jewelbox', sum: 1000 }, time: 360, star3: { scares: 0 } },
    { n: 5, id: 'clock', act: 1, intro: [], time: 420, star3: { intact: true } },
    { n: 6, id: 'm8', act: 2, intro: ['twoGuards'], goal: { sum: 1500 }, time: 420, star3: { time: 240 } },
    { n: 7, id: 'm10', act: 2, intro: ['balcony'], goal: { floorItems: { floor: 1, n: 3 } }, time: 420, star3: { intact: true } },
    { n: 8, id: 'm12', act: 2, intro: ['swap'], time: 480, star3: { doubts: 0 } },
  ],
  // a level's `time` on each difficulty (the dacha's own rounds are 600 / 480 / 380 s: the same steps)
  levelTimeK: { easy: 1.25, medium: 1, hard: 0.8 },
  warnBefore: 60,        // s before the end the lights flicker («the neighbours noticed»)
  // a house opens once this level has a star (decision R13 A: pass the dacha, go on)
  opens: { mansion: 'clock' },
  // Тихарник shows only the lurkers this ladder has (the others come with their levels)
  lurkers: ['wardrobe'],
  // level 0: Petrovych dozes in his armchair all round (game/difficulty.js mods.armchairAtStart):
  // he sees only close by and hears worse; a noise still gets him up (then back to the chair)
  armchair: { dur: 1e6, sightK: 0.3, hearK: 0.6, fovK: 0.6 },
  acts: [{ n: 1, map: 'dacha' }, { n: 2, map: 'mansion' }],   // the museum (act 3) is not shown before it exists (plan §2.5)
  // from which level a mechanic is there (below it: no cans on the map, the shop's rows hidden, the
  // wardrobe asleep…). v2: the cans from 3, Шафник from 4; the traps and the devices wait for their own
  // levels («Кабінет», «Мило»: plan §10 items 9 and 11), so no level of this ladder has them (99).
  mechanics: {
    guard: 1,        // the guard walks (level 0: Petrovych sits in his armchair)
    clock: 1,        // the round's clock runs
    wardrobe: 4,     // Шафник wakes (below: the wardrobe stays shut and quiet)
    throw: 3,        // cans and bottles lie in the house
    'trap:soap': 99, 'trap:marbles': 99,
    'trap:bucket': 99, 'trap:clock': 99, 'trap:rope': 99,
    devices: 99,     // the radio, the house phone, the breaker
  },
};

// The campaign's view of a house's contracts (config/contracts.js, config/mansion.js): only the ladder's
// levels, in its order, each with its level's goal and round time laid over the contract's. The tests'
// classic game keeps every contract as it was (no `campaign` ones). Pure data, no DOM.
// texts: { id: { name?, brief? } } — the level's own words (S.campaign2.contracts).
export function ladderOf(all, texts = {}) {
  if (CLASSIC) return all.filter((c) => !c.campaign);
  const out = [];
  for (const l of campaign.levels) {
    const c = all.find((x) => x.id === l.id);
    if (!c) continue;
    const v = { ...c, ...(texts[c.id] || {}), level: l.n, star3: l.star3 || null };
    if (l.goal) v.goal = { ...l.goal };
    if (l.time) v.mods = { ...(c.mods || {}), levelTime: l.time };
    out.push(v);
  }
  return out;
}
