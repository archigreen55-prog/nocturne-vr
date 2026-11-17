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

