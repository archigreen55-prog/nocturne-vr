// Behaviour snapshot, for refactors that must not change the game: two snapshots (before / after)
// must be equal. It records, in Chromium:
//   texts    every visible text: the start screen (PC, Android, iPhone, VR), the phone HUD, every page of
//            the pause menu, the round summary for each ending, the board pages and the wrist (the
//            canvas fillText calls)
//   config   the whole CFG (functions by their source) after each difficulty is applied
//   trace    a deterministic run: Math.random seeded, requestAnimationFrame driven by hand at 60 Hz;
//            the player walks out, opens doors, picks up and delivers an item, makes noise, gets
//            caught; every 0.5 s the player, the guard, the alarm, the round, the loot, the noises
//            heard, the HUD text (phone) and every text drawn on the canvases
//   dom      the structure of the phone controls, HUD, menu and summary; the keys of window.__game
//   shots    screenshots of the HTML layers (the 3D canvas hidden) on Android and iPhone: sha256
//   node tools/snapshot.mjs out.json [--root <site dir>] [--shots <dir>]
// The site is served from --root (default: this working tree), so an old commit checked out elsewhere
// can be snapshotted with today's tool. Compare with: node tools/snapshot.mjs --diff a.json b.json
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { devices } from 'playwright';
import { startServer, launch, newContext, ROOT } from '../tests/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

if (args[0] === '--diff') {
  const [a, b] = await Promise.all([args[1], args[2]].map(async (f) => JSON.parse(await readFile(f, 'utf8'))));
  let diffs = 0;
  (function cmp(x, y, path) {
    if (diffs > 40) return;
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y) || (x && typeof x === 'object') !== (y && typeof y === 'object')) { diffs++; console.log(`${path}: ${JSON.stringify(x)?.slice(0, 200)}  !=  ${JSON.stringify(y)?.slice(0, 200)}`); return; }
    if (x && typeof x === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) cmp(x[k], y[k], `${path}.${k}`);
    } else if (x !== y) { diffs++; console.log(`${path}: ${JSON.stringify(x)?.slice(0, 200)}  !=  ${JSON.stringify(y)?.slice(0, 200)}`); }
  })(a, b, '');
  const hash = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
  for (const k of Object.keys(a)) console.log(`${k.padEnd(7)} ${hash(a[k])} ${hash(b[k])} ${hash(a[k]) === hash(b[k]) ? 'same' : 'DIFFERENT'}`);
  console.log(diffs ? `${diffs}${diffs > 40 ? '+' : ''} difference(s)` : 'identical');
  process.exit(diffs ? 1 : 0);
}

const out = args[0] || 'snapshot.json';
const root = opt('--root', ROOT);
const shotsDir = opt('--shots', null);
const { server, base } = await startServer(root);

