import type { GameState } from '../types/game';

interface Props {
  gameState: GameState;
}

export function GameOverScreen({ gameState }: Props) {
  const players = Object.values(gameState.players)
    .filter((p) => p.role === 'player')
    .sort((a, b) => {
      if (b.marbles !== a.marbles) return b.marbles - a.marbles;
      return b.points - a.points;
    });

  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : players[0];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Game Over!</h1>
        <div style={styles.winnerCard}>
          <span style={styles.winnerEmoji}>{winner?.token?.emoji || '?'}</span>
          <h2 style={styles.winnerName}>{winner?.name}</h2>
          <p style={styles.winnerStats}>
            {winner?.marbles} marbles | {winner?.points} points
          </p>
        </div>
      </div>

      <div style={styles.rankings}>
        {players.map((p, i) => (
          <div key={p.id} style={styles.rankRow}>
            <span style={styles.rank}>#{i + 1}</span>
            <span style={styles.emoji}>{p.token?.emoji || '?'}</span>
            <span style={styles.name}>{p.name}</span>
            <span style={styles.score}>{p.marbles} / {p.points}pts</span>
          </div>
        ))}
      </div>

      <button
        style={styles.playAgain}
        onClick={() => window.location.reload()}
      >
        Play Again
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '20px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    overflow: 'auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '36px',
    fontWeight: 800,
    background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0 0 20px 0',
  },
  winnerCard: {
    background: 'linear-gradient(135deg, rgba(243,156,18,0.15), rgba(231,76,60,0.15))',
    borderRadius: '20px',
    padding: '24px',
    border: '2px solid #f39c12',
  },
  winnerEmoji: {
    fontSize: '64px',
    display: 'block',
  },
  winnerName: {
    color: '#f39c12',
    fontSize: '28px',
    fontWeight: 800,
    margin: '8px 0 0 0',
  },
  winnerStats: {
    color: '#ccd6f6',
    fontSize: '16px',
    margin: 0,
  },
  rankings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#112240',
    borderRadius: '10px',
    padding: '10px 14px',
  },
  rank: {
    color: '#8892b0',
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '28px',
  },
  emoji: {
    fontSize: '20px',
  },
  name: {
    color: '#ccd6f6',
    fontSize: '15px',
    flex: 1,
  },
  score: {
    color: '#f39c12',
    fontSize: '14px',
    fontWeight: 600,
  },
  playAgain: {
    padding: '16px',
    fontSize: '18px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: '#fff',
    cursor: 'pointer',
    marginTop: 'auto',
  },
};
