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

export interface StealAnimation {
  fromPlayerId: string;
  toPlayerId: string;
  type: 'points' | 'marble';
  amount?: number;
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
  stealAnimation?: StealAnimation | null;
  onStealAnimationComplete?: () => void;
  activePlayerWaitState?: 'rolling' | 'choosing_tile' | 'choosing_target' | null;
  initialScale?: number;
}

// Tile dimensions
const TILE_W = 38;
const TILE_H = 38;
const TILE_CORNER = 7;
const INNER_CIRCLE_R = 10;

// Token dimensions — larger for clarity, shrinks when sharing a tile
const TOKEN_RADIUS = 15;
const TOKEN_RADIUS_SHARED = 10;
const TOKEN_FONT = '16px sans-serif';
const TOKEN_FONT_SHARED = '11px sans-serif';

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

export function GameBoard({ board, players, reachableTiles, onTileClick, moveAnimation, onAnimationComplete, myPlayerId, activePlayerId, tileSwapAnimation, onSwapAnimationComplete, stealAnimation, onStealAnimationComplete, activePlayerWaitState, initialScale = PLAYER_ZOOM }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(initialScale);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  // Stable refs for values used in animation effects (avoids restarting animations
  // when these props change mid-flight).
  const activePlayerIdRef = useRef(activePlayerId);
  activePlayerIdRef.current = activePlayerId;
  const myPlayerIdRef = useRef(myPlayerId);
  myPlayerIdRef.current = myPlayerId;
  const activePlayerWaitStateRef = useRef(activePlayerWaitState);
  activePlayerWaitStateRef.current = activePlayerWaitState;

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

  // Steal animation state
  const stealAnimRef = useRef<{
    fromPlayerId: string;
    toPlayerId: string;
    type: 'points' | 'marble';
    amount?: number;
    startTime: number;
  } | null>(null);
  const stealRafRef = useRef<number>(0);

  // Smooth panning — refs to track current/target for lerp
  const offsetRef = useRef(offset);
  const scaleRef = useRef(scale);
  const panRafRef = useRef<number>(0);

  // Keep refs in sync with state
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

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

  // Smooth pan to a tile over `duration` ms using easeInOutQuad
  const smoothCenterOnTile = useCallback((tileX: number, tileY: number, s: number, duration = 600) => {
    const targetOff = _centerOffset(tileX, tileY, s);
    const startOff = { ...offsetRef.current };
    const startScale = scaleRef.current;
    const startTime = performance.now();

    if (panRafRef.current) cancelAnimationFrame(panRafRef.current);

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const newScale = startScale + (s - startScale) * ease;
      const newOff = {
        x: startOff.x + (targetOff.x - startOff.x) * ease,
        y: startOff.y + (targetOff.y - startOff.y) * ease,
      };

      setScale(newScale);
      setOffset(newOff);

      if (t < 1) {
        panRafRef.current = requestAnimationFrame(tick);
      } else {
        panRafRef.current = 0;
      }
    };

    panRafRef.current = requestAnimationFrame(tick);
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

  // Follow the active player when the turn changes — smooth pan.
  useEffect(() => {
    if (!board || !activePlayerId) return;
    const target = activePlayerId === myPlayerId
      ? players.find((p) => p.id === myPlayerId)
      : players.find((p) => p.id === activePlayerId);
    if (!target) return;
    const tile = board.tiles[String(target.currentTile)];
    if (tile) smoothCenterOnTile(tile.x, tile.y, PLAYER_ZOOM, 700);
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
      const shared = tilePlayers.length > 1;
      for (let i = 0; i < tilePlayers.length; i++) {
        const p = tilePlayers[i];
        const angle = (i / tilePlayers.length) * Math.PI * 2 - Math.PI / 2;
        const spread = shared ? 16 : 0;
        const isActive = p.id === activePlayerId;
        _drawToken(
          ctx,
          tile.x + Math.cos(angle) * spread,
          tile.y + Math.sin(angle) * spread,
          p,
          isActive,
          isActive ? expandPulse : 0,
          pulse,
          shared,
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
        ctx.arc(ax, ay, TOKEN_RADIUS + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(243, 156, 18, 0.3)';
        ctx.fill();

        _drawToken(ctx, ax, ay, animPlayer, false, 0, pulse, false);
      }
    }

    // Draw wait-state icon above the active player's token (not for the local player)
    const waitState = activePlayerWaitStateRef.current;
    if (waitState && activePlayerId && activePlayerId !== myPlayerId) {
      const activePlayer = players.find((p) => p.id === activePlayerId);
      if (activePlayer && !(animating && animating.playerId === activePlayerId)) {
        const tile = board.tiles[String(activePlayer.currentTile)];
        if (tile) {
          // Calculate token position (account for shared tiles)
          const tilePlayers2 = tilePlayerMap[activePlayer.currentTile] || [];
          const idx = tilePlayers2.indexOf(activePlayer);
          const shared2 = tilePlayers2.length > 1;
          const angle2 = tilePlayers2.length > 1 ? (idx / tilePlayers2.length) * Math.PI * 2 - Math.PI / 2 : 0;
          const spread2 = shared2 ? 16 : 0;
          const tokenX = tile.x + Math.cos(angle2) * spread2;
          const tokenY = tile.y + Math.sin(angle2) * spread2;
          const r = shared2 ? TOKEN_RADIUS_SHARED : TOKEN_RADIUS;

          // Bobbing animation
          const bob = Math.sin(now / 400) * 2;
          const iconY = tokenY - r - 14 + bob;

          const icon = waitState === 'rolling' ? '\uD83C\uDFB2'
            : waitState === 'choosing_tile' ? '\uD83D\uDC46'
            : '\uD83C\uDFAF';

          // Background pill
          ctx.beginPath();
          ctx.arc(tokenX, iconY, 9, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(10, 25, 47, 0.85)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(243, 156, 18, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Icon emoji
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, tokenX, iconY + 0.5);
        }
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

    // Draw tile swap animation — prominent bubble traveling between tiles
    const swapAnim = swapAnimRef.current;
    if (swapAnim) {
      const SWAP_DURATION = 3000;
      const elapsed = performance.now() - swapAnim.startTime;
      const t = Math.min(elapsed / SWAP_DURATION, 1);

      const swapRgb =
        swapAnim.color === 'green' ? '39, 174, 96' :
        swapAnim.color === 'red'   ? '231, 76, 60' :
                                     '84, 110, 122';

      const sourceTile = board.tiles[String(swapAnim.sourceTileId)];
      const targetTile = board.tiles[String(swapAnim.targetTileId)];

      const BUBBLE_R = INNER_CIRCLE_R + 6;

      // Phase 1 (0–0.3): bubble rises from source tile with expanding ring
      if (t < 0.3 && sourceTile) {
        const p1 = t / 0.3;
        const riseY = sourceTile.y - p1 * 40;
        const alpha = Math.min(p1 * 3, 1) * 0.9;

        // Expanding ring at source
        const ringR = INNER_CIRCLE_R + p1 * 30;
        ctx.beginPath();
        ctx.arc(sourceTile.x, sourceTile.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${swapRgb}, ${(1 - p1) * 0.6})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // The bubble itself
        ctx.beginPath();
        ctx.arc(sourceTile.x, riseY, BUBBLE_R, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${swapRgb}, ${alpha})`;
        ctx.fill();
        ctx.shadowColor = `rgba(${swapRgb}, 0.6)`;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Phase 2 (0.3–0.7): bubble travels from source to target in an arc
      if (t >= 0.3 && t < 0.7 && sourceTile && targetTile) {
        const p2 = (t - 0.3) / 0.4;
        const ease = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;
        const sx = sourceTile.x;
        const sy = sourceTile.y - 40; // start from risen position
        const ex = targetTile.x;
        const ey = targetTile.y - 40;
        const midY = Math.min(sy, ey) - 60; // arc upward
        const bx = sx + (ex - sx) * ease;
        const by = sy + (midY - sy) * 2 * ease * (1 - ease) + (ey - sy) * ease * ease;

        // Trail particles
        for (let i = 0; i < 3; i++) {
          const trailT = Math.max(0, ease - i * 0.08);
          const trailX = sx + (ex - sx) * trailT;
          const trailY = sy + (midY - sy) * 2 * trailT * (1 - trailT) + (ey - sy) * trailT * trailT;
          ctx.beginPath();
          ctx.arc(trailX, trailY, BUBBLE_R * (0.4 - i * 0.1), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${swapRgb}, ${0.3 - i * 0.1})`;
          ctx.fill();
        }

        // Main bubble
        ctx.beginPath();
        ctx.arc(bx, by, BUBBLE_R, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${swapRgb}, 0.9)`;
        ctx.fill();
        ctx.shadowColor = `rgba(${swapRgb}, 0.7)`;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Phase 3 (0.7–1.0): bubble settles into target tile with expanding ring
      if (t >= 0.7 && targetTile) {
        const p3 = (t - 0.7) / 0.3;
        const settleY = targetTile.y - 40 + p3 * 40;
        const alpha = (1 - p3 * 0.3) * 0.9;

        // The bubble settling
        ctx.beginPath();
        ctx.arc(targetTile.x, settleY, BUBBLE_R * (1 - p3 * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${swapRgb}, ${alpha})`;
        ctx.fill();
        ctx.shadowColor = `rgba(${swapRgb}, 0.6)`;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Expanding ring at target
        if (p3 > 0.5) {
          const ringP = (p3 - 0.5) / 0.5;
          const ringR = INNER_CIRCLE_R + ringP * 25;
          ctx.beginPath();
          ctx.arc(targetTile.x, targetTile.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${swapRgb}, ${(1 - ringP) * 0.6})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    // Draw steal animation — icon arcing from source to target player
    const stealAnim = stealAnimRef.current;
    if (stealAnim && board) {
      const STEAL_DURATION = 1400;
      const elapsed = performance.now() - stealAnim.startTime;
      const t = Math.min(elapsed / STEAL_DURATION, 1);

      const fromPlayer = players.find((p) => p.id === stealAnim.fromPlayerId);
      const toPlayer = players.find((p) => p.id === stealAnim.toPlayerId);
      if (fromPlayer && toPlayer) {
        const fromTile = board.tiles[String(fromPlayer.currentTile)];
        const toTile = board.tiles[String(toPlayer.currentTile)];
        if (fromTile && toTile) {
          // Ease out cubic
          const ease = 1 - Math.pow(1 - t, 3);
          const fx = fromTile.x;
          const fy = fromTile.y;
          const tx2 = toTile.x;
          const ty2 = toTile.y;
          // Arc upward
          const midY = Math.min(fy, ty2) - 50;
          const cx = fx + (tx2 - fx) * ease;
          const cy = fy + (midY - fy) * 2 * ease * (1 - ease) + (ty2 - fy) * ease * ease;

          // Glow trail
          const trailAlpha = 0.4 * (1 - t);
          ctx.beginPath();
          ctx.arc(cx, cy, 12, 0, Math.PI * 2);
          ctx.fillStyle = stealAnim.type === 'marble'
            ? `rgba(243, 156, 18, ${trailAlpha})`
            : `rgba(204, 214, 246, ${trailAlpha})`;
          ctx.fill();

          // Icon
          const iconAlpha = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
          ctx.globalAlpha = iconAlpha;
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(stealAnim.type === 'marble' ? '\uD83D\uDD2E' : '\u2B50', cx, cy);
          ctx.globalAlpha = 1;

          // Amount label
          if (stealAnim.amount && t < 0.7) {
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = `rgba(255, 255, 255, ${(1 - t / 0.7) * 0.9})`;
            ctx.fillText(`${stealAnim.amount}`, cx, cy - 14);
          }

          // Burst at source on start
          if (t < 0.3) {
            const bt = t / 0.3;
            const burstR = 8 + bt * 20;
            ctx.beginPath();
            ctx.arc(fx, fy, burstR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(231, 76, 60, ${(1 - bt) * 0.7})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Burst at destination on arrival
          if (t > 0.7) {
            const bt = (t - 0.7) / 0.3;
            const burstR = 8 + bt * 20;
            ctx.beginPath();
            ctx.arc(tx2, ty2, burstR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(39, 174, 96, ${(1 - bt) * 0.7})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }, [board, players, reachableSet, offset, scale, activePlayerId, activePlayerWaitState, myPlayerId]);

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
          // Re-centre on destination (smooth)
          const lastTileId = moveAnimation.path[moveAnimation.path.length - 1];
          const destTile = board.tiles[String(lastTileId)];
          if (destTile) {
            if (
              moveAnimation.playerId === myPlayerIdRef.current ||
              moveAnimation.playerId === activePlayerIdRef.current
            ) {
              smoothCenterOnTile(destTile.x, destTile.y, PLAYER_ZOOM, 400);
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
        if (currentHop < pathCoords.length - 1) { SFX.tileStep(); Haptics.light(); }
      }

      // Follow the moving token with the camera
      if (
        moveAnimation.playerId === myPlayerIdRef.current ||
        moveAnimation.playerId === activePlayerIdRef.current
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
  }, [moveAnimation, board, onAnimationComplete, centerOnTile, smoothCenterOnTile]);

  // Tile swap animation — camera follows the effect bubble
  useEffect(() => {
    if (!tileSwapAnimation || !board) return;
    const SWAP_DURATION = 3000; // longer for camera panning

    swapAnimRef.current = {
      sourceTileId: tileSwapAnimation.sourceTileId,
      targetTileId: tileSwapAnimation.targetTileId,
      color: tileSwapAnimation.color,
      startTime: performance.now(),
    };

    // Pan camera to the source tile first
    const sourceTile = board.tiles[String(tileSwapAnimation.sourceTileId)];
    const targetTile = board.tiles[String(tileSwapAnimation.targetTileId)];
    if (sourceTile) {
      smoothCenterOnTile(sourceTile.x, sourceTile.y, PLAYER_ZOOM * 1.1, 400);
    }

    // At ~40% through, pan to target tile
    const panToTargetTimer = setTimeout(() => {
      if (targetTile) {
        smoothCenterOnTile(targetTile.x, targetTile.y, PLAYER_ZOOM * 1.1, 500);
      }
    }, 800);

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
      clearTimeout(panToTargetTimer);
      if (swapRafRef.current) cancelAnimationFrame(swapRafRef.current);
      swapAnimRef.current = null;
    };
  }, [tileSwapAnimation, board, onSwapAnimationComplete, smoothCenterOnTile]);

  // Steal animation
  useEffect(() => {
    if (!stealAnimation || !board) return;
    const STEAL_DURATION = 1400;

    stealAnimRef.current = {
      ...stealAnimation,
      startTime: performance.now(),
    };

    const tick = () => {
      const anim = stealAnimRef.current;
      if (!anim) return;
      const elapsed = performance.now() - anim.startTime;
      drawRef.current();
      if (elapsed >= STEAL_DURATION) {
        stealAnimRef.current = null;
        drawRef.current();
        onStealAnimationComplete?.();
      } else {
        stealRafRef.current = requestAnimationFrame(tick);
      }
    };

    stealRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (stealRafRef.current) cancelAnimationFrame(stealRafRef.current);
      stealAnimRef.current = null;
    };
  }, [stealAnimation, board, onStealAnimationComplete]);

  // Clean up pan animation on unmount
  useEffect(() => {
    return () => {
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    };
  }, []);

  // ── Multitouch pan / pinch-to-zoom ────────────────────────────────────────
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [hasScrollWheel, setHasScrollWheel] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // Start pinch
      dragStartRef.current = null;
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      pinchRef.current = { dist, scale: scaleRef.current, cx, cy };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / pinchRef.current.dist;
      setScale(Math.max(0.3, Math.min(5, pinchRef.current.scale * ratio)));
    } else if (pointersRef.current.size === 1 && dragStartRef.current) {
      setOffset({
        x: dragStartRef.current.ox + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.oy + (e.clientY - dragStartRef.current.y),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragStartRef.current = null;
  };

  // Scroll-wheel zoom (desktop)
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setHasScrollWheel(true);
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setScale((s) => Math.max(0.3, Math.min(5, s * zoomFactor)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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

  // ── Zoom to fit reachable tiles + current player tile ────────────────────
  useEffect(() => {
    if (!board || !myPlayerId || reachableTiles.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const me = players.find((p) => p.id === myPlayerId);
    const myTile = me ? board.tiles[String(me.currentTile)] : null;

    // Gather all tile positions (reachable + current)
    const coords: { x: number; y: number }[] = [];
    for (const rt of reachableTiles) {
      const t = board.tiles[String(rt.tileId)];
      if (t) coords.push({ x: t.x, y: t.y });
    }
    if (myTile) coords.push({ x: myTile.x, y: myTile.y });
    if (coords.length === 0) return;

    const minX = Math.min(...coords.map((c) => c.x));
    const maxX = Math.max(...coords.map((c) => c.x));
    const minY = Math.min(...coords.map((c) => c.y));
    const maxY = Math.max(...coords.map((c) => c.y));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Add buffer (TILE_W * 3 on each side)
    const spanX = (maxX - minX) + TILE_W * 6;
    const spanY = (maxY - minY) + TILE_H * 6;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const boardW = board.width || 800;
    const boardH = board.height || 600;
    const fitScaleBase = Math.min(w / (boardW + 40), h / (boardH + 40));

    // Compute scale that fits the span
    const neededScale = Math.min(w / (spanX * fitScaleBase), h / (spanY * fitScaleBase));
    // Clamp: don't zoom out too far or zoom in more than PLAYER_ZOOM
    const targetScale = Math.max(0.5, Math.min(PLAYER_ZOOM, neededScale));

    smoothCenterOnTile(cx, cy, targetScale, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachableTiles.length > 0 ? 'has' : 'none']);

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
        {!hasScrollWheel && (
          <>
            <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.min(5, s * 1.2))}>
              +
            </button>
            <button style={styles.zoomBtn} onClick={() => setScale((s) => Math.max(0.3, s / 1.2))}>
              -
            </button>
          </>
        )}
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
  shared = false,
) {
  const r = shared ? TOKEN_RADIUS_SHARED : TOKEN_RADIUS;
  const font = shared ? TOKEN_FONT_SHARED : TOKEN_FONT;

  if (isActive) {
    // Pulsing expanding circle that fades out
    const radius = r + 4 + expandPulse * 20;
    const alpha = 0.5 * (1 - expandPulse);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(243, 156, 18, ${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Drop shadow for depth
  ctx.beginPath();
  ctx.arc(px + 1, py + 1, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = p.token?.color || '#fff';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = shared ? 1.5 : 2.5;
  ctx.stroke();
  ctx.font = font;
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
