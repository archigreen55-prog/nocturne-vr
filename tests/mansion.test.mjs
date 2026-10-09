// Map 2, the mansion (W6). M1: the map opens, the first map is untouched, the stairs carry the
// player between the floors, the well is fenced, the guard walks its rounds, the floors are linked
// for the navigation; the VR emulator climbs the stairs with the stick.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, UA, open, test, base, preview, keepFor, LAND, tp } from './runner.mjs';

const mansion = preview + '?map=mansion';
// walk with W + Space (2 m/s) for `secs` of game time (the keyboard state is read every simulated frame)
async function walk(page, yaw, secs) {
  await page.evaluate((yaw) => { window.__game.player.lookYaw = yaw; }, yaw);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  await page.evaluate((secs) => window.__game.sim(secs), secs);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
}
const pos = (page) => page.evaluate(() => { const p = window.__game.player; return { x: +p.head.x.toFixed(2), z: +p.head.z.toFixed(2), y: +p.floorY.toFixed(2) }; });

test('mansion (M1): ?map=mansion opens the second map on a preview and is remembered; the main site keeps the first map; ?map=dacha goes back', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  const info = await page.evaluate(() => {
    const g = window.__game, L = g.level;
    return { id: L.id, doors: L.doors.length, floors: L.worlds.length, items: g.loot.items.map((i) => i.id), guard: [g.patrol.x, g.patrol.z, g.patrol.y], spawn: [+g.player.head.x.toFixed(1), +g.player.head.z.toFixed(1)], tris: L.triangles, van: g.CFG.round.vanZone, drop: g.CFG.dropZone, board: g.board.mesh.position.x };
  });
  assert.equal(info.id, 'mansion');
  assert.equal(info.floors, 2, 'one collision world per floor');
  assert.equal(info.doors, 22, `doors on both floors and the shed: ${info.doors}`);
  assert.equal(info.items.length, 15, 'the 14 items of the plan and the fake painting in the van');
  assert.deepEqual(info.guard, [10, -8.5, 0], 'the guard starts in the study');
  assert.deepEqual(info.spawn, [15, -4.2], 'the player starts in the alley by the van');
  assert.equal(info.van.x, 16.5, 'the "at the van" zone is the mansion\'s');
  assert.equal(info.drop.x, 16.5, 'the drop-off ring is the mansion\'s');
  assert.ok(Math.abs(info.board - 14.55) < 0.01, 'the board stands by the van');
  assert.ok(info.tris > 3000 && info.tris < 60000, `blockout triangles: ${info.tris}`);
  assert.deepEqual(errors, []);
  await page.close();   // one running game at a time: a second tab loads slowly next to a running one
  // remembered on this preview
  const page2 = (await open(ctx, preview)).page;
  assert.equal(await page2.evaluate(() => window.__game.level.id), 'mansion', 'the map is remembered');
  await page2.close();
  // the main site (no preview): the mansion is closed by the flag, ?map=mansion is ignored
  const page3 = (await open(ctx, base + '?map=mansion')).page;
  assert.equal(await page3.evaluate(() => [window.__game.level.id, window.__game.level.doors.length, window.__game.loot.items.length].join()), 'dacha,8,8', 'the first map as before');
  await page3.close();
  // back
  const page4 = (await open(ctx, preview + '?map=dacha')).page;
  assert.equal(await page4.evaluate(() => window.__game.level.id), 'dacha');
  await page4.close();
  const page5 = (await open(ctx, preview)).page;
  assert.equal(await page5.evaluate(() => window.__game.level.id), 'dacha', '?map=dacha is remembered too');
  await ctx.close();
});

