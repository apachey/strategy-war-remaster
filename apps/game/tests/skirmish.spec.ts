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

/** Start on the skirmish screen: the page loads the chosen match and starts it without asking again. */
async function startMatch(page: Page, url: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Почати' }).click();
  await page.waitForURL(url);
  await page.waitForURL(/go=1/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sw: Hook }).__sw.game.started)).toBe(true);
}

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
  await expect(page.locator('#modal button.active')).toContainText(['Українська', '4. Арена', 'Нормальний ШІ', '$3000', 'Хюмани', 'Ховери']);
  await expect(page.locator('#modal')).toContainText('Ви');
  await expect(page.locator('#modal')).toContainText('Компʼютер');
  // Each side wears a colour the other one cannot pick.
  await expect(page.locator('#modal [data-color0="olive"]')).toHaveClass(/active/);
  await expect(page.locator('#modal [data-color0="red"]')).toBeDisabled();
  await expect(page.locator('#modal [data-color1="olive"]')).toBeDisabled();
  await page.screenshot({ path: 'test-results/skirmish-setup.png' });
  // Choices redraw the screen without loading anything; Start loads the match and goes straight in.
  await page.getByRole('button', { name: 'Важкий ШІ' }).click();
  await page.getByRole('button', { name: '6. Шукач' }).click();
  await expect(page.locator('#modal h1')).toHaveText('Шукач');
  expect(page.url()).toContain('s=4');
  await startMatch(page, /s=6/);
  await expect(page.locator('#hud')).toContainText('Скірміш · Шукач · Важкий ШІ');
  await expect(page.locator('#money')).toHaveText('$3000');
  const s = await sw(page);
  expect(s.mode).toBe('skirmish');
  expect(s.players).toHaveLength(1);
  await page.screenshot({ path: 'test-results/skirmish-6.png' });
  expect(errors).toEqual([]);
});

test('each side picks its race and colours; objects carry their race names', async ({ page }) => {
  const errors = await open(page, '?s=4&vs=hard');
  await page.locator('#modal [data-race0="walker"]').click();
  await page.locator('#modal [data-color0="blue"]').click();
  await page.locator('#modal [data-color1="red"]').click();
  // Secondary colours: black accents for the first side, and red on red for the second (its own main colour).
  await expect(page.locator('#modal')).toContainText('Другий колір');
  await expect(page.locator('#modal [data-second0]')).toHaveCount(24);
  await expect(page.locator('#modal [data-second0]:disabled, #modal [data-second1]:disabled')).toHaveCount(0);
  await expect(page.locator('#modal [data-second0="cyan"]')).toHaveClass(/active/);
  await page.locator('#modal [data-second0="black"]').click();
  await page.locator('#modal [data-second1="red"]').click();
  await expect(page.locator('#modal button.active')).toContainText(['Ходуни', 'Ховери']);
  await expect(page.locator('#modal [data-color1="blue"]')).toBeDisabled();
  await expect(page.locator('#modal [data-color0="black"]')).toHaveAttribute('title', 'Чорний');
  await page.screenshot({ path: 'test-results/skirmish-setup-races.png' });
  await startMatch(page, /c2=black%2Cred|c2=black,red/);
  const sides = await page.evaluate(() => {
    const w = (window as unknown as { __sw: { game: { world: { sides: Record<string, { race: string; color: string; color2: string }> } } } }).__sw.game.world;
    return { player: [w.sides.player!.race, w.sides.player!.color, w.sides.player!.color2], enemy: [w.sides.enemy!.race, w.sides.enemy!.color, w.sides.enemy!.color2] };
  });
  expect(sides).toEqual({ player: ['walker', 'blue', 'black'], enemy: ['hover', 'red', 'red'] });
  // The computer's HQ, shown through the shroud, has its race's own name.
  await page.evaluate(() => {
    const h = (window as unknown as { __sw: Hook & { players: Array<{ select(ids: number[]): void }>; game: { world: { sides: Record<string, { explored: Uint8Array }> } } } }).__sw;
    h.game.world.sides.player!.explored.fill(1);
    const hq = h.game.world.entities.find((e) => e.type === 4 && e.team === 'enemy')!;
    h.players[0]!.select([hq.id]);
  });
  await expect(page.locator('#panel .title')).toHaveText('Святилище');
  // Zoomed out: blue walkers bottom left, red hovers top right.
  await page.keyboard.press('Minus');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/skirmish-walkers-blue.png' });
  // The walker HQ builds walker buildings.
  await page.keyboard.press('KeyH');
  await expect(page.locator('#panel .title')).toHaveText('Вулик');
  await expect(page.locator('#panel button.build')).toContainText(['Запасник', 'Інкубатор', 'Плювач', 'Шипи']);
  // The choice is remembered for the Skirmish button.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sw.settings') ?? '{}').skirmish);
  expect(stored).toMatchObject({ races: ['walker', 'hover'], colors: ['blue', 'red'], colors2: ['black', 'red'] });
  expect(errors).toEqual([]);
});

