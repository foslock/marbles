import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

interface Target {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function TargetPop({ onScoreUpdate }: MinigameComponentProps) {
  const [targets, setTargets] = useState<Target[]>([]);
  const scoreRef = useRef(0);
  const nextId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Spawn targets periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const size = 30 + Math.random() * 30;
      setTargets((prev) => {
        // Cap at 5 active targets
        const trimmed = prev.length >= 5 ? prev.slice(1) : prev;
        return [
          ...trimmed,
          {
            id: nextId.current++,
            x: 20 + Math.random() * 260,
            y: 20 + Math.random() * 360,
            size,
          },
        ];
      });
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Expire targets after 1.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setTargets((prev) => {
        if (prev.length > 0 && prev[0].id < nextId.current - 4) {
          return prev.slice(1);
        }
        return prev;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handlePop = useCallback((targetId: number) => {
    setTargets((prev) => prev.filter((t) => t.id !== targetId));
    scoreRef.current += 1;
    onScoreUpdate(scoreRef.current);
  }, [onScoreUpdate]);

  return (
    <div ref={containerRef} style={styles.container}>
      {targets.map((t) => (
        <div
          key={t.id}
          style={{
            ...styles.target,
            left: t.x,
            top: t.y,
            width: t.size,
            height: t.size,
            borderRadius: t.size / 2,
          }}
          onPointerDown={(e) => { e.stopPropagation(); handlePop(t.id); }}
        />
      ))}
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
    overflow: 'hidden',
  },
  target: {
    position: 'absolute',
    background: 'radial-gradient(circle, #e74c3c, #c0392b)',
    border: '2px solid #f39c12',
    cursor: 'pointer',
    animation: 'fadeIn 0.15s ease-out',
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
