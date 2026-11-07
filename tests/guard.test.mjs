// W15 «За сторожа» (plan-multiplayer §2 (в), Р12 — А, Р13 — «Схопити» + automatically at 0.5 m). Two tabs
// of one Chromium over BroadcastChannel (?net=local), as in net.test.mjs. What is checked: the role from
// the lobby (one guard, only before the clock), the guard's body is the first guard on the host, the
// guard's screen shows a thief only in the light or close (with a line of sight), the guard hears only
// what a guard would, «Викликати Центральну» is grey until the guard saw a thief or a missing item,
// «Схопити» in reach / a miss / walking into a thief, the bench and the fence round the van, who wins,
// the host as the guard, the guard's phone by finger and the guard in the VR emulator.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, base, LAND, UA, quickTap } from './runner.mjs';

const wait = (page, ms) => page.waitForTimeout(ms);
async function run(pages, seconds) {
  for (let t = 0; t < seconds; t += 0.1) {
    for (const p of pages) await p.evaluate(() => window.__game.sim(0.1));
    await wait(pages[0], 30);
  }
}
async function until(pages, fn, arg, seconds = 6) {
  for (let t = 0; t < seconds; t += 0.2) {
    const r = await pages[pages.length - 1].evaluate(fn, arg);
    if (r) return r;
    await run(pages, 0.2);
  }
  return pages[pages.length - 1].evaluate(fn, arg);
}
// host + guest in one room; the lurkers asleep (they are not part of this)
async function room(code, ctxOpts = { viewport: { width: 1000, height: 700 } }, guestOpts = {}) {
  const ctx = await newContext(browser, ctxOpts);
  // traps in the host's van (W2b): its wallet before the game starts
  if (guestOpts.stock) await ctx.addInitScript((stock) => { try { localStorage.setItem('nocturne.wallet', JSON.stringify({ cash: 0, earned: 0, spent: 0, owned: [], paid: {}, log: [], stock, trialSoap: false })); } catch { /* opaque */ } }, guestOpts.stock);
  const host = await open(ctx, base + '?net=local');
  await host.page.evaluate((code) => window.__game.net.open(code, 'host', 'Аня', 'zoya'), code);
  const guest = await open(ctx, base + '?net=local');
  await guest.page.evaluate((code) => window.__game.net.open(code, 'guest', 'Оля', 'nazar'), code);
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; });
  if (!guestOpts.keepGuards) await host.page.evaluate(() => { for (const p of window.__game.guards.slice(1)) p.update = () => null; });
  await run(pages, 0.6);
  return { ctx, host, guest, pages };
}
const G = (page, fn, arg) => page.evaluate(fn, arg);
const pressGuardButton = (page) => page.click('#netguard');

