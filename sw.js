// Service worker: offline play and the home-screen app (plan-phone-mode §1.9, §7.3, wave T4).
// It must never keep an old version:
//   pages (navigations)      the network first (revalidated, not the HTTP cache); the cache only offline
//   version.json, sw.js      always the network (the stale-page guard in index.html reads version.json)
//   ?v=<version> modules,    the cache first: their URL changes with every version, so a new build is a
//   vendor/, icons/          new URL; old ones are dropped when the new worker takes over
//   anything else            the network first, the cache offline
// One worker per site copy: the main site at /nocturne-vr/ and each preview at /nocturne-vr/preview/<b>/
// (its own scope and its own caches). The main site's worker leaves /preview/ alone.
// VERSION and FILES are written by tools/bump-version.mjs.
const VERSION = '0.6.0-pre.9.style.3';
const FILES = [
  "./",
  "./index.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./vendor/three-0.186.1.min.js",
  "./vendor/three-addons.js?v=0.186.1",
  "./vendor/trystero-nostr-0.25.4.min.js",
  "./vendor/trystero-torrent-0.25.4.min.js",
  "./vendor/qrcode-generator-2.0.4.min.js",
  "./src/ui/phone.css?v=0.6.0-pre.9.style.3",
  "./src/ui/tutorial.css?v=0.6.0-pre.9.style.3",
  "./src/audio/audio.js?v=0.6.0-pre.9.style.3",
  "./src/audio/calibrate.js?v=0.6.0-pre.9.style.3",
  "./src/audio/distractSfx.js?v=0.6.0-pre.9.style.3",
  "./src/audio/mic.js?v=0.6.0-pre.9.style.3",
  "./src/audio/micHelp.js?v=0.6.0-pre.9.style.3",
  "./src/audio/ringTap.worklet.js?v=0.6.0-pre.9.style.3",
  "./src/audio/runSfx.js?v=0.6.0-pre.9.style.3",
  "./src/audio/scream.js?v=0.6.0-pre.9.style.3",
  "./src/audio/stairSfx.js?v=0.6.0-pre.9.style.3",
  "./src/audio/trapSfx.js?v=0.6.0-pre.9.style.3",
  "./src/comfort/vignette.js?v=0.6.0-pre.9.style.3",
  "./src/config/contracts.js?v=0.6.0-pre.9.style.3",
  "./src/config/devices.js?v=0.6.0-pre.9.style.3",
  "./src/config/difficulty.js?v=0.6.0-pre.9.style.3",
  "./src/config/doors.js?v=0.6.0-pre.9.style.3",
  "./src/config/guard.js?v=0.6.0-pre.9.style.3",
  "./src/config/index.js?v=0.6.0-pre.9.style.3",
  "./src/config/items.js?v=0.6.0-pre.9.style.3",
  "./src/config/mansion.js?v=0.6.0-pre.9.style.3",
  "./src/config/maps.js?v=0.6.0-pre.9.style.3",
  "./src/config/mic.js?v=0.6.0-pre.9.style.3",
  "./src/config/net.js?v=0.6.0-pre.9.style.3",
  "./src/config/noise.js?v=0.6.0-pre.9.style.3",
  "./src/config/player.js?v=0.6.0-pre.9.style.3",
  "./src/config/round.js?v=0.6.0-pre.9.style.3",
  "./src/config/shop.js?v=0.6.0-pre.9.style.3",
  "./src/config/sprint.js?v=0.6.0-pre.9.style.3",
  "./src/config/style.js?v=0.6.0-pre.9.style.3",
  "./src/config/throw.js?v=0.6.0-pre.9.style.3",
  "./src/config/traps.js?v=0.6.0-pre.9.style.3",
  "./src/debug/report.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/alert.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/brain.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/flashMask.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/flashWalls.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/lurker.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/nav.js?v=0.6.0-pre.9.style.3",
  "./src/enemies/patrol.js?v=0.6.0-pre.9.style.3",
  "./src/game/contracts.js?v=0.6.0-pre.9.style.3",
  "./src/game/difficulty.js?v=0.6.0-pre.9.style.3",
  "./src/game/dropzone.js?v=0.6.0-pre.9.style.3",
  "./src/game/economy.js?v=0.6.0-pre.9.style.3",
  "./src/game/mischief.js?v=0.6.0-pre.9.style.3",
  "./src/game/players.js?v=0.6.0-pre.9.style.3",
  "./src/game/progress.js?v=0.6.0-pre.9.style.3",
  "./src/game/round.js?v=0.6.0-pre.9.style.3",
  "./src/game/run.js?v=0.6.0-pre.9.style.3",
  "./src/game/stealth.js?v=0.6.0-pre.9.style.3",
  "./src/i18n/index.js?v=0.6.0-pre.9.style.3",
  "./src/i18n/name.js?v=0.6.0-pre.9.style.3",
  "./src/i18n/uk.js?v=0.6.0-pre.9.style.3",
  "./src/input/gyro.js?v=0.6.0-pre.9.style.3",
  "./src/input/keyboard.js?v=0.6.0-pre.9.style.3",
  "./src/input/touch.js?v=0.6.0-pre.9.style.3",
  "./src/input/xrInput.js?v=0.6.0-pre.9.style.3",
  "./src/loot/hands.js?v=0.6.0-pre.9.style.3",
  "./src/loot/items.js?v=0.6.0-pre.9.style.3",
  "./src/loot/throw.js?v=0.6.0-pre.9.style.3",
  "./src/main.js?v=0.6.0-pre.9.style.3",
  "./src/net/remotePlayer.js?v=0.6.0-pre.9.style.3",
  "./src/net/room.js?v=0.6.0-pre.9.style.3",
  "./src/net/sync.js?v=0.6.0-pre.9.style.3",
  "./src/net/transport.js?v=0.6.0-pre.9.style.3",
  "./src/noise/noise.js?v=0.6.0-pre.9.style.3",
  "./src/perf/gpuTimer.js?v=0.6.0-pre.9.style.3",
  "./src/perf/quality.js?v=0.6.0-pre.9.style.3",
  "./src/platform/feedback.js?v=0.6.0-pre.9.style.3",
  "./src/platform/mode.js?v=0.6.0-pre.9.style.3",
  "./src/platform/pwa.js?v=0.6.0-pre.9.style.3",
  "./src/platform/screen.js?v=0.6.0-pre.9.style.3",
  "./src/settings.js?v=0.6.0-pre.9.style.3",
  "./src/style/decor.js?v=0.6.0-pre.9.style.3",
  "./src/style/ink.js?v=0.6.0-pre.9.style.3",
  "./src/style/materials.js?v=0.6.0-pre.9.style.3",
  "./src/style/palette.js?v=0.6.0-pre.9.style.3",
  "./src/style/quiet.js?v=0.6.0-pre.9.style.3",
  "./src/systems/board.js?v=0.6.0-pre.9.style.3",
  "./src/systems/brightness.js?v=0.6.0-pre.9.style.3",
  "./src/systems/contract.js?v=0.6.0-pre.9.style.3",
  "./src/systems/controls.js?v=0.6.0-pre.9.style.3",
  "./src/systems/debugApi.js?v=0.6.0-pre.9.style.3",
  "./src/systems/desktop.js?v=0.6.0-pre.9.style.3",
  "./src/systems/distract.js?v=0.6.0-pre.9.style.3",
  "./src/systems/doors.js?v=0.6.0-pre.9.style.3",
  "./src/systems/economy.js?v=0.6.0-pre.9.style.3",
  "./src/systems/flashlight.js?v=0.6.0-pre.9.style.3",
  "./src/systems/flatScreen.js?v=0.6.0-pre.9.style.3",
  "./src/systems/guards.js?v=0.6.0-pre.9.style.3",
  "./src/systems/heist.js?v=0.6.0-pre.9.style.3",
  "./src/systems/index.js?v=0.6.0-pre.9.style.3",
  "./src/systems/mapView.js?v=0.6.0-pre.9.style.3",
  "./src/systems/messages.js?v=0.6.0-pre.9.style.3",
  "./src/systems/net.js?v=0.6.0-pre.9.style.3",
  "./src/systems/panel.js?v=0.6.0-pre.9.style.3",
  "./src/systems/phone.js?v=0.6.0-pre.9.style.3",
  "./src/systems/player.js?v=0.6.0-pre.9.style.3",
  "./src/systems/progressCode.js?v=0.6.0-pre.9.style.3",
  "./src/systems/render.js?v=0.6.0-pre.9.style.3",
  "./src/systems/rig.js?v=0.6.0-pre.9.style.3",
  "./src/systems/sprint.js?v=0.6.0-pre.9.style.3",
  "./src/systems/startScreen.js?v=0.6.0-pre.9.style.3",
  "./src/systems/state.js?v=0.6.0-pre.9.style.3",
  "./src/systems/stats.js?v=0.6.0-pre.9.style.3",
  "./src/systems/style.js?v=0.6.0-pre.9.style.3",
  "./src/systems/traps.js?v=0.6.0-pre.9.style.3",
  "./src/systems/tutorial.js?v=0.6.0-pre.9.style.3",
  "./src/systems/vr.js?v=0.6.0-pre.9.style.3",
  "./src/systems/world.js?v=0.6.0-pre.9.style.3",
  "./src/ui/board.js?v=0.6.0-pre.9.style.3",
  "./src/ui/hud.js?v=0.6.0-pre.9.style.3",
  "./src/ui/lobby.js?v=0.6.0-pre.9.style.3",
  "./src/ui/menu.js?v=0.6.0-pre.9.style.3",
  "./src/ui/pointer.js?v=0.6.0-pre.9.style.3",
  "./src/ui/press.js?v=0.6.0-pre.9.style.3",
  "./src/ui/start.js?v=0.6.0-pre.9.style.3",
  "./src/ui/summary.js?v=0.6.0-pre.9.style.3",
  "./src/ui/tutorial.js?v=0.6.0-pre.9.style.3",
  "./src/ui/wrist.js?v=0.6.0-pre.9.style.3",
  "./src/version.js?v=0.6.0-pre.9.style.3",
  "./src/world/collision.js?v=0.6.0-pre.9.style.3",
  "./src/world/devices.js?v=0.6.0-pre.9.style.3",
  "./src/world/floors.js?v=0.6.0-pre.9.style.3",
  "./src/world/kit.js?v=0.6.0-pre.9.style.3",
  "./src/world/level.js?v=0.6.0-pre.9.style.3",
  "./src/world/mansion/furniture.js?v=0.6.0-pre.9.style.3",
  "./src/world/mansion/layout.js?v=0.6.0-pre.9.style.3",
  "./src/world/mansion/level.js?v=0.6.0-pre.9.style.3",
  "./src/world/maps.js?v=0.6.0-pre.9.style.3",
  "./src/xr/player.js?v=0.6.0-pre.9.style.3"
];
const BASE = new URL('./', self.location).pathname;
const PREFIX = `nocturne:${BASE}:`;
const CACHE = PREFIX + VERSION;
const PREVIEW = /\/preview\/[^/]+\/$/.test(BASE);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION }); });

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    // a navigation goes by its URL (a navigate-mode request cannot be re-sent with options)
    const res = await fetch(fallbackUrl ? req.url : req, { cache: 'no-cache' });
    if (res.ok) cache.put(fallbackUrl || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackUrl || req, { ignoreSearch: !!fallbackUrl }) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const rel = url.pathname.slice(BASE.length);
  if (!PREVIEW && rel.startsWith('preview/')) return;   // the previews have their own worker (or none)
  if (rel === 'version.json' || rel === 'sw.js') return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, BASE + 'index.html')); return; }
  if (url.searchParams.has('v') || rel.startsWith('vendor/') || rel.startsWith('icons/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});
