import { Application, Container, Graphics } from 'pixi.js';
import { campaign, CELL, ObjectType } from '@sw/data';
import { createWorld, step, TICKS_PER_SECOND, type Entity } from '@sw/sim';

/** Phase 0 "grey box" view: draws a mission from the original campaign and pans with the keyboard or mouse. */

const COLORS = {
  sand: 0xd8c491,
  forest: 0x2f6b3d,
  player: 0x2c8fa3,
  enemy: 0xb8372a,
  neutral: 0x9aa1a3,
  resource: 0xf0c43a,
};

function parseMission(): { mapIndex: number; missionIndex: number } {
  // ?m=6.2 opens map 6, mission 2 (1-based, as in the original menus).
  const raw = new URLSearchParams(location.search).get('m') ?? '1.1';
  const [m, n] = raw.split('.').map((v) => Number.parseInt(v, 10));
  return { mapIndex: Math.max(0, (m ?? 1) - 1), missionIndex: Math.max(0, (n ?? 1) - 1) };
}

function colorFor(e: Entity): number {
  if (e.type === ObjectType.ResourceField) return COLORS.resource;
  if (e.type === ObjectType.Wall) return COLORS.neutral;
  return e.team === 'enemy' ? COLORS.enemy : COLORS.player;
}

async function start(): Promise<void> {
  const { mapIndex, missionIndex } = parseMission();
  const map = campaign.maps[mapIndex] ?? campaign.maps[0]!;
  const mission = map.missions[missionIndex] ?? map.missions[0]!;
  const world = createWorld(map, map.missions.indexOf(mission));

  const app = new Application();
  await app.init({ resizeTo: window, background: 0x14110c, antialias: false, autoDensity: true, resolution: window.devicePixelRatio });
  document.body.appendChild(app.canvas);

  const camera = new Container();
  app.stage.addChild(camera);

  const ground = new Graphics();
  ground.rect(0, 0, world.cols * CELL, world.rows * CELL).fill(COLORS.sand);
  for (let i = 0; i < world.blocked.length; i++) {
    if (!world.blocked[i]) continue;
    ground.rect((i % world.cols) * CELL, Math.floor(i / world.cols) * CELL, CELL, CELL).fill(COLORS.forest);
  }
  camera.addChild(ground);

  const things = new Graphics();
  for (const e of world.entities) {
    const inset = e.size === CELL ? 2 : 3;
    things.roundRect(e.x + inset, e.y + inset, e.size - inset * 2, e.size - inset * 2, 3).fill(colorFor(e));
    if (e.type === ObjectType.PlayerHQ || e.type === ObjectType.EnemyHQ) {
      things.circle(e.x + e.size / 2, e.y + e.size / 2, 6).fill(0xf4efe2);
    }
  }
  camera.addChild(things);

  // Fit the whole map on screen at an integer zoom, so pixel art stays crisp later.
  const fit = () => {
    const zoom = Math.max(1, Math.floor(Math.min(app.screen.width / (world.cols * CELL), app.screen.height / (world.rows * CELL))));
    camera.scale.set(zoom);
    camera.position.set(
      Math.round((app.screen.width - world.cols * CELL * zoom) / 2),
      Math.round((app.screen.height - world.rows * CELL * zoom) / 2),
    );
  };
  fit();
  window.addEventListener('resize', fit);

  const keys = new Set<string>();
  window.addEventListener('keydown', (ev) => keys.add(ev.key));
  window.addEventListener('keyup', (ev) => keys.delete(ev.key));
  let drag: { x: number; y: number } | null = null;
  app.canvas.addEventListener('pointerdown', (ev) => (drag = { x: ev.clientX, y: ev.clientY }));
  window.addEventListener('pointerup', () => (drag = null));
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    camera.x += ev.clientX - drag.x;
    camera.y += ev.clientY - drag.y;
    drag = { x: ev.clientX, y: ev.clientY };
  });

  const hud = document.getElementById('hud')!;
  let acc = 0;
  app.ticker.add((t) => {
    const pan = 8 * t.deltaTime;
    if (keys.has('ArrowLeft')) camera.x += pan;
    if (keys.has('ArrowRight')) camera.x -= pan;
    if (keys.has('ArrowUp')) camera.y += pan;
    if (keys.has('ArrowDown')) camera.y -= pan;
    acc += t.deltaMS;
    while (acc >= 1000 / TICKS_PER_SECOND) {
      step(world);
      acc -= 1000 / TICKS_PER_SECOND;
    }
    hud.textContent = `${map.name} · ${mission.title} · $${world.money} · tick ${world.tick}`;
  });

  document.body.dataset.ready = 'true';
}

void start();
