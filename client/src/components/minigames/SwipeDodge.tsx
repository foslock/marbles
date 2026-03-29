import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

interface Obstacle {
  id: number;
  lane: number; // 0, 1, or 2
  y: number;    // px from top
}

const LANES = 3;
const W = 300;
const H = 480;
const PLAYER_Y = H - 80;           // px from top (centre of player)
const OBSTACLE_SPEED = 8;           // px per tick (was 4 — doubled+)
const SPAWN_INTERVAL = 550;         // ms between spawns (slightly faster)
const TICK_MS = 30;
const HIT_WINDOW = 34;              // px distance from PLAYER_Y that counts as a hit
const SWIPE_THRESHOLD = 28;         // px horizontal movement = swipe

export function SwipeDodge({ onScoreUpdate }: MinigameComponentProps) {
  const [playerLane, setPlayerLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const nextId = useRef(0);
  const frozenRef = useRef(false);          // brief freeze on hit
  const playerLaneRef = useRef(1);          // mirror for use inside setObstacles
  const pointerStart = useRef<{ x: number; y: number; lane: number } | null>(null);

  const moveTo = useCallback((lane: number) => {
    const l = Math.max(0, Math.min(LANES - 1, lane));
    playerLaneRef.current = l;
    setPlayerLane(l);
  }, []);

  // Spawn obstacles
  useEffect(() => {
    const interval = setInterval(() => {
      if (frozenRef.current) return;
      setObstacles((prev) => [
        ...prev,
        { id: nextId.current++, lane: Math.floor(Math.random() * LANES), y: -30 },
      ]);
    }, SPAWN_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Game tick
  useEffect(() => {
    const interval = setInterval(() => {
      setObstacles((prev) => {
        const moved = prev.map((o) => ({ ...o, y: o.y + OBSTACLE_SPEED }));

        // Collision check
        if (!frozenRef.current) {
          for (const o of moved) {
            if (o.lane === playerLaneRef.current && Math.abs(o.y - PLAYER_Y) < HIT_WINDOW) {
              frozenRef.current = true;
              setTimeout(() => { frozenRef.current = false; }, 600);
              return moved.filter((ob) => ob !== o && ob.y < H + 10);
            }
          }
        }

        // Score obstacles that passed the bottom
        const passed = moved.filter((o) => o.y > H + 10);
        if (passed.length > 0) {
          scoreRef.current += passed.length;
          onScoreUpdate(scoreRef.current);
        }

        return moved.filter((o) => o.y <= H + 10);
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [onScoreUpdate]);

  // Unified pointer handler: tap on a lane → jump to it; horizontal swipe → shift lane
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const tappedLane = Math.floor((relX / rect.width) * LANES);
    pointerStart.current = { x: e.clientX, y: e.clientY, lane: tappedLane };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      // Swipe: shift one lane
      moveTo(playerLaneRef.current + (dx > 0 ? 1 : -1));
    } else {
      // Tap: jump directly to tapped lane
      moveTo(pointerStart.current.lane);
    }
    pointerStart.current = null;
  }, [moveTo]);

  const laneW = W / LANES;

  return (
    <div
      style={{ ...styles.container, width: W, height: H }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStart.current = null; }}
    >
      {/* Lane dividers (visual only — no pointer handlers) */}
      {Array.from({ length: LANES }).map((_, i) => (
        <div
          key={`lane-${i}`}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: i * laneW, width: laneW,
            borderRight: i < LANES - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}
        />
      ))}

      {/* Obstacles */}
      {obstacles.map((o) => (
        <div
          key={o.id}
          style={{
            position: 'absolute',
            left: o.lane * laneW + laneW * 0.15,
            width: laneW * 0.7,
            height: 28,
            top: o.y - 14,
            background: '#e74c3c',
            borderRadius: 6,
          }}
        />
      ))}

      {/* Player */}
      <div
        style={{
          position: 'absolute',
          left: playerLane * laneW + laneW * 0.15,
          width: laneW * 0.7,
          height: 34,
          top: PLAYER_Y - 17,
          background: '#2ecc71',
          borderRadius: 8,
          opacity: frozenRef.current ? 0.3 : 1,
          transition: 'left 0.12s ease-out, opacity 0.2s',
        }}
      />

      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
      <span style={styles.hint}>Swipe or tap a lane to dodge!</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    touchAction: 'none',
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #0a192f 0%, #112240 100%)',
    borderRadius: '14px',
    flexShrink: 0,
    userSelect: 'none',
  },
  scoreOverlay: {
    position: 'absolute', top: '8px', right: '12px',
    color: '#f39c12', fontSize: '24px', fontWeight: 800,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute', bottom: '16px', width: '100%',
    textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px',
    pointerEvents: 'none',
  },
};
