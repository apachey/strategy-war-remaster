import { Application } from 'pixi.js';
import { CELL, LANGS, type Lang } from '@sw/data';
import { DIFFICULTIES, issue, loadWorld, SAVE_VERSION, saveWorld, TICK_MS, type Difficulty, type World } from '@sw/sim';
import { Game, nextMission, parseMission } from './game';
import { Hud } from './hud';
import { Renderer, tickAlpha } from './render';
import { loadSettings, markCompleted, readSave, saveSettings, SLOTS, writeSave, type Slot } from './storage';
import { setLang, t } from './text';

/**
 * The campaign with mouse control. LMB selects (drag for a box), RMB orders, arrows/WASD or the screen edge
 * scroll, wheel zooms. URL options: `?m=6.2` mission, `?d=hard` difficulty, `?lang=en`, `?speed=8`,
 * `?load=quick` continues a save.
 */

const params = new URLSearchParams(location.search);

const settings = loadSettings();
const urlLang = params.get('lang') as Lang | null;
setLang(urlLang && LANGS.includes(urlLang) ? urlLang : settings.lang);
const urlDifficulty = params.get('d') as Difficulty | null;
const difficulty = urlDifficulty && DIFFICULTIES.includes(urlDifficulty) ? urlDifficulty : settings.difficulty;

function goTo(mapIndex: number, missionIndex: number, load?: Slot): void {
  const p = new URLSearchParams(location.search);
  p.set('m', `${mapIndex + 1}.${missionIndex + 1}`);
  p.delete('d');
  if (load) p.set('load', load);
  else p.delete('load');
  location.search = p.toString();
}

/** A save from `?load=slot`, or null to start the mission from its beginning. */
function savedGame(): { mapIndex: number; missionIndex: number; world: World } | null {
  const slot = params.get('load') as Slot | null;
  const save = slot && SLOTS.includes(slot) ? readSave(slot) : null;
  if (!save) return null;
  try {
    return { mapIndex: save.mapIndex, missionIndex: save.missionIndex, world: loadWorld(save.world) };
  } catch {
    return null;
  }
}

/** The original's keypad cheats, typed as keys: 1298* reveals the map, 1298# skips the mission, 12986 money, 12989 repair. */
const CHEATS = ['1298*', '1298#', '12986', '12989'] as const;

