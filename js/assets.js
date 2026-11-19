// Loads every Blender-made .glb, shares materials between models and applies the lighting patch.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { patchMaterial } from './gfx.js';

export const models = {};
export const clips = {}; // model name -> AnimationClip[] (empty when the glb has none)
const matCache = new Map();

function shareMaterial(m) {
  const key = [m.name, m.vertexColors, m.color.getHexString(), m.emissive.getHexString(), m.emissiveIntensity, m.roughness, m.metalness].join('|');
  if (matCache.has(key)) return matCache.get(key);
  m.side = THREE.FrontSide;
  if (m.metalness > 0.5) m.envMapIntensity = 1.5;
  patchMaterial(m);
  matCache.set(key, m);
  return m;
}

export async function loadAssets(onProgress) {
  const base = new URL('../assets/models/', import.meta.url).href;
  const list = await (await fetch(base + 'manifest.json')).json();
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(list.map(async (name) => {
    const gltf = await loader.loadAsync(base + name + '.glb');
    const root = gltf.scene;
    root.name = name;
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = shareMaterial(o.material);
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    models[name] = root;
    clips[name] = gltf.animations || [];
    done++;
    if (onProgress) onProgress(done / list.length);
  }));
  return models;
}

/** fresh instance of a model (geometry and materials are shared) */
export function spawn(name) {
  const src = models[name];
  if (!src) throw new Error('unknown model ' + name);
  return src.clone(true);
}

/** animation clip of a model by name (null when the glb does not have it) */
export function clipOf(model, name) { return (clips[model] || []).find((c) => c.name === name) || null; }

/** find a named node inside an instance */
export function part(obj, name) {
  let found = null;
  obj.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

/** give an instance its own material copies (for tinting), optionally only below one node */
export function ownMaterials(obj) {
  obj.traverse((o) => {
    if (o.isMesh) { o.material = o.material.clone(); patchMaterial(o.material); }
  });
  return obj;
}

/** all meshes of a model with their matrix relative to the model root (for instancing) */
export function meshesOf(name) {
  const src = models[name];
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const out = [];
  src.traverse((o) => {
    if (o.isMesh) out.push({ geometry: o.geometry, material: o.material, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), node: o.parent && o.parent !== src ? o.parent.name : o.name });
  });
  return out;
}
