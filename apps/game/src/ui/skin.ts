import { TEAM_COLORS, type Race, type TeamColor } from '@sw/data';
import { alpha, mix, Pixels, type Color } from './pixels';

/**
 * The pixel interface per race, tinted in a side's colours: humans get riveted steel plates, hovers smooth dark glass
 * with a glowing edge, walkers lumpy chitin with thorns at the corners. Frames and buttons are 9-slice images drawn
 * here pixel by pixel and handed to CSS as `border-image` custom properties on the element that wears the skin, so
 * each half of a split screen can wear its own player's.
 */

/** Image pixels per art pixel in the generated images; CSS shows one art pixel as `--u` (2 CSS px). */
const SCALE = 4;
/** Corner size of a panel frame and of a button, in art pixels. */
export const FRAME = 6;
export const BUTTON = 3;

export type ButtonState = 'normal' | 'hover' | 'down' | 'on' | 'primary' | 'disabled';
const STATES: ButtonState[] = ['normal', 'hover', 'down', 'on', 'primary', 'disabled'];

export interface Skin {
  race: Race;
  frame: string;
  buttons: Record<ButtonState, string>;
  /** Text colour on a primary button, dark or light depending on the team colour. */
  primaryInk: string;
  /** Bright accent for headings and selected things: the light step of the team ramp. */
  accent: string;
  /** Secondary colour, light step. */
  accent2: string;
}

/** Distances from a pixel to the four edges of a w×h canvas, and which edge is nearest. */
function edges(x: number, y: number, w: number, h: number) {
  const l = x;
  const t = y;
  const r = w - 1 - x;
  const b = h - 1 - y;
  const d = Math.min(l, t, r, b);
  // Light falls from the top left: top and left edges are lit, bottom and right in shade.
  const lit = d === t || d === l ? !(d === b || d === r) || t + l < b + r : false;
  return { l, t, r, b, d, lit };
}

const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

// Humans ------------------------------------------------------------------------------------------------------------

const STEEL = { outline: '#0c0c0d', light: '#a4a7ab', mid: '#6b6e73', dark: '#3d3f43', deep: '#141518', fill: '#202226' };

/** A riveted corner plate, its top-left pixel at (x, y), lit from the top left whichever corner it sits in. */
function rivetPlate(p: Pixels, x: number, y: number, n: number): void {
  p.rect(x, y, n, n, '#7c7f85');
  p.rect(x, y, n, 1, '#b9bcc0').rect(x, y, 1, n, '#b9bcc0');
  p.rect(x, y + n - 1, n, 1, '#45474b').rect(x + n - 1, y, 1, n, '#45474b');
  const c = x + (n >> 1) - 1;
  const r = y + (n >> 1) - 1;
  p.px(c, r, '#eceef0').px(c + 1, r, '#9a9da2').px(c, r + 1, '#9a9da2').px(c + 1, r + 1, '#26272a');
}

function humanFrame(team: string[]): Pixels {
  const n = FRAME * 3;
  const p = new Pixels(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { d, lit, t } = edges(x, y, n, n);
      const c: Color =
        d === 0 ? STEEL.outline : d === 1 ? (lit ? STEEL.light : STEEL.dark) : d === 2 ? STEEL.mid : d === 3 ? (t === 3 ? team[2]! : team[1]!) : d === 4 ? STEEL.deep : alpha(STEEL.fill, 0.94);
      p.px(x, y, c);
    }
  for (const [x, y] of [
    [1, 1],
    [n - 6, 1],
    [1, n - 6],
    [n - 6, n - 6],
  ] as const)
    rivetPlate(p, x, y, 5);
  return p;
}

