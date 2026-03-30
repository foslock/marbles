import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  GamePhase,
  LobbyData,
  GameState,
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

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);
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
            socket.emit('reconnect_session', { passphrase, playerId: savedPlayerId });
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
    socket.on('error', (data: { message: string }) => setError(data.message));

    socket.on('session_created', (data) => {
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

    socket.on('joined_session', (data) => {
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

    socket.on('lobby_update', (data: LobbyData) => {
      setLobby(data);
    });

    socket.on('game_started', (data: GameState) => {
      setGameState(data);
      setPhase('playing');
    });

    socket.on('game_state', (data: GameState) => {
      setGameState(data);
      if (data.state === 'playing') setPhase('playing');
    });

    socket.on('dice_rolled', (data: DiceResult) => {
      setDiceResult(data);
    });

    socket.on('advantage_chosen', (data: { playerId: string; roll: number; reachableTiles: { tileId: number; path: number[] }[]; dizzy?: boolean }) => {
      // Update the dice result with the chosen roll and reachable tiles
      setDiceResult((prev) => {
        if (!prev || prev.playerId !== data.playerId) return prev;
        return { ...prev, roll: data.roll, reachableTiles: data.reachableTiles, dizzy: data.dizzy };
      });
    });

    socket.on('player_moved', (data) => {
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

    socket.on('tile_effect', (data: TileEffect) => {
      // Board updates are now deferred — they arrive via tile_swap at end of turn
      // Activity item is added by GameScreen after movement animation completes
      setTileEffect(data);
    });

    socket.on('tile_swap', (data: { sourceTileId: number; targetTileId: number | null; color: string; boardUpdates: { id: number; color: 'green' | 'red' | 'neutral'; category: string; effect: string }[] }) => {
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

    socket.on('awaiting_choice', (data: TileEffect) => {
      setAwaitingChoice(data);
    });

    socket.on('choice_resolved', (data: {
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

    socket.on('minigame_start', (data: MinigameInfo) => {
      setMinigameInfo(data);
      setPhase('minigame');
    });

    socket.on('minigame_results', (data: MinigameResults) => {
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

    socket.on('turn_update', (data) => {
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

    socket.on('game_over', (data) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return { ...prev, winnerId: data.winnerId, state: 'finished', players: data.players };
      });
      setPhase('finished');
      SFX.gameOver();
      Haptics.success();
      sessionStorage.removeItem('ltm_session');
    });

    socket.on('game_ended', () => {
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
    socketRef.current?.emit('create_session', { name, targetMarbles });
  }, []);

  const joinSession = useCallback((passphrase: string, name: string, role: string) => {
    socketRef.current?.emit('join_session', { passphrase, name, role });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start_game', { sessionId });
  }, [sessionId]);

  const rollDice = useCallback(() => {
    socketRef.current?.emit('roll_dice', {});
  }, []);

  const chooseAdvantage = useCallback((roll: number) => {
    socketRef.current?.emit('choose_advantage', { roll });
  }, []);

  const chooseMove = useCallback((tileId: number, path?: number[]) => {
    socketRef.current?.emit('choose_move', { tileId, path: path || [] });
    setDiceResult(null);
  }, []);

  const makeChoice = useCallback((choiceType: string, targetId: string, amount?: number) => {
    socketRef.current?.emit('make_choice', { choiceType, targetId, amount });
  }, []);

  const submitMinigameScore = useCallback((minigameId: string, score: number) => {
    socketRef.current?.emit('submit_minigame_score', { minigameId, score });
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
    socketRef.current?.emit('turn_complete', {});
  }, []);
  const endGame = useCallback(() => {
    socketRef.current?.emit('end_game', {});
  }, []);

  const addCpuPlayer = useCallback(() => {
    socketRef.current?.emit('add_cpu_player', {});
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
  };
}
