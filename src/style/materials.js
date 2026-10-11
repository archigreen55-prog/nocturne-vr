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
import { PAL } from './palette.js';
import { quietRandom } from './quiet.js';

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
// Patches run by `order`, then in the order they were added (the style runs last: it reads what the
// flashlight's patches wrote).
export function addPatch(material, key, fn, order = 0) {
  const u = material.userData;
  if (!u.patches) {
    u.patches = [];
    material.onBeforeCompile = (shader, renderer) => { for (const p of u.patches) p.fn(shader, renderer); };
    material.customProgramCacheKey = () => u.patches.map((p) => p.key).join('|');
  }
  u.patches.push({ key, fn, order });
  u.patches.sort((a, b) => a.order - b.order);
  material.needsUpdate = true;
}

// ---------- the style (S1): three steps of light, ink lines, the colour grade ----------
// Shared uniforms: written by systems/style.js every frame (no shader rebuild for the brightness,
// the quality preset, the breaker or the lamps that follow you).
export const styleUniforms = {
  uStyleBands: { value: 1 },                                // 0 = the steps and the grade off (measuring their cost)
  uStyleExp: { value: 1 },                                  // display brightness (G.lightK): the steps stay where they are
  uStyleMid: { value: CFG.style.bands.mid },                // irradiance from which a surface is in half-light
  uStyleLevels: { value: new THREE.Vector3(...CFG.style.bands.levels) },   // shadow, half-light, light
  uStyleSpot: { value: CFG.style.bands.spot },              // the flashlight's light from which a surface is lit
  uStyleLampMid: { value: CFG.style.bands.lampMid },        // a lamp's / the flashlight's light from which a surface is in half-light
  uStyleHand: { value: CFG.style.bands.hand },              // a hand lamp's own light from which a surface is lit
  uStyleWarn: { value: 1 },                                 // the warnings' extra at this brightness (systems/brightness.js): the beam's spot stands out as much at every step
  uStyleZoneTex: { value: null },                           // the lamps' «you are seen» circles as a map seen from above (setZones)
  uStyleZoneRect: { value: new THREE.Vector4(0, 0, 1, 1) },  // the map's min x, min z, width, depth (m)
  uStyleZoneOn: { value: 0 },
  uStyleInk: { value: CFG.style.ink.px },                   // line width, px
  uStyleInkFar: { value: new THREE.Vector2(...CFG.style.ink.fade) },   // lines fade between these distances
  uStyleInkColor: { value: new THREE.Color(PAL.ink) },
  uStyleTint: { value: new THREE.Color() },                 // the grade's colour (dusk and paper, luminance 1)
};
{
  const a = new THREE.Color(PAL.dusk), b = new THREE.Color(PAL.paper), L = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  a.multiplyScalar(1 / L(a)); b.multiplyScalar(1 / L(b));
  styleUniforms.uStyleTint.value.copy(a.lerp(b, CFG.style.grade.paper));
}

// The circles' map: a 256 x 256 texture over the circles' bounding box, a soft distance in each texel
// (0.5 = the edge), red = circles on the ground floor (y 0), green = upstairs (y 3); blue / alpha: where
// a lamp's light reaches on that floor (not behind a wall or a closed door: `sees(circle, x, z)`, the
// stealth's own rule), for the circles' rims (style/decor.js). Rebuilt only when the circles change (the
// breaker) or `extra` does (the doors near a lamp).
const ZW = 256, RAMP = 0.4;
export const styleZones = [];   // the circles now: { x, z, r, y }
let zoneKey = null, zoneTex = null;
export function setZones(list, sees = null, extra = '') {
  const key = list.map((c) => `${c.x},${c.z},${c.r},${c.y}`).join(';') + '|' + extra;
  if (key === zoneKey) return;
  zoneKey = key;
  styleZones.length = 0; styleZones.push(...list);
  styleUniforms.uStyleZoneOn.value = list.length ? 1 : 0;
  if (!list.length) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const c of list) { x0 = Math.min(x0, c.x - c.r - 0.5); z0 = Math.min(z0, c.z - c.r - 0.5); x1 = Math.max(x1, c.x + c.r + 0.5); z1 = Math.max(z1, c.z + c.r + 0.5); }
  const data = new Uint8Array(ZW * ZW * 4), sx = (x1 - x0) / ZW, sz = (z1 - z0) / ZW;
  for (let j = 0; j < ZW; j++) {
    const z = z0 + (j + 0.5) * sz;
    for (let i = 0; i < ZW; i++) {
      const x = x0 + (i + 0.5) * sx;
      let r = 0, g = 0, b = 0, a = 0;
      for (const c of list) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > c.r + RAMP) continue;
        if (sees && !sees(c, x, z)) continue;
        const v = Math.max(0, Math.min(1, 0.5 - (d - c.r) / RAMP));
        if (c.y > 1.5) { g = Math.max(g, v); a = 1; } else { r = Math.max(r, v); b = 1; }
      }
      const k = (j * ZW + i) * 4;
      data[k] = Math.round(r * 255); data[k + 1] = Math.round(g * 255); data[k + 2] = b * 255; data[k + 3] = a * 255;
    }
  }
  if (!zoneTex) {
    zoneTex = quietRandom(() => new THREE.DataTexture(data, ZW, ZW, THREE.RGBAFormat));   // made while playing: the game's random numbers untouched
    zoneTex.magFilter = zoneTex.minFilter = THREE.LinearFilter;
    zoneTex.colorSpace = THREE.NoColorSpace;
    styleUniforms.uStyleZoneTex.value = zoneTex;
  } else zoneTex.image.data.set(data);
  zoneTex.needsUpdate = true;
  styleUniforms.uStyleZoneRect.value.set(x0, z0, x1 - x0, z1 - z0);
}

