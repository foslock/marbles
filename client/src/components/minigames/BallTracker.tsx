import { useState, useEffect, useRef } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

export function BallTracker({ onScoreUpdate }: MinigameComponentProps) {
  const [ballPos, setBallPos] = useState({ x: 150, y: 200 });
  const [fingerDown, setFingerDown] = useState(false);
  const [fingerPos, setFingerPos] = useState({ x: 0, y: 0 });
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setBallPos({
        x: 50 + Math.random() * 200,
        y: 50 + Math.random() * 300,
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (fingerDown) {
      const dist = Math.hypot(fingerPos.x - ballPos.x, fingerPos.y - ballPos.y);
      if (dist < 40) {
        scoreRef.current += 1;
        onScoreUpdate(scoreRef.current);
        SFX.minigameOnTarget();
      }
    }
  }, [fingerDown, fingerPos, ballPos, onScoreUpdate]);

  const handlePointer = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFingerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerDown={(e) => { setFingerDown(true); handlePointer(e); }}
      onPointerMove={handlePointer}
      onPointerUp={() => setFingerDown(false)}
    >
      <div
        style={{
          ...styles.ball,
          left: ballPos.x - 25,
          top: ballPos.y - 25,
        }}
      />
      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    width: '100%',
    position: 'relative',
    touchAction: 'none',
  },
  ball: {
    position: 'absolute',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, #e74c3c, #c0392b)',
    transition: 'left 0.3s, top 0.3s',
  },
  scoreOverlay: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    color: '#f39c12',
    fontSize: '24px',
    fontWeight: 800,
  },
};
