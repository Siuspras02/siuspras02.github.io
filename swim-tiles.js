/**
 * Swimming Tiles — ambient mahjong tiles for the lobby and live score stage.
 *
 * Layers:
 *  - lobby:     tiles drift inside the lobby sheet
 *  - game:      tiles drift behind the live-stage cards
 *  - dashboard: tiles drift inside the score arena + convergence tiles for
 *               players above the threshold
 *
 * The engine is intentionally self-healing: canvas sizes are re-measured every
 * frame, so a layer that was hidden on first paint (mobile / cached snapshot)
 * still starts animating as soon as it becomes visible.
 */

const SwimTilesConfig = {
  threshold: 30000,

  ambient: {
    // Counts are per layer, before the small-screen multiplier.
    lobbyCount: 16,
    gameCount: 20,
    dashboardCount: 14,
    smallScreenMultiplier: 0.55,
    minSizeRem: 1.0,
    maxSizeRem: 2.6,
    minSpeed: 8, // px / second
    maxSpeed: 20,
    minWaveAmp: 8,
    maxWaveAmp: 26,
    minWaveSpeed: 0.4, // rad / second
    maxWaveSpeed: 0.9,
    // Per-layer colour + opacity (lobby sits on light paper, stage is dark).
    lobby: { color: "#3f7a5f", opacity: 0.1 },
    game: { color: "#9fd0bd", opacity: 0.09 },
    dashboard: { color: "#9fd0bd", opacity: 0.08 },
  },

  convergence: {
    maxCount: 32,
    perTarget: 9,
    minSizeRem: 1.0,
    maxSizeRem: 2.2,
    speed: 70, // px / second
    wobbleAmp: 9,
    wobbleSpeed: 2.4, // rad / second
    fadeDuration: 0.65, // seconds wobbling at the card
    opacity: 0.22,
    color: "#e5c25a",
  },

  reducedMotion: {
    // Keep a gentle drift instead of freezing, so the background never looks
    // broken on phones / browsers that default to reduced motion.
    speedMultiplier: 0.28,
    opacityMultiplier: 0.65,
    countMultiplier: 0.6,
  },

  tileChars: [
    "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏",
    "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡",
    "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘",
    "🀀", "🀁", "🀂", "🀃", "🀄", "🀅", "🀆",
  ],
};

const TAU = Math.PI * 2;

const SwimState = {
  layers: new Map(),
  players: [],
  raf: null,
  lastTs: 0,
  initialized: false,
  reduced: false,
  hidden: false,
  mediaQuery: null,
  mediaListener: null,
  visibilityListener: null,
  resizeListener: null,
};

const LAYER_DEFS = [
  {
    key: "lobby",
    getContainer: () =>
      document.querySelector("#lobby-section .sheet") ||
      document.getElementById("lobby-section"),
    countKey: "lobbyCount",
    palette: "lobby",
    convergence: false,
  },
  {
    key: "game",
    getContainer: () => document.getElementById("game-section"),
    countKey: "gameCount",
    palette: "game",
    convergence: false,
  },
  {
    key: "dashboard",
    getContainer: () => document.getElementById("score-dashboard"),
    countKey: "dashboardCount",
    palette: "dashboard",
    convergence: true,
  },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randomTileChar() {
  const chars = SwimTilesConfig.tileChars;
  return chars[Math.floor(Math.random() * chars.length)];
}

function isSmallScreen() {
  return window.innerWidth < 640;
}

function getLayerCount(def) {
  const cfg = SwimTilesConfig.ambient;
  let count = cfg[def.countKey] || cfg.gameCount;
  if (isSmallScreen()) count *= cfg.smallScreenMultiplier;
  if (SwimState.reduced) count *= SwimTilesConfig.reducedMotion.countMultiplier;
  return Math.max(4, Math.round(count));
}

/* ------------------------------------------------------------------ layers */

function createLayer(def) {
  const canvas = document.createElement("canvas");
  canvas.className = "swim-layer-canvas";
  canvas.setAttribute("aria-hidden", "true");
  return {
    def,
    canvas,
    ctx: canvas.getContext("2d"),
    container: null,
    w: 0,
    h: 0,
    dpr: 0,
    tiles: [],
    convergence: [],
    targets: new Map(),
    seeded: false,
  };
}

function ensureLayer(layer) {
  const container = layer.def.getContainer();
  if (!container) return false;

  layer.container = container;

  // Re-attach after app re-renders wipe innerHTML (score dashboard).
  if (layer.canvas.parentElement !== container) {
    container.insertBefore(layer.canvas, container.firstChild);
  }
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w < 2 || h < 2) return false; // hidden section — retry next frame

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (w !== layer.w || h !== layer.h || dpr !== layer.dpr) {
    layer.w = w;
    layer.h = h;
    layer.dpr = dpr;
    layer.canvas.width = Math.round(w * dpr);
    layer.canvas.height = Math.round(h * dpr);
    layer.canvas.style.width = w + "px";
    layer.canvas.style.height = h + "px";
    layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!layer.seeded) {
      seedAmbient(layer);
      layer.seeded = true;
    } else {
      clampTiles(layer);
    }
  }
  return true;
}

