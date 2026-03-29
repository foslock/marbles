import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

interface Obstacle {
  id: number;
  lane: number; // 0, 1, or 2
  y: number;
}

const LANES = 3;
const LANE_WIDTH_PERCENT = 100 / LANES;
const OBSTACLE_SPEED = 4; // pixels per tick
const SPAWN_INTERVAL = 600; // ms
const TICK_INTERVAL = 30; // ms

export function SwipeDodge({ onScoreUpdate }: MinigameComponentProps) {
  const [playerLane, setPlayerLane] = useState(1); // Start in middle
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const nextId = useRef(0);
  const alive = useRef(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Spawn obstacles
  useEffect(() => {
    const interval = setInterval(() => {
      if (!alive.current) return;
      setObstacles((prev) => [
        ...prev,
        { id: nextId.current++, lane: Math.floor(Math.random() * LANES), y: -30 },
      ]);
    }, SPAWN_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Game tick — move obstacles, check collisions, score
  useEffect(() => {
    const interval = setInterval(() => {
      if (!alive.current) return;

      setObstacles((prev) => {
        const moved = prev.map((o) => ({ ...o, y: o.y + OBSTACLE_SPEED }));

        // Check collision with player (player is at y ~= 80% of container)
        const playerY = 380; // approximate
        for (const o of moved) {
          if (o.lane === playerLane && Math.abs(o.y - playerY) < 30) {
            // Hit! Freeze briefly, then continue (lose some time)
            alive.current = false;
            setTimeout(() => { alive.current = true; }, 500);
            return moved.filter((ob) => ob.y < 450);
          }
        }

        // Score for each obstacle that passed
        const passed = moved.filter((o) => o.y > 450);
        if (passed.length > 0) {
          scoreRef.current += passed.length;
          onScoreUpdate(scoreRef.current);
        }

        return moved.filter((o) => o.y <= 450);
      });
    }, TICK_INTERVAL);
    return () => clearInterval(interval);
  }, [playerLane, onScoreUpdate]);

  // Swipe detection
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!touchStart.current) return;
    const dx = e.clientX - touchStart.current.x;
    const threshold = 30;

    if (dx > threshold) {
      setPlayerLane((l) => Math.min(LANES - 1, l + 1));
    } else if (dx < -threshold) {
      setPlayerLane((l) => Math.max(0, l - 1));
    }
    touchStart.current = null;
  }, []);

  // Also allow tap on lanes
  const handleLaneTap = useCallback((lane: number) => {
    setPlayerLane(lane);
  }, []);

  return (
    <div
      style={styles.container}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Lane dividers */}
      {Array.from({ length: LANES }).map((_, i) => (
        <div
          key={`lane-${i}`}
          style={{
            ...styles.lane,
            left: `${i * LANE_WIDTH_PERCENT}%`,
            width: `${LANE_WIDTH_PERCENT}%`,
          }}
          onPointerDown={(e) => { e.stopPropagation(); handleLaneTap(i); }}
        />
      ))}

      {/* Obstacles */}
      {obstacles.map((o) => (
        <div
          key={o.id}
          style={{
            ...styles.obstacle,
            left: `${o.lane * LANE_WIDTH_PERCENT + LANE_WIDTH_PERCENT / 2 - 5}%`,
            top: o.y,
          }}
        />
      ))}

      {/* Player */}
      <div
        style={{
          ...styles.player,
          left: `${playerLane * LANE_WIDTH_PERCENT + LANE_WIDTH_PERCENT / 2 - 5}%`,
          opacity: alive.current ? 1 : 0.3,
        }}
      />

      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
      <span style={styles.hint}>Swipe or tap to dodge!</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', position: 'relative',
    touchAction: 'none', overflow: 'hidden',
    background: 'linear-gradient(180deg, #0a192f 0%, #112240 100%)',
  },
  lane: {
    position: 'absolute', top: 0, bottom: 0,
    borderRight: '1px solid rgba(255,255,255,0.05)',
  },
  obstacle: {
    position: 'absolute', width: '10%', height: '28px',
    background: '#e74c3c', borderRadius: '6px',
    transform: 'translateX(-50%)',
  },
  player: {
    position: 'absolute', bottom: '60px', width: '10%', height: '32px',
    background: '#2ecc71', borderRadius: '8px',
    transform: 'translateX(-50%)',
    transition: 'left 0.15s ease-out, opacity 0.2s',
  },
  scoreOverlay: {
    position: 'absolute', top: '8px', right: '12px',
    color: '#f39c12', fontSize: '24px', fontWeight: 800,
  },
  hint: {
    position: 'absolute', bottom: '16px', width: '100%',
    textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px',
  },
};
