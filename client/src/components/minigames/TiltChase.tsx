import { useState, useEffect, useRef } from 'react';
import type { MinigameComponentProps } from './types';

/**
 * TiltChase: Guide your dot to follow a moving target using device accelerometer.
 * Falls back to touch/pointer control if accelerometer is unavailable.
 */
export function TiltChase({ onScoreUpdate, config }: MinigameComponentProps) {
  const [playerPos, setPlayerPos] = useState({ x: 150, y: 200 });
  const [targetPos, setTargetPos] = useState({ x: 150, y: 200 });
  const [hasAccel, setHasAccel] = useState(false);
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const accelRef = useRef({ x: 0, y: 0 });

  // Try to get accelerometer access
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      const accel = e.accelerationIncludingGravity;
      if (accel) {
        setHasAccel(true);
        // Invert x for natural tilt, scale down
        accelRef.current = {
          x: -(accel.x || 0) * 2,
          y: (accel.y || 0) * 2,
        };
      }
    };

    // Request permission on iOS 13+
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission().then((state: string) => {
        if (state === 'granted') {
          window.addEventListener('devicemotion', handler);
        }
      }).catch(() => {});
    } else {
      window.addEventListener('devicemotion', handler);
    }

    return () => window.removeEventListener('devicemotion', handler);
  }, []);

  // Move target around
  useEffect(() => {
    const interval = setInterval(() => {
      setTargetPos({
        x: 40 + Math.random() * 220,
        y: 60 + Math.random() * 300,
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // Game tick: update player position, check proximity to target
  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerPos((prev) => {
        let nx: number, ny: number;
        if (hasAccel) {
          nx = Math.max(10, Math.min(290, prev.x + accelRef.current.x));
          ny = Math.max(10, Math.min(390, prev.y + accelRef.current.y));
        } else {
          return prev; // Touch fallback updates position directly
        }
        return { x: nx, y: ny };
      });
    }, 30);
    return () => clearInterval(interval);
  }, [hasAccel]);

  // Scoring: check distance each tick
  useEffect(() => {
    const interval = setInterval(() => {
      const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
      if (dist < 50) {
        scoreRef.current += dist < 20 ? 3 : 1;
        onScoreUpdate(scoreRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [playerPos, targetPos, onScoreUpdate]);

  // Touch fallback
  const handlePointerMove = (e: React.PointerEvent) => {
    if (hasAccel) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlayerPos({
      x: Math.max(10, Math.min(290, e.clientX - rect.left)),
      y: Math.max(10, Math.min(390, e.clientY - rect.top)),
    });
  };

  const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
  const closeColor = dist < 20 ? '#2ecc71' : dist < 50 ? '#f39c12' : '#e74c3c';

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerMove={handlePointerMove}
    >
      {/* Target */}
      <div style={{
        ...styles.target,
        left: targetPos.x - 20,
        top: targetPos.y - 20,
        transition: 'left 0.8s ease, top 0.8s ease',
      }} />

      {/* Player */}
      <div style={{
        ...styles.player,
        left: playerPos.x - 12,
        top: playerPos.y - 12,
        borderColor: closeColor,
        boxShadow: `0 0 ${dist < 50 ? 15 : 0}px ${closeColor}`,
      }} />

      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
      <span style={styles.hint}>
        {hasAccel ? 'Tilt your device to follow the target!' : 'Move your finger to follow the target!'}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', position: 'relative',
    touchAction: 'none', overflow: 'hidden',
  },
  target: {
    position: 'absolute', width: '40px', height: '40px', borderRadius: '50%',
    background: 'rgba(231, 76, 60, 0.3)', border: '3px dashed #e74c3c',
  },
  player: {
    position: 'absolute', width: '24px', height: '24px', borderRadius: '50%',
    background: '#3498db', border: '3px solid #2ecc71',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  scoreOverlay: {
    position: 'absolute', top: '8px', right: '12px',
    color: '#f39c12', fontSize: '24px', fontWeight: 800,
  },
  hint: {
    position: 'absolute', bottom: '12px', width: '100%',
    textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px',
  },
};
