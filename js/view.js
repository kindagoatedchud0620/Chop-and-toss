// Turns a World into a three.js scene and keeps it in sync every frame.
import * as THREE from 'three';
import { spawn, part, meshesOf } from './assets.js';
import { patchMaterial, lightUniforms, MAX_FIRES } from './gfx.js';
import { PLAYER_COLORS, dishOfContents, TUNE } from './data.js';

const TOP = 0.8;
const CHEF_S = 1.04;
const ING_S = 1.32, PLATE_S = 1.2, EXT_S = 1.25;
const HALF = Math.PI / 2;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const FOOD_RGB = {
  tomato: [0.9, 0.2, 0.15], meat: [0.9, 0.4, 0.45], lettuce: [0.45, 0.8, 0.3], fish: [0.5, 0.75, 0.95], potato: [0.9, 0.75, 0.45], bun: [0.95, 0.7, 0.35],
  charcoal: [0.15, 0.15, 0.15], soup: [0.9, 0.25, 0.15],
};

function mat4(x, y, z, ry = 0, s = 1, rx = 0) {
  _e.set(rx, ry, 0, 'YXZ');
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(s, s, s));
}

/** collects static meshes and turns them into a few InstancedMeshes */
class StaticBatch {
  constructor(parent) { this.parent = parent; this.map = new Map(); this.meshes = []; }
  add(name, matrix, { tint = null, only = null, skip = null } = {}) {
    for (const m of meshesOf(name)) {
      if (only && !only.includes(m.node)) continue;
      if (skip && skip.includes(m.node)) continue;
      const key = m.geometry.uuid + '|' + m.material.uuid;
      let e = this.map.get(key);
      if (!e) { e = { geometry: m.geometry, material: m.material, mats: [], tints: [], tinted: false }; this.map.set(key, e); }
      e.mats.push(new THREE.Matrix4().multiplyMatrices(matrix, m.matrix));
      const tn = tint && typeof tint === 'object' && !tint.isColor ? tint[m.node] : tint;
      e.tints.push(tn != null ? tn : null);
      if (tn != null) e.tinted = true;
    }
  }
  build() {
    for (const e of this.map.values()) {
      const im = new THREE.InstancedMesh(e.geometry, e.material, e.mats.length);
      e.mats.forEach((m, i) => im.setMatrixAt(i, m));
      if (e.tinted) e.tints.forEach((t, i) => im.setColorAt(i, _c.set(t != null ? t : 0xffffff)));
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.parent.add(im);
      this.meshes.push(im);
    }
    this.map.clear();
  }
  dispose() { for (const m of this.meshes) { this.parent.remove(m); m.dispose(); } this.meshes.length = 0; }
}

export class View {
  constructor(gfx, fx, world) {
    this.gfx = gfx; this.fx = fx; this.world = world;
    this.root = new THREE.Group();
    gfx.scene.add(this.root);
    this.time = 0;
    this.tints = new Map();
    this.tileViews = new Map();
    this.itemViews = new Map();
    this.chefViews = [];
    this.stationViews = [];
    this.portalViews = [];
    this.beltViews = [];
    this.extras = [];
    this.shake = 0;
    this.camTarget = new THREE.Vector3();
    this.camBase = new THREE.Vector3();
    this.fireLevel = 0;
    this.served = [];
    this.build();
  }

  dispose() {
    this.batch.dispose();
    this.gfx.scene.remove(this.root);
    for (const m of this.tints.values()) m.dispose();
    for (const m of this.extras) m.dispose();
    for (const l of this.gfx.fireLights) l.intensity = 0;
    lightUniforms.uFireAmt.value.fill(0);
  }

  tintMat(material, color, emissive = null) {
    const key = material.uuid + '|' + color + '|' + emissive;
    let m = this.tints.get(key);
    if (!m) {
      m = material.clone(); m.color.set(color);
      if (emissive != null) m.emissive.set(emissive);
      patchMaterial(m); this.tints.set(key, m);
    }
    return m;
  }
  tintObj(obj, color, node = null, emissive = null) {
    const root = node ? part(obj, node) : obj;
    if (root) root.traverse((o) => { if (o.isMesh) o.material = this.tintMat(o.material, color, emissive); });
    return obj;
  }

  // ---- construction -------------------------------------------------------
  build() {
    const w = this.world, th = w.map.theme, gfx = this.gfx;
    gfx.scene.background = new THREE.Color(th.bg);
    gfx.scene.fog = new THREE.Fog(th.fog, 110, 240);
    gfx.hemi.color.set(th.hemiSky); gfx.hemi.groundColor.set(th.hemiGround);
    gfx.key.color.set(th.keyColor);
    gfx.fitShadow(0, 0, w.W, w.H);
    const batch = this.batch = new StaticBatch(this.root);
    const raft = th.floor === 'raft';
    const cabTint = { cab: th.cab, top: th.top };

    // floor
    const isLand = (gx, gz) => { const c = w.cell(gx, gz); return !!c && c.type !== 'river' && c.type !== 'void'; };
    for (const c of w.cells) {
      if (c.type === 'river' || c.type === 'void') continue;
      if (raft) {
        batch.add('raft_tile', mat4(c.x, 0, c.z, 0), { tint: (c.gx + c.gz) % 2 ? th.floorA : th.floorB });
        const dirs = [[0, 1, 0], [1, 0, HALF], [0, -1, 0], [-1, 0, HALF]];
        for (const [dx, dz, ry] of dirs) if (!isLand(c.gx + dx, c.gz + dz)) batch.add('raft_log', mat4(c.x + dx * 0.6, 0, c.z + dz * 0.6, ry));
      } else batch.add('floor_tile', mat4(c.x, 0, c.z), { tint: (c.gx + c.gz) % 2 ? th.floorA : th.floorB });
      if (c.lane) batch.add('rail', mat4(c.x, 0, c.z));
    }
    if (!raft) {
      // darker apron of floor around the kitchen, then open ground
      const pad = 4;
      const dark = (hex) => _c.set(hex).multiplyScalar(0.42).getHex();
      const a = dark(th.floorA), b = dark(th.floorB);
      for (let gz = -pad - 5; gz < w.H + pad; gz++) for (let gx = -pad - 5; gx < w.W + pad + 5; gx++) {
        if (gx >= 0 && gz >= 0 && gx < w.W && gz < w.H) continue;
        batch.add('floor_tile', mat4(w.wx(gx), -0.02, w.wz(gz)), { tint: (gx + gz) % 2 ? a : b });
      }
      const ground = spawn('ground');
      ground.scale.set(160, 1, 160); ground.position.y = -0.06;
      this.tintObj(ground, th.ground);
      ground.traverse((o) => { o.castShadow = false; });
      this.root.add(ground);
    } else this.buildWater(th);

    // tiles
    for (const t of w.tiles) if (!t.mover) this.buildTile(t, batch, cabTint, false);
    for (const st of [...w.sinks, ...w.hatches]) this.buildStation(st, batch);
    if (w.island) for (const t of w.island.tiles) this.buildTile(t, batch, cabTint, true);
    for (const b of w.belts) this.buildBelt(b, batch);
    for (const p of w.portals) this.buildPortal(p, batch);
    this.buildDecor(batch, raft);
    batch.build();

    for (const c of w.chefs) this.chefViews.push(this.buildChef(c));
    this.fitCamera();
  }

