// Flashlight through walls: room mask by default. ?flash=nomask / shadow / off are for measuring the
// cost of the alternatives (shadow = one 256² shadow map for the flashlight only). Runs after every
// other system has added its objects (the mask is applied to the lit materials in the scene).
import * as THREE from 'three';
import { maskScene, maskBeam } from '../enemies/flashMask.js';
import { G, params } from './state.js';

export const flashlight = {
  id: 'flashlight',
  init() {
    const { renderer, scene, patrol } = G;
    const flashMode = params.get('flash') || 'mask';
    if (flashMode === 'mask') {
      const masked = maskScene(scene, G.level);
      maskBeam(patrol.beam.material);
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
