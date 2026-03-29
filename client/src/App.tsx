import { useMemo, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { SpectatorView } from './components/SpectatorView';
import { MinigameScreen } from './components/MinigameScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { ErrorToast } from './components/ErrorToast';

export default function App() {
  const socket = useSocket();
  const [showConnErrDetails, setShowConnErrDetails] = useState(false);

  // Determine if current user is a spectator
  const isSpectator = useMemo(() => {
    if (!socket.gameState || !socket.playerId) return false;
    const me = socket.gameState.players[socket.playerId];
    return me?.role === 'spectator';
  }, [socket.gameState, socket.playerId]);

  // Also check from lobby data (before game starts, role isn't in gameState yet)
  const isSpectatorInLobby = useMemo(() => {
    if (!socket.lobby || !socket.playerId) return false;
    const me = socket.lobby.players.find((p) => p.id === socket.playerId);
    return me?.role === 'spectator';
  }, [socket.lobby, socket.playerId]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!socket.connected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
          <div
            onClick={() => socket.connectionError && setShowConnErrDetails((v) => !v)}
            style={{
              background: socket.connectionError ? '#c0392b' : '#e67e22',
              color: '#fff',
              textAlign: 'center',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: socket.connectionError ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {socket.connectionError
              ? `\u26a0\ufe0f ${socket.connectionError.message} \u2014 click for details`
              : 'Connecting\u2026'}
          </div>
          {showConnErrDetails && socket.connectionError && (
            <div style={{
              background: '#1a1a2e',
              borderBottom: '1px solid #c0392b',
              color: '#ccd6f6',
              padding: '10px 16px',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {socket.connectionError.details}
            </div>
          )}
        </div>
      )}

      {socket.phase === 'home' && (
        <HomeScreen
          connected={socket.connected}
          onCreateSession={socket.createSession}
          onJoinSession={socket.joinSession}
        />
      )}

      {socket.phase === 'lobby' && socket.lobby && (
        <LobbyScreen
          lobby={socket.lobby}
          playerId={socket.playerId}
          onStartGame={socket.startGame}
          onAddCpu={socket.addCpuPlayer}
        />
      )}

      {/* Spectators get the large TV-optimized view.
          Also shown during minigame phase — spectators watch but don't play. */}
      {(socket.phase === 'playing' || socket.phase === 'minigame') && socket.gameState && isSpectator && (
        <SpectatorView
          gameState={socket.gameState}
          tileEffect={socket.tileEffect}
          minigameResults={socket.minigameResults}
          moveAnimation={socket.moveAnimation}
          tileSwapAnimation={socket.tileSwapAnimation}
          activityFeed={socket.activityFeed}
          onClearMoveAnimation={socket.clearMoveAnimation}
          onClearTileEffect={socket.clearTileEffect}
          onClearMinigameResults={socket.clearMinigameResults}
          onClearTileSwapAnimation={socket.clearTileSwapAnimation}
          onTurnComplete={socket.turnComplete}
        />
      )}

      {/* Players get the mobile-optimized interactive view */}
      {socket.phase === 'playing' && socket.gameState && !isSpectator && (
        <GameScreen
          gameState={socket.gameState}
          playerId={socket.playerId}
          diceResult={socket.diceResult}
          tileEffect={socket.tileEffect}
          minigameResults={socket.minigameResults}
          awaitingChoice={socket.awaitingChoice}
          moveAnimation={socket.moveAnimation}
          tileSwapAnimation={socket.tileSwapAnimation}
          activityFeed={socket.activityFeed}
          onAddActivityItem={socket.addActivityItem}
          onRollDice={socket.rollDice}
          onChooseMove={socket.chooseMove}
          onMakeChoice={socket.makeChoice}
          onClearTileEffect={socket.clearTileEffect}
          onClearMinigameResults={socket.clearMinigameResults}
          onClearMoveAnimation={socket.clearMoveAnimation}
          onClearTileSwapAnimation={socket.clearTileSwapAnimation}
          onTurnComplete={socket.turnComplete}
          onEndGame={socket.endGame}
        />
      )}

      {/* Spectators don't play minigames — they see the spectator view with results */}
      {socket.phase === 'minigame' && socket.minigameInfo && !isSpectator && !isSpectatorInLobby && (
        <MinigameScreen
          minigameInfo={socket.minigameInfo}
          playerId={socket.playerId}
          onSubmitScore={socket.submitMinigameScore}
        />
      )}

      {socket.phase === 'finished' && socket.gameState && (
        <GameOverScreen gameState={socket.gameState} />
      )}

      {socket.error && (
        <ErrorToast message={socket.error} onClose={socket.clearError} />
      )}
    </div>
  );
}
