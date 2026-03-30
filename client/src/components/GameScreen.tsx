import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  GameState,
  DiceResult,
  TileEffect,
  MinigameResults,
  ActivityItem,
} from '../types/game';
import { GameBoard, type MoveAnimation, type TileSwapAnimation, type StealAnimation } from './GameBoard';
import { DiceOverlay } from './DiceOverlay';
import { TileEffectOverlay } from './TileEffectOverlay';
import { MinigameResultsOverlay } from './MinigameResultsOverlay';
import { Scoreboard } from './Scoreboard';
import { ActivityFeed } from './ActivityFeed';

interface Props {
  gameState: GameState;
  playerId: string | null;
  diceResult: DiceResult | null;
  tileEffect: TileEffect | null;
  minigameResults: MinigameResults | null;
  awaitingChoice: TileEffect | null;
  moveAnimation: MoveAnimation | null;
  tileSwapAnimation: TileSwapAnimation | null;
  activityFeed: ActivityItem[];
  onAddActivityItem: (message: string, color: ActivityItem['color']) => void;
  onRollDice: () => void;
  onChooseAdvantage: (roll: number) => void;
  onChooseMove: (tileId: number, path?: number[]) => void;
  onMakeChoice: (choiceType: string, targetId: string, amount?: number) => void;
  onClearTileEffect: () => void;
  onClearMinigameResults: () => void;
  onClearMoveAnimation: () => void;
  onClearTileSwapAnimation: () => void;
  stealAnimation: StealAnimation | null;
  onClearStealAnimation: () => void;
  onTurnComplete: () => void;
  onEndGame: () => void;
}

