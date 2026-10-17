import * as THREE from 'three';
import { glowRamp, TEAM_COLORS, type Race, type TeamColor } from '@sw/data';
import { MODELS } from '../../../../tools/art/src/browser/models';
import { MATERIALS, type MaterialName } from '../../../../tools/art/src/materials';
import { RAMPS } from '../../../../tools/art/src/palette';
import terrainUrl from '../../../../assets/sprites/terrain.png?url';
import terrainData from '../../../../assets/sprites/terrain.json';

/**
 * The style B models from tools/art, drawn live in the game at a low resolution: the main screen's battle, the
 * victory and defeat scenes and the portraits on the panel. Every surface picks its colour from the same palette
 * ramps as the sprites (the light picks the step, so shading comes out banded like hand-pixelled art), team
 * surfaces wear the side's two colours, and a post pass draws the black outline round every object. The canvas is
 * then shown scaled up with hard pixel edges.
 */

THREE.ColorManagement.enabled = false;

export interface Dress {
  race: Race;
  color: TeamColor;
  color2: TeamColor;
}

type Ground = 'sand' | 'plates' | 'forest';

/** Direction of the sun, from the north-west and high, as in the sprites. */
const SUN = new THREE.Vector3(-2, 2.8, -1.6).normalize();

const hexes = (list: readonly string[]) => list.map((h) => new THREE.Color(h));

function rampOf(name: MaterialName, dress: Dress, charred: boolean): THREE.Color[] {
  const def = MATERIALS[name] as { ramp: string };
  if (charred && def.ramp !== 'fire') return hexes(['#14110e', '#2a2520', '#3e3730', '#57504a']);
  if (def.ramp === 'team') return hexes(TEAM_COLORS[dress.color]);
  if (def.ramp === 'team2') return hexes(TEAM_COLORS[dress.color2]);
  if (def.ramp === 'team3') return hexes(glowRamp(dress.color2));
  return hexes(RAMPS[def.ramp as keyof typeof RAMPS]);
}

const VERTEX = `
varying vec3 vView;
varying vec3 vSun;
uniform vec3 sun;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  vSun = (viewMatrix * vec4(sun, 0.0)).xyz;
  gl_Position = projectionMatrix * mv;
}`;

/** Lambert light, quantised to a step in the ramp; alpha 1 marks an object pixel for the outline pass. */
const FRAGMENT = `
uniform sampler2D ramp;
uniform float steps;
uniform float shift;
uniform float emissive;
uniform float flicker;
varying vec3 vView;
varying vec3 vSun;
void main() {
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  float light = 0.42 + 0.78 * max(dot(n, normalize(vSun)), 0.0) + 0.12 * max(n.z, 0.0);
  float i = emissive > 0.5 ? steps - 1.0 : floor(clamp(light, 0.0, 1.0) * (steps - 0.01));
  i = clamp(i + shift + flicker, 0.0, steps - 1.0);
  gl_FragColor = vec4(texture2D(ramp, vec2((i + 0.5) / steps, 0.5)).rgb, 1.0);
}`;

function rampTexture(colors: THREE.Color[]): THREE.DataTexture {
  const data = new Uint8Array(colors.length * 4);
  colors.forEach((c, i) => data.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4));
  const t = new THREE.DataTexture(data, colors.length, 1);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const materials = new Map<string, THREE.ShaderMaterial>();

function material(name: MaterialName, dress: Dress, charred = false): THREE.ShaderMaterial {
  const id = `${name}/${dress.color}/${dress.color2}/${charred}`;
  let m = materials.get(id);
  if (m) return m;
  const def = MATERIALS[name] as { shift?: number; emissive?: boolean };
  const ramp = rampOf(name, dress, charred);
  m = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      ramp: { value: rampTexture(ramp) },
      steps: { value: ramp.length },
      shift: { value: def.shift ?? 0 },
      emissive: { value: def.emissive && !charred ? 1 : 0 },
      flicker: { value: 0 },
      sun: { value: SUN },
    },
  });
  materials.set(id, m);
  return m;
}

