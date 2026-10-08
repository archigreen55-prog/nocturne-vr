// What the player holds and sees with: the VR controllers (the wrist panel lives on the left one),
// the hands, the board pointer, the comfort overlay, the keyboard, the snap-turn angle.
import * as THREE from 'three';
import { VERSION } from '../version.js';
import { loadSetting } from '../settings.js';
import { ComfortOverlay } from '../comfort/vignette.js';
import { KeyboardInput } from '../input/keyboard.js';
import { XRInput } from '../input/xrInput.js';
import { WristPanel } from '../ui/wrist.js';
import { Pointer } from '../ui/pointer.js';
import { Hands } from '../loot/hands.js';
import { G } from './state.js';
import { flash } from './messages.js';

export const rig = {
  id: 'rig',
  init() {
    const { renderer, camera, scene, player } = G;
    // controllers: small dark bodies; the wrist panel lives on the left one
    const wrist = G.wrist = new WristPanel(VERSION);
    wrist.attachToCamera(camera);
    const grips = G.grips = { left: null, right: null };
    {
      const geo = new THREE.BoxGeometry(0.035, 0.03, 0.11);
      geo.translate(0, -0.01, 0.02);
      const mat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
      for (let i = 0; i < 2; i++) {
        const grip = renderer.xr.getControllerGrip(i);
        grip.add(new THREE.Mesh(geo, mat));
        grip.addEventListener('connected', (e) => {
          grips[e.data.handedness] = grip;
          if (e.data.handedness === 'left') wrist.attachToGrip(grip);
        });
        grip.addEventListener('disconnected', () => {
          for (const h of ['left', 'right']) if (grips[h] === grip) grips[h] = null;
        });
        player.rig.add(grip);
      }
    }
    const xrIn = G.xrIn = new XRInput();
    G.hands = new Hands({ loot: G.loot, rig: player.rig, grips, pulse: (h, s, ms) => xrIn.pulse(h, s, ms), onMessage: (t, c) => flash(t, 2, c) });
    const pointer = G.pointer = new Pointer(renderer, player.rig, G.board);
    pointer.addTo(scene);

    const comfort = G.comfort = new ComfortOverlay();
    scene.add(comfort.mesh);
    G.keys = new KeyboardInput();
    G.snapDeg = loadSetting('snap', 45) === 30 ? 30 : 45;
  },
};
