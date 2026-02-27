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
  fuelMultiplier: number;
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