/** A model from the catalog, dressed in a side's colours (or burnt black). */
export function model(name: string, dress: Dress, view = 0, frame = 'idle', charred = false): THREE.Object3D {
  const build = MODELS[name];
  if (!build) throw new Error(`No model ${name}`);
  const m = build(view, frame);
  m.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = material((o.userData.mat as MaterialName) ?? 'steel', dress, charred);
  });
  return m;
}

/** The sprite name of a unit or building kind for a race (as spriteName in @sw/data, by kind). */
export const sprite = (race: Race, kind: string) => `${race}_${kind}`;

// Ground --------------------------------------------------------------------------------------------------------------

let terrainImage: Promise<HTMLImageElement> | null = null;

function loadTerrain(): Promise<HTMLImageElement> {
  terrainImage ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = terrainUrl;
  });
  return terrainImage;
}

/** The map's own ground tile (sand or the hovers' plates) as a repeating texture, one tile per world unit. */
async function groundTexture(kind: Ground): Promise<THREE.Texture> {
  const img = await loadTerrain();
  const frames = (terrainData as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> }).frames;
  const f = frames[kind === 'plates' ? 'plates' : 'sand']?.frame;
  const c = document.createElement('canvas');
  c.width = f?.w ?? 32;
  c.height = f?.h ?? 32;
  const g = c.getContext('2d')!;
  if (f) g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  else (g.fillStyle = RAMPS.sand[2]), g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  // The atlas piece spans several cells; repeat it so one 32 px cell is one world unit.
  t.repeat.set(1 / (c.width / 32), 1 / (c.height / 32));
  return t;
}

/** Ground pixels have alpha 0.5, so the outline pass draws lines round objects standing on it but not on it. */
const GROUND_FRAGMENT = `
uniform sampler2D map;
uniform vec2 rep;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(map, vUv * rep).rgb, 0.5); }`;

async function groundMesh(kind: Ground, size: number): Promise<THREE.Mesh> {
  const map = await groundTexture(kind);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GROUND_FRAGMENT,
    uniforms: { map: { value: map }, rep: { value: new THREE.Vector2(size * map.repeat.x, size * map.repeat.y) } },
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  return m;
}

/** A dark blob under a model, standing in for its shadow. */
function shadow(r: number, x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 10).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ fragmentShader: 'void main() { gl_FragColor = vec4(0.05, 0.04, 0.03, 0.5); }', vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', transparent: true }),
  );
  m.position.set(x + 0.08, 0.005, z + 0.08);
  return m;
}

// Post pass: outline and sky --------------------------------------------------------------------------------------------

