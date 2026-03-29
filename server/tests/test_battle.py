"""Tests for the tile-collision / minigame-trigger system."""

import pytest
from app.game.battle import check_for_battle


class TestCheckForBattle:
    def test_no_collision_alone(self, session, player):
        """No trigger when player is alone on tile."""
        result = check_for_battle(session, player)
        assert result is None

    def test_collision_two_players(self, session, player, opponent):
        """Two players on same tile → minigame, no bonus."""
        opponent.current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "minigame"
        assert len(result["participants"]) == 2
        assert result["bonus"] is False

    def test_bonus_three_players(self, session, player, opponent):
        """Three players on same tile → minigame with bonus flag."""
        opponent.current_tile = player.current_tile
        session.players["player-2"].current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "minigame"
        assert len(result["participants"]) == 3
        assert result["bonus"] is True

    def test_collision_two_player_game(self, session, player, opponent):
        """In a 2-player game, landing on opponent's tile still triggers minigame."""
        del session.players["player-2"]
        session.turn_order = ["player-0", "player-1"]
        opponent.current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "minigame"
        assert result["bonus"] is False

    def test_participants_include_mover(self, session, player, opponent):
        """The player who moved is always in participants list."""
        opponent.current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert player.id in result["participants"]

    def test_bonus_message_mentions_double(self, session, player, opponent):
        """Bonus round message communicates the 2× prize."""
        opponent.current_tile = player.current_tile
        session.players["player-2"].current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert "2×" in result["message"] or "bonus" in result["message"].lower()
