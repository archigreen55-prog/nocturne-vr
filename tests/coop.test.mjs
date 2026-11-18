// Кооп (plan 2026-11-15, Б10 → Б9 → Б2): honest messages when the relays are out of reach (Б10), a host that
// closed the game or went silent (Б9), a guest that comes back after a call or a reload (Б2). Two tabs of one
// Chromium talk through BroadcastChannel (?net=local), as in tests/net.test.mjs; one test cuts every WebSocket
// of the real library (Trystero) with Playwright. Real phones, calls and iPhone's sleeping tabs are for people.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, UA } from './runner.mjs';

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
  assert.match(g.status, /Твій телефон не дістає серверів зв'язку/);
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
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  await host.page.waitForFunction(() => !document.querySelector('#netstart').disabled);
  await host.page.click('#netstart');
  for (const p of [host.page, guest.page]) await p.evaluate(() => { const g = window.__game; for (const l of g.lurkers) l.update = () => {}; for (const x of g.guards) x.update = () => null; });
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
