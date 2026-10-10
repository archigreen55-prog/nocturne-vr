// W17 «Стиль» (plan-W17-style.md §1.4, §1.7, §1.8): what the style adds to a map besides its materials.
//   pools     a lamp's «you are seen» circle drawn on the floor (CFG.stealth.lamps: the same radius the
//             guard uses), a thin amber rim with a soft inner glow; one mesh, gone with the breaker
//   blobs     soft shadows under the furniture (one mesh per floor) and under what moves: the guards,
//             friends, loot on the floor or in flight (one instanced mesh)
//   water     the mansion's fountain: rings running out from the middle, an amber glint; puddles in
//             the dacha's yard (CFG.style.water)
// Every mesh is named 'style: …' (tests/geometry.test.mjs skips them: they lie on the floor on purpose).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './palette.js';
import { styleUniforms } from './materials.js';

const MAX_BLOBS = 64;

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a soft dark spot (alpha only; the colour is the material's)
const blobTexture = () => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,0.62)'); r.addColorStop(0.55, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
// the lamp's circle: a crisp rim at the edge and a faint glow just inside it
const poolTexture = () => canvasTex(256, (g, s) => {
  const c = s / 2, r = g.createRadialGradient(c, c, 0, c, c, c);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.8, 'rgba(255,255,255,0.05)');
  r.addColorStop(0.955, 'rgba(255,255,255,0.22)'); r.addColorStop(0.965, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.985, 'rgba(255,255,255,0.85)'); r.addColorStop(0.995, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

// a flat quad on the floor: centre (x, y, z), size (w, d)
function floorQuad(x, y, z, w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2); g.translate(x, y, z);
  return g;
}

// water: two dusk tones, rings running out from the middle, a glint towards the nearest lamp
const WATER_VERT = `
varying vec3 vPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = `
uniform float uTime;
uniform float uExp;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uGlint;
uniform vec3 uCentre;   // x, z, radius
uniform float uRings;
varying vec3 vPos;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 d = vPos.xz - uCentre.xy;
  float r = length( d ) / uCentre.z;
  float ring = fract( r * 3.0 - uTime * 0.35 );
  float band = uRings * ( 1.0 - smoothstep( 0.0, 0.12, abs( ring - 0.5 ) ) ) * ( 1.0 - r );
  vec3 col = mix( uDeep, uLight, 0.25 + 0.75 * band );
  float glint = 1.0 - smoothstep( 0.0, 0.18, abs( d.x / uCentre.z + 0.35 + 0.05 * sin( uTime ) ) + abs( d.y / uCentre.z - 0.2 ) * 0.4 );
  col = mix( col, uGlint, 0.55 * glint );
  col = mix( col, uLight * 1.4, smoothstep( 0.93, 1.0, r ) * 0.6 );   // the rim against the stone
  gl_FragColor = vec4( col * uExp, 1.0 );
  #include <fog_fragment>
}`;
function waterMaterial(x, z, r, rings) {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uExp: { value: 1 }, uRings: { value: rings },
      uDeep: { value: new THREE.Color(PAL.dusk).multiplyScalar(1.6) }, uLight: { value: new THREE.Color(0x4a6aa8) },
      uGlint: { value: new THREE.Color(PAL.lamp).multiplyScalar(0.55) }, uCentre: { value: new THREE.Vector3(x, z, r) },
    }]),
  });
}

// level: the map; lamps: CFG.stealth.lamps; cfg: CFG.style; floorAt(x, z, yHint): the floor's height
export function buildDecor(scene, level, lamps, cfg, floorAt) {
  const out = { meshes: [] };
  const add = (mesh, parent = scene) => { parent.add(mesh); out.meshes.push(mesh); return mesh; };

  // ---------- the lamps' circles ----------
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color(PAL.lamp).multiplyScalar(cfg.pools.k), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  // the rim stops at a wall or a closed door, as the lamp's light does (the circles' map: blue / alpha)
  poolMat.onBeforeCompile = (sh) => {
    sh.uniforms.uStyleZoneTex = styleUniforms.uStyleZoneTex; sh.uniforms.uStyleZoneRect = styleUniforms.uStyleZoneRect;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPoolPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvPoolPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPoolPos;\nuniform sampler2D uStyleZoneTex;\nuniform vec4 uStyleZoneRect;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 t = texture2D( uStyleZoneTex, clamp( ( vPoolPos.xz - uStyleZoneRect.xy ) / uStyleZoneRect.zw, 0.0, 1.0 ) ); diffuseColor.a *= smoothstep( 0.3, 0.7, vPoolPos.y < 2.5 ? t.b : t.a ); }');
  };
  // a ring, not a disc: only the rim and its glow are drawn (a disc of 6 m was 28 m² of blending per lamp)
  const pools = lamps.map((l) => {
    const g = new THREE.RingGeometry(l.r * 0.8, l.r, 48, 1);
    const uv = g.attributes.uv, pos = g.attributes.position;   // the texture's radius: the ring's own
    for (let i = 0; i < uv.count; i++) { const x = pos.getX(i), y = pos.getY(i); uv.setXY(i, 0.5 + x / (2 * l.r), 0.5 + y / (2 * l.r)); }
    g.rotateX(-Math.PI / 2); g.translate(l.x, l.y + 0.012, l.z);
    return g;
  });
  if (pools.length) {
    out.pools = add(new THREE.Mesh(mergeGeometries(pools), poolMat));
    out.pools.name = 'style: lamp circles';
    out.pools.renderOrder = 2;
  }

  // ---------- the furniture's shadows (one mesh per floor, inside that floor's mesh when the map hides floors) ----------
  const blobTex = blobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: PAL.ink, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: true });
  const byFloor = new Map();
  for (const b of level.furniture) {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    if (w > 6 || d > 6 || w * d < 0.04) continue;   // the van's footprint and the like keep theirs below
    const f = b.floor || 0, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const y = floorAt(cx, cz, f ? 3 : 0) + 0.006;
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f).push(floorQuad(cx, y, cz, w + 0.35, d + 0.35));
  }
  for (const [f, parts] of byFloor) {
    const parent = level.floorMeshes && level.floorMeshes[f] ? level.floorMeshes[f] : scene;   // hidden with its floor
    const m = add(new THREE.Mesh(mergeGeometries(parts), blobMat), parent);
    m.name = `style: furniture shadows ${f}`;
    m.renderOrder = 1;
  }

  // ---------- the shadows of what moves ----------
  const dyn = new THREE.InstancedMesh(floorQuad(0, 0, 0, 1, 1), blobMat, MAX_BLOBS);
  dyn.name = 'style: moving shadows';
  dyn.frustumCulled = false; dyn.count = 0; dyn.renderOrder = 1;
  add(dyn);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  // spots: [{ x, z, y (the floor), h (height above it), r }]
  out.setBlobs = (spots) => {
    let n = 0;
    for (const b of spots) {
      if (n >= MAX_BLOBS) break;
      const k = Math.max(0.35, 1 - b.h / 2.5);   // higher = smaller and fainter
      m4.compose(p.set(b.x, b.y + 0.008, b.z), q, s.set(b.r * 2 * k, 1, b.r * 2 * k));
      dyn.setMatrixAt(n++, m4);
    }
    dyn.count = n;
    dyn.instanceMatrix.needsUpdate = true;
  };

  // ---------- water ----------
  out.water = [];
  for (const w of cfg.water[level.id || 'dacha'] || []) {
    const mat = waterMaterial(w.x, w.z, w.r, w.rings ? 1 : 0);
    if (!w.rings) {   // a puddle: darker, a thin glint
      mat.uniforms.uDeep.value.setHex(PAL.night); mat.uniforms.uLight.value.setHex(PAL.dusk);
      mat.uniforms.uGlint.value.multiplyScalar(0.5);
    }
    const g = new THREE.CircleGeometry(w.r, 40); g.rotateX(-Math.PI / 2); g.translate(w.x, w.y, w.z);
    const mesh = add(new THREE.Mesh(g, mat));
    mesh.name = 'style: water';
    mesh.userData.puddle = !w.rings;
    out.water.push(mesh);
  }
  return out;
}
