import { expect, test, type Page } from '@playwright/test';

type RuntimeSnapshot = {
  status: string;
  fuel: number;
  thrusting: boolean;
  hasCanvas: boolean;
};

const RUNTIME_READY_TIMEOUT_MS = 20_000;

async function getRuntimeSnapshot(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: { getRuntime: () => { game: { status: string; lander: { fuel: number; thrusting: boolean } | null } } };
    }).__LANDER_TEST_API__?.getRuntime();

    return {
      status: runtime?.game.status ?? 'unknown',
      fuel: runtime?.game.lander?.fuel ?? -1,
      thrusting: runtime?.game.lander?.thrusting ?? false,
      hasCanvas: Boolean(document.querySelector('canvas#c')),
    };
  });
}

async function loadGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean((window as Window & { __LANDER_TEST_API__?: unknown }).__LANDER_TEST_API__),
      ),
      { timeout: RUNTIME_READY_TIMEOUT_MS },
    )
    .toBe(true);
}

test('space from title starts gameplay immediately', async ({ page }) => {
  await loadGame(page);
  await page.keyboard.press('Space');

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('playing');
});

test('click on title starts gameplay', async ({ page }) => {
  await loadGame(page);
  await expect(page.locator('canvas#c')).toHaveCount(1);

  const beforeClick = await getRuntimeSnapshot(page);
  expect(beforeClick.hasCanvas).toBe(true);
  expect(beforeClick.status).toBe('title');

  await page.mouse.click(400, 300);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('playing');
});

test('thrust input engages thrust and consumes fuel', async ({ page }) => {
  await loadGame(page);

  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('playing');

  const initialFuel = await page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: { getRuntime: () => { game: { lander: { fuel: number } | null } } };
    }).__LANDER_TEST_API__?.getRuntime();
    return runtime?.game.lander?.fuel ?? -1;
  });
  expect(initialFuel).toBeGreaterThan(0);

  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.thrusting;
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.fuel;
    })
    .toBeLessThan(initialFuel);
  await page.keyboard.up('ArrowUp');
});

test('outside clicks after start do not return game to title', async ({ page }) => {
  await loadGame(page);

  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('playing');

  await page.mouse.click(8, 8);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .not.toBe('title');
});

test('landing and collision transitions expose stable status signals', async ({ page }) => {
  await loadGame(page);

  await page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: {
        getRuntime: () => {
          game: {
            status: string;
            level: number;
            lives: number;
            score: number;
            terrain: Array<{ x: number; y: number }>;
            landingPads: Array<{ x1: number; x2: number; y: number; cx: number }>;
            particles: unknown[];
            lander: {
              x: number;
              y: number;
              vx: number;
              vy: number;
              angle: number;
              thrusting: boolean;
              outOfBounds: boolean;
              fuel: number;
              maxFuel: number;
            };
          };
        };
      };
    }).__LANDER_TEST_API__?.getRuntime();

    if (!runtime) {
      return;
    }

    runtime.game.status = 'playing';
    runtime.game.level = 1;
    runtime.game.score = 0;
    runtime.game.lives = 3;
    runtime.game.terrain = [
      { x: -400, y: 300 },
      { x: 1400, y: 300 },
    ];
    runtime.game.landingPads = [{ x1: 350, x2: 450, y: 300, cx: 400 }];
    runtime.game.particles = [];
    runtime.game.lander = {
      x: 400,
      y: 286,
      vx: 0.1,
      vy: 0.2,
      angle: 0.05,
      thrusting: false,
      outOfBounds: false,
      fuel: 100,
      maxFuel: 100,
    };
  });

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('landed');

  await page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: {
        getRuntime: () => {
          game: {
            status: string;
            lives: number;
            terrain: Array<{ x: number; y: number }>;
            landingPads: Array<{ x1: number; x2: number; y: number; cx: number }>;
            particles: unknown[];
            lander: {
              x: number;
              y: number;
              vx: number;
              vy: number;
              angle: number;
              thrusting: boolean;
              outOfBounds: boolean;
              fuel: number;
              maxFuel: number;
            };
          };
        };
      };
    }).__LANDER_TEST_API__?.getRuntime();

    if (!runtime) {
      return;
    }

    runtime.game.status = 'playing';
    runtime.game.lives = 3;
    runtime.game.terrain = [
      { x: -400, y: 300 },
      { x: 1400, y: 300 },
    ];
    runtime.game.landingPads = [{ x1: 350, x2: 450, y: 300, cx: 400 }];
    runtime.game.particles = [];
    runtime.game.lander = {
      x: 400,
      y: 286,
      vx: 1.5,
      vy: 1.8,
      angle: 0.8,
      thrusting: false,
      outOfBounds: false,
      fuel: 100,
      maxFuel: 100,
    };
  });

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('crashed');
});