test('the colour grids pick dark and light shades and fit a 1280×720 window', async ({ page }) => {
  const errors = await open(page, '?s=4&vs=hard');
  // Each side has a main grid and a smaller secondary grid: 8 hues across, light, base and dark shades down.
  for (const attr of ['color0', 'second0', 'color1', 'second1']) await expect(page.locator(`#modal [data-${attr}]`)).toHaveCount(24);
  const grid = page.locator('#modal [data-side="0"] .colors').first().locator('button');
  const hues = await grid.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.color0));
  expect(hues.slice(0, 8)).toEqual(['pink', 'peach', 'sunny', 'lime', 'sky', 'lightblue', 'lilac', 'white']);
  expect(hues.slice(16)).toEqual(['crimson', 'brown', 'olive', 'forest', 'cyan', 'indigo', 'purple', 'black']);
  const pick = async (attr: string, color: string) => {
    await page.locator(`#modal [data-${attr}="${color}"]`).click();
    await expect(page.locator(`#modal [data-${attr}="${color}"]`)).toHaveClass(/active/);
  };
  // A dark main colour and a light accent for the first side, a light main colour and a dark accent for the second.
  await pick('color0', 'crimson');
  await pick('second0', 'sky');
  await pick('color1', 'pink');
  await pick('second1', 'indigo');
  // Only the other side's exact colour is taken; the other shades of its hue stay free.
  await expect(page.locator('#modal [data-color1="crimson"]')).toBeDisabled();
  await expect(page.locator('#modal [data-color0="pink"]')).toBeDisabled();
  await expect(page.locator('#modal [data-color0="red"]')).toBeEnabled();
  await expect(page.locator('#modal [data-color0]:disabled, #modal [data-color1]:disabled')).toHaveCount(2);
  await expect(page.locator('#modal [data-color0="lightblue"]')).toHaveAttribute('title', 'Світло-синій');
  await expect(page.locator('#modal [data-second1="purple"]')).toHaveAttribute('aria-label', 'Глибокий фіолетовий');
  // The whole setup, Start included, fits the window without scrolling.
  const card = page.locator('#modal .card');
  expect(await card.evaluate((c) => c.scrollHeight <= c.clientHeight)).toBe(true);
  const start = await page.getByRole('button', { name: 'Почати' }).boundingBox();
  expect(start).not.toBeNull();
  expect(start!.x).toBeGreaterThanOrEqual(0);
  expect(start!.y).toBeGreaterThanOrEqual(0);
  expect(start!.x + start!.width).toBeLessThanOrEqual(1280);
  expect(start!.y + start!.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: 'test-results/skirmish-setup-grid.png' });
  await startMatch(page, /c2=sky%2Cindigo|c2=sky,indigo/);
  const sides = await page.evaluate(() => {
    const w = (window as unknown as { __sw: { game: { world: { sides: Record<string, { color: string; color2: string }> } } } }).__sw.game.world;
    return [w.sides.player!.color, w.sides.player!.color2, w.sides.enemy!.color, w.sides.enemy!.color2];
  });
  expect(sides).toEqual(['crimson', 'sky', 'pink', 'indigo']);
  expect(errors).toEqual([]);
});

test('a mirror match names the other side\'s race; English names follow the race', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sw.settings', JSON.stringify({ lang: 'en', difficulty: 'normal' })));
  const errors = await open(page, '?s=4&vs=hard&r=hover,hover&c=violet,orange&c2=white,black');
  await expect(page.locator('#modal')).toContainText('Second colour');
  await expect(page.locator('#modal [data-second1="black"]')).toHaveClass(/active/);
  await expect(page.locator('#modal [data-color0="black"]')).toHaveAttribute('title', 'Black');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.press('KeyH');
  await expect(page.locator('#panel .title')).toHaveText('Sanctum');
  await expect(page.locator('#panel button.build')).toContainText(['Crystal Vault', 'Hangar', 'Plasma Spire', 'Barrier']);
  await page.evaluate(() => {
    const h = (window as unknown as { __sw: Hook & { players: Array<{ select(ids: number[]): void }>; game: { world: { sides: Record<string, { explored: Uint8Array }> } } } }).__sw;
    h.game.world.sides.player!.explored.fill(1);
    const hq = h.game.world.entities.find((e) => e.type === 4 && e.team === 'enemy')!;
    h.players[0]!.select([hq.id]);
  });
  await expect(page.locator('#panel .title')).toHaveText('Sanctum · hovers');
  expect(errors).toEqual([]);
});

test('the Skirmish button on the main screen opens the last skirmish setup', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('sw.settings', JSON.stringify({
        lang: 'uk',
        difficulty: 'normal',
        skirmish: { kind: 'skirmish', mapIndex: 1, opponent: 'easy', money: 6000, races: ['hover', 'walker'], colors: ['pink', 'pink'], colors2: ['magenta', 'lime'] },
      })),
  );
  await open(page, '');
  await page.getByRole('button', { name: 'Скірміш' }).click();
  await page.waitForURL(/s=2/);
  expect(page.url()).toContain('vs=easy');
  expect(page.url()).toContain('money=6000');
  // A stored setup with both sides in one colour gives the second side the next free colour in the list.
  expect(decodeURIComponent(page.url())).toContain('r=hover,walker');
  expect(decodeURIComponent(page.url())).toContain('c=pink,brown');
  // An unknown colour falls back to the side's default secondary colour (cyan); a known one stays.
  expect(decodeURIComponent(page.url())).toContain('c2=cyan,lime');
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
  // Player 2 plays the hovers, so the HQ is a sanctum and builds hover buildings.
  await press(page, PAD.Y);
  await expect(page.locator('#panel-2')).toContainText('Святилище');
  await expect(page.locator('#panel-2 button.pad-focus')).toContainText('Кристалосховище');
  await press(page, PAD.RB);
  await expect(page.locator('#panel-2 button.pad-focus')).toContainText('Ангар');
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
  await expect(page.locator('#panel-2')).not.toContainText('Святилище');
  await press(page, PAD.Y, 1);
  await expect(page.locator('#panel-2')).toContainText('Святилище');
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
  await expect.poll(async () => (await sw(page)).tick, { timeout: 20_000 }).toBeGreaterThan(100);
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
