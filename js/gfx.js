// Renderer, shared lighting patch, lights, post-processing and camera rig.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MAX_FIRES = 4;

// One set of uniforms shared by every lit material in the game.
export const lightUniforms = {
  uRimColor: { value: new THREE.Color(0x9cc4ff) },
  uRimStrength: { value: 0.34 },
  uRimPower: { value: 2.6 },
  uFirePos: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector3(0, -99, 0)) },
  uFireAmt: { value: new Float32Array(MAX_FIRES) },
  uFireColor: { value: new THREE.Color(1.0, 0.42, 0.08) },
  uWarmth: { value: new THREE.Color(1.04, 1.0, 0.95) },
  uTime: { value: 0 },
};

const VERT_DECL = /* glsl */`
varying vec3 vCtWorld;
`;
const VERT_BODY = /* glsl */`
#ifdef USE_INSTANCING
  vCtWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vCtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;
const FRAG_DECL = /* glsl */`
#define CT_FIRES ${MAX_FIRES}
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform vec3 uFirePos[CT_FIRES];
uniform float uFireAmt[CT_FIRES];
uniform vec3 uFireColor;
uniform vec3 uWarmth;
varying vec3 vCtWorld;
`;
// Runs right before the final colour is written. Every pow() base is clamped to >= 0.
const FRAG_BODY = /* glsl */`
{
  vec3 ctN = normalize(normal);
  vec3 ctV = normalize(vViewPosition);
  float ctFres = clamp(1.0 - dot(ctN, ctV), 0.0, 1.0);
  float ctRim = pow(max(ctFres, 0.0), uRimPower);
  // cool bounce comes from above and behind: favour normals that point up the screen
  float ctUp = clamp(ctN.y * 0.6 + 0.55, 0.0, 1.0);
  outgoingLight *= uWarmth;
  outgoingLight += uRimColor * (ctRim * uRimStrength * ctUp) * (diffuseColor.rgb * 0.55 + 0.25);
  // orange glow from stove fires
  vec3 ctGlow = vec3(0.0);
  for (int i = 0; i < CT_FIRES; i++) {
    vec3 d = uFirePos[i] - vCtWorld;
    float fall = uFireAmt[i] / (1.0 + dot(d, d) * 1.7);
    ctGlow += uFireColor * fall;
  }
  outgoingLight += ctGlow * (diffuseColor.rgb * 0.6 + 0.04);
}
`;

const patched = new WeakSet();
export function patchMaterial(mat) {
  if (!mat || patched.has(mat) || !mat.isMeshStandardMaterial) return mat;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, lightUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <opaque_fragment>', FRAG_BODY + '\n#include <opaque_fragment>');
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => 'ct-light' + key;
  mat.needsUpdate = true;
  return mat;
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.3 }, uAspect: { value: 1.6 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(1.0, 1.0 / max(uAspect, 0.5)) * 1.9;
      float v = smoothstep(0.55, 1.35, length(p));
      // gentle grade: a little more saturation and contrast, then the vignette
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.16);
      c.rgb = clamp(c.rgb, 0.0, 1.0);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.28);
      c.rgb *= 1.0 - v * uAmount;
      gl_FragColor = c;
    }`,
};

export function createGfx(canvas, { shadows = true, post = true, msaa = true, bloom: useBloom = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !post, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2530);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(19, 16 / 9, 4, 160);

  // warm kitchen key light with soft shadows
  const key = new THREE.DirectionalLight(0xffe3bd, 2.35);
  key.position.set(-7, 15, 8);
  key.castShadow = shadows;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 3.2;
  scene.add(key, key.target);
  // cool rim bounce from behind
  const rim = new THREE.DirectionalLight(0x8fb6ff, 0.85);
  rim.position.set(6, 7, -10);
  scene.add(rim, rim.target);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8f6b4f, 0.5);
  scene.add(hemi);
  // fire lights are always present (intensity 0 when idle) so shaders never recompile mid-game
  const fireLights = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xff7a1f, 0, 7.5, 1.6);
    l.position.set(0, -50, 0);
    scene.add(l);
    fireLights.push(l);
  }

  function fitShadow(cx, cz, w, d) {
    const r = Math.max(w, d) * 0.5 + 3.0;
    key.target.position.set(cx, 0, cz);
    key.position.set(cx - 7, 15, cz + 8);
    rim.target.position.set(cx, 0, cz);
    rim.position.set(cx + 6, 7, cz - 10);
    const s = key.shadow.camera;
    s.left = -r; s.right = r; s.top = r; s.bottom = -r; s.near = 2; s.far = 44;
    s.updateProjectionMatrix();
    key.shadow.needsUpdate = true;
  }
  fitShadow(0, 0, 14, 9);

  let composer = null, bloom = null, vignette = null;
  if (post) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.5, 1.5);
    if (useBloom) composer.addPass(bloom);
    composer.addPass(new OutputPass());
    vignette = new ShaderPass(VignetteShader);
    composer.addPass(vignette);
  }

  function resize(w, h, pixelRatio = 1) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); vignette.uniforms.uAspect.value = w / h; }
  }

  // draw statistics for the whole frame (scene pass, shadow pass and post passes together)
  renderer.info.autoReset = false;
  const stats = { calls: 0, triangles: 0 };
  function render() {
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
  }

  return { renderer, scene, camera, key, rim, hemi, fireLights, composer, bloom, vignette, resize, render, fitShadow, stats };
}

export { THREE };
