import { TEAM_COLORS, type Race, type TeamColor } from '@sw/data';
import { alpha, Pixels } from './pixels';

/**
 * Mouse cursors: the pointer in the style and colours of the player's race, and the same thin, animated map cursors
 * for every race: "select" over your own things, "move", "attack", "harvest", "not here", and an arrow for each of
 * the 8 directions the screen edge scrolls. Drawn 32 pixels square with one-pixel lines and a dark outline; each has
 * CURSOR_FRAMES frames, shown CURSOR_FRAME_MS apart by whoever sets the cursor.
 */

export type CursorKind = 'normal' | 'select' | 'move' | 'attack' | 'harvest' | 'forbidden' | 'scroll';
export const CURSOR_KINDS: CursorKind[] = ['normal', 'select', 'move', 'attack', 'harvest', 'forbidden', 'scroll'];
export const CURSOR_FRAMES = 8;
export const CURSOR_FRAME_MS = 110;

const N = 32;
const C = 16;

/**
 * Shapes are drawn as character grids, each character a colour of the cursor's palette; afterwards every empty pixel
 * touching a drawn one becomes the dark outline `o`. The map cursors lie flat on the ground, squashed like it.
 */
type Grid = string[][];

const blank = (): Grid => Array.from({ length: N }, () => Array<string>(N).fill('.'));

function dot(g: Grid, x: number, y: number, ch: string): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < N && y < N) g[y]![x] = ch;
}

/** A one-pixel line. */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) dot(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ch);
}

/** Fills a polygon (pixel centres inside it) with `ch`. */
function fill(g: Grid, pts: [number, number][], ch: string): void {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) g[y]![x] = ch;
    }
}

/** The edges of a polygon as one-pixel lines. */
function edges(g: Grid, pts: [number, number][], ch: string): void {
  pts.forEach(([x, y], i) => {
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    line(g, x, y, x1, y1, ch);
  });
}

/** A flat one-pixel ellipse round the centre; `keep(angle)` picks the arcs drawn (degrees, 0 = east, clockwise). */
function ring(g: Grid, rx: number, ry: number, ch: string, keep: (a: number) => boolean = () => true, cy = C): void {
  for (let a = 0; a < 360; a += 0.5) if (keep(a)) dot(g, C - 0.5 + rx * Math.cos((a * Math.PI) / 180), cy - 0.5 + ry * Math.sin((a * Math.PI) / 180), ch);
}

/** Turns the grid into rows, with the dark outline round everything drawn. */
function outlined(g: Grid): string[] {
  const drawn = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g[y]![x] !== '.' && g[y]![x] !== 'o';
  return g.map((row, y) =>
    row.map((ch, x) => (ch === '.' && [drawn(x - 1, y), drawn(x + 1, y), drawn(x, y - 1), drawn(x, y + 1)].some(Boolean) ? 'o' : ch)).join(''),
  );
}

/** Angular distance between two angles in degrees. */
const apart = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

/**
 * The race's pointer, its tip at the top left. Humans: a machined dart with a glint running along its edge. Hovers: a
 * glass blade with a glowing rim that breathes. Walkers: a hooked talon with a pulse running along its vein.
 */
