"""Tests for game state management."""

import pytest
from app.game.state import GameSession, PlayerState, SessionManager


class TestPlayerState:
    def test_default_modifiers(self):
        p = PlayerState(id="p1", sid="s1", name="Test", role="player")
        assert p.modifiers["rerolls"] == 0
        assert p.modifiers["protection"] == 0
        assert p.modifiers["double_dice"] == 0
        assert p.modifiers["worst_dice"] == 0

    def test_default_values(self):
        p = PlayerState(id="p1", sid="s1", name="Test", role="player")
        assert p.marbles == 0
        assert p.points == 0
        assert p.current_tile == 0
        assert p.is_connected is True
        assert p.token is None


class TestGameSession:
    def test_get_players_filters_spectators(self, session):
        spectator = PlayerState(id="spec-1", sid="sid-spec", name="Spectator", role="spectator")
        session.players["spec-1"] = spectator
        players = session.get_players()
        assert len(players) == 3
        assert all(p.role == "player" for p in players)

    def test_get_spectators(self, session):
        spectator = PlayerState(id="spec-1", sid="sid-spec", name="Spectator", role="spectator")
        session.players["spec-1"] = spectator
        spectators = session.get_spectators()
        assert len(spectators) == 1
        assert spectators[0].id == "spec-1"

    def test_current_turn_player_id(self, session):
        assert session.current_turn_player_id == "player-0"

    def test_current_turn_player_id_empty(self):
        s = GameSession(id="x", passphrase="x")
        assert s.current_turn_player_id is None

    def test_advance_turn(self, session):
        assert session.current_turn_player_id == "player-0"
        session.advance_turn()
        assert session.current_turn_player_id == "player-1"
        assert session.turn_number == 2

    def test_advance_turn_wraps(self, session):
        session.advance_turn()  # -> player-1
        session.advance_turn()  # -> player-2
        session.advance_turn()  # -> player-0 (wrap)
        assert session.current_turn_player_id == "player-0"
        assert session.turn_number == 4

    def test_check_winner_none(self, session):
        assert session.check_winner() is None
        assert session.state == "playing"

    def test_check_winner_found(self, session):
        session.players["player-1"].marbles = 10
        winner = session.check_winner()
        assert winner is not None
        assert winner.id == "player-1"
        assert session.state == "finished"
        assert session.winner_id == "player-1"

    def test_to_lobby_dict(self, session):
        d = session.to_lobby_dict()
        assert d["sessionId"] == "test-session"
        assert d["passphrase"] == "wobbly-penguin"
        assert d["hostId"] == "player-0"
        assert d["targetMarbles"] == 10
        assert len(d["players"]) == 3

    def test_to_game_dict(self, session):
        d = session.to_game_dict()
        assert d["sessionId"] == "test-session"
        assert d["state"] == "playing"
        assert d["board"] is not None
        assert d["turnNumber"] == 1
        assert d["currentTurnPlayerId"] == "player-0"
        assert "player-0" in d["players"]
        player_dict = d["players"]["player-0"]
        assert "marbles" in player_dict
        assert "modifiers" in player_dict


class TestSessionManager:
    def test_create_session(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon", 15)
        assert s.passphrase == "fuzzy-dragon"
        assert s.target_marbles == 15
        assert s.state == "lobby"

    def test_get_session_by_passphrase(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        found = session_manager.get_session_by_passphrase("fuzzy-dragon")
        assert found is not None
        assert found.id == s.id

    def test_get_session_by_passphrase_not_found(self, session_manager):
        assert session_manager.get_session_by_passphrase("nonexistent") is None

    def test_add_player(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        p = session_manager.add_player(s.id, "sid-1", "Alice", "player")
        assert p is not None
        assert p.name == "Alice"
        assert p.role == "player"
        assert s.host_id == p.id  # First player becomes host

    def test_add_player_second_not_host(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        p1 = session_manager.add_player(s.id, "sid-1", "Alice", "player")
        p2 = session_manager.add_player(s.id, "sid-2", "Bob", "player")
        assert s.host_id == p1.id  # First player stays host

    def test_add_spectator(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        p = session_manager.add_player(s.id, "sid-1", "Viewer", "spectator")
        assert p is not None
        assert p.role == "spectator"
        assert s.host_id is None  # Spectator doesn't become host

    def test_add_player_max_8(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        for i in range(8):
            p = session_manager.add_player(s.id, f"sid-{i}", f"P{i}", "player")
            assert p is not None
        # 9th player should be rejected
        p9 = session_manager.add_player(s.id, "sid-9", "P9", "player")
        assert p9 is None

    def test_add_player_invalid_session(self, session_manager):
        result = session_manager.add_player("nonexistent", "sid", "Name", "player")
        assert result is None

    def test_add_player_not_in_lobby(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        s.state = "playing"
        result = session_manager.add_player(s.id, "sid", "Name", "player")
        assert result is None

    def test_remove_player_by_sid(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        p = session_manager.add_player(s.id, "sid-1", "Alice", "player")
        result = session_manager.remove_player_by_sid("sid-1")
        assert result is not None
        session_id, player = result
        assert session_id == s.id
        assert player.is_connected is False
        assert player.sid == ""

    def test_remove_player_unknown_sid(self, session_manager):
        assert session_manager.remove_player_by_sid("unknown") is None

    def test_start_game(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        session_manager.add_player(s.id, "sid-1", "Alice", "player")
        session_manager.add_player(s.id, "sid-2", "Bob", "player")
        result = session_manager.start_game(s.id)
        assert result is not None
        assert result.state == "playing"
        assert result.board is not None
        assert len(result.turn_order) == 2
        assert result.turn_number == 1
        # Players should have tokens assigned
        for p in result.get_players():
            assert p.token is not None
            assert p.turn_order is not None

    def test_start_game_needs_2_players(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        session_manager.add_player(s.id, "sid-1", "Alice", "player")
        result = session_manager.start_game(s.id)
        assert result is None

    def test_start_game_not_lobby(self, session_manager):
        s = session_manager.create_session("fuzzy-dragon")
        s.state = "playing"
        result = session_manager.start_game(s.id)
        assert result is None
