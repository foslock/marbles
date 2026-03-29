import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

const ROUND_DURATION = 2500; // ms per target

export function SizeMatch({ onScoreUpdate, config }: MinigameComponentProps) {
  // Server sends target sizes so all players match the same circles
  const targetSizes = useRef<number[]>(
    (config?.targetSizes as number[]) || Array.from({ length: 5 }, () => 40 + Math.floor(Math.random() * 160))
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [playerSize, setPlayerSize] = useState(100);
  const [locked, setLocked] = useState(false);
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetSize = targetSizes.current[roundIndex] || 100;

  // Auto-advance rounds
  useEffect(() => {
    if (roundIndex >= targetSizes.current.length) return;
    const timer = setTimeout(() => {
      // Score based on accuracy
      const diff = Math.abs(playerSize - targetSize);
      const accuracy = Math.max(0, 100 - diff);
      scoreRef.current += accuracy;
      onScoreUpdate(scoreRef.current);
      setLocked(false);
      setPlayerSize(100);
      setRoundIndex((r) => r + 1);
    }, ROUND_DURATION);
    return () => clearTimeout(timer);
  }, [roundIndex, playerSize, targetSize, onScoreUpdate]);

  // Pinch/spread gesture via pointer distance tracking
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialSize = useRef(100);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      initialPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      initialSize.current = playerSize;
    }
  }, [playerSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && initialPinchDist.current !== null) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scale = dist / initialPinchDist.current;
      setPlayerSize(Math.max(20, Math.min(300, initialSize.current * scale)));
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      initialPinchDist.current = null;
    }
  }, []);

  // Fallback: tap top/bottom halves to grow/shrink
  const handleTap = useCallback((e: React.PointerEvent) => {
    if (pointers.current.size > 1) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    if (y < rect.height / 2) {
      setPlayerSize((s) => Math.min(300, s + 12));
    } else {
      setPlayerSize((s) => Math.max(20, s - 12));
    }
  }, []);

  if (roundIndex >= targetSizes.current.length) {
    return (
      <div style={styles.container}>
        <span style={styles.doneText}>All rounds complete!</span>
        <span style={styles.finalScore}>{scoreRef.current}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerDown={(e) => { handlePointerDown(e); handleTap(e); }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div style={styles.info}>
        <span style={styles.round}>Round {roundIndex + 1}/{targetSizes.current.length}</span>
        <span style={styles.score}>{scoreRef.current}</span>
      </div>

      {/* Target circle (ghost) */}
      <div style={{
        ...styles.targetCircle,
        width: targetSize,
        height: targetSize,
        borderRadius: targetSize / 2,
      }} />

      {/* Player circle */}
      <div style={{
        ...styles.playerCircle,
        width: playerSize,
        height: playerSize,
        borderRadius: playerSize / 2,
        borderColor: Math.abs(playerSize - targetSize) < 10 ? '#2ecc71' : '#3498db',
      }} />

      <span style={styles.hint}>Pinch to resize / tap top=grow bottom=shrink</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    touchAction: 'none', userSelect: 'none',
  },
  info: {
    position: 'absolute', top: '8px', left: '12px', right: '12px',
    display: 'flex', justifyContent: 'space-between',
  },
  round: { color: '#a8b2d1', fontSize: '14px' },
  score: { color: '#f39c12', fontSize: '20px', fontWeight: 800 },
  targetCircle: {
    position: 'absolute',
    border: '3px dashed rgba(255,255,255,0.3)',
    pointerEvents: 'none' as const,
  },
  playerCircle: {
    position: 'absolute',
    border: '4px solid #3498db',
    background: 'rgba(52, 152, 219, 0.15)',
    transition: 'width 0.05s, height 0.05s, border-color 0.2s',
  },
  hint: {
    position: 'absolute', bottom: '12px',
    color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center',
  },
  doneText: { color: '#ccd6f6', fontSize: '20px', marginBottom: '8px' },
  finalScore: { color: '#f39c12', fontSize: '48px', fontWeight: 800 },
};
