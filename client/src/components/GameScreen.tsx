import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  GameState,
  DiceResult,
  TileEffect,
  BattleResult,
  MinigameResults,
} from '../types/game';
import { GameBoard, type MoveAnimation } from './GameBoard';
import { DiceRoller } from './DiceRoller';
import { TileEffectOverlay } from './TileEffectOverlay';
import { BattleOverlay } from './BattleOverlay';
import { MinigameResultsOverlay } from './MinigameResultsOverlay';
import { PlayerHUD } from './PlayerHUD';
import { Scoreboard } from './Scoreboard';

interface Props {
  gameState: GameState;
  playerId: string | null;
  diceResult: DiceResult | null;
  tileEffect: TileEffect | null;
  battleResult: BattleResult | null;
  minigameResults: MinigameResults | null;
  awaitingChoice: TileEffect | null;
  moveAnimation: MoveAnimation | null;
  onRollDice: (useReroll?: boolean) => void;
  onChooseMove: (tileId: number, path?: number[]) => void;
  onMakeChoice: (choiceType: string, targetId: string, amount?: number) => void;
  onClearTileEffect: () => void;
  onClearBattleResult: () => void;
  onClearMinigameResults: () => void;
  onClearMoveAnimation: () => void;
  onEndGame: () => void;
}

