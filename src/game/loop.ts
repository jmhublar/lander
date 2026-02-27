import { AudioSystem } from './audio';
import {
  STARTING_FUEL,
  STARTING_LIVES,
  createRuntime,
  generateStars,
  generateTerrain,
  syncHighScore,
  type GameRuntime,
  type OverlayRefs,
} from './entities';
import { update } from './physics';
import { render } from './render';

type LanderTestApi = {
  getRuntime: () => GameRuntime;
};

type LanderTestWindow = Window & {
  __LANDER_TEST_API__?: LanderTestApi;
};

function resizeCanvas(runtime: GameRuntime): void {
  runtime.canvas.width = document.documentElement.clientWidth || window.innerWidth;
  runtime.canvas.height = document.documentElement.clientHeight || window.innerHeight;
}

function mapOverlayRefs(): OverlayRefs {
  return {
    tiltBtn: document.getElementById('tiltBtn') as HTMLButtonElement | null,
    nameEntryDiv: document.getElementById('nameEntry') as HTMLDivElement | null,
    nameSubmitBtn: document.getElementById('nameSubmitBtn') as HTMLButtonElement | null,
    nameLetterEls: Array.from(document.querySelectorAll('.init-letter')),
    nameColEls: Array.from(document.querySelectorAll('.init-col')),
  };
}

function updateNameOverlay(runtime: GameRuntime): void {
  const chars = runtime.leaderboard.playerInitials.split('');
  runtime.overlays.nameLetterEls.forEach((el, i) => {
    el.textContent = chars[i] ?? 'A';
    (el as HTMLElement).style.color = i === runtime.leaderboard.initialsIndex ? '#44ff88' : '#888';
  });
}

function submitScore(runtime: GameRuntime): void {
  const score = runtime.game.score;
  const name = runtime.leaderboard.playerInitials;
  if (!runtime.leaderboardUrl.includes('YOUR_SUBDOMAIN') && score > 0) {
    runtime.leaderboard.nameSubmitting = true;
    fetch(runtime.leaderboardUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score }),
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          runtime.leaderboard.entries = data as Array<{ name: string; score: number; date: string }>;
          runtime.leaderboard.loaded = true;
          runtime.leaderboard.error = false;
        }
        runtime.leaderboard.nameSubmitting = false;
        runtime.leaderboard.nameSubmitted = true;
        runtime.game.status = 'leaderboard';
      })
      .catch(() => {
        runtime.leaderboard.error = true;
        runtime.leaderboard.nameSubmitting = false;
        runtime.leaderboard.nameSubmitted = true;
        runtime.game.status = 'leaderboard';
      });
  } else {
    runtime.leaderboard.nameSubmitted = true;
    runtime.game.status = 'leaderboard';
  }
}

function fetchLeaderboard(runtime: GameRuntime): void {
  if (!runtime.leaderboardUrl.includes('YOUR_SUBDOMAIN')) {
    fetch(runtime.leaderboardUrl)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          runtime.leaderboard.entries = data as Array<{ name: string; score: number; date: string }>;
          runtime.leaderboard.loaded = true;
          runtime.leaderboard.error = false;
        }
      })
      .catch(() => {
        runtime.leaderboard.error = true;
      });
  }
}

function resetAttemptScopedState(runtime: GameRuntime): void {
  runtime.game.attemptPeakSpeed = 0;
  runtime.game.landingScoreAnimation = null;
}

function startLevel(runtime: GameRuntime, audio: AudioSystem, lvl: number): void {
  audio.stopMarchTheme();
  audio.stopDeathMarchTheme();
  runtime.game.level = lvl;
  runtime.game.status = 'playing';
  const terrainData = generateTerrain(runtime.canvas, lvl);
  runtime.game.terrain = terrainData.points;
  runtime.game.landingPads = terrainData.landingPads;
  runtime.game.stars = generateStars(runtime.canvas);
  runtime.game.particles = [];
  resetAttemptScopedState(runtime);
  runtime.game.lander = {
    x: runtime.canvas.width / 2,
    y: 60,
    vx: 0,
    vy: 0,
    angle: 0,
    thrusting: false,
    outOfBounds: false,
    fuel: STARTING_FUEL,
    maxFuel: STARTING_FUEL,
  };
  runtime.game.camera = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
}

function beginTitle(runtime: GameRuntime, audio: AudioSystem): void {
  audio.stopDeathMarchTheme();
  runtime.game.status = 'title';
  runtime.game.lives = STARTING_LIVES;
  runtime.game.score = 0;
  runtime.game.level = 1;
  resetAttemptScopedState(runtime);
  runtime.game.stars = generateStars(runtime.canvas);
  audio.playMarchTheme();
}

function commitLandingAwardIfPending(runtime: GameRuntime): void {
  const animation = runtime.game.landingScoreAnimation;
  if (!animation || animation.committed) {
    return;
  }

  runtime.game.score += animation.finalAward;
  syncHighScore(runtime);
  animation.committed = true;
  animation.displayedAward = animation.finalAward;
}

