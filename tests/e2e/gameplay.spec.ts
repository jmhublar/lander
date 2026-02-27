import { expect, test, type Page } from '@playwright/test';

type RuntimeSnapshot = {
  status: string;
  fuel: number;
  thrusting: boolean;
  hasCanvas: boolean;
  score: number;
  landingAwardDisplayed: number | null;
  landingAwardFinal: number | null;
  landingAwardCommitted: boolean | null;
};

const RUNTIME_READY_TIMEOUT_MS = 20_000;

async function getRuntimeSnapshot(page: Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: {
        getRuntime: () => {
          game: {
            status: string;
            score: number;
            lander: { fuel: number; thrusting: boolean } | null;
            landingScoreAnimation?: {
              displayedAward: number;
              finalAward: number;
              committed: boolean;
            } | null;
          };
        };
      };
    }).__LANDER_TEST_API__?.getRuntime();

    const landingAnimation = runtime?.game.landingScoreAnimation;

    return {
      status: runtime?.game.status ?? 'unknown',
      fuel: runtime?.game.lander?.fuel ?? -1,
      thrusting: runtime?.game.lander?.thrusting ?? false,
      hasCanvas: Boolean(document.querySelector('canvas#c')),
      score: runtime?.game.score ?? -1,
      landingAwardDisplayed: landingAnimation?.displayedAward ?? null,
      landingAwardFinal: landingAnimation?.finalAward ?? null,
      landingAwardCommitted: landingAnimation?.committed ?? null,
    };
  });
}

async function forceSafeLandingState(page: Page): Promise<void> {
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
}

async function forceCrashTransition(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = (window as Window & {
      __LANDER_TEST_API__?: {
        getRuntime: () => {
          game: {
            status: string;
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
    runtime.game.terrain = [
      { x: -400, y: 300 },
      { x: 1400, y: 300 },
    ];
    runtime.game.landingPads = [{ x1: 350, x2: 450, y: 300, cx: 400 }];
    runtime.game.particles = [];
    runtime.game.lander = {
      x: 2000,
      y: 2000,
      vx: 30,
      vy: 30,
      angle: 1.2,
      thrusting: false,
      outOfBounds: true,
      fuel: 100,
      maxFuel: 100,
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

test('landed score award counts up, stabilizes, and commits on advance', async ({ page }) => {
  await loadGame(page);
  await forceSafeLandingState(page);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('landed');

  const touchdownSnapshot = await getRuntimeSnapshot(page);
  expect(touchdownSnapshot.landingAwardFinal).not.toBeNull();
  const finalAward = touchdownSnapshot.landingAwardFinal as number;
  const earlyThreshold = Math.max(1, Math.floor(finalAward * 0.4));
  const lateThreshold = Math.max(earlyThreshold + 1, Math.floor(finalAward * 0.75));
  expect(finalAward).toBeGreaterThan(0);
  expect(touchdownSnapshot.landingAwardCommitted).toBe(false);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      const displayed = snapshot.landingAwardDisplayed ?? -1;
      const final = snapshot.landingAwardFinal ?? -1;
      if (displayed > 0 && displayed <= earlyThreshold && displayed < final) {
        return displayed;
      }
      return -1;
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      const displayed = snapshot.landingAwardDisplayed ?? -1;
      const final = snapshot.landingAwardFinal ?? -1;
      return displayed >= lateThreshold && displayed <= final;
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return {
        committed: snapshot.landingAwardCommitted,
        displayed: snapshot.landingAwardDisplayed,
        final: snapshot.landingAwardFinal,
        score: snapshot.score,
      };
    })
    .toEqual({
      committed: true,
      displayed: finalAward,
      final: finalAward,
      score: finalAward,
    });

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return {
        displayed: snapshot.landingAwardDisplayed,
        final: snapshot.landingAwardFinal,
        score: snapshot.score,
      };
    })
    .toEqual({
      displayed: finalAward,
      final: finalAward,
      score: finalAward,
    });

  await forceSafeLandingState(page);
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('landed');

  const pendingSnapshot = await getRuntimeSnapshot(page);
  expect(pendingSnapshot.landingAwardFinal).not.toBeNull();
  expect(pendingSnapshot.landingAwardCommitted).toBe(false);

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      const displayed = snapshot.landingAwardDisplayed ?? -1;
      const final = snapshot.landingAwardFinal ?? -1;
      return final > 0 && displayed >= 0 && displayed < final && snapshot.landingAwardCommitted === false;
    })
    .toBe(true);

  await page.keyboard.press('Space');

  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return { status: snapshot.status, score: snapshot.score };
    })
    .toEqual({ status: 'playing', score: pendingSnapshot.landingAwardFinal as number });
});

test('landing and collision transitions expose stable status signals', async ({ page }) => {
  await loadGame(page);

  await forceSafeLandingState(page);
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('landed');

  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('playing');

  await forceCrashTransition(page);
  await expect
    .poll(async () => {
      const snapshot = await getRuntimeSnapshot(page);
      return snapshot.status;
    })
    .toBe('crashed');

  const crashSnapshot = await getRuntimeSnapshot(page);
  expect(crashSnapshot.status).toBe('crashed');
  expect(crashSnapshot.hasCanvas).toBe(true);
});
