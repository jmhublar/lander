import { AudioSystem } from './audio';
import {
  FUEL_CONSUMPTION_RATE,
  GRAVITY,
  LANDER_SIZE,
  MAX_SAFE_ANGLE,
  MAX_SAFE_VX,
  MAX_SAFE_VY,
  ROTATION_SPEED,
  THRUST,
  type GameRuntime,
  type Lander,
  syncHighScore,
} from './entities';

export function spawnThrustParticles(
  runtime: GameRuntime,
  x: number,
  y: number,
  angle: number,
): void {
  for (let i = 0; i < 2; i += 1) {
    const spread = (Math.random() - 0.5) * 0.5;
    runtime.game.particles.push({
      x,
      y,
      vx: -Math.sin(angle + spread) * (2 + Math.random() * 2),
      vy: Math.cos(angle + spread) * (2 + Math.random() * 2),
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      size: Math.random() * 3 + 1,
    });
  }
}

export function spawnExplosion(runtime: GameRuntime, x: number, y: number): void {
  for (let i = 0; i < 60; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    runtime.game.particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      size: Math.random() * 4 + 1,
      color: ['#ff4400', '#ff8800', '#ffcc00', '#ffffff'][Math.floor(Math.random() * 4)],
    });
  }
}

export function spawnLandingParticles(runtime: GameRuntime, x: number, y: number): void {
  for (let i = 0; i < 30; i += 1) {
    const a = -Math.PI * Math.random();
    const speed = Math.random() * 2 + 0.5;
    runtime.game.particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 1,
      decay: 0.015,
      size: Math.random() * 2 + 1,
      color: '#44ff88',
    });
  }
}

export function getTerrainYAtX(runtime: GameRuntime, x: number): number {
  const terrain = runtime.game.terrain;
  if (terrain.length === 0) {
    return runtime.canvas.height;
  }
  if (terrain.length === 1) {
    return terrain[0].y;
  }

  for (let i = 0; i < terrain.length - 1; i += 1) {
    if (x >= terrain[i].x && x <= terrain[i + 1].x) {
      const t = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
      return terrain[i].y + t * (terrain[i + 1].y - terrain[i].y);
    }
  }

  const first = terrain[0];
  const second = terrain[1];
  const last = terrain[terrain.length - 1];
  const penultimate = terrain[terrain.length - 2];
  const h = runtime.canvas.height;
  const maxY = h * 1.1;
  const taperScale = runtime.canvas.width * 0.75;

  if (x < first.x) {
    const distance = first.x - x;
    const edgeSlope = (second.y - first.y) / Math.max(1, second.x - first.x);
    const linearY = first.y - edgeSlope * distance;
    const taper = (distance / taperScale) * (distance / taperScale) * (h * 0.35);
    return Math.min(maxY, linearY + taper);
  }

  const distance = x - last.x;
  const edgeSlope = (last.y - penultimate.y) / Math.max(1, last.x - penultimate.x);
  const linearY = last.y + edgeSlope * distance;
  const taper = (distance / taperScale) * (distance / taperScale) * (h * 0.35);
  return Math.min(maxY, linearY + taper);
}

interface Point {
  x: number;
  y: number;
}

const FOOT_HALF_WIDTH = LANDER_SIZE * 0.6;
const attemptPeakAbsVerticalSpeed = new WeakMap<GameRuntime, number>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTrackedPeakAbsVerticalSpeed(runtime: GameRuntime): number {
  const trackedPeakAbsVy = attemptPeakAbsVerticalSpeed.get(runtime);
  if (!Number.isFinite(trackedPeakAbsVy)) {
    return 0;
  }
  return Math.max(0, trackedPeakAbsVy ?? 0);
}

function resetTrackedPeakAbsVerticalSpeed(runtime: GameRuntime): void {
  attemptPeakAbsVerticalSpeed.set(runtime, 0);
}

