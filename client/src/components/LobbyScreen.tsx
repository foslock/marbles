import type { LobbyData } from '../types/game';

interface Props {
  lobby: LobbyData;
  playerId: string | null;
  onStartGame: () => void;
}

export function LobbyScreen({ lobby, playerId, onStartGame }: Props) {
  const isHost = playerId === lobby.hostId;
  const players = lobby.players.filter((p) => p.role === 'player');
  const spectators = lobby.players.filter((p) => p.role === 'spectator');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Game Lobby</h2>
        <div style={styles.passphrase}>
          <span style={styles.passphraseLabel}>Passphrase:</span>
          <span style={styles.passphraseValue}>{lobby.passphrase}</span>
        </div>
        <p style={styles.hint}>Share this passphrase with friends to join!</p>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>
          Players ({players.length}/8)
        </h3>
        <div style={styles.playerList}>
          {players.map((p) => (
            <div key={p.id} style={styles.playerCard}>
              <span style={styles.playerEmoji}>
                {p.id === lobby.hostId ? '👑' : '🎮'}
              </span>
              <span style={styles.playerName}>{p.name}</span>
              {p.id === playerId && (
                <span style={styles.youBadge}>You</span>
              )}
            </div>
          ))}
          {players.length < 2 && (
            <div style={styles.waitingCard}>
              Waiting for more players...
            </div>
          )}
        </div>
      </div>

      {spectators.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Spectators ({spectators.length})
          </h3>
          <div style={styles.playerList}>
            {spectators.map((p) => (
              <div key={p.id} style={styles.spectatorCard}>
                <span>👁️</span>
                <span style={styles.playerName}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.settings}>
        <span style={styles.settingLabel}>Target: {lobby.targetMarbles} marbles</span>
      </div>

      {isHost && (
        <button
          style={{
            ...styles.startButton,
            ...(players.length < 2 ? styles.startButtonDisabled : {}),
          }}
          onClick={onStartGame}
          disabled={players.length < 2}
        >
          {players.length < 2 ? 'Need 2+ Players' : 'Start Game!'}
        </button>
      )}

      {!isHost && (
        <p style={styles.waitingText}>Waiting for host to start the game...</p>
      )}
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
    fontSize: '28px',
    fontWeight: 700,
    color: '#ccd6f6',
    margin: '0 0 12px 0',
  },
  passphrase: {
    background: '#112240',
    borderRadius: '12px',
    padding: '12px 20px',
    display: 'inline-block',
  },
  passphraseLabel: {
    color: '#8892b0',
    fontSize: '12px',
    display: 'block',
  },
  passphraseValue: {
    color: '#f39c12',
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '2px',
  },
  hint: {
    color: '#8892b0',
    fontSize: '12px',
    marginTop: '8px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    color: '#a8b2d1',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  playerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#112240',
    borderRadius: '10px',
    padding: '12px 16px',
    border: '1px solid #233554',
  },
  spectatorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#0a192f',
    borderRadius: '10px',
    padding: '10px 16px',
    border: '1px solid #1a2a4a',
  },
  playerEmoji: {
    fontSize: '20px',
  },
  playerName: {
    color: '#ccd6f6',
    fontSize: '16px',
    fontWeight: 500,
    flex: 1,
  },
  youBadge: {
    background: '#3498db',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
  },
  waitingCard: {
    textAlign: 'center',
    color: '#8892b0',
    padding: '16px',
    border: '2px dashed #233554',
    borderRadius: '10px',
    fontSize: '14px',
  },
  settings: {
    textAlign: 'center',
    padding: '8px',
    color: '#8892b0',
    fontSize: '13px',
  },
  settingLabel: {},
  startButton: {
    padding: '16px',
    fontSize: '18px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
    color: '#fff',
    cursor: 'pointer',
    marginTop: 'auto',
  },
  startButtonDisabled: {
    background: '#233554',
    color: '#5a6a8a',
    cursor: 'not-allowed',
  },
  waitingText: {
    textAlign: 'center',
    color: '#8892b0',
    fontSize: '14px',
    marginTop: 'auto',
    padding: '16px',
  },
};
