// Running (W1): the third tempo, stamina and "out of breath", the guard's answer, doors, the hands,
// crouching; switching it on with the phone joystick (and its 🔒 auto-run), the PC keyboard and the VR
// stick (emulator). The logic tests drive the game with sim() (fixed steps, no rendering).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { devices } from 'playwright';
import { newContext, ROOT } from './harness.mjs';
import { browser, UA, open, test, LAND, tp, keepFor, frames, playPhone, standFacing, fingerPressEl, base } from './runner.mjs';

// A PC page in a round, standing at the start of a straight open line (11 m of floor to the west of
// the yard), the clock running. In the page: __runKeys(on) holds W + Space-twice (the running wish).
// freeze: the guard and the lurker stand still (they wander at random and could catch you mid-test)
async function pcRound(difficulty = 'medium', freeze = true) {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.evaluate(([d, freeze]) => {
    const g = window.__game;
    if (freeze) { g.patrol.update = () => null; g.lurker.update = () => {}; }
    g.setDifficulty(d);
    g.newRound(); g.playing = true;
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    window.__runKeys = (on) => {
      const k = g.keys;
      if (on) { k.down.add('KeyW'); k.down.add('Space'); k.spaceRun = true; } else { k.down.clear(); k.spaceRun = false; }
    };
    window.__guardAway = () => { g.patrol.x = -7.4; g.patrol.z = -10.4; g.patrol.state = 'task'; g.patrol.queue.length = 0; g.alert.reset(); };
  }, [difficulty, freeze]);
  return { ctx, page, errors };
}
const runTo = (page, on) => page.evaluate((on) => window.__runKeys(on), on);