function updateLandingScoreAnimation(runtime: GameRuntime, dt: number): void {
  if (runtime.game.status !== 'landed') {
    return;
  }

  const animation = runtime.game.landingScoreAnimation;
  if (!animation) {
    return;
  }

  const durationMs = animation.durationMs > 0 ? animation.durationMs : 1200;
  animation.elapsedMs = Math.min(durationMs, animation.elapsedMs + dt * 1000);

  const progress = Math.min(1, animation.elapsedMs / durationMs);
  const easedProgress = 1 - (1 - progress) ** 3;
  animation.displayedAward = Math.round(animation.finalAward * easedProgress);

  if (animation.elapsedMs >= durationMs) {
    commitLandingAwardIfPending(runtime);
  }
}

function handleNameEntryKey(runtime: GameRuntime, event: KeyboardEvent): void {
  const chars = runtime.leaderboard.playerInitials.split('');
  if (event.code === 'ArrowRight' || event.code === 'Tab') {
    event.preventDefault();
    runtime.leaderboard.initialsIndex = (runtime.leaderboard.initialsIndex + 1) % 3;
  } else if (event.code === 'ArrowLeft') {
    runtime.leaderboard.initialsIndex = (runtime.leaderboard.initialsIndex + 2) % 3;
  } else if (event.code === 'ArrowUp') {
    const c = chars[runtime.leaderboard.initialsIndex].charCodeAt(0);
    chars[runtime.leaderboard.initialsIndex] = String.fromCharCode(c < 90 ? c + 1 : 65);
    runtime.leaderboard.playerInitials = chars.join('');
  } else if (event.code === 'ArrowDown') {
    const c = chars[runtime.leaderboard.initialsIndex].charCodeAt(0);
    chars[runtime.leaderboard.initialsIndex] = String.fromCharCode(c > 65 ? c - 1 : 90);
    runtime.leaderboard.playerInitials = chars.join('');
  } else if (event.key.length === 1 && /[A-Za-z]/.test(event.key)) {
    chars[runtime.leaderboard.initialsIndex] = event.key.toUpperCase();
    runtime.leaderboard.playerInitials = chars.join('');
    if (runtime.leaderboard.initialsIndex < 2) {
      runtime.leaderboard.initialsIndex += 1;
    }
  } else if (event.code === 'Backspace') {
    if (runtime.leaderboard.initialsIndex > 0) {
      runtime.leaderboard.initialsIndex -= 1;
    }
    chars[runtime.leaderboard.initialsIndex] = 'A';
    runtime.leaderboard.playerInitials = chars.join('');
  } else if (
    (event.code === 'Enter' || event.code === 'Space') &&
    !runtime.leaderboard.nameSubmitting
  ) {
    submitScore(runtime);
  }
  updateNameOverlay(runtime);
}

export function handleKeyDown(runtime: GameRuntime, audio: AudioSystem, event: KeyboardEvent): void {
  runtime.input.keys[event.code] = true;
  audio.initAudio();
  audio.onTitleInteraction(runtime);

  if (runtime.game.status === 'title' && event.code === 'Space') {
    audio.stopDeathMarchTheme();
    audio.playStartJingle();
    runtime.game.lives = STARTING_LIVES;
    runtime.game.score = 0;
    startLevel(runtime, audio, 1);
  }
  if ((runtime.game.status === 'landed' || runtime.game.status === 'crashed') && event.code === 'Space') {
    if (runtime.game.status === 'landed') {
      commitLandingAwardIfPending(runtime);
    }
    startLevel(runtime, audio, runtime.game.status === 'landed' ? runtime.game.level + 1 : runtime.game.level);
  }
  if (runtime.game.status === 'gameOver' && event.code === 'Space') {
    beginTitle(runtime, audio);
  }
  if (runtime.game.status === 'enterName') {
    handleNameEntryKey(runtime, event);
  }
  if (
    runtime.game.status === 'leaderboard' &&
    (event.code === 'Space' || event.code === 'Enter')
  ) {
    beginTitle(runtime, audio);
  }
}

export function handleKeyUp(runtime: GameRuntime, event: KeyboardEvent): void {
  runtime.input.keys[event.code] = false;
}

function startTiltListener(runtime: GameRuntime): void {
  if (runtime.input.tiltListenerStarted) {
    return;
  }
  runtime.input.tiltListenerStarted = true;
  window.addEventListener(
    'deviceorientation',
    (event) => {
      if (event.gamma === null) {
        return;
      }
      runtime.input.tiltAvailable = true;
      runtime.input.showTiltButton = false;
      if (runtime.overlays.tiltBtn) {
        runtime.overlays.tiltBtn.style.display = 'none';
      }
      if (runtime.input.tiltBaseline === null) {
        runtime.input.tiltBaseline = event.gamma;
      }
      runtime.input.tiltRaw = Math.max(-45, Math.min(45, event.gamma - runtime.input.tiltBaseline));
    },
    { passive: true },
  );
}

