# Nocturne VR

A small WebXR prototype for Meta Quest 3: a dark house at night where you move quietly — and
where the microphone hears you. Runs in the browser (three.js from a CDN, no build step).

**Play:** https://archigreen55-prog.github.io/nocturne-vr/

Status: deploy 1 — house with rooms and doors, walking, snap turn, comfort vignette, crouching,
microphone level (whisper / normal / shout) on the left wrist, FPS counter. No gameplay yet.

## Controls (Quest 3)

| Button | Action |
|---|---|
| Left stick | Walk where you look (a light push keeps steps quiet) |
| Right stick ← → | Snap turn 45° (30° in settings) |
| Trigger near a door | Open / close |
| B | Crouch / stand (for seated play) |
| X | FPS counter on the wrist |
| Left stick press | Vignette strength |
| Y (hold 1 s) | Recentre and measure standing height |
| Right stick press (hold 1 s) | Back to the van |

## Controls (keyboard)

Click to capture the mouse, WASD walk (Shift fast), E door, C crouch, F FPS, R back to the van,
Esc menu.

URL parameters: `?fps` (counter on), `?fbs=0.85` (XR framebuffer scale), `?fov=0.5` (foveation),
`?hz=72` (frame rate), `?vignette` (vignette on the laptop too), `?autostart`.

## Deploy

    node tools/bump-version.mjs   # new ?v= on every module + version.json
    git commit -am "…" && git push

GitHub Pages serves `main`. The page reloads itself once when `version.json` is newer than the
cached page.
