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

const ARROW = [
  'o...............',
  'oo..............',
  'obo.............',
  'obbo............',
  'obaao...........',
  'obaaao..........',
  'obaaaao.........',
  'obaaaaao........',
  'obaaaaaao.......',
  'obaaaaaaao......',
  'obaaaoooooo.....',
  'obaoaco.........',
  'oboooaco........',
  'oo...oaco.......',
  '......oo........',
];
/** The walkers' pointer has a barb on its back. */
const ARROW_WALKER = ARROW.map((r, i) => (i === 7 ? 'obaaaaaoo.......' : i === 8 ? 'obaaaaaaoc......' : r));

const SELECT = [
  'oooo........oooo',
  'occo........occo',
  'oco..........oco',
  'oo............oo',
  '................',
  '................',
  '................',
  '.......oo.......',
  '.......oo.......',
  '................',
  '................',
  '................',
  'oo............oo',
  'oco..........oco',
  'occo........occo',
  'oooo........oooo',
];

const MOVE = [
  '.......oo.......',
  '......ocdo......',
  '.......cd.......',
  '................',
  '................',
  '................',
  '.o...........o..',
  'ocd...oo....dco.',
  'odc...oo....cdo.',
  '.o...........o..',
  '................',
  '................',
  '................',
  '.......cd.......',
  '......ocdo......',
  '.......oo.......',
];

const ATTACK = [
  '......oooo......',
  '....oorccroo....',
  '...orr.cc.rro...',
  '..or...cc...ro..',
  '.or....oo....ro.',
  '.or..........ro.',
  'orc..........cro',
  'occcoo.oo.oocccr',
  'occcoo.oo.oocccr',
  'orc..........cro',
  '.or..........ro.',
  '.or....oo....ro.',
  '..or...cc...ro..',
  '...orr.cc.rro...',
  '....oorccroo....',
  '......oooo......',
];

const HARVEST = [
  '.......o........',
  '......oyo.......',
  '.....oyyyo......',
  '....owyyyyo.....',
  '....owyyyYo.....',
  '...owyyyyYYo....',
  '...owyyyyYYo....',
  '...owyyyyYYo....',
  '...owyyyyYYo....',
  '....owyyyYo.....',
  '....owyyyYo.....',
  '.....oyyYo......',
  '......oYo.......',
  '.......o........',
];

const FORBIDDEN = [
  '.....oooooo.....',
  '...oorrrrrroo...',
  '..orrooooooro...',
  '.orro......rro..',
  '.oro......orro..',
  'orro.....orrro..',
  'oro.....orro.ro.',
  'oro....orro..ro.',
  'oro...orro...ro.',
  'oro..orro...oro.',
  '.ororro.....oro.',
  '.orrro.....orro.',
  '..orooooooorro..',
  '...oorrrrrroo...',
  '.....oooooo.....',
];

const SCROLL = [
  '.......oo.......',
  '......obbo......',
  '.....obaabo.....',
  '....obaaaabo....',
  '...obaaaaaabo...',
  '..ooooaaaaoooo..',
  '.....oaaaao.....',
  '.....oaaaao.....',
  '.....oooooo.....',
];
const SCROLL_DIAGONAL = [
  '.....ooooooo....',
  '......obbbbo....',
  '.......oaabo....',
  '......oaaabo....',
  '.....oaaaabo....',
  '....oaaaooao....',
  '...oaaao..oo....',
  '...ooao.........',
  '....oo..........',
];

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
  const colors = { o: '#0a0806', a: ink.a, b: ink.b, c: ink.c, d: '#2a6a1a', r: '#e0352a', y: '#f0c43a', Y: '#a87a12', w: '#fff4b0' };
  let rows: readonly string[] = ARROW;
  let hot: [number, number] = [0, 0];
  let tint: Partial<Record<string, string>> = {};
  if (kind === 'normal') rows = race === 'walker' ? ARROW_WALKER : ARROW;
  else if (kind === 'select') (rows = SELECT), (hot = [8, 8]), (tint = { c: ink.b });
  else if (kind === 'move') (rows = MOVE), (hot = [8, 8]), (tint = { c: '#9dff7a' });
  else if (kind === 'attack') (rows = ATTACK), (hot = [8, 8]), (tint = { c: '#ff6a4a' });
  else if (kind === 'harvest') (rows = HARVEST), (hot = [8, 7]);
  else if (kind === 'forbidden') (rows = FORBIDDEN), (hot = [8, 7]);
  let p = new Pixels(N, N);
  if (ink.halo) halo(p, rows, 0, 0, ink.halo);
  p.bitmap(0, 0, rows, { ...colors, ...tint });
  if (kind === 'scroll') {
    const i = SCROLL_DIRS.indexOf(dir);
    const base = new Pixels(N, N);
    const shape = i % 2 ? SCROLL_DIAGONAL : SCROLL;
    if (ink.halo) halo(base, shape, i % 2 ? 2 : 0, 3, ink.halo);
    base.bitmap(i % 2 ? 2 : 0, 3, shape, colors);
    p = base.rotated(Math.floor(i / 2));
    // The point of the arrow, rotated with it.
    const tips: [number, number][] = [[8, 3], [13, 3], [12, 8], [12, 13], [8, 12], [3, 12], [3, 8], [3, 3]];
    hot = tips[i]!;
  }
  const css = `url(${p.url(SCALE)}) ${hot[0] * SCALE} ${hot[1] * SCALE}, ${kind === 'normal' ? 'default' : 'crosshair'}`;
  cache.set(id, css);
  return css;
}

/** The cursor bitmap itself, for the studio. */
export function cursorImage(race: Race, color: TeamColor, kind: CursorKind, dir: ScrollDir = 'n'): string {
  return /url\((.*?)\)/.exec(cursorCss(race, color, kind, dir))![1]!;
}