const UA = {
  android: devices['Pixel 7'].userAgent,
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  quest: 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0.0 SamsungBrowser/4.0 Chrome/132.0.0.0 VR Safari/537.36',
};
const LAND = { viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
const CTX = {
  pc: { viewport: { width: 1280, height: 800 } },
  android: { ...devices['Pixel 7'], ...LAND, userAgent: UA.android },
  iphone: { ...devices['Pixel 7'], ...LAND, userAgent: UA.iphone },
  vr: { viewport: { width: 1280, height: 800 }, userAgent: UA.quest },
};

// Before any page script: canvas texts are recorded, Math.random can be reseeded, and (trace pages)
// requestAnimationFrame only runs when the snapshot steps it.
const INIT = ({ manualFrames }) => {
  window.__texts = [];
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { window.__texts.push(String(t)); return fill.call(this, t, ...rest); };
  window.__reseed = (seed) => {
    let s = seed | 0;
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  window.__reseed(1);
  if (manualFrames) {
    const queue = [];
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    window.cancelAnimationFrame = () => {};
    let now = 0;
    // step(n): n frames 1/60 s apart. Time starts at a fixed 10^7 ms (always far ahead of the page's own
    // clock, so the first dt is clamped the same way), so every dt is the same float on every run.
    window.__step = (n = 1) => {
      if (!now) now = 1e7;
      for (let i = 0; i < n; i++) { now += 1000 / 60; const cbs = queue.splice(0); for (const cb of cbs) cb(now); }
    };
  }
};

let browser = await launch();
async function page(kind, { manualFrames = false, query = '' } = {}) {
  const ctx = await newContext(browser, { ...CTX[kind], permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(INIT, { manualFrames });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + query);
  await p.waitForFunction(() => window.__game, null, { timeout: 30000, polling: 100 });
  await p.waitForTimeout(300);
  // driven frames do not draw (software WebGL is slow); the scene graph is still updated as a render would
  if (manualFrames) await p.evaluate(() => { window.__game.renderer.render = (s, c) => { s.updateMatrixWorld(); if (c.parent === null) c.updateMatrixWorld(); }; });
  return { p, ctx, errors };
}
const text = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
const takeTexts = (p) => p.evaluate(() => window.__texts.splice(0));
// DOM structure + text, without the attributes that only say where a text came from
const dom = (p, sel) => p.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const c = e.cloneNode(true);
  // a <span data-t> with no other attribute only carries a text from the language file: compare its text
  for (const sp of c.querySelectorAll('span[data-t]')) if (sp.attributes.length === 1) sp.replaceWith(...sp.childNodes);
  for (const n of [c, ...c.querySelectorAll('*')]) { n.removeAttribute('data-t'); n.removeAttribute('data-t-html'); n.removeAttribute('data-t-attr'); n.removeAttribute('data-game-name'); }
  c.normalize();
  return c.outerHTML;
}, sel);

const snap = { texts: {}, config: {}, trace: {}, dom: {}, shots: {} };
if (shotsDir) await mkdir(shotsDir, { recursive: true });
async function shot(p, name) {
  // the version line differs between the two builds by design: a fixed text in its place
  await p.evaluate(() => { window.__game.renderer.domElement.style.visibility = 'hidden'; const v = document.getElementById('version'); if (v) v.textContent = 'VERSION'; });
  await p.waitForTimeout(700);   // edge flashes and CSS transitions settle
  const png = await p.screenshot();
  await p.evaluate(() => { window.__game.renderer.domElement.style.visibility = ''; });
  snap.shots[name] = createHash('sha256').update(png).digest('hex');
  if (shotsDir) await writeFile(join(shotsDir, name + '.png'), png);
}

// ---------- start screens, config ----------
for (const kind of ['pc', 'android', 'iphone', 'vr']) {
  const { p, ctx, errors } = await page(kind);
  snap.texts[`start.${kind}`] = await text(p, '#overlay');
  snap.texts[`title.${kind}`] = await p.title();
  snap.dom[`overlay.${kind}`] = await dom(p, '#overlay');
  snap.dom[`errors.${kind}`] = errors;
  if (kind === 'pc') {
    snap.dom.gameKeys = await p.evaluate(() => Object.keys(window.__game).sort());
    snap.dom.rotate = await dom(p, '#rotate');
    snap.dom.hint = await text(p, '#hint');
    for (const d of ['easy', 'hard', 'medium']) {
      snap.config[d] = await p.evaluate((d) => {
        window.__game.setDifficulty(d);
        return JSON.parse(JSON.stringify(window.__game.CFG, (k, v) => (typeof v === 'function' ? 'fn:' + v.toString() : v)));
      }, d);
    }
    // the start screen after changing the contract (its info line)
    snap.texts.contractInfo = [];
    for (let i = 0; i < 6; i++) {
      snap.texts.contractInfo.push(await p.evaluate(() => { const g = window.__game, all = g.CFG.contracts; g.setContract(all[(all.indexOf(g.contract) + 1) % all.length].id); return document.querySelector('#contractinfo').innerText; }));
    }
    snap.texts.contractOptions = await p.evaluate(() => [...document.querySelectorAll('#contract option, #difficulty option, #vignette option, #snap option')].map((o) => o.textContent));
  }
  if (kind === 'android' || kind === 'iphone') await shot(p, `start.${kind}`);
  await ctx.close();
}

// ---------- phone: HUD, menu pages, summary for each ending, board pages ----------
for (const kind of ['android', 'iphone']) {
  const { p, ctx } = await page(kind, { manualFrames: true });
  await p.evaluate(() => { window.__reseed(7); window.__game.start.play(); window.__step(30); });
  snap.texts[`hud.${kind}`] = await text(p, '#hud');
  snap.dom[`touch.${kind}`] = await dom(p, '#touch');
  snap.dom[`hud.${kind}`] = await dom(p, '#hud');
  await shot(p, `hud.${kind}`);
  for (const page of ['main', 'contract', 'settings']) {
    await p.evaluate((pg) => { const g = window.__game; if (!g.paused) g.pauseOpen('user'); g.menu.go(pg); }, page);
    snap.texts[`menu.${page}.${kind}`] = await text(p, '#pausemenu');
    snap.dom[`menu.${page}.${kind}`] = await dom(p, '#pausemenu');
    await shot(p, `menu.${page}.${kind}`);
  }
  for (const reason of ['hidden', 'blur', 'audio']) {
    await p.evaluate((r) => { const g = window.__game; g.pauseResume(); g.pauseOpen(r); }, reason);
    snap.texts[`menu.reason.${reason}.${kind}`] = await text(p, '#pausemenu');
  }
  await p.evaluate(() => window.__game.pauseResume());
  for (const ending of ['left', 'escaped', 'caught', 'late']) {
    await p.evaluate((e) => { const g = window.__game; g.newRound(); window.__step(5); g.round.phase = e === 'escaped' || e === 'late' ? 'escape' : 'heist'; g.round.finish(e); window.__step(60); }, ending);
    snap.texts[`summary.${ending}.${kind}`] = await text(p, '#summary');
    snap.dom[`summary.${ending}.${kind}`] = await dom(p, '#summary');
    if (ending === 'caught') await shot(p, `summary.${kind}`);
  }
  // board pages (drawn on its canvas: fillText)
  await p.evaluate(() => { const g = window.__game; g.newRound(); window.__step(20); window.__texts.length = 0; });
  for (const id of ['cnext', 'diff', 'micpage', 'back', 'cprev']) {
    await p.evaluate((id) => { window.__game.pressBoard(id); window.__step(20); }, id);
    snap.texts[`board.${id}.${kind}`] = await takeTexts(p);
  }
  // portrait = "rotate the phone"
  await p.setViewportSize({ width: 412, height: 915 });
  await p.evaluate(() => window.__step(5));
  snap.texts[`rotate.${kind}`] = await p.evaluate(() => document.querySelector('#rotate').textContent);
  await ctx.close();
}

// ---------- the deterministic trace ----------
// keys: held keyboard codes for the next frames; every 30 frames (0.5 s) one sample
async function trace(kind, difficulty) {
  const { p, ctx } = await page(kind, { manualFrames: true });
  const rec = await p.evaluate(async (difficulty) => {
    const g = window.__game, P = g.player;
    const heard = [];
    g.noise.on((e) => heard.push([e.kind, +e.x.toFixed(4), +e.z.toFixed(4), +(e.radius || e.r || 0).toFixed(4)]));
    const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const samples = [];
    let frame = 0;
    const sample = (tag) => {
      const T = g.loot.tally();
      samples.push({
        tag, frame,
        p: [P.head.x, P.head.z, P.yaw, g.player.crouched, g.player.virtualCrouch],
        g: [g.patrol.state, g.patrol.x, g.patrol.z, g.patrol.activity],
        a: [g.alert.level, g.alert.suspicion],
        r: [g.round.phase, g.round.clock, g.round.result && g.round.result.kind, g.caughtT],
        l: [T.sum, T.inVan, T.damaged, g.hands.desk && g.hands.desk.name],
        heard: heard.splice(0),
        texts: window.__texts.splice(0),
        hud: document.querySelector('#hud') && !document.querySelector('#hud').hidden ? document.querySelector('#hud').innerText : null,
        v: g.verdict && [g.verdict.stars, g.verdict.newBest],
      });
    };
    const run = (frames, tag, held = []) => {
      for (const c of held) key('keydown', c);
      for (let i = 0; i < frames; i++) { window.__step(1); frame++; if (frame % 30 === 0) sample(tag); }
      for (const c of held) key('keyup', c);
    };
    if (g.MODE.mode === 'phone') g.start.play(); else g.playing = true;
    g.setDifficulty(difficulty);
    g.newRound();
    window.__reseed(42);
    window.__texts.length = 0;
    run(60, 'idle');
    run(200, 'walk', ['KeyW']);                 // out of the van: the clock starts
    P.look(-300, 0); run(30, 'turn');
    run(240, 'fast', ['KeyW', 'Space']);        // loud steps
    run(20, 'crouch', ['KeyC']); run(120, 'crouched', ['KeyW']); run(20, 'stand', ['KeyC']);
    // the nearest door: quick and slow
    const d = g.nearestDoor(P.head.x, P.head.z, 30);
    if (d) { P.teleport(d.cx + 0.8, d.cz + 0.8, Math.atan2(-(d.cx - (d.cx + 0.8)), -(d.cz - (d.cz + 0.8)))); run(10, 'atdoor'); run(5, 'doorT', ['KeyT']); run(90, 'swing'); run(5, 'doorQ', ['KeyQ']); run(120, 'slow'); }
    // an item: in front of it, pick it up, carry it to the drop-off ring
    const it = g.loot.items.find((x) => !x.twoHanded && x.state === 'rest');
    if (it) {
      const ip = it.mesh ? it.mesh.position : it.pos;
      P.teleport(ip.x, ip.z + 1.0, 0);
      P.lookPitch = -0.6; run(20, 'aim');
      run(5, 'take', ['KeyE']); run(30, 'holding');
      P.teleport(g.CFG.dropZone.x, g.CFG.dropZone.z, 0); run(90, 'deliver');
    }
    run(600, 'wait');                           // the guard's round
    // go to the guard and be caught
    for (let k = 0; k < 40 && g.round.phase !== 'result'; k++) { P.teleport(g.patrol.x + 0.6, g.patrol.z + 0.6, Math.atan2(0.6, 0.6)); run(30, 'toguard', ['KeyW']); }
    run(180, 'end');
    return { samples };
  }, difficulty);
  await ctx.close();
  return rec;
}
for (const d of ['easy', 'medium', 'hard']) snap.trace[`pc.${d}`] = await trace('pc', d);
snap.trace['android.medium'] = await trace('android', 'medium');

await browser.close();
server.close();
// the build version is not behaviour: written as {VERSION} so two builds compare
const version = JSON.parse(await readFile(join(root, 'version.json'), 'utf8')).version;
await writeFile(out, JSON.stringify(snap, null, 1).replaceAll(version, '{VERSION}'));
const hash = (o) => createHash('sha256').update(JSON.stringify(o).replaceAll(version, '{VERSION}')).digest('hex').slice(0, 16);
console.log(`snapshot -> ${out}: ${Object.entries(snap).map(([k, v]) => `${k} ${hash(v)}`).join(', ')}`);
console.log(`trace samples: ${Object.entries(snap.trace).map(([k, v]) => `${k} ${v.samples.length}`).join(', ')}`);
