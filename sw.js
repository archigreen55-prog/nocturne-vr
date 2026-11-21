// Service worker: offline play and the home-screen app (plan-phone-mode §1.9, §7.3, wave T4).
// A failed request is tried again; a new version takes over only when no start is under way (below).
// It must never keep an old version:
//   pages (navigations)      the network first (revalidated, not the HTTP cache); the cache only offline
//   version.json, sw.js      always the network (the stale-page guard in index.html reads version.json)
//   ?v=<version> modules,    the cache first: their URL changes with every version, so a new build is a
//   vendor/, icons/          new URL; old ones are dropped when the new worker takes over
//   anything else            the network first, the cache offline
// One worker per site copy: the main site at /nocturne-vr/ and each preview at /nocturne-vr/preview/<b>/
// (its own scope and its own caches). The main site's worker leaves /preview/ alone.
// VERSION and FILES are written by tools/bump-version.mjs.
const VERSION = '0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2';
const FILES = [
  "./",
  "./index.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon-180.png",
  "./icons/crew/boots.svg",
  "./icons/crew/bottle.webp",
  "./icons/crew/breaker.webp",
  "./icons/crew/can.webp",
  "./icons/crew/gloves.svg",
  "./icons/crew/lock.svg",
  "./icons/crew/mask.svg",
  "./icons/crew/phone.webp",
  "./icons/crew/radio.webp",
  "./icons/crew/sneakers.svg",
  "./icons/crew/thermos.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./fonts/unbounded-cyrillic-800.woff2",
  "./fonts/unbounded-latin-800.woff2",
  "./vendor/three-0.186.1.min.js",
  "./vendor/three-addons.js?v=0.186.1",
  "./vendor/trystero-nostr-0.25.4.min.js",
  "./vendor/trystero-torrent-0.25.4.min.js",
  "./vendor/qrcode-generator-2.0.4.min.js",
  "./src/style/hud.css?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/menu.css?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/phone.css?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/tutorial.css?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/audio.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/calibrate.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/distractSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/goSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/mic.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/micHelp.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/placeSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/ringTap.worklet.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/runSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/scream.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/stairSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/trapSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/audio/whisperSfx.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/comfort/vignette.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/backWindow.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/campaign.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/contracts.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/crewTools.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/devices.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/difficulty.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/doors.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/guard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/hud.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/humanGuard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/index.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/items.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/mansion.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/maps.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/mic.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/net.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/noise.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/placeSound.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/player.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/reach.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/round.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/shop.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/sprint.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/start.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/story.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/style.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/throw.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/config/traps.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/debug/report.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/alert.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/brain.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/flashMask.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/flashWalls.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/lurker.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/nav.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/patrol.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/enemies/whisperer.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/campaign.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/contracts.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/difficulty.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/dropzone.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/economy.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/mischief.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/players.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/progress.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/reach.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/round.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/run.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/stealth.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/story.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/game/watchers.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/i18n/index.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/i18n/name.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/i18n/uk-w19-draft.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/i18n/uk.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/input/gyro.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/input/keyboard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/input/touch.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/input/xrInput.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/loot/hands.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/loot/items.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/loot/throw.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/main.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/net/remotePlayer.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/net/room.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/net/sync.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/net/transport.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/noise/noise.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/perf/gpuTimer.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/perf/quality.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/platform/feedback.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/platform/mode.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/platform/pwa.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/platform/screen.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/settings.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/anim.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/decor.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/figures.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/ink.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/materials.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/menuScene.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/palette.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/portraits.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/quiet.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/sheet.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/style/toon.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/backWindow.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/board.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/brightness.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/campaign.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/contract.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/controls.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/crewGuide.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/debugApi.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/desktop.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/distract.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/doors.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/economy.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/flashlight.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/flatScreen.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/goBanner.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/guards.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/heist.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/howCard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/humanGuard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/index.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/levelHints.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/levelStars.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/levels.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/mapView.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/menu.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/messages.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/micAuto.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/net.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/panel.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/phone.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/placeSound.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/playPage.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/player.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/progressCode.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/puddles.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/render.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/rig.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/sprint.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/startLine.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/startScreen.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/state.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/stats.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/story.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/style.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/traps.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/travel.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/tutorial.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/vr.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/world.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/systems/yardGuide.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/board.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/hostGone.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/hud.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/levelPick.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/lobby.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/menu.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/pointer.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/press.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/start.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/summary.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/tutorial.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/ui/wrist.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/version.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/collision.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/devices.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/floors.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/kit.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/level.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/mansion/furniture.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/mansion/layout.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/mansion/level.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/maps.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/vans.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/world/yard.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2",
  "./src/xr/player.js?v=0.6.0-pre.12.mic.7.breath.10.cv2.12.boot.2.coop.9.fix.2.crew.2"
];
const BASE = new URL('./', self.location).pathname;
const PREFIX = `nocturne:${BASE}:`;
const CACHE = PREFIX + VERSION;
const PREVIEW = /\/preview\/[^/]+\/$/.test(BASE);

