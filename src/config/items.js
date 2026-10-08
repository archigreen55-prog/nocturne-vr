// Loot: grabbing, damage, noise of drops; the items of this house.
// Units: metres, seconds, m/s (see src/config/index.js).

export const loot = {
  grabReach: 0.2,        // hand within the item's size + this
  twoHandMaxSpan: 0.9,   // hands further apart than this drop a two-handed item
  damageSpeed: 4.4,      // landing faster than this (a ~1 m fall) damages
  wallDamageSpeed: 2.5,  // hitting a wall faster than this damages
  damagedK: 0.4,         // value multiplier when damaged
  quietLanding: 1.0,     // landing slower than this makes no noise
  noiseRadius: { light: 3, medium: 8, glass: 12 },
  crystal: {
    breakSpeed: 1.6,     // landing faster than this (~13 cm fall) breaks the crystal vase
    handSpeed: 1.8,      // moving the hand faster than this while holding it: it slips out
    grabSpeed: 1.0,      // reaching for it faster than this knocks it over
    bumpSpeed: 1.0,      // walking past within 0.4 m faster than this knocks it over
  },
};

// 8 items. kind: light = one hand, medium = two hands, crystal = one hand, fragile.
// pos: where it stands (bottom centre), y = the surface it stands on.
export const items = [
  { id: 'painting', name: 'Картина', kind: 'light', value: 500, pos: [-1.72, 0.8, -4.15], yaw: Math.PI / 2 },
  { id: 'candelabrum', name: 'Канделябр', kind: 'light', value: 250, pos: [-5.2, 0.76, -2.55], yaw: 0 },
  { id: 'statuette', name: 'Статуетка', kind: 'light', value: 300, pos: [-6.0, 0.76, -9.2], yaw: 0.4 },
  { id: 'jewelbox', name: 'Шкатулка', kind: 'light', value: 400, pos: [9.35, 0.55, -13.6], yaw: -0.3 },
  { id: 'vase', name: 'Ваза', kind: 'medium', value: 900, pos: [4.3, 0, -13.35], yaw: 0 },
  { id: 'chest', name: 'Скриня', kind: 'medium', value: 1200, pos: [7.0, 0, -1.3], yaw: 0.1 },
  { id: 'clock', name: 'Годинник', kind: 'medium', value: 1500, pos: [1.5, 1.3, -13.55], yaw: 0 },
  { id: 'crystal', name: 'Кришталева ваза', kind: 'crystal', value: 2000, pos: [4.76, 0.7, -7.38], yaw: 0 },
];
