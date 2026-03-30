"""Tests for session expiry in Socket.IO handlers.

Verifies that:
1. Reconnecting to an expired session emits session_expired and cleans up
2. Rolling dice on an expired session is blocked
3. The _check_session_valid helper works correctly
4. The get_global_stats handler returns aggregated in-memory stats
"""

import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.game.state import GameSession, PlayerState, SessionManager, SESSION_EXPIRY_SECONDS
from app.board.generator import generate_board


@pytest.fixture
def expired_session():
    """A session that has been inactive for over 4 hours."""
    s = GameSession(id="expired-session", passphrase="old-phrase", target_marbles=5)
    s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 100
    s.state = "playing"

    p0 = PlayerState(
        id="player-0", sid="sid-0", name="Alice", role="player",
        token={"id": "t0", "name": "T0", "color": "#f00", "emoji": "A"},
        turn_order=0, current_tile=0, marbles=2, points=50,
    )
    p1 = PlayerState(
        id="player-1", sid="sid-1", name="Bob", role="player",
        token={"id": "t1", "name": "T1", "color": "#00f", "emoji": "B"},
        turn_order=1, current_tile=2, marbles=1, points=30,
    )
    s.players = {"player-0": p0, "player-1": p1}
    s.turn_order = ["player-0", "player-1"]
    s.current_turn_index = 0
    s.turn_number = 5
    s.host_id = "player-0"
    s.board = generate_board(seed=42)
    return s


class TestCheckSessionValid:
    """Test the _check_session_valid helper."""

    @pytest.mark.asyncio
    async def test_valid_session_returns_true(self):
        s = GameSession(id="s1", passphrase="test")
        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _check_session_valid
            result = await _check_session_valid("sid-1", s)
        assert result is True
        mock_sio.emit.assert_not_called()

    @pytest.mark.asyncio
    async def test_expired_session_returns_false(self, expired_session):
        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _check_session_valid
            result = await _check_session_valid("sid-1", expired_session)
        assert result is False

    @pytest.mark.asyncio
    async def test_expired_session_emits_session_expired(self, expired_session):
        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _check_session_valid
            await _check_session_valid("sid-1", expired_session)

        mock_sio.emit.assert_called_once()
        call_args = mock_sio.emit.call_args
        assert call_args[0][0] == "session_expired"
        assert "expired" in call_args[0][1]["message"].lower()

    @pytest.mark.asyncio
    async def test_none_session_returns_true(self):
        """None session should return True (let the caller handle the None check)."""
        with patch("app.socketio_handlers.sio") as mock_sio:
            mock_sio.emit = AsyncMock()
            from app.socketio_handlers import _check_session_valid
            result = await _check_session_valid("sid-1", None)
        assert result is True


class TestReconnectExpiredSession:
    """Test that reconnecting to an expired session is handled gracefully."""

    @pytest.mark.asyncio
    async def test_reconnect_expired_session_emits_expired(self, expired_session):
        """Reconnecting to an expired session should emit session_expired."""
        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager") as mock_mgr:
            mock_sio.emit = AsyncMock()
            mock_sio.close_room = AsyncMock()
            mock_mgr.get_session_by_passphrase.return_value = expired_session
            mock_mgr.delete_session.return_value = []

            from app.socketio_handlers import reconnect_session
            await reconnect_session("new-sid", {
                "passphrase": "old-phrase",
                "playerId": "player-0",
            })

        # Should emit session_expired
        emit_calls = mock_sio.emit.call_args_list
        events = [c[0][0] for c in emit_calls]
        assert "session_expired" in events

    @pytest.mark.asyncio
    async def test_reconnect_expired_session_cleans_up(self, expired_session):
        """Expired session should be deleted after reconnect attempt."""
        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager") as mock_mgr:
            mock_sio.emit = AsyncMock()
            mock_sio.close_room = AsyncMock()
            mock_mgr.get_session_by_passphrase.return_value = expired_session
            mock_mgr.delete_session.return_value = []

            from app.socketio_handlers import reconnect_session
            await reconnect_session("new-sid", {
                "passphrase": "old-phrase",
                "playerId": "player-0",
            })

        mock_mgr.delete_session.assert_called_once_with(expired_session.id)
        mock_sio.close_room.assert_called_once_with(expired_session.id)

    @pytest.mark.asyncio
    async def test_reconnect_not_found_session(self):
        """Reconnecting to a nonexistent session should emit error."""
        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager") as mock_mgr:
            mock_sio.emit = AsyncMock()
            mock_mgr.get_session_by_passphrase.return_value = None

            from app.socketio_handlers import reconnect_session
            await reconnect_session("sid-1", {
                "passphrase": "nonexistent",
                "playerId": "player-0",
            })

        mock_sio.emit.assert_called_once()
        call_args = mock_sio.emit.call_args
        assert call_args[0][0] == "error"
        assert "not found" in call_args[0][1]["message"].lower()

    @pytest.mark.asyncio
    async def test_reconnect_valid_session_succeeds(self):
        """Reconnecting to a valid session should restore the player."""
        valid_session = GameSession(id="valid-session", passphrase="good-phrase")
        valid_session.state = "playing"
        p = PlayerState(id="player-0", sid="", name="Alice", role="player", is_connected=False)
        valid_session.players["player-0"] = p

        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager") as mock_mgr, \
             patch("app.socketio_handlers._persist_session", new_callable=AsyncMock):
            mock_sio.emit = AsyncMock()
            mock_sio.enter_room = AsyncMock()
            mock_mgr.get_session_by_passphrase.return_value = valid_session
            mock_mgr.sid_to_player = {}

            from app.socketio_handlers import reconnect_session
            await reconnect_session("new-sid", {
                "passphrase": "good-phrase",
                "playerId": "player-0",
            })

        # Should emit joined_session (not error or session_expired)
        emit_calls = mock_sio.emit.call_args_list
        events = [c[0][0] for c in emit_calls]
        assert "joined_session" in events
        assert "session_expired" not in events
        assert "error" not in events


