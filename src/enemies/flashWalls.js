// The guard's flashlight stops at walls. The room mask (flashMask.js) lights the guard's room and the
// rooms it sees into through an opening, but a whole room: also the side of a wall turned away from
// the flashlight, and with the back door open the house's outer wall and the yard behind it.
// Here: a shadow map on the floor plan. Every frame the CPU casts RAYS rays around the flashlight (on
// the floor plan) against the wall centre lines and the door leaves and writes, for each direction,
// how far the light gets: one row of a float texture. A lit fragment inside the light cone reads its
// direction's distance and is in shadow when it lies further. The visible beam is cut the same way.
// Per fragment: one atan and one texture read; the shaders are built once with the room mask when the
// page loads (the texture and the numbers change, the program does not).
// The level gives level.occluders [x0, z0, x1, z1, y0, y1] (static walls) and level.doors.
import * as THREE from 'three';

const RAYS = 720;            // 0.5° per ray: at 5 m the shadow's edge is within 4 cm
const FAR = 100;             // no wall that way
const LEAF_H = 2.1;

const dist = new Float32Array(RAYS);
const tex = new THREE.DataTexture(dist, RAYS, 1, THREE.RedFormat, THREE.FloatType);
tex.magFilter = tex.minFilter = THREE.NearestFilter;
tex.wrapS = THREE.RepeatWrapping;
tex.generateMipmaps = false;
tex.needsUpdate = true;

export const wallUniforms = {
  uFlashFrom: { value: new THREE.Vector3() },
  uFlashWallTex: { value: tex },
  uFlashWallOn: { value: 0 },
};

const GLSL = /* glsl */ `
uniform vec3 uFlashFrom;
uniform sampler2D uFlashWallTex;
uniform float uFlashWallOn;
float flashWalls(vec3 p) {
  if (uFlashWallOn < 0.5) return 1.0;
  vec2 d = p.xz - uFlashFrom.xz;
  float u = atan(d.y, d.x) * 0.15915494 + 0.5;
  // 2 cm past the wall's centre line still lit: its own face on the flashlight's side
  return length(d) <= texture2D(uFlashWallTex, vec2(u, 0.5)).r + 0.02 ? 1.0 : 0.0;
}
`;

const LIT = 'directLight.color *= flashMask( vFlashPos );';
const BEAM = 'if ( flashMask( vFlashPos ) < 0.5 ) discard;';

// After flashMask's maskLit / maskBeam: the same materials also test the walls.
function wrap(material, find, replace, key) {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    if (!shader.fragmentShader.includes(find)) throw new Error('flashWalls: the flashlight mask code was not found');
    Object.assign(shader.uniforms, wallUniforms);
    shader.fragmentShader = GLSL + shader.fragmentShader.replace(find, replace);
  };
  material.customProgramCacheKey = () => prevKey.call(material) + key;
  material.needsUpdate = true;
}
// every lit material the room mask patched; the beam
export function wallsOnScene(scene, beamMaterial) {
  let n = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m.userData.flashMask || m.userData.flashWalls) continue;
      m.userData.flashWalls = true;
      // only inside the cone and the mask (elsewhere the spot light is already black)
      wrap(m, LIT, LIT + '\n\t\tif ( directLight.color.r + directLight.color.g + directLight.color.b > 0.0 ) directLight.color *= flashWalls( vFlashPos );', '-walls');
      n++;
    }
  });
  wrap(beamMaterial, BEAM, 'if ( flashMask( vFlashPos ) < 0.5 || flashWalls( vFlashPos ) < 0.5 ) discard;', '-walls');
  wallUniforms.uFlashWallOn.value = 1;
  return n;
}

const segs = [];
// Every frame: from the flashlight, how far each direction gets before a wall or a door leaf on its
// floor (the segments within `range`).
export function updateFlashWalls(from, level, range = 16) {
  wallUniforms.uFlashFrom.value.copy(from);
  segs.length = 0;
  const add = (x0, z0, x1, z1, y0, y1) => {
    if (from.y < y0 || from.y > y1) return;   // another floor
    const ex = x1 - x0, ez = z1 - z0, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((from.x - x0) * ex + (from.z - z0) * ez) / l2));
    if (Math.hypot(from.x - x0 - ex * t, from.z - z0 - ez * t) < range) segs.push(x0 - from.x, z0 - from.z, ex, ez);
  };
  for (const o of level.occluders || []) add(o[0], o[1], o[2], o[3], o[4], o[5]);
  // a leaf, 2 cm longer at both ends: it closes the strip between the leaf and the wall's end (the frame)
  for (const dr of level.doors) {
    const y0 = dr.y0 || 0, ex = dr.tip[0] - dr.hx, ez = dr.tip[1] - dr.hz, k = 0.02 / (Math.hypot(ex, ez) || 1);
    add(dr.hx - ex * k, dr.hz - ez * k, dr.tip[0] + ex * k, dr.tip[1] + ez * k, y0, y0 + LEAF_H);
  }
  // ray i at the centre of its texel: angle = (i + 0.5) / RAYS * 2π - π, direction (cos, sin) in (x, z)
  for (let i = 0; i < RAYS; i++) {
    const a = ((i + 0.5) / RAYS) * 2 * Math.PI - Math.PI, dx = Math.cos(a), dz = Math.sin(a);
    let best = FAR;
    for (let j = 0; j < segs.length; j += 4) {
      const wx = segs[j], wz = segs[j + 1], ex = segs[j + 2], ez = segs[j + 3];
      const den = dx * ez - dz * ex;
      if (den > -1e-9 && den < 1e-9) continue;
      const t = (wx * ez - wz * ex) / den, u = (wx * dz - wz * dx) / den;
      if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
    }
    dist[i] = best;
  }
  tex.needsUpdate = true;
  return segs.length / 4;
}
