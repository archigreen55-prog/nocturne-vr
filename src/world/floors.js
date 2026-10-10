// Floors of a map (W6). A map with stairs is not 3D physics: the ground under the player (or the
// guard) is a height function of (x, z) plus a hint of where they already are, because the second
// floor lies above the first. Ramps (the stairs, under their visible steps) and flats (landings)
// are unambiguous in XZ; everywhere else the height is the level of the floor nearest to the hint.
// Each floor has its own 2D collision world; the index of the floor for a height is floorIndex(y).

export class Floors {
  // levels: y of each floor (index = floor), e.g. [0, 3]
  // ramps: { x0, z0, x1, z1, w, y0, y1 } centre line from (x0, z0) at y0 to (x1, z1) at y1, width w
  // flats: { minX, maxX, minZ, maxZ, y } landings and other raised rectangles
  constructor({ levels = [0], ramps = [], flats = [] } = {}) {
    this.levels = levels;
    this.flats = flats;
    this.ramps = ramps.map((r) => {
      const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
      return { ...r, len, ux: dx / len, uz: dz / len };
    });
  }

  get count() { return this.levels.length; }

  // The floor a body at height y belongs to: from halfway up to the next floor it is on that one
  // (a landing halfway up the stairs counts as the upper floor: its rails are there).
  floorIndex(y = 0) {
    let i = 0;
    for (let j = 1; j < this.levels.length; j++) if (y >= (this.levels[j] + this.levels[j - 1]) / 2) i = j;
    return i;
  }

  // The ramp under (x, z), with the height there, or null.
  rampAt(x, z) {
    for (const r of this.ramps) {
      const px = x - r.x0, pz = z - r.z0;
      const t = px * r.ux + pz * r.uz, s = -px * r.uz + pz * r.ux;
      if (t < -0.01 || t > r.len + 0.01 || Math.abs(s) > r.w / 2) continue;
      const k = Math.max(0, Math.min(1, t / r.len));
      return { ramp: r, y: r.y0 + (r.y1 - r.y0) * k, t: k };
    }
    return null;
  }

  flatAt(x, z) {
    for (const f of this.flats) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return f;
    return null;
  }

  onRamp(x, z) { return this.rampAt(x, z) !== null; }

  // Height of the ground at (x, z) for a body whose height is about yHint.
  floorY(x, z, yHint = 0) {
    const r = this.rampAt(x, z);
    if (r) return r.y;
    const f = this.flatAt(x, z);
    if (f) return f.y;
    return this.levels[this.floorIndex(yHint)];
  }
}
