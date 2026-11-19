// Кооп (plan 2026-11-15, Б10 → Б9 → Б2): honest messages when the relays are out of reach (Б10), a host that
// closed the game or went silent (Б9), a guest that comes back after a call or a reload (Б2). Two tabs of one
// Chromium talk through BroadcastChannel (?net=local), as in tests/net.test.mjs; one test cuts every WebSocket
// of the real library (Trystero) with Playwright. Real phones, calls and iPhone's sleeping tabs are for people.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, UA, LAND } from './runner.mjs';

const wait = (page, ms) => page.waitForTimeout(ms);
// real time passes (the network) while the game steps (its clock)
async function run(pages, seconds) {
  for (let t = 0; t < seconds; t += 0.1) {
    for (const p of pages) await p.evaluate(() => window.__game.sim(0.1));
    await wait(pages[0], 30);
  }
}
const lobbyOf = (page) => page.evaluate(() => ({
  status: document.querySelector('#netstatus').textContent,
  tips: document.querySelector('#nettips').hidden ? [] : [...document.querySelectorAll('#nettips li')].map((li) => li.textContent),
  retry: !document.querySelector('#netretry').hidden,
}));
const report = (page) => page.evaluate(async () => (await import('./src/systems/net.js')).netReport());

// ---------- Б10 ----------
test('coop (Б10): the host whose relays are out of reach — the reason, three tips, «Спробувати ще раз»; relays back = «Чекаю друзів» by itself', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, base + '?net=local');
  const code = '424242';
  await host.page.evaluate((code) => {
    const g = window.__game; g.net.sim.relaysDown = true; g.CFG.net.connectTimeout = 1; g.CFG.net.relayCheck = 0.25;
    return g.net.open(code, 'host', 'Аня', 'zoya');
  }, code);
  const first = await lobbyOf(host.page);
  assert.match(first.status, /З'єднуюсь із серверами зв'язку/, 'not «Чекаю друзів» before any relay answered');
  await host.page.waitForFunction(() => /Не можу дістатися серверів зв'язку/.test(document.querySelector('#netstatus').textContent), null, { timeout: 8000 });
  const down = await lobbyOf(host.page);
  assert.equal(down.tips.length, 3, JSON.stringify(down));
  assert.match(down.tips[0], /Wi-Fi ↔ мобільний/);
  assert.match(down.tips[1], /VPN/);
  assert.match(down.tips[2], /Спробувати ще раз/);
  assert.equal(down.retry, true, 'the button is there');
  assert.deepEqual((await report(host.page)).relays, { local: '0/1' }, 'the report counts the relays');
  // the relays come back: the line goes back to «Чекаю друзів» without a tap
  await host.page.evaluate(() => { window.__game.net.sim.relaysDown = false; });
  await host.page.waitForFunction(() => /Чекаю друзів/.test(document.querySelector('#netstatus').textContent), null, { timeout: 5000 });
  const ok = await lobbyOf(host.page);
  assert.deepEqual([ok.tips, ok.retry], [[], false], JSON.stringify(ok));
  // down again; «Спробувати ще раз» opens the same room (the same code) on a fresh page
  await host.page.evaluate(() => { window.__game.net.sim.relaysDown = true; });
  await host.page.waitForFunction(() => !document.querySelector('#netretry').hidden, null, { timeout: 5000 });
  await host.page.click('#netretrybtn');
  await host.page.waitForURL((u) => u.searchParams.get('host') === '1', { timeout: 15000, waitUntil: 'commit' });
  await host.page.waitForFunction(() => window.__game && window.__game.net && window.__game.net.state().role === 'host', null, { timeout: 60000 });
  await host.page.waitForFunction(() => /Чекаю друзів/.test(document.querySelector('#netstatus').textContent), null, { timeout: 10000 });
  assert.equal(await host.page.evaluate(() => window.__game.net.state().code), code, 'the same code');
  // a friend still finds it
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'rita'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('coop (Б10): the real library with every WebSocket cut — the host is told, the report says 0 of N', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const host = await open(ctx, base);
  await host.page.evaluate(() => { const g = window.__game; g.CFG.net.connectTimeout = 3; g.CFG.net.relayCheck = 0.5; return g.net.open('525252', 'host', 'Аня', 'zoya'); });
  await host.page.waitForFunction(() => /Не можу дістатися серверів зв'язку/.test(document.querySelector('#netstatus').textContent), null, { timeout: 20000 });
  const l = await lobbyOf(host.page);
  assert.equal(l.tips.length, 3);
  assert.equal(l.retry, true);
  const r = await report(host.page);
  assert.equal(r.transport, 'trystero');
  for (const k of ['nostr', 'torrent']) assert.match(r.relays[k] || '', /^0\/[1-9]\d*$/, JSON.stringify(r.relays));
  assert.deepEqual(host.errors, []);
  await ctx.close();
});

test('coop (Б10): no false alarm when the relays answer; a guest without relays is told so; the host hears a failed connection', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  // the relays answer: «Чекаю друзів» at once, no tips, no button
  const host = await open(ctx, base + '?net=local');
  await host.page.evaluate(() => { const g = window.__game; g.CFG.net.connectTimeout = 0.5; g.net.sim.failConnect = true; return g.net.open('636363', 'host', 'Аня', 'zoya'); });
  await wait(host.page, 1500);
  const ok = await lobbyOf(host.page);
  assert.match(ok.status, /Кімната відкрита\. Чекаю друзів/);
  assert.deepEqual([ok.tips, ok.retry], [[], false]);
  // a guest the host cannot connect to (different networks): the host is told
  const b = await open(ctx, base + '?net=local');
  await b.page.evaluate(() => window.__game.net.open('636363', 'guest', 'Оля', 'rita'));
  await host.page.waitForFunction(() => /Хтось пробував зайти/.test(document.querySelector('#netstatus').textContent), null, { timeout: 8000 });
  // a guest whose own phone reaches no relay: its own text, not «Не бачу хоста»
  const a = await open(ctx, base + '?net=local');
  await a.page.evaluate(() => { const g = window.__game; g.net.sim.relaysDown = true; g.CFG.net.findTimeout = 0.5; return g.net.open('100003', 'guest', 'Оля', 'rita'); });
  await run([a.page], 1.5);
  const g = await lobbyOf(a.page);
  assert.match(g.status, /Твій пристрій не дістає серверів зв'язку/);
  assert.equal(g.tips.length, 3);
  assert.match(g.tips[2], /Увійти в кімнату/);
  assert.equal(g.retry, false, 'a guest gets the join form back, not the host’s button');
  for (const p of [host, a, b]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

// ---------- Б9 ----------
// a room with the host and one guest, both in the round («Почати»), the guards and lurkers still
async function roundOfTwo(ctx, code, { guestCfg = {}, hostCfg = {} } = {}) {
  const host = await open(ctx, base + '?net=local');
  await host.page.evaluate(([code, cfg]) => { Object.assign(window.__game.CFG.net, cfg); return window.__game.net.open(code, 'host', 'Аня', 'zoya'); }, [code, hostCfg]);
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  await guest.page.evaluate((cfg) => Object.assign(window.__game.CFG.net, cfg), guestCfg);
  await guest.page.fill('#netname', 'Оля');
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await host.page.waitForFunction(() => !document.querySelector('#netstart').disabled);
  await host.page.click('#netstart');
  for (const p of [host.page, guest.page]) await p.evaluate(() => { const g = window.__game; for (const l of g.lurkers) l.update = () => {}; for (const x of g.guards) { x.realUpdate = x.update; x.update = () => null; } });
  await host.page.evaluate(() => { window.__game.round.phase = 'heist'; });
  await run([host.page, guest.page], 0.6);
  return { host, guest, pages: [host.page, guest.page] };
}
const cardOf = (page) => page.evaluate(() => {
  const el = document.querySelector('#hostgone');
  return { kind: window.__game.net.state().card, shown: !!el && !el.hidden, text: el ? el.querySelector('.hg-text').textContent : '', wait: !!el && !el.querySelector('.hg-wait').hidden };
});

test('coop (Б9): the host closes the game mid-round — the guest’s card «Хост завершив гру»; «В меню» = a clean main menu', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest } = await roundOfTwo(ctx, '717171');
  assert.equal(await guest.page.evaluate(() => window.__game.round.phase), 'heist');
  // the page's own «pagehide» (Chromium may tear a closing tab down before a message sent from it leaves; the
  // game then has the guest's hostLostAfter s of silence — the next test), then the tab closes
  await host.page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await host.page.close();
  await guest.page.waitForFunction(() => window.__game.net.state().card === 'end', null, { timeout: 8000 });
  const c = await cardOf(guest.page);
  assert.equal(c.shown, true);
  assert.match(c.text, /Хост \(Аня\) завершив гру/);
  assert.equal(c.wait, false, 'no «Чекати» when the host closed the game');
  await guest.page.click('#hostgone .hg-menu');
  await guest.page.waitForURL((u) => !u.search.includes('room='), { timeout: 15000, waitUntil: 'commit' });
  await guest.page.waitForFunction(() => window.__game && window.__game.round && window.__game.net, null, { timeout: 60000 });
  const g = await guest.page.evaluate(() => ({ phase: window.__game.round.phase, url: location.search, role: window.__game.net.state().role, card: !!document.querySelector('#hostgone:not([hidden])') }));
  assert.equal(g.phase, 'ready');
  assert.equal(g.role, null);
  assert.ok(!/room=|page=|join=|host=/.test(g.url), g.url);
  assert.equal(g.card, false);
  assert.deepEqual(guest.errors, []);
  await ctx.close();
});

test('coop (Б9): a silent host — «Хост не відповідає…» with «Чекати»; the host back = the card goes by itself; «Чекати» hides it a while', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '727272', { guestCfg: { hostLostAfter: 1.5, hostWaitMore: 4, rejoinEvery: 600 } });
  await host.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await wait(guest.page, 2200);
  await run([guest.page], 0.3);
  let c = await cardOf(guest.page);
  assert.equal(c.kind, 'silent', JSON.stringify(c));
  assert.match(c.text, /Хост \(Аня\) не відповідає вже \d+ с/);
  assert.equal(c.wait, true, '«Чекати» is there');
  await host.page.evaluate(() => { window.__game.net.sim.cut = false; });
  await run(pages, 1);
  c = await cardOf(guest.page);
  assert.equal(c.shown, false, 'the card went by itself');
  assert.equal(await guest.page.evaluate(() => window.__game.round.phase), 'heist', 'the round goes on');
  // silent again: «Чекати» hides it, still silent after hostWaitMore = the card again
  await host.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await wait(guest.page, 2200);
  await run([guest.page], 0.3);
  await guest.page.click('#hostgone .hg-wait');
  assert.equal((await cardOf(guest.page)).shown, false, '«Чекати» hides it');
  await wait(guest.page, 4200);
  await run([guest.page], 0.3);
  assert.equal((await cardOf(guest.page)).kind, 'silent', 'still silent: the card is back');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б9): a host back from sleep keeps its guests; «bye» for another house or from a guest shows no card', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, base + '?net=local');
  const code = '737373';
  await host.page.evaluate((code) => { Object.assign(window.__game.CFG.net, { peerGoneAfter: 2, wakeGrace: 2 }); return window.__game.net.open(code, 'host', 'Аня', 'zoya'); }, code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'rita'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  // the host's page sleeps as on an iPhone: no frames, no timers (nothing in or out)
  await host.page.evaluate(() => {
    window.__game.net.sim.cut = true;
    window.__game.renderer.setAnimationLoop(null);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(host.page, 3000);
  await host.page.evaluate(() => {
    window.__game.net.sim.cut = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await run([host.page, guest.page], 1);
  const h = await host.page.evaluate(() => window.__game.net.state());
  assert.equal(h.remotes.length, 1, 'the guest is still in the room: ' + JSON.stringify(h.remotes));
  assert.equal(h.remotes[0].lost, false);
  // the guest in the game; another guest says «bye … end» to everybody, the host says «bye» for another house: no card
  await guest.page.evaluate(() => { window.__game.playing = true; });
  const other = await open(ctx, base + '?net=local');
  await other.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Рита', 'rita'), code);
  await other.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await other.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); G.net.t.send({ type: 'bye', pid: 'x', why: 'end' }); G.net.t.send({ type: 'deny', why: 'full' }); });
  await run([guest.page], 0.5);
  let g = await guest.page.evaluate(() => ({ s: window.__game.net.state() }));
  assert.equal(g.s.card, '', 'a guest’s «bye» is nothing');
  assert.equal(g.s.welcomed, true, 'a guest’s «deny» is nothing');
  await host.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); G.net.t.send({ type: 'bye', pid: G.net.pid, why: 'house' }); });
  await run([guest.page], 0.5);
  g = await guest.page.evaluate(() => window.__game.net.state());
  assert.equal(g.card, '', 'another house: no card');
  assert.equal(g.hostEnded, false);
  for (const p of [host, guest, other]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б9): a guest in VR (IWER Quest 3) — the host closed the game: a line on the wrist that does not go out', async () => {
  const ctx = await newContext(browser, { userAgent: UA.quest });
  await ctx.addInitScript({ content: (readFileSync(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const host = await open(ctx, base + '?net=local');
  const code = '747474';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'nazar'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await guest.page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await guest.page.click('#vrbutton');
  await guest.page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await host.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); G.net.t.send({ type: 'bye', pid: G.net.pid, why: 'end' }); });
  await guest.page.waitForFunction(() => /Хост вийшов\. Вийди з VR/.test(window.__game.flashText || ''), null, { timeout: 8000 });
  await wait(guest.page, 2500);   // longer than one flash: it is said again and again
  assert.match(await guest.page.evaluate(() => window.__game.flashText), /Хост вийшов/);
  await guest.page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await guest.page.waitForFunction(() => !window.__game.inVR, null, { timeout: 10000 });
  await run([guest.page], 0.2);
  assert.equal((await cardOf(guest.page)).kind, 'end', 'out of VR: the same card');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

// ---------- Б2 ----------
const setPaused = (page, v) => page.evaluate(async (v) => { const { G } = await import('./src/systems/state.js'); G.paused = v; }, v);

test('coop (Б2): a guest on pause / a call mid-round keeps its place; the host moves things meanwhile; «Продовжити» = the same round, player and world', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '818181', { hostCfg: { peerGoneAfter: 2 } });
  const pid = await guest.page.evaluate(() => window.__game.net.state().pid);
  await guest.page.evaluate(() => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 0.6);
  // the call: the pause menu, then nothing at all for longer than peerGoneAfter
  await setPaused(guest.page, true);
  await wait(host.page, 400);
  await run([host.page], 0.3);
  let h = await host.page.evaluate(() => ({ s: window.__game.net.state(), flash: window.__game.flashText, list: document.querySelector('#netlist').textContent }));
  assert.equal(h.s.remotes[0].away, true, JSON.stringify(h.s.remotes));
  assert.equal(h.s.remotes[0].inGame, false, 'out of G.players: the guards do not see it');
  assert.equal(h.s.remotes[0].drawn, false, 'its body is not drawn');
  assert.match(h.flash, /Оля на паузі/);
  assert.match(h.list, /пауза/);
  await guest.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await wait(host.page, 2600);
  await run([host.page], 0.3);
  h = await host.page.evaluate(() => window.__game.net.state());
  assert.equal(h.remotes.length, 1, 'its place is kept to the round’s end');
  // meanwhile the host opens a door and moves an item
  const [door, item] = await host.page.evaluate(() => {
    const g = window.__game, d = g.level.doors.find((x) => !x.locked && x.floor === 0);
    g.useDoor(d);
    const it = g.loot.items.find((x) => x.takeable && !x.held && x.mesh.visible);
    it.mesh.position.x += 0.4;
    return [g.level.doors.indexOf(d), g.loot.items.indexOf(it)];
  });
  await run([host.page], 1.2);
  // back: «Продовжити»
  await guest.page.evaluate(() => { window.__game.net.sim.cut = false; });
  await setPaused(guest.page, false);
  await run(pages, 1.5);
  const [hw, gw] = await Promise.all(pages.map((p) => p.evaluate(([i, j]) => { const g = window.__game; return { door: +g.level.doors[i].target.toFixed(2), x: +g.loot.items[j].mesh.position.x.toFixed(2) }; }, [door, item])));
  assert.notEqual(hw.door, 0);
  assert.deepEqual(gw, hw, 'the guest’s door and item are the host’s');
  const g = await guest.page.evaluate(() => ({ s: window.__game.net.state(), phase: window.__game.round.phase }));
  assert.equal(g.s.welcomed, true);
  assert.equal(g.s.pid, pid, 'the same player');
  assert.equal(g.phase, 'heist', 'in the same round');
  h = await host.page.evaluate(() => window.__game.net.state());
  assert.equal(h.remotes.length, 1, 'one friend, not two');
  assert.equal(h.remotes[0].pid, pid);
  assert.equal(h.remotes[0].away, false);
  assert.equal(h.remotes[0].inGame, true);
  assert.ok(h.stats.rejoins >= 1, JSON.stringify(h.stats));
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б2): the connection died during the call — the guest opens the same room again by itself, without a reload', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '828282', { hostCfg: { peerGoneAfter: 2 }, guestCfg: { backWait: 1 } });
  const pid = await guest.page.evaluate(() => window.__game.net.state().pid);
  const url = guest.page.url();
  await setPaused(guest.page, true);
  await guest.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); window.__game.net.sim.dead.push(G.net.t.selfId); });
  await wait(host.page, 2600);
  await run([host.page], 0.3);
  await setPaused(guest.page, false);
  await guest.page.waitForFunction(() => { const s = window.__game.net.state(); return s.stats.rejoins >= 1 && !s.rejoining && s.welcomed; }, null, { timeout: 15000 });
  await run(pages, 1);
  const h = await host.page.evaluate(() => window.__game.net.state());
  assert.equal(h.remotes.length, 1, JSON.stringify(h.remotes));
  assert.equal(h.remotes[0].pid, pid);
  assert.equal(h.remotes[0].lost, false);
  assert.equal(await guest.page.evaluate(() => window.__game.round.phase), 'heist');
  assert.equal(guest.page.url().replace(/[?&](room|map)=[^&]*/g, ''), url.replace(/[?&](room|map)=[^&]*/g, ''), 'no reload');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б2): Р1-C — after awayDropAfter its item falls where it stood; nobody holds it any more', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '838383', { hostCfg: { awayDropAfter: 4 } });
  const item = await guest.page.evaluate(() => {
    const g = window.__game, it = g.loot.items.find((x) => x.takeable && !x.twoHanded && !x.throwable && !x.trap && !x.heavy && !x.prop);
    const p = it.mesh.position;
    g.player.teleport(p.x + 0.6, p.z, Math.PI / 2, it.floor ? 3 : 0);
    return g.loot.items.indexOf(it);
  });
  await run(pages, 0.6);
  await guest.page.evaluate(async (i) => { const { G } = await import('./src/systems/state.js'); G.netIntent('take', { i }); }, item);
  await run(pages, 0.8);
  assert.ok((await host.page.evaluate((i) => window.__game.loot.items[i].netHolder || '', item)).startsWith('p'), 'the guest holds it');
  await setPaused(guest.page, true);
  await wait(host.page, 300);
  await run([host.page], 0.1);
  const held = await host.page.evaluate((i) => window.__game.loot.items[i].netHolder || '', item);
  assert.ok(held.startsWith('p'), 'still in its hands at first (a short call costs nothing)');
  await wait(host.page, 4300);
  await run([host.page], 1);
  const h = await host.page.evaluate((i) => { const g = window.__game, it = g.loot.items[i], r = g.net.state().remotes[0]; return { holder: it.netHolder || '', held: !!it.held, takeable: it.takeable, d: Math.hypot(it.mesh.position.x - r.x, it.mesh.position.z - r.z), desk: r.desk }; }, item);
  assert.deepEqual([h.holder, h.held, h.desk, h.takeable], ['', false, null, true], JSON.stringify(h));
  assert.ok(h.d < 1.5, 'it fell where the guest stood: ' + h.d);
  await setPaused(guest.page, false);
  await run(pages, 1.2);
  assert.equal(await guest.page.evaluate((i) => window.__game.hands.desk === window.__game.loot.items[i], item), false, 'not in the guest’s hands any more');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б2): a guest that missed the round’s end and the host’s next pick comes back to where the host is — the room', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '848484');
  await setPaused(guest.page, true);
  await guest.page.evaluate(() => { window.__game.net.sim.cut = true; });
  await host.page.evaluate(() => window.__game.round.finish('left'));
  await run([host.page], 1);
  await host.page.evaluate(async () => { const { newRound } = await import('./src/systems/contract.js'); newRound(); });
  await run([host.page], 0.5);
  await guest.page.evaluate(() => { window.__game.net.sim.cut = false; });
  await setPaused(guest.page, false);
  await run(pages, 1.5);
  const g = await guest.page.evaluate(() => ({ phase: window.__game.round.phase, playing: window.__game.playing, welcomed: window.__game.net.state().welcomed, overlay: document.querySelector('#overlay').style.display }));
  assert.deepEqual(g, { phase: 'ready', playing: false, welcomed: true, overlay: 'flex' }, JSON.stringify(g));
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б2): the guest’s tab reloaded mid-round — «Повернутись у раунд» puts it back in the same round, where it stood', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '858585');
  const pid = await guest.page.evaluate(() => window.__game.net.state().pid);
  await guest.page.evaluate(() => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 0.8);
  assert.match(guest.page.url(), /room=858585/);
  await guest.page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await guest.page.waitForFunction(() => window.__game && window.__game.net && window.__game.net.state().welcomed, null, { timeout: 60000, polling: 200 });
  await guest.page.waitForFunction(() => !document.querySelector('#netback').hidden, null, { timeout: 10000 });
  assert.match(await guest.page.evaluate(() => document.querySelector('#netbacktext').textContent), /Раунд ще йде \(хост: Аня\)/);
  await guest.page.click('#netbackbtn');
  await run(pages, 0.6);
  const g = await guest.page.evaluate(() => ({ playing: window.__game.playing, phase: window.__game.round.phase, x: window.__game.player.head.x, z: window.__game.player.head.z, pid: window.__game.net.state().pid }));
  assert.equal(g.playing, true);
  assert.equal(g.phase, 'heist');
  assert.equal(g.pid, pid, 'the same player id after the reload');
  assert.ok(Math.hypot(g.x + 4, g.z - 1.6) < 0.6, 'where it stood: ' + JSON.stringify(g));
  const h = await host.page.evaluate(() => window.__game.net.state().remotes);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.equal(h[0].pid, pid);
  assert.deepEqual(host.errors, []);
  await ctx.close();
});

