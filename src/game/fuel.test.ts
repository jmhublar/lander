import { describe, expect, it, vi } from 'vitest';

import { FUEL_CONSUMPTION_RATE, type GameRuntime, type Lander } from './entities';
import { update } from './physics';
import type { AudioSystem } from './audio';

type AudioStub = Pick<
  AudioSystem,
  'isDeathMarchPlaying' | 'playDeathMarchTheme' | 'playExplosionSound' | 'playLandingSound' | 'updateThrustSound'
>;

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
      level: 1,
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
      terrain: [
        { x: 0, y: 120 },
        { x: 300, y: 120 },
      ],
      landingPads: [{ x1: 100, x2: 200, y: 120, cx: 150 }],
      stars: [],
      particles: [],
      camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    },
    leaderboardUrl: 'https://example.invalid/scores',
  };
}

describe('fuel mechanic', () => {
  it('consumes fuel while thrusting', () => {
    const runtime = createRuntime({ fuel: 10, maxFuel: 10, y: 20 });
    runtime.input.keys.ArrowUp = true;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const lander = runtime.game.lander as Lander;
    expect(lander.thrusting).toBe(true);
    expect(lander.fuel).toBeCloseTo(10 - FUEL_CONSUMPTION_RATE, 10);
  });

  it('does not allow fuel to drop below zero', () => {
    const runtime = createRuntime({ fuel: FUEL_CONSUMPTION_RATE / 2, maxFuel: 1, y: 20 });
    runtime.input.keys.ArrowUp = true;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const lander = runtime.game.lander as Lander;
    expect(lander.fuel).toBe(0);
  });

  it('disables thrust when fuel is empty', () => {
    const runtime = createRuntime({ fuel: 0, maxFuel: 100, y: 20 });
    runtime.input.keys.ArrowUp = true;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    const lander = runtime.game.lander as Lander;
    expect(lander.thrusting).toBe(false);
    expect(runtime.game.particles).toHaveLength(0);
    expect(audio.updateThrustSound).toHaveBeenCalledWith(false);
  });

  it('allows successful landing with empty fuel', () => {
    const runtime = createRuntime({
      x: 150,
      y: 120 - 14 + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
      fuel: 0,
      maxFuel: 100,
    });
    runtime.game.lives = 2;
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('landed');
    expect(runtime.game.lives).toBe(2);
    expect(audio.playExplosionSound).not.toHaveBeenCalled();
    expect(audio.playLandingSound).toHaveBeenCalledTimes(1);
  });
});
