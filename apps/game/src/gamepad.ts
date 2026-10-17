import type { PlayerPanel } from './hud';
import type { View } from './view';

/** Buttons of the browser's "standard" gamepad layout (Xbox, PlayStation and Switch Pro pads on a Mac). */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

const DEADZONE = 0.2;
/** Cursor speed at full stick, screen pixels per second. */
const CURSOR_SPEED = 750;
const SCROLL_SPEED = 900;
/** The cursor pushes the camera along when it gets this close to the view's edge. */
const EDGE = 28;
/** Map pixels of slack when picking with the cursor: a stick is less precise than a mouse. */
const SLACK = 3;

export interface PadHooks {
  /** Start: begins the game on the briefing, pauses during play. */
  startOrPause(): void;
  /** Whether orders may be given (started, not paused, not over). */
  playing(): boolean;
}

/** What one gamepad drives: a view and that player's panel. */
export interface PadSeat {
  view: View;
  panel: PlayerPanel;
}

interface PadState {
  seat: PadSeat;
  buttons: boolean[];
  /** Cursor in screen pixels. */
  sx: number;
  sy: number;
  /** A held: where the box started, in map pixels and on screen. */
  box: { x: number; y: number; sx: number; sy: number } | null;
}

const axis = (v: number | undefined) => (v === undefined || Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

/**
 * Reads the connected gamepads every frame and turns them into a cursor and orders for their player. With one
 * player the first pad also drives player 1. With two players the second player always has a pad: the only one,
 * or the second when two are connected (then player 1 can use the first instead of the mouse).
 */
export class Gamepads {
  private readonly states = new Map<number, PadState>();

  constructor(
    private readonly seats: PadSeat[],
    private readonly hooks: PadHooks,
  ) {}

  /** The seat each connected pad drives, by pad index. */
  private assign(pads: Gamepad[]): Map<number, PadSeat> {
    const out = new Map<number, PadSeat>();
    if (this.seats.length === 1) {
      if (pads[0]) out.set(pads[0].index, this.seats[0]!);
    } else if (pads.length >= 2) {
      out.set(pads[0]!.index, this.seats[0]!);
      out.set(pads[1]!.index, this.seats[1]!);
    } else if (pads[0]) out.set(pads[0].index, this.seats[1]!);
    return out;
  }

  /** The box a pad is dragging in this view, in map pixels, for the renderer. */
  dragFor(view: View): { x0: number; y0: number; x1: number; y1: number } | null {
    for (const s of this.states.values()) {
      const c = view.commander.cursor;
      if (s.seat.view !== view || !s.box || !c || Math.abs(s.sx - s.box.sx) + Math.abs(s.sy - s.box.sy) <= 10) continue;
      return { x0: s.box.x, y0: s.box.y, x1: c.x, y1: c.y };
    }
    return null;
  }

  poll(dtMs: number): void {
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pads = [...list].filter((p): p is Gamepad => !!p && p.connected);
    const seats = this.assign(pads);
    for (const pad of pads) {
      const seat = seats.get(pad.index);
      if (seat) this.drive(pad, seat, dtMs / 1000);
    }
    // A pad that went away gives its player the mouse back.
    for (const seat of this.seats) {
      if (![...seats.values()].includes(seat)) seat.view.commander.cursor = null;
    }
    for (const index of [...this.states.keys()]) if (!seats.has(index)) this.states.delete(index);
  }

  private drive(pad: Gamepad, seat: PadSeat, dt: number): void {
    const { view, panel } = seat;
    const c = view.commander;
    const r = view.rect;
    let s = this.states.get(pad.index);
    if (!s || s.seat !== seat) {
      s = { seat, buttons: [], sx: r.x + r.w / 2, sy: r.y + r.h / 2, box: null };
      this.states.set(pad.index, s);
    }
    const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const before = s.buttons;
    const down = (b: number) => !!now[b] && !before[b];
    const up = (b: number) => !now[b] && !!before[b];
    s.buttons = now;

    // Sticks: the left one moves the cursor and pushes the camera at the edges, the right one scrolls.
    const lx = axis(pad.axes[0]);
    const ly = axis(pad.axes[1]);
    s.sx = Math.min(r.x + r.w - 1, Math.max(r.x, s.sx + lx * CURSOR_SPEED * dt));
    s.sy = Math.min(r.y + r.h - 1, Math.max(r.y + 40, s.sy + ly * CURSOR_SPEED * dt));
    let px = -axis(pad.axes[2]) * SCROLL_SPEED * dt;
    let py = -axis(pad.axes[3]) * SCROLL_SPEED * dt;
    if (s.sx <= r.x + EDGE && lx < 0) px += -lx * SCROLL_SPEED * dt;
    if (s.sx >= r.x + r.w - EDGE && lx > 0) px -= lx * SCROLL_SPEED * dt;
    if (s.sy <= r.y + 40 + EDGE && ly < 0) py += -ly * SCROLL_SPEED * dt;
    if (s.sy >= r.y + r.h - EDGE && ly > 0) py -= ly * SCROLL_SPEED * dt;
    if (px || py) view.pan(px, py);
    const at = view.toWorld(s.sx, s.sy);
    c.cursor = at;

    if (down(B.Start)) this.hooks.startOrPause();
    if (down(B.LT)) view.zoomBy(-1, s.sx, s.sy);
    if (down(B.RT)) view.zoomBy(1, s.sx, s.sy);
    if (down(B.Back)) view.centerOnHome();
    if (!this.hooks.playing()) {
      s.box = null;
      return;
    }

    if (down(B.A)) {
      if (c.placing) c.place(at.x, at.y);
      else s.box = { x: at.x, y: at.y, sx: s.sx, sy: s.sy };
    }
    if (up(B.A) && s.box) {
      const box = s.box;
      s.box = null;
      if (Math.abs(s.sx - box.sx) + Math.abs(s.sy - box.sy) > 10) c.selectBox(box.x, box.y, at.x, at.y, false);
      else {
        const hit = c.pick(at.x, at.y, SLACK);
        c.select(hit ? [hit.id] : []);
      }
    }
    if (down(B.B)) {
      if (c.placing) c.placing = null;
      else c.order(at.x, at.y, SLACK);
    }
    if (down(B.X)) panel.pressFocus();
    if (down(B.Y)) c.selectNextBase();
    if (down(B.LB) || down(B.Left)) panel.moveFocus(-1);
    if (down(B.RB) || down(B.Right)) panel.moveFocus(1);
    if (down(B.Up)) c.selectArmy();
    if (down(B.Down) && c.ownUnits().length) c.run({ kind: 'stop', ids: c.ownUnits().map((u) => u.id) });
  }
}
