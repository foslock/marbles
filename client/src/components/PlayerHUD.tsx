import type { PlayerState } from '../types/game';

interface Props {
  player: PlayerState;
}

export function PlayerHUD({ player }: Props) {
  const pointsPercent = Math.min(100, (player.points / 100) * 100);

  return (
    <div style={styles.container}>
      <div style={styles.tokenInfo}>
        <span style={styles.emoji}>{player.token?.emoji || '?'}</span>
        <div style={styles.name}>{player.name}</div>
      </div>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{player.marbles}</span>
          <span style={styles.statLabel}>Marbles</span>
        </div>
        <div style={styles.pointsContainer}>
          <div style={styles.pointsBar}>
            <div
              style={{
                ...styles.pointsFill,
                width: `${pointsPercent}%`,
              }}
            />
          </div>
          <span style={styles.pointsText}>{player.points}/100</span>
        </div>
      </div>

      {(player.modifiers.rerolls > 0 ||
        player.modifiers.protection > 0 ||
        player.modifiers.double_dice > 0 ||
        player.modifiers.worst_dice > 0) && (
        <div style={styles.modifiers}>
          {player.modifiers.rerolls > 0 && (
            <span style={styles.mod}>🔄 {player.modifiers.rerolls}</span>
          )}
          {player.modifiers.protection > 0 && (
            <span style={styles.mod}>🛡️ {player.modifiers.protection}</span>
          )}
          {player.modifiers.double_dice > 0 && (
            <span style={styles.modGood}>🎲🎲</span>
          )}
          {player.modifiers.worst_dice > 0 && (
            <span style={styles.modBad}>🎲↓</span>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: '#112240',
    borderTop: '1px solid #233554',
  },
  tokenInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '80px',
  },
  emoji: {
    fontSize: '24px',
  },
  name: {
    color: '#ccd6f6',
    fontSize: '13px',
    fontWeight: 600,
  },
  stats: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    color: '#f39c12',
    fontSize: '20px',
    fontWeight: 700,
  },
  statLabel: {
    color: '#8892b0',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
  },
  pointsContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  pointsBar: {
    height: '8px',
    borderRadius: '4px',
    background: '#233554',
    overflow: 'hidden',
  },
  pointsFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3498db, #2ecc71)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  pointsText: {
    color: '#8892b0',
    fontSize: '10px',
    textAlign: 'right' as const,
  },
  modifiers: {
    display: 'flex',
    gap: '4px',
  },
  mod: {
    fontSize: '14px',
    background: 'rgba(52, 152, 219, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  modGood: {
    fontSize: '14px',
    background: 'rgba(46, 204, 113, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  modBad: {
    fontSize: '14px',
    background: 'rgba(231, 76, 60, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
};
