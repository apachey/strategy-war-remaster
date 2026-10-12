import { expect, test } from '@playwright/test';

test('opens mission 1 and shows the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?m=1.1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#hud')).toContainText('Beginning');
  await page.screenshot({ path: 'test-results/mission-1-1.png' });
  expect(errors).toEqual([]);
});

test('opens a later mission by URL', async ({ page }) => {
  await page.goto('/?m=6.2');
  await expect(page.locator('#hud')).toContainText('Finder');
  await page.screenshot({ path: 'test-results/mission-6-2.png' });
});
