export type GameStatus =
  | 'title'
  | 'playing'
  | 'landed'
  | 'crashed'
  | 'gameOver'
  | 'enterName'
  | 'leaderboard';

export interface TerrainPoint {
  x: number;
  y: number;
}

export interface LandingPad {
  x1: number;
  x2: number;
  y: number;
  cx: number;
  multiplier?: number;
  landingInset?: number;
  elevated?: boolean;
}

export type StructureKind = 'dome' | 'antenna' | 'tanks' | 'platform';

export interface Structure {
  kind: StructureKind;
  x: number;
  y: number;
  width: number;
  height: number;
  colliders: TerrainPoint[][];
}

export interface Base {
  name: string;
  pads: LandingPad[];
  structures: Structure[];
}

export interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color?: string;
  kind?: 'flame' | 'dust';
  drag?: number;
  gravityScale?: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetZoom: number;
}

export interface Lander {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  thrusting: boolean;
  outOfBounds: boolean;
  fuel: number;
  maxFuel: number;
}
export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string;
}

export interface OverlayRefs {
  tiltBtn: HTMLButtonElement | null;
  nameEntryDiv: HTMLDivElement | null;
  nameSubmitBtn: HTMLButtonElement | null;
  nameLetterEls: HTMLElement[];
  nameColEls: HTMLElement[];
}

export interface InputState {
  keys: Record<string, boolean>;
  touchThrusting: boolean;
  tiltAvailable: boolean;
  tiltRaw: number;
  tiltBaseline: number | null;
  tiltListenerStarted: boolean;
  iosTiltPermissionNeeded: boolean;
  showTiltButton: boolean;
  hasTouched: boolean;
  isTouchDevice: boolean;
}

export interface LeaderboardState {
  entries: LeaderboardEntry[];
  loaded: boolean;
  error: boolean;
  playerInitials: string;
  initialsIndex: number;
  nameSubmitted: boolean;
  nameSubmitting: boolean;
}

export interface LandingScoreAnimation {
  baseBonus: number;
  velocityMultiplier: number;
  padMultiplier?: number;
  finalAward: number;
  displayedAward: number;
  elapsedMs: number;
  durationMs: number;
  committed: boolean;
}

export interface GameState {
  status: GameStatus;
  level: number;
  score: number;
  lives: number;
  highScore: number;
  lander: Lander | null;
  terrain: TerrainPoint[];
  landingPads: LandingPad[];
  bases: Base[];
  stars: Star[];
  particles: Particle[];
  attemptPeakSpeed?: number;
  landingScoreAnimation?: LandingScoreAnimation | null;
  camera: Camera;
}

export interface GameRuntime {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  overlays: OverlayRefs;
  input: InputState;
  leaderboard: LeaderboardState;
  game: GameState;
  leaderboardUrl: string;
}

export const GRAVITY = 0.006;
export const THRUST = 0.025;
export const ROTATION_SPEED = 0.015;
export const MAX_SAFE_VY = 1.0;
export const MAX_SAFE_VX = 0.6;
export const MAX_SAFE_ANGLE = 0.35;
export const LANDER_SIZE = 14;
export const BOUNDARY_MARGIN = 0.15;
export const STARTING_LIVES = 3;
export const HIGH_SCORE_STORAGE_KEY = 'moonlander.highScore';
export const LEADERBOARD_URL =
  'https://moonlander-scores.joshua-m-hublar.workers.dev/scores';

export const STARTING_FUEL = 100.0;
export const FUEL_CONSUMPTION_RATE = 0.2; // fuel per frame while thrusting (reduced by factor of 2.5)

export function createRuntime(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlays: OverlayRefs,
): GameRuntime {
  return {
    canvas,
    ctx,
    overlays,
    input: {
      keys: {},
      touchThrusting: false,
      tiltAvailable: false,
      tiltRaw: 0,
      tiltBaseline: null,
      tiltListenerStarted: false,
      iosTiltPermissionNeeded:
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (
          DeviceOrientationEvent as typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<'granted' | 'denied'>;
          }
        ).requestPermission === 'function',
      showTiltButton: false,
      hasTouched: false,
      isTouchDevice:
        'ontouchstart' in window || navigator.maxTouchPoints > 0,
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
      status: 'title',
      level: 1,
      score: 0,
      lives: STARTING_LIVES,
      highScore: loadHighScore(),
      lander: null,
      terrain: [],
      landingPads: [],
      bases: [],
      stars: [],
      particles: [],
      attemptPeakSpeed: 0,
      landingScoreAnimation: null,
      camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    },
    leaderboardUrl: LEADERBOARD_URL,
  };
}

