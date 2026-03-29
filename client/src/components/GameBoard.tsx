import { useRef, useEffect, useCallback, useState } from 'react';
import type { BoardData, PlayerState } from '../types/game';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

export interface MoveAnimation {
  playerId: string;
  path: number[]; // tile IDs to traverse
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

export function GameBoard({ board, players, reachableTiles, onTileClick, moveAnimation, onAnimationComplete, myPlayerId, activePlayerId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(PLAYER_ZOOM);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  // Animation state
  const animRef = useRef<{
    playerId: string;
    path: { x: number; y: number }[];
    progress: number;
    startTime: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

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
  // If it's our turn, re-center on ourselves; otherwise pan to the active player.
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

    // Draw edges
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

    const pulse = Math.sin(Date.now() / 400) * 0.3 + 0.7; // 0.4–1.0

    // Draw tiles
    for (const tile of tiles) {
      const isReachable = reachableSet.has(tile.id);
      const innerColor = TILE_COLORS[tile.color] || TILE_COLORS.neutral;

      const rx = tile.x - TILE_W / 2;
      const ry = tile.y - TILE_H / 2;

      // Tile background (rounded rect)
      _roundRect(ctx, rx, ry, TILE_W, TILE_H, TILE_CORNER);
      ctx.fillStyle = TILE_BG;
      ctx.fill();

      // Coloured inner circle
      ctx.beginPath();
      ctx.arc(tile.x, tile.y, INNER_CIRCLE_R, 0, Math.PI * 2);
      ctx.fillStyle = innerColor;
      ctx.fill();

      // Reachable: animated orange outline on the rounded rect
      if (isReachable) {
        _roundRect(ctx, rx, ry, TILE_W, TILE_H, TILE_CORNER);
        ctx.strokeStyle = `rgba(243, 156, 18, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Subtle glow fill
        _roundRect(ctx, rx, ry, TILE_W, TILE_H, TILE_CORNER);
        ctx.fillStyle = `rgba(243, 156, 18, ${pulse * 0.08})`;
        ctx.fill();
      }

      // Fork tile indicator: dashed outline
      if (tile.isFork) {
        _roundRect(ctx, rx - 3, ry - 3, TILE_W + 6, TILE_H + 6, TILE_CORNER + 3);
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw player tokens
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
        _drawToken(ctx, tile.x + Math.cos(angle) * spread, tile.y + Math.sin(angle) * spread, p);
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

        _drawToken(ctx, ax, ay, animPlayer);
      }
    }

    ctx.restore();
  }, [board, players, reachableSet, offset, scale]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);

    let pulseRaf = 0;
    if (reachableTiles.length > 0) {
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
  }, [draw, reachableTiles.length]);

  // Move animation
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

    const SPEED = 200;
    const totalDuration = (pathCoords.length - 1) * SPEED;
    let lastHop = -1;

    const tick = (now: number) => {
      const anim = animRef.current;
      if (!anim) return;

      const elapsed = now - anim.startTime;
      anim.progress = Math.min(elapsed / SPEED, pathCoords.length - 1);

      const currentHop = Math.floor(anim.progress);
      if (currentHop > lastHop) {
        lastHop = currentHop;
        if (currentHop < pathCoords.length - 1) Haptics.light();
      }

      draw();

      if (elapsed >= totalDuration) {
        SFX.tileLand();
        Haptics.medium();
        animRef.current = null;
        draw();
        onAnimationComplete?.();
        // Re-centre on whichever player just moved (us or the active opponent)
        const lastTileId = moveAnimation.path[moveAnimation.path.length - 1];
        const destTile = board.tiles[String(lastTileId)];
        if (destTile) {
          if (moveAnimation.playerId === myPlayerId ||
              moveAnimation.playerId === activePlayerId) {
            centerOnTile(destTile.x, destTile.y, PLAYER_ZOOM);
          }
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      animRef.current = null;
    };
  }, [moveAnimation, board, draw, onAnimationComplete, myPlayerId, activePlayerId, centerOnTile]);

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

function _drawToken(ctx: CanvasRenderingContext2D, px: number, py: number, p: PlayerState) {
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
