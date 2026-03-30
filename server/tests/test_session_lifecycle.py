"""Tests for session lifecycle: expiration, cleanup, activity tracking, and global stats."""

import time
import pytest
from unittest.mock import patch

from app.game.state import (
    GameSession,
    PlayerState,
    SessionManager,
    SESSION_EXPIRY_SECONDS,
)


class TestSessionActivity:
    """Test last_activity tracking and touch()."""

    def test_new_session_has_last_activity(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        assert s.last_activity > 0
        assert time.time() - s.last_activity < 1

    def test_touch_updates_last_activity(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        old_time = s.last_activity
        # Force a small gap
        s.last_activity = old_time - 10
        s.touch()
        assert s.last_activity > old_time - 10
        assert time.time() - s.last_activity < 1

    def test_touch_is_idempotent(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        s.touch()
        t1 = s.last_activity
        s.touch()
        t2 = s.last_activity
        assert t2 >= t1


class TestSessionExpiration:
    """Test is_expired() and expiry constant."""

    def test_expiry_constant_is_4_hours(self):
        assert SESSION_EXPIRY_SECONDS == 4 * 60 * 60

    def test_new_session_not_expired(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        assert not s.is_expired()

    def test_recently_touched_session_not_expired(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        s.touch()
        assert not s.is_expired()

    def test_session_expired_after_4_hours(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        assert s.is_expired()

    def test_session_not_expired_just_before_threshold(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS + 60
        assert not s.is_expired()

    def test_touch_resets_expiry(self):
        s = GameSession(id="s1", passphrase="test-phrase")
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        assert s.is_expired()
        s.touch()
        assert not s.is_expired()


class TestGetExpiredSessions:
    """Test SessionManager.get_expired_sessions()."""

    def test_no_expired_sessions(self, session_manager):
        session_manager.create_session("active-game")
        assert session_manager.get_expired_sessions() == []

    def test_expired_session_returned(self, session_manager):
        s = session_manager.create_session("old-game")
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        expired = session_manager.get_expired_sessions()
        assert len(expired) == 1
        assert expired[0].id == s.id

    def test_finished_sessions_excluded(self, session_manager):
        s = session_manager.create_session("done-game")
        s.state = "finished"
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        assert session_manager.get_expired_sessions() == []

    def test_mixed_active_and_expired(self, session_manager):
        s1 = session_manager.create_session("active-game")
        s2 = session_manager.create_session("old-game")
        s2.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        s3 = session_manager.create_session("another-active")

        expired = session_manager.get_expired_sessions()
        assert len(expired) == 1
        assert expired[0].id == s2.id

    def test_multiple_expired_sessions(self, session_manager):
        s1 = session_manager.create_session("old-1")
        s1.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 100
        s2 = session_manager.create_session("old-2")
        s2.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 200

        expired = session_manager.get_expired_sessions()
        assert len(expired) == 2

    def test_lobby_sessions_can_expire(self, session_manager):
        s = session_manager.create_session("stale-lobby")
        s.state = "lobby"
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        expired = session_manager.get_expired_sessions()
        assert len(expired) == 1

    def test_playing_sessions_can_expire(self, session_manager):
        s = session_manager.create_session("stale-game")
        s.state = "playing"
        s.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1
        expired = session_manager.get_expired_sessions()
        assert len(expired) == 1


class TestGetAllPlayerStats:
    """Test SessionManager.get_all_player_stats()."""

    def test_empty_manager_returns_zeros(self, session_manager):
        stats = session_manager.get_all_player_stats()
        assert stats == {"totalMarbles": 0, "totalPoints": 0}

    def test_single_session_stats(self, session_manager):
        s = session_manager.create_session("stats-game")
        p1 = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=3, points=50)
        p2 = PlayerState(id="p2", sid="s2", name="Bob", role="player", marbles=1, points=25)
        s.players["p1"] = p1
        s.players["p2"] = p2

        stats = session_manager.get_all_player_stats()
        assert stats["totalMarbles"] == 4
        assert stats["totalPoints"] == 75

    def test_spectators_excluded(self, session_manager):
        s = session_manager.create_session("stats-game")
        p1 = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=3, points=50)
        spec = PlayerState(id="sp1", sid="ss1", name="Viewer", role="spectator", marbles=99, points=999)
        s.players["p1"] = p1
        s.players["sp1"] = spec

        stats = session_manager.get_all_player_stats()
        assert stats["totalMarbles"] == 3
        assert stats["totalPoints"] == 50

    def test_multiple_sessions_aggregated(self, session_manager):
        s1 = session_manager.create_session("game-1")
        p1 = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=2, points=30)
        s1.players["p1"] = p1

        s2 = session_manager.create_session("game-2")
        p2 = PlayerState(id="p2", sid="s2", name="Bob", role="player", marbles=5, points=70)
        s2.players["p2"] = p2

        stats = session_manager.get_all_player_stats()
        assert stats["totalMarbles"] == 7
        assert stats["totalPoints"] == 100

    def test_zero_marbles_and_points(self, session_manager):
        s = session_manager.create_session("empty-game")
        p = PlayerState(id="p1", sid="s1", name="Alice", role="player", marbles=0, points=0)
        s.players["p1"] = p

        stats = session_manager.get_all_player_stats()
        assert stats["totalMarbles"] == 0
        assert stats["totalPoints"] == 0


class TestDeleteSessionCleanup:
    """Test that delete_session properly cleans up all mappings."""

    def test_delete_removes_passphrase_mapping(self, session_manager):
        s = session_manager.create_session("delete-me")
        session_manager.delete_session(s.id)
        assert session_manager.get_session_by_passphrase("delete-me") is None

    def test_delete_removes_session(self, session_manager):
        s = session_manager.create_session("delete-me")
        session_manager.delete_session(s.id)
        assert session_manager.get_session(s.id) is None

    def test_delete_cleans_sid_mappings(self, session_manager):
        s = session_manager.create_session("delete-me")
        session_manager.add_player(s.id, "sid-1", "Alice", "player")
        session_manager.add_player(s.id, "sid-2", "Bob", "player")

        sids = session_manager.delete_session(s.id)
        assert "sid-1" in sids
        assert "sid-2" in sids
        assert "sid-1" not in session_manager.sid_to_player
        assert "sid-2" not in session_manager.sid_to_player

    def test_delete_nonexistent_session(self, session_manager):
        sids = session_manager.delete_session("nonexistent")
        assert sids == []


class TestSessionIsolation:
    """Test that multiple concurrent sessions don't interact."""

    def test_sessions_have_independent_state(self, session_manager):
        s1 = session_manager.create_session("game-1")
        s2 = session_manager.create_session("game-2")

        session_manager.add_player(s1.id, "sid-a1", "Alice", "player")
        session_manager.add_player(s2.id, "sid-b1", "Bob", "player")

        assert len(s1.get_players()) == 1
        assert len(s2.get_players()) == 1
        assert s1.get_players()[0].name == "Alice"
        assert s2.get_players()[0].name == "Bob"

    def test_sid_maps_to_correct_session(self, session_manager):
        s1 = session_manager.create_session("game-1")
        s2 = session_manager.create_session("game-2")

        session_manager.add_player(s1.id, "sid-a", "Alice", "player")
        session_manager.add_player(s2.id, "sid-b", "Bob", "player")

        mapping_a = session_manager.sid_to_player.get("sid-a")
        mapping_b = session_manager.sid_to_player.get("sid-b")
        assert mapping_a[0] == s1.id
        assert mapping_b[0] == s2.id

    def test_deleting_one_session_doesnt_affect_other(self, session_manager):
        s1 = session_manager.create_session("game-1")
        s2 = session_manager.create_session("game-2")

        session_manager.add_player(s1.id, "sid-a", "Alice", "player")
        session_manager.add_player(s2.id, "sid-b", "Bob", "player")

        session_manager.delete_session(s1.id)

        assert session_manager.get_session(s2.id) is not None
        assert session_manager.get_session_by_passphrase("game-2") is not None
        assert "sid-b" in session_manager.sid_to_player

    def test_expiring_one_session_leaves_active_intact(self, session_manager):
        s1 = session_manager.create_session("old-game")
        s1.last_activity = time.time() - SESSION_EXPIRY_SECONDS - 1

        s2 = session_manager.create_session("active-game")

        expired = session_manager.get_expired_sessions()
        assert len(expired) == 1
        assert expired[0].id == s1.id
        assert not s2.is_expired()

    def test_concurrent_games_independent_turn_state(self, session_manager):
        s1 = session_manager.create_session("game-1")
        s2 = session_manager.create_session("game-2")

        for i in range(2):
            s1.players[f"p1-{i}"] = PlayerState(id=f"p1-{i}", sid=f"s1-{i}", name=f"P1-{i}", role="player")
            s2.players[f"p2-{i}"] = PlayerState(id=f"p2-{i}", sid=f"s2-{i}", name=f"P2-{i}", role="player")

        s1.turn_order = ["p1-0", "p1-1"]
        s2.turn_order = ["p2-0", "p2-1"]
        s1.current_turn_index = 0
        s2.current_turn_index = 0

        s1.advance_turn()
        assert s1.current_turn_player_id == "p1-1"
        assert s2.current_turn_player_id == "p2-0"  # Unaffected
