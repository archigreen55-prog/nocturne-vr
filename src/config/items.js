// Loot: grabbing, damage, noise of drops; the items of this house.
// Units: metres, seconds, m/s (see src/config/index.js).
import { S } from '../i18n/index.js';

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
  // W18: small loot (`small: true`, worth up to valueMax): the guard does not remember it on easy and
  // medium; on hard a missing trinket counts hardWeight of an item (points and the count to the alarm);
  // its glass breaks noiseK as loud
  small: { valueMax: 300, noiseK: 0.6, hardWeight: 0.5, drawDist: 14 },   // drawDist: a trinket at rest is drawn this close only
};

// 8 items. kind: light = one hand, medium = two hands, crystal = one hand, fragile.
// pos: where it stands (bottom centre), y = the surface it stands on.
export const items = [
  { id: 'painting', name: S.items.painting, kind: 'light', value: 500, pos: [-1.72, 0.8, -4.15], yaw: Math.PI / 2 },
  { id: 'candelabrum', name: S.items.candelabrum, kind: 'light', value: 250, pos: [-5.2, 0.76, -2.55], yaw: 0, small: true },   // W18: a trinket
  { id: 'statuette', name: S.items.statuette, kind: 'light', value: 300, pos: [-6.0, 0.76, -9.2], yaw: 0.4, small: true },
  { id: 'jewelbox', name: S.items.jewelbox, kind: 'light', value: 400, pos: [9.5, 0.08, -9.9], yaw: -1.2, inWardrobe: true },   // W7: in the lurker's wardrobe (story-bible §4.3; was on the nightstand)
  { id: 'vase', name: S.items.vase, kind: 'medium', value: 900, pos: [4.3, 0, -13.35], yaw: 0 },
  { id: 'chest', name: S.items.chest, kind: 'medium', value: 1200, pos: [7.0, 0, -1.3], yaw: 0.1 },
  { id: 'clock', name: S.items.clock, kind: 'medium', value: 1500, pos: [1.5, 1.3, -13.55], yaw: 0 },
  { id: 'crystal', name: S.items.crystal, kind: 'crystal', value: 2000, pos: [4.76, 0.7, -7.38], yaw: 0 },
  // ---------- W18: small loot in the rooms that had none (plan-W18 §B.3) ----------
  { id: 'teapot', name: S.items.teapot, kind: 'light', value: 150, pos: [-9.55, 0.92, -3.4], yaw: 0.4, small: true },            // west kitchen counter, 2.5 m from the fridge note (E there must read the note, not grab) (the radio device sits on the other counter)
  { id: 'watch', name: S.items.watch, kind: 'light', value: 200, pos: [3.6, 0.8, -6.75], yaw: 0.3, small: true },               // corridor console
  { id: 'perfume', name: S.items.perfume, kind: 'light', value: 130, pos: [9.35, 0.55, -13.6], yaw: 0, small: true, fragile: true },   // bedroom, the east nightstand (the handset device sits on the west one)
  { id: 'jar', name: S.items.jar, kind: 'light', value: 120, pos: [5.2, 0.7, -3.6], yaw: 0, small: true },                     // pantry shelf table
  { id: 'book', name: S.items.book, kind: 'light', value: 250, pos: [-6.75, 0.76, -9.1], yaw: 0.2, small: true },              // library desk
  { id: 'gnome', name: S.items.gnome, kind: 'light', value: 100, pos: [-2.5, 0, 1.2], yaw: 0.6, small: true },                 // yard, by the back step
];
