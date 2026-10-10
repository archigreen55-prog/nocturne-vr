// W7: Шепотун (story-bible.md §4.3) — the lurker behind the living-room fireplace grate on the dacha. A
// whisper close to it (the microphone's level between your silence and your voice): «ш-ш-ш» and dust,
// 3 s later the echo — a synthesised whisper from the grate (noise shaped by the loudness numbers,
// never the microphone's sound) and a 'voice' noise there: Petrovych comes and says «Протяг.». Silence,
// a normal voice, another room, contracts 1–3, a held breath: nothing. Three whispers close by: fed —
// it tells where the guard is. No microphone: a can landing by the grate wakes one echo. Phone, PC, VR.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext, ROOT } from './harness.mjs';
import { browser, open, test, preview, playPhone, UA, MIC_CAL, LAND } from './runner.mjs';

const dbg = (r) => { if (process.env.DBG) console.log(JSON.stringify(r)); };
// the game's microphone «on», calibrated like MIC_CAL, its level = window.__db (dB); the contract
const fakeMic = (page, contract = 'silent') => page.evaluate(([cal, contract]) => {
  const g = window.__game, m = g.mic;
  m.state = 'on'; m.cal = { ...cal }; m.calibrated = true; m.noMic = false;
  window.__db = -62;
  m.feed = () => window.__db + (Math.random() - 0.5);
  window.__noises = [];
  const em = g.noise.emit.bind(g.noise); g.noise.emit = (x, z, r, k, o) => { window.__noises.push({ x: +x.toFixed(1), z: +z.toFixed(1), r, k, src: o && o.source }); return em(x, z, r, k, o); };
  window.__said = [];
  for (const p of g.guards) { const s = p.env.say; p.env.say = (t) => { window.__said.push(t); s(t); }; }
  g.newRound(); g.setContract(contract); g.playing = true;
  for (const l of g.lurkers) l.update = () => {};
  g.player.teleport(0, -2.5, 0); g.sim(0.3);
  window.__diag = () => ({ c: g.contract.id, w: m.whispering, env: +m.env.toFixed(1), lo: +m.whisperLow.toFixed(1), eff: +m.whisperEff.toFixed(1), lv: m.level, st: m.state });
}, [MIC_CAL, contract]);
// in the page: helpers (whisper for `s` seconds at `db`, then silence; the whisperer's state)
// contracts 4+ open with «Відкрити все» (a preview)
const openAll = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem('nocturne.preview.openAll', 'true'); } catch { /* */ } });
const H = `window.__w = (() => {
  const g = window.__game;
  const say = (s, db = -48) => { window.__db = db; g.sim(s); window.__db = -62; g.sim(0.1); };
  const park = (P, x, z) => { P.interrupt(); P.state = 'task'; P.path = []; P.timer = 0; P.x = x; P.z = z; P.y = 0; P.queue.push({ type: 'wait', t: 999, label: 'test' }); };
  const until = (fn, s = 30) => { for (let t = 0; t < s && !fn(); t += 0.1) g.sim(0.1); return fn(); };
  return { g, say, park, until };
})();`;