test('coop (Б2): turned away in the middle of a round — a clean page on «Грати з друзями» with the reason', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest } = await roundOfTwo(ctx, '868686');
  // the host forgot this guest (as after the round's end + 30 s, then a new round)
  await host.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); for (const [pid, r] of G.net.remotes) { r.dispose(); G.net.remotes.delete(pid); } });
  await guest.page.waitForURL((u) => !u.search.includes('room='), { timeout: 15000, waitUntil: 'commit' });
  await guest.page.waitForFunction(() => window.__game && window.__game.net && document.querySelector('#netstatus'), null, { timeout: 60000, polling: 200 });
  const g = await guest.page.evaluate(() => ({ phase: window.__game.round.phase, role: window.__game.net.state().role, url: location.search, status: document.querySelector('#netstatus').textContent }));
  assert.equal(g.phase, 'ready');
  assert.equal(g.role, null);
  assert.match(g.url, /page=friends/);
  assert.match(g.status, /Раунд уже йде без тебе/);
  assert.deepEqual(host.errors, []);
  await ctx.close();
});

test('coop (Б2, owner 19.11): a pause in a chase does not save — the body stays catchable chaseHold s; without a chase it hides at once', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const { host, guest, pages } = await roundOfTwo(ctx, '878787', { hostCfg: { chaseHold: 8 } });
  await guest.page.evaluate(() => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 0.6);
  const remote = () => host.page.evaluate(() => window.__game.net.state().remotes[0]);
  // 1. nobody sees it: the pause hides it at once
  await setPaused(guest.page, true);
  await wait(host.page, 300);
  await run([host.page], 0.2);
  let r = await remote();
  assert.deepEqual([r.away, r.held, r.inGame, r.drawn], [true, false, false, false], JSON.stringify(r));
  await setPaused(guest.page, false);
  await run(pages, 0.8);
  // 2. the guard chases it: the pause keeps the body there (visible, in the round), chaseHold s, then it goes
  const chase = () => host.page.evaluate(async () => {
    const { G } = await import('./src/systems/state.js');
    const P = G.guards[0], r = [...G.net.remotes.values()][0];
    P.target = r; P.visible = true; P.state = 'chase';
  });
  await chase();
  await run([host.page], 0.3);
  await setPaused(guest.page, true);
  await wait(host.page, 300);
  await run([host.page], 0.2);
  r = await remote();
  assert.deepEqual([r.away, r.held, r.inGame, r.drawn], [true, true, true, true], 'held: ' + JSON.stringify(r));
  await wait(host.page, 8200);
  await run([host.page], 0.2);
  r = await remote();
  assert.deepEqual([r.held, r.inGame, r.drawn], [false, false, false], 'the hold is over: ' + JSON.stringify(r));
  await setPaused(guest.page, false);
  await run(pages, 0.8);
  // 3. held in a chase, the guard reaches it and catches it
  await host.page.evaluate(() => { window.__game.CFG.net.chaseHold = 30; });
  await chase();
  await run([host.page], 0.3);
  await setPaused(guest.page, true);
  await wait(host.page, 300);
  await host.page.evaluate(async () => {
    const { G } = await import('./src/systems/state.js');
    const P = G.guards[0], r = [...G.net.remotes.values()][0];
    P.update = P.realUpdate;
    P.x = r.head.x + 0.3; P.z = r.head.z; P.y = r.floorY || 0; P.target = r; P.state = 'chase'; P.visible = true;
  });
  let caught = false;
  for (let i = 0; i < 30 && !caught; i++) {
    await run([host.page], 0.2);
    caught = await host.page.evaluate(() => window.__game.caughtT >= 0 || window.__game.round.phase === 'result' || /спіймали/.test(window.__game.flashText || ''));
  }
  assert.equal(caught, true, 'the guard caught the guest on pause');
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('coop (Б2, owner 19.11): a guest tab reloaded between rounds — one tap «Продовжити» (the sound on an iPhone)', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } });
  const host = await open(ctx, base + '?net=local');
  const code = '888888';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  await guest.page.fill('#netname', 'Оля');
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  assert.equal(await guest.page.evaluate(() => document.querySelector('#netback').hidden), true, 'no button after a join by finger');
  await run([host.page, guest.page], 0.6);
  await guest.page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await guest.page.waitForFunction(() => window.__game && window.__game.net && window.__game.net.state().welcomed, null, { timeout: 60000, polling: 200 });
  await guest.page.waitForFunction(() => !document.querySelector('#netback').hidden, null, { timeout: 10000 });
  const b = await guest.page.evaluate(() => ({ text: document.querySelector('#netbacktext').textContent, button: document.querySelector('#netbackbtn').textContent, phase: window.__game.round.phase }));
  assert.match(b.text, /Ти знову в кімнаті \(хост: Аня\)/);
  assert.equal(b.button, 'Продовжити');
  assert.equal(b.phase, 'ready');
  await guest.page.click('#netbackbtn');
  await guest.page.waitForFunction(() => document.querySelector('#netback').hidden, null, { timeout: 5000 });
  assert.equal(await guest.page.evaluate(() => window.__game.playing), false, 'still in the room: the host starts the round');
  assert.equal((await host.page.evaluate(() => window.__game.net.state().remotes)).length, 1);
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

