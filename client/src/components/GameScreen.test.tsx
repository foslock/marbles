import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GameScreen } from './GameScreen';
import type { GameState, DiceResult, TileEffect, MinigameResults, ActivityItem } from '../types/game';
import type { MoveAnimation, TileSwapAnimation, StealAnimation } from './GameBoard';

// ── Mocks ──────────────────────────────────────────────────────────────────
// Mock child components to isolate GameScreen logic.  We only care about
// which components render and what props they receive, not their internals.

let capturedBoardProps: Record<string, unknown> = {};

vi.mock('./GameBoard', () => ({
  GameBoard: (props: Record<string, unknown>) => {
    capturedBoardProps = props;
    return <div data-testid="game-board" />;
  },
}));

let capturedDiceProps: Record<string, unknown> = {};

vi.mock('./DiceOverlay', () => ({
  DiceOverlay: (props: Record<string, unknown>) => {
    capturedDiceProps = props;
    return <div data-testid="dice-overlay" />;
  },
}));

vi.mock('./TileEffectOverlay', () => ({
  TileEffectOverlay: (props: Record<string, unknown>) => (
    <div data-testid="tile-effect-overlay" onClick={props.onClose as () => void} />
  ),
}));

vi.mock('./MinigameResultsOverlay', () => ({
  MinigameResultsOverlay: (props: Record<string, unknown>) => (
    <div data-testid="minigame-results-overlay" onClick={props.onClose as () => void} />
  ),
}));

vi.mock('./Scoreboard', () => ({
  Scoreboard: () => <div data-testid="scoreboard" />,
}));

vi.mock('./ActivityFeed', () => ({
  ActivityFeed: () => <div data-testid="activity-feed" />,
}));

vi.mock('../utils/sound', () => ({
  SFX: {
    yourTurn: vi.fn(),
    tileStep: vi.fn(),
    tileLand: vi.fn(),
    diceRoll: vi.fn(),
    stealEffect: vi.fn(),
    marbleGain: vi.fn(),
    gameOver: vi.fn(),
  },
}));

