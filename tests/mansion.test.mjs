// Map 2, the mansion (W6). M1: the map opens, the first map is untouched, the stairs carry the
// player between the floors, the well is fenced, the guard walks its rounds, the floors are linked
// for the navigation; the VR emulator climbs the stairs with the stick.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, UA, open, test, base, preview, keepFor } from './runner.mjs';

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
  assert.equal(info.doors, 21, `doors on both floors: ${info.doors}`);
  assert.deepEqual(info.items, ['m_chest', 'm_vase', 'm_candelabrum']);
  assert.deepEqual(info.guard, [10, -8.5, 0], 'the guard starts in the study');
  assert.deepEqual(info.spawn, [15, -4.2], 'the player starts in the alley by the van');
  assert.equal(info.van.x, 16.5, 'the "at the van" zone is the mansion\'s');
  assert.equal(info.drop.x, 16.5, 'the drop-off ring is the mansion\'s');
  assert.ok(Math.abs(info.board - 14.55) < 0.01, 'the board stands by the van');
  assert.ok(info.tris > 3000 && info.tris < 60000, `blockout triangles: ${info.tris}`);
  assert.deepEqual(errors, []);
  // remembered on this preview
  const page2 = (await open(ctx, preview)).page;
  assert.equal(await page2.evaluate(() => window.__game.level.id), 'mansion', 'the map is remembered');
  // the main site (no preview): the mansion is closed by the flag, ?map=mansion is ignored
  const page3 = (await open(ctx, base + '?map=mansion')).page;
  assert.equal(await page3.evaluate(() => [window.__game.level.id, window.__game.level.doors.length, window.__game.loot.items.length].join()), 'dacha,8,8', 'the first map as before');
  // back
  const page4 = (await open(ctx, preview + '?map=dacha')).page;
  assert.equal(await page4.evaluate(() => window.__game.level.id), 'dacha');
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
