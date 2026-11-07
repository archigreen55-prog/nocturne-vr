// Display brightness (phone and PC; not VR): what the player SEES, nothing the game reads. Like a
// camera exposure: every light (sky, moon, lamps) is multiplied by the same k, so a dark corner stays
// clearly darker than a lit spot; the warnings (the guard's flashlight and its cone, lamp and window
// glow, noise ripples) get k x WARN, so they stand out as much as at the first step.
// The fog moves further out. Light intensities, opacities and fog distances are uniforms: no new
// lights, no shader rebuild. Stealth reads CFG.stealth.lamps and the beam angle, not these lights.
// «Надворі» (outdoors): the top step + a high-contrast HUD (body.outdoor, src/ui/phone.css).
import { loadSetting, saveSetting } from '../settings.js';
import { bindPress } from '../ui/press.js';
import { S } from '../i18n/index.js';
import { G, $ } from './state.js';

export const LIGHT = [1, 1.35, 1.8, 2.4, 3.2];   // k per step
// The warnings (the flashlight cone and its light, noise ripples, lamp and window glow) get a little
// more on top: on a brighter picture the screen's gamma squeezes an added glow, and they must stand out
// as much as at the first step (tests/brightness.test.mjs measures it).
const WARN = [1, 1.15, 1.4, 1.75, 2.2];
const FOG = [1, 1.25, 1.5, 1.75, 2];             // fog near / far x
const TOP = LIGHT.length - 1;

let step = 0, outdoor = false, base = null, enabled = false;

const effective = () => (outdoor ? TOP : step);
export const brightnessState = () => ({ step, outdoor, effective: effective(), k: G.lightK, enabled });

// k on everything that is drawn (1 in a VR session: the headset keeps its own picture)
function apply() {
  const on = enabled && !G.inVR;
  const k = on ? LIGHT[effective()] : 1, w = on ? WARN[effective()] : 1, f = on ? FOG[effective()] : 1;
  const { alert, noise, patrol, scene } = G;
  const old = G.lightK, oldGlow = alert.glowGain;
  G.lightK = k;
  alert.gain = k; alert.glowGain = k * w; noise.gain = k * w;
  // the lights now (alert writes them again from its base every frame of play)
  const L = alert.lights;
  L.hemi.intensity *= k / old; L.moon.intensity *= k / old;
  for (const p of L.points) p.intensity *= k / old;
  L.glow.color.multiplyScalar(k * w / oldGlow);
  patrol.spot.intensity = base.spot * k * w;
  patrol.beam.material.opacity = Math.min(1, base.beam * k * w);
  scene.fog.near = base.near * f; scene.fog.far = base.far * f;
  document.body.classList.toggle('outdoor', enabled && outdoor && !G.inVR);
  refreshUi();
}
function refreshUi() {
  if (!enabled) return;
  $('brightval').textContent = S.bright.value(effective() + 1, LIGHT.length);
  $('brightdn').disabled = effective() === 0;
  $('brightup').disabled = effective() === TOP;
  $('outdoorbtn').textContent = outdoor ? S.bright.outdoorOn : S.bright.outdoor;
  $('outdoorbtn').classList.toggle('on', outdoor);
  if (G.menu) G.menu.refresh();
}
function save() { saveSetting('brightness', step); saveSetting('outdoor', outdoor); }

// − / +: one step; while «Надворі» is on, − turns it off one step below the top
export function brightnessStep(d) {
  if (!enabled) return;
  if (outdoor) { if (d > 0) return; outdoor = false; step = TOP - 1; }
  else step = Math.max(0, Math.min(TOP, step + d));
  save(); apply();
}
// «Надворі»: on = the top step + the high-contrast HUD; off = back to the step chosen before
export function toggleOutdoor() {
  if (!enabled) return;
  outdoor = !outdoor;
  save(); apply();
}
export const brightnessLabel = () => S.bright.menu(effective() + 1, LIGHT.length);
export const outdoorLabel = () => (outdoor ? S.bright.outdoorOn : S.bright.outdoor);

export const brightness = {
  id: 'brightness',
  init() {
    const { patrol, scene, renderer } = G;
    base = { spot: patrol.spot.intensity, beam: patrol.beam.material.opacity, near: scene.fog.near, far: scene.fog.far };
    G.lightK = 1;
    if (G.MODE.mode === 'vr') { $('brightrow').style.display = 'none'; $('brighthint').hidden = true; return; }   // VR mode: untouched (.row is display: flex, stronger than [hidden])
    enabled = true;
    const s = loadSetting('brightness', 0);
    step = Number.isInteger(s) ? Math.max(0, Math.min(TOP, s)) : 0;
    outdoor = loadSetting('outdoor', false) === true;
    $('brighthint').textContent = G.touch ? S.bright.hintPhone : S.bright.hintPc;
    bindPress($('brightdn'), () => brightnessStep(-1));
    bindPress($('brightup'), () => brightnessStep(1));
    bindPress($('outdoorbtn'), () => toggleOutdoor());
    // a VR session from a PC: the headset sees the normal picture; back to the setting afterwards
    renderer.xr.addEventListener('sessionstart', () => apply());
    renderer.xr.addEventListener('sessionend', () => apply());
    apply();
  },
};
