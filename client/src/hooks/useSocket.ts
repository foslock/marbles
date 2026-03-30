import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  GamePhase,
  LobbyData,
  GameState,
  PlayerState,
  DiceResult,
  TileEffect,
  MinigameInfo,
  MinigameResults,
  ActivityItem,
} from '../types/game';
import type { TileSwapAnimation } from '../components/GameBoard';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

// ── Diagnostics event log ──────────────────────────────────────────────────
const MAX_EVENT_LOG = 120;

interface EventLogEntry {
  /** Monotonic index */
  seq: number;
  /** ISO timestamp */
  ts: string;
  /** 'rx' = received from server, 'tx' = sent to server */
  dir: 'rx' | 'tx';
  /** Socket.IO event name */
  event: string;
  /** Event payload (trimmed for size) */
  data: unknown;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);

  // ── Event log ring buffer ────────────────────────────────────────────────
  const eventLogRef = useRef<EventLogEntry[]>([]);
  const eventSeqRef = useRef(0);
  const emitRef = useRef<(event: string, data?: unknown) => void>(() => {});

  const logEvent = useCallback((dir: 'rx' | 'tx', event: string, data: unknown) => {
    const entry: EventLogEntry = {
      seq: eventSeqRef.current++,
      ts: new Date().toISOString(),
      dir,
      event,
      data,
    };
    const log = eventLogRef.current;
    log.push(entry);
    if (log.length > MAX_EVENT_LOG) log.splice(0, log.length - MAX_EVENT_LOG);
  }, []);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<{ message: string; details: string } | null>(null);
  const [phase, setPhase] = useState<GamePhase>('home');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const [tileEffect, setTileEffect] = useState<TileEffect | null>(null);
  const [minigameInfo, setMinigameInfo] = useState<MinigameInfo | null>(null);
  const [minigameResults, setMinigameResults] = useState<MinigameResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingChoice, setAwaitingChoice] = useState<TileEffect | null>(null);
  const [moveAnimation, setMoveAnimation] = useState<{ playerId: string; path: number[] } | null>(null);
  const [tileSwapAnimation, setTileSwapAnimation] = useState<TileSwapAnimation | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [stealAnimation, setStealAnimation] = useState<{
    fromPlayerId: string;
    toPlayerId: string;
    type: 'points' | 'marble';
    amount?: number;
  } | null>(null);
  const [lobbyTap, setLobbyTap] = useState<{ playerId: string; emoji: string; x: number; y: number } | null>(null);
  // Track when the active player has a pending choice (steal/give target).
  // Set on tile_effect with requiresChoice, cleared on choice_resolved / turn_update.
  const [pendingChoicePlayerId, setPendingChoicePlayerId] = useState<string | null>(null);

  // Buffered board updates — applied after swap animation completes
  const pendingBoardUpdatesRef = useRef<{ id: number; color: 'green' | 'red' | 'neutral'; category: string; effect: string }[]>([]);

  const _applyBoardUpdates = useCallback((updates: { id: number; color: 'green' | 'red' | 'neutral'; category: string; effect: string }[]) => {
    setGameState((prev) => {
      if (!prev?.board) return prev;
      const tiles = { ...prev.board.tiles };
      for (const update of updates) {
        const key = String(update.id);
        if (tiles[key]) {
          tiles[key] = { ...tiles[key], color: update.color, category: update.category, effect: update.effect };
        }
      }
      return { ...prev, board: { ...prev.board, tiles } };
    });
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const CONNECTION_TIMEOUT_MS = 10_000;
    const timeoutId = setTimeout(() => {
      if (!socket.connected) {
        setConnectionError({
          message: 'Connection timed out',
          details: `Could not reach the server at ${SOCKET_URL || window.location.origin} after ${CONNECTION_TIMEOUT_MS / 1000}s. The server may be down or unreachable.`,
        });
      }
    }, CONNECTION_TIMEOUT_MS);

    // Helper: wrap socket.on to auto-log received events
    const on = <T,>(event: string, handler: (data: T) => void) => {
      socket.on(event, (data: T) => {
        logEvent('rx', event, data);
        handler(data);
      });
    };
    // Helper: emit + log
    const emit = (event: string, data?: unknown) => {
      logEvent('tx', event, data ?? {});
      socket.emit(event, data ?? {});
    };
    emitRef.current = emit;

    socket.on('connect', () => {
      clearTimeout(timeoutId);
      setConnected(true);
      setConnectionError(null);
      // Auto-reconnect if we have stored session info
      const savedSession = sessionStorage.getItem('ltm_session');
      if (savedSession) {
        try {
          const { passphrase, playerId: savedPlayerId } = JSON.parse(savedSession);
          if (passphrase && savedPlayerId) {
            emit('reconnect_session', { passphrase, playerId: savedPlayerId });
          }
        } catch {}
      }
    });
    socket.on('connect_error', (err) => {
      setConnectionError({
        message: 'Failed to connect to server',
        details: err.message || String(err),
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('error', (data: { message: string }) => { logEvent('rx', 'error', data); setError(data.message); });

    on('session_created', (data: { playerId: string; sessionId: string; lobby: LobbyData }) => {
      setPlayerId(data.playerId);
      playerIdRef.current = data.playerId;
      setSessionId(data.sessionId);
      setLobby(data.lobby);
      setPhase('lobby');
      // Persist for reconnection
      sessionStorage.setItem('ltm_session', JSON.stringify({
        passphrase: data.lobby.passphrase,
        playerId: data.playerId,
      }));
    });

    on('joined_session', (data: { playerId: string; sessionId: string; lobby: LobbyData }) => {
      setPlayerId(data.playerId);
      playerIdRef.current = data.playerId;
      setSessionId(data.sessionId);
      setLobby(data.lobby);
      setPhase('lobby');
      sessionStorage.setItem('ltm_session', JSON.stringify({
        passphrase: data.lobby.passphrase,
        playerId: data.playerId,
      }));
    });

    on('lobby_update', (data: LobbyData) => {
      setLobby(data);
    });

    on('game_started', (data: GameState) => {
      setGameState(data);
      setPhase('playing');
    });

    on('game_state', (data: GameState) => {
      setGameState(data);
      if (data.state === 'playing') setPhase('playing');
    });

    on('dice_rolled', (data: DiceResult) => {
      setDiceResult(data);
    });

    on('advantage_chosen', (data: { playerId: string; roll: number; reachableTiles: { tileId: number; path: number[] }[]; dizzy?: boolean }) => {
      // Update the dice result with the chosen roll and reachable tiles
      setDiceResult((prev) => {
        if (!prev || prev.playerId !== data.playerId) return prev;
        return { ...prev, roll: data.roll, reachableTiles: data.reachableTiles, dizzy: data.dizzy };
      });
    });

    on('player_moved', (data: { playerId: string; tileId: number; path: number[] }) => {
      // Trigger animation before updating state
      if (data.path && data.path.length > 1) {
        setMoveAnimation({ playerId: data.playerId, path: data.path });
      }
      setGameState((prev) => {
        if (!prev) return prev;
        const players = { ...prev.players };
        if (players[data.playerId]) {
          players[data.playerId] = {
            ...players[data.playerId],
            currentTile: data.tileId,
          };
        }
        return { ...prev, players };
      });
    });

    on('tile_effect', (data: TileEffect) => {
      // Board updates are now deferred — they arrive via tile_swap at end of turn
      // Activity item is added by GameScreen after movement animation completes
      setTileEffect(data);
      if (data.requiresChoice) {
        setPendingChoicePlayerId(data.playerId);
      }
    });

    on('tile_swap', (data: { sourceTileId: number; targetTileId: number | null; color: string; boardUpdates: { id: number; color: 'green' | 'red' | 'neutral'; category: string; effect: string }[] }) => {
      // Buffer board updates — they'll be applied after the swap animation completes
      // so the destination tile doesn't change color before the bubble arrives.
      if (data.boardUpdates && data.boardUpdates.length > 0) {
        pendingBoardUpdatesRef.current = data.boardUpdates;
      }
      // Trigger swap animation if there's a target tile
      if (data.targetTileId != null) {
        setTileSwapAnimation({
          sourceTileId: data.sourceTileId,
          targetTileId: data.targetTileId,
          color: data.color,
        });
      } else if (data.boardUpdates && data.boardUpdates.length > 0) {
        // No animation needed — apply updates immediately
        _applyBoardUpdates(data.boardUpdates);
      }
    });

    on('awaiting_choice', (data: TileEffect) => {
      setAwaitingChoice(data);
    });

    on('choice_resolved', (data: {
      playerId: string;
      playerName?: string;
      type: string;
      targetId: string;
      targetName: string;
      message: string;
      amount?: number;
      autoMarbles?: number;
      targetAutoMarbles?: number;
    }) => {
      setAwaitingChoice(null);
      setPendingChoicePlayerId(null);
      // Activity item + sound + animation for steal/give effects
      const isSteal = data.type === 'steal_points' || data.type === 'steal_marble';
      const isGive = data.type === 'give_points' || data.type === 'give_marble';
      if (isSteal || isGive) {
        SFX.stealEffect();
        Haptics.medium();
        const color: ActivityItem['color'] = isSteal ? 'red' : 'neutral';
        const now = Date.now();
        const actorName = data.playerName || 'Someone';
        const newItems: ActivityItem[] = [
          { id: `cr-${now}`, message: `${actorName}: ${data.message}`, color, timestamp: now },
        ];
        if (data.autoMarbles) {
          SFX.marbleGain();
          newItems.push({ id: `cr-am-${now}`, message: `\uD83D\uDD2E +${data.autoMarbles} marble from points!`, color: 'gold', timestamp: now + 1 });
        }
        if (data.targetAutoMarbles) {
          newItems.push({ id: `cr-tam-${now}`, message: `\uD83D\uDD2E ${data.targetName} +${data.targetAutoMarbles} marble from points!`, color: 'gold', timestamp: now + 2 });
        }
        setActivityFeed((prev) => [...prev, ...newItems]);
        // Trigger steal animation on the board
        if (isSteal) {
          setStealAnimation({
            fromPlayerId: data.targetId,
            toPlayerId: data.playerId,
            type: data.type === 'steal_marble' ? 'marble' : 'points',
            amount: data.amount,
          });
        } else {
          setStealAnimation({
            fromPlayerId: data.playerId,
            toPlayerId: data.targetId,
            type: data.type === 'give_marble' ? 'marble' : 'points',
            amount: data.amount,
          });
        }
      }
    });

    on('minigame_start', (data: MinigameInfo) => {
      setMinigameInfo(data);
      setPhase('minigame');
    });

    on('minigame_results', (data: MinigameResults) => {
      setMinigameResults(data);
      setMinigameInfo(null);
      // Transition back to 'playing' so the results overlay renders inside GameScreen.
      // turn_update arrives right after but must NOT clear minigameResults — the
      // overlay's own timer / user tap handles that.
      setPhase('playing');
      // Add activity entries for top finishers
      const now = Date.now();
      const newItems: ActivityItem[] = [];
      if (data.rankings.length > 0) {
        newItems.push({ id: `mg-w-${now}`, message: `🏆 ${data.rankings[0].name} won the minigame!`, color: 'gold', timestamp: now });
      }
      data.rankings.forEach((r) => {
        if (r.prizeMarbles > 0) {
          newItems.push({ id: `mg-m-${r.id}-${now}`, message: `🔮 ${r.name} earned a marble!`, color: 'gold', timestamp: now + 1 });
        }
        if (r.prizePoints > 0) {
          newItems.push({ id: `mg-p-${r.id}-${now}`, message: `⭐ ${r.name} +${r.prizePoints}pts`, color: 'green', timestamp: now + 2 });
        }
      });
      if (newItems.length > 0) {
        setActivityFeed((prev) => [...prev, ...newItems]);
      }
    });

    on('turn_update', (data: { currentTurnPlayerId: string; currentTurnIndex: number; turnNumber: number; players: GameState['players'] }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTurnPlayerId: data.currentTurnPlayerId,
          currentTurnIndex: data.currentTurnIndex,
          turnNumber: data.turnNumber,
          players: data.players,
        };
      });
      setDiceResult(null);
      setPendingChoicePlayerId(null);
      // Do NOT clear tileEffect or minigameResults here.
      // turn_update arrives almost immediately after these events, before the
      // player has seen the overlay. Each overlay auto-dismisses via its own
      // timer, or the player taps to close it.
      // Notify player it's their turn
      if (data.currentTurnPlayerId === playerIdRef.current) {
        SFX.yourTurn();
        Haptics.doublePulse();
      }
    });

    on('game_over', (data: { winnerId: string; players: GameState['players'] }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return { ...prev, winnerId: data.winnerId, state: 'finished', players: data.players };
      });
      setPhase('finished');
      SFX.gameOver();
      Haptics.success();
      sessionStorage.removeItem('ltm_session');
    });

    on('lobby_tap', (data: { playerId: string; emoji: string; x: number; y: number }) => {
      setLobbyTap(data);
    });

    on('game_ended', () => {
      // Host forcibly ended the game — reset all client state
      setGameState(null);
      setDiceResult(null);
      setTileEffect(null);
      setMinigameInfo(null);
      setMinigameResults(null);
      setAwaitingChoice(null);
      setMoveAnimation(null);
      setTileSwapAnimation(null);
      setActivityFeed([]);
      setLobby(null);
      setPlayerId(null);
      playerIdRef.current = null;
      setSessionId(null);
      setPhase('home');
      sessionStorage.removeItem('ltm_session');
    });

    return () => {
      clearTimeout(timeoutId);
      socket.disconnect();
    };
  }, []);

  const createSession = useCallback((name: string, targetMarbles: number) => {
    emitRef.current('create_session', { name, targetMarbles });
  }, []);

  const joinSession = useCallback((passphrase: string, name: string, role: string) => {
    emitRef.current('join_session', { passphrase, name, role });
  }, []);

  const startGame = useCallback(() => {
    emitRef.current('start_game', { sessionId });
  }, [sessionId]);

  const rollDice = useCallback(() => {
    emitRef.current('roll_dice', {});
  }, []);

  const chooseAdvantage = useCallback((roll: number) => {
    emitRef.current('choose_advantage', { roll });
  }, []);

  const chooseMove = useCallback((tileId: number, path?: number[]) => {
    emitRef.current('choose_move', { tileId, path: path || [] });
    // Don't clear diceResult here — GameScreen uses moveChosen to hide the
    // DiceOverlay immediately.  diceResult is cleared later by turn_update.
  }, []);

  const makeChoice = useCallback((choiceType: string, targetId: string, amount?: number) => {
    emitRef.current('make_choice', { choiceType, targetId, amount });
  }, []);

  const submitMinigameScore = useCallback((minigameId: string, score: number) => {
    emitRef.current('submit_minigame_score', { minigameId, score });
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearTileEffect = useCallback(() => setTileEffect(null), []);
  const clearMinigameResults = useCallback(() => {
    setMinigameResults(null);
    setPhase('playing');
  }, []);
  const clearMoveAnimation = useCallback(() => setMoveAnimation(null), []);
  const clearTileSwapAnimation = useCallback(() => {
    setTileSwapAnimation(null);
    // Apply deferred board updates now that the animation has completed
    if (pendingBoardUpdatesRef.current.length > 0) {
      _applyBoardUpdates(pendingBoardUpdatesRef.current);
      pendingBoardUpdatesRef.current = [];
    }
  }, [_applyBoardUpdates]);
  const clearStealAnimation = useCallback(() => setStealAnimation(null), []);
  const turnComplete = useCallback(() => {
    emitRef.current('turn_complete', {});
  }, []);
  const endGame = useCallback(() => {
    emitRef.current('end_game', {});
  }, []);

  const addCpuPlayer = useCallback(() => {
    emitRef.current('add_cpu_player', {});
  }, []);

  const removeCpuPlayer = useCallback((playerId: string) => {
    emitRef.current('remove_cpu_player', { playerId });
  }, []);

  const emitLobbyTap = useCallback((x: number, y: number) => {
    emitRef.current('lobby_tap', { x, y });
  }, []);

  // ── Diagnostics snapshot ──────────────────────────────────────────────────
  // Builds a JSON-serialisable object with recent event log, current UI
  // state, and player info — enough context to debug multiplayer issues.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const diceResultRef = useRef(diceResult);
  diceResultRef.current = diceResult;
  const tileEffectRef = useRef(tileEffect);
  tileEffectRef.current = tileEffect;
  const phaseStateRef = useRef(phase);
  phaseStateRef.current = phase;
  const activityFeedRef = useRef(activityFeed);
  activityFeedRef.current = activityFeed;
  const minigameResultsRef = useRef(minigameResults);
  minigameResultsRef.current = minigameResults;

  const getDiagnostics = useCallback(() => {
    const gs = gameStateRef.current;
    // Strip board tile data to keep size down — just include tile count
    const gameStateSummary = gs ? {
      sessionId: gs.sessionId,
      state: gs.state,
      targetMarbles: gs.targetMarbles,
      turnOrder: gs.turnOrder,
      currentTurnIndex: gs.currentTurnIndex,
      currentTurnPlayerId: gs.currentTurnPlayerId,
      turnNumber: gs.turnNumber,
      winnerId: gs.winnerId,
      boardTileCount: gs.board ? Object.keys(gs.board.tiles).length : 0,
      players: Object.fromEntries(
        Object.entries(gs.players).map(([id, p]) => {
          const pl = p as PlayerState;
          return [id, {
            name: pl.name,
            role: pl.role,
            token: pl.token ? { id: pl.token.id, emoji: pl.token.emoji } : null,
            currentTile: pl.currentTile,
            marbles: pl.marbles,
            points: pl.points,
            isConnected: pl.isConnected,
            isCpu: pl.isCpu,
            modifiers: pl.modifiers,
          }];
        }),
      ),
    } : null;

    return {
      capturedAt: new Date().toISOString(),
      playerId: playerIdRef.current,
      phase: phaseStateRef.current,
      gameState: gameStateSummary,
      uiState: {
        diceResult: diceResultRef.current,
        tileEffect: tileEffectRef.current,
        minigameResults: minigameResultsRef.current,
      },
      activityFeed: activityFeedRef.current.slice(-20),
      eventLog: eventLogRef.current.slice(),
    };
  }, []);

  return {
    connected,
    connectionError,
    phase,
    playerId,
    sessionId,
    lobby,
    gameState,
    diceResult,
    tileEffect,
    minigameInfo,
    minigameResults,
    error,
    awaitingChoice,
    moveAnimation,
    tileSwapAnimation,
    stealAnimation,
    activityFeed,
    addActivityItem: (message: string, color: ActivityItem['color']) => {
      setActivityFeed((prev) => [
        ...prev,
        { id: `te-${Date.now()}-${Math.random()}`, message, color, timestamp: Date.now() },
      ]);
    },
    pendingChoicePlayerId,
    createSession,
    joinSession,
    startGame,
    rollDice,
    chooseAdvantage,
    chooseMove,
    makeChoice,
    submitMinigameScore,
    clearError,
    clearTileEffect,
    clearMinigameResults,
    clearMoveAnimation,
    clearTileSwapAnimation,
    clearStealAnimation,
    turnComplete,
    endGame,
    addCpuPlayer,
    removeCpuPlayer,
    lobbyTap,
    emitLobbyTap,
    getDiagnostics,
  };
}