function trackPeakAbsVerticalSpeed(runtime: GameRuntime, vy: number): void {
  const priorPeakAbsVy = getTrackedPeakAbsVerticalSpeed(runtime);
  const currentAbsVy = Math.abs(vy);
  attemptPeakAbsVerticalSpeed.set(runtime, Number.isFinite(currentAbsVy) ? Math.max(priorPeakAbsVy, currentAbsVy) : priorPeakAbsVy);
}

function getLanderFootprint(lander: Lander): [Point, Point] {
  const cos = Math.cos(lander.angle);
  const sin = Math.sin(lander.angle);

  const leftX = lander.x + -FOOT_HALF_WIDTH * cos - LANDER_SIZE * sin;
  const leftY = lander.y + -FOOT_HALF_WIDTH * sin + LANDER_SIZE * cos;
  const rightX = lander.x + FOOT_HALF_WIDTH * cos - LANDER_SIZE * sin;
  const rightY = lander.y + FOOT_HALF_WIDTH * sin + LANDER_SIZE * cos;

  return [
    { x: leftX, y: leftY },
    { x: rightX, y: rightY },
  ];
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const adx = d.x - a.x;
  const ady = d.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const cax = a.x - c.x;
  const cay = a.y - c.y;
  const cbx = b.x - c.x;
  const cby = b.y - c.y;

  const orient1 = cross(abx, aby, acx, acy);
  const orient2 = cross(abx, aby, adx, ady);
  const orient3 = cross(cdx, cdy, cax, cay);
  const orient4 = cross(cdx, cdy, cbx, cby);

  const eps = 1e-9;
  if (Math.abs(orient1) <= eps && onSegment(a, b, c)) {
    return true;
  }
  if (Math.abs(orient2) <= eps && onSegment(a, b, d)) {
    return true;
  }
  if (Math.abs(orient3) <= eps && onSegment(c, d, a)) {
    return true;
  }
  if (Math.abs(orient4) <= eps && onSegment(c, d, b)) {
    return true;
  }

  return orient1 * orient2 < 0 && orient3 * orient4 < 0;
}

function footprintIntersectsTerrain(runtime: GameRuntime, lander: Lander): boolean {
  const [leftFoot, rightFoot] = getLanderFootprint(lander);
  const minFootX = Math.min(leftFoot.x, rightFoot.x);
  const maxFootX = Math.max(leftFoot.x, rightFoot.x);
  const terrain = runtime.game.terrain;

  for (let i = 0; i < terrain.length - 1; i += 1) {
    const terrainStart = terrain[i];
    const terrainEnd = terrain[i + 1];
    const minTerrainX = Math.min(terrainStart.x, terrainEnd.x);
    const maxTerrainX = Math.max(terrainStart.x, terrainEnd.x);
    if (maxTerrainX < minFootX || minTerrainX > maxFootX) {
      continue;
    }

    if (
      segmentsIntersect(leftFoot, rightFoot, { x: terrainStart.x, y: terrainStart.y }, { x: terrainEnd.x, y: terrainEnd.y })
    ) {
      return true;
    }
  }

  return false;
}

