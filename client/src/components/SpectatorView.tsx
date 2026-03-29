import { useMemo, useEffect } from 'react';
import type { GameState, MinigameResults, TileEffect, ActivityItem } from '../types/game';
import { GameBoard, type MoveAnimation, type TileSwapAnimation } from './GameBoard';
import { ActivityFeed } from './ActivityFeed';

interface Props {
  gameState: GameState;
  tileEffect: TileEffect | null;
  minigameResults: MinigameResults | null;
  moveAnimation: MoveAnimation | null;
  tileSwapAnimation: TileSwapAnimation | null;
  activityFeed: ActivityItem[];
  onClearMoveAnimation: () => void;
  onClearTileEffect: () => void;
  onClearMinigameResults: () => void;
  onClearTileSwapAnimation: () => void;
}

/**
 * SpectatorView: Full-screen layout optimized for TV/desktop.
 * Shows the board prominently with a persistent sidebar scoreboard.
 * Designed to be displayed via AirPlay/Chromecast on a shared screen.
 */
export function SpectatorView({
  gameState,
  tileEffect,
  minigameResults,
  moveAnimation,
  tileSwapAnimation,
  activityFeed,
  onClearMoveAnimation,
  onClearTileEffect,
  onClearMinigameResults,
  onClearTileSwapAnimation,
}: Props) {
  const sortedPlayers = useMemo(() => {
    return Object.values(gameState.players)
      .filter((p) => p.role === 'player')
      .sort((a, b) => {
        if (b.marbles !== a.marbles) return b.marbles - a.marbles;
        return b.points - a.points;
      });
  }, [gameState.players]);

  const currentPlayer = gameState.currentTurnPlayerId
    ? gameState.players[gameState.currentTurnPlayerId]
    : null;

  // Auto-dismiss overlays so they never get permanently stuck
  useEffect(() => {
    if (!tileEffect) return;
    const timer = setTimeout(onClearTileEffect, 6000);
    return () => clearTimeout(timer);
  }, [tileEffect, onClearTileEffect]);

  useEffect(() => {
    if (!minigameResults) return;
    const timer = setTimeout(onClearMinigameResults, 8000);
    return () => clearTimeout(timer);
  }, [minigameResults, onClearMinigameResults]);

  return (
    <div style={styles.container}>
      {/* Board area - takes most of the screen */}
      <div style={styles.boardArea}>
        <GameBoard
          board={gameState.board}
          players={sortedPlayers}
          reachableTiles={[]}
          moveAnimation={moveAnimation}
          onAnimationComplete={onClearMoveAnimation}
          tileSwapAnimation={tileSwapAnimation}
          onSwapAnimationComplete={onClearTileSwapAnimation}
        />

        {/* Activity feed — bottom-left, tappable to expand full history */}
        <ActivityFeed items={activityFeed} expandable />

        {/* Turn banner */}
        <div style={styles.turnBanner}>
          <span style={styles.turnNumber}>Turn {gameState.turnNumber}</span>
          {currentPlayer && (
            <span style={styles.turnPlayer}>
              {currentPlayer.token?.emoji} {currentPlayer.name}'s turn
            </span>
          )}
        </div>

        {/* Event overlay - shows tile effects, battles, minigame results prominently */}
        {tileEffect && (
          <div style={styles.eventOverlay}>
            <div style={{
              ...styles.eventCard,
              borderColor: tileEffect.color === 'green' ? '#27ae60'
                : tileEffect.color === 'red' ? '#e74c3c' : '#8892b0',
            }}>
              <span style={styles.eventPlayerName}>{tileEffect.playerName}</span>
              <p style={styles.eventMessage}>{tileEffect.message}</p>
            </div>
          </div>
        )}

        {minigameResults && (
          <div style={styles.eventOverlay}>
            <div style={{ ...styles.eventCard, borderColor: '#f39c12' }}>
              <h3 style={styles.podiumTitle}>Minigame Results!</h3>
              {minigameResults.marbleBonus && (
                <div style={styles.marbleAlert}>MARBLE BONUS!</div>
              )}
              {minigameResults.rankings.slice(0, 3).map((r, i) => (
                <div key={r.id} style={styles.podiumRow}>
                  <span style={{ ...styles.podiumRank, color: ['#f39c12', '#bdc3c7', '#cd7f32'][i] }}>
                    {['1st', '2nd', '3rd'][i]}
                  </span>
                  <span style={styles.podiumName}>{r.name}</span>
                  <span style={styles.podiumScore}>{r.score}</span>
                  {r.prizePoints > 0 && <span style={styles.prize}>+{r.prizePoints}pts</span>}
                  {r.prizeMarbles > 0 && <span style={styles.marblePrize}>+1 marble!</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar scoreboard - always visible */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.gameTitle}>Losing Their Marbles</h2>
          <p style={styles.target}>First to {gameState.targetMarbles}</p>
        </div>

        <div style={styles.playerList}>
          {sortedPlayers.map((p, i) => {
            const isActive = p.id === gameState.currentTurnPlayerId;
            return (
              <div
                key={p.id}
                style={{
                  ...styles.playerCard,
                  ...(isActive ? styles.playerCardActive : {}),
                }}
              >
                <div style={styles.playerRank}>#{i + 1}</div>
                <div style={styles.playerToken}>
                  <span style={styles.tokenEmoji}>{p.token?.emoji || '?'}</span>
                </div>
                <div style={styles.playerInfo}>
                  <div style={styles.playerName}>
                    {p.name}
                    {isActive && <span style={styles.activeDot} />}
                  </div>
                  <div style={styles.tokenLabel}>{p.token?.name}</div>
                  <div style={styles.marbleBar}>
                    <div
                      style={{
                        ...styles.marbleFill,
                        width: `${Math.min(100, (p.marbles / gameState.targetMarbles) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div style={styles.playerStats}>
                  <span style={styles.marbleCount}>{p.marbles}</span>
                  <span style={styles.pointCount}>{p.points}pts</span>
                </div>
                {/* Modifier badges */}
                <div style={styles.modifiers}>
                  {p.modifiers.rerolls > 0 && <span style={styles.mod}>🔄{p.modifiers.rerolls}</span>}
                  {p.modifiers.protection > 0 && <span style={styles.mod}>🛡️</span>}
                  {p.modifiers.double_dice > 0 && <span style={styles.modGood}>🎲🎲</span>}
                  {p.modifiers.worst_dice > 0 && <span style={styles.modBad}>🎲↓</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    background: '#0a192f',
  },
  // Board area — fills remaining space
  boardArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  turnBanner: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(17, 34, 64, 0.85)',
    borderRadius: '12px',
    padding: '10px 16px',
    backdropFilter: 'blur(8px)',
  },
  turnNumber: {
    color: '#8892b0',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  turnPlayer: {
    color: '#ccd6f6',
    fontSize: '20px',
    fontWeight: 700,
  },
  // Event overlays — centered on the board
  eventOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.4)',
    pointerEvents: 'none' as const,
  },
  eventCard: {
    background: '#112240',
    borderRadius: '20px',
    padding: '32px',
    maxWidth: '400px',
    textAlign: 'center',
    border: '4px solid',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  eventPlayerName: {
    color: '#8892b0',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    display: 'block',
    marginBottom: '8px',
  },
  eventMessage: {
    color: '#ccd6f6',
    fontSize: '22px',
    fontWeight: 600,
    lineHeight: 1.4,
    margin: 0,
  },
  podiumTitle: {
    color: '#f39c12',
    fontSize: '28px',
    fontWeight: 800,
    margin: '0 0 12px 0',
  },
  marbleAlert: {
    background: 'rgba(243, 156, 18, 0.15)',
    color: '#f39c12',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700,
    marginBottom: '12px',
  },
  podiumRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    background: '#0a192f',
    borderRadius: '8px',
    marginBottom: '6px',
  },
  podiumRank: { fontSize: '18px', fontWeight: 800, minWidth: '36px' },
  podiumName: { color: '#ccd6f6', fontSize: '16px', fontWeight: 600, flex: 1, textAlign: 'left' as const },
  podiumScore: { color: '#8892b0', fontSize: '14px' },
  prize: { color: '#2ecc71', fontSize: '13px', fontWeight: 600 },
  marblePrize: { color: '#f39c12', fontSize: '13px', fontWeight: 700 },

  // Sidebar
  sidebar: {
    width: '320px',
    background: '#112240',
    borderLeft: '1px solid #233554',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  },
  sidebarHeader: {
    padding: '20px',
    textAlign: 'center',
    borderBottom: '1px solid #233554',
  },
  gameTitle: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #f39c12, #e74c3c, #9b59b6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  target: {
    color: '#8892b0',
    fontSize: '13px',
    margin: '4px 0 0 0',
  },
  playerList: {
    flex: 1,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  playerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    borderRadius: '12px',
    background: '#0a192f',
    border: '2px solid transparent',
    transition: 'border-color 0.3s',
  },
  playerCardActive: {
    borderColor: '#f39c12',
    background: 'rgba(243, 156, 18, 0.05)',
  },
  playerRank: {
    color: '#8892b0',
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '24px',
  },
  playerToken: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenEmoji: { fontSize: '24px' },
  playerInfo: { flex: 1, minWidth: 0 },
  playerName: {
    color: '#ccd6f6',
    fontSize: '15px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  activeDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#f39c12',
    display: 'inline-block',
  },
  tokenLabel: {
    color: '#5a6a8a',
    fontSize: '11px',
    fontStyle: 'italic',
  },
  marbleBar: {
    height: '4px',
    borderRadius: '2px',
    background: '#233554',
    marginTop: '4px',
    overflow: 'hidden',
  },
  marbleFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  playerStats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  marbleCount: {
    color: '#f39c12',
    fontSize: '22px',
    fontWeight: 800,
  },
  pointCount: {
    color: '#8892b0',
    fontSize: '11px',
  },
  modifiers: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: '28px',
  },
  mod: { fontSize: '12px' },
  modGood: { fontSize: '12px' },
  modBad: { fontSize: '12px' },
};
