// Map 2 (W6): what the frame draws depends on the player's floor — the rooms of the other floor are
// not drawn (the hall band, the stairs and the outside always are); and the scene's three point
// lights are a pool that moves to the three lamps nearest to the player on that floor (the number of
// lights never changes: no shader rebuild). Each move fades the light in over 0.3 s. On the first map
// nothing here applies.
import { G } from './state.js';

const EVERY = 0.5;      // s between lamp checks
const FADE = 0.3;       // s to fade a moved light in

export const mapView = {
  id: 'mapView',
  init() {
    const L = G.level;
    this.floor = -1;
    this.t = 0;
    this.slots = G.points.map(() => ({ lamp: -1, fade: 1 }));
    this.on = !!(L.floors && L.lampList);
    if (L.floors && L.setFloorVisible) { this.floor = L.floorIndex(G.player.floorY); L.setFloorVisible(this.floor); }
  },
  frame(dt) {
    const L = G.level;
    if (!L.floors) return;
    const f = L.floorIndex(G.player.floorY);
    if (f !== this.floor && L.setFloorVisible) { this.floor = f; L.setFloorVisible(f); }
    if (!this.on) return;
    // fade the moved lights in (the alert system writes the base intensity into the light each frame)
    const base = G.alert.base.points;
    this.slots.forEach((s, i) => {
      if (s.fade >= 1 || s.lamp < 0) return;
      s.fade = Math.min(1, s.fade + dt / FADE);
      base[i].i = L.lampList[s.lamp][4] * s.fade;
      G.points[i].userData.base = base[i].i;
    });
    if ((this.t -= dt) > 0) return;
    this.t = EVERY;
    const h = G.player.head;
    // the nearest lamps on this floor (outdoor lamps belong to the ground floor)
    const near = L.lampList.map((l, idx) => ({ idx, d: l[6] === f ? Math.hypot(l[0] - h.x, l[2] - h.z) : Infinity }))
      .sort((a, b) => a.d - b.d).slice(0, G.points.length).map((o) => o.idx);
    const keep = this.slots.map((s) => s.lamp);
    for (const idx of near) {
      if (keep.includes(idx)) continue;
      const i = this.slots.findIndex((s) => !near.includes(s.lamp));   // a slot whose lamp is no longer among the nearest
      if (i < 0) break;
      const l = L.lampList[idx], p = G.points[i];
      p.position.set(l[0], l[1], l[2]); p.color.setHex(l[3]); p.distance = l[5];
      base[i].c.setHex(l[3]); base[i].i = 0; p.userData.base = 0;
      this.slots[i] = { lamp: idx, fade: 0 };
      keep[i] = idx;
    }
  },
};