function checkLanding(runtime: GameRuntime, audio: AudioSystem): void {
  const lander = runtime.game.lander;
  if (!lander) {
    return;
  }
  const footY = lander.y + LANDER_SIZE;
  const terrainY = getTerrainYAtX(runtime, lander.x);

  if (footY >= terrainY || footprintIntersectsTerrain(runtime, lander)) {
    const pad = runtime.game.landingPads.find(
      (p) =>
        lander.x >= p.x1 + 5 &&
        lander.x <= p.x2 - 5 &&
        Math.abs(footY - p.y) < 8,
    );
    const safeLanding =
      Math.abs(lander.vy) <= MAX_SAFE_VY &&
      Math.abs(lander.vx) <= MAX_SAFE_VX &&
      Math.abs(lander.angle) <= MAX_SAFE_ANGLE &&
      lander.fuel > 0;

    if (pad && safeLanding) {
      const landingAngle = lander.angle;
      const landingFuel = lander.fuel;
      const landingMaxFuel = lander.maxFuel;
      const trackedPeakAbsVy = getTrackedPeakAbsVerticalSpeed(runtime);
      const trackedPeakSpeed = Number.isFinite(runtime.game.attemptPeakSpeed)
        ? Math.max(0, runtime.game.attemptPeakSpeed ?? 0)
        : 0;
      runtime.game.status = 'landed';
      const vBonus = Math.floor((trackedPeakAbsVy / MAX_SAFE_VY) * 50);
      const aBonus = Math.floor((1 - Math.abs(landingAngle) / MAX_SAFE_ANGLE) * 50);
      const levelBonus = runtime.game.level * 100;
      const baseBonus = levelBonus + vBonus + aBonus;
      const safeSpeed = Math.hypot(MAX_SAFE_VX, MAX_SAFE_VY);
      const velocityMultiplier = clamp(
        1.25 - 0.2 * (safeSpeed > 0 ? trackedPeakSpeed / safeSpeed : 0),
        0.85,
        1.25,
      );
      const fuelMultiplier = clamp(
        0.85 + 0.4 * (landingMaxFuel > 0 ? landingFuel / landingMaxFuel : 0),
        0.85,
        1.25,
      );
      const finalAward = Math.round(baseBonus * velocityMultiplier * fuelMultiplier);
      runtime.game.landingScoreAnimation = {
        baseBonus,
        velocityMultiplier,
        fuelMultiplier,
        finalAward,
        displayedAward: 0,
        elapsedMs: 0,
        durationMs: 1200,
        committed: false,
      };
      runtime.game.attemptPeakSpeed = 0;
      resetTrackedPeakAbsVerticalSpeed(runtime);
      lander.y = pad.y - LANDER_SIZE;
      lander.vx = 0;
      lander.vy = 0;
      lander.angle = 0;
      spawnLandingParticles(runtime, lander.x, pad.y);
      audio.updateThrustSound(false);
      audio.playLandingSound();
    } else {
      runtime.game.lives = Math.max(0, runtime.game.lives - 1);
      runtime.game.attemptPeakSpeed = 0;
      resetTrackedPeakAbsVerticalSpeed(runtime);
      if (runtime.game.lives === 0) {
        syncHighScore(runtime);
        runtime.leaderboard.playerInitials = 'AAA';
        runtime.leaderboard.initialsIndex = 0;
        runtime.leaderboard.nameSubmitted = false;
        runtime.leaderboard.nameSubmitting = false;
        runtime.game.status = runtime.game.score > 0 ? 'enterName' : 'gameOver';
        audio.playDeathMarchTheme();
      } else {
        runtime.game.status = 'crashed';
      }
      spawnExplosion(runtime, lander.x, lander.y);
      audio.updateThrustSound(false);
      audio.playExplosionSound();
    }
  }

}

function updateCamera(runtime: GameRuntime, frameScale: number): void {
  const lander = runtime.game.lander;
  if (!lander) {
    return;
  }
  const w = runtime.canvas.width;
  const h = runtime.canvas.height;
  const margin = 80;
  let needZoomX = 1;
  let needZoomY = 1;

  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.abs(lander.x - cx);

  const maxVisX = w / 2 - margin;
  if (dx > maxVisX) {
    needZoomX = maxVisX / dx;
  }
  if (lander.y < margin) {
    needZoomY = (h / 2 - margin) / (h / 2 - lander.y + margin);
  }

  runtime.game.camera.targetZoom = Math.min(1, Math.min(needZoomX, needZoomY));
  runtime.game.camera.targetZoom = Math.max(0.15, runtime.game.camera.targetZoom);
  const cameraLerp = 1 - Math.pow(1 - 0.05, frameScale);
  runtime.game.camera.zoom += (runtime.game.camera.targetZoom - runtime.game.camera.zoom) * cameraLerp;

  if (runtime.game.camera.zoom < 0.98) {
    runtime.game.camera.x += ((lander.x - cx) * 0.3 - runtime.game.camera.x) * cameraLerp;
    runtime.game.camera.y += ((lander.y - cy) * 0.3 - runtime.game.camera.y) * cameraLerp;
  } else {
    const damping = Math.pow(0.95, frameScale);
    runtime.game.camera.x *= damping;
    runtime.game.camera.y *= damping;
  }
}