function ensureAllLayers() {
  SwimState.layers.forEach((layer) => ensureLayer(layer));
}

/* ----------------------------------------------------------------- ambient */

function makeAmbient(layer) {
  const cfg = SwimTilesConfig.ambient;
  const palette = cfg[layer.def.palette] || cfg.game;
  const baseY = rand(0, layer.h);
  return {
    char: randomTileChar(),
    size: rand(cfg.minSizeRem, cfg.maxSizeRem),
    x: rand(0, layer.w),
    y: baseY,
    baseY,
    vx: (Math.random() < 0.5 ? -1 : 1) * rand(cfg.minSpeed, cfg.maxSpeed),
    waveAmp: rand(cfg.minWaveAmp, cfg.maxWaveAmp),
    wavePhase: rand(0, TAU),
    waveSpeed: rand(cfg.minWaveSpeed, cfg.maxWaveSpeed),
    color: palette.color,
    opacity: palette.opacity,
  };
}

function seedAmbient(layer) {
  layer.tiles = [];
  const count = getLayerCount(layer.def);
  for (let i = 0; i < count; i++) layer.tiles.push(makeAmbient(layer));
}

function clampTiles(layer) {
  const pad = 40;
  layer.tiles.forEach((tile) => {
    if (tile.x < -pad) tile.x = 0;
    if (tile.x > layer.w + pad) tile.x = layer.w;
    tile.baseY = Math.min(Math.max(tile.baseY, 0), layer.h);
  });
}

function updateAmbient(layer, dt) {
  const cfg = SwimTilesConfig.ambient;
  const mul = SwimState.reduced ? SwimTilesConfig.reducedMotion.speedMultiplier : 1;
  const pad = 40;

  layer.tiles.forEach((tile) => {
    tile.x += tile.vx * dt * mul;
    tile.wavePhase += tile.waveSpeed * dt * mul;
    tile.y = tile.baseY + Math.sin(tile.wavePhase) * tile.waveAmp;

    if (tile.x < -pad) {
      tile.x = layer.w + pad;
      tile.baseY = rand(0, layer.h);
    } else if (tile.x > layer.w + pad) {
      tile.x = -pad;
      tile.baseY = rand(0, layer.h);
    }

    if (tile.y < -pad) tile.y = layer.h + pad;
    if (tile.y > layer.h + pad) tile.y = -pad;
  });
}

/* ------------------------------------------------------------- convergence */

function makeConvergence(layer) {
  const cfg = SwimTilesConfig.convergence;
  const edge = Math.floor(Math.random() * 4);
  const off = rand(20, 60);
  let x;
  let y;
  switch (edge) {
    case 0: // top
      x = rand(0, layer.w);
      y = -off;
      break;
    case 1: // right
      x = layer.w + off;
      y = rand(0, layer.h);
      break;
    case 2: // bottom
      x = rand(0, layer.w);
      y = layer.h + off;
      break;
    default: // left
      x = -off;
      y = rand(0, layer.h);
  }
  return {
    char: randomTileChar(),
    size: rand(cfg.minSizeRem, cfg.maxSizeRem),
    x,
    y,
    state: "travel",
    targetId: null,
    wobblePhase: rand(0, TAU),
    opacity: cfg.opacity,
    elapsed: 0,
  };
}

