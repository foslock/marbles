import { useMemo } from 'react';
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
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          background: '#e74c3c', color: '#fff', textAlign: 'center',
          padding: '4px', fontSize: '12px', zIndex: 1000,
        }}>
          Connecting...
        </div>
      )}

      {socket.phase === 'home' && (
        <HomeScreen
          onCreateSession={socket.createSession}
          onJoinSession={socket.joinSession}
        />
      )}

      {socket.phase === 'lobby' && socket.lobby && (
        <LobbyScreen
          lobby={socket.lobby}
          playerId={socket.playerId}
          onStartGame={socket.startGame}
        />
      )}

      {/* Spectators get the large TV-optimized view */}
      {socket.phase === 'playing' && socket.gameState && isSpectator && (
        <SpectatorView
          gameState={socket.gameState}
          tileEffect={socket.tileEffect}
          battleResult={socket.battleResult}
          minigameResults={socket.minigameResults}
          moveAnimation={socket.moveAnimation}
          onClearMoveAnimation={socket.clearMoveAnimation}
        />
      )}

      {/* Players get the mobile-optimized interactive view */}
      {socket.phase === 'playing' && socket.gameState && !isSpectator && (
        <GameScreen
          gameState={socket.gameState}
          playerId={socket.playerId}
          diceResult={socket.diceResult}
          tileEffect={socket.tileEffect}
          battleResult={socket.battleResult}
          minigameResults={socket.minigameResults}
          awaitingChoice={socket.awaitingChoice}
          moveAnimation={socket.moveAnimation}
          onRollDice={socket.rollDice}
          onChooseMove={socket.chooseMove}
          onMakeChoice={socket.makeChoice}
          onClearTileEffect={socket.clearTileEffect}
          onClearBattleResult={socket.clearBattleResult}
          onClearMinigameResults={socket.clearMinigameResults}
          onClearMoveAnimation={socket.clearMoveAnimation}
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