async function start(): Promise<void> {
  const saved = savedGame();
  const { mapIndex, missionIndex } = saved ?? parseMission(location.search);
  const game = new Game(mapIndex, missionIndex, difficulty, saved?.world);
  game.speed = Math.max(0.25, Math.min(16, Number(params.get('speed')) || 1));
  const world = () => game.world;

  const app = new Application();
  await app.init({ resizeTo: window, background: 0x14110c, antialias: true, autoDensity: true, resolution: window.devicePixelRatio });
  document.getElementById('stage')!.appendChild(app.canvas);
  app.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  const renderer = new Renderer(game);
  app.stage.addChild(renderer.camera);
  const camera = renderer.camera;

  const hud = new Hud(game, {
    startMission: goTo,
    restart: () => goTo(mapIndex, missionIndex),
    next: () => {
      const n = nextMission(mapIndex, missionIndex);
      if (n) goTo(n.mapIndex, n.missionIndex);
    },
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
  });
  if (game.loaded) hud.toast(t().loaded);

  function saveTo(slot: Slot): void {
    if (!game.started || world().outcome !== 'playing') return;
    const ok = writeSave(slot, {
      version: SAVE_VERSION,
      mapIndex,
      missionIndex,
      savedAt: new Date().toISOString(),
      world: saveWorld(world()),
    });
    hud.toast(ok ? t().saved : t().saveFailed);
  }

  function loadFrom(slot: Slot): void {
    const save = readSave(slot);
    if (save) goTo(save.mapIndex, save.missionIndex, slot);
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
      game.run({ kind: 'cheat', cheat: 'reveal' });
      hud.toast(T.reveal);
    } else if (code === '12986') {
      game.run({ kind: 'cheat', cheat: 'money' });
      hud.toast(T.money);
    } else if (code === '12989') {
      for (const e of game.selected()) if (e.team === 'player') game.run({ kind: 'cheat', cheat: 'repair', id: e.id });
      hud.toast(T.repair);
    } else {
      markCompleted(mapIndex, missionIndex);
      hud.toast(T.skip);
      const n = nextMission(mapIndex, missionIndex);
      if (n) goTo(n.mapIndex, n.missionIndex);
    }
  }

  // Camera ---------------------------------------------------------------------------------------------------
  const mapW = world().cols * CELL;
  const mapH = world().rows * CELL;
  const panel = () => (document.getElementById('panel')!.offsetHeight || 0) + 20;
  const clampCamera = () => {
    const z = camera.scale.x;
    const viewW = app.screen.width;
    const viewH = app.screen.height - panel();
    const fitX = (viewW - mapW * z) / 2;
    const fitY = 44 + (viewH - 44 - mapH * z) / 2;
    camera.x = mapW * z <= viewW ? Math.round(fitX) : Math.round(Math.min(40, Math.max(viewW - mapW * z - 40, camera.x)));
    camera.y = mapH * z <= viewH - 44 ? Math.round(fitY) : Math.round(Math.min(84, Math.max(viewH - mapH * z - 40, camera.y)));
  };
  const setZoom = (z: number, sx = app.screen.width / 2, sy = app.screen.height / 2) => {
    const old = camera.scale.x;
    const zoom = Math.max(1, Math.min(8, z));
    if (zoom === old) return;
    camera.x = sx - ((sx - camera.x) * zoom) / old;
    camera.y = sy - ((sy - camera.y) * zoom) / old;
    camera.scale.set(zoom);
    clampCamera();
  };
  const fit = () => {
    const z = Math.floor(Math.min(app.screen.width / (mapW + 40), (app.screen.height - panel() - 60) / (mapH + 20)));
    camera.scale.set(Math.max(2, Math.min(5, z)));
    clampCamera();
  };
  fit();
  window.addEventListener('resize', fit);

  const toWorld = (sx: number, sy: number) => ({ x: (sx - camera.x) / camera.scale.x, y: (sy - camera.y) / camera.scale.y });

  // Input ----------------------------------------------------------------------------------------------------
  const keys = new Set<string>();
  let mouseScreen: { x: number; y: number } | null = null;
  let drag: { x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; shift: boolean } | null = null;
  let panDrag: { x: number; y: number } | null = null;

  app.canvas.addEventListener('pointerdown', (ev) => {
    if (!game.started) return;
    const p = toWorld(ev.offsetX, ev.offsetY);
    if (ev.button === 1) {
      panDrag = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (ev.button === 2) {
      if (game.placing) game.placing = null;
      else game.order(p.x, p.y);
      return;
    }
    if (ev.button !== 0) return;
    if (game.placing) {
      game.place(p.x, p.y, ev.shiftKey);
      return;
    }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, sx: ev.clientX, sy: ev.clientY, shift: ev.shiftKey };
  });
  window.addEventListener('pointermove', (ev) => {
    if (ev.target === app.canvas) mouseScreen = { x: ev.offsetX, y: ev.offsetY };
    if (panDrag) {
      camera.x += ev.clientX - panDrag.x;
      camera.y += ev.clientY - panDrag.y;
      panDrag = { x: ev.clientX, y: ev.clientY };
      clampCamera();
    }
    if (drag && mouseScreen) {
      const p = toWorld(mouseScreen.x, mouseScreen.y);
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
      game.selectBox(d.x0, d.y0, d.x1, d.y1, d.shift);
    } else {
      const hit = game.pick(d.x0, d.y0);
      if (hit) game.select([hit.id], d.shift);
      else if (!d.shift) game.select([]);
    }
  });
  app.canvas.addEventListener('pointerleave', () => (mouseScreen = null));
  app.canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      setZoom(camera.scale.x + (ev.deltaY < 0 ? 1 : -1), ev.offsetX, ev.offsetY);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (ev) => {
    keys.add(ev.code);
    if (ev.key.length === 1) cheat(ev.key);
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
        game.setGroup(n);
        ev.preventDefault();
      } else game.recallGroup(n);
      return;
    }
    switch (ev.code) {
      case 'Escape':
        if (game.placing) game.placing = null;
        else game.select([]);
        break;
      case 'Space':
      case 'KeyP':
        hud.togglePause();
        ev.preventDefault();
        break;
      case 'KeyS':
        if (!ev.metaKey && !ev.ctrlKey && game.ownUnits().length) game.run({ kind: 'stop', ids: game.ownUnits().map((u) => u.id) });
        break;
      case 'KeyH': {
        const hq = world().entities.find((e) => e.type === 0 && e.team === 'player');
        if (hq) game.select([hq.id]);
        break;
      }
      case 'Equal':
        setZoom(camera.scale.x + 1);
        break;
      case 'Minus':
        setZoom(camera.scale.x - 1);
        break;
      case 'KeyF':
        fit();
        break;
    }
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  // Test hook: lets Playwright read the world and give orders without pixel hunting.
  Object.assign(window, { __sw: { game, issue: (cmd: Parameters<typeof issue>[2]) => issue(game.world, 'player', cmd), camera } });

  // Loop -----------------------------------------------------------------------------------------------------
  let acc = 0;
  app.ticker.add((t) => {
    const pan = 9 * t.deltaTime;
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx += pan;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx -= pan;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy += pan;
    if (keys.has('ArrowDown')) dy -= pan;
    if (mouseScreen && !drag && game.started) {
      const edge = 6;
      if (mouseScreen.x < edge) dx += pan;
      if (mouseScreen.x > app.screen.width - edge) dx -= pan;
      if (mouseScreen.y < edge) dy += pan;
      if (mouseScreen.y > app.screen.height - edge) dy -= pan;
    }
    if (dx || dy) {
      camera.x += dx;
      camera.y += dy;
      clampCamera();
    }

    const running = game.started && !game.paused && world().outcome === 'playing';
    if (running) {
      acc += t.deltaMS * game.speed;
      let steps = 0;
      while (acc >= TICK_MS && steps < 64) {
        renderer.beforeStep();
        game.step();
        renderer.afterStep(world().events);
        acc -= TICK_MS;
        steps++;
      }
      if (steps === 64) acc = 0;
    }
    const mouse = mouseScreen ? toWorld(mouseScreen.x, mouseScreen.y) : null;
    renderer.draw(running ? tickAlpha(acc) : 1, t.deltaMS, mouse, drag);
    hud.update();
    // Ready only once a frame has been drawn and the HUD filled in, so tests never click a blank page.
    document.body.dataset.ready = 'true';
  });
}

void start();
