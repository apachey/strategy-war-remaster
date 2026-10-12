import { expect, test, type Page } from '@playwright/test';

/** Reads from the test hook main.ts puts on window. */
type Hook = {
  game: {
    started: boolean;
    selection: number[];
    money: number;
    world: { outcome: string; entities: Array<{ id: number; type: number; team: string; x: number; y: number; size: number; order: { kind: string } }> };
  };
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

test('mission 1 opens with its briefing, then the map', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await expect(page.locator('#modal')).toContainText('Beginning');
  await page.screenshot({ path: 'test-results/mission-1-1-briefing.png' });
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#hud')).toContainText('Beginning');
  await expect(page.locator('#money')).toHaveText('$1000');
  await page.screenshot({ path: 'test-results/mission-1-1.png' });
  expect(errors).toEqual([]);
});

test('click selects the tank and right click sends it', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  const tank = await screenOf(page, 101);
  await page.mouse.click(tank.x, tank.y);
  await expect(page.locator('#panel')).toContainText('Легкий танк');
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
  await expect(page.locator('#money')).toHaveText('$600');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/mission-1-1-silo.png' });
  expect(errors).toEqual([]);
});

test('opens a later mission by URL', async ({ page }) => {
  await open(page, '?m=6.2');
  await expect(page.locator('#modal')).toContainText('Overload');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#hud')).toContainText('Finder');
  await page.screenshot({ path: 'test-results/mission-6-2.png' });
});

test('the mission list jumps to another mission', async ({ page }) => {
  await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.getByRole('button', { name: 'Місії' }).click();
  await page.getByRole('button', { name: '1. Search' }).click();
  await expect(page.locator('#modal')).toContainText('Search');
  expect(page.url()).toContain('m=3.1');
});

test('losing the HQ shows the defeat screen with a retry', async ({ page }) => {
  const errors = await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.keyboard.press('KeyH');
  await expect(page.locator('#panel')).toContainText('Штаб');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Самознищення' }).click();
  await expect(page.locator('#modal')).toContainText('Поразка');
  await expect(page.getByRole('button', { name: 'Ще раз' })).toBeVisible();
  expect(errors).toEqual([]);
});
