"""Tests for the battle system."""

import pytest
from unittest.mock import patch
from app.game.battle import check_for_battle, resolve_dice_battle, PRIZE_DIE_OPTIONS


class TestCheckForBattle:
    def test_no_battle_alone(self, session, player):
        """No battle when player is alone on tile."""
        result = check_for_battle(session, player)
        assert result is None

    def test_dice_battle_two_on_tile_3plus_game(self, session, player, opponent):
        """2 players on same tile in 3+ player game -> dice battle."""
        opponent.current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "dice_battle"
        assert len(result["participants"]) == 2

    def test_minigame_three_on_tile(self, session, player, opponent):
        """3+ players on same tile -> minigame."""
        opponent.current_tile = player.current_tile
        session.players["player-2"].current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "minigame"
        assert len(result["participants"]) == 3

    def test_minigame_two_player_game(self, session, player, opponent):
        """In a 2-player game, same tile -> minigame (not dice battle)."""
        # Remove 3rd player
        del session.players["player-2"]
        session.turn_order = ["player-0", "player-1"]
        opponent.current_tile = player.current_tile
        result = check_for_battle(session, player)
        assert result is not None
        assert result["type"] == "minigame"


class TestResolveDiceBattle:
    def test_resolve_has_winner(self, session):
        result = resolve_dice_battle(session, "player-0", "player-1")
        assert result["winnerId"] in ("player-0", "player-1")
        assert result["loserId"] in ("player-0", "player-1")
        assert result["winnerId"] != result["loserId"]
        assert result["playerRoll"] != result["opponentRoll"]

    def test_prize_in_valid_range(self, session):
        result = resolve_dice_battle(session, "player-0", "player-1")
        assert result["prizeRoll"] in PRIZE_DIE_OPTIONS

    def test_actual_prize_capped(self, session):
        """Can't steal more points than the loser has."""
        session.players["player-0"].points = 5
        session.players["player-1"].points = 5
        result = resolve_dice_battle(session, "player-0", "player-1")
        assert result["actualPrize"] <= 5

    def test_points_transferred(self, session):
        p0_pts = session.players["player-0"].points
        p1_pts = session.players["player-1"].points
        total_before = p0_pts + p1_pts
        result = resolve_dice_battle(session, "player-0", "player-1")
        p0_after = session.players["player-0"].points
        p1_after = session.players["player-1"].points
        # Total points should be conserved (winner gains what loser loses)
        assert p0_after + p1_after == total_before

    @patch("app.game.battle.random.randint")
    def test_player_wins_on_higher_roll(self, mock_randint, session):
        # First two calls for player/opponent rolls, no tie
        mock_randint.side_effect = [6, 1]
        with patch("app.game.battle.random.choice", return_value=10):
            result = resolve_dice_battle(session, "player-0", "player-1")
        assert result["winnerId"] == "player-0"
        assert result["playerRoll"] == 6
        assert result["opponentRoll"] == 1