export function GameScreen({
  gameState,
  playerId,
  diceResult,
  tileEffect,
  battleResult,
  minigameResults,
  awaitingChoice,
  moveAnimation,
  onRollDice,
  onChooseMove,
  onMakeChoice,
  onClearTileEffect,
  onClearBattleResult,
  onClearMinigameResults,
  onClearMoveAnimation,
  onEndGame,
}: Props) {
  const [showScoreboard, setShowScoreboard] = useState(false);

  // ── Tile effect buffering ────────────────────────────────────────────────
  // Hold incoming tile effects until the move animation + landing completes,
  // so the popup never appears while the token is still flying.
  const effectPendingRef = useRef<TileEffect | null>(null);
  const [effectToShow, setEffectToShow] = useState<TileEffect | null>(null);

  useEffect(() => {
    if (!tileEffect) {
      effectPendingRef.current = null;
      setEffectToShow(null);
      return;
    }
    // If animation is running, buffer; otherwise show immediately.
    if (moveAnimation) {
      effectPendingRef.current = tileEffect;
    } else {
      setEffectToShow(tileEffect);
    }
  }, [tileEffect]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnimationComplete = useCallback(() => {
    onClearMoveAnimation();
    if (effectPendingRef.current) {
      setEffectToShow(effectPendingRef.current);
      effectPendingRef.current = null;
    }
  }, [onClearMoveAnimation]);

  const handleClearEffectToShow = useCallback(() => {
    setEffectToShow(null);
    onClearTileEffect();
  }, [onClearTileEffect]);

  // ── Delayed turn transition ──────────────────────────────────────────────
  // Keep the board centred on the current player and show their name in the
  // top bar until ALL overlays are dismissed, so the view doesn't jump away
  // while anyone is still reading a tile-effect / battle / minigame popup.
  const [displayedTurnPlayerId, setDisplayedTurnPlayerId] = useState(
    gameState.currentTurnPlayerId,
  );

  useEffect(() => {
    if (!effectToShow && !battleResult && !minigameResults) {
      setDisplayedTurnPlayerId(gameState.currentTurnPlayerId);
    }
  }, [gameState.currentTurnPlayerId, effectToShow, battleResult, minigameResults]);

  // Also flush when each overlay is individually dismissed
  const handleClearBattleResult = useCallback(() => {
    onClearBattleResult();
    // The useEffect above will fire next render to sync displayedTurnPlayerId
  }, [onClearBattleResult]);

  const handleClearMinigameResults = useCallback(() => {
    onClearMinigameResults();
  }, [onClearMinigameResults]);

  // ── Derived values ───────────────────────────────────────────────────────
  const myPlayer = playerId ? gameState.players[playerId] : null;
  const isSpectator = myPlayer?.role === 'spectator';

  // Use the visually-displayed turn player (frozen while overlay is open)
  const isMyTurn = displayedTurnPlayerId === playerId;
  const currentTurnPlayer = displayedTurnPlayerId
    ? gameState.players[displayedTurnPlayerId]
    : null;

  const needsToChooseMove =
    diceResult && diceResult.playerId === playerId && diceResult.reachableTiles.length > 0;

  const handleChooseMove = (tileId: number) => {
    const tile = diceResult?.reachableTiles.find((t) => t.tileId === tileId);
    onChooseMove(tileId, tile?.path);
  };

  const sortedPlayers = useMemo(() => {
    return Object.values(gameState.players)
      .filter((p) => p.role === 'player')
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
  }, [gameState.players]);

  // Look up the token for whoever's tile effect is being shown
  const effectPlayerToken = effectToShow
    ? (gameState.players[effectToShow.playerId]?.token ?? null)
    : null;

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.turnInfo}>
          <span style={styles.turnLabel}>Turn {gameState.turnNumber}</span>
          <span style={styles.currentPlayer}>
            {currentTurnPlayer
              ? `${currentTurnPlayer.token?.emoji || '?'} ${currentTurnPlayer.name}'s turn`
              : ''}
          </span>
        </div>
        <button
          style={styles.scoreboardBtn}
          onClick={() => setShowScoreboard(!showScoreboard)}
        >
          {showScoreboard ? 'Board' : 'Scores'}
        </button>
      </div>

      {/* Main content */}
      <div style={styles.mainContent}>
        {showScoreboard ? (
          <Scoreboard
            players={sortedPlayers}
            targetMarbles={gameState.targetMarbles}
            currentPlayerId={playerId}
            hostId={gameState.hostId}
            onEndGame={onEndGame}
          />
        ) : (
          <GameBoard
            board={gameState.board}
            players={sortedPlayers}
            reachableTiles={needsToChooseMove ? diceResult.reachableTiles : []}
            onTileClick={needsToChooseMove ? handleChooseMove : undefined}
            moveAnimation={moveAnimation}
            onAnimationComplete={handleAnimationComplete}
            myPlayerId={playerId}
            activePlayerId={displayedTurnPlayerId}
          />
        )}
      </div>

      {/* Player HUD at bottom */}
      {myPlayer && myPlayer.role === 'player' && (
        <PlayerHUD player={myPlayer} />
      )}

      {/* Action area */}
      <div style={styles.actionArea}>
        {isMyTurn && !effectToShow && !battleResult && (
          <DiceRoller
            onRoll={onRollDice}
            hasRerolls={(myPlayer?.modifiers.rerolls ?? 0) > 0}
            hasDoubleDice={(myPlayer?.modifiers.double_dice ?? 0) > 0}
            hasWorstDice={(myPlayer?.modifiers.worst_dice ?? 0) > 0}
            rolledValue={diceResult?.playerId === playerId ? diceResult.roll : null}
          />
        )}

        {!isMyTurn && !isSpectator && !effectToShow && !battleResult && (
          <p style={styles.waitText}>
            Waiting for {currentTurnPlayer?.name || 'someone'}...
          </p>
        )}

        {diceResult && diceResult.playerId !== playerId && (
          <p style={styles.infoText}>
            {diceResult.playerName} rolled {diceResult.roll}!
          </p>
        )}

        {needsToChooseMove && (
          <p style={styles.infoText}>
            Tap a highlighted tile to move! (Rolled {diceResult.roll})
          </p>
        )}
      </div>

      {/* Choice overlay */}
      {awaitingChoice && awaitingChoice.playerId === playerId && (
        <div style={styles.overlay}>
          <div style={styles.choiceCard}>
            <h3 style={styles.choiceTitle}>{awaitingChoice.message}</h3>
            <div style={styles.choiceOptions}>
              {awaitingChoice.options?.map((opt) => (
                <button
                  key={opt.id}
                  style={styles.choiceBtn}
                  onClick={() =>
                    onMakeChoice(awaitingChoice.choiceType!, opt.id)
                  }
                >
                  {opt.name}
                  {opt.marbles !== undefined && ` (${opt.marbles} marbles)`}
                  {opt.points !== undefined && ` (${opt.points} pts)`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Effect overlays */}
      {effectToShow && (
        <TileEffectOverlay
          effect={effectToShow}
          playerToken={effectPlayerToken}
          onClose={handleClearEffectToShow}
        />
      )}
      {battleResult && (
        <BattleOverlay result={battleResult} onClose={handleClearBattleResult} />
      )}
      {minigameResults && (
        <MinigameResultsOverlay
          results={minigameResults}
          onClose={handleClearMinigameResults}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0a192f',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#112240',
    borderBottom: '1px solid #233554',
    zIndex: 10,
  },
  turnInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  turnLabel: {
    fontSize: '11px',
    color: '#8892b0',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  currentPlayer: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ccd6f6',
  },
  scoreboardBtn: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid #233554',
    background: 'transparent',
    color: '#a8b2d1',
    fontSize: '13px',
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  actionArea: {
    padding: '8px 16px',
    textAlign: 'center',
  },
  waitText: {
    color: '#8892b0',
    fontSize: '14px',
    margin: '4px 0',
  },
  infoText: {
    color: '#ccd6f6',
    fontSize: '14px',
    fontWeight: 500,
    margin: '4px 0',
  },
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
  choiceCard: {
    background: '#112240',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '320px',
    width: '100%',
  },
  choiceTitle: {
    color: '#ccd6f6',
    fontSize: '18px',
    marginBottom: '16px',
    textAlign: 'center',
  },
  choiceOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  choiceBtn: {
    padding: '12px',
    borderRadius: '10px',
    border: '2px solid #233554',
    background: 'transparent',
    color: '#ccd6f6',
    fontSize: '15px',
    cursor: 'pointer',
  },
};
