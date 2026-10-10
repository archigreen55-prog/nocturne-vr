// W2a: throwing and devices. The cans and bottles of both maps, the throw in three modes (VR: the
// hand's swing x1.3; phone: hold «Покласти» = aim, the finger turns the view, lift = throw, lift on
// the ✕ = not; PC: the left button / G held = aim, released = throw, the right button = not), what
// the guard does (comes to look, takes the can to the bin, sweeps the glass, «Ай!»), the devices
// (radio, the house phone from its second handset, the breaker and the dark) and the guard's «switch
// it off» with the suspicion of repeats; both maps.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, UA, open, test, base, preview, LAND, keepFor, frames, playPhone, fingerPressEl, standFacing, tp, touchT, touchEndAt } from './runner.mjs';

// A page in a round (the clock running) with the guard's own plans off unless `guard` is set.
async function round(url = base, { guard = false, ctxOpts, openAll = false } = {}) {
  const ctx = await newContext(browser, ctxOpts);
  if (openAll) await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
  const { page, errors } = await open(ctx, url);
  await page.evaluate((guard) => {
    const g = window.__game;
    g.newRound(); g.playing = true;
    if (!guard) for (const p of g.guards) p.update = () => null;
    for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);   // the hall (dacha): away from the van, the clock runs
  }, guard);
  return { ctx, page, errors };
}

test('W2a: the cans and bottles stand on both maps (not loot: not in the sum, never delivered); the devices are there', async () => {
  const runs = {};
  for (const [name, url] of [['dacha', base], ['mansion', preview + '?map=mansion']]) {
    const ctx = await newContext(browser);
    await ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* opaque */ } });
    const { page, errors } = await open(ctx, url);
    runs[name] = await page.evaluate(() => {
      const g = window.__game, T = g.loot.items.filter((i) => i.throwable);
      g.sim(1);
      return {
        id: g.level.id, n: T.length, kinds: T.map((i) => i.kind), still: T.every((i) => i.state === 'rest'),
        total: g.loot.tally().total, devices: g.devices.list.map((d) => d.id),
        floating: T.filter((i) => Math.abs(g.level.surfaceAt(i.mesh.position.x, i.mesh.position.z, i.mesh.position.y + 0.05) - i.mesh.position.y) > 0.03).map((i) => i.id),
      };
    });
    runs[name].errors = errors;
    await ctx.close();
  }
  assert.equal(runs.dacha.n, 6); assert.equal(runs.mansion.n, 8);
  assert.deepEqual(runs.dacha.floating, [], 'every dacha can / bottle stands on something');
  assert.deepEqual(runs.mansion.floating, [], 'every mansion can / bottle stands on something');
  assert.equal(runs.dacha.total, 8, 'the loot count is the 8 items, not the cans');
  assert.deepEqual(runs.dacha.devices, ['radio', 'phone', 'handset', 'breaker']);
  assert.deepEqual(runs.mansion.devices, ['radio', 'radio2', 'phone', 'handset', 'breaker']);
  assert.deepEqual(runs.dacha.errors, []); assert.deepEqual(runs.mansion.errors, []);
});

// The PC page in a round at (x, z) looking along yaw / pitch, holding the item `id` (as if picked up with E).
async function pcHolding(page, id, x, z, yaw, pitch) {
  await page.evaluate(([id, x, z, yaw, pitch]) => {
    const g = window.__game, it = g.loot.items.find((i) => i.id === id);
    g.player.teleport(x, z, yaw); g.player.lookYaw = yaw; g.player.lookPitch = pitch; g.sim(0.05);
    g.hands.deskAim = it; g.hands.toggleDesk(g.player.head, g.player.yaw, false);
  }, [id, x, z, yaw, pitch]);
}
const sayLog = (page) => page.evaluate(() => { window.__said = []; for (const p of window.__game.guards) { const s = p.env.say; p.env.say = (t) => { window.__said.push(t); s(t); }; } });

