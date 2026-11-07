// Keeps the patrol's flashlight from shining through walls, without shadow maps (cheap on Quest):
// every lit material multiplies the spot light by a room mask computed per fragment from its world
// position. The mask = the patrol's room + the rooms next to it through an open door or an arch
// (+ the yard when it is outside or at the open back door). The visible beam cone is clipped by the
// same mask. Cost: one extra varying and up to MAX rectangle tests per lit fragment; no extra passes.
import * as THREE from 'three';
import { addPatch } from '../style/materials.js';

const MAX = 8;

export const flashUniforms = {
  uFlashRooms: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
  uFlashBands: { value: Array.from({ length: MAX }, () => new THREE.Vector2(-1, 50)) },   // y range of each room (W6: floors)
  uFlashCount: { value: 0 },
  uFlashOutside: { value: 0 },
  // the second guard's hand lamp (W6): its own rooms, applied to the point light with this index
  uLampRooms: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
  uLampBands: { value: Array.from({ length: MAX }, () => new THREE.Vector2(-1, 50)) },
  uLampCount: { value: 0 },
  uLampOutside: { value: 0 },
  uLampIndex: { value: -1 },
};

// the map this page runs (its rooms, the openings between them, the house's outline): setLevel()
let level = null, byName = {};
export function setLevel(lv) {
  level = lv;
  byName = Object.fromEntries(lv.rooms.map((r) => [r.name, r]));
}
const glsl = () => /* glsl */ `
uniform vec4 uFlashRooms[${MAX}];
uniform vec2 uFlashBands[${MAX}];
uniform int uFlashCount;
uniform float uFlashOutside;
uniform vec4 uLampRooms[${MAX}];
uniform vec2 uLampBands[${MAX}];
uniform int uLampCount;
uniform float uLampOutside;
uniform int uLampIndex;
varying vec3 vFlashPos;
bool flashOutside(vec3 p) {
  return p.x < ${level.house.minX.toFixed(2)} || p.x > ${level.house.maxX.toFixed(2)} || p.z < ${level.house.minZ.toFixed(2)} || p.z > ${level.house.maxZ.toFixed(2)};
}
float flashMask(vec3 p) {
  if (uFlashOutside > 0.5 && flashOutside(p)) return 1.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uFlashCount) break;
    vec4 r = uFlashRooms[i];
    vec2 b = uFlashBands[i];
    if (p.x >= r.x && p.x <= r.z && p.z >= r.y && p.z <= r.w && p.y >= b.x && p.y <= b.y) return 1.0;
  }
  return 0.0;
}
float lampMask(vec3 p) {
  if (uLampOutside > 0.5 && flashOutside(p)) return 1.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uLampCount) break;
    vec4 r = uLampRooms[i];
    vec2 b = uLampBands[i];
    if (p.x >= r.x && p.x <= r.z && p.z >= r.y && p.z <= r.w && p.y >= b.x && p.y <= b.y) return 1.0;
  }
  return 0.0;
}
`;

function addVarying(shader) {
  Object.assign(shader.uniforms, flashUniforms);
  shader.vertexShader = 'varying vec3 vFlashPos;\n' + shader.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n#ifdef USE_INSTANCING\n\tvFlashPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;\n#else\n\tvFlashPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#endif');
  shader.fragmentShader = glsl() + shader.fragmentShader;
}

// Lit (Lambert) materials: the spot light term is multiplied by the mask.
export function maskLit(material) {
  if (material.userData.flashMask) return;
  material.userData.flashMask = true;
  addPatch(material, 'flashmask-lit', (shader) => {   // W17: a link in the material's patch chain (style/materials.js)
    addVarying(shader);
    // the lamp's factor once per fragment (not once per unrolled point light): its rooms, and (flashWalls.js) its walls
    const chunk = '\tfloat flashLampK = 1.0;\n\tif ( uLampIndex >= 0 ) { flashLampK = lampMask( vFlashPos ); }\n' + THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= flashMask( vFlashPos );')
      .replace('getPointLightInfo( pointLight, geometryPosition, directLight );',
        'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tif ( UNROLLED_LOOP_INDEX == uLampIndex ) directLight.color *= flashLampK;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
  });
}

// The visible beam (unlit): fragments outside the mask are dropped.
export function maskBeam(material) {
  addPatch(material, 'flashmask-beam', (shader) => {
    addVarying(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\n\tif ( flashMask( vFlashPos ) < 0.5 ) discard;');
  });
}

// Patch every lit material in the scene once (call after the scene is built), for this map
// (W17: every material from style/materials.js lit(); a later one is patched by onNewLit).
export function maskScene(scene, lv) {
  if (lv) setLevel(lv);
  let n = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.userData.styled && !m.userData.flashMask) { maskLit(m); n++; }
  });
  return n;
}

// Update the mask for the patrol at (x, z) on the floor at height y; doors: level.doors (open =
// swung more than ~15°). set 1 = the second guard's hand lamp (W6).
export function updateFlashMask(x, z, doors, y = 0, set = 0) {
  const here = level.roomAt(x, z, y);
  const floor = level.floorIndex ? level.floorIndex(y) : 0;
  const rooms = new Set([here]);
  for (const [a, b, dx, dz] of level.links) {
    if (a !== here && b !== here) continue;
    let open = dx === null || dx === undefined;
    if (!open) {
      const d = doors.find((dd) => (dd.floor || 0) === floor && Math.hypot(dd.cx - dx, dd.cz - dz) < 0.4);
      open = !!d && Math.abs(d.angle) > 0.25;
    }
    if (open) rooms.add(a === here ? b : a);
  }
  const U = flashUniforms;
  const R = set ? U.uLampRooms.value : U.uFlashRooms.value, Bd = set ? U.uLampBands.value : U.uFlashBands.value;
  let n = 0;
  (set ? U.uLampOutside : U.uFlashOutside).value = level.outside.some((name) => rooms.has(name)) ? 1 : 0;
  for (const name of rooms) {
    const r = byName[name];
    if (!r || n >= MAX) continue;
    Bd[n].set(r.yMin == null ? -1 : r.yMin, r.yMax == null ? 50 : r.yMax);
    R[n++].set(r.minX, r.minZ, r.maxX, r.maxZ);
  }
  (set ? U.uLampCount : U.uFlashCount).value = n;
  return rooms;
}