function updateParticles(runtime: GameRuntime, frameScale: number): void {
  for (let i = runtime.game.particles.length - 1; i >= 0; i -= 1) {
    const p = runtime.game.particles[i];
    p.x += p.vx * frameScale;
    p.y += p.vy * frameScale;
    p.vy += 0.01 * frameScale;
    p.life -= p.decay * frameScale;
    if (p.life <= 0) {
      runtime.game.particles.splice(i, 1);
    }
  }
}

function getActiveLander(runtime: GameRuntime): Lander | null {
  if (!runtime.game.lander) {
    return null;
  }
  return runtime.game.lander;
}

export function update(runtime: GameRuntime, audio: AudioSystem, dt = 1 / 60): void {
  const frameScale = Math.min(dt, 0.1) * 60;

  if (runtime.game.status !== 'playing') {
    runtime.game.attemptPeakSpeed = 0;
    resetTrackedPeakAbsVerticalSpeed(runtime);
    if (runtime.game.status === 'gameOver' && !audio.isDeathMarchPlaying()) {
      audio.playDeathMarchTheme();
    }
    updateParticles(runtime, frameScale);
    audio.updateThrustSound(false);
    return;
  }

  const lander = getActiveLander(runtime);
  if (!lander) {
    return;
  }

  if (runtime.input.keys.ArrowLeft || runtime.input.keys.KeyA) {
    lander.angle -= ROTATION_SPEED * frameScale;
  }
  if (runtime.input.keys.ArrowRight || runtime.input.keys.KeyD) {
    lander.angle += ROTATION_SPEED * frameScale;
  }
  if (runtime.input.tiltAvailable) {
    const dead = 3;
    const t =
      Math.abs(runtime.input.tiltRaw) < dead
        ? 0
        : (runtime.input.tiltRaw - Math.sign(runtime.input.tiltRaw) * dead) / (45 - dead);
    lander.angle += t * ROTATION_SPEED * 1.8 * frameScale;
  }
  const thrustRequested = Boolean(
    runtime.input.keys.ArrowUp || runtime.input.keys.KeyW || runtime.input.touchThrusting,
  );
  lander.thrusting = thrustRequested && lander.fuel > 0;

  lander.vy += GRAVITY * frameScale;
  if (lander.thrusting) {
    lander.vx += Math.sin(lander.angle) * THRUST * frameScale;
    lander.vy -= Math.cos(lander.angle) * THRUST * frameScale;
    lander.fuel = Math.max(0, lander.fuel - FUEL_CONSUMPTION_RATE * frameScale);
    const ex = lander.x - Math.sin(lander.angle) * LANDER_SIZE;
    const ey = lander.y + Math.cos(lander.angle) * LANDER_SIZE;
    spawnThrustParticles(runtime, ex, ey, lander.angle);
  }

  const priorPeakSpeed = Number.isFinite(runtime.game.attemptPeakSpeed)
    ? Math.max(0, runtime.game.attemptPeakSpeed ?? 0)
    : 0;
  const currentSpeed = Math.hypot(lander.vx, lander.vy);
  runtime.game.attemptPeakSpeed = Number.isFinite(currentSpeed)
    ? Math.max(priorPeakSpeed, currentSpeed)
    : priorPeakSpeed;
  trackPeakAbsVerticalSpeed(runtime, lander.vy);

  lander.x += lander.vx * frameScale;
  lander.y += lander.vy * frameScale;

  updateCamera(runtime, frameScale);
  checkLanding(runtime, audio);
  updateParticles(runtime, frameScale);
  audio.updateThrustSound(lander.thrusting);
}
