import { useEffect, useRef, useState } from 'react';
import type { MinigameResults } from '../types/game';

interface Props {
  results: MinigameResults;
  onClose: () => void;
}

const PODIUM_COLORS = ['#f39c12', '#bdc3c7', '#cd7f32'];
const PODIUM_LABELS = ['1st', '2nd', '3rd'];
const DISMISS_DELAY_MS = 3000;
const AUTO_DISMISS_MS = 10000;

export function MinigameResultsOverlay({ results, onClose }: Props) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [progress, setProgress] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const unlockTimer = setTimeout(() => setCanDismiss(true), DISMISS_DELAY_MS);
    const autoTimer = setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS);

    // Animate progress bar
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / AUTO_DISMISS_MS, 1));
      if (elapsed < AUTO_DISMISS_MS) rafId = requestAnimationFrame(tick);
    };
    let rafId = requestAnimationFrame(tick);

    return () => {
      clearTimeout(unlockTimer);
      clearTimeout(autoTimer);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const top3 = results.rankings.filter((r) => r.rank <= 3);
  const rest = results.rankings.filter((r) => r.rank > 3);

  return (
    <div style={styles.overlay} onClick={canDismiss ? onClose : undefined}>
      <div style={styles.card}>
        <h2 style={styles.title}>Results!</h2>

        {results.bonus && (
          <div style={styles.bonusAlert}>⚡ BONUS ROUND — 2× POINTS!</div>
        )}

        {results.marbleBonus && (
          <div style={styles.marbleAlert}>MARBLE BONUS! Winners get marbles!</div>
        )}

        <div style={styles.podium}>
          {top3.map((r, i) => (
            <div key={r.id} style={styles.podiumEntry}>
              <span style={{ ...styles.podiumLabel, color: PODIUM_COLORS[i] || '#8892b0' }}>
                {PODIUM_LABELS[i] || `#${r.rank}`}
              </span>
              <span style={styles.podiumName}>{r.name}</span>
              <span style={styles.podiumScore}>{r.score}</span>
              {r.prizePoints > 0 && (
                <span style={styles.prize}>+{r.prizePoints} pts</span>
              )}
              {r.prizeMarbles > 0 && (
                <span style={styles.marblePrize}>+{r.prizeMarbles} marble!</span>
              )}
            </div>
          ))}
        </div>

        {rest.length > 0 && (
          <div style={styles.others}>
            {rest.map((r) => (
              <span key={r.id} style={styles.otherPlayer}>
                #{r.rank} {r.name} ({r.score})
              </span>
            ))}
          </div>
        )}

        <span style={styles.tap}>{canDismiss ? 'Tap to continue' : '...'}</span>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  card: {
    background: '#112240',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '320px',
    width: '100%',
    textAlign: 'center',
    border: '3px solid #f39c12',
  },
  title: {
    color: '#f39c12',
    fontSize: '28px',
    fontWeight: 800,
    margin: '0 0 8px 0',
  },
  bonusAlert: {
    background: 'rgba(243, 156, 18, 0.2)',
    border: '2px solid #f39c12',
    color: '#f39c12',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 800,
    marginBottom: '8px',
  },
  marbleAlert: {
    background: 'rgba(243, 156, 18, 0.15)',
    color: '#f39c12',
    padding: '8px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  podium: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  podiumEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#0a192f',
    borderRadius: '10px',
  },
  podiumLabel: {
    fontSize: '16px',
    fontWeight: 800,
    minWidth: '32px',
  },
  podiumName: {
    color: '#ccd6f6',
    fontSize: '15px',
    fontWeight: 600,
    flex: 1,
    textAlign: 'left',
  },
  podiumScore: {
    color: '#8892b0',
    fontSize: '14px',
  },
  prize: {
    color: '#2ecc71',
    fontSize: '12px',
    fontWeight: 600,
  },
  marblePrize: {
    color: '#f39c12',
    fontSize: '12px',
    fontWeight: 700,
  },
  others: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  otherPlayer: {
    color: '#8892b0',
    fontSize: '12px',
  },
  tap: {
    color: '#5a6a8a',
    fontSize: '11px',
    display: 'block',
  },
  progressTrack: {
    width: '100%',
    height: '3px',
    background: '#1e3a5f',
    borderRadius: '2px',
    marginTop: '10px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#5a6a8a',
    borderRadius: '2px',
    transition: 'width 0.1s linear',
  },
};
