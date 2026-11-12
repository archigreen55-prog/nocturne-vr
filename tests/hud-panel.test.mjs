// The phone HUD's guards panel (plan «C, version 2»): the main watcher's big card + small cards for the rest
// from G.guards, the house scale = the more of heard and seen (100% in alarm), the main card re-picked at most
// once a second; the corner is icons (the eye, the held item) and the old words and numbers only for testers.
// Nothing here is about the number of guards or a dog: a «dog» and extra guards are stand-ins pushed into G.guards.
import assert from 'node:assert/strict';
import { browser, test, LAND, playPhone, frames } from './runner.mjs';

const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const BIG = { ...LAND, viewport: { width: 932, height: 430 }, screen: { width: 932, height: 430 } };
const SMALL = { ...LAND, viewport: { width: 667, height: 375 }, screen: { width: 667, height: 375 } };

// freeze the real guard (so it does not chase), and put stand-in watchers beside it: [{ id, name, kind, dx, state, meter }]
async function stage(page, extra = []) {
  await E(page, async (extra) => {
    const { G } = await import('./src/systems/state.js'), g = window.__game;
    g.player.teleport(0, -1.2, 0, 0); g.sim(1);
    for (const p of g.guards) p.update = () => null;
    const real = G.guards[0];
    G.guards.length = 1; real.state = 'task'; real.meter = 0; real.visible = false;
    extra.forEach((w, i) => G.guards.push({ x: real.x + (w.dx ?? 3 + i), y: 0, z: real.z + (w.dz ?? 0), heading: 0, state: w.state || 'task', meter: w.meter || 0, stunT: 0, visible: false,
      env: { guard: { id: w.id, name: w.name, kind: w.kind || 'guard' } } }));
    g.alert.reset();
    G.cardGuardT = 0;
  }, extra);
}
const set = (page, fn, arg) => E(page, async ([src, arg]) => { const { G } = await import('./src/systems/state.js'); return (new Function('G', 'g', 'arg', `return (${src})(G, g, arg)`))(G, window.__game, arg); }, [fn.toString(), arg]);
const cards = (page) => E(page, () => {
  const main = document.querySelector('#hud .gsus .gmain .gsus-ph');
  const minis = [...document.querySelectorAll('#hud .gsus .gmini:not(.gone)')];
  const face = (ph) => ({ mk: ph.dataset.mk, ini: (ph.querySelector('.gsus-ini:not(.gone)') || {}).textContent || '', svg: !!ph.querySelector('.gsus-ini:not(.gone) svg'), pic: !!(ph.querySelector('.gsus-pic:not(.gone)') && ph.querySelector('.gsus-pic').getAttribute('src')) });
  return { gone: document.querySelector('#hud .gsus').classList.contains('gone'), name: document.querySelector('#hud .gsus-name').textContent, house: parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width),
    main: face(main), minis: minis.map((m) => ({ ...face(m.querySelector('.gsus-ph')), seen: parseFloat(m.querySelector('.gsus-seen i').style.width) })) };
});
const box = (page, sel) => page.locator(sel).first().boundingBox();

