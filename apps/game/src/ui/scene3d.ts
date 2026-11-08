import * as THREE from 'three';
import { CAMPAIGN_FACTIONS, glowRamp, TEAM_COLORS, type Race, type TeamColor } from '@sw/data';
import { MODELS } from '../../../../tools/art/src/browser/models';
import { MATERIALS, type MaterialName } from '../../../../tools/art/src/materials';
import { RAMPS } from '../../../../tools/art/src/palette';
import terrainUrl from '../../../../assets/sprites/terrain.png?url';
import terrainData from '../../../../assets/sprites/terrain.json';
import effectsUrl from '../../../../assets/sprites/effects.png?url';
import effectsData from '../../../../assets/sprites/effects.json';

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
  /** The chassis: tracks, tyres, walker legs, hover bellies. */
  color3: TeamColor;
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
  if (def.ramp === 'chassis') return hexes(TEAM_COLORS[dress.color3]);
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

function material(name: MaterialName, dress: Dress, charred = false, layer = 0): THREE.ShaderMaterial {
  const id = `${name}/${dress.color}/${dress.color2}/${dress.color3}/${charred}/${layer}`;
  let m = materials.get(id);
  if (m) return m;
  if (layer) {
    // The same material and uniforms (ramp, flicker), only drawn a little nearer.
    const base = material(name, dress, charred);
    m = base.clone();
    m.uniforms = base.uniforms;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -layer * 0.05;
    m.polygonOffsetUnits = -layer * 2;
    materials.set(id, m);
    return m;
  }
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

/** Layers a model's parts can be pushed forward by; a part's layer is its build order, capped here. */
const LAYERS = 64;

/** A model from the catalog, dressed in a side's colours (or burnt black). */
export function model(name: string, dress: Dress, view = 0, frame = 'idle', charred = false): THREE.Object3D {
  const build = MODELS[name];
  if (!build) throw new Error(`No model ${name}`);
  const m = build(view, frame);
  // Models lay stripes, windows and plates flush on the hulls they decorate. The sprites, drawn from straight above,
  // hide that, but a live camera makes such twin faces flicker (z-fighting). Each part is drawn a hair in front of
  // the parts built before it, so the later one, the detail, always wins.
  let i = 0;
  m.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = material((o.userData.mat as MaterialName) ?? 'steel', dress, charred, Math.min(LAYERS, i++));
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
  if (kind === 'forest') {
    // Forest floor: the sand's own dunes and grain, darkened to mossy soil.
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#5c7a54';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
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
    new THREE.ShaderMaterial({ fragmentShader: 'void main() { gl_FragColor = vec4(0.03, 0.02, 0.02, 0.38); }', vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', transparent: true }),
  );
  m.position.set(x + 0.08, 0.005, z + 0.08);
  return m;
}

// Post pass: outline and sky --------------------------------------------------------------------------------------------

const POST_FRAGMENT = `
uniform sampler2D scene;
uniform vec2 px;
uniform vec3 skyTop;
uniform vec3 skyMid;
uniform vec3 skyBottom;
uniform vec3 haze;
uniform vec3 hill;
uniform float sky;
uniform float stars;
uniform float horizon;
uniform float yaw;
uniform float hfov;
uniform float thick;
uniform float letterbox;
varying vec2 vUv;

// Ordered 4×4 dither threshold in [0, 1) for a pixel.
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 objectAt(vec2 uv) { return texture2D(scene, uv); }

void main() {
  vec2 p = vUv / px;
  float d = bayer4(p);
  if (abs(vUv.y - 0.5) > 0.5 - letterbox) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec4 c = objectAt(vUv);
  if (c.a < 0.75) {
    // Outline: the colour of the object next to this pixel, much darker, as the sprites have; two pixels wide when
    // thick (the four neighbours, then the ring one further out).
    vec4 best = vec4(0.0);
    vec4 n1 = objectAt(vUv + vec2(px.x, 0.0)); if (n1.a > best.a) best = n1;
    vec4 n2 = objectAt(vUv - vec2(px.x, 0.0)); if (n2.a > best.a) best = n2;
    vec4 n3 = objectAt(vUv + vec2(0.0, px.y)); if (n3.a > best.a) best = n3;
    vec4 n4 = objectAt(vUv - vec2(0.0, px.y)); if (n4.a > best.a) best = n4;
    if (thick > 1.5 && best.a < 0.75) {
      vec4 m1 = objectAt(vUv + vec2(2.0 * px.x, 0.0)); if (m1.a > best.a) best = m1;
      vec4 m2 = objectAt(vUv - vec2(2.0 * px.x, 0.0)); if (m2.a > best.a) best = m2;
      vec4 m3 = objectAt(vUv + vec2(0.0, 2.0 * px.y)); if (m3.a > best.a) best = m3;
      vec4 m4 = objectAt(vUv - vec2(0.0, 2.0 * px.y)); if (m4.a > best.a) best = m4;
      vec4 m5 = objectAt(vUv + px); if (m5.a > best.a) best = m5;
      vec4 m6 = objectAt(vUv - px); if (m6.a > best.a) best = m6;
      vec4 m7 = objectAt(vUv + vec2(px.x, -px.y)); if (m7.a > best.a) best = m7;
      vec4 m8 = objectAt(vUv + vec2(-px.x, px.y)); if (m8.a > best.a) best = m8;
    }
    if (best.a > 0.75) { gl_FragColor = vec4(best.rgb * 0.32, 1.0); return; }
  }
  if (c.a < 0.25) {
    if (sky < 0.5) { gl_FragColor = vec4(0.0); return; }
    float y = vUv.y - horizon;
    // The sky is a panorama round the camera: a column's bearing is the camera's yaw plus its angle off centre, so
    // mountains, stars and moons stay put in the world while the camera turns.
    float a = yaw + (vUv.x - 0.5) * hfov;
    float step = hfov * px.x;
    // Far mountains: a ragged silhouette on the horizon, hazy at the foot (whole frequencies, so it closes round).
    float ridge = 0.035 + 0.025 * sin(a * 8.0 + 1.7) + 0.015 * sin(a * 23.0 + 0.4) + 0.008 * sin(a * 57.0);
    if (y < ridge) {
      float k = clamp(1.0 - y / max(ridge, 0.001), 0.0, 1.0);
      gl_FragColor = vec4(mix(hill, haze, k * 0.6 > d ? 1.0 : 0.0), 1.0);
      return;
    }
    // Sky: three colours blended through an ordered dither, no hard bands.
    float t = clamp(y / max(1.0 - horizon, 0.2), 0.0, 1.0);
    float levels = 7.0;
    float q = floor(t * levels + d) / levels;
    vec3 col = q < 0.5 ? mix(skyBottom, skyMid, q * 2.0) : mix(skyMid, skyTop, q * 2.0 - 1.0);
    // Stars high up, and two moons.
    vec2 cell = vec2(floor(a / step), floor(p.y));
    if (stars > 0.5 && t > 0.35 && hash(cell) > 0.994) col = mix(col, vec3(1.0, 0.96, 0.85), 0.5 + 0.5 * hash(cell + 7.0));
    // The moons stand at fixed bearings, a little right of straight ahead at the start.
    float b1 = mod(0.30 - yaw + 3.14159, 6.28318) - 3.14159;
    float b2 = mod(0.20 - yaw + 3.14159, 6.28318) - 3.14159;
    vec2 m1 = vec2(0.5 + b1 / hfov, horizon + (1.0 - horizon) * 0.72);
    vec2 m2 = vec2(0.5 + b2 / hfov, horizon + (1.0 - horizon) * 0.86);
    vec2 aspect = vec2(px.y / px.x, 1.0);
    float r1 = length((vUv - m1) * aspect);
    float r2 = length((vUv - m2) * aspect);
    if (stars > 0.5 && r1 < 0.055) {
      float lit = length((vUv - m1 - vec2(0.02, 0.012)) * aspect) < 0.055 ? 1.0 : 0.0;
      col = lit > 0.5 ? vec3(0.93, 0.88, 0.78) : vec3(0.42, 0.40, 0.48);
    } else if (stars > 0.5 && r2 < 0.022) col = vec3(0.70, 0.78, 0.86);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  vec3 col = c.rgb;
  if (sky > 0.5 && c.a < 0.75) {
    // Ground thins into haze towards the horizon.
    float k = clamp((vUv.y - (horizon - 0.22)) / 0.22, 0.0, 1.0);
    col = mix(col, haze, (k * 0.75 > d ? 1.0 : 0.0) * 0.7);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Colours of a scene's sky; `stars` adds stars and the two moons. */
export interface Sky {
  top: string;
  mid: string;
  bottom: string;
  haze: string;
  hill: string;
  stars: boolean;
}

const DUSK: Sky = { top: '#0c0e2a', mid: '#3c2c5c', bottom: '#e8975a', haze: '#c88a68', hill: '#4a3050', stars: true };

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
    readonly sky: Sky | null = DUSK,
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
          skyTop: { value: new THREE.Color(sky?.top ?? '#000000') },
          skyMid: { value: new THREE.Color(sky?.mid ?? '#000000') },
          skyBottom: { value: new THREE.Color(sky?.bottom ?? '#000000') },
          haze: { value: new THREE.Color(sky?.haze ?? '#000000') },
          hill: { value: new THREE.Color(sky?.hill ?? '#000000') },
          sky: { value: sky ? 1 : 0 },
          stars: { value: sky?.stars ? 1 : 0 },
          horizon: { value: 0.5 },
          yaw: { value: 0 },
          hfov: { value: 1 },
          thick: { value: 1 },
          letterbox: { value: 0 },
        },
        transparent: true,
      }),
    );
    this.postScene.add(this.post);
  }

  render(t = 0): void {
    this.update(t);
    if (this.sky) {
      // Where the far ground meets the sky on screen, for the mountains and the haze.
      this.camera.updateMatrixWorld();
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      dir.y = 0;
      const far = this.camera.position.clone().add(dir.normalize().multiplyScalar(45)).setY(0).project(this.camera);
      const u = (this.post.material as THREE.ShaderMaterial).uniforms;
      u.horizon!.value = (far.y + 1) / 2;
      u.yaw!.value = Math.atan2(dir.x, -dir.z);
      u.hfov!.value = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect);
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
  }

  /** Outline width in pixels (1 or 2) and black bars top and bottom, as a share of the height each. */
  frame(outline: number, letterbox = 0): void {
    const u = (this.post.material as THREE.ShaderMaterial).uniforms;
    u.thick!.value = outline;
    u.letterbox!.value = letterbox;
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
      p.position.set(x + k * size * 2.5 + Math.sin(i) * size * 0.4, y + size + k * size * 6, z - k * size);
      p.scale.setScalar(0.4 + k * 1.1);
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

/** Puts a model on the ground; `ry` turns it further (a model built for a view is already turned that way). */
function place(o: THREE.Object3D, x: number, z: number, ry = 0): THREE.Object3D {
  o.position.set(x, 0, z);
  o.rotation.y += ry;
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

/** A belt of firs between two depths, thicker towards the back: the forest the map stands in. */
function treeline(scene: THREE.Scene, dress: Dress, count: number, x0: number, x1: number, z0: number, z1: number, seed = 1): void {
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const k = Math.sqrt(rand());
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + k * (z1 - z0);
    const fir = place(model('fir', dress, Math.floor(rand() * 4), 'idle'), x, z, rand() * Math.PI * 2);
    fir.scale.setScalar(0.85 + rand() * 0.5);
    scene.add(fir);
  }
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
export async function outcomeScene(canvas: HTMLCanvasElement, o: OutcomeScene, w = 480, h = 270): Promise<PixelScene> {
  const s = new PixelScene(
    canvas,
    w,
    h,
    o.won ? DUSK : { top: '#060509', mid: '#24121a', bottom: '#7a3018', haze: '#5a2a1a', hill: '#1e1216', stars: false },
  );
  const scene = s.scene;
  scene.add(await groundMesh(o.ground, 40));
  const ticks: ((t: number) => void)[] = [];
  if (o.won) {
    // The beaten headquarters burns at the back; in front of it the winners stand in a line facing the camera.
    const hq = model(sprite(o.foe.race, 'hq'), o.foe, 0, 'idle0', true);
    scene.add(place(hq, 0, -3.6));
    const f1 = fire(o.foe, -0.3, 0.9, -3.4, 0.22);
    const f2 = fire(o.foe, 0.6, 0.5, -3.9, 0.18);
    scene.add(f1.group, f2.group);
    ticks.push(f1.tick, f2.tick);
    // Every one faces the camera, the flanks turned a little inwards.
    const line: [string, number, number, number][] = [
      ['light_tank', -3.0, -0.2, -0.45],
      ['middle_tank', -1.6, 0.25, -0.25],
      ['heavy_tank', 0, 0.7, 0],
      ['middle_tank', 1.6, 0.25, 0.25],
      ['light_tank', 3.0, -0.2, 0.45],
      ['harvester', -4.4, -1.5, -0.6],
    ];
    for (const [k, x, z, ry] of line) scene.add(place(model(sprite(o.own.race, k), o.own, 4, 'move0'), x, z, ry), shadow(0.42, x, z));
    if (o.forest || o.ground === 'forest') treeline(scene, o.own, o.ground === 'forest' ? 70 : 40, -14, 14, -6, -16, 3);
    if (o.ground === 'forest') scenery(scene, o.own, true, [[-5.6, -2.2], [5.4, -2.6], [6.2, -0.8], [-6.4, -0.6], [4.6, -4.2], [-4.8, -4.6]]);
    s.update = (t) => {
      for (const tk of ticks) tk(t);
      // Low, slowly swaying from side to side, looking a little up at the line.
      s.camera.position.set(Math.sin(t * 0.15) * 1.2, 1.1, 6.6);
      s.camera.lookAt(0, 0.85, -1.2);
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
    scenery(scene, o.own, o.forest || o.ground === 'forest', [[-3.4, -2.8], [3.1, -3.1], [-3.8, 2.4], [3.6, 2.6]]);
    if (o.forest || o.ground === 'forest') treeline(scene, o.own, o.ground === 'forest' ? 60 : 30, -9, 11, -4.5, -11, 5);
    s.update = (t) => {
      for (const tk of ticks) tk(t);
      const a = t * 0.08;
      s.camera.position.set(Math.sin(a) * 6.4, 3.4, Math.cos(a) * 6.4);
      s.camera.lookAt(0, 0.5, 0);
    };
  }
  s.render(0);
  return s;
}

/** The campaign's two sides, which the main screen always shows: white humans with olive accents, cyan hovers. */
const CAMPAIGN: readonly [Dress, Dress] = CAMPAIGN_FACTIONS;

interface Burst {
  sprite: THREE.Sprite;
  /** Shows frame `i` of the hit at a point, or hides it when `i` is out of the animation. */
  at(i: number, x: number, y: number, z: number): void;
}

let effectsImage: Promise<THREE.Texture> | null = null;

/** Hits as the map shows them: each race's frames from the effects atlas, sized as on the map (32 px a cell). */
async function hits(): Promise<(race: Race, scale: number) => Burst> {
  effectsImage ??= new THREE.TextureLoader().loadAsync(effectsUrl);
  const sheet = await effectsImage;
  const { w: W, h: H } = effectsData.meta.size;
  const frames = effectsData.frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  const anim = { human: 'spark', hover: 'plasma', walker: 'acid' } as const;
  return (race, scale) => {
    const strip: { tex: THREE.Texture; w: number; h: number }[] = [];
    for (let i = 0; frames[`${anim[race]}/${i}`]; i++) {
      const f = frames[`${anim[race]}/${i}`]!.frame;
      const tex = sheet.clone();
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.repeat.set(f.w / W, f.h / H);
      tex.offset.set(f.x / W, 1 - (f.y + f.h) / H);
      tex.needsUpdate = true;
      strip.push({ tex, w: f.w, h: f.h });
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: strip[0]!.tex, alphaTest: 0.5 }));
    sprite.visible = false;
    return {
      sprite,
      at(i, x, y, z) {
        const f = strip[i];
        sprite.visible = !!f && i >= 0;
        if (!f || i < 0) return;
        sprite.material.map = f.tex;
        sprite.scale.set((f.w / 32) * scale, (f.h / 32) * scale, 1);
        sprite.position.set(x, y, z);
      },
    };
  };
}

/** One camera shot of the main screen's film: how long it runs and where the camera is at `k` (0..1) through it. */
interface Shot {
  seconds: number;
  fov: number;
  at(k: number, from: THREE.Vector3, to: THREE.Vector3): void;
}

/**
 * The main screen: a short film on a loop, in letterbox. The campaign's humans roll across the sand at the hovers'
 * line, both sides firing, and the film cuts between low tracking shots, a hero shot under a heavy tank's gun, a crane
 * shot over the field and a look back from behind the hovers.
 */
export async function battleScene(canvas: HTMLCanvasElement, w = 480, h = 270): Promise<PixelScene> {
  const [a, b] = CAMPAIGN;
  const s = new PixelScene(canvas, w, h, { top: '#0e0c22', mid: '#3a2846', bottom: '#b8744a', haze: '#a8785a', hill: '#3e2a3c', stars: true });
  s.frame(2, 0.11);
  const scene = s.scene;
  scene.add(await groundMesh('sand', 70));
  const hit = await hits();
  type Unit = { group: THREE.Group; show: (i: number) => void; x: number; z: number; side: 0 | 1; phase: number; shell: THREE.Object3D; burst: Burst };
  const units: Unit[] = [];
  const kinds = ['light_tank', 'middle_tank', 'heavy_tank', 'middle_tank', 'light_tank', 'heavy_tank', 'middle_tank'];
  for (const [side, dress, z0, view] of [
    [0, a, 4.2, 0],
    [1, b, -2.2, 4],
  ] as const)
    kinds.forEach((k, i) => {
      const f = frames(sprite(dress.race, k), dress, view, ['move0', 'fire']);
      const group = new THREE.Group();
      group.add(f.group, shadow(0.4, 0, 0));
      scene.add(group);
      // The very shell and hit the game draws: the race's shot model, gun or cannon as the sim picks by damage, and
      // the hit's pixel frames (sparks, plasma or acid) standing up as a billboard.
      const shell = model(sprite(dress.race, 'shot'), dress, 0, k === 'light_tank' ? 'gun' : 'cannon');
      const burst = hit(dress.race, k === 'light_tank' ? 0.9 : 1.25);
      scene.add(shell, burst.sprite);
      units.push({ group, show: f.show, x: -4.8 + i * 1.6 + side * 0.7, z: z0 + ((i * 5) % 3) * 0.45 * (side ? -1 : 1), side, phase: (i * 0.29 + side * 0.53) % 1, shell, burst });
    });
  // No fir at (-7, 7): the opening shot tracks through there and used to fly through its crown.
  scene.add(place(model(sprite(a.race, 'hq'), a, 0, 'idle0'), -3.5, 9.5), place(model(sprite(b.race, 'hq'), b, 4, 'idle0'), 4.5, -7.5));
  scene.add(place(model('resource', a, 0, 'idle'), 1.2, 1.4), place(model('resource', a, 1, 'idle'), -2.6, 0.6));
  scenery(scene, a, true, [[-9, 2], [-8.2, -2.5], [9.5, 2.2], [8.8, 0.4], [-3.5, -6.5], [7, 6.5], [-10.5, 4.5]]);
  treeline(scene, a, 70, -26, 26, -10, -24, 7);
  treeline(scene, a, 40, -26, 26, 13, 22, 11);

  // Where a unit stands at film time t: humans advance until they reach firing range, hovers sway and bob.
  const where = (u: Unit, t: number): THREE.Vector3 =>
    u.side === 0
      ? new THREE.Vector3(u.x, 0, Math.max(0.9 + (u.z - 4.2), u.z - t * 0.14))
      : new THREE.Vector3(u.x + Math.sin(t * 0.4 + u.phase * 6) * 0.25, 0.06 + Math.sin(t * 2.1 + u.phase * 9) * 0.05, u.z);
  const heavy = units[2]!;
  const shots: Shot[] = [
    // Low tracking shot along the advancing column, just above the sand.
    { seconds: 8, fov: 40, at: (k, from, to) => {
      const z = where(heavy, k * 8).z;
      from.set(-7.5 + k * 4, 0.45, z + 2.6);
      to.set(-3.5 + k * 4, 0.35, z - 0.6);
    } },
    // Hero shot: under the heavy tank's gun, looking up past it at the sky.
    { seconds: 7, fov: 34, at: (k, from, to) => {
      const p = where(heavy, 8 + k * 7);
      from.set(p.x + 2.2 - k * 0.5, 0.25, p.z - 3.1 + k * 0.5);
      to.set(p.x - 0.3, 0.75, p.z);
    } },
    // Crane shot: rising from behind the humans' base over the whole field.
    { seconds: 8, fov: 30, at: (k, from, to) => {
      from.set(2 - k * 3, 1.4 + k * 4.2, 12 - k * 2);
      to.set(0, 0.2, -1.5);
    } },
    // Behind the hovers' line, low, watching the humans come.
    { seconds: 9, fov: 36, at: (k, from, to) => {
      from.set(3.5 - k * 3, 0.65, -4.4);
      to.set(-0.5 - k * 1.5, 0.35, 2);
    } },
  ];
  const film = shots.reduce((sum, sh) => sum + sh.seconds, 0);
  const FLIGHT = 0.55;
  s.update = (clock) => {
    const t = clock % film;
    for (const u of units) {
      const p = where(u, t);
      u.group.position.copy(p);
      // Each unit fires every 2.2 s: the gun flashes, a shell flies at an enemy picked by the volley's number, then
      // bursts there.
      const cycle = t / 2.2 + u.phase;
      const k = (cycle % 1) * 2.2;
      u.show(k < 0.18 ? 1 : 0);
      const foes = units.filter((v) => v.side !== u.side);
      const target = foes[Math.floor(Math.abs(Math.sin(Math.floor(cycle) * 12.9 + u.phase * 78.2)) * foes.length)]!;
      const q = where(target, t);
      const ahead = u.side === 0 ? -1 : 1;
      // Shells fly straight and level at the gun's height, as on the map, and burst on the target's hull.
      const from = new THREE.Vector3(p.x, p.y, p.z + ahead * 0.4);
      if (k < FLIGHT) {
        u.shell.visible = true;
        u.shell.position.lerpVectors(from, q, k / FLIGHT);
        u.shell.rotation.y = Math.atan2(-(q.x - from.x), -(q.z - from.z));
      } else u.shell.visible = false;
      u.burst.at(Math.floor((k - FLIGHT) / 0.055), q.x, q.y + 0.32, q.z);
    }
    let rest = t;
    const shot = shots.find((sh) => (rest -= sh.seconds) < 0) ?? shots[shots.length - 1]!;
    const k = (rest + shot.seconds) / shot.seconds;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    shot.at(Math.min(1, Math.max(0, k)), from, to);
    if (s.camera.fov !== shot.fov) {
      s.camera.fov = shot.fov;
      s.camera.updateProjectionMatrix();
    }
    s.camera.position.copy(from);
    s.camera.lookAt(to);
    // A shell grazing the lens would fill the frame with one ring; it slips by unseen instead.
    for (const u of units) if (u.shell.visible && u.shell.position.distanceTo(from) < 1.2) u.shell.visible = false;
  };
  s.render(0);
  return s;
}

/**
 * The app icon's picture, square: a human heavy tank on the sand in front of a tall cluster of the yellow crystals,
 * firs at the sides, under the main screen's dusk sky. apps/desktop/scripts/icon.mjs scales it into the macOS shape.
 */
export async function iconScene(canvas: HTMLCanvasElement, size: number): Promise<PixelScene> {
  const [a] = CAMPAIGN;
  const s = new PixelScene(canvas, size, size, { top: '#0e0c22', mid: '#3a2846', bottom: '#b8744a', haze: '#a8785a', hill: '#3e2a3c', stars: true });
  s.frame(1);
  s.scene.add(await groundMesh('sand', 40));
  // The shard the game is named after: a cluster of tall six-sided crystals, leaning out from one root.
  for (const [x, z, h, r, lean, turn] of [
    [0.55, -0.6, 1.6, 0.24, 0.08, 0.3],
    [0.25, -0.45, 1.0, 0.18, 0.42, 0.9],
    [0.9, -0.45, 0.9, 0.16, -0.45, 0.5],
    [0.65, -0.1, 0.45, 0.12, -0.7, 1.6],
  ] as const) {
    const shard = new THREE.Group();
    // Hard facets, as on the map's crystals: every face its own flat normal.
    const facet = (g: THREE.BufferGeometry) => ((g = g.toNonIndexed()), g.computeVertexNormals(), g);
    const body = new THREE.Mesh(facet(new THREE.CylinderGeometry(r, r * 0.92, h * 0.78, 6)), material('gold', a, false, 1));
    body.position.y = h * 0.39;
    const tip = new THREE.Mesh(facet(new THREE.CylinderGeometry(0, r, h * 0.3, 6)), material('crystal', a, false, 2));
    tip.position.y = h * 0.78 + h * 0.15;
    shard.add(body, tip);
    shard.position.set(x, -0.05, z);
    shard.rotation.set(0, turn, lean);
    s.scene.add(shard);
  }
  s.scene.add(shadow(0.9, 0.6, -0.4));
  const tank = place(model(sprite(a.race, 'heavy_tank'), a, 3, 'move0'), -0.55, 0.6);
  s.scene.add(tank, shadow(0.45, -0.5, 0.6));
  for (const [x, z, v] of [[-2.0, -1.8, 0], [2.6, -1.6, 1], [-3.4, -3.5, 2], [3.6, -3.8, 3]] as const) s.scene.add(place(model('fir', a, v, 'idle'), x, z));
  treeline(s.scene, a, 30, -14, 14, -7, -14, 3);
  s.camera.fov = 40;
  s.camera.aspect = 1;
  s.camera.position.set(0.1, 0.6, 4.2);
  s.camera.lookAt(0.15, 0.75, 0);
  s.camera.updateProjectionMatrix();
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
export function portrait(dress: Dress, kind: string, size = 64): string {
  const id = `${dress.race}/${dress.color}/${dress.color2}/${dress.color3}/${kind}/${size}`;
  const hit = portraits.get(id);
  if (hit) return hit;
  const name = kind === 'resource' ? 'resource' : sprite(dress.race, kind);
  const { frame, view } = portraitFrame(kind);
  const m = model(name, dress, view, frame);
  // Frame the model: fit its bounding sphere into the view.
  const sphere = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius / Math.sin((30 * Math.PI) / 360)) * 0.8;
  const from = new THREE.Vector3(sphere.center.x + dist * 0.35, sphere.center.y + dist * 0.5, sphere.center.z + dist * 0.8);
  const url = still(m, size, from, sphere.center);
  portraits.set(id, url);
  return url;
}

/** Renders an object alone into a square still of `size` pixels, seen from `from` towards `at`: a PNG data URL. */
export function still(o: THREE.Object3D, size: number, from: THREE.Vector3, at: THREE.Vector3, fov = 30, into?: { g: CanvasRenderingContext2D; x: number }): string {
  if (!portraitCanvas || portraitScene?.w !== size) {
    portraitScene?.dispose();
    portraitCanvas = document.createElement('canvas');
    portraitScene = new PixelScene(portraitCanvas, size, size, null);
  }
  const s = portraitScene!;
  s.scene.clear();
  s.scene.add(o);
  s.camera.fov = fov;
  s.camera.aspect = 1;
  s.camera.position.copy(from);
  s.camera.lookAt(at);
  s.camera.updateProjectionMatrix();
  s.render(0);
  // Drawn into a strip of frames instead of returned on its own.
  if (into) return (into.g.drawImage(portraitCanvas, into.x, 0), '');
  return portraitCanvas.toDataURL('image/png');
}

const rampMaterials = new Map<string, THREE.ShaderMaterial>();

/**
 * A material with its own ramp (dark to light) for what the art catalog has no material for, such as skin; or, with
 * a catalog name, that material in a side's colours.
 */
export function paint(ramp: readonly string[] | MaterialName, dress: Dress, emissive = false): THREE.ShaderMaterial {
  if (typeof ramp === 'string') return material(ramp, dress);
  const id = `${ramp.join()}/${emissive}`;
  let m = rampMaterials.get(id);
  if (m) return m;
  const colors = hexes(ramp);
  m = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      ramp: { value: rampTexture(colors) },
      steps: { value: colors.length },
      shift: { value: 0 },
      emissive: { value: emissive ? 1 : 0 },
      flicker: { value: 0 },
      sun: { value: SUN },
    },
  });
  rampMaterials.set(id, m);
  return m;
}