class TestRollDiceExpiredGuard:
    """Test that roll_dice rejects expired sessions."""

    @pytest.mark.asyncio
    async def test_roll_dice_blocked_on_expired_session(self, expired_session):
        """Rolling dice on an expired session should emit session_expired."""
        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager") as mock_mgr:
            mock_sio.emit = AsyncMock()
            mock_mgr.sid_to_player = {"sid-0": (expired_session.id, "player-0")}
            mock_mgr.get_session.return_value = expired_session

            from app.socketio_handlers import roll_dice
            await roll_dice("sid-0", {})

        # Should emit session_expired, NOT dice_rolled
        emit_calls = mock_sio.emit.call_args_list
        events = [c[0][0] for c in emit_calls]
        assert "session_expired" in events
        assert "dice_rolled" not in events


class TestGetGlobalStatsHandler:
    """Test the get_global_stats event handler (in-memory portion)."""

    @pytest.mark.asyncio
    async def test_returns_in_memory_stats(self):
        """Should return aggregated stats from in-memory sessions."""
        mgr = SessionManager()
        s = mgr.create_session("stats-test")
        s.players["p1"] = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=3, points=75)
        s.players["p2"] = PlayerState(id="p2", sid="s2", name="Bob", role="player", marbles=1, points=25)

        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager", mgr):
            mock_sio.emit = AsyncMock()

            from app.socketio_handlers import get_global_stats
            await get_global_stats("sid-test", {})

        mock_sio.emit.assert_called()
        # Find the global_stats emit
        for call in mock_sio.emit.call_args_list:
            if call[0][0] == "global_stats":
                data = call[0][1]
                assert data["totalMarbles"] >= 4
                assert data["totalPoints"] >= 100
                break
        else:
            pytest.fail("global_stats event not emitted")

    @pytest.mark.asyncio
    async def test_empty_stats(self):
        """Empty manager should return zeros."""
        mgr = SessionManager()

        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager", mgr):
            mock_sio.emit = AsyncMock()

            from app.socketio_handlers import get_global_stats
            await get_global_stats("sid-test", {})

        for call in mock_sio.emit.call_args_list:
            if call[0][0] == "global_stats":
                data = call[0][1]
                assert data["totalMarbles"] >= 0
                assert data["totalPoints"] >= 0
                break
        else:
            pytest.fail("global_stats event not emitted")

    @pytest.mark.asyncio
    async def test_spectators_excluded_from_stats(self):
        """Spectator marbles/points should not be counted."""
        mgr = SessionManager()
        s = mgr.create_session("stats-test")
        s.players["p1"] = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=5, points=50)
        s.players["sp1"] = PlayerState(id="sp1", sid="ss1", name="Viewer", role="spectator", marbles=99, points=999)

        with patch("app.socketio_handlers.sio") as mock_sio, \
             patch("app.socketio_handlers.session_manager", mgr):
            mock_sio.emit = AsyncMock()

            from app.socketio_handlers import get_global_stats
            await get_global_stats("sid-test", {})

        for call in mock_sio.emit.call_args_list:
            if call[0][0] == "global_stats":
                data = call[0][1]
                # Should only have player stats, not spectator
                assert data["totalMarbles"] >= 5
                # Should NOT include spectator's 99 marbles
                assert data["totalMarbles"] < 50
                break
        else:
            pytest.fail("global_stats event not emitted")
