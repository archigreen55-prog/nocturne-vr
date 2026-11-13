// Stealth in the house (the «stealth-house» branch): crouching behind furniture really hides you from a
// guard on the other side of it; standing or crouching in the open does not.
import assert from 'node:assert/strict';
import { browser, open, test, preview, playPhone, fingerPressEl } from './runner.mjs';
import { newContext } from './harness.mjs';

const dacha = preview + '?map=dacha';

// Places the player (crouched or standing) and the AI guard (looking at the player), then asks the
// guard's own eyes (patrol.look, the check its detection meter uses) and the wrist read-out.
// cases: [{ name, player: [x, z], guard: [x, z], crouch }]
async function sightCases(page, cases) {
  return page.evaluate((cases) => {
    const g = window.__game, out = {};
    g.playing = true; g.sim(0.1);
    for (const c of cases) {
      g.player.virtualCrouch = !!c.crouch;
      g.player.teleport(c.player[0], c.player[1], 0);
      g.sim(0.6);   // the crouch eases down in 0.3 s
      const p = g.player.head, P = g.patrol;
      P.x = c.guard[0]; P.z = c.guard[1]; P.y = 0; P.headYaw = 0;
      P.heading = Math.atan2(-(p.x - P.x), -(p.z - P.z));   // looking straight at the player (the flashlight on them)
      const seen = P.look(g.player), st = g.stealthState(g.player, g.level, g.guards || P);
      out[c.name] = { visible: seen.visible, d: +seen.d.toFixed(2), range: +seen.range.toFixed(2), hidden: st.hidden, crouched: g.player.crouched, eyes: +p.y.toFixed(2) };
    }
    return out;
  }, cases);
}

