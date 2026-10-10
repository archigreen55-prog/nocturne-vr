// Flashlight through walls: the room mask + the wall test (enemies/flashWalls.js) by default.
// ?flash=nomask / shadow / off and ?flashwalls=off are for measuring the cost of the alternatives
// (shadow = one 256² shadow map for the flashlight only). Runs after every other system has added
// its objects (the mask is applied to the lit materials in the scene).
import * as THREE from 'three';
import { maskScene, maskBeam, maskLit } from '../enemies/flashMask.js';
import { wallsOnScene, wallsOnMaterial } from '../enemies/flashWalls.js';
import { onNewLit } from '../style/materials.js';
import { G, params } from './state.js';

export const flashlight = {
  id: 'flashlight',
  init() {
    const { renderer, scene, patrol } = G;
    const flashMode = params.get('flash') || 'mask';
    if (flashMode === 'mask') {
      const masked = maskScene(scene, G.level);
      maskBeam(patrol.beam.material);
      const walls = params.get('flashwalls') !== 'off';
      if (walls) wallsOnScene(scene, patrol.beam.material);   // ...and it stops at walls (?flashwalls=off: to measure the cost)
      onNewLit((m) => { maskLit(m); if (walls) wallsOnMaterial(m); });   // W17: a lit material made later (a friend who joins) gets the same
      console.log(`flashlight room mask on ${masked} lit materials`);
    } else if (flashMode === 'shadow') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      patrol.spot.castShadow = true;
      patrol.spot.shadow.mapSize.set(256, 256);
      patrol.spot.shadow.camera.near = 0.2;
      patrol.spot.shadow.camera.far = 14;
      scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial) { o.castShadow = true; o.receiveShadow = true; } });
    } else if (flashMode === 'off') patrol.spot.visible = false;
  },
};