// A new version installs while the page that found it is still loading its ~175 modules: the files come
// 6 at a time (not all at once next to the page's own requests), each tried again like any request, and
// the new worker waits. It takes over when the old pages are closed, or when a page whose game is up asks
// for it ('skipWaiting', src/platform/pwa.js) — never in the middle of a start, when taking over and
// dropping the old caches broke loads (plan 2026-11-17, step 4).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    const queue = FILES.slice();
    const worker = async () => {
      for (let f; (f = queue.shift()) !== undefined;) {
        const req = new Request(f, { cache: 'reload' });
        const res = await fetchRetry(req, undefined, { versioned: true });
        if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
        await c.put(req, res);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// One failed request out of ~175 modules stops the whole game (the browser gives up on the module graph),
// so a request is tried again before the page sees it fail (plan 2026-11-17, step 2): a network error, a 5xx
// or a 429 after 0.4, 1.2 and 2.5 s (a phone that drops the network for a second gets it back), a 404 of a
// versioned file once (a deploy switching over). A page load (navigation) offline goes straight to the cache.
const WAITS = [400, 1200, 2500];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(req, init, { navigate = false, versioned = false } = {}) {
  for (let i = 0; ; i++) {
    let res = null, err = null;
    try { res = await fetch(req, init); } catch (e) { err = e; }
    const again = err ? true : res.status >= 500 || res.status === 429 || (versioned && res.status === 404 && i === 0);
    if (!again || i >= (navigate ? 1 : WAITS.length) || (navigate && !self.navigator.onLine)) { if (err) throw err; return res; }
    await sleep(WAITS[i]);
  }
}

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  const fromCache = () => cache.match(fallbackUrl || req, { ignoreSearch: !!fallbackUrl }).then((hit) => hit || cache.match(req, { ignoreSearch: true }));
  try {
    // a navigation goes by its URL (a navigate-mode request cannot be re-sent with options)
    const res = await fetchRetry(fallbackUrl ? req.url : req, { cache: 'no-cache' }, { navigate: !!fallbackUrl });
    if (res.ok) cache.put(fallbackUrl || req, res.clone());
    else if (res.status >= 500) { const hit = await fromCache(); if (hit) return hit; }   // the server is down: the copy we have
    return res;
  } catch (err) {
    const hit = await fromCache();
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetchRetry(req, undefined, { versioned: true });
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// The page's boot report names the file that failed for good (plan 2026-11-17, step 1).
function told(e, p) {
  const tell = (what) => {
    const u = new URL(e.request.url);
    self.clients.get(e.clientId).then((c) => c && c.postMessage({ nocturneFail: { url: u.pathname.slice(BASE.length) + u.search, what, tries: WAITS.length + 1, version: VERSION } })).catch(() => {});
  };
  return p.then((res) => { if (!res.ok) tell(`HTTP ${res.status}`); return res; }, (err) => { tell(String(err && err.message || err)); throw err; });
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const rel = url.pathname.slice(BASE.length);
  if (!PREVIEW && rel.startsWith('preview/')) return;   // the previews have their own worker (or none)
  if (rel === 'version.json' || rel === 'sw.js') return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, BASE + 'index.html')); return; }
  if (url.searchParams.has('v') || rel.startsWith('vendor/') || rel.startsWith('icons/')) { e.respondWith(told(e, cacheFirst(req))); return; }
  e.respondWith(told(e, networkFirst(req)));
});