function wireNameOverlay(runtime: GameRuntime): void {
  document.querySelectorAll('.init-up').forEach((btn, i) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const chars = runtime.leaderboard.playerInitials.split('');
      const c = chars[i].charCodeAt(0);
      chars[i] = String.fromCharCode(((c - 65 + 1 + 26) % 26) + 65);
      runtime.leaderboard.playerInitials = chars.join('');
      runtime.leaderboard.initialsIndex = i;
      updateNameOverlay(runtime);
    });
  });
  document.querySelectorAll('.init-down').forEach((btn, i) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const chars = runtime.leaderboard.playerInitials.split('');
      const c = chars[i].charCodeAt(0);
      chars[i] = String.fromCharCode(((c - 65 - 1 + 26) % 26) + 65);
      runtime.leaderboard.playerInitials = chars.join('');
      runtime.leaderboard.initialsIndex = i;
      updateNameOverlay(runtime);
    });
  });
  runtime.overlays.nameColEls.forEach((col, i) => {
    col.addEventListener('click', () => {
      runtime.leaderboard.initialsIndex = i;
      updateNameOverlay(runtime);
    });
  });
  runtime.overlays.nameSubmitBtn?.addEventListener('click', () => {
    if (!runtime.leaderboard.nameSubmitting) {
      submitScore(runtime);
    }
  });
}

export function startGame(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return () => {};
  }
  const runtime = createRuntime(canvas, ctx, mapOverlayRefs());
  (window as LanderTestWindow).__LANDER_TEST_API__ = {
    getRuntime: () => runtime,
  };
  const audio = new AudioSystem();

  runtime.input.showTiltButton = runtime.input.iosTiltPermissionNeeded;
  if (runtime.overlays.tiltBtn && runtime.input.iosTiltPermissionNeeded) {
    runtime.overlays.tiltBtn.style.display = 'block';
  }

  resizeCanvas(runtime);
  const onResize = () => resizeCanvas(runtime);
  window.addEventListener('resize', onResize);
  window.setTimeout(() => resizeCanvas(runtime), 50);

  wireNameOverlay(runtime);
  fetchLeaderboard(runtime);
  runtime.game.stars = generateStars(runtime.canvas);

  const onKeyDown = (event: KeyboardEvent) => handleKeyDown(runtime, audio, event);
  const onKeyUp = (event: KeyboardEvent) => handleKeyUp(runtime, event);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const onWindowClick = () => {
    if (runtime.game.status === 'title') {
      audio.initAudio();
      audio.onTitleInteraction(runtime);
      audio.stopDeathMarchTheme();
      audio.playStartJingle();
      runtime.game.lives = STARTING_LIVES;
      runtime.game.score = 0;
      startLevel(runtime, audio, 1);
      return;
    }

    if (runtime.game.status === 'landed') {
      commitLandingAwardIfPending(runtime);
      startLevel(runtime, audio, runtime.game.level + 1);
    }
  };

  window.addEventListener('click', onWindowClick);

  if (runtime.overlays.tiltBtn) {
    runtime.overlays.tiltBtn.addEventListener('click', () => {
      const req = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (req.requestPermission) {
        req.requestPermission()
          .then((result) => {
            if (result === 'granted') {
              startTiltListener(runtime);
            }
          })
          .catch(() => {
            runtime.input.showTiltButton = false;
          });
      }
      runtime.overlays.tiltBtn?.style.setProperty('display', 'none');
    });
  }

  if (!runtime.input.iosTiltPermissionNeeded) {
    startTiltListener(runtime);
  }

  const onTouchStart = (event: TouchEvent) => {
    event.preventDefault();
    runtime.input.hasTouched = true;
    audio.initAudio();
    audio.onTitleInteraction(runtime);

    if (runtime.game.status === 'title') {
      audio.stopMarchTheme();
      audio.stopDeathMarchTheme();
      audio.playStartJingle();
      runtime.game.lives = STARTING_LIVES;
      runtime.game.score = 0;
      startLevel(runtime, audio, 1);
      return;
    }
    if (runtime.game.status === 'landed') {
      commitLandingAwardIfPending(runtime);
      startLevel(runtime, audio, runtime.game.level + 1);
      return;
    }
    if (runtime.game.status === 'crashed') {
      startLevel(runtime, audio, runtime.game.level);
      return;
    }
    if (runtime.game.status === 'gameOver' || runtime.game.status === 'leaderboard') {
      beginTitle(runtime, audio);
      return;
    }

    if (event.touches.length >= 2) {
      runtime.input.tiltBaseline = null;
    }
    runtime.input.touchThrusting = true;
  };

  const onTouchEnd = (event: TouchEvent) => {
    event.preventDefault();
    if (event.touches.length === 0) {
      runtime.input.touchThrusting = false;
    }
  };

  const onTouchCancel = (event: TouchEvent) => {
    event.preventDefault();
    runtime.input.touchThrusting = false;
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

  let rafId = 0;
  let previousFrameTime = 0;
  const loop = (frameTime: number) => {
    const dt = previousFrameTime > 0 ? (frameTime - previousFrameTime) / 1000 : 1 / 60;
    previousFrameTime = frameTime;

    update(runtime, audio, dt);
    updateLandingScoreAnimation(runtime, dt);
    render(runtime);
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return () => {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('click', onWindowClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchCancel);
    audio.destroy();
    delete (window as LanderTestWindow).__LANDER_TEST_API__;
  };
}
