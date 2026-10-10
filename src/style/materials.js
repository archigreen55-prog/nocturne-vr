// W17 «Стиль»: the one factory of the game's materials (plan-W17-style.md §1.3). Every lit thing in the
// game is lit(): a map built with the Builder gets the style without a line of its own, and
// tests/style.test.mjs fails if a lit material is made anywhere else.
//
// Shader patches are a chain (userData.patches): the flashlight's room mask (enemies/flashMask.js),
// its wall test (enemies/flashWalls.js) and the style each add one; the program's cache key is the
// keys of its patches. A material made after the scene was patched (a friend who joins mid-round)
// gets the same patches through onNewLit().
//
// The style switch («Стиль: увімк / вимк»): ?style=off / ?style=on for this page, else the saved
// setting, else CFG.style.on. Off = the picture as before W17 (for comparing on the same phone).
import * as THREE from 'three';
import { CFG } from '../config/index.js';
import { loadSetting, saveSetting } from '../settings.js';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('style') : null;
export const STYLE_ON = q === 'off' ? false : q === 'on' ? true : loadSetting('style', CFG.style.on) !== false;
// the switch: saved, then the page reloads (the world is built once)
export function setStyle(on) {
  saveSetting('style', !!on);
  const u = new URL(location.href);
  u.searchParams.delete('style');
  location.replace(u.href);
}

// Adds a shader patch to a material: fn(shader, renderer) edits the shader; key names it in the cache.
export function addPatch(material, key, fn) {
  const u = material.userData;
  if (!u.patches) {
    u.patches = [];
    material.onBeforeCompile = (shader, renderer) => { for (const p of u.patches) p.fn(shader, renderer); };
    material.customProgramCacheKey = () => u.patches.map((p) => p.key).join('|');
  }
  u.patches.push({ key, fn });
  material.needsUpdate = true;
}

const late = [];
// fn(material) runs for every lit() made from now on (the flashlight's mask, once the scene has it)
export function onNewLit(fn) { late.push(fn); }

// A lit material: vertex colours by default (the Builder's parts carry their colour).
export function lit(params = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  m.userData.styled = true;
  for (const fn of late) fn(m);
  return m;
}
