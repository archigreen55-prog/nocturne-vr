// W17 «Стиль»: the look's numbers (plan-W17-style.md §1). The picture only: nothing here changes what
// the guard sees or hears (stealth reads CFG.stealth, not these).
export const style = {
  on: true,   // the style switch's default («Стиль: увімк»); ?style=off / on and the saved setting override it
  figures: false,   // the new characters in the game: off until the owner approves them on the sheet (?page=figures); ?figures=on shows them
  rita: 'wine',     // Rita's muted red in the game: 'wine' (burgundy) or 'powder' (powder pink); the sheet shows both
  // three steps of light, in irradiance (what a white surface would get; x the display brightness)
  bands: {
    mid: 0.2,                     // from here a surface is in half-light (moon, a lamp's reach)
    spot: 0.12,                   // the flashlight's light from which its spot counts as lit
    lampMid: 0.01,                // a lamp's or the flashlight's own light from which a surface is in half-light: its whole reach
    hand: 0.09,                   // a guard's hand lamp: its own light from which a surface is lit (≈ its lampR = 3 m on the floor)
    levels: [0.075, 0.2, 0.95],   // shadow, half-light, light: lit / shadow ≥ 3 : 1 on the screen (the stealth reads at a glance)
  },
  // ink lines on the world's faces (a face's weight: style/ink.js)
  ink: { px: 1.4, pxLow: 1.0, fade: [9, 19] },   // width in px (medium / high, low), fades out between these distances (m)
  // the colour grade towards the night palette: 0 = the colours as built, 1 = all dusk-and-paper
  grade: { world: 0.35, loot: 0.12, paper: 0.35 },
  // fog: the background is Ніч, the fog Сутінки; m from the eye (the brightness moves them out)
  fog: { near: 6, far: 24, alarm: 0.25 },   // alarm: how far the fog's colour goes to Тривога in a full alarm
  pools: { k: 0.45 },                          // the lamps' circles on the floor: brightness of the amber rim
  blobs: { guard: 0.42, friend: 0.36, item: 0.2 },   // radius of the soft shadow under what moves (m)
  // water: the mansion's fountain (rings run out from the middle) and puddles in the dacha's yard (still)
  water: {
    mansion: [{ x: 0, z: 13, r: 1.42, y: 0.605, rings: true }],
    dacha: [{ x: -1.7, z: 3.4, r: 0.55, y: 0.012 }, { x: 2.6, z: 2.3, r: 0.38, y: 0.012 }, { x: -4.6, z: 9.2, r: 0.7, y: 0.012 }],
  },
};
