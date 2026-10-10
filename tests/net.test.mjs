// W8a: playing with friends (plan-multiplayer §1, §6.1). Two tabs of one Chromium are the host and a
// guest; they talk through BroadcastChannel (?net=local: the public relays are out of reach from the
// cloud), with the host's world sent 15 times a second and the guest's pose 20 times a second, exactly
// as over WebRTC. What is checked: the code and the link, the libraries load, no secrets in the code,
// the guest joins from the link, both see each other, the host's guard watches and catches the guest,
// doors and loot go through the host, a lost packet stream and its return, a lost host, lag and loss.
// Real phones, NAT, TURN and the public relays are for people (plan §6.2).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, preview, LAND, UA, fingerPressEl, quickTap } from './runner.mjs';

const wait = (page, ms) => page.waitForTimeout(ms);
// real time passes (the network) while the game steps (its clock): n steps of 1/72 s, 20 ms apart
async function run(pages, seconds) {
  for (let t = 0; t < seconds; t += 0.1) {
    for (const p of pages) await p.evaluate(() => window.__game.sim(0.1));
    await wait(pages[0], 30);
  }
}

test('net: room code, invitation link, libraries, no secrets in the code', async () => {
  // no keys, tokens or passwords in the game's code (it is public)
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|html|json)$/.test(f)) files.push(p); } })(join(ROOT, 'src'));
  const bad = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(api[_-]?key|token|secret|credential|password)\s*[:=]\s*['"`]([^'"`]{12,})['"`]/gi)) bad.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(bad, [], 'secrets in src/');
  const net = readFileSync(join(ROOT, 'src/config/net.js'), 'utf8');
  for (const url of net.match(/['"](?:wss?|stun|turns?|https?):[^'"]*['"]/g) || []) assert.ok(!/[?&](key|token|secret)=/i.test(url), url);

  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, preview + '?map=dacha');
  const r = await page.evaluate(async () => {
    const room = await import('./src/net/room.js');
    const code = room.newCode();
    const link = room.roomLink('483921', 'mansion');
    const nostr = await import('trystero-nostr'), torrent = await import('trystero-torrent');
    const { default: qrcode } = await import('qrcode-generator');
    const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
    return {
      code, codeOk: /^\d{6}$/.test(code), pretty: room.prettyCode('483921'), clean: room.cleanCode(' 483-921 '),
      link, back: room.roomFromUrl(new URL(link).search), bad: room.roomFromUrl('?room=12'),
      libs: typeof nostr.joinRoom === 'function' && typeof torrent.joinRoom === 'function' && typeof nostr.selfId === 'string',
      qr: qr.getModuleCount() >= 21,
      lobby: !!document.querySelector('#netbox #netcreate') && !!document.querySelector('#netbox #netjoin'),
    };
  });
  assert.equal(r.codeOk, true, r.code);
  assert.equal(r.pretty, '483 921');
  assert.equal(r.clean, '483921');
  assert.ok(r.link.includes('/preview/test/') && r.link.includes('room=483921') && r.link.includes('map=mansion'), r.link);
  assert.equal(r.back, '483921');
  assert.equal(r.bad, null);
  assert.equal(r.libs, true, 'Trystero (nostr, torrent) loads from vendor/');
  assert.equal(r.qr, true);
  assert.equal(r.lobby, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net: two tabs — the guest joins from the link, the guard sees and catches it, doors and loot go through the host', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, base + '?net=local');
  const code = '271828';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  // the guest opens the invitation link: the card «Приєднатись»
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  const card = await guest.page.evaluate(() => ({ card: !document.querySelector('#netcard').hidden, code: document.querySelector('#netcode').value }));
  assert.equal(card.card, true, 'the link shows the join card');
  assert.equal(card.code, '271 828');
  await guest.page.fill('#netname', 'Оля');
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; });
  await run(pages, 0.6);
  const lobby = await host.page.evaluate(() => window.__game.net.state());
  assert.equal(lobby.players.length, 2, JSON.stringify(lobby.players));
  assert.ok(lobby.players.some((p) => p.name === 'Оля'), 'the host lists the guest');
  const gl = await guest.page.evaluate(() => ({ s: window.__game.net.state(), text: document.querySelector('#netlist').textContent, isGuest: window.__game.net.isGuest }));
  assert.equal(gl.isGuest, true);
  assert.ok(gl.text.includes('Аня') && gl.text.includes('Оля'), gl.text);

  // 1. the guest walks into the yard: the host sees it there (its pose, interpolated)
  await guest.page.evaluate(() => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 1);
  const seen = await host.page.evaluate(() => window.__game.net.state().remotes[0]);
  assert.ok(Math.abs(seen.x + 4) < 0.3 && Math.abs(seen.z - 1.6) < 0.3, JSON.stringify(seen));
  assert.equal(seen.inGame, true, 'the guest is in G.players on the host');
  // and the guest sees the host (at the van)
  const hostOnGuest = await guest.page.evaluate(() => window.__game.net.state().remotes.find((r) => r.pid));
  assert.ok(hostOnGuest, 'the guest draws the host');

  // 2. a door: the guest asks, the host swings it, the guest's copy follows
  const door = await guest.page.evaluate(() => {
    const g = window.__game, d = g.level.doors.find((x) => !x.locked && x.floor === 0);
    g.useDoor(d);
    return g.level.doors.indexOf(d);
  });
  await run(pages, 1.2);
  const doorState = await Promise.all(pages.map((p) => p.evaluate((i) => +window.__game.level.doors[i].target.toFixed(2), door)));
  assert.notEqual(doorState[0], 0, 'the host opened the door for the guest');
  assert.equal(doorState[0], doorState[1], 'the guest shows the host’s door');

  // 3. loot: the guest takes an item (the host decides), carries it and puts it in the van
  const item = await guest.page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((x) => x.takeable && !x.twoHanded && !x.throwable && !x.trap && !x.heavy && !x.prop);
    const p = it.mesh.position;
    g.player.teleport(p.x + 0.6, p.z, Math.PI / 2, it.floor ? 3 : 0);
    window.__item = g.loot.items.indexOf(it);
    return window.__item;
  });
  await run(pages, 0.6);
  await guest.page.evaluate(async (i) => { const { G } = await import('./src/systems/state.js'); G.netIntent('take', { i }); }, item);
  await run(pages, 0.8);
  const held = await Promise.all([
    host.page.evaluate((i) => window.__game.loot.items[i].netHolder || '', item),
    guest.page.evaluate((i) => window.__game.hands.desk === window.__game.loot.items[i], item),
  ]);
  assert.ok(held[0].startsWith('p'), 'the host gave the item to the guest: ' + held[0]);
  assert.equal(held[1], true, 'the guest carries it (in front of its eyes)');
  await guest.page.evaluate(() => { const g = window.__game, V = g.CFG.round.vanZone; g.player.teleport(V.x, V.z, 0); });
  await run(pages, 0.8);
  await guest.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); G.netIntent('put', { atVan: true }); });
  await run(pages, 2.5);
  const delivered = await Promise.all(pages.map((p) => p.evaluate((i) => window.__game.loot.items[i].delivered, item)));
  assert.deepEqual(delivered, [true, true], 'delivered on the host and on the guest');

  // 4. the host's guard: the guest in the yard in front of it is the one it watches; then it catches it
  await guest.page.evaluate(() => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 0.6);
  await host.page.evaluate(() => {
    const g = window.__game, P = g.patrol, S0 = g.level.spawn;
    g.player.teleport(S0.x, S0.z, S0.yaw);
    P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.queue.length = 0; P.queue.push({ type: 'wait', t: 999, label: 'test' });
    P.x = -4; P.z = 4.2; P.y = 0; P.heading = 0; P.headYaw = 0;
  });
  let chase = null;
  for (let i = 0; i < 40 && !chase; i++) {
    await run(pages, 0.25);
    chase = await host.page.evaluate(() => (window.__game.patrol.state === 'chase' && window.__game.patrol.target && window.__game.patrol.target.remote ? 'remote' : null));
  }
  assert.equal(chase, 'remote', 'the guard chases the guest');
  let onGuest = null;   // the next state packet brings it (the network is real time)
  for (let i = 0; i < 20 && onGuest !== 'chase'; i++) { await wait(guest.page, 50); onGuest = await guest.page.evaluate(() => window.__game.guards[0].state); }
  assert.equal(onGuest, 'chase', 'the guest sees the guard chasing');
  let caught = null;
  for (let i = 0; i < 60 && !caught; i++) {
    await run(pages, 0.25);
    caught = await guest.page.evaluate(() => (window.__game.caughtT >= 0 || window.__game.round.phase === 'result' ? window.__game.round.phase : null));
  }
  assert.ok(caught, 'the guest was caught');
  await run(pages, 2);
  const result = await Promise.all(pages.map((p) => p.evaluate(() => ({ phase: window.__game.round.phase, kind: window.__game.round.result && window.__game.round.result.kind, verdict: !!window.__game.verdict }))));
  assert.deepEqual(result.map((x) => x.phase), ['result', 'result']);
  assert.equal(result[1].kind, 'caught');
  assert.equal(result[1].verdict, true, 'the guest has its result board');

  // 5. a new round from the host: the guest follows
  await host.page.evaluate(() => window.__game.newRound());
  await run(pages, 1);
  const again = await guest.page.evaluate(() => window.__game.round.phase);
  assert.equal(again, 'ready');
  // a guest cannot start a round or change the contract
  const refused = await guest.page.evaluate(() => { window.__game.newRound(); return window.__game.flashText; });
  assert.ok(/хост/.test(refused), refused);

  assert.deepEqual(host.errors, [], 'host errors');
  assert.deepEqual(guest.errors, [], 'guest errors');
  await ctx.close();
});

test('net: lag and loss, a guest that drops out and comes back, a lost host', async () => {
  const ctx = await newContext(browser, { viewport: { width: 900, height: 600 } });
  const host = await open(ctx, base + '?net=local');
  const code = '314159';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'frol'), code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => { window.__game.CFG.net.hostLostAfter = 2; return window.__game.net.open(code, 'guest', 'Оля', 'rita'); }, code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { window.__game.playing = true; for (const l of window.__game.lurkers) l.update = () => {}; for (const g of window.__game.guards) g.update = () => null; });

  // lag 150 ms ± 40 and 5 % loss on the host's side: the guest's body still moves smoothly there
  await host.page.evaluate(() => Object.assign(window.__game.net.sim, { lag: 150, jitter: 40, loss: 0.05 }));
  const xs = [];
  for (let i = 0; i < 24; i++) {
    await guest.page.evaluate((i) => window.__game.player.teleport(-6 + i * 0.1, 3, 0), i);
    await run(pages, 0.1);
    xs.push(await host.page.evaluate(() => { const r = window.__game.net.state().remotes[0]; return r ? r.x : null; }));
  }
  const moving = xs.slice(xs.findIndex((x) => x !== null && x < -5));   // from the moment it reached the teleport (the jump from the van is the teleport)
  let back = 0;
  for (let i = 1; i < moving.length; i++) if (moving[i] < moving[i - 1] - 0.05) back++;
  assert.ok(moving.length > 10 && moving.at(-1) > -5, JSON.stringify(xs));
  assert.equal(back, 0, 'no jumps backwards: ' + JSON.stringify(xs));
  await host.page.evaluate(() => Object.assign(window.__game.net.sim, { lag: 0, jitter: 0, loss: 0 }));

  // the guest goes silent: «зв'язок…», out of the guards' sight; it comes back as itself
  await guest.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await wait(host.page, 3600);
  await run([host.page], 0.3);
  const lost = await host.page.evaluate(() => ({ r: window.__game.net.state().remotes[0], n: window.__game.net.players.length, flash: window.__game.flashText }));
  assert.equal(lost.r.lost, true);
  assert.equal(lost.n, 1, 'out of G.players while silent');
  await guest.page.evaluate(() => { window.__game.net.sim.cut = false; });
  await run(pages, 1);
  const back2 = await host.page.evaluate(() => ({ r: window.__game.net.state().remotes, n: window.__game.net.players.length }));
  assert.equal(back2.r.length, 1, 'the same player, not a second one');
  assert.equal(back2.r[0].lost, false);
  assert.equal(back2.n, 2);

  // the host goes silent: the guest says so and offers solo play
  await host.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await wait(guest.page, 2600);
  await run([guest.page], 0.3);
  const gone = await guest.page.evaluate(() => ({ s: window.__game.net.state(), solo: !document.querySelector('#netsolo').hidden }));
  assert.equal(gone.s.hostLost, true);
  assert.equal(gone.solo, true, '«Грати самому» is offered');
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('net: two phones — the lobby and «Приєднатись» by finger, «Взяти» / «Покласти» go through the host (Pixel landscape)', async () => {
  const ctx = await newContext(browser, LAND);
  const host = await open(ctx, base + '?net=local');
  const code = '161803';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  const cdp = await ctx.newCDPSession(guest.page);
  // the lobby fits the small screen: the join button is reachable by finger
  await guest.page.locator('#netjoin').scrollIntoViewIfNeeded();
  await fingerPressEl(guest.page, cdp, '#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await guest.page.locator('#start').scrollIntoViewIfNeeded();
  await guest.page.tap('#start');
  await guest.page.waitForFunction(() => window.__game.playing);
  await host.page.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; for (const p of g.guards) p.update = () => null; });
  await guest.page.evaluate(() => { for (const l of window.__game.lurkers) l.update = () => {}; });
  const pages = [host.page, guest.page];
  // stand in front of a small item: the context button says «Взяти»
  const item = await guest.page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((x) => x.takeable && !x.twoHanded && !x.throwable && !x.trap && !x.heavy && !x.prop && x.mesh.position.y < 1.2);
    const p = it.mesh.position;
    g.player.teleport(p.x, p.z + 0.9, 0); g.player.lookYaw = 0; g.player.lookPitch = -0.45; g.sim(0.2);
    return g.loot.items.indexOf(it);
  });
  await run(pages, 0.5);
  const label = await guest.page.evaluate(() => document.querySelector('#touch .act').textContent);
  assert.equal(label, 'Взяти', 'aimed at the item');
  await quickTap(cdp, await guest.page.evaluate(() => { const b = document.querySelector('#touch .act').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
  await run(pages, 1);
  const held = await Promise.all([host.page.evaluate((i) => !!window.__game.loot.items[i].netHolder, item), guest.page.evaluate((i) => window.__game.hands.desk === window.__game.loot.items[i], item)]);
  assert.deepEqual(held, [true, true], 'the host gave it; the guest carries it');
  await run(pages, 0.3);
  await quickTap(cdp, await guest.page.evaluate(() => { const b = document.querySelector('#touch .act').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
  await run(pages, 1.5);
  const put = await Promise.all([host.page.evaluate((i) => ({ holder: window.__game.loot.items[i].netHolder || '', state: window.__game.loot.items[i].state }), item), guest.page.evaluate(() => window.__game.hands.desk)]);
  assert.equal(put[0].holder, '', 'put down');
  assert.equal(put[1], null);
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('net: a guest in the VR emulator (IWER Quest 3) walks with the stick; the host sees it move', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (readFileSync(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const host = await open(ctx, base + '?net=local');
  const code = '577215';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'nazar'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await guest.page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await guest.page.click('#vrbutton');
  await guest.page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await host.page.evaluate(() => { window.__game.playing = true; for (const p of window.__game.guards) p.update = () => null; });
  await wait(guest.page, 800);
  const g0 = await guest.page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  await guest.page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  await wait(guest.page, 2500);
  // software rendering of a stereo frame is slow and a frame's step is capped: walk on until 0.4 m (≤ 10 s more), the check is the same (W17)
  await guest.page.waitForFunction((g0) => Math.hypot(window.__game.player.head.x - g0.x, window.__game.player.head.z - g0.z) > 0.4, g0, { timeout: 10000 }).catch(() => {});
  await guest.page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  await wait(guest.page, 800);
  const g1 = await guest.page.evaluate(() => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  const seen = await host.page.evaluate(() => window.__game.net.state().remotes[0]);
  assert.ok(Math.hypot(g1.x - g0.x, g1.z - g0.z) > 0.3, `the guest walked: ${JSON.stringify([g0, g1])}`);
  assert.ok(Math.hypot(seen.x - g1.x, seen.z - g1.z) < 0.15, `the host sees it where it is: ${JSON.stringify([g1, seen])}`);
  await guest.page.evaluate(() => window.__game.renderer.xr.getSession().end());
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('net: a minimized host is «на паузі» for the guest, not lost', async () => {
  const ctx = await newContext(browser, { viewport: { width: 900, height: 600 } });
  const host = await open(ctx, base + '?net=local');
  const code = '141421';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => { window.__game.CFG.net.hostLostAfter = 2; return window.__game.net.open(code, 'guest', 'Оля', 'rita'); }, code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  // the host's page goes to the background: no frames, only timers
  await host.page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    window.__game.renderer.setAnimationLoop(null);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(guest.page, 3500);
  await guest.page.evaluate(() => window.__game.sim(0.2));
  const st = await guest.page.evaluate(() => ({ lost: window.__game.net.state().hostLost, flash: window.__game.flashText }));
  assert.equal(st.lost, false, 'still there');
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});