const POST_FRAGMENT = `
uniform sampler2D scene;
uniform vec2 px;
uniform vec3 skyTop;
uniform vec3 skyBottom;
uniform float sky;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(scene, vUv);
  if (c.a < 0.75) {
    float near = max(max(texture2D(scene, vUv + vec2(px.x, 0.0)).a, texture2D(scene, vUv - vec2(px.x, 0.0)).a),
                     max(texture2D(scene, vUv + vec2(0.0, px.y)).a, texture2D(scene, vUv - vec2(0.0, px.y)).a));
    if (near > 0.75) { gl_FragColor = vec4(0.04, 0.03, 0.02, 1.0); return; }
  }
  if (c.a < 0.25) {
    // Sky in four flat bands, darker at the top.
    float t = floor(vUv.y * 4.0) / 3.0;
    gl_FragColor = sky > 0.5 ? vec4(mix(skyBottom, skyTop, t), 1.0) : vec4(0.0);
    return;
  }
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

/**
 * A scene drawn at w×h pixels into a canvas the page scales up. `update` runs before each frame with the time in
 * seconds; frames come at most 15 times a second, which suits the pixel look and spares the laptop.
 */
export class PixelScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly post: THREE.Mesh;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private raf = 0;
  update: (t: number) => void = () => {};

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly w: number,
    readonly h: number,
    sky: [string, string] | null = ['#2a2238', '#c8875a'],
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);
    this.target = new THREE.WebGLRenderTarget(w, h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 60);
    this.post = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }',
        fragmentShader: POST_FRAGMENT,
        uniforms: {
          scene: { value: this.target.texture },
          px: { value: new THREE.Vector2(1 / w, 1 / h) },
          skyTop: { value: new THREE.Color(sky?.[0] ?? '#000000') },
          skyBottom: { value: new THREE.Color(sky?.[1] ?? '#000000') },
          sky: { value: sky ? 1 : 0 },
        },
        transparent: true,
      }),
    );
    this.postScene.add(this.post);
  }

  render(t = 0): void {
    this.update(t);
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
  }

  start(): void {
    let last = -1;
    const loop = (ms: number) => {
      this.raf = requestAnimationFrame(loop);
      if (ms - last < 66) return;
      last = ms;
      this.render(ms / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.target.dispose();
    this.renderer.dispose();
  }
}

// Effects -----------------------------------------------------------------------------------------------------------------

/** Flames and smoke rising from a point: little octahedra in the fire ramp, grey puffs drifting off. */
function fire(dress: Dress, x: number, y: number, z: number, size: number): { group: THREE.Group; tick: (t: number) => void } {
  const group = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.OctahedronGeometry(size * (0.5 + (i % 3) * 0.2), 0), material(i % 2 ? 'flash' : 'ember', dress));
    f.position.set(x + Math.sin(i * 2.1) * size * 0.6, y, z + Math.cos(i * 1.7) * size * 0.6);
    flames.push(f);
    group.add(f);
  }
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.6, 0), material('steelDark', dress));
    puffs.push(p);
    group.add(p);
  }
  const tick = (t: number) => {
    flames.forEach((f, i) => {
      const k = (Math.sin(t * 9 + i * 1.3) + 1) / 2;
      f.scale.setScalar(0.6 + k * 0.6);
      f.position.y = y + k * size * 0.5;
    });
    puffs.forEach((p, i) => {
      const k = (t * 0.35 + i / puffs.length) % 1;
      p.position.set(x + k * size * 3 + Math.sin(i) * size * 0.4, y + size + k * size * 7, z - k * size);
      p.scale.setScalar(0.5 + k * 1.6);
    });
  };
  return { group, tick };
}

/** Two versions of a model that alternate (tracks rolling, a gun firing): `flip(i)` shows one of them. */
function frames(name: string, dress: Dress, view: number, names: string[]): { group: THREE.Group; show: (i: number) => void } {
  const group = new THREE.Group();
  const all = names.map((f) => model(name, dress, view, f));
  for (const m of all) group.add(m);
  const show = (i: number) => all.forEach((m, k) => (m.visible = k === i % all.length));
  show(0);
  return { group, show };
}

function place(o: THREE.Object3D, x: number, z: number, ry = 0): THREE.Object3D {
  o.position.set(x, 0, z);
  o.rotation.y = ry;
  return o;
}

/** Firs at the edges when the map has forest, crystals here and there: the map's own ground. */
function scenery(scene: THREE.Scene, dress: Dress, forest: boolean, spots: [number, number][]): void {
  if (forest)
    spots.forEach(([x, z], i) => {
      scene.add(place(model('fir', dress, i % 4, 'idle'), x, z));
      scene.add(shadow(0.35, x, z));
    });
}

// Scenes --------------------------------------------------------------------------------------------------------------

export interface OutcomeScene {
  won: boolean;
  own: Dress;
  foe: Dress;
  ground: Ground;
  forest: boolean;
}

/**
 * Victory: a low camera looks up at a column of the winner's tanks rolling past, the loser's headquarters burning
 * behind them. Defeat: the camera looks down on the loser's headquarters in ruins, black and burning, with the
 * winner's tanks standing round it.
 */
export async function outcomeScene(canvas: HTMLCanvasElement, o: OutcomeScene, w = 320, h = 180): Promise<PixelScene> {
  const s = new PixelScene(canvas, w, h, o.won ? ['#1c2240', '#e8a060'] : ['#120c10', '#5a2a1a']);
  const scene = s.scene;
  scene.add(await groundMesh(o.ground, 40));
  const ticks: ((t: number) => void)[] = [];
  if (o.won) {
    const hq = model(sprite(o.foe.race, 'hq'), o.foe, 0, 'idle0', true);
    scene.add(place(hq, 0.5, -3.2));
    const f1 = fire(o.foe, 0.2, 0.9, -3.0, 0.22);
    const f2 = fire(o.foe, 1.1, 0.5, -3.5, 0.18);
    scene.add(f1.group, f2.group);
    ticks.push(f1.tick, f2.tick);
    const kinds = ['heavy_tank', 'middle_tank', 'light_tank', 'middle_tank', 'heavy_tank', 'harvester'];
    const column: { g: THREE.Group; show: (i: number) => void; x: number }[] = [];
    kinds.forEach((k, i) => {
      const f = frames(sprite(o.own.race, k), o.own, 6, k === 'harvester' ? ['move0', 'move1'] : ['move0', 'move1', 'fire']);
      const x = 2.4 - i * 1.15;
      place(f.group, x, -0.6 + (i % 2) * 0.55);
      scene.add(f.group, shadow(0.4, x, -0.6 + (i % 2) * 0.55));
      column.push({ g: f.group, show: f.show, x });
    });
    scenery(scene, o.own, o.forest, [[-3.2, -2.4], [-2.6, -3.4], [3.6, -2.2], [4.3, -3.6], [-4.4, -1.2]]);
    s.update = (t) => {
      for (const tk of ticks) tk(t);
      column.forEach((c, i) => {
        const step = Math.floor(t * 7) % 2;
        c.show(Math.floor(t * 0.8 + i) % 5 === 0 && i % 2 === 0 ? 2 : step);
      });
      s.camera.position.set(Math.sin(t * 0.12) * 1.2, 0.35, 3.2);
      s.camera.lookAt(0, 0.85, -1.5);
    };
  } else {
    const ruin = model(sprite(o.own.race, 'hq'), o.own, 0, 'idle0', true);
    ruin.rotation.z = 0.08;
    ruin.position.y = -0.15;
    scene.add(ruin);
    const fires = [fire(o.own, -0.3, 0.6, 0.1, 0.2), fire(o.own, 0.5, 0.3, -0.4, 0.16), fire(o.own, 0.1, 0.4, 0.6, 0.14)];
    for (const f of fires) scene.add(f.group), ticks.push(f.tick);
    const ring = ['heavy_tank', 'middle_tank', 'light_tank', 'heavy_tank', 'middle_tank'];
    ring.forEach((k, i) => {
      const a = (i / ring.length) * Math.PI * 2 + 0.4;
      const x = Math.cos(a) * 2.3;
      const z = Math.sin(a) * 2.3;
      // Facing the ruin: the model's view index turns it towards the centre.
      const view = Math.round(((Math.atan2(-x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      scene.add(place(model(sprite(o.foe.race, k), o.foe, view, 'move0'), x, z), shadow(0.4, x, z));
    });
    scenery(scene, o.own, o.forest, [[-3.4, -2.8], [3.1, -3.1], [-3.8, 2.4], [3.6, 2.6]]);
    s.update = (t) => {
      for (const tk of ticks) tk(t);
      const a = t * 0.08;
      s.camera.position.set(Math.sin(a) * 4.2, 5.4, Math.cos(a) * 4.2);
      s.camera.lookAt(0, 0.2, 0);
    };
  }
  s.render(0);
  return s;
}

/** The main screen: two armies trading fire across the sand while the camera drifts along the line. */
export async function battleScene(canvas: HTMLCanvasElement, a: Dress, b: Dress, w = 320, h = 180): Promise<PixelScene> {
  const s = new PixelScene(canvas, w, h, ['#18142a', '#b0704a']);
  const scene = s.scene;
  scene.add(await groundMesh('sand', 60));
  const units: { show: (i: number) => void; phase: number }[] = [];
  const kinds = ['heavy_tank', 'middle_tank', 'light_tank', 'middle_tank', 'heavy_tank', 'light_tank'];
  for (const [side, dress, z, view] of [
    [0, a, 1.6, 0],
    [1, b, -1.6, 4],
  ] as const)
    kinds.forEach((k, i) => {
      const f = frames(sprite(dress.race, k), dress, view, ['move0', 'fire']);
      const x = -4 + i * 1.6 + side * 0.8;
      place(f.group, x, z + ((i * 7) % 3) * 0.3 * (side ? -1 : 1));
      scene.add(f.group, shadow(0.4, x, z));
      units.push({ show: f.show, phase: i * 0.37 + side * 0.19 });
    });
  scene.add(place(model(sprite(a.race, 'hq'), a, 0, 'idle0'), -6, 4.2), place(model(sprite(b.race, 'hq'), b, 0, 'idle0'), 6, -4.4));
  scene.add(place(model('resource', a, 0, 'idle'), 1.5, 0.1));
  scenery(scene, a, true, [[-8, 1], [-7.2, -2.5], [8.5, 2.2], [7.8, 0.4], [-2.5, -5], [3, 5.5]]);
  s.update = (t) => {
    for (const u of units) u.show((t * 0.9 + u.phase) % 1 < 0.12 ? 1 : 0);
    s.camera.position.set(Math.sin(t * 0.07) * 3, 3.2, 7.5);
    s.camera.lookAt(Math.sin(t * 0.07) * 2.4, 0, 0);
  };
  s.render(0);
  return s;
}

// Portraits -----------------------------------------------------------------------------------------------------------

let portraitCanvas: HTMLCanvasElement | null = null;
let portraitScene: PixelScene | null = null;
const portraits = new Map<string, string>();

/** Frame shown in a portrait for each kind of thing. */
function portraitFrame(kind: string): { frame: string; view: number } {
  if (kind === 'hq') return { frame: 'idle0', view: 0 };
  if (kind === 'wall') return { frame: 'idle', view: 10 };
  if (['silo', 'factory', 'construction'].includes(kind)) return { frame: 'idle', view: 0 };
  if (kind === 'defender') return { frame: 'idle', view: 5 };
  return { frame: 'move0', view: 5 };
}

/**
 * A close-up of one kind of unit or building of a race in a side's colours, `size` art pixels square, from a
 * three-quarter view in front; returns a PNG data URL, cached.
 */
export function portrait(dress: Dress, kind: string, size = 40): string {
  const id = `${dress.race}/${dress.color}/${dress.color2}/${kind}/${size}`;
  const hit = portraits.get(id);
  if (hit) return hit;
  if (!portraitCanvas || portraitScene?.w !== size) {
    portraitScene?.dispose();
    portraitCanvas = document.createElement('canvas');
    portraitScene = new PixelScene(portraitCanvas, size, size, null);
  }
  const s = portraitScene!;
  s.scene.clear();
  const name = kind === 'resource' ? 'resource' : sprite(dress.race, kind);
  const { frame, view } = portraitFrame(kind);
  const m = model(name, dress, view, frame);
  s.scene.add(m);
  // Frame the model: fit its bounding sphere into the view.
  const sphere = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere());
  s.camera.fov = 30;
  s.camera.aspect = 1;
  const dist = (sphere.radius / Math.sin((s.camera.fov * Math.PI) / 360)) * 0.8;
  s.camera.position.set(sphere.center.x + dist * 0.35, sphere.center.y + dist * 0.5, sphere.center.z + dist * 0.8);
  s.camera.lookAt(sphere.center);
  s.camera.updateProjectionMatrix();
  s.render(0);
  const url = portraitCanvas.toDataURL('image/png');
  portraits.set(id, url);
  return url;
}
