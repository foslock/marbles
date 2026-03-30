import { useEffect, useRef, useState } from 'react';
import type { MinigameResults } from '../types/game';
import { Fireworks } from './Fireworks';

interface Props {
  results: MinigameResults;
  onClose: () => void;
}

const PODIUM_COLORS = ['#f39c12', '#bdc3c7', '#cd7f32'];
const MEDAL_ICONS = ['🥇', '🥈', '🥉'];
const DISMISS_DELAY_MS = 1000;
const AUTO_DISMISS_MS = 10000;

export function MinigameResultsOverlay({ results, onClose }: Props) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reveal, setReveal] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const unlockTimer = setTimeout(() => setCanDismiss(true), DISMISS_DELAY_MS);
    const autoTimer = setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS);
    // Trigger entrance animation
    requestAnimationFrame(() => setReveal(true));

    // Animate progress bar
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(1 - Math.min(elapsed / AUTO_DISMISS_MS, 1));
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
  // Arrange for podium: [2nd, 1st, 3rd] for the classic Olympic layout
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumHeights = [88, 120, 64]; // 2nd, 1st, 3rd
  const rest = results.rankings.filter((r) => r.rank > 3);

  return (
    <div style={styles.overlay} onClick={canDismiss ? onClose : undefined}>
      {/* Fireworks behind the card — canvas is first child so card paints on top */}
      <Fireworks intensity="normal" />
      <div
        style={{
          ...styles.card,
          opacity: reveal ? 1 : 0,
          transform: reveal ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
        }}
      >
        <h2 style={styles.title}>Results!</h2>

        {results.bonus && (
          <div style={styles.bonusAlert}>BONUS ROUND — 2x POINTS!</div>
        )}

        {results.marbleBonus && (
          <div style={styles.marbleAlert}>MARBLE BONUS! Winners get marbles!</div>
        )}

        {/* Olympic-style podium */}
        <div style={styles.podiumContainer}>
          {podiumOrder.map((r, layoutIdx) => {
            // layoutIdx: 0=2nd place (left), 1=1st place (center), 2=3rd place (right)
            const rankIdx = layoutIdx === 0 ? 1 : layoutIdx === 1 ? 0 : 2;
            const height = podiumHeights[layoutIdx];
            const color = PODIUM_COLORS[r.rank - 1] || '#8892b0';

            return (
              <div key={r.id} style={styles.podiumColumn}>
                {/* Player info above podium */}
                <div style={styles.podiumPlayerInfo}>
                  <span style={{ ...styles.podiumEmoji, fontSize: layoutIdx === 1 ? '28px' : '22px' }}>
                    {MEDAL_ICONS[r.rank - 1] || ''}
                  </span>
                  <span
                    style={{
                      ...styles.podiumPlayerName,
                      fontSize: layoutIdx === 1 ? '14px' : '12px',
                      color,
                    }}
                  >
                    {r.name}
                  </span>
                  <span style={styles.podiumPlayerScore}>{r.score}</span>
                  {r.prizePoints > 0 && (
                    <span style={styles.prize}>+{r.prizePoints} pts</span>
                  )}
                  {r.prizeMarbles > 0 && (
                    <span style={styles.marblePrize}>+{r.prizeMarbles} marble!</span>
                  )}
                </div>

                {/* The podium block */}
                <div
                  style={{
                    ...styles.podiumBlock,
                    height: `${height}px`,
                    background: `linear-gradient(180deg, ${color}33 0%, ${color}11 100%)`,
                    borderColor: color,
                    transform: reveal ? 'scaleY(1)' : 'scaleY(0)',
                    transition: `transform 0.5s ease-out ${0.2 + rankIdx * 0.15}s`,
                    transformOrigin: 'bottom',
                  }}
                >
                  <span style={{ ...styles.podiumRankLabel, color }}>{r.rank}</span>
                </div>
              </div>
            );
          })}
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
    padding: '16px',
  },
  card: {
    background: '#112240',
    borderRadius: '16px',
    padding: '20px 16px 16px',
    maxWidth: '360px',
    width: '100%',
    textAlign: 'center',
    border: '3px solid #f39c12',
  },
  title: {
    color: '#f39c12',
    fontSize: '26px',
    fontWeight: 800,
    margin: '0 0 8px 0',
  },
  bonusAlert: {
    background: 'rgba(243, 156, 18, 0.2)',
    border: '2px solid #f39c12',
    color: '#f39c12',
    padding: '5px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 800,
    marginBottom: '8px',
  },
  marbleAlert: {
    background: 'rgba(243, 156, 18, 0.15)',
    color: '#f39c12',
    padding: '6px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    marginBottom: '8px',
  },
  podiumContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '6px',
    margin: '12px 0 16px 0',
    minHeight: '180px',
  },
  podiumColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    maxWidth: '100px',
  },
  podiumPlayerInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    marginBottom: '6px',
    minHeight: '60px',
    justifyContent: 'flex-end',
  },
  podiumEmoji: {
    display: 'block',
    lineHeight: 1,
    minHeight: '28px',
  },
  podiumPlayerName: {
    fontWeight: 700,
    lineHeight: 1.2,
    wordBreak: 'break-word',
    maxWidth: '90px',
  },
  podiumPlayerScore: {
    color: '#8892b0',
    fontSize: '11px',
  },
  prize: {
    color: '#2ecc71',
    fontSize: '11px',
    fontWeight: 600,
  },
  marblePrize: {
    color: '#f39c12',
    fontSize: '11px',
    fontWeight: 700,
  },
  podiumBlock: {
    width: '100%',
    borderRadius: '6px 6px 0 0',
    border: '2px solid',
    borderBottom: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  podiumRankLabel: {
    fontSize: '32px',
    fontWeight: 800,
    opacity: 0.6,
  },
  others: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center',
    marginBottom: '10px',
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
