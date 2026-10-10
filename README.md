# Nocturne VR

A small game for the browser: a dark house at night, a watchman with a flashlight, something in the
bedroom wardrobe, and a van waiting outside. Move quietly, carry the valuables out, and keep your voice
down: the microphone is part of the game. One code base for a **phone**, a **PC** and a **VR headset**
(Meta Quest 3); no build step, no install from a store.

**Play:** https://archigreen55-prog.github.io/nocturne-vr/ · **Privacy:** https://archigreen55-prog.github.io/nocturne-vr/privacy.html

## Play on a phone

1. Open the link above in **Chrome** (Android) or **Safari** (iPhone, iOS 16.4 or newer). Hold the
   phone **landscape**.
2. **Add it to the home screen** for full screen, offline play and a storage that Safari does not wipe:
   Android — the «Встановити на головний екран» button on the start screen (or Chrome's ⋮ menu → «Додати
   на головний екран»); iPhone — Share → «На початковий екран» → «Додати». On iPhone the home-screen app
   has its own storage: move your progress with «Прогрес: код» (below).
3. **Microphone** (optional, it is the main mechanic): «Дозволити мікрофон» → «Калібрувати (5 кроків)»
   holding the phone the way you will play, 30–40 cm from your face, bottom edge uncovered. Headphones are
   best: then the game's own sounds do not reach the microphone. Then «Перевірити: шепіт, голос, крик».
   iPhone: if you hear nothing, check the side silent switch and «Перевірити звук».
4. «Грати». The first time, a short **tutorial** walks you through looking, walking and the board at the
   van, then gives hints during the first round; «Пропустити» ends it. Start it again with «Навчання ще
   раз» (start screen, or menu ❚❚ → Налаштування).
5. **Progress as a code**: «Прогрес: код» → «Експорт» copies one line with your stars, settings and
   calibration; on another device (or in the home-screen app) «Імпорт» → paste → «Перевірити код» →
   «Замінити прогрес на цьому пристрої».
6. Something wrong? Menu ❚❚ → «Скопіювати звіт» and paste it into an issue.

| Where | Phone controls |
|---|---|
| Left half | Floating joystick: inside the dashed ring steps are quiet, beyond it they are heard |
| Right half | Look around (gyroscope as an option in the settings) |
| Взяти / Покласти / Натиснути | Appears when an item (or a board button) is under the crosshair |
| Двері | Tap = quick and loud; hold = slow and quiet, release = the door stops |
| Присісти | Crouch / stand |
| Подих | Hold your breath: the microphone is ignored for up to 6 s |
| ❚❚ | Pause menu: continue, to the van, new round, contract, settings, microphone, report |

Settings (start screen or ❚❚ → Налаштування): look speed, breath button (hold / tap-tap), HUD (full /
minimal), vibration (iPhone: edge flashes), quality and 30 / 60 FPS, gyroscope.

## Devices

One game, one code base; the mode is chosen automatically and shown on the start screen:
**VR** (a headset browser: start screen, then Enter VR), **phone** (Android, iPhone, iPad: touch
controls, see above) and **PC** (keyboard and mouse). `?mode=vr|phone|pc` overrides
the detection and is remembered on the device; `?mode=auto` goes back to automatic.

Phone version status: wave T5 — ready for players: the first-run tutorial, the privacy page, progress
as a code. Earlier: T4 performance and the home-screen app; T3 the microphone on a phone; T2 HTML HUD,
pause menu, round summary, vibration; T1 touch controls; T0 mode detection, "Скопіювати звіт" (device,
version, FPS, microphone and errors as JSON to paste into a chat), `?debug` error panel, a clear message
when the game cannot start (for example iOS older than 16.4).

## Phone details

Portrait while playing pauses the game behind "rotate the phone". Android Chrome goes full screen and
locks landscape on "Грати"; iPhone Safari has neither (add the game to the home screen for full screen,
wave T4). The screen stays on during play (Wake Lock).

### HUD, menu, summary, feedback (phone)

- **HUD** (HTML, instead of the wrist panel): top left the eye (how visible you are) and stance, then steps /
  what you hold / room; top centre the clock, the alarm word and the contract goal; top right the microphone
  (label, bar with both thresholds); bottom centre messages and the guard's lines. The breath ring is the
  breath button. "Індикатори: мінімальні" keeps the eye, microphone and clock and shows the rest for a few
  seconds when it changes.
- **Pause menu** (❚❚): continue, to the van, new round, contract and difficulty (before the round starts),
  settings (look speed, breath, HUD, vibration), microphone and calibration (opens the start screen), copy
  the report. The game and all sound wait behind it.
- **Automatic pause**: minimising the page, a phone call or notification, the system taking the audio away.
  "Продовжити" (a tap) wakes the sound again.
