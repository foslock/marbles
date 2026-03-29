import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  GamePhase,
  LobbyData,
  GameState,
  DiceResult,
  TileEffect,
  BattleResult,
  MinigameInfo,
  MinigameResults,
} from '../types/game';
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
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [minigameInfo, setMinigameInfo] = useState<MinigameInfo | null>(null);
  const [minigameResults, setMinigameResults] = useState<MinigameResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingChoice, setAwaitingChoice] = useState<TileEffect | null>(null);
  const [moveAnimation, setMoveAnimation] = useState<{ playerId: string; path: number[] } | null>(null);

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
      setTileEffect(data);
    });

    socket.on('awaiting_choice', (data: TileEffect) => {
      setAwaitingChoice(data);
    });

    socket.on('choice_resolved', () => {
      setAwaitingChoice(null);
    });

    socket.on('battle_result', (data: BattleResult) => {
      setBattleResult(data);
      SFX.battleStart();
      Haptics.heavy();
    });

    socket.on('minigame_start', (data: MinigameInfo) => {
      setMinigameInfo(data);
      setPhase('minigame');
    });

    socket.on('minigame_results', (data: MinigameResults) => {
      setMinigameResults(data);
      setMinigameInfo(null);
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
      setTileEffect(null);
      setBattleResult(null);
      setMinigameResults(null);
      if (minigameInfo) setPhase('playing');
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

  const rollDice = useCallback((useReroll = false) => {
    socketRef.current?.emit('roll_dice', { useReroll });
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
  const clearBattleResult = useCallback(() => setBattleResult(null), []);
  const clearMinigameResults = useCallback(() => {
    setMinigameResults(null);
    setPhase('playing');
  }, []);
  const clearMoveAnimation = useCallback(() => setMoveAnimation(null), []);

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
    battleResult,
    minigameInfo,
    minigameResults,
    error,
    awaitingChoice,
    moveAnimation,
    createSession,
    joinSession,
    startGame,
    rollDice,
    chooseMove,
    makeChoice,
    submitMinigameScore,
    clearError,
    clearTileEffect,
    clearBattleResult,
    clearMinigameResults,
    clearMoveAnimation,
  };
}