test('mansion (M1): the stairs — the ground rises smoothly along both flights, the player walks up to the gallery, the well and the flights are fenced', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  // the ground height along the centre line of flight 1, the landing and flight 2
  const profile = await page.evaluate(() => {
    const L = window.__game.level, out = [];
    let y = 0;
    for (let z = -6.8; z >= -11.4; z -= 0.1) { y = L.floorY(-5.6, z, y); out.push([+z.toFixed(1), +y.toFixed(3)]); }   // flight 1, north
    for (let x = -5.6; x <= -3.2; x += 0.1) { y = L.floorY(x, -11.1, y); out.push([+x.toFixed(1), +y.toFixed(3)]); }   // the landing, east
    for (let z = -11.1; z <= -6.8; z += 0.1) { y = L.floorY(-3.2, z, y); out.push([+z.toFixed(1), +y.toFixed(3)]); }    // flight 2, south
    return out;
  });
  let maxStep = 0;
  for (let i = 1; i < profile.length; i++) { assert.ok(profile[i][1] >= profile[i - 1][1] - 1e-6, `the ground never drops on the way up: ${profile[i - 1]} -> ${profile[i]}`); maxStep = Math.max(maxStep, profile[i][1] - profile[i - 1][1]); }
  assert.ok(maxStep < 0.06, `no jump larger than a step of the ramp (${maxStep.toFixed(3)} m per 0.1 m)`);
  assert.equal(profile[0][1], 0); assert.equal(profile.at(-1)[1], 3);
  assert.ok(profile.some(([, y]) => y === 1.5), 'the landing is at 1.5 m');
  // floors by height
  assert.deepEqual(await page.evaluate(() => [0, 1.4, 1.5, 2.9, 3.2].map((y) => window.__game.level.floorIndex(y))), [0, 0, 1, 1, 1]);
  // the room under the head knows the floor
  assert.deepEqual(await page.evaluate(() => { const L = window.__game.level; return [L.roomAt(0, -8.5, 0), L.roomAt(0, -8.5, 3), L.roomAt(-9.5, -15, 0), L.roomAt(-9.5, -15, 3), L.roomAt(16, -5, 0)]; }),
    ['Хол', 'Галерея', 'Бібліотека', 'Спальня господарів', 'Провулок']);

  // walk: from the hall up flight 1 (north), along the landing (east), up flight 2 (south)
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(-5.6, -6.9, 0); g.sim(0.1); });
  await walk(page, 0, 2.8);
  let p = await pos(page);
  assert.ok(p.y > 1.45 && p.y < 1.55 && p.z < -10.36 && p.z > -11.9, `up flight 1 onto the landing, stopped by the north wall: ${JSON.stringify(p)}`);
  await walk(page, -Math.PI / 2, 1.6);
  p = await pos(page);
  assert.ok(p.x > -3.6 && p.x < -2.0 && p.y === 1.5, `along the landing to the east, stopped by its east rail: ${JSON.stringify(p)}`);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(-3.2, -11.1, Math.PI, 1.5); g.sim(0.1); });
  await walk(page, Math.PI, 3.0);
  p = await pos(page);
  assert.ok(p.y > 2.95 && p.z > -7.4 && p.z < -4.9, `up flight 2 to the gallery's south strip: ${JSON.stringify(p)}`);
  assert.equal(await page.evaluate(() => window.__game.level.roomAt(window.__game.player.head.x, window.__game.player.head.z, window.__game.player.floorY)), 'Галерея');
  // on the gallery, the well is fenced: walking west into it from (-1, -8.95) stops at x = -2
  await page.evaluate(() => { const g = window.__game; g.player.teleport(-1.0, -8.95, Math.PI / 2, 3); g.sim(0.1); });
  await walk(page, Math.PI / 2, 1.5);
  p = await pos(page);
  assert.ok(p.x > -2.0 && p.x < -1.6 && p.y === 3, `the well's parapet holds: ${JSON.stringify(p)}`);
  // the balcony: out through its door, the rail holds
  await page.evaluate(() => { const g = window.__game; g.player.teleport(-8, -0.3, Math.PI, 3); g.sim(0.1); const d = g.level.doors.find((dd) => Math.hypot(dd.cx + 8, dd.cz) < 0.3); d.toggle(-8, -0.3); g.sim(0.5); });
  await walk(page, Math.PI, 2.0);
  p = await pos(page);
  assert.ok(p.z > 1.5 && p.z < 2.0 && p.y === 3, `on the balcony, held by its rail: ${JSON.stringify(p)}`);
  // downstairs again: from the top of flight 2 all the way down to the hall
  await page.evaluate(() => { const g = window.__game; g.player.teleport(-3.2, -6.4, 0, 3); g.sim(0.1); });
  await walk(page, 0, 2.6);
  await walk(page, Math.PI / 2, 1.6);
  await walk(page, Math.PI, 2.8);
  p = await pos(page);
  assert.ok(p.y < 0.05 && p.z > -7.4, `down both flights to the hall floor: ${JSON.stringify(p)}`);
  // a door on the other floor is never the "nearest" one: under the balcony door, downstairs
  assert.deepEqual(await page.evaluate(() => { const g = window.__game; const at = (y) => { g.player.teleport(-8, -0.3, Math.PI, y); g.sim(0.1); const d = g.nearestDoor(-8, -0.3, 1.6); return d ? d.floor : null; }; return [at(0), at(3)]; }), [null, 1]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M1): the guard walks its ground-floor rounds for 3 minutes of game time without getting stuck; the navigation graph links the floors by the stairs; a door on the other floor is not opened', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const trace = await page.evaluate(() => {
    const g = window.__game, out = [];
    g.player.teleport(18, 10, 0);   // far away in the garden: the guard is left to its rounds
    for (let i = 0; i < 18; i++) { g.sim(10); out.push({ x: +g.patrol.x.toFixed(2), z: +g.patrol.z.toFixed(2), y: g.patrol.y, state: g.patrol.state, room: g.level.roomAt(g.patrol.x, g.patrol.z, g.patrol.y), act: g.patrol.activity, phase: g.round.phase, path: g.patrol.path.slice(0, 3), wait: +g.patrol.doorWait.toFixed(2), q: g.patrol.queue.length }); }
    return out;
  });
  for (const s of trace) { assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), 'position stays a number'); assert.equal(s.y, 0, 'M1: the guard keeps to the ground floor'); }
  const rooms = new Set(trace.map((s) => s.room));
  assert.ok(rooms.size >= 3, `visits several rooms in 3 minutes: ${[...rooms].join(', ')} ${JSON.stringify(trace)}`);
  let moves = 0;
  for (let i = 1; i < trace.length; i++) if (Math.hypot(trace[i].x - trace[i - 1].x, trace[i].z - trace[i - 1].z) > 1) moves++;
  assert.ok(moves >= 6, `keeps moving (${moves} of ${trace.length - 1} samples moved > 1 m): ${JSON.stringify(trace)}`);
  const nav = await page.evaluate(() => {
    const g = window.__game;
    const up = g.nav.path(0, -8.5, 4, -7, 0, 1), down = g.nav.path(5, -15, 9.5, -15, 1, 0);
    const seen = new Set([0]), q = [0];
    while (q.length) { const c = q.shift(); for (const [j] of g.nav.nodes[c].edges) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    return { up, down, stairNodes: g.nav.nodes.filter((n) => n.x === -5.6 || n.x === -3.2).map((n) => [n.x, n.z, n.floor, n.edges.length]), unreachable: g.nav.nodes.map((n, i) => [i, n.x, n.z, n.floor]).filter(([i]) => !seen.has(i)) };
  });
  assert.ok(nav.up.length >= 4 && nav.up.some(([x, z]) => Math.abs(x + 5.6) < 0.01 && Math.abs(z + 11.1) < 0.01), `hall -> gallery goes over the landing: ${JSON.stringify(nav.up)}`);
  assert.ok(nav.down.length >= 4 && nav.down.some(([x, z]) => Math.abs(x + 5.6) < 0.01 && Math.abs(z + 6.9) < 0.01), `kids room -> kitchen comes down the stairs: ${JSON.stringify(nav.down)}`);
  for (const n of nav.stairNodes) assert.ok(n[3] >= 1, `stair node ${n} is linked`);
  assert.deepEqual(nav.unreachable, [], 'every navigation point can be reached from the hall');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M1): VR emulator (IWER Quest 3) — the stick walks the rig up the stairs to the landing', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, mansion);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__game.player.teleport(-5.6, -6.9, 0); });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(() => { const g = window.__game; return [+g.player.head.x.toFixed(2), +g.player.head.z.toFixed(2), +g.player.floorY.toFixed(2), +g.player.yaw.toFixed(2), g.player.onRamp, +g.simT.toFixed(1)]; }));
    if (samples.at(-1)[2] > 1.4) break;
  }
  assert.ok(samples.at(-1)[2] > 1.4, `the rig climbs flight 1 (samples: ${JSON.stringify(samples)})`);
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  const p = await page.evaluate(() => { const g = window.__game; return { y: g.player.floorY, rigY: g.player.rig.position.y, z: g.player.head.z, ramp: g.player.onRamp }; });
  assert.ok(p.y >= 1.4 && p.z < -9.5, `the rig rode up flight 1: ${JSON.stringify(p)}`);
  assert.ok(Math.abs(p.rigY - p.y) < 0.01, 'the XR rig sits on the ground height');
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await page.waitForFunction(() => !window.__game.inVR);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- M2: furniture, instanced doors, the other floor hidden, the mask by height, the lamp pool ----------
test('mansion (M2): the rooms of the other floor are not drawn, the doors are one instanced mesh; triangles and draw calls at the gallery, the garden and the hall stay within the budget', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const measure = async (x, z, yaw, y, pitch = 0) => {
    await page.evaluate(([x, z, yaw, y, pitch]) => { const g = window.__game; g.player.teleport(x, z, yaw, y); g.player.lookPitch = pitch; g.sim(0.3); }, [x, z, yaw, y, pitch]);
    // real frames: the frame hooks (floor visibility, lamps) and the renderer's counters; the busiest frame counts
    const all = await keepFor(page, 1500, () => [window.__game.perf.calls, window.__game.perf.tris]);
    const samples = all.slice(Math.floor(all.length / 2));   // the later frames: the first ones may still show the previous spot
    const calls = Math.max(...samples.map((s) => s[0])), tris = Math.max(...samples.map((s) => s[1]));
    return { calls, tris, ...(await page.evaluate(() => { const g = window.__game, L = g.level; return { floors: L.floorMeshes.map((m) => m.visible), doors: g.scene.getObjectByName('doors').count }; })) };
  };
  const gallery = await measure(4, -8.5, Math.PI / 2, 3, -0.5);   // looking west and down into the well
  const garden = await measure(15, 3, Math.PI / 2, 0);              // by the garage, facing the house
  const hall = await measure(0, -8.5, Math.PI / 2, 0);              // the hall, towards the stairs
  assert.deepEqual(gallery.floors, [false, true], 'upstairs: the ground-floor rooms are not drawn');
  assert.deepEqual(hall.floors, [true, false], 'downstairs: the upstairs rooms are not drawn');
  assert.equal(hall.doors, 22, 'one instanced mesh holds every door');
  for (const [name, m] of [['gallery', gallery], ['garden', garden], ['hall', hall]]) {
    assert.ok(m.tris > 1000 && m.tris <= 45000, `${name}: ${m.tris} triangles drawn (budget 45 000)`);
    assert.ok(m.calls <= 40, `${name}: ${m.calls} draw calls`);
  }
  // the first map, for comparison (the plan: mansion <= first map + 8 draw calls); the running game is
  // closed first — a second tab next to it loads past the timeout under the full run's load
  await page.close();
  const d = (await open(ctx, preview + '?map=dacha')).page;
  await d.click('#start'); await d.waitForFunction(() => window.__game.playing);
  await d.evaluate(() => { const g = window.__game; g.player.teleport(0, -2.5, 0, 0); g.sim(0.3); });
  const da = await keepFor(d, 1500, () => [window.__game.perf.calls, window.__game.perf.tris]), ds = da.slice(Math.floor(da.length / 2));
  const dacha = { calls: Math.max(...ds.map((s) => s[0])), tris: Math.max(...ds.map((s) => s[1])) };
  console.log(`    draw calls / triangles: gallery ${gallery.calls} / ${gallery.tris}, garden ${garden.calls} / ${garden.tris}, hall ${hall.calls} / ${hall.tris}; first map ${dacha.calls} / ${dacha.tris}`);
  // in the headless renderer most objects are culled, so the first map's count is a reference, not a gate
  assert.ok(dacha.calls > 0 && dacha.tris > 1000, 'the first map drew its frame');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M2): the flashlight mask lights the guard\'s floor only (the stair well both); the point lights move to the lamps of the player\'s floor', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const bands = (x, z, y) => page.evaluate(([x, z, y]) => {
    const g = window.__game, U = g.flashUniforms;
    g.patrol.x = x; g.patrol.z = z; g.patrol.y = y; g.player.teleport(18, 10, 0); g.sim(0.2);
    return Array.from({ length: U.uFlashCount.value }, (_, i) => [U.uFlashRooms.value[i].x, U.uFlashBands.value[i].x, U.uFlashBands.value[i].y]);
  }, [x, z, y]);
  const down = await bands(0, -8.5, 0);
  assert.ok(down.length >= 2, 'the hall and its neighbours');
  assert.ok(down.every(([, y0, y1]) => (y0 < 0 && y1 < 3.2) || (y0 < 0 && y1 > 5)), `downstairs: rooms of the ground floor plus the well: ${JSON.stringify(down)}`);
  assert.ok(down.some(([, , y1]) => y1 > 5), 'the stair well is lit through');
  const up = await bands(4, -8.5, 3);
  assert.ok(up.every(([, y0, y1]) => (y0 > 2.5 && y1 > 5) || (y0 < 0 && y1 > 5)), `upstairs: rooms of the second floor plus the well: ${JSON.stringify(up)}`);
  assert.ok(up.some(([, y0]) => y0 > 2.5), 'the gallery is in the mask');
  // the lamp pool follows the player's floor
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -8.5, 0, 3); g.sim(0.2); });
  await keepFor(page, 1500);
  const upLights = await page.evaluate(() => window.__game.points.map((p) => +p.position.y.toFixed(1)));
  assert.ok(upLights.every((y) => y > 4), `upstairs: every point light sits at an upstairs lamp: ${upLights}`);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -8.5, 0, 0); g.sim(0.2); });
  await keepFor(page, 1500);
  const downLights = await page.evaluate(() => window.__game.points.map((p) => [+p.position.y.toFixed(1), +p.intensity.toFixed(2)]));
  assert.ok(downLights.every(([y]) => y < 3), `downstairs: every point light sits at a ground-floor lamp: ${JSON.stringify(downLights)}`);
  assert.ok(downLights.some(([, i]) => i > 0), 'the moved lights have faded in');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- M3: two guards, the radio, hearing between floors ----------