  buildWater(th) {
    const water = spawn('water');
    let mesh = null;
    water.traverse((o) => { if (o.isMesh) mesh = o; });
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f9ad0, roughness: 0.28, metalness: 0.0, vertexColors: false });
    const uTime = lightUniforms.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaterXZ;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wpos = modelMatrix * vec4(transformed, 1.0);
          vWaterXZ = wpos.xz;
          transformed.y += (sin(wpos.x * 0.9 + uTime * 1.3) * 0.5 + sin(wpos.z * 1.3 - uTime * 1.1) * 0.5) * 0.045 / 1.0;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWaterXZ;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 p = vWaterXZ;
            float flow = p.y * 0.55 - uTime * 0.5;
            float band = sin(p.x * 1.7 + sin(flow * 1.3) * 1.2) * sin(flow * 2.0 + p.x * 0.6);
            float line = smoothstep(0.93, 0.995, abs(band));
            float cell = sin(p.x * 3.1 + uTime * 0.7) * sin(p.y * 2.3 - uTime * 0.9);
            vec3 deep = vec3(0.012, 0.17, 0.33), mid = vec3(0.03, 0.27, 0.45);
            diffuseColor.rgb = mix(deep, mid, clamp(0.5 + 0.5 * cell, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.85, 0.98), line * 0.5);
          }`);
    };
    mat.customProgramCacheKey = () => 'water';
    patchMaterial(mat);
    mesh.material = mat;
    mesh.castShadow = false;
    water.scale.set(120, 1, 90);
    water.position.set(0, -0.3, -4);
    this.root.add(water);
    this.extras.push(mat);
  }

  dynGroup(t) {
    let tv = this.tileViews.get(t);
    if (!tv) {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.rotation.y = t.rot * HALF;
      this.root.add(g);
      tv = { g, tile: t };
      this.tileViews.set(t, tv);
    }
    return tv;
  }

  buildTile(t, batch, cabTint, moving) {
    const th = this.world.map.theme;
    const ry = t.rot * HALF;
    const M = mat4(t.x, 0, t.z, ry);
    // static pieces go to the batch, unless the tile rides the sliding island
    let tv = null;
    const addStatic = (name, matrix, opts) => {
      if (!moving) return batch.add(name, matrix, opts);
      tv = this.dynGroup(t);
      const o = spawn(name);
      if (opts && opts.only) for (const ch of [...o.children]) if (!opts.only.includes(ch.name)) o.remove(ch);
      if (opts && opts.skip) for (const ch of [...o.children]) if (opts.skip.includes(ch.name)) o.remove(ch);
      if (opts && opts.tint && typeof opts.tint === 'object') for (const k of Object.keys(opts.tint)) this.tintObj(o, opts.tint[k], k);
      if (opts && opts.local) o.applyMatrix4(opts.local);
      tv.g.add(o);
    };
    const local = (x, y, z, r = 0, s = 1) => (moving ? { local: mat4(x, y, z, r, s) } : null);
    const counterName = moving ? 'counter_cart' : 'counter';
    switch (t.kind) {
      case 'counter':
        addStatic(counterName, M, { tint: cabTint });
        break;
      case 'return':
        addStatic(counterName, M, { tint: cabTint });
        batch.add('plate_return', mat4(t.x, TOP, t.z, ry));
        break;
      case 'wall':
        batch.add('wall', mat4(t.x, 0, t.z, 0), { tint: th.wall });
        break;
      case 'trash':
        batch.add('trash', M);
        break;
      case 'crate': {
        batch.add('crate', M);
        const s = 0.95;
        const spots = [[-0.2, 0.56, -0.18, 0.3], [0.2, 0.56, -0.16, 1.9], [-0.16, 0.56, 0.2, 4.0], [0.2, 0.57, 0.2, 5.2], [0.0, 0.72, 0.0, 2.6]];
        for (const [x, y, z, r] of spots) batch.add(t.ctype, mat4(t.x + x, y, t.z + z, r, s));
        tv = this.dynGroup(t);
        tv.g.rotation.y = 0;
        const em = new THREE.Group();
        em.add(spawn('emblem'));
        const food = spawn(t.ctype);
        food.scale.setScalar(1.25); food.rotation.x = 0.9; food.position.set(0, -0.12, 0.06);
        em.add(food);
        em.position.set(0, 1.42, -0.22);
        em.rotation.x = -0.55;
        em.scale.setScalar(0.72);
        tv.g.add(em);
        tv.emblem = em;
        break;
      }
      case 'board': {
        addStatic(counterName, M, { tint: cabTint });
        if (moving) addStatic('board', M, { only: ['block'], ...local(0, TOP, 0) });
        else batch.add('board', mat4(t.x, TOP, t.z, ry), { only: ['block'] });
        tv = this.dynGroup(t);
        const cl = part(spawn('board'), 'cleaver');
        cl.removeFromParent();
        tv.g.add(cl);
        tv.cleaver = cl;
        tv.chopT = 0;
        break;
      }
      case 'stove': {
        addStatic('stove', M, { only: ['stove'] });
        tv = this.dynGroup(t);
        const burner = part(spawn('stove'), 'burner');
        burner.removeFromParent();
        burner.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); patchMaterial(o.material); tv.burnerMat = o.material; this.extras.push(o.material); } });
        tv.g.add(burner);
        const vessel = spawn(t.vessel.type);
        vessel.position.y = 0.84;
        vessel.scale.setScalar(1.12);
        if (t.vessel.type === 'pan') vessel.rotation.y = 0.5;
        if (t.vessel.type === 'pot') {
          tv.soup = part(vessel, 'soup');
          tv.soup.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); patchMaterial(o.material); tv.soupMat = o.material; this.extras.push(o.material); } });
          tv.soup.visible = false;
        }
        tv.g.add(vessel);
        tv.vessel = vessel;
        tv.heat = 0;
        break;
      }
      default: break;
    }
    if (moving && !tv) tv = this.dynGroup(t);
  }

  buildStation(st, batch) {
    const ry = st.rot * HALF;
    const g = new THREE.Group();
    g.position.set(st.x, 0, st.z); g.rotation.y = ry;
    this.root.add(g);
    const sv = { st, g };
    if (st.kind === 'sink') {
      batch.add('sink', mat4(st.x, 0, st.z, ry), { only: ['sink'], tint: { sink: 0xffffff } });
      const water = part(spawn('sink'), 'water');
      water.removeFromParent();
      g.add(water);
      sv.water = water; sv.waterY = water.position.y;
      sv.dirty = []; sv.clean = [];
      for (let i = 0; i < 4; i++) {
        const d = spawn('plate_dirty');
        d.scale.setScalar(0.95); d.position.set(-0.44 + (i % 2) * 0.06, 0.7 + i * 0.045, -0.02 + (i % 2) * 0.04); d.rotation.set(0.12 * (i % 2 ? 1 : -1), i, 0.1);
        d.visible = false; g.add(d); sv.dirty.push(d);
        const c = spawn('plate');
        c.scale.setScalar(0.95); c.position.set(0.44, 0.83 + i * 0.045, 0); c.visible = false; g.add(c); sv.clean.push(c);
      }
    } else {
      batch.add('hatch', mat4(st.x, 0, st.z, ry), { only: ['hatch'] });
      const belt = part(spawn('hatch'), 'belt');
      belt.removeFromParent();
      g.add(belt);
      sv.belt = belt; sv.beltX = belt.position.x; sv.scroll = 0;
    }
    this.stationViews.push(sv);
  }

  buildBelt(b, batch) {
    const ry = b.dir === 1 ? 0 : Math.PI;
    const bv = { belt: b, slats: [] };
    b.tiles.forEach((t, i) => {
      batch.add('conveyor', mat4(t.x, 0, t.z, ry), { only: ['frame'] });
      const s = part(spawn('conveyor'), 'slats');
      s.removeFromParent();
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z); g.rotation.y = ry;
      g.add(s);
      this.root.add(g);
      bv.slats.push({ node: s, x0: s.position.x });
      if (i === b.tiles.length - 1) batch.add('conveyor_end', mat4(t.x, 0, t.z, ry));
      if (i === 0) batch.add('conveyor_end', mat4(t.x, 0, t.z, ry + Math.PI));
    });
    this.beltViews.push(bv);
  }

  buildPortal(p, batch) {
    const name = p.color === 'blue' ? 'portal_blue' : 'portal_orange';
    batch.add(name, mat4(p.x, 0, p.z), { only: ['ring'] });
    const swirl = part(spawn(name), 'swirl');
    swirl.removeFromParent();
    swirl.position.set(p.x, swirl.position.y, p.z);
    this.root.add(swirl);
    this.portalViews.push({ p, swirl, pulse: 0 });
  }

  buildDecor(batch, raft) {
    const w = this.world, id = w.map.id;
    const L = -w.W / 2, R = w.W / 2, T = -w.H / 2, B = w.H / 2;
    if (raft) {
      const spots = [[0.2, -2.6, 'river_rock_a', 0.4, 1.0], [-0.5, 2.9, 'river_rock_b', 2.2, 1.2], [0.6, 0.6, 'lilypad', 1.0, 1.0], [-0.4, -0.9, 'lilypad', 3.0, 0.8], [0.1, 4.7, 'river_rock_a', 5.0, 1.3],
        [L - 2.2, -2, 'river_rock_a', 1.0, 1.6], [L - 1.6, 3.2, 'lilypad', 0.5, 1.1], [R + 2.0, 2.4, 'river_rock_a', 3.3, 1.5], [R + 1.5, -3, 'lilypad', 2.0, 1.2], [-3, B + 1.6, 'river_rock_b', 0.3, 1.4],
        [4.5, B + 1.9, 'lilypad', 1.4, 1.3], [-5, T - 1.8, 'river_rock_a', 2.6, 1.5], [3.2, T - 2.2, 'river_rock_b', 0.9, 1.6], [0.3, T - 1.4, 'lilypad', 1.1, 1.0], [R + 3.5, 0, 'river_rock_b', 0.2, 1.3], [L - 3.6, 0.6, 'river_rock_b', 4.0, 1.2]];
      for (const [x, z, name, r, s] of spots) batch.add(name, mat4(x, -0.3, z, r, s));
      for (const [x, z] of [[L - 0.1, T - 0.1], [R + 0.1, B + 0.1]]) batch.add('barrel', mat4(x, -0.4, z, 0.3, 0.9, 0.5));
    } else if (id === 'portals') {
      for (const [x, z, r, s] of [[L - 1.4, T - 0.6, 0.4, 1.2], [R + 1.3, T - 0.8, 2.0, 1.4], [L - 1.6, B + 0.6, 1.2, 1.0], [R + 1.5, B + 0.4, 3.1, 1.1], [L - 2.2, 0.5, 5.0, 1.3], [R + 2.3, -0.5, 0.8, 1.2], [-3.5, B + 1.3, 2.2, 0.9], [3.6, B + 1.4, 4.2, 1.0], [0, T - 1.4, 1.0, 1.5]]) batch.add('crystal', mat4(x, 0, z, r, s));
      for (const [x, z] of [[L - 0.8, T - 0.2], [R + 0.8, T - 0.2], [-0.0, B + 0.75]]) batch.add('torch', mat4(x, 0, z, 0, 1));
    } else if (id === 'bistro') {
      for (const [x, z, r] of [[-5.5, B + 1.7, 0.2], [0, B + 1.9, 1.6], [5.5, B + 1.7, 0.7], [L - 1.9, -1.2, 1.57], [R + 1.9, 1.0, 1.57], [-4, T - 1.8, 0.3], [4, T - 1.8, 2.8]]) batch.add('table', mat4(x, 0, z, r, 1));
      for (const [x, z] of [[L - 0.9, T - 0.5], [R + 0.9, T - 0.5], [L - 0.9, B + 0.6], [R + 0.9, B + 0.6]]) batch.add('plant', mat4(x, 0, z, 0, 1.25));
    } else {
      for (let i = 0; i < 7; i++) batch.add('pipe', mat4(L + 1.5 + i * 2, 0.5, T - 1.0, 0, 1.4));
      for (const [x, z, r] of [[L - 1.6, -2, 0.3], [L - 1.7, 2.4, 1.2], [R + 1.6, -2.6, 2.0], [R + 1.8, 2.0, 0.4], [-4, B + 1.5, 0.9], [4.4, B + 1.6, 2.2]]) batch.add('crate_stack', mat4(x, 0, z, r, 1.1));
      for (const [x, z] of [[L - 0.9, B + 0.7], [R + 0.9, B + 0.7]]) batch.add('barrel', mat4(x, 0, z, 0, 1.2));
    }
  }

  buildChef(c) {
    const g = new THREE.Group();
    const model = spawn(c.idx === 0 ? 'chef_cat' : 'chef_raccoon');
    model.scale.setScalar(CHEF_S);
    g.add(model);
    const n = {};
    for (const k of ['body', 'head', 'hat', 'eyes', 'handL', 'handR', 'footL', 'footR', 'tail']) { n[k] = part(model, k); n[k].userData.p0 = n[k].position.clone(); n[k].userData.r0 = n[k].rotation.clone(); }
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.56, 0.46);
    model.add(anchor);
    const ring = spawn('chef_ring');
    this.tintObj(ring, PLAYER_COLORS[c.idx], null, PLAYER_COLORS[c.idx]);
    ring.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.root.add(ring);
    const cursor = spawn('cursor');
    this.tintObj(cursor, PLAYER_COLORS[c.idx], null, PLAYER_COLORS[c.idx]);
    cursor.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    cursor.visible = false;
    this.root.add(cursor);
    this.root.add(g);
    g.position.set(c.x, 0, c.z);
    return {
      c, g, model, n, anchor, ring, cursor, phase: c.idx * 1.7, lean: 0, hx: 0, hvx: 0, hz: 0, hvz: 0, hatx: 0, hatv: 0, blink: 1.5 + c.idx, pop: 0, lastVx: 0, lastVz: 0,
      hl: new THREE.Vector3().copy(n.handL.userData.p0), hr: new THREE.Vector3().copy(n.handR.userData.p0), hold: new THREE.Vector3(), cursorTile: null, cursorPop: 0, dustT: 0, sprayT: 0,
    };
  }

  // ---- camera -------------------------------------------------------------
  fitCamera() {
    const w = this.world, cam = this.gfx.camera;
    const pitch = 56 * Math.PI / 180;
    const hw = w.W / 2 + 0.3, hh = w.H / 2 + 0.3;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hh, hh]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, z < 0 ? 1.9 : 1.2, z)); }
    const box = (dist, tz) => {
      cam.position.set(0, Math.sin(pitch) * dist + 0.3, tz + Math.cos(pitch) * dist);
      cam.lookAt(0, 0.3, tz);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { _v.copy(p).project(cam); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
      return { x0, x1, y0, y1 };
    };
    // allowed window in NDC: leave room for tickets at the top
    const WX = 0.93, Y0 = -0.93, Y1 = 0.72;
    let dist = 40, tz = 0;
    for (let i = 0; i < 12; i++) {
      const b = box(dist, tz);
      const sx = Math.max(Math.abs(b.x0), Math.abs(b.x1)) / WX, sy = (b.y1 - b.y0) / (Y1 - Y0);
      dist *= Math.max(sx, sy);
      const b2 = box(dist, tz), b3 = box(dist, tz + 0.5);
      const c2 = (b2.y0 + b2.y1) / 2, c3 = (b3.y0 + b3.y1) / 2;
      const want = (Y0 + Y1) / 2;
      const slope = (c3 - c2) / 0.5;
      if (Math.abs(slope) > 1e-5) tz += (want - c2) / slope;
    }
    this.camDist = dist; this.camTz = tz; this.camPitch = pitch;
    this.camTarget.set(0, 0.3, tz);
    this.camDrift = new THREE.Vector3();
    this.applyCamera(0);
  }

  applyCamera(dt) {
    const cam = this.gfx.camera, w = this.world;
    const mx = (w.chefs[0].x + w.chefs[1].x) / 2, mz = (w.chefs[0].z + w.chefs[1].z) / 2;
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.2) : 1;
    this.camDrift.x = lerp(this.camDrift.x, mx * 0.07, k);
    this.camDrift.z = lerp(this.camDrift.z, mz * 0.07, k);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.38;
    const sx = Math.sin(this.time * 71.3) * s + Math.sin(this.time * 113.7) * s * 0.6, sy = Math.cos(this.time * 83.1) * s;
    const sway = this.attract ? Math.sin(this.time * 0.22) * 1.1 : 0; // slow pan behind the title screen
    const tx = this.camDrift.x + sx + sway, tz = this.camTz + this.camDrift.z;
    cam.position.set(tx, Math.sin(this.camPitch) * this.camDist + 0.3 + sy, tz + Math.cos(this.camPitch) * this.camDist);
    cam.lookAt(tx, 0.3 + sy * 0.5, tz);
  }

  // ---- per frame ----------------------------------------------------------
  update(dt, live = true) {
    const w = this.world, fx = this.fx;
    this.time += dt;
    const time = this.time;
    lightUniforms.uTime.value = time;

    // tiles
    let fires = [];
    for (const [t, tv] of this.tileViews) {
      if (t.mover) tv.g.position.x = t.x;
      if (tv.emblem) {
        const bounce = t.anim > 0 ? Math.sin(t.anim / 0.25 * Math.PI) * 0.25 : 0;
        tv.emblem.position.y = 1.42 + Math.sin(time * 1.8 + t.id) * 0.05 + bounce * 0.3;
        tv.emblem.rotation.y = Math.sin(time * 0.9 + t.id * 1.3) * 0.35;
        tv.emblem.scale.setScalar(0.72 * (1 + bounce));
      }
      if (tv.cleaver) {
        const cl = tv.cleaver;
        const active = t.work > 0;
        tv.chopT = active ? tv.chopT + dt : 0;
        if (active) {
          const ph = (tv.chopT / 0.21) % 1;
          const up = ph < 0.55 ? Math.sin(ph / 0.55 * Math.PI) : 0;
          // blade leans back so its flat side faces the camera while it swings
          cl.position.set(0.36, TOP + 0.3 + up * 0.16, 0.1);
          cl.rotation.set(-0.85, 0, 0.12 - up * 1.0);
          cl.scale.setScalar(1.25);
        } else {
          cl.position.lerp(_v.set(0.33, TOP + 0.235, 0.17), 0.25);
          cl.rotation.z = lerp(cl.rotation.z, 0.3, 0.25); cl.rotation.x = lerp(cl.rotation.x, 0, 0.25); cl.rotation.y = lerp(cl.rotation.y, 0.25, 0.25);
          cl.scale.setScalar(lerp(cl.scale.x, 1, 0.25));
        }
        const it = t.item;
        if (it && it.chop > 0.01 && it.state === 'raw') fx.ring('chop' + t.id, t.x, 1.72, t.z, it.chop, active ? 0xffffff : 0x9aa3b5, 0.5);
      }
      if (tv.vessel) this.updateStove(t, tv, dt, time, live);
      if (t.fire > 0) fires.push(t);
    }
    for (const t of w.tiles) if (t.fire > 0 && !this.tileViews.has(t)) fires.push(t);
    this.updateFire(fires, dt, time, live);

    // stations
    for (const sv of this.stationViews) {
      const st = sv.st;
      if (st.kind === 'sink') {
        for (let i = 0; i < 4; i++) { sv.dirty[i].visible = i < st.dirty; sv.clean[i].visible = i < st.clean; }
        const busy = st.busy > 0;
        sv.water.position.y = sv.waterY + (busy ? Math.sin(time * 22) * 0.012 : 0) + (st.dirty > 0 ? 0.03 : 0);
        if (st.dirty > 0 && st.progress > 0.01) {
          _v.set(-0.44, 0, 0).applyAxisAngle(_v2.set(0, 1, 0), sv.g.rotation.y);
          fx.ring('wash' + st.tiles[0].id, st.x + _v.x, 1.6, st.z + _v.z, st.progress, busy ? 0x7fd8ff : 0x7a8aa0, 0.5);
        }
        for (let i = 0; i < 4; i++) if (i < st.clean) sv.clean[i].scale.setScalar(0.95 * (1 + (i === st.clean - 1 && st.flash > 0 ? Math.sin(st.flash / 0.4 * Math.PI) * 0.3 : 0)));
      } else {
        sv.scroll = (sv.scroll + dt * (st.flash > 0 ? 3.2 : 0.35)) % 0.23;
        sv.belt.position.x = sv.beltX + sv.scroll;
      }
    }
    for (const bv of this.beltViews) for (const s of bv.slats) s.node.position.x = s.x0 + (bv.belt.scroll % 0.25);
    for (const pv of this.portalViews) {
      pv.swirl.rotation.y -= dt * (2.2 + pv.pulse * 14);
      pv.pulse = Math.max(0, pv.pulse - dt * 2);
      const s = 1 + Math.sin(time * 3 + pv.p.x) * 0.04 + pv.pulse * 0.35;
      pv.swirl.scale.set(s, 1, s);
      if (live && Math.random() < dt * 5) {
        const a = Math.random() * 6.28, rgb = pv.p.color === 'blue' ? [0.5, 1.6, 3.2] : [3.2, 1.3, 0.3];
        fx.star.spawn({ x: pv.p.x + Math.cos(a) * 0.3, y: 0.05, z: pv.p.z + Math.sin(a) * 0.3, vx: 0, vy: 0.9 + Math.random() * 0.6, vz: 0, life: 0.8, s0: 0.07, s1: 0, r: rgb[0], g: rgb[1], b: rgb[2], spin: 5 });
      }
    }

    for (const cv of this.chefViews) this.updateChef(cv, dt, time, live);
    this.syncItems(dt, time);
    this.updateServed(dt);
    this.applyCamera(dt);
  }

  updateStove(t, tv, dt, time, live) {
    const v = t.vessel, fx = this.fx;
    const hot = v.state === 'cooking' || v.state === 'done';
    tv.heat = lerp(tv.heat, hot ? 1 : 0, 1 - Math.exp(-dt * 6));
    if (tv.burnerMat) { tv.burnerMat.emissiveIntensity = 0.05 + tv.heat * (2.6 + Math.sin(time * 17 + t.id) * 0.35); tv.burnerMat.color.setScalar(0.15 + tv.heat * 0.85); }
    const shake = v.state === 'cooking' ? 0.012 : v.state === 'done' ? 0.02 + v.burn * 0.03 : 0;
    tv.vessel.position.x = Math.sin(time * 47 + t.id) * shake;
    tv.vessel.position.z = Math.cos(time * 39 + t.id) * shake;
    const y = 0.84;
    if (tv.soup) {
      const n = v.items.length;
      tv.soup.visible = n > 0;
      if (n > 0) {
        const lvl = v.state === 'idle' ? 0.1 + n * 0.055 : 0.3;
        tv.soup.position.y = lerp(tv.soup.position.y, lvl, 0.2);
        const col = tv.soupMat.color;
        if (v.state === 'burnt') col.lerp(_c.set(0x1a1a1a), 0.2);
        else if (v.state === 'idle') col.lerp(_c.set(0xd9785a), 0.2);
        else col.lerp(_c.set(v.state === 'done' ? (v.burn > 0.5 ? 0xa3301c : 0xe23a22) : 0xe8553a), 0.1);
      }
    }
    if (!live) return;
    const px = t.x, pz = t.z;
    if (v.state === 'cooking' || v.state === 'done') {
      if (v.type === 'pot') {
        if (Math.random() < dt * 16) fx.bubbles(px, y + 0.36, pz, 0.2, v.state === 'done' && v.burn > 0.5 ? [0.9, 0.3, 0.2] : [1.4, 0.55, 0.4]);
        if (Math.random() < dt * (v.state === 'done' ? 7 : 3.5)) fx.steam(px, y + 0.45, pz, 1, 1.0);
      } else {
        if (Math.random() < dt * 5) fx.steam(px, y + 0.15, pz, 1, 0.95);
        if (Math.random() < dt * 12) { const a = Math.random() * 6.28; fx.drop.spawn({ x: px + Math.cos(a) * 0.15, y: y + 0.08, z: pz + Math.sin(a) * 0.15, vx: Math.cos(a) * 0.5, vy: 1.4 + Math.random(), vz: Math.sin(a) * 0.5, life: 0.3, s0: 0.05, s1: 0.02, grav: 9, r: 2.2, g: 1.8, b: 0.8, upright: true }); }
      }
      if (v.state === 'done' && v.burn > 0.5 && Math.random() < dt * 9 * v.burn) fx.smoke(px, y + 0.3, pz);
    }
    // cook bar
    const by = v.type === 'pot' ? 1.62 : 1.35;
    if (v.state === 'cooking') fx.bar('cook' + t.id, px, by, pz, v.progress, 0x4be06a);
    else if (v.state === 'done') {
      const b = v.burn;
      _c.set(0x4be06a).lerp(_c2.set(b < 0.5 ? 0xffd23f : 0xff3b30), clamp(b * 1.8, 0, 1));
      const fl = b > 0.35 ? (Math.sin(time * (10 + b * 22)) > 0 ? 1 : 0) : 0;
      fx.bar('cook' + t.id, px, by, pz, 1, _c.getHex(), fl, 0.9 + (fl ? 0.08 : 0));
    } else if (v.type === 'pot' && v.items.length > 0 && v.state === 'idle') fx.bar('cook' + t.id, px, by, pz, v.items.length / 3, 0x6fb8ff, 0, 0.8);
  }

  updateFire(fires, dt, time, live) {
    const fx = this.fx, lights = this.gfx.fireLights;
    fires.sort((a, b) => b.fire - a.fire);
    const amt = lightUniforms.uFireAmt.value, pos = lightUniforms.uFirePos.value;
    for (let i = 0; i < MAX_FIRES; i++) {
      const t = fires[i];
      const target = t ? (0.55 + Math.sin(time * 23 + i * 2.1) * 0.12 + Math.sin(time * 37.7 + i) * 0.08) * clamp(t.fire * 3, 0.3, 1) : 0;
      amt[i] = lerp(amt[i], target, 0.25);
      if (t) pos[i].set(t.x, 1.3, t.z);
    }
    for (let i = 0; i < lights.length; i++) {
      const t = fires[i];
      const target = t ? (6.5 + Math.sin(time * 29 + i * 3) * 1.8 + Math.sin(time * 53) * 1.2) * clamp(t.fire * 3, 0.3, 1) : 0;
      lights[i].intensity = lerp(lights[i].intensity, target, 0.3);
      if (t) lights[i].position.set(t.x, 1.7, t.z);
    }
    this.fireLevel = fires.length;
    if (!live) return;
    for (const t of fires) {
      const y = t.kind === 'stove' ? 1.0 : 0.86;
      const power = 0.75 + Math.min(1, t.fire) * 0.35;
      const n = Math.random() < dt * 60 ? 2 : 1;
      for (let i = 0; i < n; i++) if (Math.random() < dt * 34) fx.fire(t.x, y, t.z, power);
      if (Math.random() < dt * 6) fx.smoke(t.x, y + 0.9, t.z);
      if (Math.random() < dt * 2.5) fx.embers(t.x, y + 0.3, t.z, 1);
    }
  }

  updateChef(cv, dt, time, live) {
    const c = cv.c, n = cv.n, fx = this.fx;
    const sp = clamp(c.moving / TUNE.walkSpeed, 0, 1.6);
    const walking = sp > 0.08;
    cv.phase += dt * (walking ? 7.5 + sp * 5 : 0);
    const ph = cv.phase;
    const bob = walking ? Math.abs(Math.sin(ph)) * 0.055 * Math.min(1, sp) : Math.sin(time * 2.2 + c.idx) * 0.008;
    const dash = c.dashT > 0 ? 1 : 0;
    cv.g.position.set(c.x, bob, c.z);
    cv.g.rotation.y = c.face;
    cv.lean = lerp(cv.lean, Math.min(1, sp) * 0.13 + dash * 0.3, 0.2);
    cv.pop = Math.max(0, cv.pop - dt * 4);
    const pop = Math.max(c.catchPop > 0 ? Math.sin(c.catchPop / 0.3 * Math.PI) * 0.16 : 0, c.bump > 0 ? Math.sin(c.bump / 0.3 * Math.PI) * 0.12 : 0, cv.pop * 0.12);
    cv.model.rotation.x = cv.lean;
    cv.model.scale.set(CHEF_S * (1 + pop * 0.6 - dash * 0.06), CHEF_S * (1 - pop * 0.5 + dash * 0.04), CHEF_S * (1 + pop * 0.6 + dash * 0.2));
    // body waddle
    n.body.rotation.z = n.body.userData.r0.z + (walking ? Math.sin(ph) * 0.07 : 0);
    n.body.position.y = n.body.userData.p0.y + (c.work ? Math.abs(Math.sin(time * 15)) * 0.015 : 0);
    // feet
    const stride = Math.min(1, sp);
    for (const [foot, off] of [[n.footL, 0], [n.footR, Math.PI]]) {
      const p0 = foot.userData.p0;
      foot.position.set(p0.x, p0.y + (walking ? Math.max(0, Math.sin(ph + off)) * 0.09 * stride : 0), p0.z + (walking ? Math.cos(ph + off) * 0.13 * stride : 0));
      foot.rotation.x = walking ? -Math.sin(ph + off) * 0.4 * stride : 0;
    }
    // hands
    const L0 = n.handL.userData.p0, R0 = n.handR.userData.p0;
    const tl = _v, tr = _v2;
    tl.copy(L0); tr.copy(R0);
    const held = c.held;
    const work = c.work;
    if (work && work.kind === 'chop') {
      const cyc = (this.tileViews.get(work.tile)?.chopT || 0) / 0.21 % 1;
      const up = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) : 0;
      tr.set(0.2, 0.5 + up * 0.2, 0.36); tl.set(-0.2, 0.46, 0.38);
    } else if (work && work.kind === 'wash') {
      tl.set(-0.14 + Math.cos(time * 15) * 0.07, 0.45, 0.4 + Math.sin(time * 15) * 0.06);
      tr.set(0.14 + Math.cos(time * 15 + 2.5) * 0.07, 0.45, 0.4 + Math.sin(time * 15 + 2.5) * 0.06);
    } else if (held) {
      const wide = held.kind === 'plate' ? 0.24 : held.kind === 'ext' ? 0.13 : 0.17;
      tl.set(-wide, 0.47, 0.34); tr.set(wide, 0.47, 0.34);
      if (c.spraying) { tl.z += 0.04 + Math.sin(time * 40) * 0.01; tr.z += 0.04; }
    } else if (c.throwPop > 0) {
      const k = Math.sin(c.throwPop / 0.25 * Math.PI);
      tl.set(-0.2, 0.62 + k * 0.1, 0.25 + k * 0.3); tr.set(0.2, 0.62 + k * 0.1, 0.25 + k * 0.3);
    } else if (walking) {
      tl.z += Math.sin(ph + Math.PI) * 0.16 * stride; tr.z += Math.sin(ph) * 0.16 * stride;
      tl.y += Math.abs(Math.sin(ph)) * 0.03; tr.y += Math.abs(Math.sin(ph)) * 0.03;
    } else { tl.y += Math.sin(time * 2.2 + c.idx) * 0.012; tr.y += Math.sin(time * 2.2 + c.idx) * 0.012; }
    cv.hl.lerp(tl, 0.38); cv.hr.lerp(tr, 0.38);
    n.handL.position.copy(cv.hl); n.handR.position.copy(cv.hr);
    // bobblehead: a soft spring that lags behind changes of speed
    const fwdX = Math.sin(c.face), fwdZ = Math.cos(c.face);
    const ax = (c.vx - cv.lastVx) / Math.max(dt, 1e-4), az = (c.vz - cv.lastVz) / Math.max(dt, 1e-4);
    cv.lastVx = c.vx; cv.lastVz = c.vz;
    const aF = clamp(ax * fwdX + az * fwdZ, -60, 60), aS = clamp(ax * fwdZ - az * fwdX, -60, 60);
    const targetX = -0.3 + (walking ? Math.sin(ph * 2) * 0.035 : Math.sin(time * 1.7 + c.idx * 2) * 0.03) + (work ? 0.22 + Math.sin(time * 15) * 0.03 : 0);
    cv.hvx += ((targetX - cv.hx) * 110 - cv.hvx * 9 - aF * 0.9) * dt;
    cv.hx += cv.hvx * dt;
    cv.hvz += ((0 - cv.hz) * 110 - cv.hvz * 9 + aS * 0.9) * dt;
    cv.hz += cv.hvz * dt;
    cv.hx = clamp(cv.hx, -0.7, 0.6); cv.hz = clamp(cv.hz, -0.5, 0.5);
    n.head.rotation.x = n.head.userData.r0.x + cv.hx;
    n.head.rotation.z = n.head.userData.r0.z + cv.hz + (walking ? Math.sin(ph) * 0.04 : 0);
    n.head.position.y = n.head.userData.p0.y + (walking ? Math.abs(Math.sin(ph + 0.5)) * 0.02 : 0);
    // the toque wobbles a beat behind the head
    cv.hatv += ((-cv.hvx * 0.035 - cv.hatx) * 160 - cv.hatv * 10) * dt;
    cv.hatx = clamp(cv.hatx + cv.hatv * dt, -0.5, 0.5);
    n.hat.rotation.x = n.hat.userData.r0.x + cv.hatx;
    n.hat.rotation.z = n.hat.userData.r0.z - cv.hz * 0.6;
    n.hat.scale.y = 1 + Math.abs(cv.hatx) * 0.25 + pop * 0.5;
    n.tail.rotation.y = Math.sin(time * (walking ? 9 : 4) + c.idx * 2) * (walking ? 0.5 : 0.3);
    n.tail.rotation.x = n.tail.userData.r0.x - Math.min(1, sp) * 0.35;
    cv.blink -= dt;
    if (cv.blink < 0) cv.blink = 1.8 + Math.random() * 3;
    n.eyes.scale.y = cv.blink < 0.11 ? 0.12 : (c.catchPop > 0 || dash ? 1.18 : 1);
    cv.g.updateMatrixWorld(true);
    cv.anchor.getWorldPosition(cv.hold);
    // ring and cursor
    cv.ring.position.set(c.x, 0.015, c.z);
    cv.ring.rotation.y = c.face;
    const rs = 1 + Math.sin(time * 4 + c.idx) * 0.03;
    cv.ring.scale.set(rs, 1, rs);
    const tgt = live ? c.target : null;
    if (tgt !== cv.cursorTile) { cv.cursorTile = tgt; cv.cursorPop = 1; }
    cv.cursorPop = Math.max(0, cv.cursorPop - dt * 6);
    if (tgt) {
      cv.cursor.visible = true;
      const top = tgt.kind === 'belt' ? 0.9 : tgt.kind === 'crate' ? 0.82 : tgt.kind === 'trash' ? 0.84 : 0.87;
      cv.cursor.position.set(tgt.x, top + c.idx * 0.012, tgt.z);
      const s = 1.0 + Math.sin(time * 7) * 0.025 + cv.cursorPop * 0.18 - c.idx * 0.035;
      cv.cursor.scale.set(s, 1.2, s);
    } else cv.cursor.visible = false;
    if (!live) return;
    // dust
    if (dash) { cv.dustT -= dt; if (cv.dustT <= 0) { cv.dustT = 0.03; fx.dust(c.x - fwdX * 0.2, c.z - fwdZ * 0.2, 2, 0.08, 0.8); } }
    else if (walking && sp > 0.8) { cv.dustT -= dt; if (cv.dustT <= 0) { cv.dustT = 0.22; fx.dust(c.x - fwdX * 0.25, c.z - fwdZ * 0.25, 1, 0.05, 0.4); } }
    if (c.spraying) fx.foam(cv.hold.x + fwdX * 0.3, cv.hold.y + 0.1, cv.hold.z + fwdZ * 0.3, fwdX, fwdZ);
    if (work && work.kind === 'wash' && Math.random() < dt * 20) fx.suds(cv.hold.x + fwdX * 0.25, 0.95, cv.hold.z + fwdZ * 0.25, 1);
  }

  // ---- items --------------------------------------------------------------
  modelFor(it) {
    if (it.kind === 'ext') return ['extinguisher', EXT_S];
    if (it.kind === 'plate') {
      const dish = dishOfContents(it.contents);
      if (dish) return ['dish_' + dish, PLATE_S];
      return [it.dirty ? 'plate_dirty' : 'plate', PLATE_S];
    }
    if (it.type === 'charcoal' || it.state === 'burnt') return ['charcoal', ING_S];
    if (it.type === 'soup') return [null, 1];
    if (it.type === 'bun') return ['bun', ING_S];
    if (it.state === 'raw') return [it.type, ING_S];
    return [`${it.type}_${it.state}`, ING_S];
  }

  itemView(it) {
    let iv = this.itemViews.get(it);
    const [name, scale] = this.modelFor(it);
    const sig = name + '|' + (it.kind === 'plate' ? it.count : 1);
    if (!iv) {
      iv = { g: new THREE.Group(), sig: null, pop: 0, fresh: true, spin: 0 };
      this.root.add(iv.g);
      this.itemViews.set(it, iv);
    }
    if (iv.sig !== sig) {
      if (iv.sig !== null) iv.pop = 1;
      iv.sig = sig;
      iv.g.clear();
      if (name) {
        const n = it.kind === 'plate' ? Math.min(6, it.count) : 1;
        for (let i = 0; i < n; i++) { const o = spawn(name); o.scale.setScalar(scale); o.position.y = i * 0.05; iv.g.add(o); }
      }
    }
    iv.seen = this.frame;
    return iv;
  }

  place(it, x, y, z, ry, s = 1, snap = false, rx = 0) {
    const iv = this.itemView(it);
    const g = iv.g;
    if (iv.fresh || snap || Math.abs(g.position.x - x) + Math.abs(g.position.z - z) > 3) { g.position.set(x, y, z); iv.fresh = false; }
    else { g.position.x = lerp(g.position.x, x, 0.42); g.position.y = lerp(g.position.y, y, 0.42); g.position.z = lerp(g.position.z, z, 0.42); }
    g.rotation.set(rx, ry, 0);
    iv.pop = Math.max(0, iv.pop - 0.07);
    const p = 1 + Math.sin(iv.pop * Math.PI) * 0.32;
    g.scale.setScalar(s * p);
    g.visible = true;
    if (it.kind === 'plate' && it.contents.length) {
      const done = !!dishOfContents(it.contents);
      const k = it.contents.length;
      it.contents.forEach((cit, i) => {
        if (done || cit.type === 'soup') { const cv = this.itemViews.get(cit); if (cv) cv.g.visible = false, cv.seen = this.frame; return; }
        const a = ry + (k === 1 ? 0 : i / k * Math.PI * 2);
        const r = k === 1 ? 0 : 0.11;
        this.place(cit, g.position.x + Math.sin(a) * r * s, g.position.y + 0.045 * s, g.position.z + Math.cos(a) * r * s, ry + i, 0.62 * s * p, true);
      });
    }
    return iv;
  }

  syncItems(dt, time) {
    const w = this.world;
    this.frame = (this.frame || 0) + 1;
    for (const cv of this.chefViews) {
      const it = cv.c.held;
      if (!it) continue;
      const dy = it.kind === 'plate' ? -0.1 : it.kind === 'ext' ? -0.22 : -0.06;
      this.place(it, cv.hold.x, cv.hold.y + dy, cv.hold.z, cv.c.face + (it.kind === 'ext' ? 0 : 0), 1, false, it.kind === 'ext' && cv.c.spraying ? 0.5 : 0);
    }
    for (const t of w.tiles) {
      if (t.item) {
        const y = t.kind === 'board' ? TOP + 0.115 : t.kind === 'return' ? TOP + 0.04 : TOP;
        this.place(t.item, t.x, y, t.z, t.item.kind === 'ing' ? hash(t.item.id) * 6.28 : 0, 1, !!t.mover);
      }
      if (t.vessel) {
        const v = t.vessel, n = v.items.length;
        v.items.forEach((it, i) => {
          if (v.type === 'pot') {
            if (v.state === 'burnt') { this.place(it, t.x, 0.84 + 0.3, t.z, 1, 0.8, !!t.mover); return; }
            const a = i * 2.1 + 0.4, hide = v.state !== 'idle' && (v.progress > 0.35 || v.state === 'done');
            const iv = this.place(it, t.x + Math.sin(a) * 0.12, 0.84 + 0.14 + n * 0.05, t.z + Math.cos(a) * 0.12, a, 0.7, !!t.mover);
            if (hide) iv.g.visible = false;
          } else this.place(it, t.x, 0.84 + 0.045, t.z, hash(it.id) * 6.28, v.state === 'burnt' ? 0.85 : 0.95, !!t.mover);
        });
      }
    }
    for (const b of w.belts) for (const e of b.items) this.place(e.item, e.item.x, 0.79, e.item.z, e.item.kind === 'ing' ? hash(e.item.id) * 6.28 : 0, 1, true);
    for (const it of w.loose) this.place(it, it.x, 0.03, it.z, hash(it.id) * 6.28, 1);
    for (const f of w.flights) {
      const iv = this.place(f.item, f.x, f.y, f.z, time * 9 + f.item.id, 1, true, time * 7);
      const rgb = FOOD_RGB[f.item.type] || [1, 1, 1];
      this.fx.trail(f.x, f.y + 0.1, f.z, [rgb[0] * 1.5 + 0.3, rgb[1] * 1.5 + 0.3, rgb[2] * 1.5 + 0.3]);
      iv.g.scale.setScalar(1.1);
    }
    for (const [it, iv] of this.itemViews) if (iv.seen !== this.frame) { this.root.remove(iv.g); this.itemViews.delete(it); }
  }

  /** a served dish rides away on the hatch belt */
  dishAway(tile, dish) {
    const st = tile.station;
    const o = spawn('dish_' + dish);
    o.scale.setScalar(PLATE_S);
    this.root.add(o);
    const ry = st.rot * HALF;
    const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    this.served.push({ o, t: 0, x: tile.x, z: tile.z, dir });
  }
  updateServed(dt) {
    for (let i = this.served.length - 1; i >= 0; i--) {
      const s = this.served[i];
      s.t += dt;
      const u = s.t / 0.7;
      s.o.position.set(s.x + s.dir.x * u * 1.1, 0.83 + Math.sin(Math.min(1, u * 3) * Math.PI) * 0.12, s.z + s.dir.z * u * 1.1);
      const sc = PLATE_S * (u > 0.6 ? Math.max(0.01, 1 - (u - 0.6) / 0.4) : 1);
      s.o.scale.setScalar(sc);
      if (u >= 1) { this.root.remove(s.o); this.served.splice(i, 1); }
    }
  }

  // ---- one-shot events ----------------------------------------------------
  handle(ev) {
    const fx = this.fx, w = this.world;
    switch (ev.type) {
      case 'chop': { const it = ev.tile.item; const rgb = (it && FOOD_RGB[it.type]) || [1, 1, 1]; fx.chips(ev.tile.x, TOP + 0.25, ev.tile.z, rgb); const iv = it && this.itemViews.get(it); if (iv) iv.pop = 0.5; break; }
      case 'chopDone': fx.ringPop(ev.tile.x, TOP + 0.35, ev.tile.z, [2.6, 2.6, 2.2], 10, 1.5); fx.dust(ev.tile.x, ev.tile.z, 3, TOP + 0.2, 0.7); break;
      case 'sizzle': fx.steam(ev.tile.x, 1.05, ev.tile.z, 3, 1); break;
      case 'cooked': fx.ringPop(ev.tile.x, 1.25, ev.tile.z, [1.2, 3.0, 1.4], 12, 1.7); break;
      case 'burnt': for (let i = 0; i < 10; i++) fx.smoke(ev.tile.x, 1.1, ev.tile.z); break;
      case 'ignite': {
        const t = ev.tile;
        for (let i = 0; i < 16; i++) fx.fire(t.x, 0.95, t.z, 1.5);
        fx.embers(t.x, 1.1, t.z, 12);
        this.shake = Math.max(this.shake, ev.erupt ? 0.9 : 0.55);
        break;
      }
      case 'extinguished': fx.steam(ev.tile.x, 1.0, ev.tile.z, 9, 1.05); fx.ringPop(ev.tile.x, 1.1, ev.tile.z, [1.6, 2.2, 2.6], 10, 1.4); break;
      case 'throw': { const cv = this.chefViews[ev.chef.idx]; cv.hvx -= 5; fx.dust(ev.chef.x, ev.chef.z, 2, 0.06, 0.5); break; }
      case 'catch': {
        const cv = this.chefViews[ev.chef.idx];
        cv.hvx += 6;
        fx.ringPop(cv.hold.x, cv.hold.y, cv.hold.z, [2.8, 2.6, 1.4], 12, 1.9);
        fx.burst(cv.hold.x, cv.hold.y, cv.hold.z, 6, [3, 2.6, 1.2], 1.6, 0.14);
        fx.popup('NICE CATCH', cv.hold.x, 1.4, cv.hold.z, 'small');
        break;
      }
      case 'land': {
        if (ev.floor) fx.dust(ev.x, ev.z, 4, 0.06, 0.7);
        else { fx.ringPop(ev.x, 1.0, ev.z, [2.4, 2.4, 2.4], 8, 1.3); const iv = this.itemViews.get(ev.item); if (iv) iv.pop = 1; }
        break;
      }
      case 'splash': fx.splash(ev.x, -0.2, ev.z, 18); fx.popup('SPLASH', ev.x, 0.3, ev.z, 'small bad'); break;
      case 'serve': {
        const t = ev.tile;
        fx.burst(t.x, 1.1, t.z, 34, [3.2, 2.3, 0.5], 3.6, 0.26);
        fx.ringPop(t.x, 1.0, t.z, [3.2, 2.6, 0.8], 16, 2.6);
        fx.popup('+' + ev.base, t.x, 1.3, t.z, 'score');
        fx.popup('+' + ev.tip + ' TIP' + (ev.mult > 1 ? ' x' + ev.mult : ''), t.x, 0.9, t.z, 'tip', 0.18);
        this.dishAway(t, ev.dish);
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case 'serveWrong': fx.popup('NO ORDER FOR THAT', ev.tile.x, 1.2, ev.tile.z, 'small bad'); this.dishAway(ev.tile, ev.dish); break;
      case 'plateBack': fx.dust(ev.tile.x, ev.tile.z, 4, TOP + 0.1, 0.6); break;
      case 'dash': fx.dust(ev.chef.x, ev.chef.z, 5, 0.08, 1.0); break;
      case 'bump': fx.burst(ev.x, 0.9, ev.z, 5, [2.6, 2.6, 2.6], 1.4, 0.13); this.shake = Math.max(this.shake, 0.18); break;
      case 'teleport': {
        const rgb = ev.from.color === 'blue' ? [0.6, 1.8, 3.4] : [3.4, 1.5, 0.4];
        fx.swirl(ev.from.x, 0.1, ev.from.z, rgb); fx.swirl(ev.to.x, 0.1, ev.to.z, rgb);
        for (const pv of this.portalViews) if (pv.p === ev.from || pv.p === ev.to) pv.pulse = 1;
        const cv = this.chefViews[ev.chef.idx]; cv.pop = 1;
        break;
      }
      case 'scrub': fx.suds(ev.chef.x + Math.sin(ev.chef.face) * 0.6, 0.95, ev.chef.z + Math.cos(ev.chef.face) * 0.6, 2); break;
      case 'washDone': fx.ringPop(ev.station.x, 1.1, ev.station.z, [1.6, 2.6, 3.0], 12, 1.6); fx.suds(ev.station.x, 1.0, ev.station.z, 8); break;
      case 'pickup': { const iv = this.itemViews.get(ev.item); if (iv) iv.pop = 0.6; if (ev.crate) fx.dust(ev.tile.x, ev.tile.z, 2, 0.9, 0.5); break; }
      case 'place': case 'stack': { if (ev.tile) fx.dust(ev.tile.x, ev.tile.z, 2, TOP + 0.05, 0.45); const iv = this.itemViews.get(ev.item); if (iv) iv.pop = 0.6; break; }
      case 'plated': { const iv = this.itemViews.get(ev.plate); if (iv) { iv.pop = 1; const p = iv.g.position; fx.ringPop(p.x, p.y + 0.2, p.z, ev.dish ? [3.0, 2.4, 0.8] : [2.2, 2.2, 2.2], ev.dish ? 14 : 8, 1.4); } break; }
      case 'trash': fx.dust(ev.tile.x, ev.tile.z, 5, 0.9, 0.8); break;
      case 'drop': fx.dust(ev.x, ev.z, 3, 0.06, 0.5); break;
      case 'hint': fx.popup(ev.text, ev.tile.x, 1.1, ev.tile.z, 'small bad'); break;
      case 'islandMove': this.shake = Math.max(this.shake, 0.25); for (const t of w.island.tiles) if (t.mi === 0 || t.mi === w.island.tiles.length - 1) fx.dust(t.x, t.z, 6, 0.08, 1.2); break;
      case 'islandStop': for (const t of w.island.tiles) if (t.mi === 0 || t.mi === w.island.tiles.length - 1) fx.dust(t.x, t.z, 5, 0.08, 1.0); this.shake = Math.max(this.shake, 0.2); break;
      case 'islandWarn': for (const t of w.island.tiles) fx.star.spawn({ x: t.x, y: 0.12, z: t.z + 0.45, vx: 0, vy: 1.5, vz: 0.4, life: 0.5, s0: 0.12, s1: 0, r: 3, g: 2.2, b: 0.5, spin: 8 }); break;
      case 'ticketMissed': this.shake = Math.max(this.shake, 0.25); break;
      case 'timeup': this.shake = Math.max(this.shake, 1.0); break;
      default: break;
    }
  }
}
const _c2 = new THREE.Color();
