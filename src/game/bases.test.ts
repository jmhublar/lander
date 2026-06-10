import { describe, expect, it, vi } from 'vitest';

import {
  LANDER_SIZE,
  PLATFORM_DECK_THICKNESS,
  PLATFORM_HEIGHT,
  generateBases,
  generateTerrain,
  type Base,
  type GameRuntime,
  type Lander,
  type LandingPad,
  type Structure,
} from './entities';
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
      terrain: [
        { x: 0, y: 120 },
        { x: 300, y: 120 },
      ],
      landingPads: [],
      bases: [],
      stars: [],
      particles: [],
      camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    },
    leaderboardUrl: 'https://example.invalid/scores',
  };
}

const PLATFORM_DECK_Y = 80;

function makeTestPlatformBase(): { base: Base; pad: LandingPad } {
  const deckY = PLATFORM_DECK_Y;
  const deckBottomY = deckY + PLATFORM_DECK_THICKNESS;
  const groundY = 120;
  const structure: Structure = {
    kind: 'platform',
    x: 160,
    y: groundY,
    width: 40,
    height: PLATFORM_HEIGHT,
    colliders: [
      [
        { x: 140, y: deckY },
        { x: 180, y: deckY },
        { x: 180, y: deckBottomY },
        { x: 140, y: deckBottomY },
        { x: 140, y: deckY },
      ],
      [
        { x: 143, y: deckBottomY },
        { x: 143, y: groundY },
      ],
      [
        { x: 177, y: deckBottomY },
        { x: 177, y: groundY },
      ],
    ],
  };
  const pad: LandingPad = { x1: 140, x2: 180, y: deckY, cx: 160, multiplier: 3 };
  return { base: { name: 'TEST', pads: [pad], structures: [structure] }, pad };
}

describe('generateBases', () => {
  function generateForLevel(lvl: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const terrainData = generateTerrain(canvas, lvl);
    return {
      terrainData,
      bases: generateBases(lvl, terrainData.points, terrainData.landingPads),
    };
  }

  it('is deterministic for a given level', () => {
    const first = generateForLevel(3);
    const second = generateForLevel(3);
    expect(JSON.parse(JSON.stringify(second.bases))).toEqual(
      JSON.parse(JSON.stringify(first.bases)),
    );
  });

  it('creates one base per ground pad with apron multiplier x1', () => {
    const { terrainData, bases } = generateForLevel(2);
    expect(bases).toHaveLength(terrainData.landingPads.length);
    bases.forEach((base) => {
      expect(base.name.length).toBeGreaterThan(0);
      expect(base.pads[0].multiplier).toBe(1);
      expect(base.structures.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps non-platform structures clear of the apron landing zone', () => {
    for (let lvl = 1; lvl <= 8; lvl += 1) {
      const { bases } = generateForLevel(lvl);
      bases.forEach((base) => {
        const apron = base.pads[0];
        base.structures.forEach((structure) => {
          structure.colliders.flat().forEach((point) => {
            const insidePad = point.x > apron.x1 && point.x < apron.x2;
            expect(insidePad).toBe(false);
          });
        });
      });
    }
  });

  it('produces elevated platform pads with x3/x5 multipliers tied to width', () => {
    const platforms: Array<{ pad: LandingPad; structure: Structure }> = [];
    for (let lvl = 2; lvl <= 8; lvl += 1) {
      const { bases } = generateForLevel(lvl);
      bases.forEach((base) => {
        const platform = base.structures.find((s) => s.kind === 'platform');
        if (platform) {
          expect(base.pads).toHaveLength(2);
          platforms.push({ pad: base.pads[1], structure: platform });
        } else {
          expect(base.pads).toHaveLength(1);
        }
      });
    }

    expect(platforms.length).toBeGreaterThan(0);
    platforms.forEach(({ pad, structure }) => {
      expect([3, 5]).toContain(pad.multiplier);
      expect(pad.multiplier).toBe(pad.x2 - pad.x1 <= 30 ? 5 : 3);
      expect(pad.y).toBe(structure.y - PLATFORM_HEIGHT);
      expect(pad.y).toBeLessThan(structure.y);
    });
  });

  it('never spawns platforms on level 1', () => {
    const { bases } = generateForLevel(1);
    bases.forEach((base) => {
      expect(base.structures.some((s) => s.kind === 'platform')).toBe(false);
      expect(base.pads).toHaveLength(1);
    });
  });
});

describe('base structure collisions', () => {
  it('crashes when the lander footprint clips an antenna mast', () => {
    const runtime = createRuntime({ x: 150, y: 100 - LANDER_SIZE, vx: 0, vy: 0, angle: 0 });
    const antenna: Structure = {
      kind: 'antenna',
      x: 150,
      y: 120,
      width: 2,
      height: 44,
      colliders: [
        [
          { x: 150, y: 76 },
          { x: 150, y: 120 },
        ],
      ],
    };
    runtime.game.bases = [{ name: 'TEST', pads: [], structures: [antenna] }];
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('crashed');
    expect(runtime.game.lives).toBe(2);
    expect(audio.playExplosionSound).toHaveBeenCalledTimes(1);
    expect(audio.playLandingSound).not.toHaveBeenCalled();
  });

  it('crashes when ascending into the platform deck from below', () => {
    const { base, pad } = makeTestPlatformBase();
    const runtime = createRuntime({
      x: 160,
      y: PLATFORM_DECK_Y + 4 - LANDER_SIZE,
      vx: 0,
      vy: -1,
      angle: 0,
    });
    runtime.game.bases = [base];
    runtime.game.landingPads = [pad];
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('crashed');
    expect(audio.playExplosionSound).toHaveBeenCalledTimes(1);
    expect(audio.playLandingSound).not.toHaveBeenCalled();
  });
});

describe('pad multiplier scoring', () => {
  it('lands on an elevated platform pad and applies its multiplier', () => {
    const { base, pad } = makeTestPlatformBase();
    const runtime = createRuntime({
      x: 160,
      y: PLATFORM_DECK_Y - LANDER_SIZE + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    runtime.game.bases = [base];
    runtime.game.landingPads = [pad];
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('landed');
    const lander = runtime.game.lander as Lander;
    expect(lander.y).toBe(PLATFORM_DECK_Y - LANDER_SIZE);
    const animation = runtime.game.landingScoreAnimation;
    expect(animation?.padMultiplier).toBe(3);
    expect(animation?.finalAward).toBe(
      Math.round((animation?.baseBonus ?? 0) * (animation?.velocityMultiplier ?? 0) * 3),
    );
    expect(audio.playLandingSound).toHaveBeenCalledTimes(1);
  });

  it('defaults to multiplier x1 on pads without one', () => {
    const runtime = createRuntime({
      x: 150,
      y: 120 - LANDER_SIZE + 0.1,
      vx: 0,
      vy: 0,
      angle: 0,
    });
    runtime.game.landingPads = [{ x1: 100, x2: 200, y: 120, cx: 150 }];
    const audio = createAudioStub();

    update(runtime, audio as unknown as AudioSystem);

    expect(runtime.game.status).toBe('landed');
    const animation = runtime.game.landingScoreAnimation;
    expect(animation?.padMultiplier).toBe(1);
    expect(animation?.finalAward).toBe(
      Math.round((animation?.baseBonus ?? 0) * (animation?.velocityMultiplier ?? 0)),
    );
  });
});
