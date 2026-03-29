import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow'];
const FLASH_DURATION = 350;
const GAP_DURATION = 80;
// Sequence is longer for a more challenging game (was 12)
const SEQUENCE_LENGTH = 16;

export function MemoryFlash({ onScoreUpdate, config }: MinigameComponentProps) {
  const sequence = useRef<number[]>(
    (config?.sequence as number[]) || Array.from({ length: SEQUENCE_LENGTH }, () => Math.floor(Math.random() * 4))
  );
  const [phase, setPhase] = useState<'showing' | 'input' | 'error'>('showing');
  const [showIndex, setShowIndex] = useState(0);
  const [activeColor, setActiveColor] = useState<number | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [revealCount, setRevealCount] = useState(3);
  const scoreRef = useRef(0);

  // Show sequence phase: flash each tile in order
  useEffect(() => {
    if (phase !== 'showing') return;
    if (showIndex >= revealCount) {
      setActiveColor(null);
      setPhase('input');
      setInputIndex(0);
      return;
    }
    const colorIdx = sequence.current[showIndex];
    SFX.minigameTileFlash(colorIdx);
    setActiveColor(colorIdx);
    const flashTimer = setTimeout(() => {
      setActiveColor(null);
      const gapTimer = setTimeout(() => setShowIndex((i) => i + 1), GAP_DURATION);
      return () => clearTimeout(gapTimer);
    }, FLASH_DURATION);
    return () => clearTimeout(flashTimer);
  }, [phase, showIndex, revealCount]);

  const handleTap = useCallback((colorIndex: number) => {
    if (phase !== 'input') return;

    if (colorIndex === sequence.current[inputIndex]) {
      SFX.minigameTileFlash(colorIndex);
      const nextInput = inputIndex + 1;
      setInputIndex(nextInput);
      if (nextInput >= revealCount) {
        // Round complete — score and add one more tile
        scoreRef.current += revealCount;
        onScoreUpdate(scoreRef.current);
        setRevealCount((r) => Math.min(r + 1, sequence.current.length));
        setShowIndex(0);
        setPhase('showing');
      }
    } else {
      // Wrong: flash all tiles red once, then immediately back to input
      // (player must recall from memory — no replay)
      SFX.error();
      setPhase('error');
      setTimeout(() => {
        setPhase('input');
        setInputIndex(0);
      }, 600);
    }
  }, [phase, inputIndex, revealCount, onScoreUpdate]);

  const isShowing = phase === 'showing';
  const isError = phase === 'error';

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        <span style={styles.round}>Seq {revealCount}</span>
        <span style={styles.score}>{scoreRef.current}</span>
      </div>

      {/* Phase label — very clear distinction */}
      <div style={{
        ...styles.phaseLabel,
        background: isShowing ? 'rgba(52,152,219,0.15)' : isError ? 'rgba(231,76,60,0.25)' : 'rgba(46,204,113,0.15)',
        borderColor: isShowing ? '#3498db' : isError ? '#e74c3c' : '#2ecc71',
        color: isShowing ? '#3498db' : isError ? '#e74c3c' : '#2ecc71',
      }}>
        {isShowing ? '👁 Watch the sequence' : isError ? '✗ Wrong! Try again from memory' : '👆 Your turn — tap the sequence!'}
      </div>

      <div style={styles.grid}>
        {COLORS.map((color, i) => {
          const isActive = activeColor === i;
          const isAllError = isError;
          return (
            <div
              key={i}
              style={{
                ...styles.tile,
                // Showing phase: tiles are dimmed and not interactive
                // Input phase: tiles are bright and inviting
                // Error phase: all red
                background: isAllError
                  ? '#e74c3c'
                  : isActive
                  ? color
                  : isShowing
                  ? `${color}22`   // very dim while showing
                  : `${color}55`,  // moderately bright while in input
                borderColor: isAllError ? '#e74c3c' : color,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                opacity: isShowing ? 0.6 : 1,
                pointerEvents: isShowing ? 'none' : 'auto',
                cursor: isShowing ? 'default' : 'pointer',
                boxShadow: !isShowing && !isAllError ? `0 0 12px ${color}44` : 'none',
              }}
              onPointerDown={() => handleTap(i)}
            >
              {/* Show colour name labels during input so it's clear tiles are tappable */}
              {!isShowing && !isAllError && (
                <span style={{ ...styles.tileLabel, color }}>{COLOR_NAMES[i]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '14px',
    touchAction: 'none', userSelect: 'none', padding: '8px',
    boxSizing: 'border-box',
  },
  info: { display: 'flex', gap: '20px', alignItems: 'center' },
  round: { color: '#a8b2d1', fontSize: '14px' },
  score: { color: '#f39c12', fontSize: '24px', fontWeight: 800 },
  phaseLabel: {
    padding: '8px 18px',
    borderRadius: '20px',
    border: '2px solid',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '12px', width: '260px', height: '260px',
  },
  tile: {
    borderRadius: '18px', border: '3px solid',
    transition: 'background 0.15s, transform 0.15s, opacity 0.2s, box-shadow 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  tileLabel: {
    fontSize: '14px', fontWeight: 700,
    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
    pointerEvents: 'none',
  },
};
