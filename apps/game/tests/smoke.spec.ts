import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** The game's version: the desktop app's package version, as vite.config.ts injects it. */
const VERSION = (JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** Reads from the test hook main.ts puts on window. */
type Hook = {
  game: {
    started: boolean;
    paused: boolean;
    difficulty: string;
    world: { tick: number; outcome: string; entities: Array<{ id: number; type: number; team: string; x: number; y: number; size: number; order: { kind: string } }> };
  };
  players: Array<{ selection: number[]; money: number; side: string; cursor: { x: number; y: number } | null }>;
  views: Array<{ rect: { x: number; y: number; w: number; h: number }; camera: { x: number; y: number; scale: { x: number } } }>;
  camera: { x: number; y: number; scale: { x: number } };
};

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** Screen position of an object's centre. */
async function screenOf(page: Page, type: number, team = 'player'): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([type, team]) => {
      const sw = (window as unknown as { __sw: Hook }).__sw;
      const e = sw.game.world.entities.find((o) => o.type === type && o.team === team)!;
      const z = sw.camera.scale.x;
      return { x: sw.camera.x + (e.x + e.size / 2) * z, y: sw.camera.y + (e.y + e.size / 2) * z };
    },
    [type, team] as const,
  );
}

const hook = (page: Page) => page.evaluate(() => {
  const sw = (window as unknown as { __sw: Hook }).__sw;
  const g = sw.game;
  return { tick: g.world.tick, money: sw.players[0]!.money, started: g.started, difficulty: g.difficulty };
});

// The main screen and the outcome scenes draw live 3D with software rendering on CI, two tests at a time.
test.describe.configure({ timeout: 90_000 });

