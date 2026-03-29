"""Shared fixtures for game tests."""

import pytest
from app.game.state import GameSession, PlayerState, SessionManager
from app.board.generator import generate_board


@pytest.fixture
def session_manager():
    return SessionManager()


@pytest.fixture
def session():
    """A basic game session with 3 players, board generated, in playing state."""
    s = GameSession(id="test-session", passphrase="wobbly-penguin", target_marbles=10)
    board = generate_board(seed=42)
    s.board = board

    for i in range(3):
        p = PlayerState(
            id=f"player-{i}",
            sid=f"sid-{i}",
            name=f"Player {i}",
            role="player",
            token={"id": f"token-{i}", "name": f"Token {i}", "color": "#fff", "emoji": "?"},
            turn_order=i,
            current_tile=i,
            marbles=2,
            points=50,
        )
        s.players[p.id] = p

    s.turn_order = ["player-0", "player-1", "player-2"]
    s.current_turn_index = 0
    s.turn_number = 1
    s.state = "playing"
    s.host_id = "player-0"
    return s


@pytest.fixture
def player(session):
    return session.players["player-0"]


@pytest.fixture
def opponent(session):
    return session.players["player-1"]
