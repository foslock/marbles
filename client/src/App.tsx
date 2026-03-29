import { useSocket } from './hooks/useSocket';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { MinigameScreen } from './components/MinigameScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { ErrorToast } from './components/ErrorToast';

export default function App() {
  const socket = useSocket();

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

      {socket.phase === 'playing' && socket.gameState && (
        <GameScreen
          gameState={socket.gameState}
          playerId={socket.playerId}
          diceResult={socket.diceResult}
          tileEffect={socket.tileEffect}
          battleResult={socket.battleResult}
          minigameResults={socket.minigameResults}
          awaitingChoice={socket.awaitingChoice}
          onRollDice={socket.rollDice}
          onChooseMove={socket.chooseMove}
          onMakeChoice={socket.makeChoice}
          onClearTileEffect={socket.clearTileEffect}
          onClearBattleResult={socket.clearBattleResult}
          onClearMinigameResults={socket.clearMinigameResults}
        />
      )}

      {socket.phase === 'minigame' && socket.minigameInfo && (
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
