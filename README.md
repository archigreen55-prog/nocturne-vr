# Nocturne VR

A small WebXR prototype for Meta Quest 3: a dark house at night, a watchman with a flashlight,
something in the bedroom wardrobe, and a van waiting outside. Move quietly, carry the valuables out,
and keep your voice down: the microphone is part of the game. Runs in the browser (three.js from a
CDN, no build step).

**Play:** https://archigreen55-prog.github.io/nocturne-vr/

Status: wave 1 (0.5.0) — a guard that plans its own rounds (rooms it has not seen, habits like tea,
phone and toilet as windows of opportunity, notices missing loot and doors left open, checks hiding
spots, radios for help), three difficulties, five contracts with stars chosen on the board at the van,
and a 4-step microphone calibration (silence / whisper / voice / shout) that also runs inside VR, with
manual thresholds and a no-microphone mode. Earlier: deploy 4 — readable stealth (visibility eye and "hidden" on the wrist, suspicion bar over
the patrol, a short reaction delay), a sturdier shout detector with a shout calibration step. Earlier:
loot (one- and two-handed, fragile crystal) delivered through a glowing drop-off
ring behind the van, noise from steps / doors / drops / your voice, a patrol that hears and sees
(its flashlight stays in the rooms it can light), a lurker that jumps out, alarm lights, a 7-minute
round with an escape phase, a result board that replays your loudest scream.

## Devices

One game, one code base; the mode is chosen automatically and shown on the start screen:
**VR** (a headset browser: start screen, then Enter VR), **phone** (Android, iPhone, iPad: touch
controls are being built, see below) and **PC** (keyboard and mouse). `?mode=vr|phone|pc` overrides
the detection and is remembered on the device; `?mode=auto` goes back to automatic.

Phone version status: wave T3 — the microphone on a phone (below). Earlier: T2 HTML HUD, pause menu,
round summary, vibration; T1
touch controls; T0 mode detection, "Скопіювати звіт" (device, version, FPS, microphone and errors as JSON
to paste into a chat), `?debug` error panel, a clear message when the game cannot start (for example iOS
older than 16.4). Next: performance and the home-screen app (T4).

## Controls (phone, landscape)

| Where | Action |
|---|---|
| Left part of the screen | Floating joystick: inside the dashed ring steps are quiet, beyond it they are heard (the ring turns amber; a short vibration on Android) |
| Right part of the screen | Look around by dragging |
| Tap on the board | Board buttons (contract, difficulty, microphone, "Поїхати") |
| Взяти / Покласти | Appears when an item is at the centre of the screen |
| Двері | Tap = quick swing (creaks); hold = slow and quiet, release = the door stops |
| Присісти | Crouch / stand |
| Подих | Hold your breath (hold, or tap / tap in the settings) |
| ❚❚ | Pause menu (fires when the finger is lifted over it) |

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

## Privacy

The microphone is analysed on the device only. To replay a scream, the game keeps the last 4 s of
microphone audio in memory; nothing is written to disk or sent anywhere, and a new round drops it.

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

## Tuning

All gameplay numbers (radii, thresholds, speeds, timer, item values and positions) are in
[src/game/config.js](src/game/config.js).

## Deploy

    node tools/bump-version.mjs   # new ?v= on every module + version.json
    git commit -am "…" && git push

GitHub Pages is built by `.github/workflows/pages.yml` (`tools/build-site.mjs`): `main` at the site
root, every other branch at `/preview/<branch>/` (list: `/preview/`), so a change can be tried on a
phone before it is merged. Previews keep their settings apart from the main site (they read the main
site's until they save their own). Preview versions are `X.Y.Z-pre.N`. The page reloads itself once
when `version.json` is newer than the cached page.

## Tests

    npm install && npm test

Chromium (Playwright) with three.js served from `node_modules`, a fresh browser per test: mode
detection for Android / iPhone / iPad / Quest / PC user agents, the report, boot failure messages,
preview settings, a fake microphone and the threshold limits, phone touch controls (joystick quiet /
loud, look, buttons, door hold, board tap, portrait pause), the laptop keyboard, a short laptop round,
and a VR regression in the WebXR emulator (IWER, Quest 3). `ONLY=word npm test` runs the tests whose
name contains the word. Real Safari and real phones are tested by hand.
