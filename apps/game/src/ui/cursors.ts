import { TEAM_COLORS, type Race, type TeamColor } from '@sw/data';
import { alpha, Pixels } from './pixels';

/**
 * Mouse cursors in the style of the player's race: the pointer, "select" over your own things, "move", "attack",
 * "harvest", "not here", and an arrow for each of the 8 directions the screen edge scrolls. Drawn 16 art pixels
 * square at 2 image pixels each; returned as CSS `cursor` values.
 */

export type CursorKind = 'normal' | 'select' | 'move' | 'attack' | 'harvest' | 'forbidden' | 'scroll';
export const CURSOR_KINDS: CursorKind[] = ['normal', 'select', 'move', 'attack', 'harvest', 'forbidden', 'scroll'];

const SCALE = 2;
const N = 16;

/**
 * Shapes are drawn as character grids: `a` fill, `b` highlight, `c` accent, `r`/`g`/`y`/`Y`/`w` fixed signal colours,
 * then every empty pixel touching a filled one becomes the dark outline `o`. The pointer is a notched dart with no
 * stem; the cursors that point at the map lie flat on it, squashed like the ground seen at an angle.
 */
type Grid = string[][];

const blank = (): Grid => Array.from({ length: N }, () => Array<string>(N).fill('.'));

/** Fills a polygon (pixel centres inside it) with `ch`. */
function polygon(g: Grid, pts: [number, number][], ch: string): void {
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

/** A flat ring round (8, 8): the ground seen at an angle. `keep(angle)` picks the arcs drawn. */
function ring(g: Grid, rx: number, ry: number, ch: string, keep: (a: number) => boolean = () => true): void {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - 8) / rx;
      const dy = (y + 0.5 - 8) / ry;
      const r = Math.hypot(dx, dy);
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (Math.abs(r - 1) < 0.5 / Math.min(rx, ry) + 0.06 && keep((a + 360) % 360)) g[y]![x] = ch;
    }
}

function dot(g: Grid, x: number, y: number, ch: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) g[y]![x] = ch;
}

/** Turns the grid into rows, with the dark outline round everything drawn. */
function outlined(g: Grid): string[] {
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g[y]![x] !== '.' && g[y]![x] !== 'o';
  return g.map((row, y) =>
    row.map((ch, x) => (ch === '.' && [filled(x - 1, y), filled(x + 1, y), filled(x, y - 1), filled(x, y + 1)].some(Boolean) ? 'o' : ch)).join(''),
  );
}

/** The pointer: a notched dart, lit along its top edge, with a team-coloured spine. Walkers' has a barb. */
function pointer(race: Race): string[] {
  const g = blank();
  polygon(g, [[0, 0], [12, 5], [6.5, 6.5], [5, 12]], 'a');
  for (let i = 1; i < 10; i++) dot(g, i, Math.floor(i * 0.42), 'b');
  for (let i = 1; i < 10; i++) dot(g, Math.floor(i * 0.42), i, 'b');
  for (let i = 1; i < 6; i++) dot(g, i + 1, i + 1, 'c');
  if (race === 'walker') polygon(g, [[9, 6.2], [12.5, 9.5], [8, 7.6]], 'c');
  if (race === 'hover') dot(g, 3, 3, 'w');
  return outlined(g);
}

function ground(kind: CursorKind): string[] {
  const g = blank();
  if (kind === 'select') {
    // Four corner arcs of a flat ring and a dot in the middle.
    ring(g, 7, 4.2, 'c', (a) => Math.abs((a % 90) - 45) < 24);
    dot(g, 8, 8, 'b');
  } else if (kind === 'move') {
    ring(g, 6.5, 3.8, 'c');
    polygon(g, [[8, 5.6], [10.2, 8], [8, 10.4], [5.8, 8]], 'b');
  } else if (kind === 'attack') {
    ring(g, 6.5, 3.9, 'r', (a) => [0, 90, 180, 270].every((c) => Math.min(Math.abs(a - c), 360 - Math.abs(a - c)) > 14));
    for (const [x, y] of [[0, 8], [1, 8], [14, 8], [15, 8], [8, 2], [8, 3], [8, 13], [8, 14]] as const) dot(g, x, y, 'r');
    dot(g, 8, 8, 'w');
  } else if (kind === 'harvest') {
    ring(g, 6.5, 3.4, 'Y', (a) => a < 160 || a > 200);
    polygon(g, [[8, 1], [11, 5], [8, 10], [5, 5]], 'y');
    for (let y = 2; y < 9; y++) dot(g, 7, y, 'w');
  } else if (kind === 'forbidden') {
    ring(g, 6.5, 4, 'r');
    polygon(g, [[3.5, 10], [4.5, 11], [12.5, 6], [11.5, 5]], 'r');
  }
  return outlined(g);
}