function updateTargets(layer) {
  layer.targets.clear();
  const dashboard = document.getElementById("score-dashboard");
  if (!dashboard || dashboard.clientWidth < 2) return;

  const rect = dashboard.getBoundingClientRect();
  SwimState.players.forEach((player) => {
    const score = Number(player.currentScore);
    if (!Number.isFinite(score) || score <= SwimTilesConfig.threshold) return;
    const card = dashboard.querySelector(
      `[data-player-id="${String(player.id).replace(/"/g, '\\"')}"]`,
    );
    if (!card) return;
    const cardRect = card.getBoundingClientRect();
    layer.targets.set(String(player.id), {
      x: cardRect.left - rect.left + cardRect.width / 2,
      y: cardRect.top - rect.top + cardRect.height / 2,
    });
  });
}

function updateConvergence(layer, dt) {
  const cfg = SwimTilesConfig.convergence;
  updateTargets(layer);

  const ids = Array.from(layer.targets.keys());
  if (ids.length === 0) {
    if (layer.convergence.length) layer.convergence = [];
    return;
  }

  const desired = Math.min(cfg.maxCount, ids.length * cfg.perTarget);
  while (layer.convergence.length < desired) {
    layer.convergence.push(makeConvergence(layer));
  }
  while (layer.convergence.length > desired) {
    layer.convergence.pop();
  }

  const mul = SwimState.reduced ? SwimTilesConfig.reducedMotion.speedMultiplier : 1;

  layer.convergence.forEach((tile) => {
    if (!tile.targetId || !layer.targets.has(tile.targetId)) {
      tile.targetId = ids[Math.floor(Math.random() * ids.length)];
    }
    const target = layer.targets.get(tile.targetId);
    if (!target) return;

    if (tile.state === "travel") {
      const dx = target.x - tile.x;
      const dy = target.y - tile.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 16) {
        tile.state = "arrive";
        tile.elapsed = 0;
        return;
      }
      const step = cfg.speed * dt * mul;
      tile.x += (dx / dist) * step;
      tile.y += (dy / dist) * step;
      tile.wobblePhase += cfg.wobbleSpeed * dt * mul;
      tile.x += Math.cos(tile.wobblePhase) * cfg.wobbleAmp * dt * mul;
      tile.y += Math.sin(tile.wobblePhase) * cfg.wobbleAmp * dt * mul;
    } else {
      // Wobble on the card, then fade and respawn from an edge.
      tile.elapsed += dt;
      tile.wobblePhase += cfg.wobbleSpeed * 2 * dt * mul;
      const k = Math.max(0, 1 - tile.elapsed / cfg.fadeDuration);
      tile.x = target.x + Math.cos(tile.wobblePhase) * cfg.wobbleAmp * k;
      tile.y = target.y + Math.sin(tile.wobblePhase) * cfg.wobbleAmp * 0.6 * k;
      tile.opacity = cfg.opacity * k;
      if (tile.elapsed >= cfg.fadeDuration) {
        Object.assign(tile, makeConvergence(layer));
      }
    }
  });
}

/* -------------------------------------------------------------------- draw */

function drawLayer(layer) {
  const ctx = layer.ctx;
  ctx.clearRect(0, 0, layer.w, layer.h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const opMul = SwimState.reduced
    ? SwimTilesConfig.reducedMotion.opacityMultiplier
    : 1;

  layer.tiles.forEach((tile) => {
    ctx.globalAlpha = tile.opacity * opMul;
    ctx.fillStyle = tile.color;
    ctx.font = `normal ${(tile.size * 16).toFixed(0)}px "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(tile.char, tile.x, tile.y);
  });

  if (layer.def.convergence) {
    layer.convergence.forEach((tile) => {
      ctx.globalAlpha = tile.opacity * opMul;
      ctx.fillStyle = SwimTilesConfig.convergence.color;
      ctx.font = `normal ${(tile.size * 16).toFixed(0)}px "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(tile.char, tile.x, tile.y);
    });
  }

  ctx.globalAlpha = 1;
}

