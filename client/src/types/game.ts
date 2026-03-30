export interface Token {
  id: string;
  name: string;
  description: string;
  color: string;
  emoji: string;
}

export interface PlayerState {
  id: string;
  name: string;
  role: 'player' | 'spectator';
  token: Token | null;
  turnOrder: number | null;
  currentTile: number;
  marbles: number;
  points: number;
  isConnected: boolean;
  isCpu?: boolean;
  modifiers: {
    advantage: number;
    protection: number;
    double_dice: number;
    short_stop: number;
    dizzy: number;
  };
}

export interface TileData {
  id: number;
  x: number;
  y: number;
  category: string;
  color: 'green' | 'red' | 'neutral';
  effect: string;
  neighbors: number[];
  isFork: boolean;
  isMerge: boolean;
}

export interface BoardData {
  width: number;
  height: number;
  tiles: Record<string, TileData>;
}

export interface LobbyData {
  sessionId: string;
  passphrase: string;
  hostId: string;
  state: string;
  targetMarbles: number;
  players: {
    id: string;
    name: string;
    role: string;
    token: Token | null;
    isConnected: boolean;
    isCpu?: boolean;
  }[];
}

export interface GameState {
  sessionId: string;
  hostId: string | null;
  state: string;
  targetMarbles: number;
  board: BoardData | null;
  turnOrder: string[];
  currentTurnIndex: number;
  currentTurnPlayerId: string;
  turnNumber: number;
  players: Record<string, PlayerState>;
  winnerId: string | null;
}

export interface DiceResult {
  playerId: string;
  playerName: string;
  roll: number;
  dice: number[];
  type: 'normal' | 'double' | 'advantage';
  reachableTiles: { tileId: number; path: number[] }[];
  shortStop?: boolean;
  dizzy?: boolean;
}

export interface TileEffect {
  playerId: string;
  playerName: string;
  type: string;
  category: string;
  color: string;
  message: string;
  requiresChoice?: boolean;
  choiceType?: string;
  options?: { id: string; name: string; marbles?: number; points?: number }[];
  blocked?: boolean;
  visualEffect?: string;
  autoMarbles?: number;
  boardUpdates?: { id: number; color: 'green' | 'red' | 'neutral'; category: string; effect: string }[];
}

export interface MinigameInfo {
  minigame: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    duration: number;
    type: string;
    config?: Record<string, unknown>;
  };
  participants: string[];
  message: string;
  /** True when 3+ players share the tile — prizes are doubled. */
  bonus?: boolean;
}

export interface MinigameResults {
  rankings: {
    id: string;
    name: string;
    score: number;
    rank: number;
    prizePoints: number;
    prizeMarbles: number;
  }[];
  marbleBonus: boolean;
  /** True when this was a bonus round (3+ players on same tile). */
  bonus?: boolean;
}

export type GamePhase = 'home' | 'lobby' | 'playing' | 'minigame' | 'finished';

export interface ActivityItem {
  id: string;
  message: string;
  color: 'green' | 'red' | 'gold' | 'neutral';
  timestamp: number;
}
