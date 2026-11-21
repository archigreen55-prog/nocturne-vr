// The pictures of «Засоби бригади» (the menu's guide, src/systems/crewGuide.js): small WebP renders of the
// game's own things — the same mesh and the same material as in the house (the loot's cans and bottles,
// the devices, the traps), lit by a little studio, from a corner, on a clear background (the card shows its
// own). Made once and kept in the repository (icons/crew/*.webp), so the menu never draws 3D on a phone.
// Run it again when a model or the look of the game changes:
//   node tools/render-crew-icons.mjs                 # the guide's pictures -> icons/crew/
//   node tools/render-crew-icons.mjs --traps         # the traps' pictures too (soap, marbles, bucket, rope, alarm)
//   node tools/render-crew-icons.mjs --out DIR       # another folder (a sheet to look at: --png writes PNG instead)
// The pictures of the upgrades (thermos, gloves, mask, sneakers, boots) are not renders: they are drawn SVGs
// (icons/crew/*.svg), the things are not in the house.
// Needs Playwright and its Chromium, the same as the tests (npm install).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, launch, ROOT } from '../tests/harness.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const outDir = opt('--out', join(ROOT, 'icons', 'crew'));
const PNG = flag('--png'), SIZE = +opt('--size', 192);
mkdirSync(outDir, { recursive: true });

// What to render: id (the file name); parts: what is in the picture (an item of the loot by id / trap kind, or a
// device by id); yaw, pitch: the camera's corner (degrees, 0 = from the front, level); fill: how much of the
// half-frame its biggest corner takes; at: [x, y, z] of a part (so two things stand side by side)
const CREW = [
  { id: 'can', parts: [{ item: 'can1' }], yaw: 35, pitch: 20, fill: 0.94 },
  { id: 'bottle', parts: [{ item: 'bottle1' }], yaw: 35, pitch: 14, fill: 0.94 },
  { id: 'radio', parts: [{ device: 'radio' }], yaw: 32, pitch: 22, fill: 0.94 },
  { id: 'phone', parts: [{ device: 'phone', at: [-0.12, 0, 0] }, { device: 'handset', at: [0.14, 0, 0] }], yaw: 28, pitch: 24, fill: 0.94 },
  { id: 'breaker', parts: [{ device: 'breaker' }], yaw: 28, pitch: 12, fill: 0.94 },
];
const TRAPS = [
  { id: 'soap', parts: [{ trap: 'soap' }], yaw: 35, pitch: 28, fill: 0.94 },
  { id: 'marbles', parts: [{ trap: 'marbles' }], yaw: 30, pitch: 22, fill: 0.94 },
  { id: 'bucket', parts: [{ trap: 'bucket' }], yaw: 30, pitch: 24, fill: 0.94 },
  { id: 'rope', parts: [{ trap: 'rope' }], yaw: 30, pitch: 32, fill: 0.94 },
  { id: 'alarm', parts: [{ trap: 'clock' }], yaw: 30, pitch: 18, fill: 0.94 },
];
const list = flag('--traps') ? [...CREW, ...TRAPS] : CREW;

const { server, base } = await startServer();
const browser = await launch();
let total = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__NOCTURNE_TEST = { pages: 'all', splash: false }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw new Error('page: ' + e.message); });
  await page.goto(base + '?nosplash=1&mode=pc', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game, null, { timeout: 90000, polling: 200 });
  const shots = await page.evaluate(async ({ list, SIZE, PNG }) => {
    const g = window.__game, T = g.THREE;
    const { styleUniforms } = await import('./src/style/materials.js');
    styleUniforms.uStyleExp.value = 2.2;   // the menu is bright: the house's night brightness would make the pictures dull
    const R = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(SIZE, SIZE, false); R.setClearColor(0x000000, 0);
    R.toneMapping = g.renderer.toneMapping; R.outputColorSpace = g.renderer.outputColorSpace;
    const cam = new T.PerspectiveCamera(28, 1, 0.01, 10);
    const find = (p) => {
      if (p.item) return g.loot.items.find((i) => i.id === p.item);
      if (p.trap) return g.loot.items.find((i) => i.trap === p.trap);
      return g.devices.list.find((d) => d.id === p.device);
    };
    const out = {};
    for (const spec of list) {
      const scene = new T.Scene();
      // a little studio: sky and ground light, a key light from the upper left, a warm fill from the right
      scene.add(new T.HemisphereLight(0xe8eeff, 0x6a6076, 3.4));
      const key = new T.DirectionalLight(0xfff1d6, 5); key.position.set(-1.2, 2, 1.6); scene.add(key);
      const fill = new T.DirectionalLight(0xffc27a, 2.4); fill.position.set(1.6, 0.6, 0.8); scene.add(fill);
      const root = new T.Group();
      for (const p of spec.parts) {
        const src = find(p);
        if (!src) throw new Error('no ' + JSON.stringify(p));
        const m = src.mesh.clone();   // the same geometry and material, a copy of the node
        m.position.set(...(p.at || [0, 0, 0])); m.rotation.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true;
        root.add(m);
      }
      scene.add(root);
      const box = new T.Box3().setFromObject(root), c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
      const yaw = T.MathUtils.degToRad(spec.yaw), pitch = T.MathUtils.degToRad(spec.pitch);
      const dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x, y, z));
      let dist = Math.max(s.x, s.y, s.z) * 3;
      for (let k = 0; k < 6; k++) {   // back off or come closer until the thing takes `fill` of the frame (its biggest corner)
        cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        const m = Math.max(...corners.map((v) => { const n = v.clone().project(cam); return Math.max(Math.abs(n.x), Math.abs(n.y)); }));
        dist *= m / spec.fill;
      }
      cam.position.copy(c).addScaledVector(dir, dist);
      cam.lookAt(c); cam.updateProjectionMatrix();
      const lamp = new T.PointLight(0xffffff, 3, 0, 0); lamp.position.copy(cam.position); scene.add(lamp);   // a lamp at the camera: no face stays in the dark
      R.render(scene, cam);
      out[spec.id] = R.domElement.toDataURL(PNG ? 'image/png' : 'image/webp', 0.9);
    }
    return out;
  }, { list, SIZE, PNG });
  for (const [id, url] of Object.entries(shots)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    const file = join(outDir, `${id}.${PNG ? 'png' : 'webp'}`);
    writeFileSync(file, buf);
    total += buf.length;
    console.log(`${file}  ${(buf.length / 1024).toFixed(1)} KB`);
  }
  console.log(`total ${(total / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
  server.close();
}
