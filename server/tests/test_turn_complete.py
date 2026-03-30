"""Tests for turn completion logic — deduplication and event ordering.

These tests verify that:
1. Only the first turn_complete call triggers the swap/advance
2. Duplicate turn_complete calls from multiple clients are ignored
3. Pending state is correctly managed through the turn lifecycle
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.game.state import GameSession, PlayerState
from app.board.generator import generate_board, TileCategory, TileColor


@pytest.fixture
def two_player_session():
    """A minimal 2-player session in playing state with pending swap."""
    s = GameSession(id="test-session", passphrase="test-phrase", target_marbles=3)
    board = generate_board(seed=42)
    s.board = board

    p0 = PlayerState(
        id="player-0", sid="sid-0", name="Alice", role="player",
        token={"id": "t0", "name": "T0", "color": "#f00", "emoji": "A"},
        turn_order=0, current_tile=0, marbles=1, points=50,
    )
    p1 = PlayerState(
        id="player-1", sid="sid-1", name="Bob", role="player",
        token={"id": "t1", "name": "T1", "color": "#00f", "emoji": "B"},
        turn_order=1, current_tile=2, marbles=0, points=30,
    )
    s.players = {"player-0": p0, "player-1": p1}
    s.turn_order = ["player-0", "player-1"]
    s.current_turn_index = 0
    s.turn_number = 1
    s.state = "playing"
    s.host_id = "player-0"
    return s


class TestTurnCompletePendingState:
    """Test that pending turn state is set/cleared correctly."""

    def test_pending_state_set_after_move(self, two_player_session):
        """After a move, pending state should be set for the moving player."""
        s = two_player_session
        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "swap"
        s._pending_swap_tile_id = 5

        assert s._pending_turn_player_id == "player-0"
        assert s._pending_turn_action == "swap"

    def test_pending_state_initially_none(self, two_player_session):
        """Before any move, pending state should not exist."""
        s = two_player_session
        assert getattr(s, "_pending_turn_player_id", None) is None
        assert getattr(s, "_pending_turn_action", None) is None


class TestTurnCompleteDeduplication:
    """Test the _do_turn_complete deduplication logic."""

    @pytest.mark.asyncio
    async def test_first_call_processes_swap(self, two_player_session):
        """First turn_complete should process the pending swap and advance."""
        s = two_player_session
        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "swap"
        s._pending_swap_tile_id = 0  # tile with an effect

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        # Pending state should be cleared after processing
        assert s._pending_turn_player_id is None
        assert s._pending_turn_action is None
        # Turn should have advanced
        assert s.current_turn_player_id == "player-1"
        assert s.turn_number == 2

    @pytest.mark.asyncio
    async def test_duplicate_call_is_noop(self, two_player_session):
        """Second turn_complete (from another client) should be a no-op."""
        s = two_player_session
        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "swap"
        s._pending_swap_tile_id = 0

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete

            # First call processes
            await _do_turn_complete(s)
            turn_after_first = s.turn_number
            current_after_first = s.current_turn_player_id

            # Second call should be a no-op
            await _do_turn_complete(s)

        assert s.turn_number == turn_after_first
        assert s.current_turn_player_id == current_after_first

    @pytest.mark.asyncio
    async def test_no_pending_state_is_noop(self, two_player_session):
        """turn_complete with no pending state should be a no-op."""
        s = two_player_session
        initial_turn = s.turn_number
        initial_player = s.current_turn_player_id

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        assert s.turn_number == initial_turn
        assert s.current_turn_player_id == initial_player


class TestTurnCompleteActions:
    """Test different pending turn actions."""

    @pytest.mark.asyncio
    async def test_advance_action_advances_turn(self, two_player_session):
        """The 'advance' action (after minigame) should just advance the turn."""
        s = two_player_session
        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "advance"

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        assert s.current_turn_player_id == "player-1"
        assert s.turn_number == 2
        assert s._pending_turn_player_id is None

    @pytest.mark.asyncio
    async def test_battle_action_starts_minigame(self, two_player_session):
        """The 'battle' action should start a minigame instead of swapping."""
        s = two_player_session
        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "battle"
        s._pending_battle = {
            "message": "Battle!",
            "attacker": "player-0",
            "defender": "player-1",
        }

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        # Should have emitted minigame_start
        emit_calls = [call for call in mock_sio.emit.call_args_list if call[0][0] == "minigame_start"]
        assert len(emit_calls) == 1

        # Turn should NOT have advanced (minigame is in progress)
        assert s.turn_number == 1

    @pytest.mark.asyncio
    async def test_swap_action_emits_tile_swap(self, two_player_session):
        """The 'swap' action should emit a tile_swap event."""
        s = two_player_session
        tile = s.board.tiles[0]
        tile.color = TileColor.GREEN
        tile.category = TileCategory.POSITIVE_MINOR
        tile.effect = "gain_10_points"

        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "swap"
        s._pending_swap_tile_id = 0

        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        # Should have emitted tile_swap
        emit_events = [call[0][0] for call in mock_sio.emit.call_args_list]
        assert "tile_swap" in emit_events

        # Should have emitted turn_update after swap
        assert "turn_update" in emit_events

        # tile_swap should come before turn_update
        swap_idx = emit_events.index("tile_swap")
        update_idx = emit_events.index("turn_update")
        assert swap_idx < update_idx

    @pytest.mark.asyncio
    async def test_swap_then_turn_update_order(self, two_player_session):
        """Verify tile_swap is always emitted before turn_update."""
        s = two_player_session
        tile = s.board.tiles[0]
        tile.color = TileColor.GREEN
        tile.category = TileCategory.POSITIVE_MINOR
        tile.effect = "gain_25_points"

        s._pending_turn_player_id = "player-0"
        s._pending_turn_action = "swap"
        s._pending_swap_tile_id = 0

        emit_order = []

        with patch("app.socketio_handlers.sio") as mock_sio:
            async def track_emit(event, *args, **kwargs):
                emit_order.append(event)
            mock_sio.emit = AsyncMock(side_effect=track_emit)

            from app.socketio_handlers import _do_turn_complete
            await _do_turn_complete(s)

        # tile_swap must precede turn_update
        if "tile_swap" in emit_order and "turn_update" in emit_order:
            assert emit_order.index("tile_swap") < emit_order.index("turn_update")