/* -------------------------------------------------------------------- loop */

function tick(timestamp) {
  if (SwimState.hidden) {
    SwimState.raf = null;
    return;
  }

  if (!SwimState.lastTs) SwimState.lastTs = timestamp;
  let dt = (timestamp - SwimState.lastTs) / 1000;
  SwimState.lastTs = timestamp;
  if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
  dt = Math.min(dt, 0.05);

  SwimState.layers.forEach((layer) => {
    if (!ensureLayer(layer)) return;
    updateAmbient(layer, dt);
    if (layer.def.convergence) updateConvergence(layer, dt);
    drawLayer(layer);
  });

  SwimState.raf = requestAnimationFrame(tick);
}

function startLoop() {
  if (SwimState.raf) return;
  SwimState.hidden = false;
  SwimState.lastTs = 0;
  SwimState.raf = requestAnimationFrame(tick);
}

function stopLoop() {
  if (SwimState.raf) cancelAnimationFrame(SwimState.raf);
  SwimState.raf = null;
}

/* ------------------------------------------------------------------- setup */

function initSwimTiles() {
  if (SwimState.initialized) {
    ensureAllLayers();
    return;
  }
  SwimState.initialized = true;

  SwimState.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  SwimState.reduced = SwimState.mediaQuery.matches;
  SwimState.mediaListener = (event) => {
    SwimState.reduced = event.matches;
  };
  if (SwimState.mediaQuery.addEventListener) {
    SwimState.mediaQuery.addEventListener("change", SwimState.mediaListener);
  }

  SwimState.visibilityListener = () => {
    SwimState.hidden = document.hidden;
    if (SwimState.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  };
  document.addEventListener("visibilitychange", SwimState.visibilityListener);

  SwimState.resizeListener = () => ensureAllLayers();
  window.addEventListener("resize", SwimState.resizeListener);
  window.addEventListener("orientationchange", SwimState.resizeListener);

  LAYER_DEFS.forEach((def) => {
    SwimState.layers.set(def.key, createLayer(def));
  });
  ensureAllLayers();

  startLoop();
}

function refreshSwimTiles(players) {
  SwimState.players = Array.isArray(players) ? players : [];
  if (!SwimState.initialized) {
    initSwimTiles();
  } else {
    ensureAllLayers();
  }
  // Apply threshold changes synchronously so a score dropping to 30,000 or
  // below clears convergence tiles immediately, even if the tab is throttled.
  const dashboard = SwimState.layers.get("dashboard");
  if (dashboard && ensureLayer(dashboard)) {
    updateConvergence(dashboard, 0);
  }
}

function destroySwimTiles() {
  stopLoop();
  if (SwimState.mediaQuery && SwimState.mediaListener) {
    if (SwimState.mediaQuery.removeEventListener) {
      SwimState.mediaQuery.removeEventListener("change", SwimState.mediaListener);
    }
  }
  if (SwimState.visibilityListener) {
    document.removeEventListener("visibilitychange", SwimState.visibilityListener);
  }
  if (SwimState.resizeListener) {
    window.removeEventListener("resize", SwimState.resizeListener);
    window.removeEventListener("orientationchange", SwimState.resizeListener);
  }
  SwimState.layers.forEach((layer) => layer.canvas.remove());
  SwimState.layers.clear();
  SwimState.players = [];
  SwimState.initialized = false;
}

/* ------------------------------------------------------------------ expose */

window.SwimTiles = {
  init: initSwimTiles,
  refresh: refreshSwimTiles,
  destroy: destroySwimTiles,
  config: SwimTilesConfig,
  debug: () => ({
    reduced: SwimState.reduced,
    hidden: SwimState.hidden,
    layers: Array.from(SwimState.layers.entries()).map(([key, layer]) => ({
      key,
      w: layer.w,
      h: layer.h,
      tiles: layer.tiles.length,
      convergence: layer.convergence.length,
      targets: layer.targets.size,
    })),
  }),
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSwimTiles, { once: true });
} else {
  initSwimTiles();
}