function pointer(race: Race, f: number): string[] {
  const g = blank();
  const t = f / CURSOR_FRAMES;
  if (race === 'human') {
    const dart: [number, number][] = [[1, 1], [19, 9], [11, 11], [9, 19]];
    fill(g, dart, 'a');
    edges(g, dart, 'b');
    line(g, 3, 3, 10, 10, 'c');
    // The glint: a white pixel and its tail sliding down the top edge.
    for (let k = 0; k < 3; k++) {
      const s = (t * 1.4 - k * 0.05) % 1;
      if (s >= 0 && s < 1) dot(g, 1 + 18 * s, 1 + 8 * s, k === 0 ? 'w' : 'b');
    }
  } else if (race === 'hover') {
    const blade: [number, number][] = [[1, 1], [21, 11], [12, 12], [11, 21]];
    fill(g, blade, 'a');
    edges(g, blade, f % 4 < 2 ? 'c' : 'b');
    line(g, 5, 5, 12, 12, 'w');
  } else {
    // A hooked talon: a crescent sweeping from the tip, its vein lit by a running bead.
    const talon: [number, number][] = [[1, 1], [9, 2], [15, 6], [18, 12], [17, 18], [14, 12], [9, 8], [4, 9]];
    fill(g, talon, 'a');
    edges(g, talon, 'c');
    line(g, 6, 5, 11, 6, 'b');
    line(g, 11, 6, 15, 11, 'b');
    const s = t < 0.5 ? t * 2 : 2 - t * 2;
    dot(g, 6 + 9 * s, 5 + 6 * s, 'w');
  }
  return outlined(g);
}

/** Map cursors, the same for every race. */
function ground(kind: CursorKind, f: number): string[] {
  const g = blank();
  const t = f / CURSOR_FRAMES;
  const wave = Math.sin(t * Math.PI * 2);
  if (kind === 'select') {
    // Four brackets of a flat ring that breathe in and out.
    const r = 12 + wave;
    ring(g, r, r * 0.58, 'w', (a) => apart(a % 90, 45) < 20);
    dot(g, C - 0.5, C - 0.5, 'w');
  } else if (kind === 'move') {
    // A ring that keeps closing in on the spot, and a diamond on it.
    const r = 13 - 6 * t;
    ring(g, r, r * 0.55, t < 0.75 ? 'g' : 'G');
    ring(g, 4, 2.2, 'g');
    dot(g, C - 0.5, C - 0.5, 'w');
  } else if (kind === 'attack') {
    // A broken ring turning, with four ticks closing in on a white centre.
    const spin = t * 90;
    ring(g, 12, 7, 'r', (a) => apart(a, spin) > 18 && apart(a, spin + 90) > 18 && apart(a, spin + 180) > 18 && apart(a, spin + 270) > 18);
    const k = 2 * (1 - Math.abs(wave));
    line(g, 1 + k, C - 0.5, 6 + k, C - 0.5, 'r');
    line(g, N - 2 - k, C - 0.5, N - 7 - k, C - 0.5, 'r');
    line(g, C - 0.5, 6 + k * 0.6, C - 0.5, 10 + k * 0.6, 'r');
    line(g, C - 0.5, N - 7 - k * 0.6, C - 0.5, N - 11 - k * 0.6, 'r');
    dot(g, C - 0.5, C - 0.5, 'w');
  } else if (kind === 'harvest') {
    // A gold ring under a crystal that bobs over it.
    ring(g, 12, 6.5, 'Y', (a) => apart(a, 270) > 30, C + 4);
    const y = 4 + Math.round(wave);
    fill(g, [[C, y], [C + 4.5, y + 6], [C, y + 13], [C - 4.5, y + 6]], 'y');
    line(g, C - 1.5, y + 3, C - 1.5, y + 9, 'w');
  } else if (kind === 'forbidden') {
    ring(g, 12, 7, 'r');
    line(g, 7, 23, 25, 9, f % 4 < 2 ? 'r' : 'R');
  }
  return outlined(g);
}

