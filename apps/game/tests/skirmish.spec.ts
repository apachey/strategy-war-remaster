import { expect, test, type Page } from '@playwright/test';

/** Reads from the test hook main.ts puts on window. */
type Hook = {
  game: { started: boolean; paused: boolean; world: { tick: number; mode: string; outcome: string; entities: Array<{ id: number; type: number; team: string }> } };
  players: Array<{ selection: number[]; money: number; side: string; placing: { type: number } | null; cursor: { x: number; y: number } | null }>;
  views: Array<{ rect: { x: number; y: number; w: number; h: number } }>;
  issue(cmd: unknown, side?: string): { ok: boolean };
};
const sw = (page: Page) => page.evaluate(() => {
  const h = (window as unknown as { __sw: Hook }).__sw;
  return {
    started: h.game.started,
    paused: h.game.paused,
    mode: h.game.world.mode,
    tick: h.game.world.tick,
    players: h.players.map((p) => ({ selection: p.selection, money: p.money, side: p.side, placing: p.placing?.type ?? null, cursor: p.cursor })),
    views: h.views.map((v) => v.rect),
  };
});

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** A fake standard gamepad: the game polls navigator.getGamepads() every frame. */
async function withGamepads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pads: unknown[] = [];
    const w = window as unknown as { __pad: (i: number) => { axes: number[]; buttons: Array<{ pressed: boolean; value: number }> } };
    w.__pad = (i: number) => {
      pads[i] ??= {
        index: i,
        id: `Test pad ${i}`,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      return pads[i] as ReturnType<typeof w.__pad>;
    };
    navigator.getGamepads = () => pads as Gamepad[];
  });
}

// These tests reload the page a few times and draw up to two views with software rendering on CI.
test.describe.configure({ timeout: 90_000 });

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, Start: 9, Up: 12 } as const;

/** Presses and releases a pad button, holding it for a few frames. */
async function press(page: Page, button: number, pad = 0): Promise<void> {
  await page.evaluate(([b, i]) => {
    const p = (window as unknown as { __pad: (i: number) => { buttons: Array<{ pressed: boolean; value: number }> } }).__pad(i);
    p.buttons[b] = { pressed: true, value: 1 };
  }, [button, pad] as const);
  await page.waitForTimeout(120);
  await page.evaluate(([b, i]) => {
    const p = (window as unknown as { __pad: (i: number) => { buttons: Array<{ pressed: boolean; value: number }> } }).__pad(i);
    p.buttons[b] = { pressed: false, value: 0 };
  }, [button, pad] as const);
  await page.waitForTimeout(120);
}

test('the skirmish screen picks a map, an opponent and money, then plays', async ({ page }) => {
  const errors = await open(page, '?s=4');
  await expect(page.locator('#modal')).toContainText('Скірміш');
  await expect(page.locator('#modal h1')).toHaveText('Арена');
  await expect(page.locator('#modal button.active')).toContainText(['4. Арена', 'Нормальний ШІ', '$3000', 'Українська']);
  await page.screenshot({ path: 'test-results/skirmish-setup.png' });
  await page.getByRole('button', { name: 'Важкий ШІ' }).click();
  await page.waitForURL(/vs=hard/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '6. Шукач' }).click();
  await page.waitForURL(/s=6/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#modal h1')).toHaveText('Шукач');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#hud')).toContainText('Скірміш · Шукач · Важкий ШІ');
  await expect(page.locator('#money')).toHaveText('$3000');
  const s = await sw(page);
  expect(s.mode).toBe('skirmish');
  expect(s.players).toHaveLength(1);
  await page.screenshot({ path: 'test-results/skirmish-6.png' });
  expect(errors).toEqual([]);
});

test('the Skirmish button opens the last skirmish setup from the campaign', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('sw.settings', JSON.stringify({ lang: 'uk', difficulty: 'normal', skirmish: { kind: 'skirmish', mapIndex: 1, opponent: 'easy', money: 6000 } })),
  );
  await open(page, '?m=1.1');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.getByRole('button', { name: 'Скірміш' }).click();
  await page.waitForURL(/s=2/);
  expect(page.url()).toContain('vs=easy');
  expect(page.url()).toContain('money=6000');
  await expect(page.locator('#modal h1')).toHaveText('Пошук бази');
});

test('two players split the screen, each with their own money and panel', async ({ page }) => {
  const errors = await open(page, '?s=4&vs=human');
  await expect(page.locator('#modal')).toContainText('Удвох');
  await expect(page.locator('#modal')).toContainText('геймпад');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect(page.locator('#hud')).toContainText('Скірміш · Арена · Удвох');
  await expect(page.locator('#badge-1')).toHaveText('Гравець 1 · $3000');
  await expect(page.locator('#badge-2')).toHaveText('Гравець 2 · $3000');
  const s = await sw(page);
  expect(s.players.map((p) => p.side)).toEqual(['player', 'enemy']);
  expect(s.views[0]!.w).toBeLessThan(700);
  expect(s.views[1]!.x).toBeGreaterThan(600);
  // Player 1's mouse works on the left half: H selects the HQ, and the panel on the left shows it.
  await page.keyboard.press('KeyH');
  await expect(page.locator('#panel')).toContainText('Штаб');
  await expect(page.locator('#panel-2')).toContainText('Виділіть');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/two-players.png' });
  expect(errors).toEqual([]);
});