vi.mock('../utils/haptics', () => ({
  Haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    doublePulse: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const PLAYER_A = 'player-a';
const PLAYER_B = 'player-b';

function makeGameState(overrides?: Partial<GameState>): GameState {
  return {
    sessionId: 'test-session',
    hostId: PLAYER_A,
    state: 'playing',
    targetMarbles: 3,
    board: {
      width: 400,
      height: 400,
      tiles: {
        '0': { id: 0, x: 100, y: 100, category: 'neutral', color: 'neutral', effect: 'fortune_cookie', neighbors: [1], isFork: false, isMerge: false },
        '1': { id: 1, x: 200, y: 100, category: 'green', color: 'green', effect: 'gain_10', neighbors: [0, 2], isFork: false, isMerge: false },
        '2': { id: 2, x: 300, y: 100, category: 'red', color: 'red', effect: 'lose_10', neighbors: [1], isFork: false, isMerge: false },
      },
    },
    turnOrder: [PLAYER_A, PLAYER_B],
    currentTurnIndex: 0,
    currentTurnPlayerId: PLAYER_A,
    turnNumber: 1,
    players: {
      [PLAYER_A]: {
        id: PLAYER_A, name: 'Alice', role: 'player', token: { id: 't1', name: 'T1', description: '', color: '#f00', emoji: 'A' },
        turnOrder: 0, currentTile: 0, marbles: 1, points: 50, isConnected: true,
        modifiers: { advantage: 0, protection: 0, double_dice: 0, short_stop: 0, dizzy: 0 },
      },
      [PLAYER_B]: {
        id: PLAYER_B, name: 'Bob', role: 'player', token: { id: 't2', name: 'T2', description: '', color: '#00f', emoji: 'B' },
        turnOrder: 1, currentTile: 2, marbles: 0, points: 30, isConnected: true,
        modifiers: { advantage: 0, protection: 0, double_dice: 0, short_stop: 0, dizzy: 0 },
      },
    },
    winnerId: null,
    ...overrides,
  };
}

function makeDiceResult(overrides?: Partial<DiceResult>): DiceResult {
  return {
    playerId: PLAYER_A,
    playerName: 'Alice',
    roll: 3,
    dice: [3],
    type: 'normal',
    reachableTiles: [{ tileId: 1, path: [0, 1] }],
    ...overrides,
  };
}

function makeTileEffect(overrides?: Partial<TileEffect>): TileEffect {
  return {
    playerId: PLAYER_A,
    playerName: 'Alice',
    type: 'gain_10_points',
    category: 'positive_minor',
    color: 'green',
    message: 'Gained 10 points!',
    ...overrides,
  };
}

interface RenderProps {
  playerId?: string | null;
  diceResult?: DiceResult | null;
  tileEffect?: TileEffect | null;
  minigameResults?: MinigameResults | null;
  awaitingChoice?: TileEffect | null;
  pendingChoicePlayerId?: string | null;
  moveAnimation?: MoveAnimation | null;
  tileSwapAnimation?: TileSwapAnimation | null;
  stealAnimation?: StealAnimation | null;
  activityFeed?: ActivityItem[];
  gameState?: GameState;
}

function renderGameScreen(props: RenderProps = {}) {
  const callbacks = {
    onAddActivityItem: vi.fn(),
    onRollDice: vi.fn(),
    onChooseAdvantage: vi.fn(),
    onChooseMove: vi.fn(),
    onMakeChoice: vi.fn(),
    onClearTileEffect: vi.fn(),
    onClearMinigameResults: vi.fn(),
    onClearMoveAnimation: vi.fn(),
    onClearTileSwapAnimation: vi.fn(),
    onClearStealAnimation: vi.fn(),
    onTurnComplete: vi.fn(),
    onEndGame: vi.fn(),
    getDiagnostics: vi.fn(),
  };

  const result = render(
    <GameScreen
      gameState={props.gameState ?? makeGameState()}
      playerId={props.playerId ?? PLAYER_B}
      diceResult={props.diceResult ?? null}
      tileEffect={props.tileEffect ?? null}
      minigameResults={props.minigameResults ?? null}
      awaitingChoice={props.awaitingChoice ?? null}
      pendingChoicePlayerId={props.pendingChoicePlayerId ?? null}
      moveAnimation={props.moveAnimation ?? null}
      tileSwapAnimation={props.tileSwapAnimation ?? null}
      activityFeed={props.activityFeed ?? []}
      stealAnimation={props.stealAnimation ?? null}
      {...callbacks}
    />,
  );

  return { ...result, callbacks };
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  capturedBoardProps = {};
  capturedDiceProps = {};
});

describe('GameScreen — animation sync', () => {
  it('non-active player does NOT call onTurnComplete when auto-clearing tile effect', () => {
    // Player B is viewing; tile effect belongs to Player A (active player)
    const effect = makeTileEffect({ playerId: PLAYER_A, playerName: 'Alice' });

    const { callbacks } = renderGameScreen({
      playerId: PLAYER_B,
      tileEffect: effect,
    });

    // The effect should be auto-cleared for the non-active player, but
    // onTurnComplete should NOT be called.
    expect(callbacks.onClearTileEffect).toHaveBeenCalled();
    expect(callbacks.onTurnComplete).not.toHaveBeenCalled();
  });

  it('active player DOES call onTurnComplete when dismissing tile effect overlay', () => {
    // Player A is the active player and sees their own tile effect popup
    const effect = makeTileEffect({ playerId: PLAYER_A, playerName: 'Alice' });

    const { callbacks } = renderGameScreen({
      playerId: PLAYER_A,
      tileEffect: effect,
    });

    // The effect popup should be shown (not auto-cleared)
    expect(callbacks.onClearTileEffect).not.toHaveBeenCalled();
    expect(screen.getByTestId('tile-effect-overlay')).toBeInTheDocument();

    // Simulate dismissing the overlay
    act(() => {
      screen.getByTestId('tile-effect-overlay').click();
    });

    expect(callbacks.onClearTileEffect).toHaveBeenCalled();
    expect(callbacks.onTurnComplete).toHaveBeenCalled();
  });

  it('DiceOverlay is hidden during tile swap animation', () => {
    // It's player B's turn, no dice result yet, but a swap animation is playing
    const gs = makeGameState({ currentTurnPlayerId: PLAYER_B });

    renderGameScreen({
      playerId: PLAYER_B,
      gameState: gs,
      tileSwapAnimation: { sourceTileId: 0, targetTileId: 1, color: 'green' },
    });

    expect(screen.queryByTestId('dice-overlay')).not.toBeInTheDocument();
  });

  it('DiceOverlay shows when tile swap animation completes', () => {
    // Player B's turn, no swap animation, should see dice
    const gs = makeGameState({ currentTurnPlayerId: PLAYER_B });

    renderGameScreen({
      playerId: PLAYER_B,
      gameState: gs,
      tileSwapAnimation: null,
    });

    expect(screen.getByTestId('dice-overlay')).toBeInTheDocument();
  });

  it('displayedTurnPlayerId does not update while tileSwapAnimation is active', () => {
    // Start with player A's turn, swap animation active
    const gs1 = makeGameState({ currentTurnPlayerId: PLAYER_A });

    const { rerender, callbacks } = renderGameScreen({
      playerId: PLAYER_B,
      gameState: gs1,
      tileSwapAnimation: { sourceTileId: 0, targetTileId: 1, color: 'green' },
    });

    // Top bar should show Player A's turn info
    expect(screen.getByText(/Alice's turn/)).toBeInTheDocument();

    // Now turn updates to player B, but swap animation is still active
    const gs2 = makeGameState({ currentTurnPlayerId: PLAYER_B, turnNumber: 2 });

    rerender(
      <GameScreen
        gameState={gs2}
        playerId={PLAYER_B}
        diceResult={null}
        tileEffect={null}
        minigameResults={null}
        awaitingChoice={null}
        pendingChoicePlayerId={null}
        moveAnimation={null}
        tileSwapAnimation={{ sourceTileId: 0, targetTileId: 1, color: 'green' }}
        activityFeed={[]}
        stealAnimation={null}
        {...callbacks}
      />,
    );

    // Should still show Player A's turn (held back by swap animation)
    expect(screen.getByText(/Alice's turn/)).toBeInTheDocument();

    // Now clear swap animation
    rerender(
      <GameScreen
        gameState={gs2}
        playerId={PLAYER_B}
        diceResult={null}
        tileEffect={null}
        minigameResults={null}
        awaitingChoice={null}
        pendingChoicePlayerId={null}
        moveAnimation={null}
        tileSwapAnimation={null}
        activityFeed={[]}
        stealAnimation={null}
        {...callbacks}
      />,
    );

    // Now should show Player B's turn
    expect(screen.getByText(/Bob's turn/)).toBeInTheDocument();
  });

  it('DiceOverlay is hidden during active move animation', () => {
    const gs = makeGameState({ currentTurnPlayerId: PLAYER_B });

    renderGameScreen({
      playerId: PLAYER_B,
      gameState: gs,
      moveAnimation: { playerId: PLAYER_A, path: [0, 1] },
    });

    // Move animation triggers moveChosen which hides dice overlay
    // After the dice-settle auto-timeout (2s for non-active, but this is active player's view)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('dice-overlay')).not.toBeInTheDocument();
  });
});

describe('GameScreen — activePlayerWaitState', () => {
  it('is "rolling" when no dice result and no animations', () => {
    renderGameScreen({
      playerId: PLAYER_B,
      diceResult: null,
    });

    expect(capturedBoardProps.activePlayerWaitState).toBe('rolling');
  });

  it('is "choosing_tile" when dice rolled with reachable tiles', () => {
    const dice = makeDiceResult({
      playerId: PLAYER_A,
      reachableTiles: [{ tileId: 1, path: [0, 1] }],
    });

    renderGameScreen({
      playerId: PLAYER_B,
      diceResult: dice,
    });

    // After dice settle timeout for non-active player
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(capturedBoardProps.activePlayerWaitState).toBe('choosing_tile');
  });

  it('is "rolling" during advantage roll (reachable tiles empty until die chosen)', () => {
    const dice = makeDiceResult({
      playerId: PLAYER_A,
      type: 'advantage',
      dice: [3, 5],
      roll: 3,
      reachableTiles: [],
    });

    renderGameScreen({
      playerId: PLAYER_B,
      diceResult: dice,
    });

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(capturedBoardProps.activePlayerWaitState).toBe('rolling');
  });

  it('is "choosing_target" when pendingChoicePlayerId is set', () => {
    renderGameScreen({
      playerId: PLAYER_B,
      pendingChoicePlayerId: PLAYER_A,
    });

    expect(capturedBoardProps.activePlayerWaitState).toBe('choosing_target');
  });

  it('is "choosing_target" when awaitingChoice is set for active player (active player view)', () => {
    const choice = makeTileEffect({
      playerId: PLAYER_A,
      type: 'steal_points',
      requiresChoice: true,
      choiceType: 'steal_points',
    });

    renderGameScreen({
      playerId: PLAYER_A,
      awaitingChoice: choice,
    });

    expect(capturedBoardProps.activePlayerWaitState).toBe('choosing_target');
  });

  it('is null during move animation', () => {
    renderGameScreen({
      playerId: PLAYER_B,
      moveAnimation: { playerId: PLAYER_A, path: [0, 1] },
    });

    // Even after settle timeout, the active move animation suppresses wait state
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(capturedBoardProps.activePlayerWaitState).toBeNull();
  });

  it('is null during tile swap animation', () => {
    renderGameScreen({
      playerId: PLAYER_B,
      tileSwapAnimation: { sourceTileId: 0, targetTileId: 1, color: 'green' },
    });

    expect(capturedBoardProps.activePlayerWaitState).toBeNull();
  });

  it('is null during minigame results', () => {
    const results: MinigameResults = {
      rankings: [
        { id: PLAYER_A, name: 'Alice', score: 10, rank: 1, prizePoints: 50, prizeMarbles: 0 },
      ],
      marbleBonus: false,
    };

    renderGameScreen({
      playerId: PLAYER_B,
      minigameResults: results,
    });

    expect(capturedBoardProps.activePlayerWaitState).toBeNull();
  });

  it('is null when active player is reading their tile effect popup', () => {
    // Player A is active and sees their own effect
    const effect = makeTileEffect({ playerId: PLAYER_A });

    renderGameScreen({
      playerId: PLAYER_A,
      tileEffect: effect,
    });

    expect(capturedBoardProps.activePlayerWaitState).toBeNull();
  });
});

describe('GameScreen — event ordering (integration)', () => {
  it('full turn sequence: roll → move → effect → dismiss → swap → next turn', () => {
    // Simulate from Player B's perspective watching Player A's turn
    const gs = makeGameState({ currentTurnPlayerId: PLAYER_A });
    const callbacks = {
      onAddActivityItem: vi.fn(),
      onRollDice: vi.fn(),
      onChooseAdvantage: vi.fn(),
      onChooseMove: vi.fn(),
      onMakeChoice: vi.fn(),
      onClearTileEffect: vi.fn(),
      onClearMinigameResults: vi.fn(),
      onClearMoveAnimation: vi.fn(),
      onClearTileSwapAnimation: vi.fn(),
      onClearStealAnimation: vi.fn(),
      onTurnComplete: vi.fn(),
      onEndGame: vi.fn(),
      getDiagnostics: vi.fn(),
    };

    const baseProps = {
      gameState: gs,
      playerId: PLAYER_B,
      diceResult: null as DiceResult | null,
      tileEffect: null as TileEffect | null,
      minigameResults: null as MinigameResults | null,
      awaitingChoice: null as TileEffect | null,
      pendingChoicePlayerId: null as string | null,
      moveAnimation: null as MoveAnimation | null,
      tileSwapAnimation: null as TileSwapAnimation | null,
      activityFeed: [] as ActivityItem[],
      stealAnimation: null as StealAnimation | null,
      ...callbacks,
    };

    const { rerender } = render(<GameScreen {...baseProps} />);

    // Step 1: State = rolling (waiting for Player A to roll)
    expect(capturedBoardProps.activePlayerWaitState).toBe('rolling');
    expect(screen.queryByTestId('tile-effect-overlay')).not.toBeInTheDocument();

    // Step 2: Dice rolled — Player A rolled, Player B sees dice
    const dice = makeDiceResult({ playerId: PLAYER_A });
    rerender(<GameScreen {...baseProps} diceResult={dice} />);

    // After dice settle for non-active player
    act(() => { vi.advanceTimersByTime(2500); });

    expect(capturedBoardProps.activePlayerWaitState).toBe('choosing_tile');

    // Step 3: Player A chose a tile — move animation + tile effect arrive
    const effect = makeTileEffect({ playerId: PLAYER_A });
    rerender(
      <GameScreen
        {...baseProps}
        diceResult={dice}
        tileEffect={effect}
        moveAnimation={{ playerId: PLAYER_A, path: [0, 1] }}
      />,
    );

    // During movement, wait state is null, tile effect overlay not shown yet
    expect(capturedBoardProps.activePlayerWaitState).toBeNull();
    expect(screen.queryByTestId('tile-effect-overlay')).not.toBeInTheDocument();

    // Step 4: Movement completes — tile effect auto-clears for non-active player
    // onTurnComplete must NOT be called
    callbacks.onTurnComplete.mockClear();
    callbacks.onClearTileEffect.mockClear();

    // Simulate animation complete by clearing moveAnimation
    rerender(
      <GameScreen
        {...baseProps}
        diceResult={dice}
        tileEffect={effect}
        moveAnimation={null}
      />,
    );

    // Non-active player auto-clears effect without calling turn_complete
    expect(callbacks.onClearTileEffect).toHaveBeenCalled();
    expect(callbacks.onTurnComplete).not.toHaveBeenCalled();

    // Step 5: Active player dismisses popup → server sends tile_swap + turn_update
    // Tile swap animation arrives
    const gs2 = makeGameState({ currentTurnPlayerId: PLAYER_B, turnNumber: 2 });
    rerender(
      <GameScreen
        {...baseProps}
        gameState={gs2}
        diceResult={null}
        tileEffect={null}
        moveAnimation={null}
        tileSwapAnimation={{ sourceTileId: 0, targetTileId: 1, color: 'green' }}
      />,
    );

    // Dice overlay should NOT show during swap animation even though it's Player B's turn
    expect(screen.queryByTestId('dice-overlay')).not.toBeInTheDocument();
    // Turn display should still show previous player (gated by swap animation)
    expect(screen.getByText(/Alice's turn/)).toBeInTheDocument();

    // Step 6: Swap animation completes
    rerender(
      <GameScreen
        {...baseProps}
        gameState={gs2}
        diceResult={null}
        tileEffect={null}
        moveAnimation={null}
        tileSwapAnimation={null}
      />,
    );

    // NOW the dice overlay should appear and the turn should update
    expect(screen.getByTestId('dice-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Bob's turn/)).toBeInTheDocument();
    expect(capturedBoardProps.activePlayerWaitState).toBe('rolling');
  });

  it('minigame flow: tile effect (battle) → minigame → results dismiss → next turn', () => {
    const gs = makeGameState({ currentTurnPlayerId: PLAYER_A });
    const callbacks = {
      onAddActivityItem: vi.fn(),
      onRollDice: vi.fn(),
      onChooseAdvantage: vi.fn(),
      onChooseMove: vi.fn(),
      onMakeChoice: vi.fn(),
      onClearTileEffect: vi.fn(),
      onClearMinigameResults: vi.fn(),
      onClearMoveAnimation: vi.fn(),
      onClearTileSwapAnimation: vi.fn(),
      onClearStealAnimation: vi.fn(),
      onTurnComplete: vi.fn(),
      onEndGame: vi.fn(),
      getDiagnostics: vi.fn(),
    };

    const baseProps = {
      gameState: gs,
      playerId: PLAYER_B,
      diceResult: null as DiceResult | null,
      tileEffect: null as TileEffect | null,
      minigameResults: null as MinigameResults | null,
      awaitingChoice: null as TileEffect | null,
      pendingChoicePlayerId: null as string | null,
      moveAnimation: null as MoveAnimation | null,
      tileSwapAnimation: null as TileSwapAnimation | null,
      activityFeed: [] as ActivityItem[],
      stealAnimation: null as StealAnimation | null,
      ...callbacks,
    };

    const { rerender } = render(<GameScreen {...baseProps} />);

    // Minigame results arrive (after minigame screen phase transition)
    const results: MinigameResults = {
      rankings: [
        { id: PLAYER_A, name: 'Alice', score: 10, rank: 1, prizePoints: 50, prizeMarbles: 0 },
        { id: PLAYER_B, name: 'Bob', score: 5, rank: 2, prizePoints: 25, prizeMarbles: 0 },
      ],
      marbleBonus: false,
    };

    rerender(<GameScreen {...baseProps} minigameResults={results} />);

    // Results overlay shown, wait state is null, dice overlay hidden
    expect(screen.getByTestId('minigame-results-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('dice-overlay')).not.toBeInTheDocument();
    expect(capturedBoardProps.activePlayerWaitState).toBeNull();

    // Dismiss results — should call onTurnComplete
    act(() => {
      screen.getByTestId('minigame-results-overlay').click();
    });

    expect(callbacks.onClearMinigameResults).toHaveBeenCalled();
    expect(callbacks.onTurnComplete).toHaveBeenCalled();
  });
});
