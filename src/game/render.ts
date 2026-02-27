import {
  LANDER_SIZE,
  MAX_SAFE_ANGLE,
  MAX_SAFE_VX,
  MAX_SAFE_VY,
  mulberry32,
  type GameRuntime,
  type LandingScoreAnimation,
} from './entities';
import { getTerrainYAtX } from './physics';

declare const __APP_VERSION__: string;

interface TerrainRenderBounds {
  minX: number;
  maxX: number;
}

function getTerrainRenderBounds(runtime: GameRuntime): TerrainRenderBounds {
  const { canvas, game } = runtime;
  const zoom = Math.max(game.camera.zoom, 0.01);
  const halfVisibleWidth = (canvas.width / 2) / zoom;
  const centerWorldX = canvas.width / 2 + game.camera.x;
  const horizontalMargin = Math.max(120, halfVisibleWidth * 0.4);
  return {
    minX: centerWorldX - halfVisibleWidth - horizontalMargin,
    maxX: centerWorldX + halfVisibleWidth + horizontalMargin,
  };
}

function getTerrainRenderPoints(runtime: GameRuntime): Array<{ x: number; y: number }> {
  const terrain = runtime.game.terrain;
  if (terrain.length === 0) {
    return [];
  }

  const { minX, maxX } = getTerrainRenderBounds(runtime);
  const startX = Math.min(minX, maxX);
  const endX = Math.max(minX, maxX);

  const points: Array<{ x: number; y: number }> = [];
  points.push({ x: startX, y: getTerrainYAtX(runtime, startX) });

  for (let i = 0; i < terrain.length; i += 1) {
    const point = terrain[i];
    if (point.x > startX && point.x < endX) {
      points.push(point);
    }
  }

  if (endX > startX) {
    points.push({ x: endX, y: getTerrainYAtX(runtime, endX) });
  }

  return points;
}

function drawStarsStatic(runtime: GameRuntime): void {
  const { ctx, canvas } = runtime;
  const rng = mulberry32(42);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 150; i += 1) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const s = rng() * 1.5 + 0.5;
    ctx.globalAlpha = rng() * 0.5 + 0.5;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawTitle(runtime: GameRuntime): void {
  const { ctx, canvas, game, leaderboard, input } = runtime;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px monospace';
  ctx.fillText('MOONLANDER', cx, cy - 40);

  ctx.font = '16px monospace';
  ctx.fillStyle = '#888';
  const onMobile = input.isTouchDevice || input.hasTouched;
  ctx.fillText(onMobile ? 'Tilt to steer - Hold to thrust' : 'Arrow keys or WASD to fly', cx, cy + 20);
  ctx.fillText('Land gently on the pads', cx, cy + 45);
  ctx.fillText(`Local best: ${game.highScore}`, cx, cy + 70);

  if (leaderboard.loaded && leaderboard.entries.length > 0) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('-- GLOBAL TOP 3 --', cx, cy + 98);
    const top3 = leaderboard.entries.slice(0, 3);
    top3.forEach((entry, i) => {
      ctx.fillStyle = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : '#cd7f32';
      ctx.font = '13px monospace';
      ctx.fillText(
        `${String(i + 1).padStart(2, ' ')} ${(entry.name || '???').padEnd(4)} ${entry.score}`,
        cx,
        cy + 116 + i * 18,
      );
    });
  }

  ctx.fillStyle = '#44ff88';
  ctx.font = '20px monospace';
  const blink = Math.sin(Date.now() / 400) > 0;
  const prompt = onMobile ? 'TAP TO START' : 'PRESS SPACE TO START';
  if (blink) {
    ctx.fillText(prompt, cx, cy + 175);
  }
}