test('player 2 plays with a gamepad: cursor, select, build menu, pause', async ({ page }) => {
  await withGamepads(page);
  const errors = await open(page, '?s=4&vs=human');
  await page.evaluate(() => (window as unknown as { __pad: (i: number) => unknown }).__pad(0));
  // Start on the pad starts the game.
  await press(page, PAD.Start);
  await expect.poll(async () => (await sw(page)).started).toBe(true);
  const before = (await sw(page)).players[1]!.cursor!;
  expect(before).not.toBeNull();
  expect((await sw(page)).players[0]!.cursor).toBeNull();
  // The left stick moves player 2's cursor.
  await page.evaluate(() => ((window as unknown as { __pad: (i: number) => { axes: number[] } }).__pad(0).axes = [0.8, 0.5, 0, 0]));
  await page.waitForTimeout(300);
  await page.evaluate(() => ((window as unknown as { __pad: (i: number) => { axes: number[] } }).__pad(0).axes = [0, 0, 0, 0]));
  const after = (await sw(page)).players[1]!.cursor!;
  expect(after.x).toBeGreaterThan(before.x);
  // Y selects their HQ; RB moves the highlight to the factory, X starts placing it, B cancels.
  await press(page, PAD.Y);
  await expect(page.locator('#panel-2')).toContainText('Штаб');
  await expect(page.locator('#panel-2 button.pad-focus')).toContainText('Сховище');
  await press(page, PAD.RB);
  await expect(page.locator('#panel-2 button.pad-focus')).toContainText('Танковий завод');
  await press(page, PAD.X);
  await expect.poll(async () => (await sw(page)).players[1]!.placing).toBe(2);
  await page.screenshot({ path: 'test-results/two-players-gamepad.png' });
  await press(page, PAD.B);
  await expect.poll(async () => (await sw(page)).players[1]!.placing).toBeNull();
  // Player 1 is untouched by player 2's pad.
  expect((await sw(page)).players[0]!.selection).toEqual([]);
  await press(page, PAD.Start);
  await expect.poll(async () => (await sw(page)).paused).toBe(true);
  expect(errors).toEqual([]);
});

test('with two gamepads player 1 gets the first and player 2 the second', async ({ page }) => {
  await withGamepads(page);
  await open(page, '?s=1&vs=human');
  await page.evaluate(() => {
    const w = window as unknown as { __pad: (i: number) => unknown };
    w.__pad(0);
    w.__pad(1);
  });
  await page.getByRole('button', { name: 'Почати' }).click();
  await press(page, PAD.Y, 0);
  await expect(page.locator('#panel')).toContainText('Штаб');
  await expect(page.locator('#panel-2')).not.toContainText('Штаб');
  await press(page, PAD.Y, 1);
  await expect(page.locator('#panel-2')).toContainText('Штаб');
});

test('destroying player 2\'s HQ shows player 1 as the winner', async ({ page }) => {
  const errors = await open(page, '?s=1&vs=human');
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.evaluate(() => {
    const h = (window as unknown as { __sw: Hook }).__sw;
    const hq = h.game.world.entities.find((e) => e.type === 4 && e.team === 'enemy')!;
    h.issue({ kind: 'destruct', id: hq.id }, 'enemy');
  });
  // Software rendering on CI draws two views slowly, so the 2 s before the result can take longer.
  await expect(page.locator('#modal')).toContainText('Переміг гравець 1!', { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/two-players-won.png' });
  await expect(page.getByRole('button', { name: 'Ще раз' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a skirmish saves and loads like a mission', async ({ page }) => {
  const errors = await open(page, '?s=3&vs=easy&speed=8');
  await page.getByRole('button', { name: 'Почати' }).click();
  await expect.poll(async () => (await sw(page)).tick).toBeGreaterThan(100);
  await page.keyboard.press('F5');
  await expect(page.locator('#toast')).toContainText('Гру збережено');
  await page.keyboard.press('F9');
  await page.waitForURL(/load=quick/);
  expect(page.url()).toContain('s=3');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const s = await sw(page);
  expect(s.started).toBe(true);
  expect(s.mode).toBe('skirmish');
  await page.getByRole('button', { name: 'Збереження' }).click();
  await expect(page.locator('#modal')).toContainText('Скірміш · Окраїни · Легкий ШІ');
  expect(errors).toEqual([]);
});
