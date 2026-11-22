// عارض ثلاثي الأبعاد بسيط مبني على three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(60, -90, 90);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x665544, 2.0));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.6); d1.position.set(50, -80, 120); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffeedd, 0.7); d2.position.set(-80, 60, 40); this.scene.add(d2);
    this.grid = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.transparent = true; this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);
    this.spin = new THREE.Group();
    this.scene.add(this.spin);
    this.group = new THREE.Group();
    this.spin.add(this.group);
    this.color = 0xf2a541;
    this.autoRotate = false;
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    // نرسم فقط عند الحاجة وعندما يكون العارض ظاهراً — يوفر البطارية على الجوال
    this.dirty = true;
    this.controls.addEventListener('change', () => (this.dirty = true));
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.el.offsetParent || document.hidden) return;
      if (this.autoRotate) { this.spin.rotation.z += 0.006; this.dirty = true; }
      this.controls.update();
      if (!this.dirty) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  clear() {
    this.dirty = true;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.geometry?.dispose(); c.material?.dispose();
    }
  }
  /** parts: [{tris: Float32Array, color}] */
  show(parts, { keepView = false } = {}) {
    this.clear();
    const box = new THREE.Box3();
    for (const p of parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.tris, 3));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        color: p.color ?? this.color, roughness: 0.55, metalness: 0.05, flatShading: false,
      });
      const mesh = new THREE.Mesh(g, m);
      this.group.add(mesh);
      g.computeBoundingBox(); box.union(g.boundingBox);
    }
    // تمركز المجسم على أرضية الطباعة
    const c = box.getCenter(new THREE.Vector3());
    this.group.position.set(-c.x, -c.y, -box.min.z);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 10);
    this.grid.scale.setScalar(Math.max(1, r / 100));
    if (!keepView) {
      this.camera.position.set(r * 0.4, -r * 1.3, r * 1.3);
      this.controls.target.set(0, 0, size.z / 2);
    }
    this.dirty = true;
    return size;
  }
  showObject(obj) {
    this.clear();
    this.group.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    this.group.position.set(-c.x, -c.y, -box.min.z);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 10);
    this.camera.position.set(r * 0.4, -r * 1.3, r * 1.3);
    this.controls.target.set(0, 0, size.z / 2);
    return size;
  }
  setColor(hex) {
    this.color = hex;
    const first = this.group.children[0];
    if (first?.material && this.group.children.length === 1) first.material.color.set(hex);
    this.dirty = true;
  }
  topView() { this.dirty = true; const r = this.camera.position.length(); this.camera.position.set(0, -0.001, r); this.controls.target.set(0, 0, 0); }
  /** لقطة بحجم ثابت (تعمل حتى لو العارض مخفي) */
  snapshot(w = 900, h = 700, front = true) {
    const r = this.renderer, old = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio(), asp = this.camera.aspect;
    const gv = this.grid.visible; this.grid.visible = false;
    const rz = this.spin.rotation.z; if (front) this.spin.rotation.z = 0;
    r.setPixelRatio(1); r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    this.grid.visible = gv; this.spin.rotation.z = rz;
    r.setPixelRatio(pr); r.setSize(old.x, old.y, false); this.camera.aspect = asp; this.camera.updateProjectionMatrix();
    this.dirty = true;
    return url;
  }
}
