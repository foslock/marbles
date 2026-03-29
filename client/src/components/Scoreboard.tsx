import { useState } from 'react';
import type { PlayerState } from '../types/game';

interface Props {
  players: PlayerState[];
  targetMarbles: number;
  currentPlayerId: string | null;
  hostId: string | null;
  onEndGame: () => void;
}

export function Scoreboard({ players, targetMarbles, currentPlayerId, hostId, onEndGame }: Props) {
  const [confirming, setConfirming] = useState(false);
  const isHost = currentPlayerId === hostId;
  const sorted = [...players].sort((a, b) => {
    if (b.marbles !== a.marbles) return b.marbles - a.marbles;
    return b.points - a.points;
  });

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Scoreboard</h3>
      <p style={styles.target}>First to {targetMarbles} marbles wins!</p>
      <div style={styles.list}>
        {sorted.map((p, i) => (
          <div
            key={p.id}
            style={{
              ...styles.row,
              ...(p.id === currentPlayerId ? styles.rowHighlight : {}),
            }}
          >
            <span style={styles.rank}>#{i + 1}</span>
            <span style={styles.emoji}>{p.token?.emoji || '?'}</span>
            <div style={styles.info}>
              <span style={styles.name}>{p.name}</span>
              <div style={styles.marbleBar}>
                <div
                  style={{
                    ...styles.marbleFill,
                    width: `${Math.min(100, (p.marbles / targetMarbles) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div style={styles.scores}>
              <span style={styles.marbleCount}>{p.marbles}</span>
              <span style={styles.pointCount}>{p.points}pts</span>
            </div>
          </div>
        ))}
      </div>

      {isHost && (
        <div style={styles.endGameSection}>
          {confirming ? (
            <div style={styles.confirmRow}>
              <span style={styles.confirmText}>End game for everyone?</span>
              <button style={styles.confirmYes} onClick={onEndGame}>Yes, end it</button>
              <button style={styles.confirmNo} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button style={styles.endGameBtn} onClick={() => setConfirming(true)}>
              End Game
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    height: '100%',
    overflow: 'auto',
  },
  title: {
    color: '#ccd6f6',
    fontSize: '20px',
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 4px 0',
  },
  target: {
    color: '#8892b0',
    fontSize: '12px',
    textAlign: 'center',
    margin: '0 0 16px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#112240',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid #233554',
  },
  rowHighlight: {
    borderColor: '#3498db',
    background: 'rgba(52, 152, 219, 0.08)',
  },
  rank: {
    color: '#8892b0',
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '24px',
  },
  emoji: {
    fontSize: '22px',
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#ccd6f6',
    fontSize: '14px',
    fontWeight: 600,
  },
  marbleBar: {
    height: '6px',
    borderRadius: '3px',
    background: '#233554',
    marginTop: '4px',
    overflow: 'hidden',
  },
  marbleFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
    borderRadius: '3px',
    transition: 'width 0.5s ease',
  },
  scores: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  marbleCount: {
    color: '#f39c12',
    fontSize: '20px',
    fontWeight: 700,
  },
  pointCount: {
    color: '#8892b0',
    fontSize: '11px',
  },
  endGameSection: {
    marginTop: '20px',
    textAlign: 'center',
  },
  endGameBtn: {
    padding: '10px 24px',
    borderRadius: '10px',
    border: '1px solid #c0392b',
    background: 'transparent',
    color: '#e74c3c',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  confirmText: {
    color: '#ccd6f6',
    fontSize: '13px',
  },
  confirmYes: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#c0392b',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirmNo: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #233554',
    background: 'transparent',
    color: '#8892b0',
    fontSize: '13px',
    cursor: 'pointer',
  },
};
