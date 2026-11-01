import { Application, Graphics } from 'pixi.js';
import { loadArt } from './assets';
import { Sound } from './audio';
import { Soundscape } from './soundscape';
import { Minimap } from './minimap';
import { CELL, LANGS, ObjectType, type Lang } from '@sw/data';
import { DIFFICULTIES, isUnit, issue, loadWorld, SAVE_VERSION, saveWorld, TICK_MS, type Command, type Difficulty, type Side, type World } from '@sw/sim';
import { Game, nextMission, parseSetup, setupQuery, type Setup } from './game';
import { Gamepads } from './gamepad';
import { Hud } from './hud';
import { tickAlpha } from './render';
import { loadSettings, markCompleted, readSave, saveSettings, SLOTS, writeSave, type Slot } from './storage';
import { setLang, t } from './text';
import { cursorCss, cursorFrame, CURSOR_FRAME_MS, type CursorKind, type ScrollDir } from './ui/cursors';
import { loadFonts } from './ui/font';
import { View } from './view';

/**
 * The game with mouse and gamepad control. LMB selects (drag for a box), RMB orders, arrows/WASD or the screen edge
 * scroll, wheel zooms. A two-player skirmish splits the screen: player 1 on the left with the mouse, player 2 on
 * the right with a gamepad. URL options: `?m=6.2` mission, `?s=4&vs=hard&money=3000` skirmish on map 4 (`vs=human`
 * for two players, `&r=walker,hover&c=blue,red` the sides' races and colours), `?d=hard` campaign difficulty,
 * `?lang=en`, `?speed=8`, `?load=quick` continues a save. Without a mission, skirmish or save it opens the main screen.
 */

const params = new URLSearchParams(location.search);

const settings = loadSettings();
const urlLang = params.get('lang') as Lang | null;
setLang(urlLang && LANGS.includes(urlLang) ? urlLang : settings.lang);
const urlDifficulty = params.get('d') as Difficulty | null;
const difficulty = urlDifficulty && DIFFICULTIES.includes(urlDifficulty) ? urlDifficulty : settings.difficulty;
const menuMode = !['m', 's', 'load'].some((k) => params.has(k));
// Pixel font scale: 1.5 CSS px per font pixel on Retina (3 device pixels), 2 elsewhere.
// Two CSS pixels per font pixel on every screen: whole device pixels, so the letters stay crisp.
document.documentElement.style.setProperty('--k', '2');

/** Loads a mission or a skirmish; `start` skips its start screen (the skirmish screen already showed the choices). */
function open(setup: Setup, load?: Slot, start = false): void {
  const p = new URLSearchParams(location.search);
  for (const key of ['m', 's', 'vs', 'money', 'r', 'c', 'c2', 'd', 'load', 'go']) p.delete(key);
  for (const [k, v] of Object.entries(setupQuery(setup))) p.set(k, v);
  if (load) p.set('load', load);
  if (start) p.set('go', '1');
  if (setup.kind === 'skirmish') {
    settings.skirmish = setup;
    saveSettings(settings);
  }
  location.search = p.toString();
}

/** A save from `?load=slot`, or null to start from the beginning. */
function savedGame(): { setup: Setup; world: World } | null {
  const slot = params.get('load') as Slot | null;
  const save = slot && SLOTS.includes(slot) ? readSave(slot) : null;
  if (!save) return null;
  try {
    return { setup: save.setup, world: loadWorld(save.world) };
  } catch {
    return null;
  }
}

/** The original's keypad cheats, typed as keys: 1298* reveals the map, 1298# skips the mission, 12986 money, 12989 repair. */
const CHEATS = ['1298*', '1298#', '12986', '12989'] as const;

/** Wheel distance (pixels) and pinch distance per zoom step, the shortest gap between steps, and the pause that ends a swipe. */
const WHEEL_STEP_PX = 100;
const PINCH_STEP = 25;
const WHEEL_GAP_MS = 150;
const WHEEL_IDLE_MS = 250;

