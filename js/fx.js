// Particles (instanced Blender meshes), progress rings and cook bars, floating score popups.
import * as THREE from 'three';
import { models } from './assets.js';
import { patchMaterial } from './gfx.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function geoOf(name) { let g = null; models[name].traverse((o) => { if (o.isMesh && !g) g = o.geometry; }); return g; }

class Pool {
  constructor(scene, geometry, material, cap, shadow = false) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geometry, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.list = [];
  }
  spawn(o) {
    if (this.list.length >= this.cap) this.list.shift();
    const p = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, age: 0, s0: 0.2, s1: 0, grav: 0, drag: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      spin: 0, r: 1, g: 1, b: 1, r1: null, g1: 0, b1: 0, inT: 0.12, sx: 1, sy: 1, sz: 1, upright: false, ...o,
    };
    this.list.push(p);
    return p;
  }
  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.flutter) { const w = p.age * 5 + p.rx; p.vx += Math.sin(w) * p.flutter * dt; p.vz += Math.cos(w * 0.8) * p.flutter * dt; } // paper flutter
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      const t = p.age / p.life;
      let s = p.s0 + (p.s1 - p.s0) * t;
      if (p.sink != null && p.y < 0.1) { p.sink -= dt; if (p.sink <= 0) continue; s *= p.sink / 0.3; } // landed: shrink out in 0.3 s
      if (p.inT > 0) s *= Math.min(1, p.age / p.inT);
      if (p.out) s *= Math.min(1, (1 - t) / p.out);
      if (!p.upright) { p.rx += p.spin * dt; p.rz += p.spin * 0.7 * dt; } else p.ry += p.spin * dt;
      _e.set(p.upright ? 0 : p.rx, p.ry, p.upright ? 0 : p.rz);
      _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s * p.sx, s * p.sy, s * p.sz));
      this.mesh.setMatrixAt(n, _m);
      if (p.r1 != null) _c.setRGB(p.r + (p.r1 - p.r) * t, p.g + (p.g1 - p.g) * t, p.b + (p.b1 - p.b) * t);
      else _c.setRGB(p.r, p.g, p.b);
      this.mesh.setColorAt(n, _c);
      if (n !== i) L[n] = p;
      n++;
    }
    L.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.dispose(); }
}

