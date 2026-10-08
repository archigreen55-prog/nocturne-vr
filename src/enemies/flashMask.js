// Keeps the patrol's flashlight from shining through walls, without shadow maps (cheap on Quest):
// every lit material multiplies the spot light by a room mask computed per fragment from its world
// position. The mask = the patrol's room + the rooms next to it through an open door or an arch
// (+ the yard when it is outside or at the open back door). The visible beam cone is clipped by the
// same mask. Cost: one extra varying and up to MAX rectangle tests per lit fragment; no extra passes.
import * as THREE from 'three';
import { ROOMS, ROOM_LINKS, HOUSE, roomAt } from '../world/level.js';
import { S } from '../i18n/index.js';

const MAX = 8;

export const flashUniforms = {
  uFlashRooms: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
  uFlashCount: { value: 0 },
  uFlashOutside: { value: 0 },
};

const GLSL = /* glsl */ `
uniform vec4 uFlashRooms[${MAX}];
uniform int uFlashCount;
uniform float uFlashOutside;
varying vec3 vFlashPos;
float flashMask(vec3 p) {
  if (uFlashOutside > 0.5 && (p.x < ${HOUSE.minX.toFixed(2)} || p.x > ${HOUSE.maxX.toFixed(2)} || p.z < ${HOUSE.minZ.toFixed(2)} || p.z > ${HOUSE.maxZ.toFixed(2)})) return 1.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uFlashCount) break;
    vec4 r = uFlashRooms[i];
    if (p.x >= r.x && p.x <= r.z && p.z >= r.y && p.z <= r.w) return 1.0;
  }
  return 0.0;
}
`;

function addVarying(shader) {
  Object.assign(shader.uniforms, flashUniforms);
  shader.vertexShader = 'varying vec3 vFlashPos;\n' + shader.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n\tvFlashPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  shader.fragmentShader = GLSL + shader.fragmentShader;
}

// Lit (Lambert) materials: the spot light term is multiplied by the mask.
export function maskLit(material) {
  if (material.userData.flashMask) return;
  material.userData.flashMask = true;
  material.onBeforeCompile = (shader) => {
    addVarying(shader);
    const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= flashMask( vFlashPos );');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
  };
  material.customProgramCacheKey = () => 'flashmask-lit';
  material.needsUpdate = true;
}

// The visible beam (unlit): fragments outside the mask are dropped.
export function maskBeam(material) {
  material.onBeforeCompile = (shader) => {
    addVarying(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\n\tif ( flashMask( vFlashPos ) < 0.5 ) discard;');
  };
  material.customProgramCacheKey = () => 'flashmask-beam';
  material.needsUpdate = true;
}

// Patch every lit material in the scene once (call after the scene is built).
export function maskScene(scene) {
  let n = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.isMeshLambertMaterial && !m.userData.flashMask) { maskLit(m); n++; }
  });
  return n;
}

const byName = Object.fromEntries(ROOMS.map((r) => [r.name, r]));

// Update the mask for the patrol at (x, z); doors: level.doors (open = swung more than ~15°).
export function updateFlashMask(x, z, doors) {
  const here = roomAt(x, z);
  const rooms = new Set([here]);
  for (const [a, b, dx, dz] of ROOM_LINKS) {
    if (a !== here && b !== here) continue;
    let open = dx === null || dx === undefined;
    if (!open) {
      const d = doors.find((dd) => Math.hypot(dd.cx - dx, dd.cz - dz) < 0.4);
      open = !!d && Math.abs(d.angle) > 0.25;
    }
    if (open) rooms.add(a === here ? b : a);
  }
  const U = flashUniforms;
  let n = 0;
  U.uFlashOutside.value = rooms.has(S.rooms.yard) ? 1 : 0;
  for (const name of rooms) {
    const r = byName[name];
    if (!r || n >= MAX) continue;
    U.uFlashRooms.value[n++].set(r.minX, r.minZ, r.maxX, r.maxZ);
  }
  U.uFlashCount.value = n;
  return rooms;
}
