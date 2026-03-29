import { useCallback, useState } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

export function TapFrenzy({ onScoreUpdate }: MinigameComponentProps) {
  const [score, setScore] = useState(0);

  const handleTap = useCallback(() => {
    SFX.minigameTap();
    setScore((s) => {
      const next = s + 1;
      onScoreUpdate(next);
      return next;
    });
  }, [onScoreUpdate]);

  return (
    <div style={styles.container} onPointerDown={handleTap}>
      <span style={styles.score}>{score}</span>
      <span style={styles.hint}>TAP!</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    touchAction: 'none',
    userSelect: 'none',
  },
  score: { color: '#f39c12', fontSize: '80px', fontWeight: 800 },
  hint: { color: '#8892b0', fontSize: '18px', marginTop: '8px' },
};