// ---------- the guest's room (the owner's decision of 7.11, live test 19.11) ----------
test('coop (7.11): a guest that typed the code sees the room only — no level cards, no difficulty, no way to other pages; «Почати» = the van «Їдемо…» for everybody, then the game', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } }, { menu: true });
  const host = await open(ctx, base + '?net=local&page=friends');
  const code = '919191';
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + `?room=${code}&net=local`);
  await guest.page.fill('#netname', 'Оля');
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await run([host.page, guest.page], 0.5);
  const seen = () => guest.page.evaluate(() => {
    const vis = (el) => !!el && !!el.offsetParent;
    return {
      pages: [...document.querySelectorAll('#overlay section[data-page]')].filter((s) => !s.hidden).map((s) => s.dataset.page),
      cards: [...document.querySelectorAll('#netlevels button')].filter(vis).length,
      diffs: [...document.querySelectorAll('#netdiffs button')].filter(vis).length,
      back: vis(document.querySelector('section[data-page="friends"] [data-back]')) && getComputedStyle(document.querySelector('section[data-page="friends"] [data-back]')).visibility !== 'hidden',
      choice: document.querySelector('#netchoice').textContent,
      wait: vis(document.querySelector('#netwait')),
      list: document.querySelector('#netlist').textContent,
    };
  });
  let s = await seen();
  assert.deepEqual(s.pages, ['friends']);
  assert.equal(s.cards, 0, 'no level cards for a guest');
  assert.equal(s.diffs, 0, 'no difficulty buttons for a guest');
  assert.equal(s.back, false, 'no «←» to the menu');
  assert.match(s.choice, /Хост обрав: .+ · .+/);
  assert.equal(s.wait, true, '«Чекаємо, поки хост натисне «Почати»»');
  assert.ok(s.list.includes('Аня') && s.list.includes('Оля') && s.list.includes('хост'), s.list);
  // no way to the old screens: any page (a link, Android's «Назад») stays the room
  await guest.page.evaluate(async () => { const { goPage } = await import('./src/systems/menu.js'); goPage('play'); });
  assert.deepEqual((await seen()).pages, ['friends'], '«Грати» is not for a guest in a room');
  await guest.page.goBack().catch(() => {});
  await guest.page.waitForTimeout(300);
  assert.deepEqual((await seen()).pages, ['friends'], '«Назад» stays in the room');
  // the host's choice changes: the guest sees it
  await host.page.click('#netdiffs button[data-id="easy"]');
  await run([host.page, guest.page], 0.5);
  assert.match((await seen()).choice, /легкий/);
  // «Почати»: the van for everybody, then the game
  await host.page.waitForFunction(() => !document.querySelector('#netstart').disabled);
  await host.page.click('#netstart');
  const van = await Promise.all([host.page, guest.page].map((p) => p.waitForFunction(() => !document.querySelector('#travel').hidden && /Їдемо/.test(document.querySelector('#traveltext').textContent), null, { timeout: 3000, polling: 20 }).then(() => true, () => false)));
  assert.deepEqual(van, [true, true], 'the van «Їдемо…» on both');
  await Promise.all([host.page, guest.page].map((p) => p.waitForFunction(() => document.querySelector('#travel').hidden, null, { timeout: 8000 })));
  assert.equal(await guest.page.evaluate(() => window.__game.playing), true, 'the guest is in the round');
  // between rounds: back in the room, the same picture
  await host.page.evaluate(() => window.__game.round.finish('left'));
  await run([host.page, guest.page], 1.5);
  await guest.page.evaluate(async () => { const { pause2D } = await import('./src/systems/desktop.js'); document.exitPointerLock(); pause2D(); });
  await run([guest.page], 0.2);
  s = await seen();
  assert.deepEqual([s.pages, s.cards, s.diffs, s.back], [['friends'], 0, 0, false], JSON.stringify(s));
  for (const p of [host, guest]) assert.deepEqual(p.errors, []);
  await ctx.close();
});

