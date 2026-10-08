// Maps: which one the game opens and which are available (wave W6).
// Units: metres, seconds, m/s (see src/config/index.js).

export const maps = {
  default: 'dacha',
  // The second map. On a preview build it is always open; on the main site this flag decides
  // (how it unlocks for players is a separate decision, plan-W6 §5.3).
  mansion: { open: false },
};
