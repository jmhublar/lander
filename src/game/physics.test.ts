import { describe, expect, it, vi } from 'vitest';

import {
  GRAVITY,
  LANDER_SIZE,
  MAX_SAFE_VX,
  MAX_SAFE_VY,
  THRUST,
  type GameRuntime,
  type LandingPad,
  type Lander,
  type TerrainPoint,
} from './entities';
import { getTerrainYAtX, update } from './physics';
import type { AudioSystem } from './audio';

type AudioStub = Pick<
  AudioSystem,
  'isDeathMarchPlaying' | 'playDeathMarchTheme' | 'playExplosionSound' | 'playLandingSound' | 'updateThrustSound'
>;

const flatTerrain: TerrainPoint[] = [
  { x: 0, y: 120 },
  { x: 300, y: 120 },
];

const centralPad: LandingPad = {
  x1: 100,
  x2: 200,
  y: 120,
  cx: 150,
};

function createAudioStub(): AudioStub {
  return {
    isDeathMarchPlaying: vi.fn(() => false),
    playDeathMarchTheme: vi.fn(),
    playExplosionSound: vi.fn(),
    playLandingSound: vi.fn(),
    updateThrustSound: vi.fn(),
  };
}

function createRuntime(landerOverrides: Partial<Lander> = {}): GameRuntime {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;

  return {
    canvas,
    ctx: {} as CanvasRenderingContext2D,
    overlays: {
      tiltBtn: null,
      nameEntryDiv: null,
      nameSubmitBtn: null,
      nameLetterEls: [],
      nameColEls: [],
    },
    input: {
      keys: {},
      touchThrusting: false,
      tiltAvailable: false,
      tiltRaw: 0,
      tiltBaseline: null,
      tiltListenerStarted: false,
      iosTiltPermissionNeeded: false,
      showTiltButton: false,
      hasTouched: false,
      isTouchDevice: false,
    },
    leaderboard: {
      entries: [],
      loaded: false,
      error: false,
      playerInitials: 'AAA',
      initialsIndex: 0,
      nameSubmitted: false,
      nameSubmitting: false,
    },
    game: {
      status: 'playing',
      level: 2,
      score: 0,
      lives: 3,
      highScore: 0,
      lander: {
        x: 150,
        y: 80,
        vx: 0,
        vy: 0,
        angle: 0,
        thrusting: false,
        outOfBounds: false,
        fuel: 100,
        maxFuel: 100,
        ...landerOverrides,
      },
      terrain: [...flatTerrain],
      landingPads: [centralPad],
      stars: [],
      particles: [],
      camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    },
    leaderboardUrl: 'https://example.invalid/scores',
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

describe('getTerrainYAtX', () => {
  it('interpolates terrain points linearly', () => {
    const runtime = createRuntime();
    runtime.game.terrain = [
      { x: 0, y: 100 },
      { x: 100, y: 140 },
      { x: 200, y: 160 },
    ];

    expect(getTerrainYAtX(runtime, 50)).toBe(120);
    expect(getTerrainYAtX(runtime, 150)).toBe(150);
  });

  it('applies smooth bounded taper on both sides outside terrain range', () => {
    const runtime = createRuntime();
    runtime.game.terrain = [
      { x: 20, y: 90 },
      { x: 100, y: 90 },
      { x: 180, y: 120 },
      { x: 260, y: 120 },
    ];

    const leftNear = getTerrainYAtX(runtime, 10);
    const leftFar = getTerrainYAtX(runtime, -300);
    const rightNear = getTerrainYAtX(runtime, 270);
    const rightFar = getTerrainYAtX(runtime, 700);

    expect(leftNear).not.toBe(runtime.canvas.height);
    expect(rightNear).not.toBe(runtime.canvas.height);
    expect(leftFar).toBeGreaterThan(leftNear);
    expect(rightFar).toBeGreaterThan(rightNear);
    expect(leftFar).toBeLessThanOrEqual(runtime.canvas.height * 1.1);
    expect(rightFar).toBeLessThanOrEqual(runtime.canvas.height * 1.1);
  });
});

describe('update fixed-step motion', () => {
  it.each([
    { thrustKey: false, expectedVy: GRAVITY, expectedParticles: 0 },
    { thrustKey: true, expectedVy: GRAVITY - THRUST, expectedParticles: 2 },
  ])('applies gravity and optional thrust per frame (thrustKey=$thrustKey)', ({
    thrustKey,
    expectedVy,
    expectedParticles,
  }) => {
    const runtime = createRuntime({ y: 20 });
    runtime.input.keys.ArrowUp = thrustKey;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.lander).not.toBeNull();
    const lander = runtime.game.lander as Lander;
    expect(lander.vx).toBeCloseTo(0, 10);
    expect(lander.vy).toBeCloseTo(expectedVy, 10);
    expect(lander.y).toBeCloseTo(20 + expectedVy, 10);
    expect(lander.thrusting).toBe(thrustKey);
    expect(runtime.game.particles).toHaveLength(expectedParticles);
    expect(audio.updateThrustSound).toHaveBeenCalledWith(thrustKey);
  });

  it('scales velocity changes by delta time', () => {
    const runtime = createRuntime({ y: 20 });
    runtime.input.keys.ArrowUp = true;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem, 1 / 30);

    const lander = runtime.game.lander as Lander;
    const expectedVy = (GRAVITY - THRUST) * 2;
    expect(lander.vy).toBeCloseTo(expectedVy, 10);
  });

  it('clamps delta time to a max 0.1 second step', () => {
    const runtime = createRuntime({ y: 20 });
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem, 0.5);

    const lander = runtime.game.lander as Lander;
    const expectedVy = GRAVITY * 6;
    expect(lander.vy).toBeCloseTo(expectedVy, 10);
  });
});