test('PC: G held = aim (an arc and a ring where it lands), let go = throw; the left mouse button the same, the right one = not; a can clatters where it lands; the guard comes to look, «Хто тут кидається?!», takes it to the kitchen bin', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, base);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.playing);
  await page.evaluate(() => {
    const g = window.__game;
    for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3);                     // the clock runs
    const p = g.patrol; p.reset(); p.x = 4; p.z = -6; p.queue.push({ type: 'wait', t: 999, label: 'test' });
  });
  await sayLog(page);
  // the left button with the mouse captured: aim, then the right one: not thrown
  await pcHolding(page, 'can2', 0, -3, 0, -0.3);
  await page.evaluate(() => {
    const c = window.__game.renderer.domElement;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    c.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  });
  await keepFor(page, 300);
  const arc = await page.evaluate(() => { const a = window.__game.scene.getObjectByName('throw arc'); return { on: a.visible, ring: a.children[1].position.toArray().map((v) => +v.toFixed(2)) }; });
  await page.evaluate(() => { const c = window.__game.renderer.domElement; c.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); dispatchEvent(new MouseEvent('mouseup', { button: 0 })); });
  await keepFor(page, 200);
  const kept = await page.evaluate(() => ({ held: window.__game.hands.desk && window.__game.hands.desk.id, arc: window.__game.scene.getObjectByName('throw arc').visible }));
  // G: aim, let go: thrown
  await page.keyboard.down('KeyG'); await keepFor(page, 300);
  await page.keyboard.up('KeyG'); await keepFor(page, 1200);
  const landed = await page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((i) => i.id === 'can2');
    return { held: !!g.hands.desk, state: it.state, at: it.mesh.position.toArray().map((v) => +v.toFixed(2)), noise: g.noise.log.filter((e) => e.kind === 'can').map((e) => e.radius), guard: g.patrol.state };
  });
  assert.equal(arc.on, true, 'the arc shows while aiming');
  assert.ok(arc.ring[2] < -5 && arc.ring[2] > -8, `the ring is ahead in the corridor: ${arc.ring}`);
  assert.deepEqual(kept, { held: 'can2', arc: false }, 'the right button: still in hand, no arc');
  assert.equal(landed.held, false); assert.equal(landed.state, 'rest');
  assert.ok(Math.abs(landed.at[2] - arc.ring[2]) < 0.8, `it lands where the ring was: ${landed.at} vs ${arc.ring}`);
  assert.ok(landed.noise.length >= 1 && landed.noise[0] > 4, `a can noise: ${landed.noise}`);
  // the guard: comes, looks, takes it to the bin (the thief has slipped out to the yard)
  const after = await page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((i) => i.id === 'can2'), out = { seen: [] };
    g.player.teleport(6, 4, 0);
    for (let t = 0; t < 60 && !it.gone; t += 0.5) { g.sim(0.5); if (it.carrier) out.carried = true; out.seen.push(g.patrol.state); }
    return { ...out, gone: it.gone, visible: it.mesh.visible, at: [+g.patrol.x.toFixed(1), +g.patrol.z.toFixed(1)], said: window.__said, susp: g.alert.suspicion };
  });
  assert.equal(after.carried, true, 'it carried the can');
  assert.equal(after.gone, true, `the can is in the bin: ${JSON.stringify(after)}`);
  assert.equal(after.visible, false);
  assert.ok(Math.hypot(after.at[0] + 7.9, after.at[1] + 1.6) < 1.5, `by the kitchen bin: ${after.at}`);
  assert.ok(after.said.includes('Хто тут кидається?!'), `said: ${after.said}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('throwing, the rules: a bottle breaks (glass, 10 m), the guard sweeps it up; a second can makes it angrier (hard: it checks hiding spots too); loot thrown far is damaged («пошкоджено при кидку»), the crystal breaks, a soft lob into the van counts; a can on the head: «Ай!»; VR: the hand\'s speed x1.3 up to 9 m/s', async () => {
  const { ctx, page, errors } = await round(base, { guard: true });
  await sayLog(page);
  const r = await page.evaluate(async () => {
    const g = window.__game, V = g.THREE.Vector3, P = g.patrol, find = (id) => g.loot.items.find((i) => i.id === id), out = {};
    const park = (x, z) => { P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.x = x; P.z = z; P.queue.push({ type: 'wait', t: 999, label: 'test' }); };   // its memory (cans found) stays
    const toss = (it, x, y, z, v) => { it.mesh.position.set(x, y, z); it.thrown = true; it.thrownFrom = { x: x + 3, y, z }; it.drop(new V(...v)); };
    const until = (fn, s = 60) => { for (let t = 0; t < s && !fn(); t += 0.25) g.sim(0.25); return fn(); };
    g.player.teleport(6, 4, 0);                                    // the thief waits in the yard
    // a bottle into the corridor, the guard nearby
    park(-3, -6);
    const b = find('bottle2');
    toss(b, -1, 1.5, -6, [0, -2, 0]); g.sim(0.8);
    out.bottle = { broken: b.broken, shards: b.shards.visible, noise: g.noise.log.filter((e) => e.kind === 'glass').map((e) => e.radius) };
    out.swept = until(() => b.gone); out.shardsAfter = b.shards.visible;
    // two cans in a row on hard: the second one — «Знову банка?!» and hiding spots after it
    g.newRound(); g.setDifficulty('hard'); g.playing = true; for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3); g.player.teleport(6, 4, 0);
    window.__said.length = 0;
    for (const id of ['can1', 'can2']) {
      park(-3, -6);
      const c = find(id); toss(c, -1.5, 1.2, -6, [0.5, 0, 0]); g.sim(0.4);
      until(() => c.carrier || c.gone, 40);
      if (id === 'can2') out.spotsAfter = P.queue.some((st) => st.search && st.type === 'walk' && !st.item);
      until(() => c.gone, 60);
      out[id] = c.gone;
    }
    out.found = P.brain.cansFound; out.said = window.__said.slice();
    // loot thrown far: damaged with its own message; the crystal: broken; a soft lob into the van counts
    park(-7.4, -10.4);
    const st = find('statuette'); toss(st, 0, 1.4, -6, [6, 3, 0]); g.sim(2);
    out.loot = { damaged: st.damaged, msg: g.flashText };
    const cr = find('crystal'); toss(cr, 0, 1.4, -6, [3, 1, 0]); g.sim(2); out.crystal = cr.broken;
    const C = g.level.cargo || { minX: 0, maxX: 0, minZ: 0, maxZ: 0, y: 0 };
    const jb = find('jewelbox'); toss(jb, (C.minX + C.maxX) / 2, 1.2, (C.minZ + C.maxZ) / 2, [0, 0.5, 0]); g.sim(1.5);
    out.lob = { delivered: jb.delivered, damaged: jb.damaged };
    // a can on the guard's head
    park(-3, -6); window.__said.length = 0;
    const c3 = find('can3'); toss(c3, -3, 2.6, -6, [0, 0, 0]); g.sim(0.5);
    out.ouch = { said: window.__said.slice(), state: P.state, hit: c3.hitGuard };
    // VR: the hand's speed x1.3, up to 9 m/s; two-handed items only drop (6 m/s at most)
    const c4 = find('can4'); g.hands.dropItem(c4, new V(3, 1, 0)); out.vr = c4.vel.toArray().map((v) => +v.toFixed(2)); out.vrThrown = c4.thrown;
    const c5 = find('can1'); g.hands.dropItem(c5, new V(20, 0, 0)); out.vrMax = +c5.vel.length().toFixed(2);
    const ch = find('chest'); g.hands.dropItem(ch, new V(10, 0, 0)); out.two = +ch.vel.length().toFixed(2);
    return out;
  });
  assert.deepEqual(r.bottle, { broken: true, shards: true, noise: [10] }, `the bottle: ${JSON.stringify(r.bottle)}`);
  assert.equal(r.swept, true, 'the guard swept the glass up'); assert.equal(r.shardsAfter, false);
  assert.equal(r.can1, true); assert.equal(r.can2, true); assert.equal(r.found, 2);
  assert.ok(r.said.includes('Хто тут кидається?!') && r.said.includes('Знову банка?! Ну я тобі…'), `said: ${r.said}`);
  assert.equal(r.spotsAfter, true, 'hard: after the second can it checks hiding spots');
  assert.equal(r.loot.damaged, true); assert.match(r.loot.msg, /пошкоджено при кидку/);
  assert.equal(r.crystal, true, 'the thrown crystal breaks');
  assert.deepEqual(r.lob, { delivered: true, damaged: false }, 'a soft lob into the van counts');
  assert.ok(r.ouch.hit && r.ouch.said.includes('Ай! Хто це кидається?!'), `«Ай!»: ${JSON.stringify(r.ouch)}`);
  assert.ok(['react', 'investigate'].includes(r.ouch.state), 'it turns to look where it came from');
  assert.deepEqual(r.vr, [3.9, 1.3, 0]); assert.equal(r.vrThrown, true);
  assert.equal(r.vrMax, 9); assert.equal(r.two, 6);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('devices (dacha): the radio — the guard goes, dances, switches it off, back to its plans; again: +30 and an angrier line; the third time it unplugs it; the handset rings the hall phone 3 s later, «Алло?» 12 s hearing x0.5, «Лінія зайнята»; the breaker: the lights out (the fireplace stays), no lit spots, the guard flips it back; easy x0.5; it leaves its tea, not a chase', async () => {
  const { ctx, page, errors } = await round(base, { guard: true });
  await sayLog(page);
  const r = await page.evaluate(async () => {
    const g = window.__game, P = g.patrol, D = g.devices, out = {};
    const { useDevice } = await import('./src/systems/distract.js'), { power } = await import('./src/world/devices.js'), { nearLamp } = await import('./src/game/stealth.js');
    const park = (x, z) => { P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.x = x; P.z = z; P.queue.push({ type: 'wait', t: 999, label: 'test' }); };
    const until = (fn, s = 60) => { for (let t = 0; t < s && !fn(); t += 0.25) g.sim(0.25); return fn(); };
    g.player.teleport(6, 4, 0);
    const radio = D.byId('radio'), phone = D.byId('phone'), hs = D.byId('handset'), br = D.byId('breaker');
    // the radio, three times
    out.radio = [];
    for (let i = 0; i < 3; i++) {
      park(-6, -6.2); window.__said.length = 0;
      const s0 = g.alert.suspicion;
      useDevice(radio); g.sim(0.3);
      const took = { claimed: radio.claimed === P, label: P.queue[0] && P.queue[0].label, susp: +(g.alert.suspicion - s0).toFixed(1) };
      const off = until(() => !radio.on && !radio.claimed, 40);
      const back = until(() => !P.queue.some((st) => st.dev), 10);   // it looks around, then its own plans again
      out.radio.push({ ...took, off, said: window.__said.slice(), dead: radio.dead, back });
    }
    useDevice(radio); out.deadOn = { on: radio.on, msg: g.flashText };
    // the phone: from the bedroom handset; the guard in the hall answers; meanwhile the line is busy
    park(0, -3); window.__said.length = 0;
    useDevice(hs); g.sim(1);
    out.ringingAt1 = phone.ringing; g.sim(2.3); out.ringingAt33 = phone.ringing;
    until(() => phone.talking, 20);
    out.talking = { talking: phone.talking, hearK: P.mods && P.mods.hearK };
    useDevice(hs); out.busy = g.flashText;
    until(() => !phone.talking && !phone.claimed, 30);
    out.phoneSaid = window.__said.slice();
    // the breaker
    park(6, -6); window.__said.length = 0;
    const lamp0 = nearLamp(0.6, 5.6);
    useDevice(br); g.sim(0.5); out.flicker = power.flicker > 0 && power.on;
    g.sim(0.8);
    out.dark = { on: power.on, lamp: nearLamp(0.6, 5.6), lamp0, pts: g.points.map((p) => +p.intensity.toFixed(2)), claimed: br.claimed === P };
    until(() => power.on, 60);
    out.light = { on: power.on, said: window.__said.slice(), pts: g.points.map((p) => p.intensity > 0) };
    // easy: half the suspicion; it leaves its tea; not a chase
    g.newRound(); g.setDifficulty('easy'); g.playing = true; for (const l of g.lurkers) l.update = () => {};
    g.player.teleport(0, -2.5, 0); g.sim(0.3); g.player.teleport(6, 4, 0);
    park(-6, -6.2);
    P.queue.length = 0; P.brain.queueHabit({ id: 'tea', ...g.CFG.guard.habits.tea, dur: 35 }); P.queue[0].started = false;
    g.sim(0.5);
    const s1 = g.alert.suspicion; useDevice(radio); g.sim(0.3);
    out.easy = { susp: +(g.alert.suspicion - s1).toFixed(1), leftTea: radio.claimed === P };
    radio.on = false; radio.claimed = null; P.queue.length = 0;
    P.state = 'chase'; useDevice(radio); g.sim(0.5); out.chase = radio.claimed === null; P.state = 'task';
    return out;
  });
  const [a, b, c] = r.radio;
  assert.ok(a.claimed && /вимикати радіо/.test(a.label), `the guard goes: ${JSON.stringify(a)}`);
  const near = (v, want) => Math.abs(v - want) < 1.6;   // minus the decay of the 0.3 s simulated
  assert.ok(near(a.susp, 10), `+10: ${a.susp}`); assert.equal(a.off, true); assert.equal(a.back, true);
  assert.ok(a.said.includes('Хто це ввімкнув?.. Піду вимкну') && a.said.includes('Ну й музика… тра-ля-ля'), `said: ${a.said}`);
  assert.ok(near(b.susp, 30), `+30: ${b.susp}`); assert.ok(b.said.includes('Знову це радіо?! Та хто ж його крутить…'));
  assert.equal(c.dead, true); assert.ok(c.said.includes('Все, висмикую шнур!'), `third: ${JSON.stringify(c)}`);
  assert.equal(r.deadOn.on, false); assert.match(r.deadOn.msg, /Шнур висмикнуто/);
  assert.equal(r.ringingAt1, false); assert.equal(r.ringingAt33, true, 'the hall phone rings 3 s after the handset');
  assert.deepEqual(r.talking, { talking: true, hearK: 0.5 });
  assert.equal(r.busy, 'Лінія зайнята');
  assert.ok(r.phoneSaid.includes('Алло? Алло?! Хто це?') && r.phoneSaid.includes('Знову ці опитування…'), `phone: ${r.phoneSaid}`);
  assert.equal(r.flicker, true, 'the lights flicker first');
  assert.equal(r.dark.on, false); assert.equal(r.dark.lamp0, true); assert.equal(r.dark.lamp, false, 'no lit spot while dark');
  assert.ok(r.dark.pts[0] === 0 && r.dark.pts[2] === 0 && r.dark.pts[1] > 0, `the lights (the embers stay): ${r.dark.pts}`);
  assert.equal(r.dark.claimed, true);
  assert.equal(r.light.on, true); assert.ok(r.light.said.includes('Ой! Хто вимкнув світло?!'), `breaker: ${r.light.said}`);
  assert.ok(near(r.easy.susp, 5) && r.easy.leftTea, `easy: ${JSON.stringify(r.easy)}`);
  assert.equal(r.chase, true, 'in a chase it ignores the radio');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('devices (mansion): the radio upstairs (the music room) — Zhora goes; the kitchen radio — Valera; the breaker in the boiler room — the guard downstairs flips it, the other one asks over the radio', async () => {
  const { ctx, page, errors } = await round(preview + '?map=mansion', { guard: true, openAll: true });
  await sayLog(page);
  const r = await page.evaluate(async () => {
    const g = window.__game, D = g.devices, [V, Z] = [g.patrol, g.patrol2], out = { id: g.level.id };
    const { useDevice } = await import('./src/systems/distract.js'), { power } = await import('./src/world/devices.js');
    const park = (P, x, z, f) => { P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.x = x; P.z = z; P.y = f ? 3 : 0; P.queue.push({ type: 'wait', t: 999, label: 'test' }); };
    const until = (fn, s = 60) => { for (let t = 0; t < s && !fn(); t += 0.25) g.sim(0.25); return fn(); };
    g.player.teleport(18, -6, 0); g.sim(0.3);   // the thief in the alley, the clock runs
    park(V, 0, -8.5, 0); park(Z, 4, -8.5, 1);
    const r2 = D.byId('radio2'); useDevice(r2); g.sim(0.5);
    out.upstairs = { zhora: r2.claimed === Z, valera: r2.claimed === V };
    out.upOff = until(() => !r2.on, 60);
    park(V, 8, -14, 0); park(Z, -10.3, -9, 1);
    const r1 = D.byId('radio'); useDevice(r1); g.sim(0.5);
    out.kitchen = { valera: r1.claimed === V }; out.kitchenOff = until(() => !r1.on, 60);
    park(V, 0, -8.5, 0); park(Z, 4, -8.5, 1); window.__said.length = 0;
    const br = D.byId('breaker'); useDevice(br); g.sim(1.5);
    out.dark = { on: power.on, valera: br.claimed === V };
    out.light = until(() => power.on, 60); out.said = window.__said.slice();
    return out;
  });
  assert.equal(r.id, 'mansion');
  assert.deepEqual(r.upstairs, { zhora: true, valera: false }, 'the radio upstairs: Zhora');
  assert.equal(r.upOff, true);
  assert.deepEqual(r.kitchen, { valera: true }); assert.equal(r.kitchenOff, true);
  assert.deepEqual(r.dark, { on: false, valera: true });
  assert.equal(r.light, true);
  assert.ok(r.said.some((t) => /Хто вимкнув світло/.test(t)) && r.said.some((t) => /Що там зі світлом/.test(t)), `said: ${r.said}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: «Покласти» pressed normally puts the can down; held 0.6 s = aim (the arc, the ✕), the finger turns the view, lift = throw; lift on the ✕ = not; facing a device the button says «Радіо» / «Щиток» / «Подзвонити» and uses it; a small phone fits the ✕', async () => {
  const { ctx, page, errors, cdp } = await playPhone();
  await page.evaluate(() => { const g = window.__game; for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {}; g.player.teleport(0, -2.5, 0); });
  await keepFor(page, 300);
  const hold = async (id) => page.evaluate((id) => {
    const g = window.__game, it = g.loot.items.find((i) => i.id === id);
    g.player.teleport(0, -3, 0); g.player.lookYaw = 0; g.player.lookPitch = -0.3;
    g.hands.deskAim = it; g.hands.toggleDesk(g.player.head, g.player.yaw, false);
  }, id);
  const act = async () => { const b = await page.locator('#touch .act').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // a normal press puts it down
  await hold('can1'); await keepFor(page, 200);
  await fingerPressEl(page, cdp, '#touch .act');
  await keepFor(page, 300);
  const put = await page.evaluate(() => ({ held: !!window.__game.hands.desk, thrown: window.__game.loot.items.find((i) => i.id === 'can1').thrown }));
  // held: aim; the finger slides 40 px right = the view turns; lift = thrown
  await hold('can2'); await keepFor(page, 200);
  const p = await act(), t = touchT();
  await tp(cdp, 'touchStart', [p], t);
  await keepFor(page, 800);
  const aim = await page.evaluate(() => ({ x: !document.querySelector('#touch .throw-x').hidden, arc: window.__game.scene.getObjectByName('throw arc').visible, yaw: window.__game.player.yaw }));
  await tp(cdp, 'touchMove', [{ x: p.x + 40, y: p.y }], t + 0.9);
  await keepFor(page, 200);
  const yaw2 = await page.evaluate(() => window.__game.player.yaw);
  await tp(cdp, 'touchEnd', [], (touchEndAt(t + 1.1)));
  await keepFor(page, 300);
  const thrown = await page.evaluate(() => ({ held: !!window.__game.hands.desk, state: window.__game.loot.items.find((i) => i.id === 'can2').state, x: !document.querySelector('#touch .throw-x').hidden }));
  // held, then lifted on the ✕: still in hand
  await hold('can3'); await keepFor(page, 200);
  const p3 = await act(), t3 = touchT();
  await tp(cdp, 'touchStart', [p3], t3);
  await keepFor(page, 800);
  const xb = await page.locator('#touch .throw-x').boundingBox(), xp = { x: xb.x + xb.width / 2, y: xb.y + xb.height / 2 };
  await tp(cdp, 'touchMove', [xp], t3 + 0.9);
  await tp(cdp, 'touchEnd', [], touchEndAt(t3 + 1.0));
  await keepFor(page, 300);
  const kept = await page.evaluate(() => ({ held: window.__game.hands.desk && window.__game.hands.desk.id, arc: window.__game.scene.getObjectByName('throw arc').visible }));
  await page.evaluate(() => { const g = window.__game; g.hands.toggleDesk(g.player.head, g.player.yaw, false); });
  // a device in front: the button's label; a press uses it
  await standFacing(page, -8.0, -4.55, 1.0, 0);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Радіо' && !document.querySelector('#touch .act').hidden, null, { timeout: 5000 });
  await fingerPressEl(page, cdp, '#touch .act');
  await page.waitForFunction(() => window.__game.devices.byId('radio').on, null, { timeout: 5000 });
  await standFacing(page, 8.2, -4.91, 1.0, 0);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Щиток', null, { timeout: 5000 });
  await standFacing(page, 6.25, -13.6, 0.9, 0);
  await page.waitForFunction(() => document.querySelector('#touch .act').textContent === 'Подзвонити', null, { timeout: 5000 });
  assert.deepEqual(put, { held: false, thrown: false }, `a normal press puts it down: ${JSON.stringify(put)}`);
  assert.equal(aim.x, true); assert.equal(aim.arc, true);
  assert.ok(Math.abs(yaw2 - aim.yaw) > 0.1, `the aiming finger turns the view: ${aim.yaw} -> ${yaw2}`);
  assert.deepEqual(thrown, { held: false, state: 'fall', x: false }, `lifted: thrown ${JSON.stringify(thrown)}`);
  assert.deepEqual(kept, { held: 'can3', arc: false }, 'lifted on the ✕: still in hand');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a small phone (667 x 280): the ✕ is on the screen, clear of the other buttons
  const s = await playPhone({ ...LAND, viewport: { width: 667, height: 280 }, screen: { width: 667, height: 280 } });
  const boxes = await s.page.evaluate(() => {
    document.querySelector('#touch .throw-x').hidden = false;
    const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    return { x: r('#touch .throw-x'), pause: r('#touch .pause'), door: r('#touch .door'), act: r('#touch .act'), crouch: r('#touch .crouch') };
  });
  const over = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  assert.ok(boxes.x[1] >= 0 && boxes.x[3] <= 280 && boxes.x[0] >= 0 && boxes.x[2] <= 667, `the ✕ on screen: ${boxes.x}`);
  for (const k of ['pause', 'act', 'crouch']) assert.ok(!over(boxes.x, boxes[k]), `the ✕ clear of ${k}: ${JSON.stringify(boxes)}`);
  await s.ctx.close();
});