export function GameScreen({
  gameState,
  playerId,
  diceResult,
  tileEffect,
  minigameResults,
  awaitingChoice,
  moveAnimation,
  tileSwapAnimation,
  activityFeed,
  onAddActivityItem,
  onRollDice,
  onChooseAdvantage,
  onChooseMove,
  onMakeChoice,
  onClearTileEffect,
  onClearMinigameResults,
  onClearMoveAnimation,
  onClearTileSwapAnimation,
  stealAnimation,
  onClearStealAnimation,
  onTurnComplete,
  onEndGame,
}: Props) {
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [moveChosen, setMoveChosen] = useState(false);

  // Reset moveChosen when diceResult changes (new turn / new roll)
  useEffect(() => {
    setMoveChosen(false);
  }, [diceResult]);

  // ── Dice-settle gating ───────────────────────────────────────────────────
  // Buffer the move animation and tile selection until the dice overlay
  // reports it has visually settled (landed + held for 1 s).
  const [diceSettled, setDiceSettled] = useState(true);
  const [activeMoveAnimation, setActiveMoveAnimation] = useState<MoveAnimation | null>(null);
  const movePendingRef = useRef<MoveAnimation | null>(null);

  // When a new dice roll comes in, mark as unsettled.
  // For non-active players, auto-settle after a timeout since the DiceOverlay
  // might not be mounted (e.g. during other overlays) and would never fire
  // onDiceSettled.
  useEffect(() => {
    if (diceResult) {
      setDiceSettled(false);
      if (diceResult.playerId !== playerId) {
        const timer = setTimeout(() => {
          setDiceSettled(true);
          if (movePendingRef.current) {
            setActiveMoveAnimation(movePendingRef.current);
            movePendingRef.current = null;
          }
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      setDiceSettled(true);
    }
  }, [diceResult, playerId]);

  // When moveAnimation arrives, either pass through or buffer
  const diceSettledRef = useRef(true);
  diceSettledRef.current = diceSettled;

  useEffect(() => {
    if (!moveAnimation) {
      if (!movePendingRef.current) setActiveMoveAnimation(null);
      return;
    }
    if (diceSettledRef.current) {
      setActiveMoveAnimation(moveAnimation);
    } else {
      movePendingRef.current = moveAnimation;
    }
  }, [moveAnimation]);

  const onDiceSettled = useCallback(() => {
    setDiceSettled(true);
    if (movePendingRef.current) {
      setActiveMoveAnimation(movePendingRef.current);
      movePendingRef.current = null;
    }
  }, []);

  // ── Tile effect buffering ────────────────────────────────────────────────
  // Hold incoming tile effects until the move animation completes, so the
  // popup never appears while the token is still flying.  We check the raw
  // `moveAnimation` prop (set in the same batched render as tileEffect) and
  // also `activeMoveAnimation` (the dice-settle-gated version).
  const effectPendingRef = useRef<TileEffect | null>(null);
  const [effectToShow, setEffectToShow] = useState<TileEffect | null>(null);

  useEffect(() => {
    if (!tileEffect) {
      effectPendingRef.current = null;
      setEffectToShow(null);
      return;
    }
    // Check both raw and gated move animation — if either is active, buffer.
    if (moveAnimation || activeMoveAnimation) {
      effectPendingRef.current = tileEffect;
    } else {
      setEffectToShow(tileEffect);
    }
  }, [tileEffect, moveAnimation, activeMoveAnimation]);

  // ── Choice buffering ─────────────────────────────────────────────────────
  const choicePendingRef = useRef<TileEffect | null>(null);
  const [choiceToShow, setChoiceToShow] = useState<TileEffect | null>(null);

  useEffect(() => {
    if (!awaitingChoice) {
      choicePendingRef.current = null;
      setChoiceToShow(null);
      return;
    }
    if (moveAnimation || activeMoveAnimation) {
      choicePendingRef.current = awaitingChoice;
    } else {
      setChoiceToShow(awaitingChoice);
    }
  }, [awaitingChoice, moveAnimation, activeMoveAnimation]);

  const handleAnimationComplete = useCallback(() => {
    onClearMoveAnimation();
    if (effectPendingRef.current) {
      setEffectToShow(effectPendingRef.current);
      effectPendingRef.current = null;
    }
    if (choicePendingRef.current) {
      setChoiceToShow(choicePendingRef.current);
      choicePendingRef.current = null;
    }
  }, [onClearMoveAnimation]);

  const handleClearEffectToShow = useCallback(() => {
    setEffectToShow(null);
    onClearTileEffect();
    // Signal server that this turn's overlays are done — triggers swap + advance.
    // Every client sends this; the server ignores duplicates via _pending_turn_player_id.
    onTurnComplete();
  }, [onClearTileEffect, onTurnComplete]);

  // ── Activity item for tile effects (posted after movement completes) ─────
  useEffect(() => {
    if (effectToShow && effectToShow.message && !effectToShow.requiresChoice) {
      const color: ActivityItem['color'] =
        effectToShow.color === 'green' ? 'green' : effectToShow.color === 'red' ? 'red' : 'neutral';
      onAddActivityItem(`${effectToShow.playerName}: ${effectToShow.message}`, color);
      if (effectToShow.autoMarbles) {
        onAddActivityItem(`\uD83D\uDD2E ${effectToShow.playerName} earned ${effectToShow.autoMarbles} marble from points!`, 'gold');
      }
      // Non-active players don't see the popup overlay, so auto-clear the effect
      // immediately so it doesn't block turn transitions.
      if (effectToShow.playerId !== playerId) {
        setEffectToShow(null);
        onClearTileEffect();
        onTurnComplete();
      }
    }
  }, [effectToShow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delayed turn transition ──────────────────────────────────────────────
  // Keep the board centred on the current player and freeze the top-bar /
  // DiceRoller until ALL overlays are dismissed.
  const [displayedTurnPlayerId, setDisplayedTurnPlayerId] = useState(
    gameState.currentTurnPlayerId,
  );

  useEffect(() => {
    if (!effectToShow && !tileEffect && !minigameResults && !activeMoveAnimation) {
      setDisplayedTurnPlayerId(gameState.currentTurnPlayerId);
    }
  }, [gameState.currentTurnPlayerId, effectToShow, tileEffect, minigameResults, activeMoveAnimation]);

  // ── Derived values ───────────────────────────────────────────────────────
  const myPlayer = playerId ? gameState.players[playerId] : null;
  const isSpectator = myPlayer?.role === 'spectator';

  const isMyTurn = displayedTurnPlayerId === playerId;
  const currentTurnPlayer = displayedTurnPlayerId
    ? gameState.players[displayedTurnPlayerId]
    : null;

  const needsToChooseMove =
    !moveChosen && diceSettled && diceResult && diceResult.playerId === playerId && diceResult.reachableTiles.length > 0 && !diceResult.dizzy;

  const handleChooseMove = (tileId: number) => {
    const tile = diceResult?.reachableTiles.find((t) => t.tileId === tileId);
    onChooseMove(tileId, tile?.path);
    setMoveChosen(true);
  };

  const sortedPlayers = useMemo(() => {
    return Object.values(gameState.players)
      .filter((p) => p.role === 'player')
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
  }, [gameState.players]);

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
        {myPlayer && myPlayer.role === 'player' && (
          <div style={styles.myScore}>
            <span style={styles.myScoreMarbles}>{myPlayer.marbles}</span>
            <span style={styles.myScoreLabel}>marbles</span>
            <span style={styles.myScoreDivider}>|</span>
            <span style={styles.myScorePoints}>{myPlayer.points}</span>
            <span style={styles.myScoreLabel}>pts</span>
          </div>
        )}
        <button
          style={styles.scoreboardBtn}
          onClick={() => setShowScoreboard(!showScoreboard)}
        >
          {showScoreboard ? 'Board' : 'Scores'}
        </button>
      </div>

      {/* Main content — board fills this area; dice + feed float on top */}
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
            moveAnimation={activeMoveAnimation}
            onAnimationComplete={handleAnimationComplete}
            myPlayerId={playerId}
            activePlayerId={displayedTurnPlayerId}
            tileSwapAnimation={tileSwapAnimation}
            onSwapAnimationComplete={onClearTileSwapAnimation}
            stealAnimation={stealAnimation}
            onStealAnimationComplete={onClearStealAnimation}
          />
        )}

        {/* Activity feed — bottom-left overlay */}
        <ActivityFeed items={activityFeed} />

        {/* Physics dice overlay — visible during active turns */}
        {!moveChosen && !effectToShow && !choiceToShow && !minigameResults && !activeMoveAnimation && !showScoreboard && (
          <DiceOverlay
            isMyTurn={isMyTurn}
            isMyRoll={diceResult?.playerId === playerId}
            isSpectator={isSpectator}
            rolledValue={diceResult ? diceResult.roll : null}
            diceValues={diceResult ? diceResult.dice : null}
            diceType={diceResult ? diceResult.type : 'normal'}
            hasDoubleDice={(myPlayer?.modifiers.double_dice ?? 0) > 0}
            hasAdvantage={(myPlayer?.modifiers.advantage ?? 0) > 0}
            onRoll={onRollDice}
            onChooseAdvantage={onChooseAdvantage}
            onDiceSettled={onDiceSettled}
          />
        )}

        {/* Tile-pick hint when choosing a move */}
        {needsToChooseMove && (
          <p style={styles.tilePickHint}>
            Tap a highlighted tile! (Rolled {diceResult.roll})
          </p>
        )}
      </div>

      {/* Choice overlay */}
      {choiceToShow && choiceToShow.playerId === playerId && (
        <div style={styles.overlay}>
          <div style={styles.choiceCard}>
            <h3 style={styles.choiceTitle}>{choiceToShow.message}</h3>
            <div style={styles.choiceOptions}>
              {choiceToShow.options?.map((opt) => (
                <button
                  key={opt.id}
                  style={styles.choiceBtn}
                  onClick={() =>
                    onMakeChoice(choiceToShow.choiceType!, opt.id)
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

      {/* Effect overlays — only show for the active player (or if stolen from) */}
      {effectToShow && effectToShow.playerId === playerId && (
        <TileEffectOverlay
          effect={effectToShow}
          playerToken={effectPlayerToken}
          onClose={handleClearEffectToShow}
        />
      )}
      {minigameResults && (
        <MinigameResultsOverlay
          results={minigameResults}
          onClose={() => {
            onClearMinigameResults();
            onTurnComplete();
          }}
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
  myScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  myScoreMarbles: {
    color: '#f39c12',
    fontSize: '16px',
    fontWeight: 700,
  },
  myScorePoints: {
    color: '#ccd6f6',
    fontSize: '14px',
    fontWeight: 600,
  },
  myScoreLabel: {
    color: '#8892b0',
    fontSize: '10px',
  },
  myScoreDivider: {
    color: '#233554',
    fontSize: '12px',
    margin: '0 2px',
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
  tilePickHint: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 25,
    color: '#ccd6f6',
    fontSize: '13px',
    fontWeight: 600,
    background: 'rgba(10, 25, 47, 0.85)',
    padding: '6px 16px',
    borderRadius: '10px',
    backdropFilter: 'blur(6px)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
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