function humanButton(state: ButtonState, team: string[]): Pixels {
  const n = BUTTON * 3;
  const p = new Pixels(n, n);
  const face = { normal: '#3a3c40', hover: '#46494e', down: '#2b2d30', on: team[1]!, primary: team[2]!, disabled: '#28292c' }[state];
  const hi = { normal: '#8d9095', hover: team[3]!, down: '#1c1d20', on: team[3]!, primary: team[4]!, disabled: '#36383b' }[state];
  const lo = { normal: '#1f2023', hover: '#24262a', down: '#6b6e73', on: team[0]!, primary: team[0]!, disabled: '#36383b' }[state];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { d, lit } = edges(x, y, n, n);
      p.px(x, y, d === 0 ? STEEL.outline : d === 1 ? (lit ? hi : lo) : face);
    }
  // Two bolt heads on the top corners of every human button.
  if (state !== 'disabled') p.px(2, 2, hi).px(n - 3, 2, hi);
  return p;
}

// Hovers ------------------------------------------------------------------------------------------------------------

const GLASS = 'rgba(6, 14, 22, 0.86)';

function hoverFrame(team: string[], second: string[]): Pixels {
  const n = FRAME * 3;
  const p = new Pixels(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { l, t, r, b, d } = edges(x, y, n, n);
      // Corners cut at 45°: the edge line follows the cut.
      const cut = Math.min(l + t, t + r, r + b, b + l);
      if (cut < 3) continue;
      const k = Math.min(d, cut - 3);
      p.px(x, y, k === 0 ? team[3]! : k === 1 ? alpha(team[2]!, 0.55) : k === 2 ? alpha(team[2]!, 0.22) : GLASS);
    }
  // A glint where the light catches the top-left cut, and secondary-colour ticks along the corners.
  p.px(1, 2, team[4]!).px(2, 1, team[4]!);
  for (const [x, y, dx, dy] of [
    [4, 0, 1, 0],
    [n - 5, 0, -1, 0],
    [4, n - 1, 1, 0],
    [n - 5, n - 1, -1, 0],
    [0, 4, 0, 1],
    [n - 1, 4, 0, 1],
    [0, n - 5, 0, -1],
    [n - 1, n - 5, 0, -1],
  ] as const)
    for (let i = 0; i < 2; i++) p.px(x + dx * i, y + dy * i, second[3]!);
  return p;
}

function hoverButton(state: ButtonState, team: string[]): Pixels {
  const n = BUTTON * 3;
  const p = new Pixels(n, n);
  const edge = { normal: team[2]!, hover: team[4]!, down: team[3]!, on: team[4]!, primary: team[4]!, disabled: '#2c3a44' }[state];
  const glow = { normal: alpha(team[2]!, 0.25), hover: alpha(team[3]!, 0.45), down: alpha(team[1]!, 0.6), on: alpha(team[3]!, 0.55), primary: team[3]!, disabled: 'rgba(30, 40, 48, 0.5)' }[state];
  const face = { normal: 'rgba(8, 18, 28, 0.9)', hover: 'rgba(12, 26, 38, 0.92)', down: alpha(team[0]!, 0.9), on: alpha(team[1]!, 0.85), primary: team[2]!, disabled: 'rgba(8, 14, 20, 0.7)' }[state];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { l, t, r, b, d } = edges(x, y, n, n);
      const cut = Math.min(l + t, t + r, r + b, b + l);
      if (cut < 1) continue;
      const k = Math.min(d, cut - 1);
      p.px(x, y, k === 0 ? edge : k === 1 ? glow : face);
    }
  return p;
}

// Walkers -----------------------------------------------------------------------------------------------------------

const CHITIN = { outline: '#0a0508', fill: '#1b1016', face: '#2a1820' };

/**
 * The top-left corner of a walker frame: a thorn growing out of the membrane towards the corner. `o` outline,
 * `m` membrane, `t` body, `T` light, `w` the pale tip.
 */
const THORN = ['w.....', 'TTo...', '.tTmo.', '.omtmo', '..mmmm', '..om..'];
/** Extra thickness of the membrane along each edge tile: a lump in the middle. */
const LUMP = [0, 1, 2, 2, 1, 0];

