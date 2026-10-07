// Pointing at the van board: a thin ray from each controller (only drawn while it hits the board),
// or the screen centre on a laptop. Returns the button under each pointer.
import * as THREE from 'three';

const MAX_DIST = 4;

export class Pointer {
  constructor(renderer, rig, board) {
    this.board = board;
    this.ray = new THREE.Raycaster();
    this.ray.far = MAX_DIST;
    this.hover = { left: null, right: null, desk: null };
    this.ctrl = { left: null, right: null };
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7, fog: false });
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd166, fog: false, depthTest: false });
    this.lines = {};
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      rig.add(c);
      const line = new THREE.Line(lineGeo, lineMat);
      line.visible = false;
      line.frustumCulled = false;
      c.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dotMat);
      dot.visible = false;
      dot.renderOrder = 30;
      c.addEventListener('connected', (e) => { this.ctrl[e.data.handedness] = c; this.lines[e.data.handedness] = { line, dot }; });
      c.addEventListener('disconnected', () => { for (const h of ['left', 'right']) if (this.ctrl[h] === c) { this.ctrl[h] = null; line.visible = false; dot.visible = false; } });
      this.dots = this.dots || [];
      this.dots.push(dot);
    }
    this.dotParent = null;
    this.o = new THREE.Vector3(); this.d = new THREE.Vector3(); this.q = new THREE.Quaternion();
  }

  // Attach the hit dots to the scene once.
  addTo(scene) { for (const d of this.dots) scene.add(d); }

  // Board button under a screen point (phone tap), ndc -1..1; null if none.
  hitAt(ndcX, ndcY, camera) {
    const mesh = this.board.mesh;
    mesh.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    this.ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = this.ray.intersectObject(mesh, false)[0];
    return hit ? this.board.hit(hit.uv) : null;
  }

  update(inVR, camera) {
    const mesh = this.board.mesh;
    mesh.updateWorldMatrix(true, false);
    for (const h of ['left', 'right']) {
      const c = this.ctrl[h], L = this.lines[h];
      this.hover[h] = null;
      if (!c || !L || !inVR) { if (L) { L.line.visible = false; L.dot.visible = false; } continue; }
      c.updateWorldMatrix(true, false);
      this.o.setFromMatrixPosition(c.matrixWorld);
      this.d.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(this.q));
      this.ray.set(this.o, this.d);
      const hit = this.ray.intersectObject(mesh, false)[0];
      L.line.visible = !!hit; L.dot.visible = !!hit;
      if (hit) {
        L.line.scale.z = hit.distance;
        L.dot.position.copy(hit.point);
        this.hover[h] = this.board.hit(hit.uv);
      }
    }
    this.hover.desk = null;
    if (!inVR) {
      camera.updateWorldMatrix(true, false);
      this.ray.setFromCamera({ x: 0, y: 0 }, camera);
      const hit = this.ray.intersectObject(mesh, false)[0];
      if (hit) this.hover.desk = this.board.hit(hit.uv);
    }
    const any = this.hover.right || this.hover.left || this.hover.desk;
    if (any !== this.board.hover) { this.board.hover = any; return true; }   // redraw needed
    return false;
  }
}