const STYLE_VERT_PARS = `
attribute float ink;
varying vec2 vStyleUv;
varying float vStyleInk;
varying vec3 vStylePos;
`;
const STYLE_VERT = `
	vStyleUv = uv;
	vStyleInk = ink;
	#ifdef USE_INSTANCING
		vStylePos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
	#else
		vStylePos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	#endif
`;
const STYLE_FRAG_PARS = `
uniform float uStyleBands;
uniform float uStyleExp;
uniform float uStyleMid;
uniform vec3 uStyleLevels;
uniform float uStyleSpot;
uniform float uStyleLampMid;
uniform float uStyleHand;
uniform float uStyleWarn;
uniform sampler2D uStyleZoneTex;
uniform vec4 uStyleZoneRect;
uniform float uStyleZoneOn;
uniform float uStyleInk;
uniform vec2 uStyleInkFar;
uniform vec3 uStyleInkColor;
uniform vec3 uStyleTint;
uniform float uStyleGrade;
uniform float uStyleLift;   // the figures: their shadow side keeps this much of the step their place is lit to (0: the world)
varying vec2 vStyleUv;
varying float vStyleInk;
varying vec3 vStylePos;
const vec3 STYLE_LUM = vec3( 0.2126, 0.7152, 0.0722 );
// inside a lamp's «you are seen» circle, on that lamp's floor (from the floor to a head's height, not the
// ceiling): one look into the circles' map (red: the ground floor, green: the upper one)
float styleZone( vec3 p ) {
	vec2 uv = ( p.xz - uStyleZoneRect.xy ) / uStyleZoneRect.zw;
	vec4 t = texture2D( uStyleZoneTex, clamp( uv, 0.0, 1.0 ) );
	float v = p.y < 2.5 ? t.r : t.g;
	float band = p.y < 2.5 ? step( - 0.3, p.y ) * step( p.y, 2.3 ) : step( 2.7, p.y ) * step( p.y, 5.3 );
	float inside = step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 );
	return uStyleZoneOn * band * inside * smoothstep( 0.44, 0.56, v );
}
// a soft step at t (±8 %, linear): the steps' edges without screen derivatives (cheap on a phone)
float styleStep( float t, float x ) { return clamp( ( x - t ) / ( t * 0.16 ) + 0.5, 0.0, 1.0 ); }
`;
// after the colour of the vertex: the grade (night blues, the reserved colours kept for the signals)
const STYLE_GRADE = `
	if ( uStyleBands > 0.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, dot( diffuseColor.rgb, STYLE_LUM ) * uStyleTint, uStyleGrade );
`;
// the light of the lamps (point) and the flashlight (spot), before the moon: snapshots of the sum
const STYLE_SNAP_SPOT = 'vec3 styleAfterPoint = reflectedLight.directDiffuse;\n';
const STYLE_SNAP_SUN = 'vec3 styleAfterSpot = reflectedLight.directDiffuse;\n';
// a guard's hand lamp (the point light enemies/flashMask.js knows as uLampIndex): its own irradiance
const HAND_DECL = 'vec3 styleHand = vec3( 0.0 );\nIncidentLight directLight;';
const HAND_FIND = 'if ( UNROLLED_LOOP_INDEX == uLampIndex ) directLight.color *= flashLampK;';
const HAND_ADD = HAND_FIND + '\n\t\tif ( UNROLLED_LOOP_INDEX == uLampIndex ) styleHand += saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color;';
// three steps: shadow / half-light / light. Light = a lamp's circle (where the guard sees you further)
// or the flashlight's spot; half-light = enough light of any kind, or a lamp's / the flashlight's
// reach; the rest = shadow. Each step has
// one brightness (the toon look); the light's colour is kept (amber lamp, blue moon, red alarm).
const STYLE_BANDS = `
	if ( uStyleBands > 0.5 ) {
		float aLum = max( dot( diffuseColor.rgb, STYLE_LUM ), 0.02 );
		vec3 lightAll = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float inv = PI / ( aLum * uStyleExp );
		float eAll = dot( lightAll, STYLE_LUM ) * inv;
		float eLamp = dot( styleAfterPoint, STYLE_LUM ) * inv;
		float eSpot = dot( styleAfterSpot - styleAfterPoint, STYLE_LUM ) * inv;
		float eHand = dot( styleHand, STYLE_LUM ) / uStyleExp;
		float midK = max( styleStep( uStyleMid, eAll ), styleStep( uStyleLampMid, eLamp + eSpot ) );   // enough light, or a lamp's reach
		float spotK = styleStep( uStyleSpot, eSpot );
		float litK = max( spotK, styleStep( uStyleHand, eHand ) );
		litK = max( litK, styleZone( vStylePos ) * step( 0.004, eLamp ) );   // a lamp's circle, where a lamp shines
		float lvl = mix( mix( uStyleLevels.x, uStyleLevels.y, midK ), uStyleLevels.z * mix( 1.0, uStyleWarn, spotK ), litK ) * uStyleExp;
		lvl = max( lvl, uStyleLift * mix( uStyleLevels.y, uStyleLevels.z, styleZone( vStylePos ) ) * uStyleExp );
		reflectedLight.directDiffuse = lightAll * ( lvl / max( eAll * uStyleExp, 1e-4 ) );
		reflectedLight.indirectDiffuse = vec3( 0.0 );
	}
`;
// ink: a line of constant width in pixels where the face's UV meets its edge; fades far away
const STYLE_INK = `
	if ( uStyleInk > 0.0 ) {   // a uniform branch: the derivative below stays valid
		vec2 d = min( vStyleUv, 1.0 - vStyleUv ) / max( fwidth( vStyleUv ), vec2( 1e-5 ) );
		float edge = vStyleInk * ( 1.0 - smoothstep( uStyleInk - 0.5, uStyleInk + 0.5, min( d.x, d.y ) ) ) * ( 1.0 - smoothstep( uStyleInkFar.x, uStyleInkFar.y, length( vViewPosition ) ) );
		outgoingLight = mix( outgoingLight, uStyleInkColor * uStyleExp, edge );
	}
`;
function stylePatch(shader, grade, lift) {
  Object.assign(shader.uniforms, styleUniforms);
  shader.uniforms.uStyleGrade = grade;
  shader.uniforms.uStyleLift = lift;
  const must = (src, find, what) => { if (!src.includes(find)) throw new Error(`style: ${what} not found in the shader`); };
  let v = shader.vertexShader, f = shader.fragmentShader;
  must(v, '#include <project_vertex>', 'project_vertex');
  v = STYLE_VERT_PARS + v.replace('#include <project_vertex>', '#include <project_vertex>' + STYLE_VERT);
  for (const [find, what] of [['#include <color_fragment>', 'color'], ['#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', 'spot lights'],
    ['#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )', 'sun lights'], ['#include <aomap_fragment>', 'aomap'], ['#include <envmap_fragment>', 'envmap']]) {
    if (find.startsWith('#if') && !f.includes(find)) f = f.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);   // not expanded by another patch
    must(f, find, what);
  }
  f = f.replace('IncidentLight directLight;', HAND_DECL);
  if (f.includes(HAND_FIND)) f = f.replace(HAND_FIND, HAND_ADD);   // only with the flashlight's mask (?flash=mask, the default)
  f = STYLE_FRAG_PARS + f
    .replace('#include <color_fragment>', '#include <color_fragment>' + STYLE_GRADE)
    .replace('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', STYLE_SNAP_SPOT + '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )')
    .replace('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )', STYLE_SNAP_SUN + '#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )')
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + STYLE_BANDS)
    .replace('#include <envmap_fragment>', STYLE_INK + '#include <envmap_fragment>');
  shader.vertexShader = v; shader.fragmentShader = f;
}

const late = [];
// fn(material) runs for every lit() made from now on (the flashlight's mask, once the scene has it)
export function onNewLit(fn) { late.push(fn); }

// A lit material: vertex colours by default (the Builder's parts carry their colour).
// grade: how far its colours go to the night palette (CFG.style.grade; loot keeps more of its own).
// lift: a figure's shadow side keeps that share of the light step where it stands (the sample's toon: its
// darkest step is about a quarter of the lit one); the world keeps 0 (its steps are the stealth's)
export function lit({ grade = CFG.style.grade.world, lift = 0, ...params } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  m.userData.styled = true;
  if (STYLE_ON) {
    const g = { value: grade }, l = { value: lift };
    m.userData.grade = g; m.userData.lift = l;
    addPatch(m, 'style', (shader) => stylePatch(shader, g, l), 10);
  }
  for (const fn of late) fn(m);
  return m;
}