function walkerFrame(team: string[]): Pixels {
  const n = FRAME * 3;
  const p = new Pixels(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { d, t, l, b } = edges(x, y, n, n);
      const along = d === t || d === b ? x : y;
      const membrane = 2 + LUMP[along % FRAME]!;
      const c: Color =
        d === 0 ? CHITIN.outline
        : d < membrane ? (d === 1 && (t === 1 || l === 1) ? team[3]! : d === membrane - 1 ? team[1]! : team[2]!)
        : d === membrane ? CHITIN.outline
        : alpha(CHITIN.fill, 0.93);
      p.px(x, y, c);
    }
  const colors = { o: CHITIN.outline, m: team[2]!, t: team[3]!, T: team[4]!, w: '#fff8e6' };
  const corner = new Pixels(FRAME, FRAME).bitmap(0, 0, THORN, colors);
  const g = p.canvas.getContext('2d')!;
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    g.save();
    g.translate(sx > 0 ? 0 : n, sy > 0 ? 0 : n);
    g.scale(sx, sy);
    g.clearRect(0, 0, 2, 2);
    g.drawImage(corner.canvas, 0, 0);
    g.restore();
  }
  return p;
}

function walkerButton(state: ButtonState, team: string[]): Pixels {
  const n = BUTTON * 3;
  const p = new Pixels(n, n);
  const rim = { normal: team[1]!, hover: team[2]!, down: team[0]!, on: team[3]!, primary: team[3]!, disabled: '#3a2630' }[state];
  const face = { normal: CHITIN.face, hover: '#341e28', down: '#1c0f15', on: team[1]!, primary: team[2]!, disabled: '#1e1217' }[state];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const { l, t, r, b, d } = edges(x, y, n, n);
      // Rounded: the corner pixel is empty and the rim bends round it.
      const corner = Math.min(l + t, t + r, r + b, b + l);
      if (corner === 0) continue;
      p.px(x, y, d === 0 || corner === 1 ? CHITIN.outline : d === 1 ? rim : face);
    }
  // A barb on the top-left corner.
  if (state !== 'disabled') p.px(1, 0, rim).px(0, 1, rim);
  return p;
}

// ------------------------------------------------------------------------------------------------------------------

const cache = new Map<string, Skin>();

export function skin(race: Race, color: TeamColor, color2: TeamColor): Skin {
  const id = `${race}/${color}/${color2}`;
  let s = cache.get(id);
  if (s) return s;
  const team = [...TEAM_COLORS[color]];
  const second = [...TEAM_COLORS[color2]];
  const frame = race === 'human' ? humanFrame(team) : race === 'hover' ? hoverFrame(team, second) : walkerFrame(team);
  const button = (st: ButtonState) => (race === 'human' ? humanButton(st, team) : race === 'hover' ? hoverButton(st, team) : walkerButton(st, team));
  s = {
    race,
    frame: frame.url(SCALE),
    buttons: Object.fromEntries(STATES.map((st) => [st, button(st).url(SCALE)])) as Record<ButtonState, string>,
    primaryInk: luminance(team[2]!) > 140 ? '#14110c' : '#fff8e6',
    // Very dark ramps (black, crimson) would vanish as text on the dark panels: lift them towards white.
    accent: luminance(team[3]!) < 90 ? mix(team[3]!, '#ffffff', 0.45) : team[3]!,
    accent2: luminance(second[3]!) < 90 ? mix(second[3]!, '#ffffff', 0.45) : second[3]!,
  };
  cache.set(id, s);
  return s;
}

/** Dresses an element (and everything inside it) in a skin, through CSS custom properties. */
export function applySkin(el: HTMLElement, s: Skin): void {
  el.dataset.race = s.race;
  el.style.setProperty('--frame', `url(${s.frame})`);
  for (const st of STATES) el.style.setProperty(`--btn-${st}`, `url(${s.buttons[st]})`);
  el.style.setProperty('--ink-primary', s.primaryInk);
  el.style.setProperty('--accent', s.accent);
  el.style.setProperty('--accent2', s.accent2);
}

/** CSS numbers for border-image-slice: corner sizes in image pixels. */
export const FRAME_SLICE = FRAME * SCALE;
export const BUTTON_SLICE = BUTTON * SCALE;
