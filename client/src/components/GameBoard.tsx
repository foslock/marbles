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
}

const TILE_RADIUS = 18;
const TILE_COLORS = {
  green: '#27ae60',
  red: '#e74c3c',
  neutral: '#34495e',
};
const REACHABLE_COLOR = '#f39c12';
const EDGE_COLOR = '#1a3a5c';

export function GameBoard({ board, players, reachableTiles, onTileClick, moveAnimation, onAnimationComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  // Animation state
  const animRef = useRef<{
    playerId: string;
    path: { x: number; y: number }[];
    progress: number; // 0 to path.length - 1
    startTime: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  const reachableSet = new Set(reachableTiles.map((r) => r.tileId));

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

    // Auto-fit board into view
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

    // Draw tiles
    const pulse = Math.sin(Date.now() / 400) * 0.3 + 0.7; // 0.4 to 1.0
    for (const tile of tiles) {
      const isReachable = reachableSet.has(tile.id);
      const baseColor = TILE_COLORS[tile.color] || TILE_COLORS.neutral;

      // Glow ring for reachable tiles
      if (isReachable) {
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, TILE_RADIUS + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(243, 156, 18, ${pulse * 0.3})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(tile.x, tile.y, TILE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isReachable ? REACHABLE_COLOR : baseColor;
      ctx.fill();

      if (isReachable) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      if (tile.isFork) {
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, TILE_RADIUS + 4, 0, Math.PI * 2);
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
      // Skip animated player from tile map — we'll draw them separately
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
        const px = tile.x + Math.cos(angle) * spread;
        const py = tile.y + Math.sin(angle) * spread;
        _drawToken(ctx, px, py, p);
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

        // Trail effect
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

    // Animate pulse on reachable tiles
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

  // Start animation when moveAnimation prop changes
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

    const SPEED = 200; // ms per tile hop
    const totalDuration = (pathCoords.length - 1) * SPEED;

    let lastHop = -1;
    const tick = (now: number) => {
      const anim = animRef.current;
      if (!anim) return;

      const elapsed = now - anim.startTime;
      anim.progress = Math.min(elapsed / SPEED, pathCoords.length - 1);

      // Play hop sound at each tile
      const currentHop = Math.floor(anim.progress);
      if (currentHop > lastHop) {
        lastHop = currentHop;
        if (currentHop < pathCoords.length - 1) {
          Haptics.light();
        }
      }

      draw();

      if (elapsed >= totalDuration) {
        // Animation complete
        SFX.tileLand();
        Haptics.medium();
        animRef.current = null;
        draw();
        onAnimationComplete?.();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      animRef.current = null;
    };
  }, [moveAnimation, board, draw, onAnimationComplete]);

  // Touch/mouse handlers for pan
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

  // Handle tile tap
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

    // Convert click to board coords
    const bx = (clickX - tx) / fitScale;
    const by = (clickY - ty) / fitScale;

    // Find closest reachable tile
    let closest: { id: number; dist: number } | null = null;
    for (const rt of reachableTiles) {
      const tile = board.tiles[String(rt.tileId)];
      if (!tile) continue;
      const dist = Math.hypot(tile.x - bx, tile.y - by);
      if (dist < TILE_RADIUS * 2 && (!closest || dist < closest.dist)) {
        closest = { id: rt.tileId, dist };
      }
    }

    if (closest) {
      onTileClick(closest.id);
    }
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
        <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.min(3, s * 1.2))}>
          +
        </button>
        <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.max(0.3, s / 1.2))}>
          -
        </button>
        <button
          style={styles.zoomBtn}
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
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