- **Round summary** (HTML) replaces the floating result board: title, money, items, stars and the contract
  verdict, the scream replay, "Новий раунд".
- **Feedback**: vibration on Android (steps become audible, hidden, heartbeat, shout, alarm, caught, scare);
  on iPhone (no `navigator.vibrate`) a short flash of the screen edge, and a soft sound for "hidden".
  Setting "Вібрація": auto / flashes only / off.
- In VR and on a PC nothing changes: the wrist panel and the 3D board stay.

### Performance and the home-screen app (T4)

- **Board by the crosshair**: aim the centre of the screen at a board button and press «Натиснути» (the
  context button), or tap the board button itself.
- **Quality** (settings): auto / low / medium / high (pixel ratio 1.0 / 1.25 / 1.5; low also drops MSAA,
  far lamps and 3D sound panning). Auto starts at medium (high on iPhone) and steps down once if the
  first 5 s of play run under 40 FPS. **Dynamic resolution** steps the pixel ratio down when the frame rate
  stays low and back up when it recovers. **30 / 60 FPS** cap (30 = battery saver).
- The board is redrawn only when what it shows changes and it is in view. The report has FPS per minute
  with the preset, pixel ratio and cap, and the battery level.
- three.js is a minified local copy in `vendor/` (`node tools/vendor-three.mjs`), no CDN.
- **Home-screen app**: `manifest.webmanifest` (full screen, landscape), icons (`node tools/make-icons.mjs`),
  an install button on Android, the "Поділитися → На початковий екран" hint on iPhone.
- **Service worker** (`sw.js`, phone only): offline play after the first visit. It never keeps an old
  version: pages come from the network first, every module URL carries `?v=<version>`, and
  `tools/bump-version.mjs` writes the version and the file list into `sw.js`. The main site and each
  preview have their own worker and caches. `?nosw` removes it.
- **Gyroscope** (option): turning the phone turns the view, on top of the finger.

### Microphone on a phone (T3)

- **Calibration in 5 steps**: silence, **game sounds** (the game plays steps, a creak, a siren from the speaker
  while you keep quiet, and measures how much of it the microphone hears), whisper, voice, shout. Hold the
  phone the way you will play; headphones are best.
