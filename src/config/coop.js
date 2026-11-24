// The co-op campaign (plan 2026-11-22-coop-campaign): the level's money goal grows with the thieves in the round.
//   goalK(n) = 1 + goalStep x (n - 1): 1 thief x1, 2 x1.5, 3 x2, 4 x2.5 (n is counted when the clock starts)
// Only money is multiplied (the goal's `sum` and a ★★★ `sum`); items, counts, floor items and times stay as they are.
export const coop = {
  goalStep: 0.5,   // the goal grows by this share of itself with every thief after the first
  round: 50,       // a scaled goal is rounded to this many dollars
};
