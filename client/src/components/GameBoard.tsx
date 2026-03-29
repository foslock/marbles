import { useRef, useEffect, useCallback, useState } from 'react';
import type { BoardData, PlayerState } from '../types/game';

interface Props {
  board: BoardData | null;
  players: PlayerState[];
  reachableTiles: { tileId: number; path: number[] }[];
  onTileClick?: (tileId: number) => void;
}

const TILE_RADIUS = 18;
const TILE_COLORS = {
  green: '#27ae60',
  red: '#e74c3c',
  neutral: '#34495e',
};
const REACHABLE_COLOR = '#f39c12';
const EDGE_COLOR = '#1a3a5c';

export function GameBoard({ board, players, reachableTiles, onTileClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

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
    for (const tile of tiles) {
      const isReachable = reachableSet.has(tile.id);
      const baseColor = TILE_COLORS[tile.color] || TILE_COLORS.neutral;

      ctx.beginPath();
      ctx.arc(tile.x, tile.y, TILE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isReachable ? REACHABLE_COLOR : baseColor;
      ctx.fill();

      if (isReachable) {
        ctx.strokeStyle = '#fff';
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
    for (const p of players) {
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

        // Token circle
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fillStyle = p.token?.color || '#fff';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Emoji
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.token?.emoji || '?', px, py + 1);
      }
    }

    ctx.restore();
  }, [board, players, reachableSet, offset, scale]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

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
