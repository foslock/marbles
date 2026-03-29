import { useRef, useEffect, useCallback, useState } from 'react';
import type { BoardData, PlayerState } from '../types/game';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

export interface MoveAnimation {
  playerId: string;
  path: number[]; // tile IDs to traverse
}

export interface TileSwapAnimation {
  sourceTileId: number;
  targetTileId: number;
  color: string; // 'green' or 'red'
}

interface Props {
  board: BoardData | null;
  players: PlayerState[];
  reachableTiles: { tileId: number; path: number[] }[];
  onTileClick?: (tileId: number) => void;
  moveAnimation?: MoveAnimation | null;
  onAnimationComplete?: () => void;
  myPlayerId?: string | null;
  activePlayerId?: string | null;
  tileSwapAnimation?: TileSwapAnimation | null;
  onSwapAnimationComplete?: () => void;
  initialScale?: number;
}

// Tile dimensions
const TILE_W = 38;
const TILE_H = 38;
const TILE_CORNER = 7;
const INNER_CIRCLE_R = 10;

const TILE_BG = '#1a2e4a';
const TILE_COLORS = {
  green: '#27ae60',
  red: '#e74c3c',
  neutral: '#546e7a',
};
const REACHABLE_STROKE = '#f39c12';
const EDGE_COLOR = '#1a3a5c';

// How much to zoom in on the player's tile
const PLAYER_ZOOM = 2.5;

// ms per path segment during movement
const MOVE_SPEED = 350;
// ms for the landing ring animation after token arrives
const LANDING_DURATION = 800;