test('running logic: 2.8 m/s; stamina 5 s / 10 s, out of breath 4 s (no holding your breath, whisper +3 dB); easy 7 / 7 / 2 and hard 4 / 12 / 6', async () => {
  const { ctx, page, errors } = await pcRound('medium');
  const r = await page.evaluate(() => {
    const g = window.__game, out = {};
    window.__runKeys(true);
    g.sim(1);
    out.speed = +g.player.speed.toFixed(2); out.running = g.run.running; out.runSpeed = g.player.runSpeed;
    const t0 = g.simT - 1;
    while (g.run.running && g.simT - t0 < 10) g.sim(1 / 72);
    out.ranFor = +(g.simT - t0).toFixed(2); out.winded = +g.run.winded.toFixed(2);
    out.raise = g.mic.raise;
    // out of breath: holding your breath does not start
    g.keys.down.add('ShiftLeft'); g.sim(0.3);
    out.breathWhileWinded = g.breath.state;
    g.keys.down.delete('ShiftLeft');
    window.__runKeys(false);
    g.sim(1.5); out.windedAfter2 = +g.run.winded.toFixed(2);
    g.sim(2.3); out.windedAfter4 = g.run.winded; out.raiseAfter = g.mic.raise;
    out.leftAfterWinded = +g.run.left.toFixed(2);   // refilled during the 4 s: 2 s of running
    g.sim(6.2); out.fullAfter10 = g.run.full;
    out.stats = { ...g.runStats };
    // walking speed unchanged
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    g.keys.down.add('KeyW'); g.keys.down.add('Space'); g.sim(1);
    out.walk = +g.player.speed.toFixed(2); out.walkRunning = g.run.running;
    g.keys.down.clear();
    return out;
  });
  assert.equal(r.runSpeed, 2.8);
  assert.ok(Math.abs(r.speed - 2.8) < 0.05, `running speed ${r.speed}`);
  assert.ok(Math.abs(r.ranFor - 5) < 0.1, `stamina lasted ${r.ranFor} s`);
  assert.ok(r.winded > 3.8, `out of breath ${r.winded} s`);
  assert.equal(r.raise, 3, 'whisper boundary +3 dB while out of breath');
  assert.equal(r.breathWhileWinded, 'ready', 'no holding your breath while out of breath');
  assert.equal(r.windedAfter4, 0); assert.equal(r.raiseAfter, 0);
  assert.ok(Math.abs(r.leftAfterWinded - 2) < 0.15, `stamina after 4 s: ${r.leftAfterWinded}`);
  assert.equal(r.fullAfter10, true, 'full again 10 s after running out');
  assert.equal(r.stats.runs, 1); assert.equal(r.stats.winded, 1);
  assert.ok(Math.abs(r.walk - 2.0) < 0.05 && !r.walkRunning, `walking with Space held once: ${r.walk} m/s`);
  for (const [d, stamina, refill, winded] of [['easy', 7, 7, 2], ['hard', 4, 12, 6]]) {
    const n = await page.evaluate(([d]) => {
      const g = window.__game;
      g.goHome(); g.newRound(); g.setDifficulty(d); g.playing = true;
      g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
      window.__runKeys(true);
      const t0 = g.simT;
      g.sim(1 / 72);
      while (g.run.running && g.simT - t0 < 10) g.sim(1 / 72);
      window.__runKeys(false);
      return { t: g.simT - t0, winded: g.run.winded, cfg: { stamina: g.CFG.sprint.stamina, refill: g.CFG.sprint.refill, winded: g.CFG.sprint.winded, radius: g.CFG.sprint.radius, points: g.CFG.alert.points.run } };
    }, [d]);
    assert.ok(Math.abs(n.t - stamina) < 0.1, `${d}: ran ${n.t} s`);
    assert.deepEqual([n.cfg.stamina, n.cfg.refill, n.cfg.winded], [stamina, refill, winded], d);
    assert.deepEqual([n.cfg.radius, n.cfg.points], d === 'easy' ? [10, 12] : [14, 20], d);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('running noise: a run step every 0.9 m, radius 12 m, 15 points, two orange rings (≤ 5 m); walking steps as before', async () => {
  const { ctx, page, errors } = await pcRound('medium');
  const r = await page.evaluate(() => {
    const g = window.__game;
    window.__guardAway();
    g.noise.log.length = 0;
    window.__runKeys(true); g.sim(2.2); window.__runKeys(false);
    const run = g.noise.log.filter((e) => e.source === 'player');
    const runs = run.filter((e) => e.kind === 'run');
    const gaps = runs.slice(1).map((e, i) => Math.hypot(e.x - runs[i].x, e.z - runs[i].z));
    // the rings of the last running step
    g.noise.clear(); g.noise.emit(0, 0, 12, 'run'); const rings = g.noise.ripples.map((x) => ({ r: x.r, t: x.t, c: x.color }));
    g.noise.clear();
    // walking: Space held once
    g.sim(12);   // stamina back
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    g.noise.log.length = 0;
    g.keys.down.add('KeyW'); g.keys.down.add('Space'); g.sim(2.2); g.keys.down.clear();
    const walk = g.noise.log.filter((e) => e.source === 'player');
    const wgaps = walk.slice(1).map((e, i) => Math.hypot(e.x - walk[i].x, e.z - walk[i].z));
    return { kinds: [...new Set(run.map((e) => e.kind))], radius: runs.map((e) => e.radius), gaps, rings, points: g.CFG.alert.points.run, walkKinds: [...new Set(walk.map((e) => e.kind))], walkRadius: walk.map((e) => e.radius), wgaps };
  });
  assert.ok(r.radius.length >= 4 && r.radius.every((x) => x === 12), `run steps: ${r.radius}`);
  assert.ok(r.gaps.every((x) => x > 0.85 && x < 1.0), `run stride: ${r.gaps.map((x) => x.toFixed(2))}`);
  assert.equal(r.points, 15);
  assert.equal(r.rings.length, 2, 'two rings');
  assert.ok(r.rings[0].r <= 5 && r.rings[1].r < r.rings[0].r && r.rings[1].t < 0 && r.rings.every((x) => x.c === 0xff7a1a), JSON.stringify(r.rings));
  assert.deepEqual(r.walkKinds, ['step']);
  assert.ok(r.walkRadius.slice(1).every((x) => Math.abs(x - 6) < 0.01) && r.walkRadius[0] > 5.5, `walking steps 6 m at 2.0 m/s: ${r.walkRadius}`);
  assert.ok(r.wgaps.every((x) => x > 0.65 && x < 0.8), `walking stride: ${r.wgaps.map((x) => x.toFixed(2))}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the guard and running: medium — at once «?», «Хто там бігає?!», search speed, follows the steps, 8 steps to full alarm; easy — like any noise; hard — the dash ×1.15 for 4 s, then 3 s at 2.0', async () => {
  const { ctx, page, errors } = await pcRound('medium', false);
  const r = await page.evaluate(() => {
    const g = window.__game, P = g.patrol, out = {};
    window.__guardAway();
    g.sim(0.1);
    // a running step 6 m from it, in the open (the corridor): heard at once
    P.x = 0; P.z = -6; P.state = 'task'; P.queue.length = 0; g.alert.reset(); P.runLineT = 0;
    g.noise.emit(5, -6, 12, 'run');
    out.state = P.state; out.follow = P.runFollow; out.goal = P.goal.slice();
    g.sim(0.6);
    out.speed = +P.speed.toFixed(2);
    // a fresh step elsewhere: it re-aims
    g.noise.emit(3, -6, 12, 'run'); g.sim(0.05);
    out.goal2 = P.goal.slice();
    // count heard running steps (3 a second) until the full alarm
    P.x = 0; P.z = -6; P.state = 'task'; P.queue.length = 0; g.alert.reset();
    let n = 0;
    while (!g.alert.full && n < 20) { g.noise.emit(2, -6, 12, 'run'); n++; g.sim(1 / 3); }
    out.stepsToAlarm = n;
    return out;
  });
  assert.equal(r.state, 'investigate', 'no 0.6 s pause: it goes to look at once');
  assert.equal(r.follow, true);
  assert.deepEqual(r.goal, [5, -6]);
  assert.ok(Math.abs(r.speed - 1.9) < 0.15, `goes at its search speed: ${r.speed}`);
  assert.deepEqual(r.goal2, [3, -6], 'follows the latest step');
  assert.equal(r.stepsToAlarm, 8, `heard running steps to full alarm: ${r.stepsToAlarm}`);
  // the line it says
  const said = await page.evaluate(() => { const g = window.__game, P = g.patrol; P.state = 'task'; P.runLineT = 0; g.alert.reset(); let s = null; const say = P.env.say; P.env.say = (t) => { s = t; say(t); }; g.noise.emit(P.x + 3, P.z, 12, 'run'); P.env.say = say; return s; });
  assert.equal(said, 'Хто там бігає?!');
  // easy: like any noise (react, then a slow look); the wrist says it hears running
  const easy = await page.evaluate(() => {
    const g = window.__game, P = g.patrol;
    g.goHome(); g.newRound(); g.setDifficulty('easy'); g.playing = true; g.sim(0.1);
    P.x = 0; P.z = -6; P.state = 'task'; P.queue.length = 0; g.alert.reset();
    g.noise.emit(3, -6, 12, 'run');
    return { state: P.state, activity: P.activity };
  });
  assert.equal(easy.state, 'react');
  assert.equal(easy.activity, 'чує, що хтось біжить');
  // hard: the dash
  const hard = await page.evaluate(() => {
    const g = window.__game, P = g.patrol, pl = g.player;
    g.goHome(); g.newRound(); g.setDifficulty('hard'); g.playing = true; g.sim(0.1);
    P.visible = true; pl.runSpeed = 2.8;
    const ks = [];
    for (let t = 0; t < 8; t += 0.1) ks.push(+P.dash(0.1, pl).toFixed(3));
    pl.runSpeed = 0; P.dashLeft = 4; P.dashWinded = 0;
    const walking = P.dash(0.1, pl);
    return { ks, walking, chase: g.CFG.patrol.chase };
  });
  const dash = hard.ks.filter((k) => k === 1.15).length, tired = hard.ks.filter((k) => Math.abs(k * hard.chase - 2.0) < 0.01).length;
  assert.ok(dash >= 39 && dash <= 41, `dash for ${dash / 10} s`);
  assert.ok(tired >= 29 && tired <= 31, `out of breath for ${tired / 10} s`);
  assert.equal(hard.walking, 1, 'no dash when you do not run');
  const medDash = await page.evaluate(() => { const g = window.__game; g.goHome(); g.newRound(); g.setDifficulty('medium'); g.sim(0.1); g.patrol.visible = true; g.player.runSpeed = 2.8; const k = g.patrol.dash(0.1, g.player); g.player.runSpeed = 0; return k; });
  assert.equal(medDash, 1, 'medium: no dash');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('running into doors: a closed door is shouldered open (loud, you keep running); a locked one = a knock and a stop', async () => {
  const { ctx, page, errors } = await pcRound('medium');
  const door = await page.evaluate(() => { const g = window.__game, d = g.level.doors.find((x) => !x.locked && !x.open); return { x: d.cx, z: d.cz, n: d.base, i: g.level.doors.indexOf(d) }; });
  await standFacing(page, door.x, door.z, 2.2, door.n);
  const r = await page.evaluate((i) => {
    const g = window.__game, d = g.level.doors[i];
    window.__guardAway();
    g.noise.log.length = 0;
    const p0 = { x: g.player.head.x, z: g.player.head.z };
    window.__runKeys(true);
    let maxDoor = 0; const sp = [];
    for (let t = 0; t < 1.6; t += 0.1) { g.sim(0.1); sp.push(+g.player.speed.toFixed(2)); }
    window.__runKeys(false);
    for (const e of g.noise.log) if (e.kind === 'door') maxDoor = Math.max(maxDoor, e.radius);
    return { open: d.open, bashes: g.runStats.bashes, maxDoor, moved: Math.hypot(g.player.head.x - p0.x, g.player.head.z - p0.z), sp };
  }, door.i);
  assert.equal(r.open, true, 'the door swung open');
  assert.equal(r.bashes, 1);
  assert.ok(r.maxDoor > 8.5, `loud: a creak of ${r.maxDoor.toFixed(1)} m`);
  assert.ok(r.moved > 3, `ran on through: ${r.moved.toFixed(1)} m (${r.sp})`);
  // the locked front door
  const front = await page.evaluate(() => { const g = window.__game, d = g.level.doors.find((x) => x.locked); return { x: d.cx, z: d.cz, n: d.base }; });
  await page.evaluate(() => { const g = window.__game; g.sim(12); });   // stamina back
  for (const side of [0, Math.PI]) {
    await standFacing(page, front.x, front.z, 2.0, front.n + side);
    const ok = await page.evaluate(() => { const g = window.__game; return !g.level.resolve || Math.hypot(...g.level.resolve(g.player.head.x, g.player.head.z, 0.22).map((v, i) => v - (i ? g.player.head.z : g.player.head.x))) < 0.01; });
    if (ok) break;
  }
  const k = await page.evaluate(() => {
    const g = window.__game;
    g.noise.log.length = 0;
    window.__runKeys(true);
    for (let t = 0; t < 1.5 && !g.runStats.knocks; t += 0.05) g.sim(0.05);
    const running = g.run.running;
    g.sim(0.5);
    const again = g.run.running;
    window.__runKeys(false);
    return { knocks: g.runStats.knocks, running, again, knock: g.noise.log.filter((e) => e.kind === 'door').map((e) => e.radius), speed: g.player.speed };
  });
  assert.equal(k.knocks, 1, 'a knock');
  assert.equal(k.running, false, 'and a stop');
  assert.equal(k.again, false, 'running needs a new wish after the knock');
  assert.ok(k.knock.includes(5), `the knock is heard 5 m: ${k.knock}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('running and the hands, crouching: light item ×1.3, the crystal slips after 1.5 s, two-handed = no running; running stands you up; crouching stops it', async () => {
  const { ctx, page, errors } = await pcRound('medium');
  const r = await page.evaluate(() => {
    const g = window.__game, H = g.hands, out = {};
    window.__guardAway();
    const take = (pred) => { const it = g.loot.items.find(pred); H.deskAim = it; H.toggleDesk(g.player.head, g.player.yaw, false); return it; };
    const putDown = () => { if (H.desk) H.toggleDesk(g.player.head, g.player.yaw, false); };
    // light: stamina x 1.3
    take((i) => !i.twoHanded && !i.crystal);
    window.__runKeys(true); g.sim(1); window.__runKeys(false);
    out.lightLeft = +g.run.left.toFixed(2);
    putDown(); g.sim(10);
    // the crystal vase
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    const cr = take((i) => i.crystal);
    window.__runKeys(true); g.sim(1.4); out.crystalAt14 = H.desk === cr;
    g.sim(0.2); out.crystalAt16 = H.desk === cr; out.slips = g.runStats.slips;
    window.__runKeys(false); g.sim(10);
    // two-handed
    g.player.teleport(0, 2, Math.PI / 2); g.sim(0.1);
    take((i) => i.twoHanded);
    window.__runKeys(true); g.sim(0.5); out.twoHanded = { running: g.run.running, blocked: g.runStats.carryBlocked, speed: +g.player.speed.toFixed(2) };
    window.__runKeys(false); putDown(); g.sim(0.2);
    // crouching: running stands you up
    g.player.virtualCrouch = true; g.sim(0.4);
    window.__runKeys(true); g.sim(0.3);
    out.stoodUp = !g.player.virtualCrouch && g.run.running;
    // C while running: crouching wins, and Space must be pressed again
    g.keys.pressed.add('KeyC'); g.sim(0.1);
    out.crouchStops = g.player.virtualCrouch && !g.run.running;
    g.sim(0.5); out.stillStopped = !g.run.running;
    window.__runKeys(false);
    return out;
  });
  assert.ok(Math.abs(r.lightLeft - (5 - 1.3)) < 0.1, `with a light item: ${r.lightLeft} s left after 1 s`);
  assert.equal(r.crystalAt14, true, 'the crystal holds for 1.4 s');
  assert.equal(r.crystalAt16, false, 'and slips out at 1.5 s');
  assert.equal(r.slips, 1);
  assert.equal(r.twoHanded.running, false, 'no running with a two-handed item');
  assert.equal(r.twoHanded.blocked, 1, '«З цим не побіжиш» once');
  assert.equal(r.stoodUp, true, 'running stands you up');
  assert.equal(r.crouchStops, true, 'crouching stops running');
  assert.equal(r.stillStopped, true, 'and it stays stopped until the keys are pressed again');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the three ways to switch it on ----------
const joyState = () => {
  const g = window.__game, t = g.touch, joy = document.querySelector('#touch .joy'), lock = document.querySelector('#touch .joy-lock');
  return { run: g.run.running, runSpeed: g.player.runSpeed, want: t.run, locked: t.locked, ghost: joy.classList.contains('ghost'), joyShown: !joy.hidden, red: joy.classList.contains('run'),
    lockShown: !lock.hidden, lock: t.lockPos, steps: document.querySelector('#hud .steps').textContent, arc: document.querySelector('#touch .joy-stamina').classList.contains('shown') };
};
async function finger(page, cdp, x0, y0, path, ms) {
  await tp(cdp, 'touchStart', [{ x: x0, y: y0 }]);
  for (const [dx, dy] of path) await tp(cdp, 'touchMove', [{ x: x0 + dx, y: y0 + dy }]);
  await keepFor(page, ms);
  return page.evaluate(joyState);
}
const lift = async (page, cdp) => { await tp(cdp, 'touchEnd'); await frames(page); };

test('phone: the joystick forward past its circle = running (after 0.15 s); inside the circle, sideways and back = not; the 🔒 = auto-run, the finger may go; a touch on the joystick side, crouching or the stamina running out end it', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, Math.PI / 2); g.patrol.x = -7.4; g.patrol.z = -10.4; });
  const x0 = 170, y0 = 250, up = (d) => [[0, -d / 3], [0, -2 * d / 3], [0, -d]];
  const inside = await finger(page, cdp, x0, y0, up(60), 500); await lift(page, cdp);
  assert.equal(inside.run, false, 'inside the circle: walking');
  const side = await finger(page, cdp, x0, y0, [[30, 0], [60, 0], [95, 0]], 500); await lift(page, cdp);
  assert.equal(side.want, false, 'sideways past the circle: no running');
  const back = await finger(page, cdp, x0, y0, [[0, 30], [0, 60], [0, 95]], 500); await lift(page, cdp);
  assert.equal(back.want, false, 'back: no running');
  const diag = await finger(page, cdp, x0, y0, [[30, -30], [60, -60], [70, -70]], 500); await lift(page, cdp);
  assert.equal(diag.want, false, '45° off forward: no running (the sector is ±35°)');
  const fwd = await finger(page, cdp, x0, y0, up(90), 600);
  assert.equal(fwd.want, true, 'forward past the circle: running');
  assert.equal(fwd.runSpeed, 2.8);
  assert.equal(fwd.red, true, 'the circle turns red');
  assert.equal(fwd.steps, 'Кроки: БІГ');
  assert.equal(fwd.lockShown, true, 'the 🔒 shows over the joystick');
  assert.ok(Math.abs(fwd.lock.x - x0) < 1 && Math.abs(fwd.lock.y - (y0 - 130)) < 1, `the 🔒 130 px up: ${JSON.stringify(fwd.lock)}`);
  // steering within ±50° keeps it going
  await tp(cdp, 'touchMove', [{ x: x0 + 60, y: y0 - 72 }]);   // ~40°
  await keepFor(page, 300);
  assert.equal((await page.evaluate(joyState)).want, true, 'steering to 40° keeps running');
  await lift(page, cdp);
  assert.equal((await page.evaluate(joyState)).run, false, 'finger lifted: stops');
  assert.equal(await page.evaluate(() => window.__game.feedback.last && window.__game.feedback.last.name), 'run', 'a vibration / flash when running starts');
  // the 🔒: auto-run
  await page.evaluate(() => { window.__game.run.left = 5; });
  const onLock = await finger(page, cdp, x0, y0, [...up(90), [0, -120], [0, -130]], 400);
  assert.equal(onLock.locked, true, 'the finger rests on the 🔒: locked');
  await lift(page, cdp);
  const ghost = await page.evaluate(joyState);
  assert.deepEqual([ghost.locked, ghost.run, ghost.ghost, ghost.joyShown, ghost.lockShown, ghost.arc], [true, true, true, true, true, true], `auto-run goes on, the joystick stays as a ghost with the arc: ${JSON.stringify(ghost)}`);
  const p0 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  await keepFor(page, 500);
  const p1 = await page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8, 'runs on with no finger');
  // a touch on the joystick side unlocks
  await tp(cdp, 'touchStart', [{ x: 120, y: 300 }]); await frames(page); await lift(page, cdp);
  const off = await page.evaluate(joyState);
  assert.deepEqual([off.locked, off.run, off.ghost], [false, false, false], 'a touch on the joystick side ends auto-run');
  // crouching ends it
  await page.evaluate(() => { window.__game.run.left = 5; });
  await finger(page, cdp, x0, y0, [...up(90), [0, -130]], 400); await lift(page, cdp);
  assert.equal((await page.evaluate(joyState)).locked, true);
  await fingerPressEl(page, cdp, '#touch .crouch');
  await keepFor(page, 200);
  const cr = await page.evaluate(() => ({ ...(() => { const t = window.__game.touch; return { locked: t.locked }; })(), run: window.__game.run.running, crouched: window.__game.player.virtualCrouch }));
  assert.deepEqual(cr, { locked: false, run: false, crouched: true }, '«Присісти» wins');
  await fingerPressEl(page, cdp, '#touch .crouch');
  // the stamina running out ends it
  await page.evaluate(() => { window.__game.run.left = 5; });
  await finger(page, cdp, x0, y0, [...up(90), [0, -130]], 400); await lift(page, cdp);
  await page.evaluate(() => { window.__game.run.left = 0.1; });
  await keepFor(page, 400);
  const out = await page.evaluate(joyState);
  assert.deepEqual([out.locked, out.run], [false, false], 'stamina out: auto-run off');
  assert.ok(/Захекався/.test(out.steps), `HUD: ${out.steps}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: the 🔒 stays on the screen (small phone 667 × 280, finger landing high or low) and takes no touches; the stamina arc on the joystick', async () => {
  const small = { ...LAND, viewport: { width: 667, height: 280 }, screen: { width: 667, height: 280 } };
  const { ctx, page, errors, cdp } = await playPhone(small);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, Math.PI / 2); });
  // a finger that lands very high: no room for a 🔒 at least 110 px away within ±35° — none this time, running still works
  const high = await finger(page, cdp, 140, 70, [[0, -30], [0, -60], [0, -90]], 300);
  await lift(page, cdp);
  assert.deepEqual([high.want, high.lockShown], [true, false], `landed at 70 px: ${JSON.stringify(high)}`);
  for (const y0 of [150, 200, 240]) {
    const s = await finger(page, cdp, 140, y0, [[0, -30], [0, -60], [0, -90]], 300);
    const box = await page.locator('#touch .joy-lock').boundingBox();
    const sz = box.width;
    const pe = await page.locator('#touch .joy-lock').evaluate((el) => getComputedStyle(el).pointerEvents);
    await lift(page, cdp);
    assert.ok(s.lockShown, `y0 ${y0}: shown`);
    assert.ok(box.y >= 28 - 1 && box.y + box.height <= 280 && box.x >= 0 && box.x + box.width <= 667, `y0 ${y0}: inside the screen ${JSON.stringify(box)}`);
    const d = Math.hypot(s.lock.x - 140, s.lock.y - y0), ang = Math.atan2(s.lock.x - 140, y0 - s.lock.y) * 180 / Math.PI;
    assert.ok(d >= 110 - 0.5 && ang >= -0.5 && ang <= 35.5, `y0 ${y0}: ${d.toFixed(0)} px at ${ang.toFixed(0)}° (still forward)`);
    assert.equal(pe, 'none', 'the 🔒 takes no touches (the joystick finger does the work)');
    assert.ok(Math.abs(sz - 44) < 1, `44 px: ${sz}`);
  }
  // the arc: the lower half of the joystick ring, while the stamina is not full
  await page.evaluate(() => { window.__game.run.left = 2.5; });
  const s = await finger(page, cdp, 140, 200, [[0, -20]], 200);
  const arc = await page.locator('#touch .joy-stamina').evaluate((el) => ({ s: el.style.getPropertyValue('--s'), shown: getComputedStyle(el).display !== 'none' }));
  await lift(page, cdp);
  assert.ok(s.arc && arc.shown && parseFloat(arc.s) > 0.45 && parseFloat(arc.s) < 0.7, `half the stamina (refilling): ${JSON.stringify(arc)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('PC: Space held = 2.0 as before; Space twice and held with W = 2.8; S / A / D alone = no running; let go = stop; the hint line says it', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  assert.match(await page.textContent('#hint'), /Space×2 біг/);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, Math.PI / 2); g.patrol.x = -7.4; g.patrol.z = -10.4; });
  await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
  await keepFor(page, 700);
  const walk = await page.evaluate(() => ({ s: window.__game.player.speed, run: window.__game.run.running }));
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space');
  assert.ok(walk.s > 1.8 && walk.s < 2.05 && !walk.run, `Space held once: ${walk.s.toFixed(2)} m/s, no running`);
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 2, Math.PI / 2); });
  const twice = () => page.evaluate(() => { for (const [t, c] of [['keydown', 'Space'], ['keyup', 'Space'], ['keydown', 'Space']]) window.dispatchEvent(new KeyboardEvent(t, { code: c, key: ' ' })); });
  await twice(); await page.keyboard.down('KeyW');
  await keepFor(page, 700);
  const run = await page.evaluate(() => ({ s: window.__game.player.speed, run: window.__game.run.running }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })));
  await keepFor(page, 200);
  const stop = await page.evaluate(() => window.__game.run.running);
  await page.keyboard.up('KeyW');
  assert.ok(run.run && run.s > 2.5, `Space twice + W: ${run.s.toFixed(2)} m/s`);
  assert.equal(stop, false, 'Space let go: stops');
  for (const key of ['KeyS', 'KeyA', 'KeyD']) {
    await twice(); await page.keyboard.down(key);
    await keepFor(page, 300);
    const r = await page.evaluate(() => window.__game.run.running);
    await page.keyboard.up(key); await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })));
    assert.equal(r, false, `${key}: no running`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('VR (IWER Quest 3): left stick pushed forward + stick press = running 2.8 until the stick comes back; vignette 0.55; X held 1 s = vignette, X tap = FPS; «Біг у VR» 2.4 / off', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, base);
  assert.equal(await page.isVisible('#vrrun'), true, 'the «Біг у VR» setting is on the start screen');
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const L = (fn, arg) => page.evaluate(fn, arg);
  await L(() => { const g = window.__game; g.patrol.x = -7.4; g.patrol.z = -10.4; });
  await L(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  await page.waitForTimeout(500);
  const walk = await L(() => ({ run: window.__game.run.running, s: window.__game.player.speed }));
  assert.equal(walk.run, false, 'pushing the stick alone: walking');
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 1));
  await page.waitForTimeout(150);
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 0));
  await page.waitForTimeout(700);
  const run = await L(() => ({ run: window.__game.run.running, rs: window.__game.player.runSpeed, s: window.__game.player.speed, vig: window.__game.comfort.intensity, k: window.__game.comfort.level.k }));
  assert.equal(run.run, true, 'stick press while pushed forward: running');
  assert.equal(run.rs, 2.8);
  await L(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -0.3));
  await page.waitForTimeout(300);
  assert.equal(await L(() => window.__game.run.running), false, 'the stick comes back: running ends');
  await L(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  // the vignette's cap while running (the comfort overlay's own target, at full level)
  const vig = await L(() => { const c = window.__game.comfort, lv = c.level; c.level = { ...lv, k: 1 }; c.intensity = 0; for (let i = 0; i < 60; i++) c.update(1 / 60, 2.8, true); const at28 = c.intensity; c.intensity = 0; for (let i = 0; i < 60; i++) c.update(1 / 60, 2.0, true); const at20 = c.intensity; c.level = lv; return { at28, at20 }; });
  assert.ok(Math.abs(vig.at28 - 0.55) < 0.01 && Math.abs(vig.at20 - 0.35) < 0.01, `vignette ${JSON.stringify(vig)}`);
  // X: a tap = FPS, held 1 s = the vignette level
  const lv0 = await L(() => window.__game.comfort.level.id);
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('x-button', 1));
  await keepFor(page, 1300);
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('x-button', 0));
  await page.waitForTimeout(200);
  const lv1 = await L(() => ({ id: window.__game.comfort.level.id, fps: window.__game.wrist.showFps }));
  assert.notEqual(lv1.id, lv0, 'X held 1 s: the vignette changes');
  assert.equal(lv1.fps, false, 'and the FPS read-out does not');
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('x-button', 1));
  await page.waitForTimeout(150);
  await L(() => window.__xrDevice.controllers.left.updateButtonValue('x-button', 0));
  await page.waitForTimeout(200);
  assert.equal(await L(() => window.__game.wrist.showFps), true, 'X tap: FPS as before');
  // «Біг у VR»: 2.4 / off
  for (const [id, speed] of [['slow', 2.4], ['off', 0]]) {
    await L((id) => { window.__game.run.left = 5; const sel = document.getElementById('vrrun'); sel.value = id; sel.dispatchEvent(new Event('change')); }, id);
    await L(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
    await page.waitForTimeout(300);
    await L(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 1));
    await page.waitForTimeout(150);
    await L(() => window.__xrDevice.controllers.left.updateButtonValue('thumbstick', 0));
    await page.waitForTimeout(500);
    const s = await L(() => ({ rs: window.__game.player.runSpeed, run: window.__game.run.running }));
    await L(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    await page.waitForTimeout(300);
    assert.equal(s.rs, speed, `«Біг у VR» ${id}: ${JSON.stringify(s)}`);
  }
  await L(() => window.__game.renderer.xr.getSession().end());
  assert.deepEqual(errors, []);
  await ctx.close();
});
