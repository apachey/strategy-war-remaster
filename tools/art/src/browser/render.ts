import * as THREE from 'three';
import { CAMERA_DISTANCE, CAMERA_ELEVATION_DEG, CAMERA_FAR, CAMERA_NEAR, frameLayout, PX_PER_CELL, SPRITES, SUPERSAMPLE, type SpriteDef } from '../catalog';
import { GHOST_ID, GROUND_ID, materialId, type MaterialName } from '../materials';
import { MODELS } from './models';

/**
 * Runs inside headless Chromium. For one sprite view and frame it renders two passes at SUPERSAMPLE resolution:
 * the material id of every pixel, and how much light reaches it (white surfaces, sun with shadows plus sky light).
 * The Node side turns those into pixel art.
 */

THREE.ColorManagement.enabled = false;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setClearColor(0x000000, 0);

// Sun from the upper left (north-west), as in the original, so shadows fall down and to the right.
const sun = new THREE.DirectionalLight(0xffffff, 1.36);
sun.position.set(-2, 2.8, -1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2.5;
sun.shadow.camera.right = 2.5;
sun.shadow.camera.top = 2.5;
sun.shadow.camera.bottom = -2.5;
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 12;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.004;
sun.shadow.camera.updateProjectionMatrix();
const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.2);
// Weak fill from the camera side so south faces read as mid-tones rather than as shadow.
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(1, 1, 2);

const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const idMats = new Map<number, THREE.MeshBasicMaterial>();
const idMat = (id: number) => {
  let m = idMats.get(id);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(id / 255, 0, 0) });
    idMats.set(id, m);
  }
  return m;
};

/** Depth as 16 bits in red (high) and green (low); the camera's near..far maps to 0..65535. */
const depthMat = new THREE.ShaderMaterial({
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'void main() { float d = gl_FragCoord.z * 65535.0; float hi = floor(d / 256.0); gl_FragColor = vec4(hi / 255.0, (d - hi * 256.0) / 255.0, 0.0, 1.0); }',
});

const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2));
ground.receiveShadow = true;

function camera(cells: 1 | 2): { cam: THREE.OrthographicCamera; w: number; h: number } {
  const { w, h, ax, ay } = frameLayout(cells);
  const u = PX_PER_CELL;
  const cam = new THREE.OrthographicCamera(-ax / u, (w - ax) / u, ay / u, -(h - ay) / u, CAMERA_NEAR, CAMERA_FAR);
  const el = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
  cam.position.set(0, Math.sin(el) * CAMERA_DISTANCE, Math.cos(el) * CAMERA_DISTANCE);
  cam.lookAt(0, 0, 0);
  return { cam, w, h };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface RawRender {
  w: number;
  h: number;
  /** Material id per pixel, base64, bottom row first. */
  mat: string;
  /** Light 0..255 per pixel, base64, bottom row first. */
  light: string;
  /** Depth per pixel as big-endian 16 bit, base64, bottom row first. */
  depth: string;
}

/** The turret of a model: the object marked `userData.turret`. */
function turretOf(model: THREE.Object3D): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  model.traverse((o) => {
    if (o.userData.turret) found ??= o;
  });
  return found;
}

/**
 * The model to render for a sprite: whole, its hull without the turret, or the turret alone. The turret is built on
 * a model facing north, then stands at the hull's centre at its own height, turned to the view, over a ghost disc as
 * wide as a hull, so the hull's top stops its outline where it sits on it.
 */
