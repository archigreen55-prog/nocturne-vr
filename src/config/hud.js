// The phone HUD's guards panel (src/ui/hud.js, src/game/watchers.js): one big card for the main
// watcher + small cards for the rest, whoever and however many the level has (G.guards). A new kind of
// watcher (a dog, a camera…) is a row in `kinds`; a level with more guards needs no change here.
// Units: seconds, percent.
export const hud = {
  maxCards: 5,        // the main card + up to 4 small ones; more watchers: the rest are not drawn
  mainEvery: 1,       // s: the main card is re-picked no more often than this (it must not jump when two stand equally close)
  mainStick: 1.0,     // m: the current main keeps its place while it is at most this much further than the best one of the same danger
  seenBand: 10,       // percent: «sees you» is rounded to this step when picking the main card (a flicker of 3% is not a reason to switch)
  // a watcher without a portrait (the style is off, or a new guard nobody drew yet): kind -> an icon
  // (the inside of a 32x32 svg); no icon = the first letter of its name
  kinds: {
    dog: { icon: '<path d="M6 21c0-5 3-8 8-8h5l3-4 2 2-1 3 3 1v3l-3 1v4h-3v-4h-6v4H11v-4C8 19 6 20 6 21Z" fill="currentColor"/><circle cx="21" cy="12" r="1" fill="#05070d"/>' },
  },
};