test('VR (IWER Quest 3): grip a can, swing the hand forward and let go — it flies (x1.3 of the hand); the trigger at the radio switches it on (doors by the trigger: the VR tests as before)', async () => {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./harness.mjs');
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const { page, errors } = await open(ctx, base);
  await page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await page.click('#vrbutton');
  await page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await page.evaluate(() => { const g = window.__game; for (const p of g.guards) p.update = () => null; for (const l of g.lurkers) l.update = () => {}; g.player.teleport(-5.5, -1.6, Math.PI); });
  await page.waitForTimeout(600);
  // the right hand onto can1, squeeze, swing 1 m forward in 0.25 s, let go
  const thrown = await page.evaluate(async () => {
    const g = window.__game, it = g.loot.items.find((i) => i.id === 'can1'), c = window.__xrDevice.controllers.right;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const local = g.player.rig.worldToLocal(it.mesh.getWorldPosition(new g.THREE.Vector3()).add(new g.THREE.Vector3(0, 0.06, 0)));
    c.position.set(local.x, local.y, local.z); await wait(300);
    c.updateButtonValue('squeeze', 1); await wait(300);
    const held = g.hands.heldItems().map((i) => i.id);
    // the emulator's frames are slow: the swing is one jump of the hand between two XR frames, and the
    // grip opens in the next frame (as a real throw: the hand still moving fast when it lets go)
    const s = g.renderer.xr.getSession(), frame = () => new Promise((r) => s.requestAnimationFrame(() => r()));
    c.position.set(local.x, local.y + 0.2, local.z + 0.4); await frame(); await frame();   // wind up, back
    c.position.set(local.x, local.y + 0.3, local.z - 0.2); c.updateButtonValue('squeeze', 0); await frame();   // the hand flies forward and opens
    const handV = g.hands.h.right.vel.length();
    await frame();
    const v = it.vel.length(), from = it.mesh.position.clone();
    await wait(1500);
    return { held, v: +v.toFixed(2), handV: +handV.toFixed(2), thrown: it.thrown, dist: +Math.hypot(it.mesh.position.x - from.x, it.mesh.position.z - from.z).toFixed(2), state: it.state };
  });
  // the trigger at the radio
  const radio = await page.evaluate(async () => {
    const g = window.__game, d = g.devices.byId('radio'), c = window.__xrDevice.controllers.left;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.player.teleport(-8.0, -3.6, 0); await wait(300);
    const local = g.player.rig.worldToLocal(new g.THREE.Vector3(d.x, d.y + 0.1, d.z));
    c.position.set(local.x, local.y, local.z); await wait(300);
    c.updateButtonValue('trigger', 1); await wait(150); c.updateButtonValue('trigger', 0); await wait(150);
    return { on: d.on, phase: g.round.phase };
  });
  assert.deepEqual(thrown.held, ['can1'], `grabbed: ${JSON.stringify(thrown)}`);
  assert.equal(thrown.thrown, true, `a throw: ${JSON.stringify(thrown)}`);
  assert.ok(thrown.v > 2.5, `it left the hand fast: ${JSON.stringify(thrown)}`);
  assert.ok(thrown.dist > 0.8, `it flew: ${JSON.stringify(thrown)}`);
  assert.deepEqual(radio, { on: true, phase: 'heist' }, 'the trigger at the radio switches it on');
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await ctx.close();
});