- **The game's own sounds are not your voice**: an analyser on the game's sound bus; while the game is loud,
  the whisper / shout boundaries rise above the game as the microphone hears it (the HUD says "звуки гри:
  межі +N дБ").
- **Check after the wizard**: whisper, say, shout — the game shows what it heard and which ± to press.
- **Permission**: before asking, what the dialogs will be; if refused, where to allow it (Chrome on Android,
  Safari on iPhone).
- **"Microphone covered?"** when the level stays far under your calibrated silence.
- **After a call / a minimised page**: "Продовжити" re-opens the microphone if the system stopped it.
  Headphones plugged in or out: the game asks for a new calibration.
- **iPhone**: audio session 'playback' (the side silent switch does not mute the game) and 'play-and-record'
  with the microphone (Safari 16.4+; older iOS: a silent audio loop); a "Перевірити звук" button.
- VR and PC: the microphone and the 4-step calibration as before.

## Play with friends (test)

On the start screen, «Грати з друзями»: one player creates a room (a 6-digit code, a QR code and a link),
the others open the link or type the code. The browsers find each other through public relays (Nostr,
then WebTorrent trackers; the [Trystero](https://github.com/dmotz/trystero) library) and then talk
directly (WebRTC). The room's creator is the host: its game runs the guards, the loot and the clock; the
friends' bodies are in its house. There is no server of ours and no voice chat yet. Without a TURN
server some networks (often mobile ↔ mobile) cannot connect directly; one Wi‑Fi always works.
Two tabs of one browser can try it with `?net=local`.

«За сторожа» (W15): in the room, before the clock starts, one friend can press «Стати сторожем» and play
the first guard instead of the AI. The guard's screen shows a thief only when the game would see it (in
the light, or close, with a line of sight) and plays only the noises a guard would hear. «Схопити» (the
context button; A in VR) catches a thief in reach in front; walking into one catches it too. «Викликати
Центральну» (the full alarm) stays grey until the guard saw a thief or noticed missing loot. A caught
thief sits in the van for 60 s. The guard wins when every thief is in the van at once or the clock beats
them; the thieves win by delivering the goal and gathering at the van. The guard cannot come within 4 m
of the van.

## Privacy

[privacy.html](https://archigreen55-prog.github.io/nocturne-vr/privacy.html): the microphone is analysed on the device only and nothing is sent anywhere unless you open a room with friends (then only game data goes to them: name, position, the microphone level as one word, never audio);
to replay a scream, the game keeps the last seconds of microphone audio in memory only (a new round drops
it); settings, calibration and stars stay in the browser's localStorage on the device; no analytics, ads,
accounts or cookies. Contact: the repository's Issues.

## Controls (Quest 3)

| Button | Action |
|---|---|
| Left stick | Walk where you look (a light push keeps steps quiet) |
| Right stick ← → | Snap turn 45° (30° in settings) |
| Grip near an item | Pick up / let go; big items need both hands |
| Drop-off ring behind the van | Walk in with loot in your hands: it flies into the van |
| Trigger on a door handle | Drag the door by hand: slow = quiet, fast = creak |
| Trigger near a door | Quick swing (creaks) |
| Trigger at the board | Board buttons |
| A (hold) | Hold your breath: the mic is ignored for up to 6 s; the rest after it is proportional (up to 20 s) |
| B | Crouch / stand (for seated play) |
| X | FPS counter on the wrist |
| Left stick press | Vignette strength |
| Y (hold 1 s) | Recentre and measure standing height |
| Right stick press (hold 1 s) | Back to the van |

## Controls (keyboard)

Click to capture the mouse (click the board to press its buttons), WASD walk (Space fast),
E pick up / put down (walk into the ring behind the van to deliver), Q / T door slow / fast, Shift hold breath,
C crouch, F FPS, R back to the van, N new round, Esc menu.

URL parameters: `?mode=vr|phone|pc|auto` (see Devices), `?debug` (error panel), `?fps` (counter on), `?fbs=0.85` (XR framebuffer scale), `?fov=0.5` (foveation),
`?hz=72` (frame rate), `?vignette` (vignette on the laptop too), `?autostart`,
`?rec=script|recorder` (force a scream recorder fallback), `?flash=nomask|shadow|off` (flashlight
variants for measuring).

## Contracts and difficulty

Choose them on the board next to the van (it faces you at the start) or on the start screen. The
clock starts when you walk 4.5 m away from the van. Stars: ★ goal, ★★ bonus, ★★★ goal + bonus on hard.

**Maps.** Two houses: the dacha (one floor, one watchman: the tutorial house) and the mansion (two floors,
two watchmen with a radio, 14 items, contracts 8–14). The board's «Карта…» page switches between them
(the page reloads with `?map=mansion` / `?map=dacha`; the choice is remembered). The mansion is open on
previews; on the main site it waits behind `CFG.maps.mansion.open` in `src/config/maps.js`.

## Code layout

- `src/main.js` — the game loop only. The game is **systems** in `src/systems/`, listed in order in
  `src/systems/index.js` (a new system = a new file + one line); their shared state is `src/systems/state.js`.
- `src/config/` — all gameplay numbers (radii, thresholds, speeds, timer, items, difficulty, contracts),
  one file per topic, gathered into one `CFG` by `src/config/index.js`.
- `src/i18n/` — every text players see: `uk.js` (Ukrainian), the mechanism in `index.js` (another
  language = one file, `?lang=<code>`), the game's name in `name.js`.
- `src/ui/phone.css`, `src/ui/tutorial.css` — the phone UI and the tutorial bubble.
- Several sessions at once: [CONTRIBUTING-agents.md](CONTRIBUTING-agents.md).

## Deploy

    node tools/bump-version.mjs <version>   # ?v= on every module and stylesheet, version.json, sw.js, the game's name
    git commit -am "…" && git push

GitHub Pages is built by `.github/workflows/pages.yml` (`tools/build-site.mjs`): `main` at the site
root, every other branch at `/preview/<branch>/` (list: `/preview/`), so a change can be tried on a
phone before it is merged. Previews keep their settings apart from the main site (they read the main
site's until they save their own). Versions are `X.Y.Z-pre.N`; a branch built in parallel with others
uses `<base>.<label>.<n>` (CONTRIBUTING-agents.md). The page reloads itself once when `version.json`
differs from the cached page.

## Tests

    npm install && npm test

Chromium (Playwright), a fresh browser per test; the tests are in `tests/<topic>.test.mjs` (found
automatically; shared server and helpers in `tests/runner.mjs`): mode detection, the report and boot
failures, previews, the fake microphone and its phone wizard, phone touch controls, HUD, menu and
summary, performance presets, the home-screen app and the service worker, versions of parallel
branches, texts and languages, the tutorial, the progress code and the privacy page, the PC keyboard
and a short round, and a VR regression in the WebXR emulator (IWER, Quest 3).
`ONLY=word npm test` — the tests whose name contains the word; `FILE=topic npm test` — one file;
`LIST=1 npm test` — the names. `node tools/snapshot.mjs` records texts, config, a deterministic
simulation trace, DOM and screenshots, to prove a refactor changed nothing. Real Safari and real
phones are tested by hand.