test('watchers (game/watchers.js): the house scale is the more of heard and seen, 100 in alarm; the main card is the most dangerous, the nearest among the equal, and sticks', async () => {
  const { ctx, page, errors } = await playPhone(SMALL);
  const r = await E(page, async () => {
    const { listWatchers, houseScale, pickMain } = await import('./src/game/watchers.js');
    const mk = (id, x, state, meter, extra = {}) => ({ x, y: 0, z: 0, state, meter, stunT: 0, env: { guard: { id, name: id } }, ...extra });
    const head = { x: 0, z: 0 }, A = { suspicion: 0, full: false };
    const out = {};
    const calm = listWatchers([mk('a', 5, 'task', 0), mk('b', 3, 'task', 0)], A, head);
    out.nearest = pickMain(calm, -1);                                   // equally calm: the nearest (b = 1)
    const seen = listWatchers([mk('a', 5, 'task', 0.6), mk('b', 3, 'task', 0)], A, head);
    out.seenWins = pickMain(seen, -1);                                  // a sees you: the more dangerous, though further
    const checking = listWatchers([mk('a', 5, 'task', 0), mk('b', 9, 'investigate', 0)], A, head);
    out.markWins = pickMain(checking, -1);                              // a mark beats distance
    out.stick = pickMain(listWatchers([mk('a', 3.6, 'task', 0), mk('b', 3, 'task', 0)], A, head), 0);   // a is 0.6 m further than b: keeps its place
    out.swap = pickMain(listWatchers([mk('a', 5, 'task', 0), mk('b', 3, 'task', 0)], A, head), 0);      // 2 m further: b takes over
    out.band = pickMain(listWatchers([mk('a', 5, 'task', 0.04), mk('b', 3, 'task', 0)], A, head), -1);  // 4% is inside the band: still the nearest
    out.stunned = listWatchers([mk('a', 5, 'chase', 1, { stunT: 2 })], { full: false }, head)[0].seen;
    const ws = listWatchers([mk('a', 5, 'task', 0.6), mk('b', 3, 'task', 0.2)], A, head);
    out.house = [houseScale(ws, { suspicion: 0, full: false }), houseScale(ws, { suspicion: 30, full: false }), houseScale(ws, { suspicion: 80, full: false }), houseScale(ws, { suspicion: 5, full: true })];
    out.marks = [ws[0].mark, listWatchers([mk('a', 5, 'chase', 1)], { full: false }, head)[0].mark, listWatchers([mk('a', 5, 'look', 0.5)], { full: false }, head)[0].mark, listWatchers([mk('a', 5, 'task', 0)], { full: true }, head)[0].mark];
    out.empty = [pickMain([], -1), houseScale([], { suspicion: 12, full: false })];
    out.defaults = listWatchers([{ x: 0, y: 0, z: 0, state: 'task', meter: 0, env: {} }], A, head)[0];
    return out;
  });
  assert.equal(r.nearest, 1, 'equally calm: the nearest');
  assert.equal(r.seenWins, 0, 'the one that sees you is the main, though further');
  assert.equal(r.markWins, 1, 'a «?» beats distance');
  assert.equal(r.stick, 0, 'the current main keeps its place while it is within 1 m of the best');
  assert.equal(r.swap, 1, '...and gives it up when the other is clearly nearer');
  assert.equal(r.band, 1, 'a 4% flicker of «sees you» is not a reason to switch');
  assert.equal(r.stunned, 0, 'a stunned watcher sees nothing');
  assert.deepEqual(r.house, [60, 60, 80, 100], 'house scale: max(heard, strongest seen); 100 in full alarm');
  assert.deepEqual(r.marks, [0, 2, 1, 2], 'marks: none / chase = «!» / checking = «?» / full alarm = «!» for everybody');
  assert.deepEqual(r.empty, [-1, 12], 'no watchers: no main; the heard suspicion alone is the scale');
  assert.deepEqual([r.defaults.id, r.defaults.kind], ['petrovych', 'guard'], 'a watcher without data: Petrovych, a guard');
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [name, opts] of [['667 x 375', SMALL], ['932 x 430 (a big phone)', BIG]]) {
  test(`guards panel on ${name}: 1, 2 and 4 guards + a dog from G.guards; the scale, marks, letters and icons; nothing covers the clock, the microphone, the pause or the buttons`, async () => {
    const { ctx, page, errors } = await playPhone(opts);
    const vp = page.viewportSize();
    // ---- 1 guard (the dacha's real one), calm: one big card, no small ones
    await stage(page);
    await until(page, () => !document.querySelector('#hud .gsus').classList.contains('gone') && document.querySelector('#hud .gsus-name').textContent);
    let c = await cards(page);
    assert.equal(c.minis.length, 0, 'one guard: no small cards');
    assert.equal(c.main.mk, '0', 'calm: no mark');
    assert.equal(c.main.pic, true, 'the real guard has a portrait');
    // ---- 2 guards, one checks (a mark, 55% seen) -> it is the main card, the other is small and calm
    await stage(page, [{ id: 'valera', name: 'Валера', dx: 4, state: 'investigate', meter: 0.55 }]);
    await until(page, () => document.querySelectorAll('#hud .gsus .gmini:not(.gone)').length === 1 && document.querySelector('#hud .gsus-name').textContent === 'Валера');
    c = await cards(page);
    assert.deepEqual([c.main.mk, Math.round(c.house)], ['1', 55], 'the checking one is the main card: «?» and the house scale at 55%');
    assert.equal(c.minis[0].mk, '0');
    // ---- 4 guards + a dog (stand-ins): the dog has an icon, the guard nobody drew has a letter, the real one a portrait
    await stage(page, [{ id: 'valera', name: 'Валера', dx: 4, state: 'investigate', meter: 0.7 }, { id: 'zhora', name: 'Жора', dx: 5, meter: 0.2 }, { id: 'gena', name: 'Гена', dx: 6 }, { id: 'rex', name: 'Рекс', kind: 'dog', dx: 7 }]);
    await until(page, () => document.querySelectorAll('#hud .gsus .gmini:not(.gone)').length === 4);
    c = await cards(page);
    assert.equal(c.name, 'Валера');
    assert.equal(c.minis.length, 4, 'the main card + 4 small ones = 5 watchers');
    const byLetter = c.minis.find((m) => m.ini === 'Г'), dog = c.minis.find((m) => m.svg);
    assert.ok(byLetter && !byLetter.pic, 'a guard without a portrait: the first letter of the name');
    assert.ok(dog && !dog.pic, 'a dog: the kind\'s icon (config/hud.js), not a letter');
    assert.deepEqual(c.minis.map((m) => m.seen).sort((a, b) => a - b), [0, 0, 0, 20], 'each small card has its own «sees you» line');
    // the layout: the panel stays in the top-left corner and covers nothing important
    const tl = await box(page, '#hud .hud-tl'), tc = await box(page, '#hud .hud-tc'), tr = await box(page, '#hud .hud-tr'), pause = await box(page, '#touch .pause');
    assert.ok(tl.x + tl.width <= tc.x + 1, `the corner ends before the clock block (${tl.x + tl.width} vs ${tc.x})`);
    assert.ok(tl.y + tl.height <= vp.height * 0.6, `the corner stays in the upper part of the screen (${Math.round(tl.y + tl.height)} of ${vp.height})`);
    for (const sel of ['#touch .breath', '#touch .crouch', '#touch .act', '#hud .hud-msg']) {
      const b = await box(page, sel);
      if (!b) continue;
      assert.ok(tl.x + tl.width <= b.x || tl.y + tl.height <= b.y, `${sel} is clear of the corner`);
    }
    assert.ok(tr.x >= tl.x + tl.width && pause.x >= tl.x + tl.width, 'the microphone and the pause are clear of the corner');
    // ---- the alarm: every scale and the main card are full and red, every mark is «!»
    await set(page, (G, g) => { g.alert.full = true; g.sim(0.2); });
    await until(page, () => document.querySelector('#hud .gsus').getAttribute('data-lvl') === '2' && [...document.querySelectorAll('#hud .gsus-ph')].every((p) => p.dataset.mk === '2'));
    c = await cards(page);
    assert.equal(c.house, 100, 'full alarm: the house scale is full');
    assert.equal(await E(page, () => getComputedStyle(document.querySelector('#hud .gsus .gsus-bar i')).backgroundColor), 'rgb(255, 84, 104)', 'and red (#ff5468), never green');
    assert.equal(await E(page, () => [...document.querySelectorAll('#hud .gsus .gmini:not(.gone) .gsus-ini, #hud .gsus .gmini:not(.gone) .gsus-pic')].every((el) => el.classList.contains('gone') || getComputedStyle(el).borderTopColor === 'rgb(255, 84, 104)')), true, 'every card has the red frame');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('the house scale: heard 30 + seen 60 = 60, heard 80 + seen 20 = 80; a checking guard keeps the card up in the minimal mode', async () => {
  const { ctx, page, errors } = await playPhone(SMALL);
  await stage(page, [{ id: 'valera', name: 'Валера', dx: 4 }]);
  const bar = () => E(page, () => Math.round(parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width)));
  await set(page, (G) => { G.guards[1].state = 'investigate'; G.guards[1].meter = 0.6; });
  await until(page, () => Math.round(parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width)) === 60);
  await set(page, (G, g) => { g.alert.suspicion = 30; });
  await frames(page, 6);
  assert.equal(await bar(), 60, 'heard 30 is less than seen 60: the scale shows 60');
  await set(page, (G, g) => { g.alert.suspicion = 80; G.guards[1].meter = 0.2; });
  await until(page, () => Math.round(parseFloat(document.querySelector('#hud .gsus .gsus-bar i').style.width)) >= 75);
  // the minimal mode: calm = hidden; a guard that checks you (a mark) = shown even with no suspicion
  await set(page, (G, g) => { g.alert.reset(); G.guards[1].meter = 0; G.guards[1].state = 'task'; });
  await E(page, () => { const s = document.getElementById('hudmode'); s.value = 'min'; s.dispatchEvent(new Event('change')); });
  await until(page, () => document.querySelector('#hud .gsus').classList.contains('gone'));
  await set(page, (G) => { G.guards[1].state = 'look'; });
  await until(page, () => !document.querySelector('#hud .gsus').classList.contains('gone'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the main card does not jump: re-picked at most once a second', async () => {
  const { ctx, page, errors } = await playPhone(SMALL);
  await stage(page, [{ id: 'valera', name: 'Валера' }]);
  // two equally calm guards; the real one (Petrovych) is nearer
  const put = (near, far) => set(page, (G, g, a) => { const h = g.player.head; G.guards[a.near].x = h.x + 2; G.guards[a.near].z = h.z; G.guards[a.far].x = h.x + 9; G.guards[a.far].z = h.z; G.guards[a.near].y = G.guards[a.far].y = g.player.floorY || 0; }, { near, far });
  await put(0, 1);
  await set(page, (G) => { G.cardGuardT = 0; });
  await until(page, () => document.querySelector('#hud .gsus-name').textContent !== '' && document.querySelectorAll('#hud .gsus .gmini:not(.gone)').length === 1);
  const mainName = () => E(page, () => document.querySelector('#hud .gsus-name').textContent);
  const first = await mainName();
  assert.notEqual(first, 'Валера', 'the real guard is the main one while he is nearer');
  // Valera comes clearly nearer; the timer has just been reset to a full second
  await put(1, 0);
  await set(page, (G) => { G.cardGuardT = 1; });
  await E(page, () => { window.__t0 = performance.now(); });
  await page.waitForTimeout(300);   // the panel's timer counts frames (10 Hz), so this is wall time: it is still running
  assert.equal(await mainName(), first, 'it did not jump at once');
  await until(page, () => document.querySelector('#hud .gsus-name').textContent === 'Валера', null, 10000);
  const dt = await E(page, () => (performance.now() - window.__t0) / 1000);
  assert.ok(dt >= 0.8, `it switched no sooner than about a second (${dt.toFixed(2)} s)`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the corner is icons: the eye (open / half / amber under a lamp), the held item\'s icon + the damaged mark, «Присісти» lights up; words and numbers only with «Цифри в HUD»', async () => {
  const { ctx, page, errors } = await playPhone(SMALL);
  await E(page, () => { const g = window.__game; g.player.teleport(0, -1.2, 0, 0); g.sim(1); for (const p of g.guards) p.update = () => null; });
  const vis = (sel) => E(page, (s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; }, sel);
  // no words, no numbers
  await until(page, () => document.querySelector('#hud .stance').textContent.length > 0);   // the texts are still written, only hidden
  assert.equal(await vis('#hud .hud-eye .stance'), false, 'no «Стоїш · 5.0 м» in the corner');
  assert.equal(await vis('#hud .hud-sub'), false, 'no steps / hands / room lines');
  assert.equal(await vis('#hud .hud-item'), false, 'nothing in the hands: no item icon');
  assert.equal(await E(page, () => document.querySelector('#hud .hud-eye').getAttribute('data-eye')), 'open');
  // crouch: the eye is half-closed and the button lights up
  await page.tap('#touch .crouch');
  await until(page, () => document.querySelector('#hud .hud-eye').getAttribute('data-eye') === 'half');
  assert.equal(await E(page, () => document.querySelector('#touch .crouch').classList.contains('active')), true, '«Присісти» is lit while crouched');
  await page.tap('#touch .crouch');
  await until(page, () => document.querySelector('#hud .hud-eye').getAttribute('data-eye') === 'open');
  // a held item: an icon by its kind; a damaged one has the red mark
  for (const [kind, dmg] of [['light', false], ['medium', true], ['crystal', false]]) {
    await set(page, (G, g, a) => { G.hands.heldItems = () => [{ name: 'Річ', damaged: a.dmg, def: { kind: a.kind } }]; }, { kind, dmg });
    await until(page, (k) => { const i = document.querySelector('#hud .hud-item'); return i.getAttribute('data-kind') === k && !i.classList.contains('gone'); }, kind);
    assert.equal(await vis('#hud .hud-item .ico'), true, `${kind}: the icon is shown`);
    assert.equal(await E(page, () => getComputedStyle(document.querySelector('#hud .hud-item .dmg')).display !== 'none'), dmg, `${kind}: the damaged mark ${dmg ? 'is' : 'is not'} there`);
    assert.equal(await E(page, (k) => [...document.querySelectorAll('#hud .hud-item [data-k]')].filter((g) => getComputedStyle(g).display !== 'none').map((g) => g.dataset.k).join(), kind), kind, 'only this kind\'s shape');
  }
  await set(page, (G) => { G.hands.heldItems = () => []; });
  await until(page, () => document.querySelector('#hud .hud-item').classList.contains('gone'));
  // under a lamp the eye is amber (the dacha's lamp at 1.6 / 7.6)
  const eyeColour = () => E(page, () => getComputedStyle(document.querySelector('#hud .hud-eye')).color);
  const before = await eyeColour();
  await E(page, () => { window.__game.player.teleport(1.6, 7.6, 0, 0); window.__game.sim(0.5); });
  await until(page, () => getComputedStyle(document.querySelector('#hud .hud-eye')).color === 'rgb(255, 179, 71)');
  assert.notEqual(before, 'rgb(255, 179, 71)');
  // the testers' switch brings the old corner back
  await E(page, () => { const s = document.getElementById('hudnums'); s.value = 'on'; s.dispatchEvent(new Event('change')); });
  assert.equal(await vis('#hud .hud-eye .stance'), true, '«Цифри в HUD»: the stance and metres are back');
  assert.match(await E(page, () => document.querySelector('#hud .stance').textContent), /^Стоїш · \d\.\d м$/);
  assert.equal(await vis('#hud .hud-sub'), true, '...and the steps / hands / room lines');
  await E(page, () => { const s = document.getElementById('hudnums'); s.value = 'off'; s.dispatchEvent(new Event('change')); });
  assert.equal(await vis('#hud .hud-eye .stance'), false, 'and off again');
  assert.deepEqual(errors, []);
  await ctx.close();
});