/**
 * Turns wheel events into zoom steps. A Mac trackpad (and a smooth mouse wheel) sends dozens of small events per
 * swipe, so deltas add up to one step per WHEEL_STEP_PX (a pinch per PINCH_STEP), at most one step per
 * WHEEL_GAP_MS.
 */
class WheelZoom {
  private sum = 0;
  private last = -Infinity;
  private stepAt = -Infinity;

  step(ev: WheelEvent): number {
    const now = ev.timeStamp;
    const px = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    // The first event after a pause is a whole step, so a wheel notch with a tiny delta still zooms.
    if (now - this.last > WHEEL_IDLE_MS) this.sum = Math.sign(px);
    else this.sum += px / (ev.ctrlKey ? PINCH_STEP : WHEEL_STEP_PX);
    this.last = now;
    if (Math.abs(this.sum) < 1 || now - this.stepAt < WHEEL_GAP_MS) return 0;
    const dir = this.sum < 0 ? 1 : -1;
    this.sum = 0;
    this.stepAt = now;
    return dir;
  }
}

async function start(): Promise<void> {
  const saved = savedGame();
  await loadFonts();
  const game = new Game(saved?.setup ?? parseSetup(location.search, difficulty), saved?.world);
  game.speed = Math.max(0.25, Math.min(16, Number(params.get('speed')) || 1));
  const world = () => game.world;
  const [p1] = game.commanders as [Game['commanders'][number]];

  const sound = new Sound(settings.music, settings.sfx);
  const app = new Application();
  await app.init({ resizeTo: window, background: 0x14110c, antialias: true, autoDensity: true, resolution: window.devicePixelRatio });
  document.getElementById('stage')!.appendChild(app.canvas);
  const { player: s1, enemy: s2 } = game.world.sides;
  const art = await loadArt([
    [s1.color, s1.color2],
    [s2.color, s2.color2],
  ]);
  app.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  const hud = new Hud(game, {
    open,
    restart: () => open(game.setup),
    save: (slot) => saveTo(slot),
    load: (slot) => loadFrom(slot),
    setLang: (lang) => {
      setLang(lang);
      settings.lang = lang;
      saveSettings(settings);
    },
    setDifficulty: (d) => {
      game.setDifficulty(d);
      settings.difficulty = d;
      saveSettings(settings);
    },
    lastSkirmish: () => settings.skirmish,
    volumes: () => ({ music: settings.music, sfx: settings.sfx }),
    setVolumes: (music, sfx) => {
      settings.music = music;
      settings.sfx = sfx;
      saveSettings(settings);
      sound.setVolumes(music, sfx);
    },
    toMenu: () => {
      location.search = params.has('lang') ? `lang=${params.get('lang')}` : '';
    },
  }, menuMode, params.get('go') === '1');
  if (game.loaded) hud.toast(t().loaded);

  // Views: the whole window for one player, left and right halves for two ------------------------------------------
  const panelHeight = (i: number) => () => (hud.panels[i]?.element.offsetHeight ?? 0) + 20;
  const views = game.commanders.map((c, i) => new View(c, art, panelHeight(i)));
  for (const v of views) app.stage.addChild(v.root);
  const minimaps = views.map((v, i) => new Minimap(v, i, i === 0));
  minimaps.forEach((m, i) => hud.panels[i]!.mountMinimap(m.element));
  const divider = new Graphics();
  app.stage.addChild(divider);
  const layout = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    if (views.length === 1) views[0]!.setRect({ x: 0, y: 0, w, h });
    else {
      const half = Math.floor(w / 2);
      views[0]!.setRect({ x: 0, y: 0, w: half - 1, h });
      views[1]!.setRect({ x: half + 1, y: 0, w: w - half - 1, h });
      divider.clear().rect(half - 1, 0, 2, h).fill(0x4a4234);
    }
    for (const v of views) v.fit();
  };
  layout();
  window.addEventListener('resize', () => requestAnimationFrame(layout));
  const v1 = views[0]!;

  // Sound ----------------------------------------------------------------------------------------------------------
  const soundscape = new Soundscape(sound, game, views);
  for (const c of game.commanders) {
    c.onSound = (name) => sound.play(name, { gain: name === 'select' || name === 'order' ? 0.7 : 1, pan: 0 });
    c.onOrder = (ids, action) => soundscape.acknowledge(c.side, ids, action);
  }
  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b && !b.disabled) sound.play('click', { gain: 0.8, pan: 0 });
  });

  function saveTo(slot: Slot): void {
    if (!game.started || world().outcome !== 'playing') return;
    const ok = writeSave(slot, { version: SAVE_VERSION, setup: game.setup, savedAt: new Date().toISOString(), world: saveWorld(world()) });
    hud.toast(ok ? t().saved : t().saveFailed);
  }

  function loadFrom(slot: Slot): void {
    const save = readSave(slot);
    if (save) open(save.setup, slot);
    else hud.toast(t().noSave);
  }

  let typed = '';
  function cheat(key: string): void {
    typed = (typed + key).slice(-5);
    const code = CHEATS.find((c) => typed.endsWith(c));
    if (!code || !game.started || world().outcome !== 'playing') return;
    typed = '';
    const T = t().cheat;
    if (code === '1298*') {
      p1.run({ kind: 'cheat', cheat: 'reveal' });
      hud.toast(T.reveal);
    } else if (code === '12986') {
      p1.run({ kind: 'cheat', cheat: 'money' });
      hud.toast(T.money);
    } else if (code === '12989') {
      for (const e of p1.selected()) if (p1.isOwn(e)) p1.run({ kind: 'cheat', cheat: 'repair', id: e.id });
      hud.toast(T.repair);
    } else if (game.setup.kind === 'campaign') {
      markCompleted(game.mapIndex, game.missionIndex);
      hud.toast(T.skip);
      const n = nextMission(game.mapIndex, game.missionIndex);
      if (n) open({ ...game.setup, ...n });
    }
  }

  // Mouse and keyboard: always player 1 ----------------------------------------------------------------------------
  const keys = new Set<string>();
  let mouseScreen: { x: number; y: number } | null = null;
  let drag: { x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; shift: boolean } | null = null;
  let panDrag: { x: number; y: number } | null = null;
  /** Where player 1 was last attacked, for Space. */
  let lastAlert: { x: number; y: number } | null = null;

  app.canvas.addEventListener('pointerdown', (ev) => {
    if (!game.started || !v1.contains(ev.offsetX, ev.offsetY)) return;
    const p = v1.toWorld(ev.offsetX, ev.offsetY);
    if (ev.button === 1) {
      panDrag = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (ev.button === 2) {
      if (p1.placing) p1.placing = null;
      else if (p1.aiming) p1.aiming = null;
      else p1.order(p.x, p.y, 0, { queue: ev.shiftKey, attack: ev.altKey });
      return;
    }
    if (ev.button !== 0) return;
    if (p1.aiming) {
      p1.aim(p.x, p.y);
      return;
    }
    if (p1.placing) {
      p1.place(p.x, p.y, ev.shiftKey);
      return;
    }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, sx: ev.clientX, sy: ev.clientY, shift: ev.shiftKey };
  });
  window.addEventListener('pointermove', (ev) => {
    if (ev.target === app.canvas) mouseScreen = { x: ev.offsetX, y: ev.offsetY };
    if (panDrag) {
      v1.pan(ev.clientX - panDrag.x, ev.clientY - panDrag.y);
      panDrag = { x: ev.clientX, y: ev.clientY };
    }
    if (drag && mouseScreen) {
      const p = v1.toWorld(mouseScreen.x, mouseScreen.y);
      drag.x1 = p.x;
      drag.y1 = p.y;
    }
  });
  window.addEventListener('pointerup', (ev) => {
    if (ev.button === 1) panDrag = null;
    if (ev.button !== 0 || !drag) return;
    const d = drag;
    drag = null;
    if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 6) {
      p1.selectBox(d.x0, d.y0, d.x1, d.y1, d.shift);
    } else {
      const hit = p1.pick(d.x0, d.y0);
      if (hit) p1.select([hit.id], d.shift);
      else if (!d.shift) p1.select([]);
    }
  });
  app.canvas.addEventListener('pointerleave', () => (mouseScreen = null));
  const wheel = new WheelZoom();
  app.canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      if (!v1.contains(ev.offsetX, ev.offsetY)) return;
      const step = wheel.step(ev);
      if (step) v1.zoomBy(step, ev.offsetX, ev.offsetY);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (ev) => {
    if (ev.key.length === 1) cheat(ev.key);
    // A letter on a panel button presses it (Q W E R T, A S D F G, X stop), ahead of any other use of the key.
    const letter = /^Key([A-Z])$/.exec(ev.code)?.[1];
    if (letter && !ev.metaKey && !ev.ctrlKey && game.started && !hud.dialogOpen && hud.panels[0]!.pressKey(letter)) {
      ev.preventDefault();
      return;
    }
    keys.add(ev.code);
    if (ev.code === 'F5' || ev.code === 'F9') {
      // F5 quick-saves, F9 quick-loads; the browser's own reload is not wanted mid-game.
      ev.preventDefault();
      if (ev.code === 'F5') saveTo('quick');
      else loadFrom('quick');
      return;
    }
    const digit = /^Digit([1-9])$/.exec(ev.code);
    if (digit) {
      const n = Number(digit[1]);
      if (ev.metaKey || ev.ctrlKey) {
        p1.setGroup(n);
        ev.preventDefault();
      } else p1.recallGroup(n);
      return;
    }
    switch (ev.code) {
      case 'Escape':
        // Escape first drops a building being placed or a Move/Attack waiting for its target; then it pauses.
        if (p1.placing && !hud.dialogOpen) p1.placing = null;
        else if (p1.aiming && !hud.dialogOpen) p1.aiming = null;
        else hud.escape();
        break;
      case 'Space':
        // Space jumps to the last place under attack; pause moved to P.
        if (lastAlert) v1.centerOn(lastAlert.x, lastAlert.y);
        ev.preventDefault();
        break;
      case 'KeyP':
        hud.togglePause();
        ev.preventDefault();
        break;
      case 'KeyH': {
        const hq = p1.hq();
        if (hq) p1.select([hq.id]);
        break;
      }
      case 'Equal':
        v1.zoomBy(1);
        break;
      case 'Minus':
        v1.zoomBy(-1);
        break;
      case 'KeyF':
        v1.fit();
        break;
    }
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  // The mouse cursor: what a click would do here, in the race's style --------------------------------------------------
  const own = world().sides[p1.side];
  let shownCursor = '';
  function cursorKind(): { kind: CursorKind; dir?: ScrollDir } {
    if (!mouseScreen || !game.started || !v1.contains(mouseScreen.x, mouseScreen.y) || drag) return { kind: 'normal' };
    const r = v1.rect;
    const edge = 6;
    const ns = mouseScreen.y < r.y + edge ? 'n' : mouseScreen.y > r.y + r.h - edge ? 's' : '';
    const we = mouseScreen.x < r.x + edge ? 'w' : mouseScreen.x > r.x + r.w - edge ? 'e' : '';
    if (ns || we) return { kind: 'scroll', dir: (ns + we) as ScrollDir };
    if (p1.placing) return { kind: 'normal' };
    const p = v1.toWorld(mouseScreen.x, mouseScreen.y);
    if (p1.aiming) return { kind: p1.aiming };
    const hit = p1.pick(p.x, p.y);
    const units = p1.selected().filter((e) => p1.isOwn(e) && isUnit(e.type));
    if (units.length === 0) return { kind: hit ? 'select' : 'normal' };
    if (hit && p1.isFoe(hit)) return { kind: units.some((u) => u.type !== ObjectType.Harvester) ? 'attack' : 'forbidden' };
    if (hit?.type === ObjectType.ResourceField) return { kind: units.some((u) => u.type === ObjectType.Harvester) ? 'harvest' : 'move' };
    if (hit && p1.isOwn(hit)) return { kind: 'select' };
    const w = world();
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    const known = w.sides[p1.side].explored[cy * w.cols + cx] === 1;
    if (cx < 0 || cy < 0 || cx >= w.cols || cy >= w.rows || (known && w.blocked[cy * w.cols + cx] === 1)) return { kind: 'forbidden' };
    return { kind: 'move' };
  }
  function updateCursor(): void {
    const { kind, dir } = cursorKind();
    const css = cursorCss(own.race, own.color, kind, dir, cursorFrame());
    if (css !== shownCursor) app.canvas.style.cursor = shownCursor = css;
  }
  // The pointer over the interface animates too, a frame at a time.
  window.setInterval(() => (document.body.style.cursor = cursorCss(own.race, own.color, 'normal', 'n', cursorFrame())), CURSOR_FRAME_MS);

  // Gamepads -------------------------------------------------------------------------------------------------------
  const playing = () => game.started && !game.paused && world().outcome === 'playing';
  const pads = new Gamepads(
    views.map((view, i) => ({ view, panel: hud.panels[i]! })),
    { startOrPause: () => hud.startOrPause(), playing },
  );

  // Test hook: lets Playwright read the world and give orders without pixel hunting.
  Object.assign(window, {
    __sw: {
      game,
      players: game.commanders,
      views,
      issue: (cmd: Command, side: Side = 'player') => issue(game.world, side, cmd),
      camera: v1.camera,
    },
  });

  // Loop -----------------------------------------------------------------------------------------------------------
  let acc = 0;
  app.ticker.add((tk) => {
    const pan = 9 * tk.deltaTime;
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx += pan;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx -= pan;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy += pan;
    if (keys.has('ArrowDown')) dy -= pan;
    if (mouseScreen && !drag && game.started && v1.contains(mouseScreen.x, mouseScreen.y)) {
      const edge = 6;
      const r = v1.rect;
      if (mouseScreen.x < r.x + edge) dx += pan;
      if (mouseScreen.x > r.x + r.w - edge) dx -= pan;
      if (mouseScreen.y < r.y + edge) dy += pan;
      if (mouseScreen.y > r.y + r.h - edge) dy -= pan;
    }
    if (dx || dy) v1.pan(dx, dy);
    pads.poll(tk.deltaMS);

    const running = playing();
    if (running) {
      acc += tk.deltaMS * game.speed;
      let steps = 0;
      while (acc >= TICK_MS && steps < 64) {
        for (const v of views) v.renderer.beforeStep();
        game.step();
        for (const v of views) v.renderer.afterStep(world().events);
        for (const ev of world().events) {
          if (ev.kind !== 'underAttack') continue;
          for (const m of minimaps) m.ping(ev.team, ev.x, ev.y);
          if (ev.team === p1.side) lastAlert = { x: ev.x, y: ev.y };
        }
        soundscape.afterStep(world().events);
        acc -= TICK_MS;
        steps++;
      }
      if (steps === 64) acc = 0;
    }
    const alpha = running ? tickAlpha(acc) : 1;
    for (const v of views) {
      const mouse = v === v1 && mouseScreen && v1.contains(mouseScreen.x, mouseScreen.y) ? v1.toWorld(mouseScreen.x, mouseScreen.y) : null;
      v.animate(tk.deltaMS);
      v.renderer.draw(alpha, tk.deltaMS, mouse, (v === v1 ? drag : null) ?? pads.dragFor(v));
    }
    hud.update();
    updateCursor();
    soundscape.update();
    for (const m of minimaps) m.update(tk.deltaMS);
    // Ready only once a frame has been drawn and the HUD filled in, so tests never click a blank page.
    document.body.dataset.ready = 'true';
  });
}

void start();

