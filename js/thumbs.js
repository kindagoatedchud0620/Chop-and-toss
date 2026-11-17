// Renders small pictures of the Blender models for tickets, recipe cards and the title screen.
import * as THREE from 'three';
import { spawn, part } from './assets.js';

const SPECS = {
  tomato: {}, bun: {}, meat: {}, lettuce: {}, fish: { yaw: 0.5 }, potato: {},
  dish_soup: { pad: 1.02 }, dish_burger: { pad: 1.02 }, dish_fishchips: { pad: 1.02 },
  board: { yaw: -0.5 }, pot: { yaw: 0.2 }, pan: { yaw: 0.9 }, plate: {},
  chef_cat: { face: true }, chef_raccoon: { face: true },
};

export function makeThumbs(gfx, size = 200) {
  const renderer = gfx.renderer;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const scene = new THREE.Scene();
  scene.environment = gfx.scene.environment;
  scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-2, 4, 3);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.7); fill.position.set(3, 2, -2);
  scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0xb09a88, 0.9));
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const out = {};
  const buf = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { const l = i / 255; lut[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
  for (const [name, spec] of Object.entries(SPECS)) {
    const o = spawn(name);
    if (spec.face) { const head = part(o, 'head'); head.rotation.x = -0.12; }
    o.rotation.y = spec.yaw || 0;
    scene.add(o);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(spec.face ? part(o, 'head') : o);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.5 * (spec.pad || 1.12);
    const dist = r / Math.tan(13 * Math.PI / 180) * (spec.face ? 0.98 : 1.05);
    if (spec.face) cam.position.set(c.x + dist * 0.12, c.y + dist * 0.22, c.z + dist * 0.97);
    else cam.position.set(c.x, c.y + dist * 0.62, c.z + dist * 0.78);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4, dst = y * size * 4;
      for (let x = 0; x < size * 4; x += 4) {
        const a = buf[src + x + 3];
        const k = a > 0 ? 255 / a : 0;
        // simple filmic shoulder so bright whites keep some shape
        img.data[dst + x] = lut[Math.min(255, Math.round(buf[src + x] * k))];
        img.data[dst + x + 1] = lut[Math.min(255, Math.round(buf[src + x + 1] * k))];
        img.data[dst + x + 2] = lut[Math.min(255, Math.round(buf[src + x + 2] * k))];
        img.data[dst + x + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    out[name] = canvas.toDataURL('image/png');
    scene.remove(o);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  rt.dispose();
  return out;
}