export function loadHighScore(): number {
  try {
    const savedValue = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (savedValue === null) {
      return 0;
    }
    const parsedValue = Number.parseInt(savedValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return 0;
    }
    return parsedValue;
  } catch {
    return 0;
  }
}

export function saveHighScore(value: number): void {
  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(value));
  } catch {
  }
}

export function syncHighScore(runtime: GameRuntime): void {
  if (runtime.game.score > runtime.game.highScore) {
    runtime.game.highScore = runtime.game.score;
    saveHighScore(runtime.game.highScore);
  }
}

export function mulberry32(seed: number): () => number {
  return () => {
    let a = seed | 0;
    a = (a + 0x6d2b79f5) | 0;
    seed = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTerrain(
  canvas: HTMLCanvasElement,
  lvl: number,
): { points: TerrainPoint[]; landingPads: LandingPad[] } {
  const w = canvas.width;
  const h = canvas.height;
  const seed = lvl * 7919;
  const rng = mulberry32(seed);

  const points: TerrainPoint[] = [];
  const segCount = 60 + Math.floor(lvl * 10);
  const segWidth = w / segCount;
  const extraSegs = Math.ceil(segCount * 3);
  const totalSegs = segCount + extraSegs * 2;

  const padCount = Math.max(1, 3 - Math.floor(lvl / 3));
  const padWidth = Math.max(3, 6 - Math.floor(lvl / 2));

  const pads: Array<{ start: number; width: number; y?: number }> = [];
  const usedSegs = new Set<number>();
  for (let p = 0; p < padCount; p += 1) {
    let attempts = 0;
    let pos = 5;
    do {
      pos = Math.floor(rng() * (segCount - padWidth - 10)) + 5;
      attempts += 1;
    } while (
      attempts < 100 &&
      [...usedSegs].some((s) => Math.abs(s - pos) < padWidth + 5)
    );
    pads.push({ start: pos + extraSegs, width: padWidth });
    for (let i = pos; i < pos + padWidth; i += 1) {
      usedSegs.add(i);
    }
  }

  const baseHeight = h * 0.75;
  const roughness = 0.3 + lvl * 0.05;
  let currentHeight = baseHeight + (rng() - 0.5) * h * 0.1;

  for (let i = 0; i <= totalSegs; i += 1) {
    const x = (i - extraSegs) * segWidth;
    const pad = pads.find((candidate) => i >= candidate.start && i <= candidate.start + candidate.width);
    if (pad) {
      if (i === pad.start) {
        pad.y = currentHeight;
      }
      points.push({ x, y: pad.y ?? currentHeight });
    } else {
      currentHeight += (rng() - 0.5) * 40 * roughness;
      currentHeight = Math.max(h * 0.5, Math.min(h * 0.9, currentHeight));
      points.push({ x, y: currentHeight });
    }
  }

  const landingPads = pads.map((pad) => ({
    x1: (pad.start - extraSegs) * segWidth,
    x2: (pad.start + pad.width - extraSegs) * segWidth,
    y: pad.y ?? baseHeight,
    cx: (pad.start + pad.width / 2 - extraSegs) * segWidth,
  }));

  return { points, landingPads };
}

export const BASE_NAMES = [
  'TYCHO',
  'CRISIUM',
  'SERENITY',
  'COPERNICUS',
  'KEPLER',
  'ARISTARCHUS',
  'PLATO',
  'IMBRIUM',
] as const;

export const PLATFORM_DECK_THICKNESS = 5;
export const PLATFORM_HEIGHT = 44;
export const STRUCTURE_PAD_GAP = 16;
export const PLATFORM_LANDING_INSET = 2;

function terrainYAt(points: TerrainPoint[], x: number): number {
  if (points.length === 0) {
    return 0;
  }
  if (x <= points[0].x) {
    return points[0].y;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / Math.max(1e-9, points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return points[points.length - 1].y;
}

function makeDome(x: number, y: number): Structure {
  const width = 44;
  const height = 26;
  const half = width / 2;
  const arc: TerrainPoint[] = [];
  const arcSegments = 6;
  for (let i = 0; i <= arcSegments; i += 1) {
    const t = Math.PI - (i / arcSegments) * Math.PI;
    arc.push({ x: x + Math.cos(t) * half, y: y - Math.sin(t) * height });
  }
  return { kind: 'dome', x, y, width, height, colliders: [arc] };
}

function makeAntenna(x: number, y: number): Structure {
  const height = 44;
  return {
    kind: 'antenna',
    x,
    y,
    width: 2,
    height,
    colliders: [
      [
        { x, y: y - height },
        { x, y },
      ],
    ],
  };
}

function makeTanks(x: number, y: number): Structure {
  const width = 30;
  const height = 16;
  const half = width / 2;
  return {
    kind: 'tanks',
    x,
    y,
    width,
    height,
    colliders: [
      [
        { x: x - half, y },
        { x: x - half, y: y - height },
        { x: x + half, y: y - height },
        { x: x + half, y },
      ],
    ],
  };
}

function makePlatform(points: TerrainPoint[], cx: number, width: number): {
  structure: Structure;
  pad: LandingPad;
} {
  const x1 = cx - width / 2;
  const x2 = cx + width / 2;
  const legLeftX = x1 + 3;
  const legRightX = x2 - 3;
  const legLeftGroundY = terrainYAt(points, legLeftX);
  const legRightGroundY = terrainYAt(points, legRightX);
  const anchorGroundY = Math.min(legLeftGroundY, legRightGroundY);
  const deckY = anchorGroundY - PLATFORM_HEIGHT;
  const deckBottomY = deckY + PLATFORM_DECK_THICKNESS;

  const structure: Structure = {
    kind: 'platform',
    x: cx,
    y: anchorGroundY,
    width,
    height: PLATFORM_HEIGHT,
    colliders: [
      [
        { x: x1, y: deckY },
        { x: x2, y: deckY },
        { x: x2, y: deckBottomY },
        { x: x1, y: deckBottomY },
        { x: x1, y: deckY },
      ],
      [
        { x: legLeftX, y: deckBottomY },
        { x: legLeftX, y: legLeftGroundY },
      ],
      [
        { x: legRightX, y: deckBottomY },
        { x: legRightX, y: legRightGroundY },
      ],
    ],
  };

  const multiplier = width <= 34 ? 5 : 3;
  const pad: LandingPad = {
    x1,
    x2,
    y: deckY,
    cx,
    multiplier,
    landingInset: PLATFORM_LANDING_INSET,
    elevated: true,
  };
  return { structure, pad };
}

export function generateBases(
  lvl: number,
  points: TerrainPoint[],
  groundPads: LandingPad[],
): Base[] {
  const rng = mulberry32(lvl * 7919 + 4242);

  return groundPads.map((groundPad, padIndex) => {
    groundPad.multiplier = 1;
    const name = BASE_NAMES[(lvl + padIndex * 3) % BASE_NAMES.length];
    const structures: Structure[] = [];
    const pads: LandingPad[] = [groundPad];

    const structureSide = rng() < 0.5 ? -1 : 1;
    const clusterStartX =
      structureSide === 1
        ? groundPad.x2 + STRUCTURE_PAD_GAP
        : groundPad.x1 - STRUCTURE_PAD_GAP;

    let cursorX = clusterStartX;
    const placeStructure = (
      make: (x: number, y: number) => Structure,
      width: number,
    ): void => {
      const centerX = cursorX + structureSide * (width / 2);
      structures.push(make(centerX, terrainYAt(points, centerX)));
      cursorX += structureSide * (width + 8 + rng() * 8);
    };

    placeStructure(makeDome, 44);
    placeStructure(makeAntenna, 2);
    if (rng() < 0.7) {
      placeStructure(makeTanks, 30);
    }

    const hasPlatform = lvl >= 2 && rng() < 0.65;
    if (hasPlatform) {
      const platformWidth = lvl >= 4 && rng() < 0.45 ? 32 : 46;
      const platformSide = -structureSide;
      const platformCx =
        platformSide === 1
          ? groundPad.x2 + STRUCTURE_PAD_GAP + 44 + platformWidth / 2
          : groundPad.x1 - STRUCTURE_PAD_GAP - 44 - platformWidth / 2;
      const platform = makePlatform(points, platformCx, platformWidth);
      structures.push(platform.structure);
      pads.push(platform.pad);
    }

    return { name, pads, structures };
  });
}

export function generateStars(canvas: HTMLCanvasElement): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < 200; i += 1) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      size: Math.random() * 1.5 + 0.5,
      brightness: Math.random() * 0.5 + 0.5,
    });
  }
  return stars;
}
