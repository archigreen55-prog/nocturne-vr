// Furniture of the mansion (W6 M2): the same kind of boxes as on the first map, placed per room on
// both floors. Every piece a body walks around (and may hide behind) goes through `block` into the
// collision world and the furniture list of its floor; `top` is a surface loot can land on.
import * as THREE from 'three';
import { C } from '../level.js';
import { WALL_H } from '../kit.js';

const GLOW = { ember: 0xff6a2a, lamp: 0xffd9a0, screen: 0x2a4a6a };

// ctx: { S0, S1, SA, G, block(f, x0, z0, x1, z1, h, top) }: S0 / S1 = the rooms of each floor (hidden
// when the player is on the other floor), SA = the hall band of both floors (always drawn: the
// stair well shows it from either floor). FLOOR_Y: [0, 3].
export function furnish(ctx, FLOOR_Y) {
  const { G, block } = ctx;
  // helpers for one floor: S = the Builder to draw into, y0 the floor's height
  const kit = (f, S) => {
    const y0 = FLOOR_Y[f];
    const box = (x0, yy0, z0, x1, yy1, z1, col) => S.box(x0, y0 + yy0, z0, x1, y0 + yy1, z1, col);
    const solid = (x0, z0, x1, z1, h, top = h) => block(f, x0, z0, x1, z1, h, top);
    const table = (x0, z0, x1, z1, h, top, legs) => {
      box(x0, h - 0.05, z0, x1, h, z1, top);
      for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.1, z0 + 0.05], [x0 + 0.05, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) box(x, 0, z, x + 0.05, h - 0.05, z + 0.05, legs);
      solid(x0, z0, x1, z1, h);
    };
    const chair = (x, z, ry, color = C.woodDark) => {
      S.boxAt(0.42, 0.45, 0.42, x, y0, z, color, ry);
      const b = new THREE.BoxGeometry(0.42, 0.5, 0.05); b.translate(0, 0.7, -0.19); b.rotateY(ry); b.translate(x, y0, z);
      S.add(b, color);
      solid(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0.5, 0.45);
    };
    const sofa = (x0, z0, x1, z1, backAtMinZ, color = C.fabric) => {   // along X; the back on one long side
      box(x0, 0, z0, x1, 0.45, z1, color);
      if (backAtMinZ) box(x0, 0.45, z0, x1, 0.95, z0 + 0.2, color); else box(x0, 0.45, z1 - 0.2, x1, 0.95, z1, color);
      box(x0 - 0.15, 0, z0, x0, 0.65, z1, color); box(x1, 0, z0, x1 + 0.15, 0.65, z1, color);
      solid(x0 - 0.15, z0, x1 + 0.15, z1, 0.95, 0.45);
    };
    const armchair = (x, z, ry, color = C.fabricRed) => {
      S.boxAt(0.8, 0.45, 0.8, x, y0, z, color, ry);
      const b = new THREE.BoxGeometry(0.8, 0.6, 0.18); b.translate(0, 0.75, -0.33); b.rotateY(ry); b.translate(x, y0, z); S.add(b, color);
      solid(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 1.0, 0.45);
    };
    const bed = (x0, z0, x1, z1, headAtMinZ = true) => {
      box(x0, 0, z0, x1, 0.5, z1, C.woodDark); box(x0 + 0.05, 0.5, z0 + 0.05, x1 - 0.05, 0.62, z1 - 0.05, C.bed);
      const hz0 = headAtMinZ ? z0 : z1 - 0.08, hz1 = headAtMinZ ? z0 + 0.08 : z1;
      box(x0, 0, hz0, x1, 1.15, hz1, C.woodDark);
      box(x0 + 0.1, 0.62, headAtMinZ ? z0 + 0.1 : z1 - 0.5, (x0 + x1) / 2 - 0.05, 0.75, headAtMinZ ? z0 + 0.5 : z1 - 0.1, 0xe0dcd0);
      box((x0 + x1) / 2 + 0.05, 0.62, headAtMinZ ? z0 + 0.1 : z1 - 0.5, x1 - 0.1, 0.75, headAtMinZ ? z0 + 0.5 : z1 - 0.1, 0xe0dcd0);
      box(x0 + 0.1, 0.62, headAtMinZ ? z0 + 0.6 : z0 + 0.1, x1 - 0.1, 0.68, headAtMinZ ? z1 - 0.1 : z1 - 0.6, 0x5a6a8a);
      solid(x0, z0, x1, z1, 0.68);
    };
    const nightstand = (x, z) => { box(x - 0.25, 0, z - 0.25, x + 0.25, 0.55, z + 0.25, C.wood); solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0.55); };
    const dresser = (x0, z0, x1, z1, h = 0.9) => { box(x0, 0, z0, x1, h, z1, C.wood); box(x0 - 0.02, h, z0 - 0.02, x1 + 0.02, h + 0.04, z1 + 0.02, C.woodDark); solid(x0, z0, x1, z1, h + 0.04); };
    const bookcase = (x0, z0, x1, z1, faceDir) => {   // faceDir: 'n' 's' 'e' 'w' = the open side
      box(x0, 0, z0, x1, 2.3, z1, C.woodDark);
      let r = Math.floor(x0 * 37 + z0 * 11) & 0x7fffffff;
      const rnd = () => ((r = (r * 16807 + 11) % 2147483647) / 2147483647);
      const alongX = faceDir === 'n' || faceDir === 's';
      for (let i = 0; i < 5; i++) {
        const y = 0.12 + i * 0.44;
        if (alongX) {
          const zf = faceDir === 'n' ? z0 : z1, d = faceDir === 'n' ? -1 : 1;
          box(x0, y - 0.03, Math.min(zf, zf + d * 0.3), x1, y, Math.max(zf, zf + d * 0.3), C.wood);
          for (let p = x0 + 0.05; p < x1 - 0.1; p += 0.0) { const w = 0.035 + rnd() * 0.05, h = 0.2 + rnd() * 0.12; if (rnd() > 0.08) box(p, y, Math.min(zf, zf + d * 0.28), Math.min(x1 - 0.05, p + w), y + h, Math.max(zf, zf + d * 0.28), C.books[Math.floor(rnd() * C.books.length)]); p += w + 0.004; }
        } else {
          const xf = faceDir === 'w' ? x0 : x1, d = faceDir === 'w' ? -1 : 1;
          box(Math.min(xf, xf + d * 0.3), y - 0.03, z0, Math.max(xf, xf + d * 0.3), y, z1, C.wood);
          for (let p = z0 + 0.05; p < z1 - 0.1; p += 0.0) { const w = 0.035 + rnd() * 0.05, h = 0.2 + rnd() * 0.12; if (rnd() > 0.08) box(Math.min(xf, xf + d * 0.28), y, p, Math.max(xf, xf + d * 0.28), y + h, Math.min(z1 - 0.05, p + w), C.books[Math.floor(rnd() * C.books.length)]); p += w + 0.004; }
        }
      }
      if (alongX) solid(x0, faceDir === 'n' ? z0 - 0.3 : z0, x1, faceDir === 'n' ? z1 : z1 + 0.3, 2.3, null);
      else solid(faceDir === 'w' ? x0 - 0.3 : x0, z0, faceDir === 'w' ? x1 : x1 + 0.3, z1, 2.3, null);
    };
    const rug = (x0, z0, x1, z1, color) => { box(x0, 0.014, z0, x1, 0.022, z1, color); box(x0 + 0.12, 0.022, z0 + 0.12, x1 - 0.12, 0.024, z1 - 0.12, C.frameGold); box(x0 + 0.17, 0.024, z0 + 0.17, x1 - 0.17, 0.026, z1 - 0.17, color); };
    const painting = (x, z, face, w, h, color) => {
      const yy0 = 1.3, yy1 = 1.3 + h, t = 0.03;
      if (face === 's' || face === 'n') { const d = face === 's' ? 1 : -1; box(x - w / 2, yy0, z, x + w / 2, yy1, z + d * t, C.frameGold); box(x - w / 2 + 0.05, yy0 + 0.05, z + d * t, x + w / 2 - 0.05, yy1 - 0.05, z + d * (t + 0.005), color); }
      else { const d = face === 'e' ? 1 : -1; box(x, yy0, z - w / 2, x + d * t, yy1, z + w / 2, C.frameGold); box(x + d * t, yy0 + 0.05, z - w / 2 + 0.05, x + d * (t + 0.005), yy1 - 0.05, z + w / 2 - 0.05, color); }
    };
    const ceilingLamp = (x, z) => { S.cyl(0.01, 0.01, 0.5, x, y0 + WALL_H - 0.5, z, C.pole, 4); S.cyl(0.08, 0.25, 0.18, x, y0 + WALL_H - 0.68, z, C.metal, 10); G.box(x - 0.07, y0 + WALL_H - 0.69, z - 0.07, x + 0.07, y0 + WALL_H - 0.67, z + 0.07, GLOW.lamp); };
    const floorLamp = (x, z) => { S.cyl(0.02, 0.02, 1.5, x, y0, z, C.metal, 6); S.cyl(0.15, 0.22, 0.25, x, y0 + 1.5, z, 0xc8b890, 10); G.box(x - 0.1, y0 + 1.5, z - 0.1, x + 0.1, y0 + 1.52, z + 0.1, GLOW.lamp); solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 1.75, null); };
    const counter = (x0, z0, x1, z1) => { box(x0, 0, z0, x1, 0.86, z1, C.woodLight); box(x0 - 0.03, 0.86, z0 - 0.03, x1 + 0.03, 0.92, z1 + 0.03, C.counter); solid(x0, z0, x1, z1, 0.92); };
    const crate = (x, z, s, ry = 0, col = C.woodLight) => { S.boxAt(s, s, s, x, y0, z, col, ry); solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s); };
    const shelves = (x0, z0, x1, z1) => {
      box(x0, 0, z0, x1, 0.04, z1, C.woodDark);
      for (let i = 1; i <= 4; i++) box(x0, i * 0.48, z0, x1, i * 0.48 + 0.03, z1, C.wood);
      for (const [x, z] of [[x0, z0], [x1 - 0.04, z0], [x0, z1 - 0.04], [x1 - 0.04, z1 - 0.04]]) box(x, 0, z, x + 0.04, 2.0, z + 0.04, C.woodDark);
      let r = Math.floor(x0 * 100 + z0 * 7) & 0x7fffffff;
      const rnd = () => ((r = (r * 16807 + 11) % 2147483647) / 2147483647);
      const alongX = x1 - x0 > z1 - z0;
      for (let i = 0; i < 4; i++) {
        const y = i * 0.48 + 0.04;
        for (let p = (alongX ? x0 : z0) + 0.1; p < (alongX ? x1 : z1) - 0.2; p += 0.25 + rnd() * 0.2) {
          const h = 0.12 + rnd() * 0.2, col = [0x8a6d2e, 0x6b5d4a, 0x3d6b3d, 0x7a2e2e, 0x9a9a8a][Math.floor(rnd() * 5)];
          if (alongX) S.cyl(0.06, 0.06, h, p, y0 + y, (z0 + z1) / 2, col, 6); else S.boxAt(0.3, h, 0.16, (x0 + x1) / 2, y0 + y, p, col);
        }
      }
      solid(x0, z0, x1, z1, 2.0, null);
    };
    const pillar = (x, z, r = 0.25) => { S.cyl(r, r, WALL_H, x, y0, z, C.wallInt, 10); solid(x - r, z - r, x + r, z + r, WALL_H, null); };
    return { box, solid, table, chair, sofa, armchair, bed, nightstand, dresser, bookcase, rug, painting, ceilingLamp, floorLamp, counter, crate, shelves, pillar, S };
  };

  // ========== ground floor ==========
  const F = kit(0, ctx.S0), FB = kit(0, ctx.SA);
  // library x[-13,-6] z[-18,-12]
  F.bookcase(-12.85, -17.85, -12.45, -12.6, 'e');
  F.bookcase(-12.4, -17.85, -6.6, -17.45, 's');
  F.table(-11.8, -16.8, -10.2, -15.8, 0.76, C.woodDark, C.woodDark);
  F.chair(-11.0, -15.2, Math.PI); F.armchair(-7.6, -16.6, 2.6);
  F.floorLamp(-6.5, -17.0);
  F.rug(-11.5, -15.4, -8.0, -13.0, C.rugGreen);
  F.ceilingLamp(-9.5, -15);
  // living room x[-6,0] z[-18,-12]: fireplace on the north wall
  F.box(-4.2, 0, -17.85, -1.8, 1.2, -17.3, C.brick); F.box(-4.35, 1.2, -17.9, -1.65, 1.3, -17.2, C.woodDark); F.box(-3.7, 0.1, -17.32, -2.3, 0.8, -17.28, C.soot); F.solid(-4.35, -17.9, -1.65, -17.2, 1.3);
  G.box(-3.5, FLOOR_Y[0] + 0.1, -17.4, -2.5, FLOOR_Y[0] + 0.22, -17.3, GLOW.ember);
  F.sofa(-5.6, -14.3, -3.2, -13.5, false);
  F.table(-5.0, -16.4, -3.8, -15.7, 0.42, C.wood, C.woodDark);
  F.armchair(-5.4, -17.0, 0.4);
  F.painting(-3.0, -17.85, 's', 1.2, 0.8, 0x6a5a3a);
  F.rug(-5.0, -16.9, -1.0, -13.9, C.rugBlue);
  F.ceilingLamp(-3, -15.5);
  // dining room x[0,6] z[-18,-12]
  F.table(1.6, -16.0, 4.4, -14.6, 0.76, C.wood, C.woodDark);
  for (const x of [2.1, 3.0, 3.9]) { F.chair(x, -16.5, 0); F.chair(x, -14.1, Math.PI); }
  F.dresser(0.15, -17.6, 0.75, -15.6);                       // sideboard
  F.painting(0.07, -13.5, 'e', 0.8, 0.6, 0x3a4a6a);
  F.ceilingLamp(3, -15.3);
  // kitchen x[6,13] z[-18,-12]
  F.counter(6.75, -17.85, 12.0, -17.25);
  F.box(8.5, 0.92, -17.8, 9.5, 0.95, -17.3, C.soot);         // hob
  F.box(6.75, 1.5, -17.85, 11.0, 2.2, -17.5, C.woodLight);   // upper cabinets
  F.box(12.15, 0, -17.8, 12.85, 1.9, -17.0, C.fridge); F.solid(12.15, -17.8, 12.85, -17.0, 1.9);
  F.table(8.5, -14.6, 10.5, -13.6, 0.9, C.woodLight, C.woodDark);   // island
  F.chair(8.0, -13.0, 0); F.chair(9.0, -13.0, 0);
  F.ceilingLamp(9.5, -15);
  // pantry (a pocket) x[-13,-9] z[-12,-5]
  FB.shelves(-12.85, -11.8, -12.35, -5.4); FB.shelves(-11.6, -11.85, -9.4, -11.35);
  FB.crate(-10.5, -6.2, 0.7, 0.2);
  // west corridor x[-9,-7]
  FB.rug(-8.7, -11.5, -7.3, -5.5, C.rugBlue);
  FB.painting(-8.93, -9.5, 'e', 0.6, 0.8, 0x4a5a3a);
  // hall x[-7,7] z[-12,-5]: pillars, a bench, the floor clock (a heavy item later, W5), a console
  FB.pillar(1.0, -10.5); FB.pillar(1.0, -6.5);
  FB.box(4.4, 0, -11.1, 6.0, 0.45, -10.5, C.woodDark); FB.box(4.4, 0.45, -11.1, 6.0, 0.95, -11.0, C.woodDark); FB.solid(4.4, -11.1, 6.0, -10.5, 0.95, 0.45);   // bench under the picture
  FB.box(0.4, 0, -11.93, 1.8, 0.8, -11.5, C.wood); FB.solid(0.4, -11.93, 1.8, -11.5, 0.8);   // console by the north wall
  FB.box(6.4, 0, -7.6, 6.95, 2.1, -7.0, C.woodDark); FB.solid(6.4, -7.6, 6.95, -7.0, 2.1, null);   // the floor clock (a heavy item, W5)
  FB.rug(-1.5, -10.0, 1.5, -6.5, C.rugRed);
  FB.painting(5.0, -11.93, 's', 1.4, 0.9, 0x5a3a3a);
  // study x[7,13] z[-12,-5]: desk, the safe (W2c), bookcase
  FB.table(8.5, -11.0, 10.5, -10.0, 0.76, C.woodDark, C.woodDark);
  FB.chair(9.5, -9.3, Math.PI);
  FB.bookcase(12.45, -11.85, 12.85, -6.0, 'w');
  FB.box(7.15, 0, -7.0, 7.85, 0.9, -6.2, C.metal); FB.box(7.84, 0.4, -6.75, 7.9, 0.5, -6.45, C.frameGold); FB.solid(7.15, -7.0, 7.85, -6.2, 0.9);   // the safe (contract 9, later)
  FB.armchair(11.5, -6.2, Math.PI);
  FB.ceilingLamp(10, -8.5);
  // laundry x[-13,-7] z[-5,0]: machines, a basin
  F.box(-12.85, 0, -1.3, -12.0, 0.85, -0.5, C.fridge); F.box(-12.85, 0, -2.3, -12.0, 0.85, -1.5, C.fridge); F.solid(-12.85, -2.3, -12.0, -0.5, 0.85);
  F.counter(-12.85, -4.85, -10.0, -4.25);
  F.box(-8.5, 0, -1.0, -7.2, 0.4, -0.2, C.woodLight); F.solid(-8.5, -1.0, -7.2, -0.2, 0.4);
  // anteroom x[-7,-2] z[-5,0]
  F.box(-6.85, 0, -4.8, -6.3, 0.8, -3.3, C.wood); F.solid(-6.85, -4.8, -6.3, -3.3, 0.8);   // console
  F.rug(-5.5, -3.8, -3.0, -0.8, C.rugRed);
  F.painting(-4.5, -4.93, 'n', 0.8, 0.6, 0x6a4a3a);
  F.ceilingLamp(-4.5, -2.5);
  // boiler room (a pocket) x[-2,4] z[-5,0]
  F.box(-1.85, 0, -4.85, -0.6, 1.9, -3.6, C.metal); F.solid(-1.85, -4.85, -0.6, -3.6, 1.9, null);   // the boiler
  F.shelves(0.5, -4.85, 3.85, -4.35);
  F.crate(2.8, -1.2, 0.6, 0.4);
  // garage x[4,13] z[-5,1.5]: the car, a workbench, crates, the lurker's crate (M4)
  F.box(6.2, 0.3, -3.6, 8.2, 1.0, 0.6, 0x3a4150); F.box(6.5, 1.0, -2.9, 7.9, 1.5, -0.4, 0x4a5262); F.box(6.3, 0.95, -3.0, 8.1, 1.05, -0.3, C.glass);
  for (const [x, z] of [[6.2, -3.0], [8.2, -3.0], [6.2, 0.0], [8.2, 0.0]]) { const g = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10); g.rotateZ(Math.PI / 2); g.translate(x, 0.33, z); F.S.add(g, C.tyre); }
  F.solid(6.0, -3.7, 8.4, 0.7, 1.5, null);
  F.counter(10.5, -4.85, 12.85, -4.15);                       // workbench
  F.shelves(9.0, 1.0, 12.0, 1.45);
  F.crate(4.6, 0.6, 0.8, 0.1); F.crate(5.5, 0.9, 0.6, -0.2, C.wood);
  F.box(4.15, 1.8, -4.85, 6.0, 1.85, -3.9, C.woodDark);        // shelf above
  F.ceilingLamp(8.5, -2);

  // ========== upstairs ==========
  const U = kit(1, ctx.S1), UB = kit(1, ctx.SA);
  // master bedroom x[-13,-6] z[-18,-12] (the wardrobe of the lurker is built in level.js)
  U.bed(-12.0, -17.8, -10.0, -15.6, true);
  U.nightstand(-12.5, -15.2); U.nightstand(-9.5, -15.2);
  U.dresser(-9.2, -17.85, -7.2, -17.25);
  U.armchair(-6.9, -13.6, -2.2);
  U.rug(-12.5, -15.0, -7.5, -12.5, C.rugGreen);
  U.painting(-11.0, -17.85, 's', 0.9, 0.6, 0x6a3a4a);
  U.ceilingLamp(-9.5, -15);
  // wardrobe (a pocket) x[-6,-3] z[-18,-12]
  U.shelves(-5.85, -17.85, -3.15, -17.35); U.shelves(-5.85, -17.3, -5.35, -15.6);
  U.crate(-3.6, -13.2, 0.6, 0.2, C.wood);
  // bath x[-3,2] z[-18,-12]
  U.box(-2.85, 0, -17.85, -1.2, 0.55, -15.0, C.fridge); U.solid(-2.85, -17.85, -1.2, -15.0, 0.55);   // the tub
  U.box(0.5, 0, -17.85, 1.85, 0.85, -17.0, C.fridge); U.solid(0.5, -17.85, 1.85, -17.0, 0.85);        // washbasin
  U.box(1.2, 0, -14.0, 1.85, 0.45, -13.3, C.fridge); U.solid(1.2, -14.0, 1.85, -13.3, 0.45);           // toilet
  U.box(1.84, 1.0, -16.5, 1.86, 1.9, -15.3, 0x3a4658);                                                // mirror
  // kids room x[2,8] z[-18,-12]
  U.bed(2.2, -17.8, 3.4, -15.6, true);
  U.table(5.5, -17.6, 7.3, -16.8, 0.72, C.woodLight, C.woodDark); U.chair(6.4, -16.2, Math.PI);
  U.shelves(7.35, -16.0, 7.85, -12.6);
  U.crate(3.0, -13.4, 0.5, 0.6, 0x7a2e2e);
  U.rug(2.6, -15.2, 6.4, -12.6, C.rugBlue);
  U.ceilingLamp(5, -15);
  // attic store (a pocket) x[8,13] z[-18,-12]
  U.shelves(8.15, -17.85, 12.85, -17.35); U.crate(9.0, -15.5, 0.8, 0.3); U.crate(11.5, -14.0, 0.7, -0.5, C.wood); U.crate(12.0, -16.3, 0.6, 0.9);
  U.box(8.5, 0, -13.6, 10.0, 0.4, -12.6, C.fabric); U.solid(8.5, -13.6, 10.0, -12.6, 0.4);   // an old mattress
  // guard room x[-13,-9] z[-12,-5]: Zhora's base (desk, kettle, a cot, a chair)
  UB.table(-12.6, -9.5, -11.0, -8.5, 0.76, C.woodDark, C.woodDark); UB.chair(-11.8, -7.8, Math.PI);
  UB.box(-11.9, 0.76, -9.3, -11.6, 0.95, -9.0, C.metal);        // the coffee maker
  UB.box(-12.85, 0, -7.0, -11.0, 0.45, -5.3, C.woodDark); UB.box(-12.8, 0.45, -6.95, -11.05, 0.55, -5.35, C.bed); UB.solid(-12.85, -7.0, -11.0, -5.3, 0.55);   // cot
  UB.dresser(-10.0, -11.85, -9.2, -10.6, 0.8);
  UB.ceilingLamp(-11, -8.5);
  // upper corridor x[-9,-7] z[-12,-5]
  UB.rug(-8.7, -11.5, -7.3, -5.5, C.rugBlue);
  UB.painting(-8.93, -8.0, 'e', 0.6, 0.8, 0x3a3a5a);
  // gallery x[-2,13] z[-12,-5]: a bench, plants, pictures, a console
  UB.box(1.4, 0, -11.9, 3.0, 0.45, -11.3, C.woodDark); UB.box(1.4, 0.45, -11.4, 3.0, 0.95, -11.3, C.woodDark); UB.solid(1.4, -11.9, 3.0, -11.3, 0.95, 0.45);
  UB.box(7.0, 0, -11.9, 8.2, 0.8, -11.5, C.wood); UB.solid(7.0, -11.9, 8.2, -11.5, 0.8);
  UB.floorLamp(0.5, -11.5); UB.floorLamp(12.5, -5.6);
  UB.painting(2.0, -11.93, 's', 1.0, 0.7, 0x3a4a6a); UB.painting(8.0, -11.93, 's', 0.8, 0.6, 0x6a5a3a); UB.painting(12.93, -8.5, 'w', 0.7, 0.9, 0x3a5a6a);
  UB.rug(0.0, -9.5, 8.0, -7.5, C.rugRed);
  UB.ceilingLamp(5, -8.5);
  // guest room x[-13,-5] z[-5,0]: bed, a desk; the balcony door at x = -8
  U.bed(-12.0, -4.8, -10.0, -2.6, true);
  U.nightstand(-12.5, -2.2);
  U.table(-6.9, -4.8, -5.3, -3.8, 0.76, C.woodDark, C.woodDark); U.chair(-6.1, -3.2, 0);
  U.dresser(-10.8, -0.8, -9.2, -0.2);
  U.rug(-11.5, -2.4, -6.0, -0.9, C.rugGreen);
  U.ceilingLamp(-9, -2.5);
  // billiard room x[-5,5] z[-5,0]
  U.box(-1.4, 0, -3.5, 1.4, 0.8, -1.5, C.woodDark); U.box(-1.35, 0.8, -3.45, 1.35, 0.85, -1.55, 0x2f6b3f); U.solid(-1.4, -3.5, 1.4, -1.5, 0.85);
  U.box(-4.85, 0, -4.85, -4.6, 1.6, -3.0, C.wood);              // cue rack
  U.sofa(2.3, -0.85, 4.6, -0.15, false, C.fabricRed);
  U.ceilingLamp(0, -2.5);
  // music room x[5,13] z[-5,0]: a piano, a cello case, shelves
  U.box(5.9, 0, -4.85, 8.4, 1.0, -3.4, 0x1a1a1e); U.box(5.8, 1.0, -4.85, 8.5, 1.05, -3.4, 0x1a1a1e); U.solid(5.9, -4.85, 8.4, -3.4, 1.05);   // the piano
  U.chair(7.2, -2.8, 0, 0x1a1a1e);
  U.box(12.3, 0, -1.6, 12.85, 1.3, -0.5, C.woodDark); U.solid(12.3, -1.6, 12.85, -0.5, 1.3, null);   // instrument case
  U.shelves(5.15, -2.0, 5.65, -0.2);
  U.rug(6.0, -3.0, 8.5, -0.8, C.rugRed);
  U.ceilingLamp(9, -2.5);
}
