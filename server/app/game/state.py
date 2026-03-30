"""In-memory game state manager.

Keeps active session state in memory for fast Socket.IO interactions,
with periodic persistence to the database.
"""

import random
import uuid
from dataclasses import dataclass, field

from ..board.generator import Board, generate_board
from ..board.tokens import assign_tokens


@dataclass
class PlayerState:
    id: str
    sid: str  # socket.io session id
    name: str
    role: str  # "player" or "spectator"
    token: dict | None = None
    turn_order: int | None = None
    current_tile: int = 0
    marbles: int = 0
    points: int = 0
    is_connected: bool = True
    is_cpu: bool = False
    modifiers: dict = field(default_factory=lambda: {
        "advantage": 0,
        "protection": 0,
        "double_dice": 0,
        "short_stop": 0,
        "dizzy": 0,
    })


@dataclass
class GameSession:
    id: str
    passphrase: str
    host_id: str | None = None
    state: str = "lobby"  # lobby, playing, finished
    target_marbles: int = 5
    players: dict[str, PlayerState] = field(default_factory=dict)
    board: Board | None = None
    turn_order: list[str] = field(default_factory=list)
    current_turn_index: int = 0
    turn_number: int = 0
    board_seed: int | None = None
    winner_id: str | None = None

    @property
    def current_turn_player_id(self) -> str | None:
        if not self.turn_order:
            return None
        return self.turn_order[self.current_turn_index % len(self.turn_order)]

    def get_players(self) -> list[PlayerState]:
        return [p for p in self.players.values() if p.role == "player"]

    def get_spectators(self) -> list[PlayerState]:
        return [p for p in self.players.values() if p.role == "spectator"]

    def advance_turn(self):
        self.current_turn_index = (self.current_turn_index + 1) % len(self.turn_order)
        self.turn_number += 1

    def check_winner(self) -> PlayerState | None:
        for p in self.get_players():
            if p.marbles >= self.target_marbles:
                self.winner_id = p.id
                self.state = "finished"
                return p
        return None

    def to_lobby_dict(self) -> dict:
        return {
            "sessionId": self.id,
            "passphrase": self.passphrase,
            "hostId": self.host_id,
            "state": self.state,
            "targetMarbles": self.target_marbles,
            "players": [
                {
                    "id": p.id,
                    "name": p.name,
                    "role": p.role,
                    "token": p.token,
                    "isConnected": p.is_connected,
                    "isCpu": p.is_cpu,
                }
                for p in self.players.values()
            ],
        }

    def to_game_dict(self) -> dict:
        return {
            "sessionId": self.id,
            "hostId": self.host_id,
            "state": self.state,
            "targetMarbles": self.target_marbles,
            "board": self.board.to_dict() if self.board else None,
            "turnOrder": self.turn_order,
            "currentTurnIndex": self.current_turn_index,
            "currentTurnPlayerId": self.current_turn_player_id,
            "turnNumber": self.turn_number,
            "players": {
                p.id: {
                    "id": p.id,
                    "name": p.name,
                    "role": p.role,
                    "token": p.token,
                    "turnOrder": p.turn_order,
                    "currentTile": p.current_tile,
                    "marbles": p.marbles,
                    "points": p.points,
                    "isConnected": p.is_connected,
                    "isCpu": p.is_cpu,
                    "modifiers": p.modifiers,
                }
                for p in self.players.values()
            },
            "winnerId": self.winner_id,
        }


class SessionManager:
    """Manages all active game sessions in memory."""

    def __init__(self):
        self.sessions: dict[str, GameSession] = {}  # session_id -> GameSession
        self.passphrase_map: dict[str, str] = {}  # passphrase -> session_id
        self.sid_to_player: dict[str, tuple[str, str]] = {}  # socket_sid -> (session_id, player_id)

    def create_session(self, passphrase: str, target_marbles: int = 5) -> GameSession:
        session_id = str(uuid.uuid4())
        session = GameSession(
            id=session_id,
            passphrase=passphrase,
            target_marbles=target_marbles,
        )
        self.sessions[session_id] = session
        self.passphrase_map[passphrase] = session_id
        return session

    def get_session_by_passphrase(self, passphrase: str) -> GameSession | None:
        session_id = self.passphrase_map.get(passphrase)
        if session_id:
            return self.sessions.get(session_id)
        return None

    def get_session(self, session_id: str) -> GameSession | None:
        return self.sessions.get(session_id)

    def add_player(
        self, session_id: str, sid: str, name: str, role: str = "player"
    ) -> PlayerState | None:
        session = self.sessions.get(session_id)
        if not session:
            return None

        if role == "player" and session.state != "lobby":
            return None

        if role == "player" and len(session.get_players()) >= 10:
            return None

        if role == "spectator" and len(session.get_spectators()) >= 10:
            return None

        player_id = str(uuid.uuid4())
        player = PlayerState(id=player_id, sid=sid, name=name, role=role)
        session.players[player_id] = player
        self.sid_to_player[sid] = (session_id, player_id)

        if session.host_id is None and role == "player":
            session.host_id = player_id

        return player

    def remove_player_by_sid(self, sid: str) -> tuple[str, PlayerState] | None:
        mapping = self.sid_to_player.pop(sid, None)
        if not mapping:
            return None
        session_id, player_id = mapping
        session = self.sessions.get(session_id)
        if not session:
            return None
        player = session.players.get(player_id)
        if player:
            player.is_connected = False
            player.sid = ""
        return session_id, player

    def start_game(self, session_id: str) -> GameSession | None:
        session = self.sessions.get(session_id)
        if not session or session.state != "lobby":
            return None

        players = session.get_players()
        if len(players) < 2:
            return None

        # Assign tokens
        tokens = assign_tokens(len(players))
        for i, player in enumerate(players):
            player.token = tokens[i]

        # Random turn order
        player_ids = [p.id for p in players]
        random.shuffle(player_ids)
        session.turn_order = player_ids
        for i, pid in enumerate(player_ids):
            session.players[pid].turn_order = i

        # Generate board scaled to player count
        session.board_seed = random.randint(0, 999999)
        session.board = generate_board(seed=session.board_seed, player_count=len(players))

        # Assign random starting tiles (from main path, non-fork/merge)
        safe_tiles = [
            tid for tid, t in session.board.tiles.items()
            if not t.is_fork and not t.is_merge and tid < 35  # main path only
        ]
        random.shuffle(safe_tiles)
        for i, player in enumerate(players):
            player.current_tile = safe_tiles[i % len(safe_tiles)]

        session.state = "playing"
        session.current_turn_index = 0
        session.turn_number = 1

        return session

    def delete_session(self, session_id: str) -> list[str]:
        """Remove a session and return the SIDs of all its players for disconnection."""
        session = self.sessions.pop(session_id, None)
        if not session:
            return []

        self.passphrase_map.pop(session.passphrase, None)

        sids = []
        for player in session.players.values():
            if player.sid:
                self.sid_to_player.pop(player.sid, None)
                sids.append(player.sid)

        return sids


# Global singleton
session_manager = SessionManager()