test('guard: the role from the lobby, the guard\'s view (light / dark), its ears, «Схопити», the bench, «Центральна» after evidence', async () => {
  const { ctx, host, guest, pages } = await room('314159');
  // the lobby: «Стати сторожем» on the guest; the host lists it as the guard; only one guard
  const b0 = await G(guest.page, () => ({ t: document.querySelector('#netguard').textContent, is: document.querySelector('#netguardis').textContent }));
  assert.equal(b0.t, 'Стати сторожем');
  assert.equal(b0.is, 'Сторож: AI');
  await pressGuardButton(guest.page);
  await run(pages, 0.8);
  const roles = await Promise.all(pages.map((p) => G(p, async () => { const { G: S } = await import('./src/systems/state.js'); return { role: S.role, gp: S.guardPid, human: S.humanGuard, manual: !!window.__game.patrol.manual, list: document.querySelector('#netlist').textContent, btn: document.querySelector('#netguard').textContent, dis: document.querySelector('#netguard').disabled }; })));
  assert.equal(roles[1].role, 'guard', 'the guest is the guard');
  assert.equal(roles[0].role, 'thief');
  assert.ok(roles[0].gp && roles[0].gp === roles[1].gp, JSON.stringify(roles));
  assert.equal(roles[0].manual, true, 'the host switched the first guard\'s mind off');
  assert.ok(/Оля[^·]*·[^·]*·[^·]*сторож|Оля.*сторож/.test(roles[0].list), roles[0].list);
  assert.equal(roles[1].btn, 'Бути злодієм');
  assert.equal(roles[0].dis, true, 'one guard per room: the host cannot take the role');
  // the guard stands where the guard starts; the host's first guard follows the guest's body
  const gs = await G(guest.page, () => ({ x: window.__game.player.head.x, z: window.__game.player.head.z }));
  await run(pages, 0.6);
  const hp = await G(host.page, () => ({ x: window.__game.patrol.x, z: window.__game.patrol.z }));
  assert.ok(Math.hypot(hp.x - gs.x, hp.z - gs.z) < 0.3, `host patrol at the guard: ${JSON.stringify([gs, hp])}`);
  // the guard's own body is hidden on its screen; the host's thief is not drawn (not seen yet)
  const view0 = await G(guest.page, () => ({ body: window.__game.patrol.body.material.visible, host: window.__game.net.state().remotes.find((r) => r.pid) }));
  assert.equal(view0.body, false, 'the guard does not see its own body');
  // «Викликати Центральну» is grey before any evidence; pressing it says why
  await G(host.page, () => { window.__game.player.teleport(-4, 1.6, 0); });   // the clock starts when a thief leaves the van
  await run(pages, 1);
  const ph = await G(host.page, () => window.__game.round.phase);
  assert.equal(ph, 'heist', 'the round runs ' + JSON.stringify(await G(host.page, async () => { const { G: S } = await import('./src/systems/state.js'); return { p: S.players.map((p) => [p.head.x, p.head.z]), me: [S.player.head.x, S.player.head.z], playing: window.__game.playing, ph: S.round.phase, caughtT: S.caughtT, tut: !!S.tutorial }; })));
  // the guard goes somewhere far from the thief, in the dark: nothing to see
  await G(guest.page, () => { window.__game.player.teleport(-7.4, -10.4, Math.PI); });
  await run(pages, 0.8);
  const grey = await G(guest.page, async () => { const { guardButton, guardInteract } = await import('./src/systems/humanGuard.js'); const b = guardButton(); guardInteract(); return { b, flash: window.__game.flashText }; });
  assert.equal(grey.b.label, 'Викликати Центральну');
  assert.equal(grey.b.off, true, 'grey before the guard saw anything ' + JSON.stringify(await G(host.page, () => { const P = window.__game.patrol; return { ev: P.evidence, it: P.evidenceItem, sees: P.humanSees.size, x: P.x, z: P.z, h: P.heading }; })));
  assert.equal(grey.flash, 'Спершу треба когось побачити');
  // a guest that bypasses the button: the host refuses too
  await G(guest.page, async () => { const { G: S } = await import('./src/systems/state.js'); S.netIntent('central'); });
  await run(pages, 0.5);
  assert.equal(await G(host.page, () => window.__game.alert.full), false, 'no alarm without evidence');

  // ears: a thief's noise far from the guard draws no ripple on the guard's screen (the host still counts it)
  const ears = await G(guest.page, async () => {
    const { G: S } = await import('./src/systems/state.js');
    const far = { x: 6, z: 6, radius: 2, kind: 'step', source: 'player', who: S.player }, near = { x: S.player.head.x + 1, z: S.player.head.z, radius: 3, kind: 'step', source: 'player', who: S.player };
    return { far: !!S.noise.filter(far), near: !!S.noise.filter(near), guardOwn: !!S.noise.filter({ x: 0, z: 0, radius: 1, source: 'patrol' }) };
  });
  assert.deepEqual(ears, { far: false, near: true, guardOwn: true }, 'the guard hears what a guard would');
  // shouting does not ring the alarm by itself while a friend plays the guard
  await G(host.page, async () => { const g = window.__game, { S } = await import('./src/i18n/index.js'); g.noise.emit(g.player.head.x, g.player.head.z, 9, 'shout'); g.alert.setFull(S.cause.shout, 0, 0); g.alert.add(5); });
  await run(pages, 0.4);
  assert.equal(await G(host.page, () => window.__game.alert.full), false, 'a shout is for the guard to hear, not an alarm');
  const yell = await G(host.page, async () => { const g = window.__game, { voiceNoise } = await import('./src/systems/heist.js'), { G: S } = await import('./src/systems/state.js'); voiceNoise(S.player, S, 0.016, true, 0.9, true, false); return { full: g.alert.full, flash: g.flashText }; });
  assert.deepEqual(yell, { full: false, flash: 'Крик! Сторож міг почути' }, 'the thief is told the truth');

  // light / dark: the host's thief in a dark room in front of the guard at 3 m — not drawn; at 1.5 m — drawn
  const spot = { a: { x: -4, z: 4.2 }, b3: { x: -4, z: 1.2 }, b1: { x: -4, z: 2.7 } };   // the yard (net.test.mjs: the AI guard sees a thief here)
  assert.ok(spot, 'an open line');
  await G(guest.page, (s) => { window.__game.player.teleport(s.a.x, s.a.z, 0); }, spot);
  await G(host.page, (s) => { window.__game.player.teleport(s.b3.x, s.b3.z, 0); window.__game.player.flashlight && (window.__game.player.flashlight.on = false); }, spot);
  await run(pages, 1);
  // the rule: drawn when the game sees it — visible, and lit or nearer than darkSight (2 m)
  const far = await G(host.page, () => { const g = window.__game, P = g.patrol, me = g.player; g.lights && null; const r = P.look(me); return { visible: r.visible, lit: r.lit, d: +r.d.toFixed(2), sees: P.humanSees.has(me) }; });
  assert.equal(far.sees, far.visible && (far.lit || far.d < 2), `3 m: ${JSON.stringify(far)}`);
  // and in the dark: the same 3 m with no light on the thief — not drawn
  await G(host.page, () => { const P = window.__game.patrol; P.__look = P.look; P.look = (p) => ({ ...P.__look(p), lit: false }); P.evidence = null; });
  await run(pages, 1);
  const dark = await G(host.page, () => { const P = window.__game.patrol; return { sees: P.humanSees.has(window.__game.player), ev: P.evidence }; });
  assert.deepEqual(dark, { sees: false, ev: null }, 'dark at 3 m: not seen');
  const darkOnGuest = await until([host.page, guest.page], () => { const r = window.__game.net.state().remotes.find((x) => x.pid); return r && r.drawn === false; });
  assert.equal(darkOnGuest, true, 'not drawn on the guard\'s screen');
  await G(host.page, (s) => { const P = window.__game.patrol; P.look = P.__look; window.__game.player.teleport(s.b1.x, s.b1.z, 0); }, spot);
  await run(pages, 1);
  const near = await G(host.page, () => { const P = window.__game.patrol, me = window.__game.player; return { sees: P.humanSees.has(me), ev: P.evidence }; });
  assert.equal(near.sees, true, 'close (1.5 m) with a line of sight: seen');
  assert.equal(near.ev, 'seen', 'evidence: the guard saw a thief');
  const nearOnGuest = await until([host.page, guest.page], () => { const r = window.__game.net.state().remotes.find((x) => x.pid); return r && r.drawn; });
  assert.equal(nearOnGuest, true, 'drawn on the guard\'s screen');
  const note = await until([host.page, guest.page], async () => { const { guardButton } = await import('./src/systems/humanGuard.js'); return !guardButton().off && window.__game.flashText; });
  assert.ok(note, 'the button is no longer grey');

  // «Схопити»: the thief at 0.7 m in front — caught; to the van for the bench; its noise is not a thief's
  await G(host.page, (s) => { window.__game.player.teleport(s.a.x, s.a.z - 0.7, 0); }, spot);
  await run(pages, 0.6);
  const lbl = await G(guest.page, async () => { const { guardButton } = await import('./src/systems/humanGuard.js'); return guardButton().label; });
  assert.equal(lbl, 'Схопити');
  await G(guest.page, async () => { const { guardInteract } = await import('./src/systems/humanGuard.js'); guardInteract(); });
  await run(pages, 0.6);
  const bench = await G(host.page, async () => { const g = window.__game, S0 = g.level.spawn, { G: S } = await import('./src/systems/state.js'); return { b: S.benchT, phase: g.round.phase, atVan: Math.hypot(g.player.head.x - S0.x, g.player.head.z - S0.z) < 0.7, caught: g.patrol.caughtCount }; });
  assert.ok(bench.b > 50, 'the host\'s thief is on the bench: ' + JSON.stringify(bench));
  assert.equal(bench.atVan, true, 'in the van');
  assert.equal(bench.phase, 'result', 'the only thief caught: the guard wins');
  const res = await until([host.page, guest.page], () => window.__game.round.phase === 'result' && document.querySelector('#netlist') && window.__game.round.result.kind);
  assert.equal(res, 'caught');
  const summary = await G(guest.page, async () => { const { guardResultText } = await import('./src/systems/humanGuard.js'); return guardResultText(); });
  assert.ok(/Сторож переміг · спіймано: 1/.test(summary), summary);
  const rec = await G(guest.page, async () => { const { loadSetting } = await import('./src/settings.js'); return loadSetting('guard', null); });
  assert.deepEqual(rec, { rounds: 1, wins: 1, caught: 1 }, 'the guard\'s own record');

  // a new round: roles can change only now; the guest gives the role back
  await G(host.page, () => window.__game.newRound());
  await run(pages, 1);
  await pressGuardButton(guest.page);
  await run(pages, 0.8);
  const back = await Promise.all(pages.map((p) => G(p, async () => { const { G: S } = await import('./src/systems/state.js'); return { role: S.role, human: S.humanGuard, manual: !!window.__game.patrol.manual, body: window.__game.patrol.body.material.visible }; })));
  assert.deepEqual(back.map((b) => b.role), ['thief', 'thief']);
  assert.equal(back[0].manual, false, 'the AI guard is back');
  assert.equal(back[1].body, true);
  assert.deepEqual(host.errors, [], 'host errors');
  assert.deepEqual(guest.errors, [], 'guest errors');
  await ctx.close();
});