test('mansion (M3): two guards — Zhora walks his upstairs rounds, comes down for coffee and goes back up, Valera keeps downstairs; the radio names both', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const r = await page.evaluate(() => {
    const g = window.__game, trace = [], lines = new Set();
    g.player.teleport(18, 10, 0);   // far away in the garden
    for (let i = 0; i < 330; i++) {
      g.sim(1);
      if (g.guardLineT > 0) lines.add(g.guardLine);
      if (i % 10 === 0) trace.push({ v: [+g.patrol.x.toFixed(1), +g.patrol.z.toFixed(1), g.patrol.y], z: [+g.patrol2.x.toFixed(1), +g.patrol2.z.toFixed(1), +g.patrol2.y.toFixed(2), g.patrol2.state, g.patrol2.activity] });
    }
    return { trace, lines: [...lines], lamp: g.flashUniforms.uLampIndex.value, lampLight: !!g.patrol2.lamp, spot: !!g.patrol2.spot, phase: g.round.phase };
  });
  assert.equal(r.phase, 'heist');
  assert.ok(r.lampLight && !r.spot && r.lamp === 3, `Zhora carries a lamp, not a flashlight; its point light is masked by index 3: ${JSON.stringify([r.lampLight, r.spot, r.lamp])}`);
  for (const s of r.trace) assert.equal(s.v[2], 0, `Valera stays on the ground floor: ${JSON.stringify(s.v)}`);
  const ys = r.trace.map((s) => s.z[2]), up = ys.filter((y) => y === 3).length, firstDown = ys.findIndex((y) => y < 1);
  assert.ok(up >= 12, `Zhora is upstairs most of the time (${up} of ${ys.length} samples): ${JSON.stringify(r.trace.map((s) => s.z))}`);
  assert.ok(firstDown >= 0, `Zhora came down for coffee at least once: ${JSON.stringify(r.trace.map((s) => s.z))}`);
  assert.ok(ys.slice(firstDown).some((y) => y === 3), `and went back up afterwards: ${JSON.stringify(r.trace.map((s) => s.z))}`);
  assert.ok(r.lines.some((l) => l.startsWith('Валера:')) && r.lines.some((l) => l.startsWith('Жора:')), `the radio chatter names both: ${JSON.stringify(r.lines)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M3): a noise upstairs reaches Zhora, not Valera through the slab; a noise downstairs reaches the nearer one; a full alarm sends the other guard to the nearest exit; the lamp mask follows Zhora', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  const place = (v, z) => page.evaluate(([v, z]) => {
    const g = window.__game;
    for (const [p, at] of [[g.patrol, v], [g.patrol2, z]]) { p.interrupt(); p.state = 'task'; p.x = at[0]; p.z = at[1]; p.y = at[2]; p.path = []; p.meter = 0; p.timer = 0; p.queue.length = 0; p.queue.push({ type: 'wait', t: 30 }); }
    g.alert.reset();
  }, [v, z]);
  // Valera in the hall, Zhora on the gallery right above; the player upstairs makes a step noise
  await place([0, -8.5, 0], [4, -8.5, 3]);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(4, -10.5, 0, 3); g.sim(0.1); g.noise.emit(4, -10.5, 5, 'step'); g.sim(0.2); });
  let st = await page.evaluate(() => { const g = window.__game, s = [g.patrol.state, g.patrol2.state]; g.player.teleport(18, 25, 0); g.sim(0.5); return s; });
  assert.deepEqual(st, ['task', 'react'], `upstairs noise: Zhora reacts, Valera does not hear it through the slab: ${st}`);
  // the same noise downstairs, next to Valera
  await place([0, -8.5, 0], [4, -8.5, 3]);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, -10.5, 0, 0); g.sim(0.1); g.noise.emit(0, -10.5, 5, 'step'); g.sim(0.2); });
  st = await page.evaluate(() => { const g = window.__game, s = [g.patrol.state, g.patrol2.state]; g.player.teleport(18, 25, 0); g.sim(0.5); return s; });
  assert.deepEqual(st, ['react', 'task'], `downstairs noise: Valera reacts, Zhora not: ${st}`);
  // the lamp mask: Zhora on the gallery -> upstairs rooms (+ the well); the flashlight mask: Valera's floor
  const masks = await page.evaluate(() => { const g = window.__game, U = g.flashUniforms; g.sim(0.2); return { lamp: Array.from({ length: U.uLampCount.value }, (_, i) => [U.uLampBands.value[i].x, U.uLampBands.value[i].y]), flash: Array.from({ length: U.uFlashCount.value }, (_, i) => [U.uFlashBands.value[i].x, U.uFlashBands.value[i].y]) }; });
  assert.ok(masks.lamp.length >= 1 && masks.lamp.every(([y0, y1]) => (y0 > 2.5 && y1 > 5) || (y0 < 0 && y1 > 5)), `the lamp lights upstairs rooms: ${JSON.stringify(masks.lamp)}`);
  assert.ok(masks.flash.every(([y0, y1]) => y0 < 0), `the flashlight lights ground-floor rooms: ${JSON.stringify(masks.flash)}`);
  // full alarm: Valera sees the player in the hall and chases; Zhora leaves the gallery for the exit nearest to the alarm
  await page.evaluate(() => { const g = window.__game; if (g.round.phase === 'result') g.newRound(); g.player.teleport(18, 25, 0); g.sim(0.5); });
  await place([0, -8.5, 0], [4, -8.5, 3]);
  await page.evaluate(() => { const g = window.__game; g.patrol.heading = Math.PI; g.player.teleport(0, -6.5, 0, 0); g.player.virtualCrouch = false; for (let i = 0; i < 40 && !g.alert.full; i++) g.sim(0.1); });
  const al = await page.evaluate(() => { const g = window.__game; return { full: g.alert.full, v: g.patrol.state, z: g.patrol2.state, stay: g.patrol2.stay, goal: g.patrol2.goal, posts: g.level.alarmPosts, meter: g.patrol.meter, visible: g.patrol.visible, head: [g.player.head.x, g.player.head.y, g.player.head.z], heading: g.patrol.heading, at: [g.patrol.x, g.patrol.z, g.patrol.y], phase: g.round.phase, caughtT: g.caughtT }; });
  assert.ok(al.full && al.v === 'chase', `Valera saw and chases: ${JSON.stringify(al)}`);
  assert.ok(al.z === 'hunt' && al.stay && al.posts.some((p) => Math.abs(p[0] - al.goal[0]) < 0.01 && Math.abs(p[1] - al.goal[1]) < 0.01), `Zhora is posted at an exit: ${JSON.stringify(al)}`);
  // he gets there (down the stairs) and keeps watching it
  await page.evaluate(() => { window.__game.player.teleport(18, 25, 0); window.__game.sim(40); });
  const at = await page.evaluate(() => { const g = window.__game; return { x: g.patrol2.x, z: g.patrol2.z, y: g.patrol2.y, state: g.patrol2.state, stay: g.patrol2.stay, goal: g.patrol2.goal }; });
  assert.ok(at.y === 0 && Math.hypot(at.x - at.goal[0], at.z - at.goal[1]) < 1.2 && at.stay, `Zhora stands at the exit downstairs: ${JSON.stringify(at)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M4): 12 of the 15 items can be taken and delivered into the van\'s cargo (the 2 heavy ones cannot, the fake is not counted); a heavy item says why when you come up to it', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.loot, out = { ids: [], notTakeable: [], delivered: 0, inCargo: 0, slots: new Set() };
    g.playing = true; g.sim(0.1);
    for (const it of L.items) {
      out.ids.push(it.id);
      if (!it.takeable) { out.notTakeable.push(it.id); continue; }
      if (it.prop) continue;
      L.deliver(it);
    }
    g.sim(1.5);
    for (const it of L.items) {
      if (!it.delivered) continue;
      out.delivered++;
      const c = g.level.cargo, p = it.mesh.position;
      if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && Math.abs(p.y - c.y) < 0.01) out.inCargo++;
      out.slots.add(p.x.toFixed(2) + ',' + p.z.toFixed(2));
    }
    out.slots = out.slots.size;
    const t = L.tally();
    out.total = t.total; out.sum = t.sum; out.inVanT = t.inVan;
    return out;
  });
  assert.equal(r.ids.length, 15);
  assert.deepEqual(r.notTakeable, ['m_statue', 'm_clock'], `only the heavy stand-ins cannot be taken: ${JSON.stringify(r.notTakeable)}`);
  assert.equal(r.delivered, 12, 'all 12 delivered');
  assert.equal(r.inCargo, 12, 'all of them lie on the cargo floor');
  assert.ok(r.slots >= 10, `each in its own place (${r.slots} places)`);
  assert.equal(r.total, 12, 'the board counts 12, not the heavy ones or the fake');
  assert.equal(r.sum, 12800, 'the plan\'s $12,800');
  assert.equal(r.inVanT, 12);
  // the heavy statue in the gazebo: come up to it
  const msg = await page.evaluate(() => { const g = window.__game; g.newRound(); g.player.teleport(13, 20, Math.PI / 2, 0); g.sim(0.3); return g.flashText; });
  assert.equal(msg, 'Сам не підніму — це на двох');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M4): loot dropped off the balcony lands on the hedge unharmed with a rustle Valera hears; onto the path it is damaged; the mirror breaks; over the gallery rail it falls into the well; the van has two lurkers — the crate in the garage scares', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.loot, out = {};
    g.playing = true; g.sim(0.1);
    const by = (id) => L.items.find((i) => i.id === id);
    g.player.teleport(15, -4.2, 0, 0);
    const heard = [];
    const orig = g.patrol.audible.bind(g.patrol);
    g.patrol.audible = (e, ey) => { const k = orig(e, ey); if (e.source === 'world') heard.push({ kind: e.kind, r: e.radius, k: +k.toFixed(2), y: +e.y.toFixed(2) }); return k; };
    // 1. the jewel box over the hedge under the balcony (hedge x[-10.5,-5.5] z[2.2,3.2], top 1.0)
    g.patrol.x = -8; g.patrol.z = 8; g.patrol.y = 0;   // Valera in the garden, 5 m away
    let it = by('m_jewelbox'); it.mesh.position.set(-8, 3.9, 2.7); it.drop(new g.THREE.Vector3(0, 0, 0)); g.sim(3);
    out.hedge = { y: +it.mesh.position.y.toFixed(2), damaged: it.damaged, state: it.state, heard: heard.slice() };
    heard.length = 0;
    // 2. the statuette onto the path beyond the hedge
    it = by('m_statuette'); it.mesh.position.set(-8, 3.9, 4.5); it.drop(new g.THREE.Vector3(0, 0, 0)); g.sim(3);
    out.path = { y: +it.mesh.position.y.toFixed(2), damaged: it.damaged, heard: heard.slice() };
    // 3. the mirror from half a metre
    it = by('m_mirror'); it.mesh.position.set(-9, 3.5, -2.5); it.drop(new g.THREE.Vector3(0, 0, 0)); g.sim(2);
    out.mirror = { broken: it.broken, state: it.state, y: +it.mesh.position.y.toFixed(2) };
    // 4. the trophy over the gallery rail into the stair well (well x[-6.8,-2] z[-11.93,-7.36]) and on the gallery floor
    it = by('m_trophy'); it.mesh.position.set(-4.5, 3.6, -9.0); it.drop(new g.THREE.Vector3(0, 0, 0)); g.sim(3);
    out.well = { y: +it.mesh.position.y.toFixed(2), floor: g.level.floorIndex(it.mesh.position.y) };
    it = by('m_robot'); it.mesh.position.set(5, 3.4, -8.5); it.drop(new g.THREE.Vector3(0, 0, 0)); g.sim(2);
    out.gallery = { y: +it.mesh.position.y.toFixed(2) };
    // 5. the crate lurker in the garage (x 12.2, z 0.2): walk up to it
    out.lurkers = g.lurkers.map((l) => l.kind);
    g.newRound();
    g.player.teleport(10.6, 0.2, 0, 0); g.sim(0.5);
    out.crateState1 = g.lurkers[1].state;
    g.sim(2.5);
    out.crateState2 = g.lurkers[1].state; out.scares = g.lurkers[1].scares; out.wardrobeScares = g.lurkers[0].scares;
    out.lidUp = g.lurkers[1].lid ? +g.lurkers[1].lid.rotation.x.toFixed(2) : null;
    return out;
  });
  assert.ok(Math.abs(r.hedge.y - 1.0) < 0.05, `lands on the hedge top: ${JSON.stringify(r.hedge)}`);
  assert.equal(r.hedge.damaged, false, 'the hedge is soft');
  assert.ok(r.hedge.heard.some((h) => h.r === 8), `a rustle of 8 m reaches Valera: ${JSON.stringify(r.hedge.heard)}`);
  assert.ok(Math.abs(r.path.y) < 0.05 && r.path.damaged === true, `onto the path from 3.9 m: damaged ${JSON.stringify(r.path)}`);
  assert.equal(r.mirror.broken, true, `the mirror is fragile: ${JSON.stringify(r.mirror)}`);
  assert.ok(r.well.y < 1.6 && r.well.floor === 0, `over the gallery rail into the well it lands on the stairs below: ${JSON.stringify(r.well)}`);
  assert.ok(Math.abs(r.gallery.y - 3) < 0.05, `dropped on the gallery floor it stays upstairs: ${JSON.stringify(r.gallery)}`);
  assert.deepEqual(r.lurkers, ['wardrobe', 'crate']);
  assert.equal(r.crateState1, 'telegraph', 'the crate rattles when you come close');
  assert.ok(r.scares === 1 && r.wardrobeScares === 0, `the crate lunged once: ${r.crateState2} ${r.scares}/${r.wardrobeScares}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mansion (M4): a pocket hides you standing while its door is shut (not with it open, not with the guard inside); the fountain masks noise for a guard beside it; the shed has a door', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  const r = await page.evaluate(() => {
    const g = window.__game, L = g.level, out = {};
    const st = () => { const s = g.stealthState(g.player, L, g.guards); return { cover: s.cover, hidden: s.hidden, eye: s.eye }; };
    g.playing = true; g.sim(0.1);
    // the wardrobe pocket upstairs x[-6,-3] z[-18,-12]; its door is in the bedroom wall at (-6, -15); Zhora just outside it
    const door = L.doors.find((d) => d.floor === 1 && Math.abs(d.cx - (-6)) < 0.3 && Math.abs(d.cz - (-15)) < 0.8);
    out.door = door ? [+door.cx.toFixed(1), +door.cz.toFixed(1)] : null;
    g.player.teleport(-4.5, -15, Math.PI / 2, 3); g.player.virtualCrouch = false; g.sim(0.3);
    g.patrol2.x = -7.5; g.patrol2.z = -15; g.patrol2.y = 3; g.patrol2.heading = -Math.PI / 2; g.patrol.x = 10; g.patrol.z = -8.5;
    out.shut = st();
    if (door) { door.angle = door.target = 1.4; }
    out.open = st();
    if (door) { door.angle = door.target = 0; }
    g.patrol2.x = -4.0; g.patrol2.z = -13.5;   // inside, looking
    out.inside = st();
    // the fountain (0, 13), r 5: Valera next to it hears a noise 6 m away less than from the same distance elsewhere
    const e = { x: 0, z: 7, y: 0.03, radius: 8, kind: 'step', source: 'player' };
    g.patrol.x = 0; g.patrol.z = 12; g.patrol.y = 0; out.nearFountain = +g.patrol.audible(e, 0).toFixed(2);
    g.patrol.x = 0; g.patrol.z = 2; out.away = +g.patrol.audible(e, 0).toFixed(2);
    out.shedDoor = L.doors.some((d) => Math.abs(d.cx - (-17)) < 0.6 && Math.abs(d.cz - 21) < 0.3);
    out.pockets = L.pockets.length;
    return out;
  });
  assert.ok(r.door, 'the wardrobe has a door');
  assert.deepEqual(r.shut, { cover: true, hidden: true, eye: 'closed' }, `standing in the shut pocket: ${JSON.stringify(r.shut)}`);
  assert.equal(r.open.hidden, false, `with the door open the guard outside sees in: ${JSON.stringify(r.open)}`);
  assert.equal(r.inside.hidden, false, `with the guard inside you are seen: ${JSON.stringify(r.inside)}`);
  assert.ok(r.nearFountain < r.away, `the fountain masks: ${r.nearFountain} < ${r.away}`);
  assert.equal(r.shedDoor, true);
  assert.equal(r.pockets, 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the stairs under running (CFG.sprint.stairs, merged from the «Біг» branch) ----------
test('mansion (stairs + run): on a PC and a phone running up the stairs is x0.8 (2.24 m/s) and every tread creaks; in VR the ramp caps the speed at 1.2 m/s', async () => {
  const S = { onRamp: 0, creaks: 0, runSteps: 0, speeds: [] };
  // PC: W + Space twice (the running wish) through the keyboard state, fixed steps
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, mansion);
  const pc = await page.evaluate(() => {
    const g = window.__game, out = { onRamp: 0, creaks: 0, runSteps: 0, speeds: [], cfg: g.CFG.sprint.stairs };
    g.playing = true; g.sim(0.1);
    g.patrol.update = () => null; g.patrol2.update = () => null;
    g.player.teleport(-5.6, -6.6, 0, 0); g.player.lookYaw = 0; g.sim(0.2);
    g.keys.down.add('KeyW'); g.keys.down.add('Space'); g.keys.spaceRun = true;
    for (let i = 0; i < 72 * 2.5; i++) {
      g.sim(1 / 72);
      if (g.player.onRamp) { out.onRamp++; out.speeds.push(+g.player.speed.toFixed(2)); if (g.player.stairCreak) out.creaks++; if (g.player.stepNoise && g.player.stepKind === 'run') out.runSteps++; }
    }
    g.keys.down.clear(); g.keys.spaceRun = false;
    out.max = Math.max(...out.speeds.slice(12)); out.running = g.run.running; out.y = +g.player.floorY.toFixed(2);   // after the first frames: the speed eases from 2.8 to 2.24
    return out;
  });
  assert.deepEqual(pc.cfg, { vrMaxSpeed: 1.2, runK: 0.8, creakEveryStepWhenRunning: true });
  assert.ok(pc.onRamp > 30, `ran on the ramp (${pc.onRamp} frames, y ${pc.y}, running ${pc.running})`);
  assert.ok(pc.max > 2.1 && pc.max < 2.35, `PC on the stairs: 2.8 x 0.8 = 2.24, got ${pc.max} (${JSON.stringify(pc.speeds.slice(-8))})`);
  assert.ok(pc.creaks >= 3 && pc.creaks === pc.runSteps, `every tread creaks: ${pc.creaks} creaks, ${pc.runSteps} running steps on the ramp`);
  await page.close();
  await ctx.close();
  // phone: the joystick forward past its circle
  const pctx = await newContext(browser, LAND);
  const { page: ph, errors: perr } = await open(pctx, mansion);
  await ph.tap('#start'); await ph.waitForFunction(() => window.__game.playing);
  const cdp = await pctx.newCDPSession(ph);
  await ph.evaluate(() => { const g = window.__game; g.patrol.update = () => null; g.patrol2.update = () => null; g.player.teleport(-5.6, -6.6, 0, 0); g.player.lookYaw = 0; });
  await tp(cdp, 'touchStart', [{ x: 170, y: 250 }]);
  for (const dy of [-30, -60, -90]) await tp(cdp, 'touchMove', [{ x: 170, y: 250 + dy }]);
  const phone = await keepFor(ph, 2200, () => [window.__game.player.onRamp, +window.__game.player.speed.toFixed(2), window.__game.run.running, window.__game.player.runSpeed]);
  await tp(cdp, 'touchEnd');
  const onRamp = phone.filter((s) => s[0]);
  assert.ok(onRamp.length > 5 && onRamp.some((s) => s[2]), `phone: ran on the ramp (${onRamp.length} samples: ${JSON.stringify(onRamp.slice(0, 4))})`);
  const pmax = Math.max(...onRamp.slice(-4).map((s) => s[1]));   // settled (real frames: the easing from 2.8 takes a few of them)
  assert.ok(pmax > 2.0 && pmax < 2.35, `phone on the stairs: ~2.24 once settled, got ${pmax} (${JSON.stringify(onRamp.map((s) => s[1]))})`);
  assert.deepEqual(perr, []);
  await pctx.close();
  // VR: the stick forward + stick press (running), the ramp caps the speed
  const vctx = await newContext(browser, { userAgent: UA.quest });
  await vctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page: vr, errors: verr } = await open(vctx, mansion);
  await vr.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await vr.click('#vrbutton');
  await vr.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await vr.waitForTimeout(500);
  await vr.evaluate(() => { const g = window.__game; g.patrol.update = () => null; g.patrol2.update = () => null; g.player.teleport(-5.6, -6.6, 0); });
  await vr.waitForTimeout(400);
  await vr.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  await vr.waitForTimeout(300);
  await vr.evaluate(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 1));
  await vr.waitForTimeout(150);
  await vr.evaluate(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 0));
  const vs = [];
  for (let i = 0; i < 24; i++) {
    await vr.waitForTimeout(250);
    vs.push(await vr.evaluate(() => { const g = window.__game; return [g.player.onRamp, +g.player.speed.toFixed(2), g.run.running, +g.player.floorY.toFixed(2)]; }));
    if (vs.at(-1)[3] > 1.4) break;
  }
  await vr.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  const vRamp = vs.filter((s) => s[0]);
  assert.ok(vRamp.length >= 3 && vRamp.some((s) => s[2]), `VR: ran on the ramp (${JSON.stringify(vs)})`);
  assert.ok(Math.max(...vRamp.slice(4).map((s) => s[1])) <= 1.25, `VR on the ramp: at most 1.2 m/s once settled (${JSON.stringify(vRamp)})`);
  await vr.evaluate(() => window.__game.renderer.xr.getSession().end());
  await vr.waitForFunction(() => !window.__game.inVR);
  assert.deepEqual(verr, []);
  assert.deepEqual(errors, []);
  await vctx.close();
});