/** Scroll arrow: a stemless double chevron pointing along a direction (0 = north, clockwise in 45° steps). */
function scroll(i: number): { rows: string[]; hot: [number, number] } {
  const g = blank();
  const a = (i * Math.PI) / 4;
  // Diagonal arrows are drawn a little smaller so their wings stay inside the 16 pixels.
  const k = i % 2 ? 0.74 : 1;
  const turn = ([x, y]: [number, number]): [number, number] => {
    const dx = (x - 8) * k;
    const dy = (y - 8) * k;
    return [8 + dx * Math.cos(a) - dy * Math.sin(a), 8 + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const chevron = (oy: number, ch: string) =>
    polygon(g, ([[8, 1 + oy], [14, 7 + oy], [12, 9 + oy], [8, 5 + oy], [4, 9 + oy], [2, 7 + oy]] as [number, number][]).map(turn), ch);
  chevron(0, 'b');
  chevron(5, 'a');
  const [hx, hy] = turn([8, 2]);
  return { rows: outlined(g), hot: [Math.round(hx), Math.round(hy)] };
}

/** Scroll directions clockwise from north, as in the sprites. */
export const SCROLL_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type ScrollDir = (typeof SCROLL_DIRS)[number];

interface RaceInk {
  a: string;
  b: string;
  c: string;
  /** A soft halo outside the outline (hovers glow). */
  halo: string | null;
}

function inks(race: Race, color: TeamColor): RaceInk {
  const t = TEAM_COLORS[color];
  if (race === 'human') return { a: '#9a9da2', b: '#eceef0', c: t[2]!, halo: null };
  if (race === 'hover') return { a: alpha(t[1]!, 0.8), b: t[4]!, c: t[3]!, halo: alpha(t[3]!, 0.35) };
  return { a: t[2]!, b: t[3]!, c: '#fff8e6', halo: null };
}

/** Pixels next to an outline pixel that are still empty get the halo. */
function halo(p: Pixels, rows: readonly string[], x0: number, y0: number, color: string): void {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  for (let y = -1; y <= rows.length; y++)
    for (let x = -1; x <= N; x++) {
      if (at(x, y) !== '.') continue;
      if ([at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].includes('o')) p.px(x0 + x, y0 + y, color);
    }
}

const cache = new Map<string, string>();

/** A CSS cursor value for a race in its team colour; `dir` picks the scroll arrow. */
export function cursorCss(race: Race, color: TeamColor, kind: CursorKind, dir: ScrollDir = 'n'): string {
  const id = `${race}/${color}/${kind}/${dir}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const ink = inks(race, color);
  const colors = { o: '#0a0806', a: ink.a, b: ink.b, c: ink.c, r: '#ff5a3a', y: '#f0c43a', Y: '#a87a12', w: '#fff4d0' };
  let rows: readonly string[];
  let hot: [number, number] = [8, 8];
  let tint: Partial<Record<string, string>> = {};
  if (kind === 'normal') (rows = pointer(race)), (hot = [0, 0]);
  else if (kind === 'scroll') ({ rows, hot } = scroll(SCROLL_DIRS.indexOf(dir)));
  else {
    rows = ground(kind);
    if (kind === 'move') tint = { c: '#9dff7a', b: '#e8ffd8' };
    if (kind === 'select') tint = { c: ink.b, b: ink.c };
  }
  const p = new Pixels(N, N);
  if (ink.halo) halo(p, rows, 0, 0, ink.halo);
  p.bitmap(0, 0, rows, { ...colors, ...tint });
  const css = `url(${p.url(SCALE)}) ${hot[0] * SCALE} ${hot[1] * SCALE}, ${kind === 'normal' ? 'default' : 'crosshair'}`;
  cache.set(id, css);
  return css;
}

/** The cursor bitmap itself, for the studio. */
export function cursorImage(race: Race, color: TeamColor, kind: CursorKind, dir: ScrollDir = 'n'): string {
  return /url\((.*?)\)/.exec(cursorCss(race, color, kind, dir))![1]!;
}
