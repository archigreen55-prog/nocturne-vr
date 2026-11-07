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
  // cards «Як це?», plan §5; level 5 has two: decision R3 B brings soap and marbles there); `soon`: a placeholder until its wave (W2c safe, W5 heavy) — skipped by the chain
  levels: [
    { n: 0, id: 'rehearsal', act: 1, intro: ['basics'] },
    { n: 1, id: 'first', act: 1, intro: ['guard'] },
    { n: 2, id: 'clock', act: 1, intro: ['twoHanded'] },
    { n: 3, id: 'wardrobe', act: 1, intro: ['wardrobe'] },
    { n: 4, id: 'quiet', act: 1, intro: ['throw'] },
    { n: 5, id: 'silent', act: 1, intro: ['whisperer', 'trapsLight'] },
    { n: 6, id: 'rush', act: 1, intro: [] },
    { n: 7, id: 'evening', act: 1, intro: ['traps', 'devices'] },
    { n: 8, id: 'm8', act: 2, intro: ['twoGuards'] },
    { n: 9, id: 'm9', act: 2, soon: true },
    { n: 10, id: 'm10', act: 2, intro: ['balcony'] },
    { n: 11, id: 'm11', act: 2, soon: true },
    { n: 12, id: 'm12', act: 2, intro: ['swap'] },
    { n: 13, id: 'm13', act: 2, intro: [] },
    { n: 14, id: 'm14', act: 2, intro: [] },
  ],
  // level 0: Petrovych dozes in his armchair all round (game/difficulty.js mods.armchairAtStart):
  // he sees only close by and hears worse; a noise still gets him up (then back to the chair)
  armchair: { dur: 1e6, sightK: 0.3, hearK: 0.6, fovK: 0.6 },
  acts: [{ n: 1, map: 'dacha' }, { n: 2, map: 'mansion' }, { n: 3, map: null }],   // act 3: in the fog
  // from which level a mechanic is there (below it: no cans on the map, the shop's rows hidden, the
  // wardrobe asleep…). Decision R3 B: soap and marbles from level 5, the rest of the traps from 7.
  mechanics: {
    guard: 1,        // the guard walks (level 0: Petrovych sits in his armchair)
    clock: 1,        // the round's clock runs
    wardrobe: 3,     // Шафник wakes (below: the wardrobe stays shut and quiet)
    throw: 4,        // cans and bottles lie in the house
    'trap:soap': 5, 'trap:marbles': 5,
    'trap:bucket': 7, 'trap:clock': 7, 'trap:rope': 7,
    devices: 7,      // the radio, the house phone, the breaker
  },
};