test('stealth (crouch): crouched behind the sofa, the armchair, the crates the guard across does not see you (the wrist agrees); standing, in the open, past the end or with the guard on your side it does', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const r = await sightCases(page, [
    // the living-room sofa (z -10.4..-9.6, back 0.95 m): you north of it, the guard south of it, 1.5 m / 2 m / 2.5 m away
    { name: 'sofa15', player: [1.5, -10.7], guard: [1.5, -9.2], crouch: true },
    { name: 'sofa2', player: [1.5, -10.7], guard: [1.5, -8.7], crouch: true },
    { name: 'sofa2side', player: [0.6, -10.75], guard: [2.2, -8.6], crouch: true },
    // the library armchair (x -8.7..-7.7, 1.0 m): you west of it, the guard east, 2.5 m away
    { name: 'armchair', player: [-9.0, -11.3], guard: [-6.5, -11.3], crouch: true },
    // the pantry crates (1.25 m): you north of them, the guard south (this worked before too)
    { name: 'crates', player: [5.25, -4.5], guard: [5.25, -1.8], crouch: true },
    // standing behind the same sofa / armchair: seen
    { name: 'sofaStand', player: [1.5, -10.7], guard: [1.5, -8.7], crouch: false },
    { name: 'armchairStand', player: [-9.0, -11.3], guard: [-6.5, -11.3], crouch: false },
    // crouched on the open hall floor, nothing between: seen
    { name: 'open', player: [0.5, -1.5], guard: [0.5, -3.8], crouch: true },
    // crouched behind the sofa, the guard on YOUR side of it (it checks the hiding spot): seen
    { name: 'sameSide', player: [1.5, -10.7], guard: [1.5, -12.6], crouch: true },
    // crouched past the sofa's end (next to it, but it is not between you): seen
    { name: 'pastEnd', player: [-0.75, -10.7], guard: [-0.75, -8.7], crouch: true },
  ]);
  for (const k of ['sofa15', 'sofa2', 'sofa2side', 'armchair', 'crates']) {
    assert.equal(r[k].crouched, true, `${k}: crouched ${JSON.stringify(r[k])}`);
    assert.ok(r[k].d < r[k].range, `${k}: within its sight range, so only the cover can hide you ${JSON.stringify(r[k])}`);
    assert.equal(r[k].visible, false, `${k}: crouched behind cover the guard across does not see you ${JSON.stringify(r[k])}`);
    assert.equal(r[k].hidden, true, `${k}: the wrist says hidden ${JSON.stringify(r[k])}`);
  }
  for (const k of ['sofaStand', 'armchairStand', 'open', 'sameSide', 'pastEnd']) {
    assert.ok(r[k].d < r[k].range, `${k}: within its sight range ${JSON.stringify(r[k])}`);
    assert.equal(r[k].visible, true, `${k}: seen ${JSON.stringify(r[k])}`);
    assert.equal(r[k].hidden, false, `${k}: the wrist does not say hidden ${JSON.stringify(r[k])}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- the back window (the dacha) ----------
// standing inside the living room in front of the window (north wall z = -14, x = 4), facing it
const atWindow = (page, z = -13.35, yaw = 0) => page.evaluate(([z, yaw]) => {
  const g = window.__game; g.player.virtualCrouch = false; g.player.teleport(4.0, z, yaw); g.sim(0.4);
}, [z, yaw]);
const key = async (page, code, secs = 0.05) => { await page.keyboard.press(code); await page.evaluate((s) => window.__game.sim(s), secs); };

// the climb takes ~3.1 s with a shut sash (align, open, rise, carry, drop), ~2.2 s with an open one (claude/dacha-window)
const settle = async (page, max = 6) => {
  // the key press is taken on the next REAL frame (a slow machine: later): wait for the climb to begin (a refused press never does), then run it out
  await page.waitForFunction(async () => (await import('./src/systems/backWindow.js')).climbing(), null, { timeout: 3000 }).catch(() => {});
  return page.evaluate(async (max) => {
    const g = window.__game, bw = await import('./src/systems/backWindow.js');
    let t = 0; while (bw.climbing() && t < max) { g.sim(0.05); t += 0.05; }
    return +t.toFixed(2);
  }, max);
};

test('back window (PC): one window in the dacha\'s back wall; T opens it with a quiet creak, Q silently; E in front of it (shut or open) climbs through crouched in ~3 s, no walking meanwhile, and back; not with a big item, a small one goes along; the guard does not use it', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const info = await page.evaluate(() => {
    const g = window.__game, L = g.level, w = L.doors.filter((d) => d.window);
    g.playing = true; g.sim(0.1);
    for (const p of g.guards) p.update = () => null;   // the guard walks the living room while the test runs the climb in fast time and may catch the thief at the sash: his mind is off here (the guard's own use of the window is tested below by hand)
    window.__heard = []; g.noise.on((e) => window.__heard.push({ kind: e.kind, r: +e.radius.toFixed(2), x: +e.x.toFixed(1), z: +e.z.toFixed(1) }));
    return { windows: w.map((d) => [+d.cx.toFixed(2), +d.cz.toFixed(2), +d.y0.toFixed(2), d.locked, d.open]), doors: L.doors.length, room: L.roomAt(4, -13.3), behind: L.roomAt(4, -14.6) };
  });
  assert.deepEqual(info.windows, [[4, -14, 0.9, false, false]], 'one closed window in the north wall: ' + JSON.stringify(info));
  assert.equal(info.doors, 9 + 1, 'the house’s doors, the back window and the yard’s gate (world/yard.js)');
  assert.equal(info.room, 'Вітальня');

  // a quick swing (T): opens, a quiet creak (a door's quick swing is ~8 m)
  await atWindow(page);
  await key(page, 'KeyT', 1.0);
  const quick = await page.evaluate(() => { const w = window.__game.level.doors.find((d) => d.window); return { angle: +w.angle.toFixed(2), heard: window.__heard.splice(0) }; });
  assert.ok(Math.abs(quick.angle) > 1.5, `T opened it: ${JSON.stringify(quick)}`);
  const creak = quick.heard.filter((h) => h.kind === 'door');
  assert.equal(creak.length, 1, `one creak: ${JSON.stringify(quick.heard)}`);
  assert.ok(creak[0].r > 1 && creak[0].r < 5, `a quiet creak: ${creak[0].r} m`);
  // closed again slowly (Q): no creak
  await key(page, 'KeyQ', 3);
  const slow = await page.evaluate(() => { const w = window.__game.level.doors.find((d) => d.window); return { angle: +w.angle.toFixed(2), heard: window.__heard.splice(0) }; });
  assert.equal(slow.angle, 0, 'Q closed it');
  assert.deepEqual(slow.heard.filter((h) => h.kind === 'door'), [], 'slowly: silent');
  // shut: the button is there all the same (the zone, not the open sash)
  assert.equal(await page.evaluate(async () => (await import('./src/systems/backWindow.js')).climbLabel()), 'Лізти у вікно', 'a shut window: the button is there');

  // E at the shut window: the sash opens by itself (silent), you climb through, crouched; D (sideways) does nothing meanwhile
  const t0 = await page.evaluate(() => window.__game.simT);
  await page.keyboard.press('KeyE');
  await page.keyboard.down('KeyD');
  const climb = await page.evaluate(async () => {
    const g = window.__game, P = g.player, bw = await import('./src/systems/backWindow.js'), out = [];
    for (let i = 0; i < 40; i++) { g.sim(0.1); out.push({ t: +g.simT.toFixed(2), on: bw.climbing(), z: +P.head.z.toFixed(2), x: +P.head.x.toFixed(2), crouch: P.virtualCrouch }); }
    const w = g.level.doors.find((d) => d.window);
    return { out, heard: window.__heard.splice(0), angle: +w.angle.toFixed(2) };
  });
  await page.keyboard.up('KeyD');
  const on = climb.out.filter((s) => s.on), after = climb.out.filter((s) => !s.on);
  const ends = after.length ? after[0].t : Infinity, dur = ends - t0;
  assert.ok(on.length && on.every((s) => s.crouch), `climbing, crouched at once ${JSON.stringify(climb.out)}`);
  assert.ok(dur > 2.9 && dur < 3.5, `a shut window: ~3.1 s: ${dur.toFixed(2)}`);
  assert.ok(Math.abs(climb.angle) >= 1.1, `the sash opened itself: ${climb.angle}`);
  assert.deepEqual(climb.heard.filter((h) => h.kind === 'door'), [], 'opened slowly: no creak');
  assert.ok(on.every((s) => Math.abs(s.x - 4) < 0.7), `D held: no walking while climbing ${JSON.stringify(on.slice(-3))}`);
  assert.ok(after[0].z < -14.4, `outside behind the house: ${JSON.stringify(after[0])}`);
  assert.ok(after[after.length - 1].x > 4.15, `after the climb D walks again: ${JSON.stringify(after[after.length - 1])}`);
  assert.ok(after.every((s) => s.crouch), 'still crouched after the climb');
  assert.ok(!climb.heard.some((h) => h.kind === 'step' && h.z < -13), `crouched and slow: no steps while climbing ${JSON.stringify(climb.heard)}`);
  const behind = await page.evaluate(() => window.__game.level.roomAt(window.__game.player.head.x, window.__game.player.head.z));
  assert.equal(behind, info.behind, 'in the yard behind the house');

  // and back in (facing away from the house: any facing but the back to the window works; the sash is open now: ~2.2 s)
  await page.evaluate(() => { const g = window.__game; g.player.teleport(4.0, -14.6, Math.PI); g.sim(0.1); });
  await page.keyboard.press('KeyE');
  const back = await settle(page);
  assert.ok(back > 1.4 && back < 2.6, `an open window: ~2.2 s (less than the shut one’s 3.1; the real frames in between count): ${back}`);
  assert.ok(await page.evaluate(() => window.__game.player.head.z > -13.6), 'climbed back into the living room');

  // a big (two-handed) item: no; a small one: yes, it goes along
  const big = await page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((x) => x.twoHanded && !x.heavy && !x.prop);
    g.hands.desk = it; g.player.lookYaw = 0; g.player.virtualCrouch = false; g.sim(0.4);
    return it ? it.id : null;
  });
  assert.ok(big, 'the dacha has a two-handed item');
  await page.evaluate(() => { const g = window.__game; g.player.teleport(4.0, -13.35, 0); g.sim(0.1); });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => /великою/.test(window.__game.flashText), null, { timeout: 5000 }).catch(() => {});   // the message, before anything else can replace it
  const bigR = await page.evaluate(() => ({ z: +window.__game.player.head.z.toFixed(2), flash: window.__game.flashText, held: !!window.__game.hands.desk }));
  await settle(page);
  assert.ok(bigR.z > -14, `with a big item you stay inside: ${JSON.stringify(bigR)}`);
  assert.match(bigR.flash, /великою/, 'and it says why');
  assert.equal(bigR.held, true, 'the item is still in hands');
  const small = await page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((x) => x.takeable && !x.twoHanded && !x.throwable && !x.trap && !x.heavy && !x.prop);
    g.hands.desk = it; g.sim(0.1);
    return it.id;
  });
  await page.keyboard.press('KeyE'); await settle(page);
  const smallR = await page.evaluate(() => ({ z: +window.__game.player.head.z.toFixed(2), held: window.__game.hands.desk && window.__game.hands.desk.id, why: { flash: window.__game.flashText, active: window.__game.active, caughtT: window.__game.caughtT, phase: window.__game.round.phase, carrying: window.__game.hands.carrying } }));
  assert.ok(smallR.z < -14.4, `with a small item you climb out: ${JSON.stringify(smallR)}`);
  assert.equal(smallR.held, small, 'the small item went along');

  // the guard never opens the window on its way, even with its next point behind it
  const guard = await page.evaluate(() => {
    const g = window.__game, P = g.patrol, w = g.level.doors.find((d) => d.window);
    w.angle = w.target = 0; w.mesh.rotation.y = w.base; w.updateTip();
    P.x = 4.0; P.z = -13.3; P.y = 0; P.doorWait = 0;
    P.openDoors(4.0, -15);
    return { target: w.target, wait: P.doorWait };
  });
  assert.deepEqual(guard, { target: 0, wait: 0 }, 'the guard does not open the window');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window (phone): in the zone of the SHUT window the context button says «Лізти у вікно» at once; one finger press opens, climbs and crouches', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => { for (const p of window.__game.guards) p.update = () => null; });   // see the PC test: a guard in the living room may catch the climber
  await atWindow(page);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Лізти у вікно' && !document.querySelector('#touch .act').hidden, null, { timeout: 10000 });
  await fingerPressEl(page, cdp, '#touch .act', { holdMs: 120 });
  await settle(page, 8);
  const r = await page.evaluate(() => ({ z: +window.__game.player.head.z.toFixed(2), crouch: window.__game.player.virtualCrouch, open: Math.abs(window.__game.level.doors.find((d) => d.window).angle), why: { flash: window.__game.flashText, active: window.__game.active, paused: window.__game.paused, caughtT: window.__game.caughtT, phase: window.__game.round.phase } }));
  assert.ok(r.z < -14.4 && r.crouch && r.open > 1.0, `one press: the finger climbed out, crouched: ${JSON.stringify(r)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('back window (friends): the guest presses once — the host opens the sash for it, the guest climbs at once and the host sees it behind the house, rising over the sill, not through the wall', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, preview + '?map=dacha&net=local');
  const code = '314159';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, preview + `?map=dacha&net=local`);
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'rita'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; g.patrol.x = -8; g.patrol.z = -2; });
  const run = async (secs) => { for (let t = 0; t < secs; t += 0.1) { for (const p of pages) await p.evaluate(() => window.__game.sim(0.1)); await host.page.waitForTimeout(30); } };
  await run(0.6);
  // one press by the guest (no «Двері» first): the sash is shut, the guest is in its zone
  await guest.page.evaluate(() => { const g = window.__game; g.player.teleport(4.0, -13.35, 0); g.sim(0.2); });
  await guest.page.keyboard.press('KeyE');
  const ys = [];
  for (let t = 0; t < 3.6; t += 0.1) { for (const p of pages) await p.evaluate(() => window.__game.sim(0.1)); ys.push(await host.page.evaluate(() => { const r = window.__game.net.state().remotes[0]; return r ? [r.x, r.z] : null; })); await host.page.waitForTimeout(30); }
  const st = await Promise.all(pages.map((p) => p.evaluate(() => +window.__game.level.doors.find((d) => d.window).target.toFixed(2))));
  assert.ok(Math.abs(st[0]) >= 1.1, `the host opened the window for the guest: ${st}`);
  assert.equal(st[0], st[1], 'the guest shows the host’s window');
  const g = await guest.page.evaluate(() => +window.__game.player.head.z.toFixed(2));
  const seen = await host.page.evaluate(() => window.__game.net.state().remotes[0]);
  assert.ok(g < -14.4, `the guest climbed out: ${g}`);
  assert.ok(seen.z < -14.3, `the host sees the guest behind the house: ${JSON.stringify(seen)}`);
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});
