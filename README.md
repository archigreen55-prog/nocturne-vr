# Nocturne VR

A small WebXR prototype for Meta Quest 3: a dark house at night, a watchman with a flashlight,
something in the bedroom wardrobe, and a van waiting outside. Move quietly, carry the valuables out,
and keep your voice down: the microphone is part of the game. Runs in the browser (three.js from a
CDN, no build step).

**Play:** https://archigreen55-prog.github.io/nocturne-vr/

Status: deploy 4 — readable stealth (visibility eye and "hidden" on the wrist, suspicion bar over
the patrol, a short reaction delay), a sturdier shout detector with a shout calibration step. Earlier:
loot (one- and two-handed, fragile crystal) delivered through a glowing drop-off
ring behind the van, noise from steps / doors / drops / your voice, a patrol that hears and sees
(its flashlight stays in the rooms it can light), a lurker that jumps out, alarm lights, a 7-minute
round with an escape phase, a result board that replays your loudest scream.

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

URL parameters: `?fps` (counter on), `?fbs=0.85` (XR framebuffer scale), `?fov=0.5` (foveation),
`?hz=72` (frame rate), `?vignette` (vignette on the laptop too), `?autostart`,
`?rec=script|recorder` (force a scream recorder fallback), `?flash=nomask|shadow|off` (flashlight
variants for measuring).

## Tuning

All gameplay numbers (radii, thresholds, speeds, timer, item values and positions) are in
[src/game/config.js](src/game/config.js).

## Deploy

    node tools/bump-version.mjs   # new ?v= on every module + version.json
    git commit -am "…" && git push

GitHub Pages serves `main`. The page reloads itself once when `version.json` is newer than the
cached page.