test('Шепотун (PC): a whisper 2 m from the fireplace — «ш-ш-ш» and dust, 3 s later the echo (a synthesised whisper from noise, a \'voice\' noise at the grate), Petrovych comes: «Протяг.»; its card in Тихарник; silence, a normal voice, the bedroom behind the wall, a held breath, contract 1: nothing', async () => {
  const ctx = await newContext(browser); await openAll(ctx);
  const { page, errors } = await open(ctx, preview);
  await fakeMic(page);
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, say, park, until } = window.__w, P = g.patrol, out = {};
    const St = await import('./src/game/story.js'), { whisperInfo } = await import('./src/audio/whisperSfx.js');
    const dust = () => g.scene.getObjectByName('whisperer dust').visible;
    out.grate = !!g.scene.getObjectByName('whisperer grate');
    park(P, -6, -2.5);   // the kitchen: it hears the echo? (no: 6 m radius) — moved closer below
    g.player.teleport(1.5, -11.3, 0); g.sim(0.1);
    // silence and a voice: nothing
    say(1.2, -62); say(1.2, -30); g.sim(4.5);
    out.quiet = { echoes: whisperInfo.count, voiceAtGrate: window.__noises.filter((n) => n.src === 'world' && n.k === 'voice').length };
    // a whisper: the telegraph at once, the echo 3 s later
    park(P, 2.5, -8.2);
    window.__noises.length = 0;
    say(1.0); g.sim(0.3);
    out.telegraph = dust();
    g.sim(1.2); out.dustGone = !dust();
    g.sim(2.0);
    out.echo = { count: whisperInfo.count, last: whisperInfo.last, noise: window.__noises.filter((n) => n.src === 'world' && n.k === 'voice'), msg: g.flashText, card: St.hasMet('whisperer') };
    out.guardCame = until(() => window.__said.includes('Протяг.'), 30);
    out.guardState = P.state;
    // the bedroom behind the wall (3.8 m away): nothing; a held breath: nothing
    const c0 = whisperInfo.count;
    g.sim(11); g.player.teleport(5.3, -13.0, 0); g.sim(0.1); say(1.0); g.sim(4.5);
    out.wall = whisperInfo.count - c0;
    g.player.teleport(1.5, -11.3, 0); g.sim(0.1);
    const B = g.breath, up = B.update.bind(B); B.update = () => null; B.state = 'holding';
    say(1.0); g.sim(4.5); B.update = up; B.state = 'ready';
    out.breath = whisperInfo.count - c0;
    return out;
  }, H);
  // contract 1: asleep
  await fakeMic(page, 'first');
  const first = await page.evaluate(async (H) => {
    eval(H);
    const { g, say } = window.__w, { whisperInfo } = await import('./src/audio/whisperSfx.js'), c0 = whisperInfo.count;
    g.player.teleport(1.5, -11.3, 0); g.sim(0.1); say(1.0); g.sim(4.5);
    return whisperInfo.count - c0;
  }, H);
  dbg({ r, first });
  assert.equal(r.grate, true);
  assert.deepEqual(r.quiet, { echoes: 0, voiceAtGrate: 0 }, 'silence and a normal voice wake nothing');
  assert.equal(r.telegraph, true); assert.equal(r.dustGone, true);
  assert.equal(r.echo.count, 1);
  assert.equal(r.echo.last.source, 'noise', 'synthesised from noise');
  assert.ok(r.echo.last.points >= 20, `the curve of the whisper's loudness (${r.echo.last.points} numbers)`);
  assert.deepEqual(r.echo.noise.map((n) => [n.x, n.z, n.r, n.k]), [[1.5, -12.9, 6, 'voice']]);
  assert.ok(['Шепотун повторив твій шепіт!', 'Тихарник: нова картка — Шепотун'].includes(r.echo.msg), r.echo.msg);
  assert.equal(r.echo.card, true);
  assert.equal(r.guardCame, true, 'Petrovych at the grate: «Протяг.»');
  assert.equal(r.wall, 0, 'another room: nothing');
  assert.equal(r.breath, 0, 'a held breath: nothing');
  assert.equal(first, 0, 'contract 1: asleep');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Шепотун fed: three whispers 1 m from the grate within 15 s — «Шепотун нагодований…», then every 20 s «Шепотун: сторож — <кімната>»; no microphone: a can landing by the grate wakes one echo; the source has no microphone node in the echo', async () => {
  const ctx = await newContext(browser); await openAll(ctx);
  const { page, errors } = await open(ctx, preview);
  await fakeMic(page);
  const r = await page.evaluate(async (H) => {
    eval(H);
    const { g, say, park } = window.__w, out = {}, { whisperInfo } = await import('./src/audio/whisperSfx.js');
    park(g.patrol, -6, -2.5);
    g.player.teleport(1.5, -12.0, 0); g.sim(0.1);
    const msgs = new Set(); const watch = (s) => { for (let t = 0; t < s; t += 0.1) { g.sim(0.1); if (g.flashText) msgs.add(g.flashText); } };
    say(0.6); watch(1.5); say(0.6); watch(1.5); say(0.6); watch(0.3);
    out.fed = [...msgs].includes('Шепотун нагодований: шепотітиме, де сторож');
    msgs.clear(); watch(21);
    out.hint = [...msgs].filter((m) => m.startsWith('Шепотун: сторож — '));
    // no microphone: a can by the grate
    g.mic.setNoMic(true); g.sim(12);
    const c0 = whisperInfo.count, can = g.loot.items.find((i) => i.throwable && !i.bottle);
    can.mesh.position.set(1.5, 0.9, -12.6); can.thrown = true; can.thrownFrom = { x: 1.5, y: 1, z: -10 }; can.drop(new g.THREE.Vector3(0, -2, 0.5)); g.sim(4.5);
    out.can = whisperInfo.count - c0;
    g.mic.setNoMic(false);
    return out;
  }, H);
  const src = await readFile(join(ROOT, 'src/audio/whisperSfx.js'), 'utf8');
  dbg(r);
  assert.equal(r.fed, true);
  assert.ok(r.hint.length >= 1 && r.hint.every((h) => /^Шепотун: сторож — .+/.test(h)), JSON.stringify(r.hint));
  assert.equal(r.can, 1, 'no microphone: one echo from a can');
  assert.ok(!/createMediaStreamSource|getUserMedia|MediaStream/.test(src), 'the echo never touches the microphone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Шепотун on the phone and in VR (IWER Quest 3): a whisper by the fireplace — the echo and the card', async () => {
  const ctx = await newContext(browser, LAND); await openAll(ctx);
  const { page, errors } = await open(ctx, preview);
  await page.tap('#start'); await page.waitForFunction(() => window.__game.playing);
  await fakeMic(page);
  const phone = await page.evaluate(async (H) => {
    eval(H);
    const { g, say, park } = window.__w, { whisperInfo } = await import('./src/audio/whisperSfx.js'), St = await import('./src/game/story.js');
    park(g.patrol, -6, -2.5); g.player.teleport(1.5, -11.3, 0); g.sim(0.1); say(1.0); g.sim(4.5);
    return { echoes: whisperInfo.count, card: St.hasMet('whisperer') };
  }, H);
  assert.deepEqual(errors, []);
  await ctx.close();
  const vctx = await newContext(browser, { userAgent: UA.quest }); await openAll(vctx);
  await vctx.addInitScript({ content: (await readFile(join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8')) + `
    window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrDevice.installRuntime({ forceInstall: true });` });
  const v = await open(vctx, preview);
  await v.page.waitForFunction(() => /ENTER VR/i.test(document.getElementById('vrbutton').textContent));
  await v.page.click('#vrbutton');
  await v.page.waitForFunction(() => window.__game.inVR, null, { timeout: 10000 });
  await fakeMic(v.page);
  // in VR the head follows the headset's frames: teleport, then whisper in real time
  await v.page.evaluate(async (H) => { eval(H); const { g, park } = window.__w; window.__wi = (await import('./src/audio/whisperSfx.js')).whisperInfo; park(g.patrol, -6, -2.5); g.player.teleport(1.5, -11.3, 0); }, H);
  await v.page.waitForTimeout(800);
  await v.page.evaluate(() => { window.__db = -48; });
  await v.page.waitForTimeout(1200);
  await v.page.evaluate(() => { window.__db = -62; });
  await v.page.waitForFunction(() => window.__wi.count > 0, null, { timeout: 15000, polling: 200 }).catch(() => {});
  const vr = await v.page.evaluate(async () => ({ echoes: (await import('./src/audio/whisperSfx.js')).whisperInfo.count, card: (await import('./src/game/story.js')).hasMet('whisperer') }));
  dbg({ phone, vr });
  assert.deepEqual(phone, { echoes: 1, card: true });
  assert.deepEqual(vr, { echoes: 1, card: true });
  assert.deepEqual(v.errors, []);
  await vctx.close();
});

test('Шепотун with friends (two tabs, ?net=local): the guest whispers by the fireplace — its «wh» reaches the host, the host\'s whisperer echoes at the grate, the guest hears the echo and gets the card; a note the guest reads is its own (nothing goes to the host)', async () => {
  const ctx = await newContext(browser, { viewport: { width: 1000, height: 700 } }); await openAll(ctx);
  const host = await open(ctx, preview + '?net=local');
  await host.page.evaluate(() => { const g = window.__game; g.setContract('silent'); g.net.open('314159', 'host', 'Аня', 'zoya'); });
  const guest = await open(ctx, preview + '?room=314159&net=local');
  await guest.page.fill('#netname', 'Оля');
  await guest.page.click('#netjoin');
  await guest.page.waitForFunction(() => window.__game.net.state().welcomed, null, { timeout: 15000 });
  const pages = [host.page, guest.page];
  const run = async (s) => { for (let t = 0; t < s; t += 0.1) { for (const p of pages) await p.evaluate(() => window.__game.sim(0.1)); await host.page.waitForTimeout(30); } };
  for (const p of pages) await p.evaluate(() => { const g = window.__game; g.playing = true; for (const l of g.lurkers) l.update = () => {}; window.__wi = null; import('./src/audio/whisperSfx.js').then((m) => { window.__wi = m.whisperInfo; }); });
  await host.page.evaluate(() => { const g = window.__game; for (const p of g.guards) p.update = () => null; g.player.teleport(0, -2.5, 0); });
  await guest.page.evaluate((cal) => {
    const g = window.__game, m = g.mic;
    m.state = 'on'; m.cal = { ...cal }; m.calibrated = true; m.noMic = false; window.__db = -62; m.feed = () => window.__db + (Math.random() - 0.5);
    g.player.teleport(1.5, -11.3, 0);
  }, MIC_CAL);
  await run(1.5);
  const before = await host.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); return { phase: G.round.phase, contract: G.contract.id, wh: G.players.filter((p) => p.mic).map((p) => !!p.mic.whisper) }; });
  await guest.page.evaluate(() => { window.__db = -48; });
  await run(1.0);
  const during = await host.page.evaluate(async () => { const { G } = await import('./src/systems/state.js'); return G.players.filter((p) => p.mic).map((p) => !!p.mic.whisper); });
  await guest.page.evaluate(() => { window.__db = -62; });
  await run(5);
  const r = {
    host: await host.page.evaluate(() => window.__wi.count),
    guest: await guest.page.evaluate(async () => ({ echoes: window.__wi.count, card: (await import('./src/game/story.js')).hasMet('whisperer') })),
  };
  // a note: only the one who took it (owner's change 3): the guest reads the fridge note, the host still sees it
  // (two tabs share one localStorage here, so «the host's own Папери» cannot be told apart: what is
  // checked is that reading sends nothing — the host's world and its copy of the note are not touched)
  r.note = await guest.page.evaluate(async () => {
    const g = window.__game, S = await import('./src/systems/story.js');
    window.__sent = []; const pm = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) { const t = typeof m === 'string' ? m : JSON.stringify(m); if (!/"type":"pose"/.test(t)) window.__sent.push(t.slice(0, 80)); return pm.call(this, m); };
    g.player.teleport(-9.13 + 0.9, -0.75, Math.PI / 2); g.sim(0.05);
    const n = S.aimedNote(); S.readNote(n);
    return { id: n && n.id, seen: g.scene.getObjectByName('note: saucer').visible };
  });
  await run(0.5);
  r.sent = await guest.page.evaluate(() => window.__sent.filter((t) => /note|saucer/.test(t)));
  dbg({ before, during, r });
  assert.deepEqual(r.note, { id: 'saucer', seen: false });
  assert.deepEqual(r.sent, [], 'reading a note sends nothing to the host');
  assert.equal(before.contract, 'silent'); assert.notEqual(before.phase, 'ready');
  assert.deepEqual(before.wh, [false]); assert.deepEqual(during, [true]);
  assert.equal(r.host, 1, 'the host\'s whisperer echoed');
  assert.deepEqual(r.guest, { echoes: 1, card: true }, 'the guest heard it; the card is its own');
  assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
  await ctx.close();
});