function drawStars(runtime: GameRuntime): void {
  const { ctx, game } = runtime;
  game.stars.forEach((star) => {
    const flicker = 0.8 + Math.sin(Date.now() * 0.001 + star.x) * 0.2;
    ctx.globalAlpha = star.brightness * flicker;
    ctx.fillStyle = '#fff';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
  ctx.globalAlpha = 1;
}

function drawTerrain(runtime: GameRuntime): void {
  const { ctx, game, canvas } = runtime;
  if (game.terrain.length === 0) {
    return;
  }
  const terrainPath = getTerrainRenderPoints(runtime);
  if (terrainPath.length === 0) {
    return;
  }
  const firstPoint = terrainPath[0];
  const lastPoint = terrainPath[terrainPath.length - 1];
  const bottom = canvas.height * 4;

  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  for (let i = 1; i < terrainPath.length; i += 1) {
    ctx.lineTo(terrainPath[i].x, terrainPath[i].y);
  }
  ctx.lineTo(lastPoint.x, bottom);
  ctx.lineTo(firstPoint.x, bottom);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height);
  grad.addColorStop(0, '#333');
  grad.addColorStop(1, '#111');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  for (let i = 1; i < terrainPath.length; i += 1) {
    ctx.lineTo(terrainPath[i].x, terrainPath[i].y);
  }
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawLandingPads(runtime: GameRuntime): void {
  const { ctx, game } = runtime;
  game.landingPads.forEach((pad) => {
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(pad.x1, pad.y - 2, pad.x2 - pad.x1, 4);
    const blink = Math.sin(Date.now() / 300) > 0;
    if (blink) {
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(pad.x1, pad.y - 5, 3, 5);
      ctx.fillRect(pad.x2 - 3, pad.y - 5, 3, 5);
    }
  });
}

function drawLander(runtime: GameRuntime): void {
  const { ctx, game } = runtime;
  if (!game.lander) {
    return;
  }

  const lander = game.lander;
  ctx.save();
  ctx.translate(lander.x, lander.y);
  ctx.rotate(lander.angle);

  ctx.fillStyle = '#ddd';
  ctx.beginPath();
  ctx.moveTo(0, -LANDER_SIZE);
  ctx.lineTo(-LANDER_SIZE * 0.7, LANDER_SIZE * 0.5);
  ctx.lineTo(LANDER_SIZE * 0.7, LANDER_SIZE * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#4488ff';
  ctx.beginPath();
  ctx.arc(0, -LANDER_SIZE * 0.3, LANDER_SIZE * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-LANDER_SIZE * 0.5, LANDER_SIZE * 0.5);
  ctx.lineTo(-LANDER_SIZE * 0.8, LANDER_SIZE);
  ctx.moveTo(LANDER_SIZE * 0.5, LANDER_SIZE * 0.5);
  ctx.lineTo(LANDER_SIZE * 0.8, LANDER_SIZE);
  ctx.stroke();

  ctx.fillStyle = '#aaa';
  ctx.fillRect(-LANDER_SIZE * 0.95, LANDER_SIZE - 1, LANDER_SIZE * 0.3, 3);
  ctx.fillRect(LANDER_SIZE * 0.65, LANDER_SIZE - 1, LANDER_SIZE * 0.3, 3);

  if (lander.thrusting && game.status === 'playing') {
    const flicker = Math.random() * 8 + 8;
    const grad = ctx.createLinearGradient(0, LANDER_SIZE * 0.5, 0, LANDER_SIZE * 0.5 + flicker);
    grad.addColorStop(0, '#ffcc00');
    grad.addColorStop(0.5, '#ff6600');
    grad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-LANDER_SIZE * 0.3, LANDER_SIZE * 0.5);
    ctx.lineTo(LANDER_SIZE * 0.3, LANDER_SIZE * 0.5);
    ctx.lineTo(0, LANDER_SIZE * 0.5 + flicker);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(runtime: GameRuntime): void {
  const { ctx, game } = runtime;
  game.particles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color ?? '#ff8800';
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawHUD(runtime: GameRuntime): void {
  const { ctx, canvas, game, input } = runtime;
  const margin = 15;
  ctx.textAlign = 'left';
  ctx.font = '14px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText(`LEVEL ${game.level}`, margin, margin + 14);
  ctx.fillText(`SCORE ${game.score}`, margin, margin + 32);
  ctx.fillText(`HI ${game.highScore}`, margin, margin + 50);

  ctx.fillStyle = '#fff';
  ctx.fillText('LIVES', margin, margin + 68);
  for (let i = 0; i < game.lives; i += 1) {
    const lx = margin + 60 + i * 20;
    const ly = margin + 63;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (game.lander) {
    const fuelBarW = 140;
    const fuelBarH = 10;
    const fuelX = margin;
    const fuelY = margin + 78;
    const fuelRatio = game.lander.maxFuel > 0 ? Math.max(0, Math.min(1, game.lander.fuel / game.lander.maxFuel)) : 0;

    ctx.fillStyle = '#fff';
    ctx.fillText('FUEL', fuelX, fuelY + 20);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(fuelX + 45, fuelY + 10, fuelBarW, fuelBarH);

    ctx.fillStyle = fuelRatio > 0.25 ? '#44ff88' : '#ff4444';
    ctx.fillRect(fuelX + 45, fuelY + 10, fuelBarW * fuelRatio, fuelBarH);
  }

  if (game.status === 'playing' && game.lander) {
    ctx.textAlign = 'right';
    const vx = Math.abs(game.lander.vx).toFixed(1);
    const vy = Math.abs(game.lander.vy).toFixed(1);
    const angle = ((game.lander.angle * 180) / Math.PI).toFixed(0);
    ctx.fillStyle = Math.abs(game.lander.vx) > MAX_SAFE_VX ? '#ff4444' : '#44ff88';
    ctx.fillText(`VX ${vx}`, canvas.width - margin, margin + 14);
    ctx.fillStyle = Math.abs(game.lander.vy) > MAX_SAFE_VY ? '#ff4444' : '#44ff88';
    ctx.fillText(`VY ${vy}`, canvas.width - margin, margin + 32);
    ctx.fillStyle = Math.abs(game.lander.angle) > MAX_SAFE_ANGLE ? '#ff4444' : '#44ff88';
    ctx.fillText(`ANG ${angle}deg`, canvas.width - margin, margin + 50);
    if (input.tiltAvailable) {
      const barW = 80;
      const barH = 10;
      const bx = canvas.width - margin - barW;
      const by = margin + 62;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(bx + barW / 2 - 1, by - 2, 2, barH + 4);
      const dotX = bx + barW / 2 + (input.tiltRaw / 45) * (barW / 2);
      const dotCx = Math.max(bx + 5, Math.min(bx + barW - 5, dotX));
      ctx.fillStyle = input.touchThrusting ? '#ffcc00' : '#44aaff';
      ctx.beginPath();
      ctx.arc(dotCx, by + barH / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = 'right';
  ctx.font = '12px monospace';
  ctx.fillStyle = '#666';
  ctx.fillText(`v${__APP_VERSION__}`, canvas.width - margin, canvas.height - margin);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function drawMessage(runtime: GameRuntime, text: string, color: string, sub: string): void {
  const { ctx, canvas, game } = runtime;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  let promptY = cy + 50;
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy - 20);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#888';
  if (game.status === 'landed') {
    const landingScoreAnimation: LandingScoreAnimation | null | undefined = game.landingScoreAnimation;

    if (!landingScoreAnimation) {
      ctx.fillText(`Level bonus: ${game.level * 100}`, cx, cy + 15);
    } else {
      const fallbackBaseBonus = Math.max(0, game.level * 100);
      const baseBonus = Math.max(
        0,
        Math.round(toFiniteNumber(landingScoreAnimation.baseBonus, fallbackBaseBonus)),
      );
      const velocityMultiplier = clampNumber(
        toFiniteNumber(landingScoreAnimation.velocityMultiplier, 1),
        0,
        9.99,
      );
      const computedFinalAward = Math.round(baseBonus * velocityMultiplier);
      const finalAward = Math.max(
        0,
        Math.round(toFiniteNumber(landingScoreAnimation.finalAward, computedFinalAward)),
      );
      const displayedAward = clampNumber(
        Math.round(toFiniteNumber(landingScoreAnimation.displayedAward, finalAward)),
        0,
        finalAward,
      );
      const durationMs = Math.max(1, toFiniteNumber(landingScoreAnimation.durationMs, 1200));
      const elapsedMs = clampNumber(toFiniteNumber(landingScoreAnimation.elapsedMs, 0), 0, durationMs);
      const timelineProgress = elapsedMs / durationMs;
      const awardProgress = finalAward > 0 ? displayedAward / finalAward : timelineProgress;
      const progress = clampNumber(awardProgress, 0, 1);

      const detailTop = cy + 2;
      const detailGap = 17;
      ctx.font = '15px monospace';
      ctx.fillText(`Base bonus: ${baseBonus}`, cx, detailTop);
      ctx.fillText(`Velocity multiplier: x${velocityMultiplier.toFixed(2)}`, cx, detailTop + detailGap);

      const awardY = detailTop + detailGap * 2 + 5;
      ctx.fillStyle = '#e6e6e6';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`Award +${displayedAward}`, cx, awardY);

      ctx.fillStyle = '#999';
      ctx.font = '13px monospace';
      ctx.fillText(`Projected +${finalAward} (${Math.round(progress * 100)}%)`, cx, awardY + 18);

      const barWidth = Math.min(280, Math.max(180, canvas.width * 0.42));
      const barHeight = 8;
      const barX = cx - barWidth / 2;
      const barY = awardY + 30;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = '#44ff88';
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = '#888';
      promptY = barY + 28;
    }
  }
  const blink = Math.sin(Date.now() / 400) > 0;
  if (blink) {
    ctx.fillStyle = '#ccc';
    ctx.fillText(sub, cx, promptY);
  }
}

function drawGameOver(runtime: GameRuntime): void {
  const { ctx, canvas, game, input } = runtime;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 52px monospace';
  ctx.fillText('GAME OVER', cx, cy - 40);
  ctx.fillStyle = '#888';
  ctx.font = '18px monospace';
  ctx.fillText(`Final Score: ${game.score}`, cx, cy + 10);
  ctx.fillText(`High Score: ${game.highScore}`, cx, cy + 38);
  ctx.fillText(`Reached Level ${game.level}`, cx, cy + 66);
  if (game.score === game.highScore && game.score > 0) {
    ctx.fillStyle = '#44ff88';
    ctx.fillText('NEW HIGH SCORE!', cx, cy + 94);
  }
  const blink = Math.sin(Date.now() / 400) > 0;
  if (blink) {
    ctx.fillStyle = '#ccc';
    ctx.font = '20px monospace';
    ctx.fillText(input.isTouchDevice || input.hasTouched ? 'TAP TO CONTINUE' : 'PRESS SPACE', cx, cy + 130);
  }
}

function drawEnterName(runtime: GameRuntime): void {
  const { ctx, canvas, game, leaderboard } = runtime;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 36px monospace';
  ctx.fillText('ENTER YOUR NAME', cx, cy - 120);
  ctx.fillStyle = '#888';
  ctx.font = '18px monospace';
  ctx.fillText(`Score: ${game.score}`, cx, cy - 78);
  ctx.fillStyle = '#44ff88';
  ctx.font = 'bold 52px monospace';
  ctx.fillText(leaderboard.playerInitials, cx, cy + 20);
}

function drawLeaderboard(runtime: GameRuntime): void {
  const { ctx, canvas, game, leaderboard, input } = runtime;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 32px monospace';
  ctx.fillText('GLOBAL TOP 10', cx, cy - 180);

  ctx.fillStyle = '#888';
  ctx.font = '15px monospace';
  ctx.fillText(`Your score: ${game.score} (${leaderboard.playerInitials})`, cx, cy - 148);

  const tableTop = cy - 120;
  const rowH = 24;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#555';
  ctx.fillText('#    NAME            SCORE       DATE', cx, tableTop);
  for (let i = 0; i < Math.min(10, leaderboard.entries.length); i += 1) {
    const entry = leaderboard.entries[i];
    const y = tableTop + (i + 1) * rowH;
    const isPlayer = entry.name === leaderboard.playerInitials && entry.score === game.score;
    ctx.fillStyle = isPlayer ? '#44ff88' : i < 3 ? '#fff' : '#aaa';
    ctx.font = `${isPlayer ? 'bold ' : ''}13px monospace`;
    const rank = String(i + 1).padStart(2, ' ');
    const name = (entry.name || '???').padEnd(4, ' ');
    const score = String(entry.score).padStart(7, ' ');
    const date = (entry.date || '').slice(0, 10);
    ctx.fillText(`${rank}   ${name}   ${score}   ${date}`, cx, y);
  }

  const blink = Math.sin(Date.now() / 400) > 0;
  if (blink) {
    ctx.fillStyle = '#ccc';
    ctx.font = '18px monospace';
    ctx.fillText(input.isTouchDevice || input.hasTouched ? 'TAP TO CONTINUE' : 'PRESS SPACE', cx, cy + 155);
  }
}

function updateNameOverlayVisibility(runtime: GameRuntime): void {
  const { overlays, game, input, leaderboard } = runtime;
  if (!overlays.nameEntryDiv) {
    return;
  }
  const show = game.status === 'enterName' && (input.hasTouched || input.isTouchDevice);
  overlays.nameEntryDiv.style.display = show ? 'block' : 'none';
  if (show && overlays.nameSubmitBtn) {
    overlays.nameSubmitBtn.textContent = leaderboard.nameSubmitting ? 'SUBMITTING...' : 'SUBMIT SCORE';
  }
}

export function render(runtime: GameRuntime): void {
  const { ctx, canvas, game, input } = runtime;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  if (game.status === 'title') {
    updateNameOverlayVisibility(runtime);
    drawStarsStatic(runtime);
    drawTitle(runtime);
    return;
  }

  if (game.status === 'gameOver' || game.status === 'enterName' || game.status === 'leaderboard') {
    drawStars(runtime);
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.translate(cx, cy);
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-cx - game.camera.x, -cy - game.camera.y);
    drawTerrain(runtime);
    drawLandingPads(runtime);
    drawParticles(runtime);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (game.status === 'gameOver') {
      drawGameOver(runtime);
    }
    if (game.status === 'enterName') {
      drawEnterName(runtime);
    }
    if (game.status === 'leaderboard') {
      drawLeaderboard(runtime);
    }
    updateNameOverlayVisibility(runtime);
    return;
  }

  updateNameOverlayVisibility(runtime);
  drawStars(runtime);

  ctx.save();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.translate(cx, cy);
  ctx.scale(game.camera.zoom, game.camera.zoom);
  ctx.translate(-cx - game.camera.x, -cy - game.camera.y);

  drawTerrain(runtime);
  drawLandingPads(runtime);
  drawParticles(runtime);
  if (game.status !== 'crashed') {
    drawLander(runtime);
  }

  ctx.restore();
  drawHUD(runtime);

  const advancePrompt = input.isTouchDevice || input.hasTouched ? 'TAP' : 'SPACE';
  if (game.status === 'landed') {
    drawMessage(runtime, 'LANDED!', '#44ff88', `${advancePrompt} for next level`);
  }
  if (game.status === 'crashed') {
    drawMessage(runtime, 'CRASHED!', '#ff4444', `LIVES: ${game.lives} - ${advancePrompt} to retry`);
  }
}