describe('update collision outcomes', () => {
  it('uses attempt peak abs(vy) for vertical bonus instead of touchdown abs(vy)', () => {
    const createLandingRuntime = () =>
      createRuntime({
        x: 150,
        y: centralPad.y - LANDER_SIZE + 0.1,
        vx: 0,
        vy: 0,
        angle: 0,
        fuel: 100,
      });

    const controlRuntime = createLandingRuntime();
    const peakedRuntime = createLandingRuntime();
    const audio = createAudioStub();

    peakedRuntime.game.lander = {
      ...(peakedRuntime.game.lander as Lander),
      y: 20,
      vy: MAX_SAFE_VY - GRAVITY - 0.001,
    };
    update(peakedRuntime, audio as unknown as AudioSystem);

    controlRuntime.game.lander = {
      ...(controlRuntime.game.lander as Lander),
      y: centralPad.y - LANDER_SIZE + 0.1,
      vy: 0,
    };
    peakedRuntime.game.lander = {
      ...(peakedRuntime.game.lander as Lander),
      y: centralPad.y - LANDER_SIZE + 0.1,
      vy: 0,
    };

    update(controlRuntime, audio as unknown as AudioSystem);
    update(peakedRuntime, audio as unknown as AudioSystem);

    const controlBaseBonus = controlRuntime.game.landingScoreAnimation?.baseBonus ?? 0;
    const peakedBaseBonus = peakedRuntime.game.landingScoreAnimation?.baseBonus ?? 0;

    expect(controlRuntime.game.status).toBe('landed');
    expect(peakedRuntime.game.status).toBe('landed');
    expect(peakedBaseBonus).toBeGreaterThan(controlBaseBonus);
  });

  it('increases base landing bonus as absolute vertical velocity increases', () => {
    const createLandingRuntime = (vy: number) =>
      createRuntime({
        x: 150,
        y: centralPad.y - LANDER_SIZE + 0.1,
        vx: 0,
        vy,
        angle: 0,
        fuel: 100,
      });

    const lowVyRuntime = createLandingRuntime(0);
    const highVyRuntime = createLandingRuntime(MAX_SAFE_VY - GRAVITY - 0.001);
    const audio = createAudioStub();

    update(lowVyRuntime, audio as unknown as AudioSystem);
    update(highVyRuntime, audio as unknown as AudioSystem);

    const lowBaseBonus = lowVyRuntime.game.landingScoreAnimation?.baseBonus ?? 0;
    const highBaseBonus = highVyRuntime.game.landingScoreAnimation?.baseBonus ?? 0;

    expect(lowVyRuntime.game.status).toBe('landed');
    expect(highVyRuntime.game.status).toBe('landed');
    expect(highBaseBonus).toBeGreaterThan(lowBaseBonus);
  });

  it('deferred/no immediate score commit: touchdown only creates pending landing award', () => {
    const runtime = createRuntime({
      x: 150,
      y: centralPad.y - LANDER_SIZE + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    runtime.game.attemptPeakSpeed = 0;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const lander = runtime.game.lander as Lander;
    expect(runtime.game.status).toBe('landed');
    expect(lander.y).toBe(centralPad.y - LANDER_SIZE);
    expect(lander.vx).toBe(0);
    expect(lander.vy).toBe(0);
    expect(lander.angle).toBe(0);
    expect(runtime.game.score).toBe(0);
    expect(runtime.game.landingScoreAnimation).toBeTruthy();
    expect(runtime.game.landingScoreAnimation).toMatchObject({
      displayedAward: 0,
      elapsedMs: 0,
      durationMs: 1200,
      committed: false,
    });
    expect(runtime.game.landingScoreAnimation?.baseBonus).toBeGreaterThan(0);
    expect(runtime.game.landingScoreAnimation?.finalAward).toBe(
      Math.round(
        (runtime.game.landingScoreAnimation?.baseBonus ?? 0) *
          (runtime.game.landingScoreAnimation?.velocityMultiplier ?? 0) *
          (runtime.game.landingScoreAnimation?.fuelMultiplier ?? 0),
      ),
    );
    expect(runtime.game.particles).toHaveLength(30);
    expect(audio.playLandingSound).toHaveBeenCalledTimes(1);
    expect(audio.playExplosionSound).not.toHaveBeenCalled();
  });

  it.each([
    { attemptPeakSpeed: 0, fuel: 100 },
    { attemptPeakSpeed: 200, fuel: 1 },
    { attemptPeakSpeed: 4.5, fuel: 40 },
    { attemptPeakSpeed: 10_000, fuel: 0.01 },
    { attemptPeakSpeed: -25, fuel: 300 },
  ])(
    'uses deterministic and clamped multipliers (peak=$attemptPeakSpeed fuel=$fuel)',
    ({ attemptPeakSpeed, fuel }) => {
      const createLandingRuntime = () =>
        createRuntime({
          x: 150,
          y: centralPad.y - LANDER_SIZE + 0.1,
          vx: 0,
          vy: 0,
          angle: 0,
          fuel,
        });
      const runtime = createLandingRuntime();
      const runtimeRepeat = createLandingRuntime();
      runtime.game.attemptPeakSpeed = attemptPeakSpeed;
      runtimeRepeat.game.attemptPeakSpeed = attemptPeakSpeed;
      const audio = createAudioStub();

      update(runtime, audio as unknown as AudioSystem);
      update(runtimeRepeat, audio as unknown as AudioSystem);

      const landingSpeedAtTouchdown = Math.hypot(0, GRAVITY);
      const trackedPeakSpeed = Math.max(attemptPeakSpeed, landingSpeedAtTouchdown);
      const safeSpeed = Math.hypot(MAX_SAFE_VX, MAX_SAFE_VY);
      const expectedVelocityMultiplier = clamp(1.25 - 0.2 * (trackedPeakSpeed / safeSpeed), 0.85, 1.25);
      const expectedFuelMultiplier = clamp(0.85 + 0.4 * (fuel / 100), 0.85, 1.25);

      expect(runtime.game.landingScoreAnimation).toBeTruthy();
      expect(runtimeRepeat.game.landingScoreAnimation).toBeTruthy();
      const animation = runtime.game.landingScoreAnimation;
      const repeatedAnimation = runtimeRepeat.game.landingScoreAnimation;

      expect(animation?.velocityMultiplier).toBeCloseTo(expectedVelocityMultiplier, 10);
      expect(animation?.fuelMultiplier).toBeCloseTo(expectedFuelMultiplier, 10);
      expect(animation?.velocityMultiplier).toBe(repeatedAnimation?.velocityMultiplier);
      expect(animation?.fuelMultiplier).toBe(repeatedAnimation?.fuelMultiplier);
      expect(animation?.finalAward).toBe(repeatedAnimation?.finalAward);
      expect(Number.isFinite(animation?.velocityMultiplier ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(animation?.fuelMultiplier ?? Number.NaN)).toBe(true);
      expect(animation?.velocityMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(animation?.velocityMultiplier).toBeLessThanOrEqual(1.25);
      expect(animation?.fuelMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(animation?.fuelMultiplier).toBeLessThanOrEqual(1.25);
      expect(animation?.finalAward).toBe(
        Math.round((animation?.baseBonus ?? 0) * (animation?.velocityMultiplier ?? 0) * (animation?.fuelMultiplier ?? 0)),
      );
    },
  );

  it('pending state persists until lifecycle commit', () => {
    const runtime = createRuntime({
      x: 150,
      y: centralPad.y - LANDER_SIZE + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const initialAnimation = runtime.game.landingScoreAnimation;
    const initialAward = initialAnimation?.finalAward;
    expect(runtime.game.score).toBe(0);
    expect(initialAward).toBeGreaterThan(0);

    for (let i = 0; i < 5; i += 1) {
      update(runtime, audio as unknown as AudioSystem, 1 / 30);
    }

    expect(runtime.game.status).toBe('landed');
    expect(runtime.game.score).toBe(0);
    expect(runtime.game.landingScoreAnimation).toBe(initialAnimation);
    expect(runtime.game.landingScoreAnimation?.finalAward).toBe(initialAward);
    expect(runtime.game.landingScoreAnimation?.displayedAward).toBe(0);
    expect(runtime.game.landingScoreAnimation?.elapsedMs).toBe(0);
    expect(runtime.game.landingScoreAnimation?.committed).toBe(false);
  });

  it('crashes when foot is exactly at the 8px pad threshold', () => {
    const runtime = createRuntime({
      x: 150,
      y: centralPad.y + 8 - LANDER_SIZE - GRAVITY,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    runtime.game.lives = 2;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('crashed');
    expect(runtime.game.lives).toBe(1);
    expect(runtime.game.particles).toHaveLength(60);
    expect(audio.playExplosionSound).toHaveBeenCalledTimes(1);
    expect(audio.playLandingSound).not.toHaveBeenCalled();
  });

  it('crashes when touching a pad above safe horizontal speed', () => {
    const runtime = createRuntime({
      x: 150,
      y: centralPad.y - LANDER_SIZE + 0.1,
      vx: MAX_SAFE_VX + 0.01,
      vy: 0,
      angle: 0,
    });
    runtime.game.lives = 3;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('crashed');
    expect(runtime.game.lives).toBe(2);
    expect(runtime.game.particles).toHaveLength(60);
    expect(audio.playExplosionSound).toHaveBeenCalledTimes(1);
    expect(audio.playLandingSound).not.toHaveBeenCalled();
  });

  it('crashes when the lander footprint clips a terrain slope edge', () => {
    const runtime = createRuntime({
      x: 100,
      y: 84,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    runtime.game.terrain = [
      { x: 80, y: 80 },
      { x: 120, y: 120 },
      { x: 300, y: 120 },
    ];
    runtime.game.landingPads = [];
    runtime.game.lives = 2;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('crashed');
    expect(runtime.game.lives).toBe(1);
    expect(audio.playExplosionSound).toHaveBeenCalledTimes(1);
    expect(audio.playLandingSound).not.toHaveBeenCalled();
  });
});
