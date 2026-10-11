// W17 «Стиль» S4 (plan-W17-style.md §3.4, §3.7): the friends' lobby gets the four thieves' portraits — each
// figure (style/figures.js) drawn once into a picture with the game's renderer, over ui/lobby.js's own
// <select id="netthief"> (the lobby's code is unchanged: a tap on a portrait sets the select and tells it);
// in the room's list each player's line carries a dot in the colour of their thief.
import * as THREE from 'three';
import { makeFigure, THIEF_COLOURS, FIGURES_ON } from './figures.js';
import { quietRandom } from './quiet.js';
import { css } from './palette.js';
import { styleUniforms as U } from './materials.js';
import { S } from '../i18n/index.js';
import { G } from '../systems/state.js';

const THIEVES = ['zoya', 'frol', 'rita', 'nazar'];
const PW = 120, PH = 150;
const cache = {};

// one portrait: head and shoulders, three-quarter, a lamp from the front, a dusk background
function portrait(who) {
  if (cache[who]) return cache[who];
  const r = G.renderer;
  const url = quietRandom(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18223a);
    scene.add(new THREE.HemisphereLight(0x8090c0, 0x202030, 2.2));
    const key = new THREE.DirectionalLight(0xffd9a8, 2.2); key.position.set(-1, 2, -3); scene.add(key);
    const fig = makeFigure(who);
    fig.root.rotation.y = -0.45;
    scene.add(fig.root);
    // head and chest: from the top of the head (the hat, the bun) a metre down, whatever the thief's size
    fig.mesh.geometry.computeBoundingBox();
    const top = fig.mesh.geometry.boundingBox.max.y + 0.12, mid = top - 0.52;
    const cam = new THREE.PerspectiveCamera(30, PW / PH, 0.1, 20);
    const d = 0.55 / Math.tan(THREE.MathUtils.degToRad(15));
    cam.position.set(d * 0.2, mid + 0.1, -d); cam.lookAt(0, mid, 0);
    const rt = new THREE.WebGLRenderTarget(PW, PH, { colorSpace: THREE.SRGBColorSpace });
    const prev = r.getRenderTarget();
    // the stealth's steps follow the level's lamps (its circles): a portrait is lit softly instead, and the uniforms go back
    const keep = [U.uStyleBands.value, U.uStyleExp.value, U.uStyleWarn.value];
    U.uStyleBands.value = 0; U.uStyleExp.value = 1; U.uStyleWarn.value = 1;
    r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(prev);
    [U.uStyleBands.value, U.uStyleExp.value, U.uStyleWarn.value] = keep;
    const px = new Uint8Array(PW * PH * 4);
    r.readRenderTargetPixels(rt, 0, 0, PW, PH, px);
    rt.dispose();
    fig.root.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const img = c.getContext('2d').createImageData(PW, PH);
    for (let y = 0; y < PH; y++) img.data.set(px.subarray((PH - 1 - y) * PW * 4, (PH - y) * PW * 4), y * PW * 4);   // WebGL rows are bottom-up
    c.getContext('2d').putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  });
  return (cache[who] = url);
}

// called when «Грати з друзями» opens (systems/menu.js)
export function dressLobby() {
  const box = document.getElementById('netbox'), sel = document.getElementById('netthief');
  if (!FIGURES_ON || !box || !sel || !G.renderer) return;   // «Стиль: вимк»: the lobby as it was
  let row = document.getElementById('netportraits');
  if (!row) {
    row = document.createElement('div');
    row.id = 'netportraits'; row.className = 'portraits';
    for (const t of THIEVES) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.thief = t; b.style.setProperty('--tc', css(THIEF_COLOURS[t]));
      const img = document.createElement('img'); img.alt = S.crew.names[t]; img.width = PW; img.height = PH;
      const name = document.createElement('span'); name.textContent = S.crew.names[t];
      b.append(img, name);
      b.addEventListener('click', () => { if (sel.disabled) return; sel.value = t; sel.dispatchEvent(new Event('change')); mark(); });
      row.append(b);
    }
    const who = document.getElementById('netwho');
    (who || box.firstChild).before(row);
    sel.addEventListener('change', mark);
    // the room's list: each line with a dot in the colour of its thief
    const list = document.getElementById('netlist');
    if (list) new MutationObserver(() => paintList(list)).observe(list, { childList: true });
  }
  for (const b of row.querySelectorAll('button')) { const img = b.querySelector('img'); if (!img.src) img.src = portrait(b.dataset.thief); }
  mark();
  function mark() { for (const b of row.querySelectorAll('button')) { b.classList.toggle('on', b.dataset.thief === sel.value); b.disabled = sel.disabled; } }
}
function paintList(list) {
  for (const li of list.children) {
    const t = THIEVES.find((k) => li.textContent.includes(` · ${S.crew.names[k]}`));
    if (t) li.style.setProperty('--tc', css(THIEF_COLOURS[t]));
  }
}