export function GameBoard({ board, players, reachableTiles, onTileClick, moveAnimation, onAnimationComplete, myPlayerId, activePlayerId, tileSwapAnimation, onSwapAnimationComplete, initialScale = PLAYER_ZOOM }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(initialScale);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  // Movement animation state
  const animRef = useRef<{
    playerId: string;
    path: { x: number; y: number }[];
    progress: number;
    startTime: number;
  } | null>(null);

  // Landing ring animation state (runs after movement ends)
  const landingRef = useRef<{
    tileId: number;
    startTime: number;
  } | null>(null);

  const rafRef = useRef<number>(0);

  // Stable ref for draw so animation loops don't restart when draw changes
  const drawRef = useRef<() => void>(() => {});

  // Tile swap animation state
  const swapAnimRef = useRef<{
    sourceTileId: number;
    targetTileId: number;
    color: string;
    startTime: number;
  } | null>(null);
  const swapRafRef = useRef<number>(0);

  const reachableSet = new Set(reachableTiles.map((r) => r.tileId));

  // Compute offset to center a board-coordinate point at the canvas centre
  const _centerOffset = useCallback((bx: number, by: number, s: number): { x: number; y: number } => {
    const container = containerRef.current;
    if (!container || !board) return { x: 0, y: 0 };
    const w = container.clientWidth;
    const h = container.clientHeight;
    const boardW = board.width || 800;
    const boardH = board.height || 600;
    const fitScaleBase = Math.min(w / (boardW + 40), h / (boardH + 40));
    const fitScaleActual = fitScaleBase * s;
    return {
      x: (boardW / 2 - bx) * fitScaleActual,
      y: (boardH / 2 - by) * fitScaleActual,
    };
  }, [board]);

  // Center view on a tile (board coords) at the given scale
  const centerOnTile = useCallback((tileX: number, tileY: number, s: number) => {
    const off = _centerOffset(tileX, tileY, s);
    setScale(s);
    setOffset(off);
  }, [_centerOffset]);

  // Center on the local player's tile
  const centerOnMyPlayer = useCallback(() => {
    if (!board || !myPlayerId) return;
    const me = players.find((p) => p.id === myPlayerId);
    if (!me) return;
    const tile = board.tiles[String(me.currentTile)];
    if (!tile) return;
    centerOnTile(tile.x, tile.y, PLAYER_ZOOM);
  }, [board, myPlayerId, players, centerOnTile]);

  // Auto-center on first board load
  useEffect(() => {
    if (board && myPlayerId) {
      centerOnMyPlayer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.width]); // only on initial board load (width is stable after generation)

  // Follow the active player when the turn changes.
  useEffect(() => {
    if (!board || !activePlayerId) return;
    if (activePlayerId === myPlayerId) {
      centerOnMyPlayer();
    } else {
      const active = players.find((p) => p.id === activePlayerId);
      if (!active) return;
      const tile = board.tiles[String(active.currentTile)];
      if (tile) centerOnTile(tile.x, tile.y, PLAYER_ZOOM);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId]);

  // Helper: draw a rounded rectangle path
  function _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !board) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    const boardW = board.width || 800;
    const boardH = board.height || 600;
    const fitScale = Math.min(w / (boardW + 40), h / (boardH + 40)) * scale;
    const tx = w / 2 - (boardW / 2) * fitScale + offset.x;
    const ty = h / 2 - (boardH / 2) * fitScale + offset.y;
    ctx.translate(tx, ty);
    ctx.scale(fitScale, fitScale);

    const tiles = Object.values(board.tiles);

    const now = Date.now();
    // pulse: 0.0–1.0, drives reachable-tile glow and active-token ring
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    // expandPulse: 0.0–1.0 repeating cycle for expanding circle effect
    const expandPulse = (now % 1500) / 1500;
    const hasReachable = reachableSet.size > 0;

    // Draw edges — dim them slightly when a move choice is pending so
    // the highlighted tiles pop more.
    ctx.globalAlpha = hasReachable ? 0.25 : 1.0;
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth = 3;
    const drawnEdges = new Set<string>();
    for (const tile of tiles) {
      for (const nid of tile.neighbors) {
        const edgeKey = [Math.min(tile.id, nid), Math.max(tile.id, nid)].join('-');
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);
        const neighbor = board.tiles[String(nid)];
        if (!neighbor) continue;
        ctx.beginPath();
        ctx.moveTo(tile.x, tile.y);
        ctx.lineTo(neighbor.x, neighbor.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;

    // Draw tiles
    for (const tile of tiles) {
      const isReachable = reachableSet.has(tile.id);
      const innerColor = TILE_COLORS[tile.color] || TILE_COLORS.neutral;

      const rx = tile.x - TILE_W / 2;
      const ry = tile.y - TILE_H / 2;

      // Dim tiles that are not valid move targets while a choice is pending
      ctx.globalAlpha = hasReachable && !isReachable ? 0.28 : 1.0;

      // Tile background (rounded rect)
      _roundRect(ctx, rx, ry, TILE_W, TILE_H, TILE_CORNER);
      ctx.fillStyle = TILE_BG;
      ctx.fill();

      // Coloured inner circle
      ctx.beginPath();
      ctx.arc(tile.x, tile.y, INNER_CIRCLE_R, 0, Math.PI * 2);
      ctx.fillStyle = innerColor;
      ctx.fill();

      // Reachable: animated border + outer ring (no fill — opacity change is enough)
      if (isReachable) {
        // Bold animated border
        _roundRect(ctx, rx, ry, TILE_W, TILE_H, TILE_CORNER);
        ctx.strokeStyle = `rgba(243, 156, 18, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Outer pulsing ring
        _roundRect(ctx, rx - 5, ry - 5, TILE_W + 10, TILE_H + 10, TILE_CORNER + 5);
        ctx.strokeStyle = `rgba(243, 156, 18, ${pulse * 0.55})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }


      ctx.globalAlpha = 1.0;
    }

    // Draw player tokens (skip the actively-moving player — shown at interpolated position)
    const tilePlayerMap: Record<number, PlayerState[]> = {};
    const animating = animRef.current;
    for (const p of players) {
      if (animating && p.id === animating.playerId) continue;
      if (!tilePlayerMap[p.currentTile]) tilePlayerMap[p.currentTile] = [];
      tilePlayerMap[p.currentTile].push(p);
    }

    for (const [tileIdStr, tilePlayers] of Object.entries(tilePlayerMap)) {
      const tile = board.tiles[tileIdStr];
      if (!tile) continue;
      for (let i = 0; i < tilePlayers.length; i++) {
        const p = tilePlayers[i];
        const angle = (i / tilePlayers.length) * Math.PI * 2 - Math.PI / 2;
        const spread = tilePlayers.length > 1 ? 14 : 0;
        const isActive = p.id === activePlayerId;
        _drawToken(
          ctx,
          tile.x + Math.cos(angle) * spread,
          tile.y + Math.sin(angle) * spread,
          p,
          isActive,
          isActive ? expandPulse : 0,
          pulse,
        );
      }
    }

    // Draw animated player at interpolated position
    if (animating && animating.path.length > 0) {
      const animPlayer = players.find((p) => p.id === animating.playerId);
      if (animPlayer) {
        const segIndex = Math.floor(animating.progress);
        const segFrac = animating.progress - segIndex;
        const from = animating.path[Math.min(segIndex, animating.path.length - 1)];
        const to = animating.path[Math.min(segIndex + 1, animating.path.length - 1)];
        const ax = from.x + (to.x - from.x) * segFrac;
        const ay = from.y + (to.y - from.y) * segFrac;

        // Trail
        ctx.beginPath();
        ctx.arc(ax, ay, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(243, 156, 18, 0.3)';
        ctx.fill();

        _drawToken(ctx, ax, ay, animPlayer, false, 0, pulse);
      }
    }

    // Draw landing ring animation
    const landing = landingRef.current;
    if (landing) {
      const tile = board.tiles[String(landing.tileId)];
      if (tile) {
        const elapsed = performance.now() - landing.startTime;
        const t = Math.min(elapsed / LANDING_DURATION, 1);

        const tileRgb =
          tile.color === 'green' ? '39, 174, 96' :
          tile.color === 'red'   ? '231, 76, 60' :
                                   '243, 156, 18';

        // Outer expanding ring
        const outerRadius = 14 + 28 * t;
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${tileRgb}, ${(1 - t) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Second ring, slightly delayed and smaller
        if (t > 0.15) {
          const t2 = (t - 0.15) / 0.85;
          const radius2 = 14 + 18 * t2;
          ctx.beginPath();
          ctx.arc(tile.x, tile.y, radius2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${tileRgb}, ${(1 - t2) * 0.55})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Quick inner flash that fades out fast
        if (t < 0.35) {
          const innerT = t / 0.35;
          ctx.beginPath();
          ctx.arc(tile.x, tile.y, INNER_CIRCLE_R + 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${tileRgb}, ${(1 - innerT) * 0.35})`;
          ctx.fill();
        }
      }
    }

    // Draw tile swap animation
    const swapAnim = swapAnimRef.current;
    if (swapAnim) {
      const SWAP_DURATION = 1200;
      const elapsed = performance.now() - swapAnim.startTime;
      const t = Math.min(elapsed / SWAP_DURATION, 1);

      const swapRgb =
        swapAnim.color === 'green' ? '39, 174, 96' :
        swapAnim.color === 'red'   ? '231, 76, 60' :
                                     '84, 110, 122';

      const sourceTile = board.tiles[String(swapAnim.sourceTileId)];
      const targetTile = board.tiles[String(swapAnim.targetTileId)];

      // Phase 1 (0–0.45): circle rises from source tile and fades out
      if (t < 0.45 && sourceTile) {
        const p1 = t / 0.45;
        const riseY = sourceTile.y - p1 * 30;
        const alpha = (1 - p1) * 0.8;
        ctx.beginPath();
        ctx.arc(sourceTile.x, riseY, INNER_CIRCLE_R, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${swapRgb}, ${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${swapRgb}, ${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Phase 2 (0.55–1.0): circle fades in above target tile and settles
      if (t > 0.55 && targetTile) {
        const p2 = (t - 0.55) / 0.45;
        const settleY = targetTile.y - 30 + p2 * 30;
        const alpha = p2 * 0.8;
        ctx.beginPath();
        ctx.arc(targetTile.x, settleY, INNER_CIRCLE_R, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${swapRgb}, ${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${swapRgb}, ${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [board, players, reachableSet, offset, scale, activePlayerId]);

  // Keep drawRef current so animation loops use the latest draw without restarting
  drawRef.current = draw;

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);

    let pulseRaf = 0;
    if (reachableTiles.length > 0 || activePlayerId) {
      const pulseTick = () => {
        draw();
        pulseRaf = requestAnimationFrame(pulseTick);
      };
      pulseRaf = requestAnimationFrame(pulseTick);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (pulseRaf) cancelAnimationFrame(pulseRaf);
    };
  }, [draw, reachableTiles.length, activePlayerId]);

  // Move animation (includes landing ring phase before calling onAnimationComplete)
  // Uses drawRef.current instead of draw to avoid restarting when draw changes.
  useEffect(() => {
    if (!moveAnimation || !board) return;
    const pathCoords = moveAnimation.path
      .map((tileId) => board.tiles[String(tileId)])
      .filter(Boolean)
      .map((t) => ({ x: t.x, y: t.y }));

    if (pathCoords.length < 2) return;

    animRef.current = {
      playerId: moveAnimation.playerId,
      path: pathCoords,
      progress: 0,
      startTime: performance.now(),
    };
    landingRef.current = null;

    const totalDuration = (pathCoords.length - 1) * MOVE_SPEED;
    let lastHop = -1;

    const tick = (now: number) => {
      // ── Landing phase ────────────────────────────────────────────────────
      if (!animRef.current) {
        const landing = landingRef.current;
        if (!landing) return;
        const landingElapsed = now - landing.startTime;
        drawRef.current();
        if (landingElapsed >= LANDING_DURATION) {
          landingRef.current = null;
          drawRef.current();
          // Re-centre on destination
          const lastTileId = moveAnimation.path[moveAnimation.path.length - 1];
          const destTile = board.tiles[String(lastTileId)];
          if (destTile) {
            if (
              moveAnimation.playerId === myPlayerId ||
              moveAnimation.playerId === activePlayerId
            ) {
              centerOnTile(destTile.x, destTile.y, PLAYER_ZOOM);
            }
          }
          onAnimationComplete?.();
        } else {
          rafRef.current = requestAnimationFrame(tick);
        }
        return;
      }

      // ── Movement phase ───────────────────────────────────────────────────
      const anim = animRef.current;
      const elapsed = now - anim.startTime;
      anim.progress = Math.min(elapsed / MOVE_SPEED, pathCoords.length - 1);

      const currentHop = Math.floor(anim.progress);
      if (currentHop > lastHop) {
        lastHop = currentHop;
        if (currentHop < pathCoords.length - 1) Haptics.light();
      }

      // Follow the moving token with the camera
      if (
        moveAnimation.playerId === myPlayerId ||
        moveAnimation.playerId === activePlayerId
      ) {
        const seg = Math.min(Math.floor(anim.progress), pathCoords.length - 2);
        const t = anim.progress - seg;
        const ax = pathCoords[seg].x + (pathCoords[seg + 1].x - pathCoords[seg].x) * t;
        const ay = pathCoords[seg].y + (pathCoords[seg + 1].y - pathCoords[seg].y) * t;
        centerOnTile(ax, ay, PLAYER_ZOOM);
      }

      drawRef.current();

      if (elapsed >= totalDuration) {
        SFX.tileLand();
        Haptics.medium();
        animRef.current = null;

        // Kick off landing ring
        const lastTileId = moveAnimation.path[moveAnimation.path.length - 1];
        landingRef.current = { tileId: lastTileId, startTime: now };
        drawRef.current();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      animRef.current = null;
      landingRef.current = null;
    };
  }, [moveAnimation, board, onAnimationComplete, myPlayerId, activePlayerId, centerOnTile]);

  // Tile swap animation
  useEffect(() => {
    if (!tileSwapAnimation || !board) return;
    const SWAP_DURATION = 1200;

    swapAnimRef.current = {
      sourceTileId: tileSwapAnimation.sourceTileId,
      targetTileId: tileSwapAnimation.targetTileId,
      color: tileSwapAnimation.color,
      startTime: performance.now(),
    };

    const tick = () => {
      const anim = swapAnimRef.current;
      if (!anim) return;
      const elapsed = performance.now() - anim.startTime;
      drawRef.current();
      if (elapsed >= SWAP_DURATION) {
        swapAnimRef.current = null;
        drawRef.current();
        onSwapAnimationComplete?.();
      } else {
        swapRafRef.current = requestAnimationFrame(tick);
      }
    };

    swapRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (swapRafRef.current) cancelAnimationFrame(swapRafRef.current);
      swapAnimRef.current = null;
    };
  }, [tileSwapAnimation, board, onSwapAnimationComplete]);

  // Pan handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    setOffset({
      x: dragRef.current.offsetX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.offsetY + (e.clientY - dragRef.current.startY),
    });
  };

  const handlePointerUp = () => {
    dragRef.current.dragging = false;
  };

  // Tile tap for movement choice
  const handleClick = (e: React.MouseEvent) => {
    if (!board || !onTileClick) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const boardW = board.width || 800;
    const boardH = board.height || 600;
    const fitScale = Math.min(w / (boardW + 40), h / (boardH + 40)) * scale;
    const tx = w / 2 - (boardW / 2) * fitScale + offset.x;
    const ty = h / 2 - (boardH / 2) * fitScale + offset.y;

    const bx = (clickX - tx) / fitScale;
    const by = (clickY - ty) / fitScale;

    let closest: { id: number; dist: number } | null = null;
    for (const rt of reachableTiles) {
      const tile = board.tiles[String(rt.tileId)];
      if (!tile) continue;
      const dist = Math.hypot(tile.x - bx, tile.y - by);
      if (dist < (TILE_W / 2 + 8) && (!closest || dist < closest.dist)) {
        closest = { id: rt.tileId, dist };
      }
    }

    if (closest) onTileClick(closest.id);
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
      />
      <div style={styles.zoomControls}>
        <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.min(5, s * 1.2))}>
          +
        </button>
        <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.max(0.3, s / 1.2))}>
          -
        </button>
        <button
          style={styles.zoomBtn}
          title="Centre on me"
          onClick={() => {
            if (myPlayerId) {
              centerOnMyPlayer();
            } else {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }
          }}
        >
          ⌂
        </button>
      </div>
    </div>
  );
}

function _drawToken(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  p: PlayerState,
  isActive = false,
  expandPulse = 0,
  _pulse = 0,
) {
  if (isActive) {
    // Pulsing expanding circle that fades out
    const radius = 12 + expandPulse * 18;
    const alpha = 0.5 * (1 - expandPulse);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(243, 156, 18, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.fillStyle = p.token?.color || '#fff';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.token?.emoji || '?', px, py + 1);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    touchAction: 'none',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  zoomControls: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  zoomBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid #233554',
    background: 'rgba(17, 34, 64, 0.8)',
    color: '#a8b2d1',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