function modelFor(def: SpriteDef, view: number, frame: string): THREE.Object3D {
  const build = MODELS[def.model ?? def.name];
  if (!build) throw new Error(`no model for ${def.name}`);
  if (def.part === 'hull') {
    const model = build(view, frame);
    if (frame !== 'wreck') turretOf(model)?.removeFromParent();
    return model;
  }
  if (def.part !== 'turret') return build(view, frame);
  const base = SPRITES.find((s) => s.name === def.model)!;
  const model = build(0, frame === 'fire' ? 'fire' : base.frames[0]!);
  model.updateMatrixWorld(true);
  const turret = turretOf(model);
  if (!turret) throw new Error(`${def.model} has no turret`);
  const y = turret.getWorldPosition(new THREE.Vector3()).y;
  const bottom = new THREE.Box3().setFromObject(turret).min.y;
  turret.removeFromParent();
  turret.position.set(0, y, 0);
  turret.rotation.set(0, (-view * Math.PI) / 4, 0);
  const g = new THREE.Group();
  g.add(turret);
  if (bottom > 0.05) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, bottom, 12));
    disc.position.y = bottom / 2;
    disc.userData.ghost = true;
    g.add(disc);
  }
  return g;
}

export function renderSprite(name: string, view: number, frame: string): RawRender {
  const def = SPRITES.find((s) => s.name === name);
  if (!def) throw new Error(`no sprite ${name}`);
  const model = modelFor(def, view, frame);
  const { cam, w, h } = camera(def.cells);
  const W = w * SUPERSAMPLE;
  const H = h * SUPERSAMPLE;
  renderer.setSize(W, H, false);
  const target = new THREE.WebGLRenderTarget(W, H);

  const scene = new THREE.Scene();
  scene.add(model, ground, sun, sun.target, sky, fill);
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  // Meshes marked `onTop` (the walkers' shots leaving the muzzle) are drawn after everything else over a cleared
  // depth buffer, so the unit never hides them, while they still hide each other properly.
  const top = new Set<THREE.Object3D>();
  model.traverse((o) => {
    if (o.userData.onTop) o.traverse((c) => top.add(c));
  });

  const draw = (): Uint8Array => {
    const rgba = new Uint8Array(W * H * 4);
    renderer.setRenderTarget(target);
    renderer.clear();
    for (const m of meshes) m.visible = !top.has(m);
    renderer.render(scene, cam);
    if (top.size) {
      const groundShown = ground.visible;
      for (const m of meshes) m.visible = top.has(m);
      ground.visible = false;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, cam);
      renderer.autoClear = true;
      ground.visible = groundShown;
      for (const m of meshes) m.visible = true;
    }
    renderer.readRenderTargetPixels(target, 0, 0, W, H, rgba);
    renderer.setRenderTarget(null);
    return rgba;
  };
  const read = (): Uint8Array => {
    const rgba = draw();
    const r = new Uint8Array(W * H);
    for (let i = 0; i < r.length; i++) r[i] = rgba[i * 4 + 3]! ? rgba[i * 4]! : 0;
    return r;
  };

  // Pass 1: material ids.
  const ghosts = new Set<THREE.Object3D>();
  model.traverse((o) => {
    if (o.userData.ghost) o.traverse((c) => ghosts.add(c));
  });
  for (const m of meshes) {
    m.material = idMat(ghosts.has(m) ? GHOST_ID : materialId(m.userData.mat as MaterialName));
    // A ghost stands for a neighbour that casts its own shadow in its own sprite.
    if (ghosts.has(m)) m.castShadow = false;
  }
  ground.material = idMat(GROUND_ID);
  const mat = read();

  // Pass 2: light on plain white surfaces.
  for (const m of meshes) m.material = lightMat;
  ground.material = lightMat;
  const light = read();

  // Pass 3: depth, for the inner lines where one surface passes in front of another.
  for (const m of meshes) m.material = depthMat;
  ground.visible = false;
  const rgba = draw();
  ground.visible = true;
  const depth = new Uint8Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    depth[i * 2] = rgba[i * 4]!;
    depth[i * 2 + 1] = rgba[i * 4 + 1]!;
  }

  target.dispose();
  return { w: W, h: H, mat: toBase64(mat), light: toBase64(light), depth: toBase64(depth) };
}

(window as unknown as { renderSprite: typeof renderSprite }).renderSprite = renderSprite;