test('mission 1 opens with its briefing, then the map', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await expect(page.locator('#modal')).toContainText('Перші кроки');
  await expect(page.locator('#modal')).toContainText('Ласкаво просимо');
  await expect(page.locator('#modal button.active')).toContainText(['Нормально', 'Українська']);
  await page.screenshot({ path: 'test-results/mission-1-1-briefing.png' });
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#money')).toHaveText('1000');
  // Escape opens the pause menu, which names the mission; a second Escape closes it.
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal .pause .kicker')).toContainText('Початок · Перші кроки');
  expect((await page.evaluate(() => (window as unknown as { __sw: Hook }).__sw.game.paused))).toBe(true);
  await page.screenshot({ path: 'test-results/pause-menu.png' });
  await page.getByRole('button', { name: 'Головне меню' }).click();
  await expect(page.locator('#modal')).toContainText('Вийти в головне меню?');
  await page.getByRole('button', { name: 'Ні' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
  // The campaign is olive humans (turquoise accents) against red hovers (white accents).
  const sides = await page.evaluate(() => {
    const w = (window as unknown as { __sw: { game: { world: { sides: Record<string, { race: string; color: string; color2: string }> } } } }).__sw.game.world;
    return [w.sides.player!.race, w.sides.player!.color, w.sides.player!.color2, w.sides.enemy!.race, w.sides.enemy!.color, w.sides.enemy!.color2];
  });
  expect(sides).toEqual(['human', 'olive', 'cyan', 'hover', 'red', 'white']);
  await page.screenshot({ path: 'test-results/mission-1-1.png' });
  expect(errors).toEqual([]);
});

test('click selects the tank and right click sends it', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#panel .info')).toHaveText('');
  const tank = await screenOf(page, 101);
  // On a slow CI runner the first frames can lag behind the click, so retry the click until it registers.
  await expect(async () => {
    await page.mouse.click(tank.x, tank.y);
    await expect(page.locator('#panel')).toContainText('Багі', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.mouse.click(tank.x + 90, tank.y + 20, { button: 'right' });
  await expect(page.locator('#panel')).toContainText('їде');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/mission-1-1-order.png' });
  expect(errors).toEqual([]);
});

test('the HQ builds a silo where the player clicks', async ({ page }) => {
  const errors = await open(page, '?m=1.1&speed=4');
  await page.getByRole('button', { name: 'Почати' }).click();
  const hq = await screenOf(page, 0);
  await page.mouse.click(hq.x, hq.y);
  await expect(page.locator('#panel')).toContainText('Штаб');
  await page.getByRole('button', { name: /Сховище/ }).click();
  const z = await page.evaluate(() => (window as unknown as { __sw: Hook }).__sw.camera.scale.x);
  // Open, explored sand left of the starting tank in mission 1.
  await page.mouse.move(hq.x - 105 * z, hq.y + 30 * z);
  await page.screenshot({ path: 'test-results/mission-1-1-placing.png' });
  await page.mouse.click(hq.x - 105 * z, hq.y + 30 * z);
  await expect(page.locator('#money')).toHaveText('600');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/mission-1-1-silo.png' });
  expect(errors).toEqual([]);
});

test('opens a later mission by URL', async ({ page }) => {
  await open(page, '?m=6.2');
  await expect(page.locator('#modal')).toContainText('Перевантаження');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal .pause .kicker')).toContainText('Шукач');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/mission-6-2.png' });
});

test('the mission list opens missions in order and jumps to another mission', async ({ page }) => {
  // Maps 1 and 2 already won.
  await page.addInitScript(() => localStorage.setItem('sw.completed', JSON.stringify(['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3'])));
  // The main screen: the name over a live battle, its way into the campaign.
  const errors = await open(page, '');
  await expect(page.locator('#modal h1')).toHaveText('SHARDFALL');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/main-menu.png' });
  await page.getByRole('button', { name: 'Кампанія' }).click();
  await expect(page.getByRole('button', { name: '1. Перші кроки ✓' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '2. Операція X' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/missions.png' });
  await page.getByRole('button', { name: '1. Пошук', exact: true }).click();
  await expect(page.locator('#modal')).toContainText('Пошук');
  expect(page.url()).toContain('m=3.1');
  expect(errors).toEqual([]);
});

test('victory shows its scene and the match numbers', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.evaluate(() => {
    const h = (window as unknown as { __sw: { game: { world: { outcome: string } } } }).__sw;
    h.game.world.outcome = 'won';
  });
  await expect(page.locator('#modal .stats')).toContainText('Зібрано кристалів');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/victory.png' });
  expect(errors).toEqual([]);
});

test('difficulty and language are chosen on the briefing and remembered', async ({ page }) => {
  const errors = await open(page, '?m=1.2');
  await page.getByRole('button', { name: 'Важко' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('#modal')).toContainText('Harvest');
  await expect(page.locator('#modal')).toContainText('yellow crystals');
  await page.screenshot({ path: 'test-results/mission-1-2-briefing-en.png' });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal .pause .kicker')).toContainText('Beginning · Harvest · Hard');
  await page.keyboard.press('Escape');
  expect((await hook(page)).difficulty).toBe('hard');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#modal')).toContainText('Harvest');
  expect((await hook(page)).difficulty).toBe('hard');
  expect(errors).toEqual([]);
});

test('quick save and quick load continue the game where it was', async ({ page }) => {
  const errors = await open(page, '?m=1.2&speed=8');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect.poll(async () => (await hook(page)).tick, { timeout: 20_000 }).toBeGreaterThan(200);
  await page.keyboard.press('F5');
  await expect(page.locator('#toast')).toContainText('Гру збережено');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sw.save.quick')!).world.world.tick as number);
  await page.keyboard.press('F9');
  await page.waitForURL(/load=quick/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const loaded = await hook(page);
  expect(loaded.started).toBe(true);
  expect(loaded.tick).toBeGreaterThanOrEqual(saved);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Збереження' }).click();
  await expect(page.locator('#modal')).toContainText('1.2 Жнива');
  await page.screenshot({ path: 'test-results/saves.png' });
  expect(errors).toEqual([]);
});

test('the original cheat codes still work', async ({ page }) => {
  await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.keyboard.type('12986');
  await expect(page.locator('#money')).toHaveText('2000');
});

test('losing the HQ shows the defeat screen with a retry', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.keyboard.press('KeyH');
  await expect(page.locator('#panel')).toContainText('Штаб');
  // Self-destruct arms on the first press and fires on the second.
  await page.getByRole('button', { name: 'Самознищення' }).click();
  await expect(page.getByRole('button', { name: 'Ще раз: знищити' })).toBeVisible();
  // The second press must come within 3 s; a slow runner may miss that, so press again until the HQ is gone.
  await expect(async () => {
    await page.locator('#panel button[data-action="destruct"]').click({ timeout: 2000 });
    await expect(page.locator('#modal')).toContainText('Поразка', { timeout: 3000 });
  }).toPass({ timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'Ще раз' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('settings show the version, and the volumes are remembered', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Налаштування' }).click();
  await expect(page.locator('#modal')).toContainText(`Версія ${VERSION}`);
  await expect(page.locator('#modal')).toContainText('Jiří Mikula');
  await page.getByRole('slider', { name: 'Музика' }).fill('20');
  await expect(page.locator('#modal output').first()).toHaveText('20%');
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.getByRole('button', { name: 'Закрити' }).click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sw.settings')!).music)).toBe(0.2);
  expect(errors).toEqual([]);
});

test('the minimap shows the map and moves the camera', async ({ page }) => {
  // Map 7 is taller than the window, so the camera can move up and down.
  const errors = await open(page, '?m=7.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  const box = (await page.locator('#minimap').boundingBox())!;
  const camY = () => page.evaluate(() => (window as unknown as { __sw: Hook }).__sw.camera.y);
  await page.mouse.click(box.x + box.width / 2, box.y + 3);
  const top = await camY();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
  await expect.poll(camY).toBeLessThan(top);
  await page.screenshot({ path: 'test-results/minimap.png' });
  expect(errors).toEqual([]);
});

test('the factory answers a click on its roof, queues tanks and sets a rally point', async ({ page }) => {
  const errors = await open(page, '?m=7.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  const f = await screenOf(page, 2);
  const z = await page.evaluate(() => (window as unknown as { __sw: Hook }).__sw.camera.scale.x);
  // The crane on the roof is drawn above the factory's cells.
  await expect(async () => {
    await page.mouse.click(f.x, f.y - 18 * z);
    await expect(page.locator('#panel')).toContainText('Танковий завод', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // The panel redraws while the factory works; a slow press must still count.
  for (let i = 0; i < 2; i++) {
    const buggy = await page.evaluate(() => {
      const r = document.querySelector('#panel button[data-type="101"]')!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(buggy.x, buggy.y, { delay: 150 });
  }
  await expect(page.locator('#panel .queue button')).toHaveCount(2);
  await expect(page.locator('#money')).toHaveText('900');
  await page.mouse.click(f.x + 60 * z, f.y + 20 * z, { button: 'right' });
  const rally = await page.evaluate(() => {
    const sw = (window as unknown as { __sw: { game: { world: { entities: Array<{ type: number; team: string; rally: unknown }> } } } }).__sw;
    return sw.game.world.entities.find((e) => e.type === 2 && e.team === 'player')!.rally;
  });
  expect(rally).not.toBeNull();
  await page.screenshot({ path: 'test-results/factory-queue.png' });
  expect(errors).toEqual([]);
});
