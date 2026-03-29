import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
const FLASH_DURATION = 600;
const GAP_DURATION = 200;

export function MemoryFlash({ onScoreUpdate, config }: MinigameComponentProps) {
  // Server sends the full sequence; all players memorize the same pattern
  const sequence = useRef<number[]>(
    (config?.sequence as number[]) || Array.from({ length: 12 }, () => Math.floor(Math.random() * 4))
  );
  const [phase, setPhase] = useState<'showing' | 'input'>('showing');
  const [showIndex, setShowIndex] = useState(0);
  const [activeColor, setActiveColor] = useState<number | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [revealCount, setRevealCount] = useState(3); // Start by showing 3
  const scoreRef = useRef(0);

  // Show sequence phase
  useEffect(() => {
    if (phase !== 'showing') return;
    if (showIndex >= revealCount) {
      // Done showing — switch to input
      setActiveColor(null);
      setPhase('input');
      setInputIndex(0);
      return;
    }
    // Flash the current tile
    setActiveColor(sequence.current[showIndex]);
    const flashTimer = setTimeout(() => {
      setActiveColor(null);
      const gapTimer = setTimeout(() => {
        setShowIndex(showIndex + 1);
      }, GAP_DURATION);
      return () => clearTimeout(gapTimer);
    }, FLASH_DURATION);
    return () => clearTimeout(flashTimer);
  }, [phase, showIndex, revealCount]);

  const handleTap = useCallback((colorIndex: number) => {
    if (phase !== 'input') return;

    if (colorIndex === sequence.current[inputIndex]) {
      // Correct!
      const nextInput = inputIndex + 1;
      setInputIndex(nextInput);

      if (nextInput >= revealCount) {
        // Completed the round — score and advance
        scoreRef.current += revealCount;
        onScoreUpdate(scoreRef.current);
        // Show one more tile next round
        setRevealCount((r) => Math.min(r + 1, sequence.current.length));
        setShowIndex(0);
        setPhase('showing');
      }
    } else {
      // Wrong — flash red briefly, restart current round
      setActiveColor(-1); // Error flash
      setTimeout(() => {
        setActiveColor(null);
        setShowIndex(0);
        setPhase('showing');
      }, 400);
    }
  }, [phase, inputIndex, revealCount, onScoreUpdate]);

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        <span style={styles.round}>Round {revealCount - 2}</span>
        <span style={styles.score}>{scoreRef.current}</span>
      </div>
      <div style={styles.phaseLabel}>
        {phase === 'showing' ? 'Watch...' : 'Your turn!'}
      </div>
      <div style={styles.grid}>
        {COLORS.map((color, i) => (
          <div
            key={i}
            style={{
              ...styles.tile,
              background: activeColor === i
                ? color
                : activeColor === -1
                ? '#e74c3c'
                : `${color}33`,
              borderColor: color,
              transform: activeColor === i ? 'scale(1.05)' : 'scale(1)',
            }}
            onPointerDown={() => handleTap(i)}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '16px',
    touchAction: 'none', userSelect: 'none',
  },
  info: {
    display: 'flex', gap: '20px', alignItems: 'center',
  },
  round: { color: '#a8b2d1', fontSize: '14px' },
  score: { color: '#f39c12', fontSize: '24px', fontWeight: 800 },
  phaseLabel: {
    color: '#ccd6f6', fontSize: '20px', fontWeight: 600,
  },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '12px', width: '240px', height: '240px',
  },
  tile: {
    borderRadius: '16px', border: '3px solid',
    transition: 'background 0.15s, transform 0.15s',
    cursor: 'pointer',
  },
};