// ---------- «Грати з друзями»: a digit in the code = joining (the owner's decision of 20.11) ----------
test('coop (20.11): a digit in the room code greys «Створити кімнату» out and lights «Увійти в кімнату»; an empty field = both as before; the same from ?room= (PC, phone, Quest)', async () => {
  const AMBER = 'rgb(255, 179, 71)', GREY = 'rgb(58, 71, 102)';
  const look = (page) => page.evaluate(() => {
    const c = document.querySelector('#netcreate'), j = document.querySelector('#netjoin');
    return { createOff: c.disabled, createBg: getComputedStyle(c).backgroundColor, joinBg: getComputedStyle(j).backgroundColor };
  });
  for (const [name, opts] of [['PC', { viewport: { width: 1000, height: 700 } }], ['phone', LAND], ['Quest', { userAgent: UA.quest, viewport: { width: 1000, height: 700 } }]]) {
    const ctx = await newContext(browser, opts);
    const { page, errors } = await open(ctx, base + '?net=local');
    let l = await look(page);
    assert.deepEqual([l.createOff, l.createBg], [false, AMBER], `${name}: an empty field — «Створити» is the main button`);
    assert.notEqual(l.joinBg, AMBER, name);
    await page.click('#netcode');
    await page.keyboard.type('4');
    l = await look(page);
    assert.deepEqual([l.createOff, l.createBg, l.joinBg], [true, GREY, AMBER], `${name}: one digit — «Створити» grey and off, «Увійти» the main button`);
    await page.locator('#netcreate').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0 });
    await page.locator('#netcreate').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', button: 0 });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__game.net.state().role), null, `${name}: the grey «Створити» does nothing`);
    await page.fill('#netcode', '');
    l = await look(page);
    assert.deepEqual([l.createOff, l.createBg], [false, AMBER], `${name}: the field empty again — as before`);
    assert.notEqual(l.joinBg, AMBER, name);
    // an invitation link puts the code in: joining at once
    const inv = await open(ctx, base + '?room=123456&net=local');
    l = await look(inv.page);
    assert.deepEqual([l.createOff, l.createBg, l.joinBg], [true, GREY, AMBER], `${name}: ?room= — «Увійти» is the main button`);
    assert.deepEqual(errors, []); assert.deepEqual(inv.errors, []);
    await ctx.close();
  }
});
