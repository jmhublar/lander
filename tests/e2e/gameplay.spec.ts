import { expect, test, type Page } from '@playwright/test';

type RuntimeSnapshot = {
  status: string;
  fuel: number;
  thrusting: boolean;
  overlayPresent: boolean;
  hasCanvas: boolean;
};

const RUNTIME_READY_TIMEOUT_MS = 20_000;

async function hasStartOverlay(page: Page): Promise<boolean> {
  return page.locator('#startOverlay').count().then((count) => count > 0);
}

async function clickStartOverlay(page: Page): Promise<void> {
  await page.locator('#startOverlay').click();
}

async function getRuntimeSnapshot(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: { getRuntime: () => { game: { status: string; lander: { fuel: number; thrusting: boolean } | null } } };
    }).__LANDER_TEST_API__?.getRuntime();

    const overlay = document.querySelector('#startOverlay');

    return {
      status: runtime?.game.status ?? 'unknown',
      fuel: runtime?.game.lander?.fuel ?? -1,
      thrusting: runtime?.game.lander?.thrusting ?? false,
      overlayPresent: Boolean(overlay),
      hasCanvas: Boolean(document.querySelector('canvas#c')),
    };
  });
}

async function startGameFromOverlay(page: Page): Promise<void> {
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
  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(true);
  await clickStartOverlay(page);
  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(false);
}

test('space dismisses overlay but keeps title state on first press', async ({ page }) => {
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

  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(true);

  await page.keyboard.press('Space');

  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(false);

  const snapshot = await getRuntimeSnapshot(page);
  expect(snapshot.status).toBe('title');
});

test('outside click before start does not dismiss overlay', async ({ page }) => {
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

  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(true);

  await page.mouse.click(8, 8);

  const snapshot = await getRuntimeSnapshot(page);
  expect(snapshot.overlayPresent).toBe(true);
  expect(snapshot.status).toBe('title');
});

test('starts only after clicking the start overlay', async ({ page }) => {
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
  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(true);
  await expect(page.locator('canvas#c')).toHaveCount(1);

  const beforeClick = await getRuntimeSnapshot(page);
  expect(beforeClick.hasCanvas).toBe(true);
  expect(beforeClick.overlayPresent).toBe(true);
  expect(beforeClick.status).toBe('title');

  await clickStartOverlay(page);
  await expect.poll(async () => hasStartOverlay(page), { timeout: RUNTIME_READY_TIMEOUT_MS }).toBe(false);

  const afterClick = await getRuntimeSnapshot(page);
  expect(afterClick.overlayPresent).toBe(false);
  expect(afterClick.status).toBe('title');
});

test('thrust input engages thrust and consumes fuel', async ({ page }) => {
  await startGameFromOverlay(page);

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
  await startGameFromOverlay(page);

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
  await startGameFromOverlay(page);

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