const WIDGET_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
  uniform float uP; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.x, p.y);
    float t = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
    float bg = smoothstep(0.50, 0.55, r) * (1.0 - smoothstep(0.95, 1.0, r));
    float band = smoothstep(0.58, 0.62, r) * (1.0 - smoothstep(0.88, 0.92, r));
    float on = band * step(t, uP);
    vec3 col = mix(vec3(0.07, 0.08, 0.11), uColor, on);
    col = mix(col, vec3(0.32, 0.34, 0.4), band * (1.0 - step(t, uP)) * 0.6);
    gl_FragColor = vec4(col, bg * uAlpha);
  }`;
const BAR_FRAG = /* glsl */`
  uniform float uP; uniform vec3 uColor; uniform float uAlpha; uniform float uFlash; varying vec2 vUv;
  float box(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
  void main(){
    vec2 p = (vUv - 0.5) * vec2(4.0, 1.0);
    float outer = 1.0 - smoothstep(-0.02, 0.02, box(p, vec2(1.92, 0.42), 0.26));
    float inner = 1.0 - smoothstep(-0.02, 0.02, box(p, vec2(1.78, 0.28), 0.16));
    float fill = inner * step((p.x + 1.78) / 3.56, uP);
    vec3 col = mix(vec3(0.07, 0.08, 0.11), vec3(0.26, 0.28, 0.33), inner);
    col = mix(col, uColor, fill);
    col = mix(col, vec3(1.0, 0.95, 0.9), uFlash * fill * 0.7);
    gl_FragColor = vec4(col, outer * uAlpha);
  }`;

export class Fx {
  constructor(gfx, popupLayer) {
    this.gfx = gfx;
    this.scene = gfx.scene;
    this.layer = popupLayer;
    const puffMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
    const bubMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.82 }));
    this.puff = new Pool(this.scene, geoOf('fx_puff'), puffMat, 420, true);
    this.flame = new Pool(this.scene, geoOf('fx_flame'), new THREE.MeshBasicMaterial({ color: 0xffffff }), 320);
    this.star = new Pool(this.scene, geoOf('fx_star'), new THREE.MeshBasicMaterial({ color: 0xffffff }), 220);
    this.bubble = new Pool(this.scene, geoOf('fx_bubble'), bubMat, 200);
    this.drop = new Pool(this.scene, geoOf('fx_drop'), new THREE.MeshBasicMaterial({ color: 0xffffff }), 220);
    this.pools = [this.puff, this.flame, this.star, this.bubble, this.drop];
    this.widgets = new Map();
    this.free = { ring: [], bar: [] };
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.popups = [];
    this.shake = 0;
  }

  // ---- widgets ------------------------------------------------------------
  widget(kind, key) {
    let w = this.widgets.get(key);
    if (!w) {
      w = this.free[kind].pop();
      if (!w) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { uP: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 1 }, uFlash: { value: 0 } },
          vertexShader: WIDGET_VERT, fragmentShader: kind === 'ring' ? RING_FRAG : BAR_FRAG, transparent: true, depthTest: false, depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.plane, mat);
        mesh.renderOrder = 50;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        w = { kind, mesh, mat };
      }
      w.mesh.visible = true; w.age = 0;
      this.widgets.set(key, w);
    }
    w.used = true;
    return w;
  }
  ring(key, x, y, z, p, color, size = 0.62) {
    const w = this.widget('ring', key);
    w.mesh.position.set(x, y, z); w.size = size; w.sx = 1;
    w.mat.uniforms.uP.value = p; w.mat.uniforms.uColor.value.set(color);
  }
  bar(key, x, y, z, p, color, flash = 0, size = 0.9) {
    const w = this.widget('bar', key);
    w.mesh.position.set(x, y, z); w.size = size * 0.25; w.sx = 4;
    w.mat.uniforms.uP.value = p; w.mat.uniforms.uColor.value.set(color); w.mat.uniforms.uFlash.value = flash;
  }

  // ---- popups -------------------------------------------------------------
  popup(text, x, y, z, cls = '', delay = 0) {
    if (this.quiet) return; // no score popups behind the title screen
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    el.style.opacity = '0';
    this.layer.appendChild(el);
    this.popups.push({ el, x, y, z, age: -delay, life: 1.25 });
  }

  // ---- particle recipes ---------------------------------------------------
  dust(x, z, n = 4, y = 0.08, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (0.5 + Math.random() * 0.9) * spread;
      this.puff.spawn({ x: x + Math.cos(a) * 0.1, y, z: z + Math.sin(a) * 0.1, vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 0.5, vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.2, s0: 0.2 + Math.random() * 0.12, s1: 0.02, drag: 3, r: 0.95, g: 0.9, b: 0.82, spin: 3 });
    }
  }
  steam(x, y, z, n = 1, tint = 1) {
    for (let i = 0; i < n; i++) this.puff.spawn({ x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.25, vy: 0.9 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.25, life: 0.8 + Math.random() * 0.4, s0: 0.1, s1: 0.3, out: 0.5, drag: 0.8, r: tint, g: tint, b: tint, spin: 1.5 });
  }
  smoke(x, y, z) {
    const g = 0.2 + Math.random() * 0.14;
    this.puff.spawn({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.3 + 0.25, vy: 1.3 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3, life: 1.3 + Math.random() * 0.5, s0: 0.16, s1: 0.55, out: 0.45, drag: 0.5, r: g, g: g, b: g * 1.05, spin: 1.2 });
  }
  fire(x, y, z, power = 1) {
    // layered tongues: red-orange outside, yellow core
    const a = Math.random() * 6.28, d = Math.random() * 0.3;
    const core = Math.random() < 0.4;
    this.flame.spawn({
      x: x + Math.cos(a) * d, y: y + Math.random() * 0.1, z: z + Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.3, vy: (1.1 + Math.random() * 0.9) * power, vz: (Math.random() - 0.5) * 0.3,
      life: 0.42 + Math.random() * 0.3, s0: (core ? 0.24 : 0.42) * power * (0.7 + Math.random() * 0.5), s1: 0.04, upright: true, spin: (Math.random() - 0.5) * 5, sy: 1.7, inT: 0.07,
      r: core ? 2.3 : 1.75, g: core ? 1.45 : 0.42, b: core ? 0.28 : 0.04, r1: core ? 1.9 : 1.2, g1: core ? 0.5 : 0.1, b1: 0.02,
    });
  }
  embers(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) this.star.spawn({ x, y, z, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 2.4, life: 0.7 + Math.random() * 0.5, s0: 0.09, s1: 0.0, grav: 4, r: 2.4, g: 0.9, b: 0.12, spin: 8 });
  }
  burst(x, y, z, n = 18, color = [3.0, 2.1, 0.45], speed = 3.2, size = 0.24) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, up = 1.5 + Math.random() * 3;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.star.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, life: 0.55 + Math.random() * 0.45, s0: size * (0.6 + Math.random() * 0.7), s1: 0, grav: 7, drag: 0.6, r: color[0], g: color[1], b: color[2], spin: 9 });
    }
  }
  ringPop(x, y, z, color = [2.4, 2.4, 2.6], n = 10, r = 1.6) {
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28;
      this.star.spawn({ x, y, z, vx: Math.cos(a) * r, vy: 0.4, vz: Math.sin(a) * r, life: 0.32, s0: 0.14, s1: 0.02, drag: 4, r: color[0], g: color[1], b: color[2], spin: 6 });
    }
  }
  chips(x, y, z, rgb) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.28;
      this.puff.spawn({ x, y, z, vx: Math.cos(a) * 1.5, vy: 1.6 + Math.random() * 1.4, vz: Math.sin(a) * 1.5, life: 0.5, s0: 0.09, s1: 0.03, grav: 9, floor: 0.82, r: rgb[0], g: rgb[1], b: rgb[2], spin: 10 });
    }
  }
  suds(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.5 + Math.random() * 1.4;
      this.bubble.spawn({ x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.25, vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 2.2, vz: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.5, s0: 0.07 + Math.random() * 0.12, s1: 0.03, grav: 3.2, drag: 1.2, r: 1.25, g: 1.3, b: 1.4, spin: 0 });
    }
  }
  bubbles(x, y, z, r = 0.2, rgb = [1.2, 0.5, 0.4]) {
    const a = Math.random() * 6.28, d = Math.random() * r;
    this.bubble.spawn({ x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, vx: 0, vy: 0.25, vz: 0, life: 0.35 + Math.random() * 0.25, s0: 0.03, s1: 0.11 + Math.random() * 0.05, out: 0.15, r: rgb[0], g: rgb[1], b: rgb[2], spin: 0 });
  }
  splash(x, y, z, n = 14, rgb = [1.3, 1.7, 2.0]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.8;
      this.drop.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, life: 0.7, s0: 0.12 + Math.random() * 0.08, s1: 0.04, grav: 11, r: rgb[0], g: rgb[1], b: rgb[2], upright: true, spin: 0 });
    }
  }
  foam(x, y, z, dx, dz) {
    for (let i = 0; i < 3; i++) {
      const sp = 5.5 + Math.random() * 2.5, side = (Math.random() - 0.5) * 1.6;
      this.puff.spawn({ x, y, z, vx: dx * sp - dz * side, vy: 0.3 + Math.random() * 0.8, vz: dz * sp + dx * side, life: 0.38 + Math.random() * 0.15, s0: 0.1, s1: 0.34, out: 0.4, drag: 2.2, grav: 1.5, r: 1.15, g: 1.2, b: 1.25, spin: 4 });
    }
  }
  trail(x, y, z, rgb) {
    this.puff.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.34, s0: 0.17, s1: 0.0, inT: 0, r: rgb[0], g: rgb[1], b: rgb[2], spin: 2 });
  }
  swirl(x, y, z, rgb, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28, r = 0.35;
      this.star.spawn({ x: x + Math.cos(a) * r, y: y + Math.random() * 0.3, z: z + Math.sin(a) * r, vx: -Math.sin(a) * 2.2, vy: 1.5 + Math.random() * 2, vz: Math.cos(a) * 2.2, life: 0.5 + Math.random() * 0.3, s0: 0.14, s1: 0, drag: 1.5, r: rgb[0], g: rgb[1], b: rgb[2], spin: 8 });
    }
  }

  // ---- end of shift confetti (pools exist only during a record ending) ----
  startConfetti() {
    if (this.confetti) return;
    const flat = (w, h) => new THREE.PlaneGeometry(w, h); // shortcut: plain quads until fx_confetti / fx_ticket models exist
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.confetti = new Pool(this.scene, models.fx_confetti ? geoOf('fx_confetti') : flat(0.6, 0.36), mat(), 700);
    this.tickets = new Pool(this.scene, models.fx_ticket ? geoOf('fx_ticket') : flat(0.5, 0.8), mat(), 160);
    this.pools.push(this.confetti, this.tickets);
  }
  stopConfetti() {
    if (!this.confetti) return;
    for (const p of [this.confetti, this.tickets]) { p.dispose(this.scene); this.pools.splice(this.pools.indexOf(p), 1); }
    this.confetti = this.tickets = null;
  }
  /** n confetti and nt tickets appear at random points of a box and flutter down */
  rain(n, nt, x0, x1, z0, z1, y0, y1) {
    const R = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < n + nt; i++) {
      const tk = i >= n, u = Math.random();
      const col = tk ? [2.4, 2.1, 1.5] : u < 0.08 ? [3.0, 3.0, 2.6] : u < 0.28 ? [3.0, 1.2, 0.25] : [R(2.4, 3.0), R(2.0, 2.4), R(0.3, 0.8)];
      (tk ? this.tickets : this.confetti).spawn({
        x: R(x0, x1), y: R(y0, y1), z: R(z0, z1), vx: R(-0.4, 0.4), vy: -R(0.5, 1.5), vz: R(-0.4, 0.4), life: 30, s0: tk ? 0.42 : R(0.22, 0.34), s1: tk ? 0.42 : 0.28,
        grav: R(2.0, 3.0), drag: 1, flutter: R(1.5, 3), spin: R(3, 5), sink: 0.3, inT: 0, r: col[0], g: col[1], b: col[2],
      });
    }
  }

  // ---- frame --------------------------------------------------------------
  update(dt, camera, w, h) {
    for (const p of this.pools) p.update(dt);
    for (const [key, wd] of this.widgets) {
      if (!wd.used) { wd.mesh.visible = false; this.free[wd.kind].push(wd); this.widgets.delete(key); continue; }
      wd.used = false;
      wd.age += dt;
      const pop = Math.min(1, wd.age * 9);
      wd.mesh.quaternion.copy(camera.quaternion);
      wd.mesh.scale.set(wd.size * wd.sx * pop, wd.size * pop, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age >= p.life) { p.el.remove(); this.popups.splice(i, 1); continue; }
      const t = p.age / p.life;
      _p.set(p.x, p.y + 0.5 + t * 1.1, p.z).project(camera);
      const sx = (_p.x * 0.5 + 0.5) * w, sy = (1 - (_p.y * 0.5 + 0.5)) * h;
      const sc = t < 0.12 ? 0.5 + (t / 0.12) * 0.7 : 1.2 - Math.min(0.2, (t - 0.12) * 1.5);
      p.el.style.transform = `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      p.el.style.opacity = t > 0.72 ? ((1 - t) / 0.28).toFixed(2) : '1';
    }
  }

  clear() {
    this.stopConfetti();
    for (const p of this.pools) { p.list.length = 0; p.mesh.count = 0; }
    for (const [, wd] of this.widgets) { wd.mesh.visible = false; this.free[wd.kind].push(wd); }
    this.widgets.clear();
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
  }
}