/** Scroll arrow: a stemless double chevron pointing along a direction (0 = north, clockwise in 45° steps), sliding. */
function scroll(i: number, f: number): { rows: string[]; hot: [number, number] } {
  const g = blank();
  const a = (i * Math.PI) / 4;
  const k = i % 2 ? 0.8 : 1;
  const turn = ([x, y]: [number, number]): [number, number] => {
    const dx = (x - C) * k;
    const dy = (y - C) * k;
    return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const slide = -Math.round((f / CURSOR_FRAMES) * 4);
  const chevron = (oy: number, ch: string) => {
    const pts = ([[C - 9, 13 + oy], [C, 4 + oy], [C + 9, 13 + oy]] as [number, number][]).map(turn);
    line(g, ...pts[0]!, ...pts[1]!, ch);
    line(g, ...pts[1]!, ...pts[2]!, ch);
  };
  chevron(4 + slide, 'w');
  chevron(10 + slide, 'b');
  const [hx, hy] = turn([C, 4]);
  return { rows: outlined(g), hot: [Math.round(hx), Math.round(hy)] };
}

/** Scroll directions clockwise from north, as in the sprites. */
export const SCROLL_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type ScrollDir = (typeof SCROLL_DIRS)[number];

/** The pointer's colours from the race and its team colour; a soft halo outside the outline for the hovers' glow. */
function inks(race: Race, color: TeamColor, f: number): { a: string; b: string; c: string; halo: string | null } {
  const t = TEAM_COLORS[color];
  if (race === 'human') return { a: '#5c6066', b: '#e6e8ea', c: t[2]!, halo: null };
  if (race === 'hover') return { a: alpha(t[1]!, 0.55), b: t[3]!, c: t[4]!, halo: alpha(t[3]!, 0.18 + 0.2 * Math.abs(Math.sin((f / CURSOR_FRAMES) * Math.PI))) };
  return { a: t[1]!, b: t[3]!, c: t[2]!, halo: null };
}

/** Pixels next to an outline pixel that are still empty get the halo. */
function halo(p: Pixels, rows: readonly string[], color: string): void {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (at(x, y) !== '.') continue;
      if ([at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].includes('o')) p.px(x, y, color);
    }
}

/** Fixed colours of the map cursors: white, greens, reds and golds, the same on every side. */
const SIGNAL = { w: '#fff8e8', b: '#b8bcc0', g: '#8af06a', G: '#4a9a3a', r: '#ff5a3a', R: '#a02818', y: '#f0c43a', Y: '#c09018' };

const cache = new Map<string, string>();

/** A CSS cursor value: the race and team colour only change the pointer; `dir` picks the scroll arrow. */
export function cursorCss(race: Race, color: TeamColor, kind: CursorKind, dir: ScrollDir = 'n', frame = 0): string {
  const f = ((frame % CURSOR_FRAMES) + CURSOR_FRAMES) % CURSOR_FRAMES;
  const id = kind === 'normal' ? `${race}/${color}/normal/${f}` : `${kind}/${dir}/${f}`;
  const hit = cache.get(id);
  if (hit) return hit;
  let rows: readonly string[];
  let hot: [number, number] = [C, C];
  const p = new Pixels(N, N);
  let colors: Record<string, string> = { o: '#0a0806', ...SIGNAL };
  if (kind === 'normal') {
    const ink = inks(race, color, f);
    rows = pointer(race, f);
    hot = [1, 1];
    colors = { ...colors, a: ink.a, b: ink.b, c: ink.c };
    if (ink.halo) halo(p, rows, ink.halo);
  } else if (kind === 'scroll') ({ rows, hot } = scroll(SCROLL_DIRS.indexOf(dir), f));
  else rows = ground(kind, f);
  p.bitmap(0, 0, rows, colors);
  // One image pixel per screen point, two on Retina; both crisp.
  const css = `-webkit-image-set(url(${p.url(1)}) 1x, url(${p.url(2)}) 2x) ${hot[0]} ${hot[1]}, ${kind === 'normal' ? 'default' : 'crosshair'}`;
  cache.set(id, css);
  return css;
}

/** The cursor bitmap itself (the Retina one), for the studio. */
export function cursorImage(race: Race, color: TeamColor, kind: CursorKind, dir: ScrollDir = 'n', frame = 0): string {
  return [...cursorCss(race, color, kind, dir, frame).matchAll(/url\((.*?)\)/g)].at(-1)![1]!;
}

/** The frame of an animated cursor to show now. */
export const cursorFrame = (now = performance.now()) => Math.floor(now / CURSOR_FRAME_MS) % CURSOR_FRAMES;
