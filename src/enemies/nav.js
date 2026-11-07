// Navigation for the patrol: hand-placed points in open floor (room centres, both sides of every
// doorway), linked automatically where a 0.3 m-wide body fits in a straight line (doors do not
// count: the patrol opens them). Paths: straight if clear, else A* over the points.
export const NODES = [
  // yard
  [0, 1.6], [1.6, 4.2], [2.4, 6.4], [-5, 3.2], [6.5, 3.2], [-3, -16], [3, 13],
  // hall
  [0, -0.8], [0, -2.5], [0, -4.3], [-1.2, -2.5], [1.5, -1.2],
  // kitchen
  [-2.8, -2.5], [-3.6, -0.9], [-3.6, -3.9], [-7.6, -0.9], [-7.8, -3.6], [-6, -4.3],
  // corridor
  [-9, -6], [-7, -6], [-6, -6], [-3, -6], [0, -6], [1.5, -6], [3, -6], [6.5, -6], [7.5, -6], [9, -6],
  // pantry
  [6.5, -4.3], [6.65, -3.4], [6, -2], [8.6, -2], [4.2, -1.4],
  // library
  [-7, -7.8], [-7.4, -10.4], [-6, -12.6], [-4.6, -10.5], [-8.5, -8.3],
  // side corridor
  [-3, -7.8], [-3, -10.5], [-3, -12.8],
  // living room
  [-1.4, -10], [1.5, -8], [3.9, -9], [4.3, -11], [1.5, -12.7], [-0.9, -12.6], [-1.2, -8.2], [3.0, -11.0], [2.8, -12.8],
  // bedroom
  [7.5, -7.8], [5.8, -11], [7.5, -10.2], [6.2, -12.8], [9.3, -11.6],
];

// Patrol loop: kitchen - library - hall. Indices of the pause points are in CFG.patrol.pauseAt.
export const ROUTE = [
  [-2.8, -2.5], [-3.6, -0.9], [-7.6, -0.9], [-7.8, -3.6], [-6, -4.3], [-6, -6], [-7, -6], [-7, -7.8],
  [-7.3, -8.6], [-7.4, -10.4], [-6, -12.6], [-4.6, -10.5], [-3, -10.5], [-3, -7.8], [-3, -6], [0, -6], [0, -4.3],
  [0, -2.5], [-1.2, -2.5],
];

const BODY = 0.3;

export class Nav {
  // level: the map; its nav.nodes ([x, z, floor]) and nav.stairs (edges between floors) when it has
  // stairs (W6); the first map uses NODES on its one floor.
  constructor(level) {
    this.level = level;
    this.worldAt = (f) => (level.worlds ? level.worlds[f] : level.world);
    const src = (level.nav && level.nav.nodes) || NODES;
    this.nodes = src.map(([x, z, f]) => ({ x, z, floor: f || 0, edges: [] }));
    this.indoor = (level.nav && level.nav.indoor) || ((n) => n[1] < 0 && n[1] > -14 && n[0] > -10 && n[0] < 10);
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j], d = Math.hypot(a.x - b.x, a.z - b.z);
        if (a.floor === b.floor && d < 9 && this.clear(a.x, a.z, b.x, b.z, BODY, a.floor)) { a.edges.push([j, d]); b.edges.push([i, d]); }
      }
    }
    for (const [p, q] of (level.nav && level.nav.stairs) || []) {   // the stairs: by nearest node to each end
      const i = this.nearestNode(p[0], p[1]), j = this.nearestNode(q[0], q[1]);
      const a = this.nodes[i], b = this.nodes[j], d = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.floor - b.floor) * 3;
      if (!a.edges.some((e) => e[0] === j)) { a.edges.push([j, d]); b.edges.push([i, d]); }
    }
  }

  nearestNode(x, z) {
    let best = 0, bestD = Infinity;
    this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  // A body of radius BODY fits along a-b (centre line and both sides) on floor f.
  clear(ax, az, bx, bz, r = BODY, f = 0) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-6) return true;
    const nx = -dz / l * r, nz = dx / l * r;
    const w = this.worldAt(f);
    return !w.segmentBlocked(ax, az, bx, bz) && !w.segmentBlocked(ax + nx, az + nz, bx + nx, bz + nz) && !w.segmentBlocked(ax - nx, az - nz, bx - nx, bz - nz);
  }

  nearest(x, z, f = 0) {
    let best = -1, bestD = Infinity, fallback = -1, fbD = Infinity;
    this.nodes.forEach((n, i) => {
      if (n.floor !== f) return;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < fbD) { fbD = d; fallback = i; }
      if (d < bestD && this.clear(x, z, n.x, n.z, 0.15, f)) { bestD = d; best = i; }
    });
    return best >= 0 ? best : fallback;
  }

  // List of [x, z] points from (fx, fz) on floor `from` to (tx, tz) on floor `to`.
  path(fx, fz, tx, tz, from = 0, to = from) {
    if (from === to && this.clear(fx, fz, tx, tz, BODY, from)) return [[tx, tz]];
    const s = this.nearest(fx, fz, from), g = this.nearest(tx, tz, to);
    const N = this.nodes, dist = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1);
    const open = new Set([s]);
    dist[s] = 0;
    const h = (i) => Math.hypot(N[i].x - N[g].x, N[i].z - N[g].z);
    while (open.size) {
      let cur = -1, best = Infinity;
      for (const i of open) { const f = dist[i] + h(i); if (f < best) { best = f; cur = i; } }
      if (cur === g) break;
      open.delete(cur);
      for (const [j, d] of N[cur].edges) {
        if (dist[cur] + d < dist[j]) { dist[j] = dist[cur] + d; prev[j] = cur; open.add(j); }
      }
    }
    const pts = [];
    for (let i = g; i >= 0; i = prev[i]) { pts.unshift([N[i].x, N[i].z]); if (i === s) break; }
    if (!pts.length || (pts[0][0] !== N[s].x || pts[0][1] !== N[s].z)) return [[N[g].x, N[g].z], [tx, tz]];
    // skip the first point if we can already go straight to the second
    if (pts.length > 1 && this.clear(fx, fz, pts[1][0], pts[1][1], BODY, from)) pts.shift();
    pts.push([tx, tz]);
    return pts;
  }

  // A random reachable room point (for searching during an alarm), indoors: [x, z, floor].
  randomIndoor() {
    const indoor = this.nodes.filter((n) => this.indoor([n.x, n.z, n.floor]));
    const n = indoor[Math.floor(Math.random() * indoor.length)];
    return [n.x, n.z, n.floor];
  }
}