test('guard: the host plays the guard — «Мимо!», «Центральна» after it saw a thief, walking into a thief, the fence; the thieves win too', async () => {
  const { ctx, host, guest, pages } = await room('271801');
  await pressGuardButton(host.page);
  await run(pages, 0.8);
  const r0 = await Promise.all(pages.map((p) => G(p, async () => { const { G: S } = await import('./src/systems/state.js'); return { role: S.role, human: S.humanGuard, list: document.querySelector('#netlist').textContent }; })));
  assert.deepEqual(r0.map((x) => x.role), ['guard', 'thief']);
  assert.ok(/Аня.*сторож/.test(r0[1].list), r0[1].list);
  // the host's own player is not a thief in the house; the guest is
  const inGame = await G(host.page, async () => { const { G: S } = await import('./src/systems/state.js'); return { me: S.players.includes(S.player), n: S.players.length }; });
  assert.deepEqual(inGame, { me: false, n: 1 });
  // the fence: the guard walks to the van — pushed back to 4 m
  await G(host.page, () => { const g = window.__game, V = g.CFG.round.vanZone; g.player.teleport(V.x + 1, V.z, 0); });
  await run(pages, 0.3);
  const fence = await G(host.page, () => { const g = window.__game, V = g.CFG.round.vanZone; return { d: +Math.hypot(g.player.head.x - V.x, g.player.head.z - V.z).toFixed(2), flash: g.flashText }; });
  assert.ok(fence.d >= 3.99, JSON.stringify(fence));
  assert.equal(fence.flash, 'Біля фургона — не твоя ділянка');
  // the clock: the guest leaves the van; the guard at the yard, facing it
  await G(guest.page, () => window.__game.player.teleport(-4, 1.6, 0));
  await G(host.page, () => window.__game.player.teleport(-4, 6.5, 0));
  await run(pages, 0.6);
  assert.equal(await G(host.page, () => window.__game.round.phase), 'heist');
  // «Схопити» with nobody in reach: «Мимо!»
  await G(host.page, async () => { const { guardInteract } = await import('./src/systems/humanGuard.js'); window.__game.patrol.grabAsk = true; void guardInteract; });
  await run(pages, 0.3);
  assert.equal(await G(host.page, () => window.__game.flashText), 'Мимо!');
  // the guard comes close: it sees the guest → «Викликати Центральну» works → the alarm (cause «Центральна»)
  await G(host.page, () => window.__game.player.teleport(-4, 3.2, 0));
  await run(pages, 0.6);
  const ev = await G(host.page, async () => { const { guardButton } = await import('./src/systems/humanGuard.js'); return { ev: window.__game.patrol.evidence, b: guardButton() }; });
  assert.equal(ev.ev, 'seen');
  assert.deepEqual(ev.b, { label: 'Викликати Центральну', off: false });
  await G(host.page, async () => { const { guardInteract } = await import('./src/systems/humanGuard.js'); guardInteract(); });
  await run(pages, 0.4);
  const alarm = await Promise.all(pages.map((p) => G(p, () => ({ full: window.__game.alert.full, phase: window.__game.round.phase, cause: window.__game.round.cause, flash: window.__game.flashText }))));
  assert.equal(alarm[0].full, true);
  assert.equal(alarm[0].phase, 'escape');
  assert.equal(alarm[0].cause, 'Центральна');
  assert.equal(alarm[0].flash, 'Сторож викликав Центральну!');
  // walking into the thief catches it (0.5 m): the guest sits in the van, the guard wins (one thief)
  await G(host.page, () => { const r = window.__game.net.state().remotes[0]; window.__game.player.teleport(r.x, r.z + 0.3, 0); });
  await run(pages, 0.4);
  const caught = await until(pages, async () => { const { G: S } = await import('./src/systems/state.js'); return S.benchT > 0 && { b: S.benchT, flash: window.__game.flashText }; });
  assert.ok(caught && caught.b > 55, 'the guest is on the bench: ' + JSON.stringify(caught));
  const ends = await until(pages, () => window.__game.round.phase === 'result' && window.__game.round.result.kind);
  assert.equal(ends, 'caught');

  // the next round: the thieves deliver the goal and gather at the van — the thieves win
  await G(host.page, () => window.__game.newRound());
  await run(pages, 1);
  const fresh = await G(guest.page, async () => { const { G: S } = await import('./src/systems/state.js'); return { b: S.benchT, phase: window.__game.round.phase }; });
  assert.deepEqual(fresh, { b: 0, phase: 'ready' }, 'a new round: off the bench');
  await G(guest.page, () => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 0.6);
  await G(host.page, async () => { const { G: S } = await import('./src/systems/state.js'); S.contract = { ...S.contract, goal: { sum: 1 } }; const it = S.loot.items.find((i) => !i.throwable && !i.trap && !i.prop && !i.heavy); it.delivered = true; });
  await G(guest.page, () => { const g = window.__game, V = g.CFG.round.vanZone; g.player.teleport(V.x, V.z, 0); });
  const won = await until(pages, () => window.__game.round.phase === 'result' && window.__game.round.result.kind);
  assert.equal(won, 'left', 'the thieves won');
  const sum = await G(host.page, async () => { const { guardResultText } = await import('./src/systems/humanGuard.js'); return guardResultText(); });
  assert.ok(/^Злодії втекли · спіймано: 0/.test(sum), sum);
  assert.deepEqual(host.errors, [], 'host errors');
  assert.deepEqual(guest.errors, [], 'guest errors');
  await ctx.close();
});

