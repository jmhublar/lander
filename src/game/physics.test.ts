import { describe, expect, it, vi } from 'vitest';

import {
  GRAVITY,
  LANDER_SIZE,
  MAX_SAFE_VX,
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
  it('lands when touching a pad with safe velocity and angle', () => {
    const runtime = createRuntime({
      x: 150,
      y: centralPad.y - LANDER_SIZE + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const lander = runtime.game.lander as Lander;
    expect(runtime.game.status).toBe('landed');
    expect(lander.y).toBe(centralPad.y - LANDER_SIZE);
    expect(lander.vx).toBe(0);
    expect(lander.vy).toBe(0);
    expect(lander.angle).toBe(0);
    expect(runtime.game.score).toBe(300);
    expect(runtime.game.particles).toHaveLength(30);
    expect(audio.playLandingSound).toHaveBeenCalledTimes(1);
    expect(audio.playExplosionSound).not.toHaveBeenCalled();
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