test('guard: the guard\'s phone by finger (Pixel landscape) — grey «Викликати Центральну», then «Схопити»; the guard in the VR emulator presses A', async () => {
  const { ctx, host, guest, pages } = await room('662607', LAND);
  const cdp = await ctx.newCDPSession(guest.page);
  await G(guest.page, async () => { const { netRole } = await import('./src/systems/net.js'); netRole(true); });
  await run(pages, 0.8);
  await guest.page.locator('#start').scrollIntoViewIfNeeded();
  await guest.page.tap('#start');
  await guest.page.waitForFunction(() => window.__game.playing);
  await G(guest.page, () => { for (const l of window.__game.lurkers) l.update = () => {}; });
  await G(host.page, () => window.__game.player.teleport(-4, 1.6, 0));
  await G(guest.page, () => { const p = window.__game.player; p.teleport(-4, 9, Math.PI); p.lookYaw = Math.PI; p.lookPitch = 0; /* its back to the thief */ });
  await run(pages, 0.8);
  const btn = await G(guest.page, () => { const b = document.querySelector('#touch .act'); return { t: b.textContent, off: b.classList.contains('off'), hidden: b.hidden }; });
  assert.deepEqual(btn, { t: 'Викликати Центральну', off: true, hidden: false }, 'grey before evidence ' + JSON.stringify(btn));
  const tapAct = async () => quickTap(cdp, await G(guest.page, () => { const b = document.querySelector('#touch .act').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
  await tapAct();
  await run(pages, 0.2);
  assert.equal(await G(guest.page, () => window.__game.flashText), 'Спершу треба когось побачити');
  // the thief right in front of the guard: «Схопити» by finger
  await G(guest.page, () => { const p = window.__game.player; p.teleport(-4, 2.3, 0); p.lookYaw = 0; });
  await run(pages, 1);
  const b2 = await G(guest.page, () => { const b = document.querySelector('#touch .act'); return { t: b.textContent, off: b.classList.contains('off') }; });
  assert.deepEqual(b2, { t: 'Схопити', off: false });
  await tapAct();
  const benched = await until([guest.page, host.page], async () => { const { G: S } = await import('./src/systems/state.js'); return S.benchT > 0; }, null, 4);   // the intent reaches the host in real time
  assert.equal(benched, true, 'caught by finger');
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  await ctx.close();

  // VR: the guest guard presses A with nobody near and no evidence — the same hint
  const vctx = await newContext(browser, { userAgent: UA.quest });
  await vctx.addInitScript({ content: (readFileSync(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const vh = await open(vctx, base + '?net=local');
  await vh.page.evaluate(() => window.__game.net.open('662608', 'host', 'Аня', 'zoya'));
  const vg = await open(vctx, base + '?net=local');
  await vg.page.evaluate(() => window.__game.net.open('662608', 'guest', 'Оля', 'nazar'));
  await vg.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  // ask for the role until the host answers (a busy machine: the host tab gets few frames)
  let role = null;
  for (let i = 0; i < 30 && role !== 'guard'; i++) {
    role = await vg.page.evaluate(async () => { const { G: S } = await import('./src/systems/state.js'); if (S.role !== 'guard') { const { netRole } = await import('./src/systems/net.js'); netRole(true); } return S.role; });
    if (role !== 'guard') await wait(vg.page, 500);
  }
  assert.equal(role, 'guard', 'the VR guest is the guard');
  await vg.page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await vg.page.click('#vrbutton');
  await vg.page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await vh.page.evaluate(() => { window.__game.playing = true; window.__game.player.teleport(-4, 1.6, 0); });
  await wait(vg.page, 800);
  await vg.page.evaluate(() => window.__xrDevice.controllers.right.updateButtonValue('a-button', 1));
  await wait(vg.page, 300);
  await vg.page.evaluate(() => window.__xrDevice.controllers.right.updateButtonValue('a-button', 0));
  await wait(vg.page, 200);
  assert.equal(await vg.page.evaluate(() => window.__game.flashText), 'Спершу треба когось побачити', 'A is the guard\'s button in VR');
  await vg.page.evaluate(() => window.__game.renderer.xr.getSession().end());
  assert.deepEqual(vh.errors, []);
  assert.deepEqual(vg.errors, []);
  await vctx.close();
});

// W15 + traps: in the host's page, a trap of `kind` from the van put down at (x, z) / on door d (as if placed there)
const TRAP = `
  window.__t = (() => {
    const g = window.__game;
    const trap = (kind) => g.loot.items.find((i) => i.trap === kind && !i.gone && !i.armed);
    const put = (kind, x, z) => { const it = trap(kind); it.inVan = false; it.held = false; it.state = 'rest'; it.vel.set(0, 0, 0); it.mesh.position.set(x, 0, z); return it; };
    const onDoor = (kind, d) => { const it = trap(kind); it.inVan = false; it.held = false; it.state = 'rest'; it.vel.set(0, 0, 0); it.door = d; it.angle0 = d.angle; it.armed = true; it.mesh.position.set(d.cx, d.y0 + (kind === 'bucket' ? 2.08 : 0.02), d.cz); return it; };
    return { g, trap, put, onDoor };
  })();`;
const STOCK = { soap: 1, marbles: 1, bucket: 1, rope: 1 };

test('guard + traps: soap and marbles knock the guest guard down like the AI guard — its «лежу N с», the camera on the floor, no walking, catches nobody meanwhile; the combo and the points', async () => {
  const { ctx, host, guest, pages } = await room('602214', undefined, { stock: STOCK });
  await G(host.page, () => { window.__game.CFG.traps.limit = 5; window.__game.newRound(); window.__game.playing = true; for (const l of window.__game.lurkers) l.update = () => {}; for (const p of window.__game.guards.slice(1)) p.update = () => null; });
  await run(pages, 0.6);
  await pressGuardButton(guest.page);
  await run(pages, 0.8);
  assert.equal(await G(guest.page, async () => { const { G: S } = await import('./src/systems/state.js'); return S.role; }), 'guard');
  const inVan = await G(host.page, () => window.__game.loot.items.filter((i) => i.trap && !i.gone).map((i) => i.trap).sort());
  assert.deepEqual(inVan, ['bucket', 'marbles', 'rope', 'soap'], 'the traps are in the van');
  // the clock: the host's thief walks out; the guard stands in the yard
  await G(host.page, () => window.__game.player.teleport(-4, 1.6, Math.PI));
  await G(guest.page, () => window.__game.player.teleport(-1, 4, 0));
  await run(pages, 1);
  assert.equal(await G(host.page, () => window.__game.round.phase), 'heist');
  // soap right under the guard: it slips — flat on its back, 6 s (medium), +100
  await host.page.evaluate(TRAP);
  const soap = await G(host.page, async () => { const { mischief } = await import('./src/game/mischief.js'); const P = window.__t.g.patrol; window.__t.put('soap', P.x, P.z + 0.1); window.__t.g.sim(0.1); return { stunT: +P.stunT.toFixed(1), pose: P.pose, manual: P.manual, score: mischief.score }; });
  assert.deepEqual(soap, { stunT: 5.9, pose: 'flip', manual: true, score: 100 }, 'the guard slipped like the AI guard');
  // the guest guard's own screen: «лежу N с», the camera on the floor looking up, the dark; no walking
  const down = await until(pages, async () => { const { G: S } = await import('./src/systems/state.js'); return S.guardStunned && { flash: window.__game.flashText, fade: +S.comfort.fade.toFixed(2), camY: +S.camera.position.y.toFixed(2), pitch: +S.camera.rotation.x.toFixed(2) }; });
  assert.ok(down && /^Послизнувся на милі — лежиш ще \d с$/.test(down.flash), JSON.stringify(down));
  assert.deepEqual([down.fade, down.camY, down.pitch], [0.35, 0.35, 1.3], 'the camera lies on the floor looking at the ceiling');
  const walk = async () => G(guest.page, async () => {
    const { G: S } = await import('./src/systems/state.js'), p = S.player, x0 = p.head.x, z0 = p.head.z;
    S.playingDesktop = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 10; i++) window.__game.sim(0.05);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); window.__game.sim(0.02); S.playingDesktop = false;
    return +Math.hypot(p.head.x - x0, p.head.z - z0).toFixed(2);
  });
  assert.equal(await walk(), 0, 'no walking while down');
  // the thieves see it lying (the same pose as the AI guard)
  assert.equal(await G(host.page, () => window.__game.guards[0].pose), 'flip');
  // the host's thief right next to the lying guard: not caught; the button does nothing either
  await G(host.page, () => { const P = window.__game.patrol; window.__game.player.teleport(P.x + 0.35, P.z, 0); });
  await G(guest.page, async () => { const { guardInteract } = await import('./src/systems/humanGuard.js'); guardInteract(); });
  await run(pages, 1);
  assert.equal(await G(host.page, async () => { const { G: S } = await import('./src/systems/state.js'); return S.benchT; }), 0, 'catches nobody while down');
  await G(host.page, () => window.__game.player.teleport(-4, 1.6, Math.PI));
  // up again after 6 s: «Знову на ногах», the dark goes, it walks
  const up = await until(pages, async () => { const { G: S } = await import('./src/systems/state.js'); return !S.guardStunned && window.__game.flashText; }, null, 8);
  assert.equal(up, 'Знову на ногах');
  await run(pages, 0.6);
  assert.ok((await G(guest.page, async () => { const { G: S } = await import('./src/systems/state.js'); S.comfort.update(0.5, 0, false); return S.comfort.fade; })) < 0.05, 'the dark is gone (the frame loop fades it out; a test tab may get no frames)');
  assert.ok(await walk() > 0.1, 'walks again');
  // marbles within the combo window: on its knees, 5 s; the combo x2 (+200)
  const marbles = await G(host.page, async () => { const { mischief } = await import('./src/game/mischief.js'); const P = window.__t.g.patrol; window.__t.put('marbles', P.x, P.z + 0.2); window.__t.g.sim(0.1); return { stunT: +P.stunT.toFixed(1), pose: P.pose, score: mischief.score, best: mischief.best }; });
  assert.deepEqual(marbles, { stunT: 4.9, pose: 'kneel', score: 300, best: 2 }, 'combo x2 as with the AI guard');
  const knees = await until(pages, async () => { const { G: S } = await import('./src/systems/state.js'); return S.guardStunned && /Кульки! На колінах ще \d с/.test(window.__game.flashText) && { camY: +S.camera.position.y.toFixed(2), pitch: +S.camera.rotation.x.toFixed(2) }; });
  assert.deepEqual(knees, { camY: 0.8, pitch: -0.75 }, 'on its knees, looking at the floor');
  assert.equal(await G(host.page, () => window.__game.guards[0].pose), 'kneel');
  // once up, walking into the thief catches it again
  await until(pages, async () => { const { G: S } = await import('./src/systems/state.js'); return !S.guardStunned; }, null, 7);
  await G(host.page, () => { const P = window.__game.patrol; window.__game.player.teleport(P.x + 0.3, P.z, 0); });
  const caught = await until([guest.page, host.page], async () => { const { G: S } = await import('./src/systems/state.js'); return S.benchT > 0; });
  assert.equal(caught, true, 'up again: it catches');
  assert.deepEqual(host.errors, [], 'host errors');
  assert.deepEqual(guest.errors, [], 'guest errors');
  await ctx.close();
});

test('guard + traps: the host plays the guard — the bucket on a door (its dark), the rope in a doorway; the guest thief sees the poses', async () => {
  const { ctx, host, guest, pages } = await room('602215', undefined, { stock: STOCK });
  await G(host.page, () => { window.__game.CFG.traps.limit = 5; window.__game.newRound(); window.__game.playing = true; for (const l of window.__game.lurkers) l.update = () => {}; for (const p of window.__game.guards.slice(1)) p.update = () => null; });
  await run(pages, 0.6);
  await pressGuardButton(host.page);
  await run(pages, 0.8);
  await G(guest.page, () => window.__game.player.teleport(-4, 1.6, 0));
  await run(pages, 1);
  assert.equal(await G(host.page, () => window.__game.round.phase), 'heist');
  await host.page.evaluate(TRAP);
  // the bucket on a ground-floor door; the guard opens it: the bucket on its head
  const b = await G(host.page, async () => {
    const t = window.__t, g = t.g, d = g.level.doors.find((x) => !x.locked && x.floor === 0 && !g.level.doors.some((y) => y !== x && Math.hypot(y.cx - x.cx, y.cz - x.cz) < 3));
    t.onDoor('bucket', d);
    g.player.teleport(d.cx + Math.sin(d.base) * 0.8, d.cz + Math.cos(d.base) * 0.8, 0); g.sim(0.2);
    g.useDoor(d); for (let i = 0; i < 10; i++) g.sim(0.1);
    const { G: S } = await import('./src/systems/state.js');
    return { pose: g.patrol.pose, stunT: +g.patrol.stunT.toFixed(1), down: S.guardStunned, fade: +S.comfort.fade.toFixed(2), flash: g.flashText };
  });
  assert.equal(b.pose, 'bucket', JSON.stringify(b));
  assert.equal(b.down, true);
  assert.equal(b.fade, 0.93, 'the bucket\'s dark');
  assert.ok(/^Відро на голові — нічого не видно ще \d с$/.test(b.flash), b.flash);
  const seen = await until(pages, () => window.__game.guards[0].pose === 'bucket');
  assert.equal(seen, true, 'the thief sees the bucket on the guard\'s head');
  await until([guest.page, host.page], async () => { const { G: S } = await import('./src/systems/state.js'); return !S.guardStunned; }, null, 8);
  // the rope across another doorway; the guard walks through it: it trips, on its knees 3 s
  const r = await G(host.page, async () => {
    const t = window.__t, g = t.g, d = g.level.doors.filter((x) => !x.locked && x.floor === 0)[1];
    t.onDoor('rope', d);
    const nx = Math.sin(d.base + Math.PI / 2), nz = Math.cos(d.base + Math.PI / 2);   // across the doorway
    let hit = null;
    for (let k = -1; k <= 1 && !hit; k += 0.1) { g.player.teleport(d.cx + nx * k, d.cz + nz * k, 0); g.sim(0.05); if (g.patrol.stunT > 0) hit = { pose: g.patrol.pose, stunT: +g.patrol.stunT.toFixed(1) }; }
    return hit;
  });
  assert.ok(r && r.pose === 'kneel' && r.stunT > 2.5, JSON.stringify(r));
  assert.ok(/^Перечепився через мотузку — встаєш ще \d с$/.test(await G(host.page, () => window.__game.flashText)));
  assert.equal(await until(pages, () => window.__game.guards[0].pose === 'kneel'), true, 'the thief sees it on its knees');
  assert.deepEqual(host.errors, [], 'host errors');
  assert.deepEqual(guest.errors, [], 'guest errors');
  await ctx.close();
});
