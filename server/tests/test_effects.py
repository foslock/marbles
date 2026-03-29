"""Tests for tile effect processing."""

import pytest
from app.game.effects import process_tile_effect, apply_choice_effect, swap_tile_effect, POINTS_PER_MARBLE
from app.board.generator import TileCategory, TileColor


class TestProcessTileEffect:
    def _set_tile_effect(self, session, player, effect, category, color):
        """Helper: set the tile the player is on to a specific effect."""
        tile = session.board.tiles[player.current_tile]
        tile.effect = effect
        tile.category = category
        tile.color = color

    def test_gain_10_points(self, session, player):
        self._set_tile_effect(session, player, "gain_10_points", TileCategory.POSITIVE_MINOR, TileColor.GREEN)
        initial = player.points
        result = process_tile_effect(session, player)
        assert result["type"] == "gain_10_points"
        assert player.points == initial + 10
        assert result["color"] == "green"

    def test_gain_25_points(self, session, player):
        self._set_tile_effect(session, player, "gain_25_points", TileCategory.POSITIVE_MINOR, TileColor.GREEN)
        initial = player.points
        result = process_tile_effect(session, player)
        assert player.points == initial + 25

    def test_gain_50_points(self, session, player):
        self._set_tile_effect(session, player, "gain_50_points", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        player.points = 20  # Start low to avoid auto-marble conversion
        result = process_tile_effect(session, player)
        assert player.points == 70

    def test_gain_marble(self, session, player):
        self._set_tile_effect(session, player, "gain_marble", TileCategory.POSITIVE_MAJOR, TileColor.GREEN)
        initial = player.marbles
        result = process_tile_effect(session, player)
        assert player.marbles == initial + 1
        assert result["marblesGained"] == 1

    def test_reroll(self, session, player):
        self._set_tile_effect(session, player, "reroll", TileCategory.POSITIVE_MINOR, TileColor.GREEN)
        result = process_tile_effect(session, player)
        assert player.modifiers["rerolls"] == 1

    def test_protection(self, session, player):
        self._set_tile_effect(session, player, "protection", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        result = process_tile_effect(session, player)
        assert player.modifiers["protection"] == 1

    def test_double_dice(self, session, player):
        self._set_tile_effect(session, player, "double_dice_next", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        result = process_tile_effect(session, player)
        assert player.modifiers["double_dice"] == 1

    def test_lose_10_points(self, session, player):
        self._set_tile_effect(session, player, "lose_10_points", TileCategory.NEGATIVE_MINOR, TileColor.RED)
        player.points = 50
        result = process_tile_effect(session, player)
        assert player.points == 40

    def test_lose_points_cant_go_negative(self, session, player):
        self._set_tile_effect(session, player, "lose_50_points", TileCategory.NEGATIVE_MEDIUM, TileColor.RED)
        player.points = 20
        result = process_tile_effect(session, player)
        assert player.points == 0

    def test_lose_marble(self, session, player):
        self._set_tile_effect(session, player, "lose_marble", TileCategory.NEGATIVE_MAJOR, TileColor.RED)
        player.marbles = 3
        result = process_tile_effect(session, player)
        assert player.marbles == 2

    def test_lose_marble_at_zero(self, session, player):
        self._set_tile_effect(session, player, "lose_marble", TileCategory.NEGATIVE_MAJOR, TileColor.RED)
        player.marbles = 0
        result = process_tile_effect(session, player)
        assert player.marbles == 0
        assert "none" not in result["message"].lower() or "lucky" in result["message"].lower()

    def test_worst_dice(self, session, player):
        self._set_tile_effect(session, player, "worst_dice_next", TileCategory.NEGATIVE_MEDIUM, TileColor.RED)
        result = process_tile_effect(session, player)
        assert player.modifiers["worst_dice"] == 1

    def test_short_stop(self, session, player):
        self._set_tile_effect(session, player, "short_stop", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        result = process_tile_effect(session, player)
        assert player.modifiers["short_stop"] == 1
        assert result["type"] == "short_stop"

    def test_short_stop_stacks(self, session, player):
        player.modifiers["short_stop"] = 1
        self._set_tile_effect(session, player, "short_stop", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        process_tile_effect(session, player)
        assert player.modifiers["short_stop"] == 2

    def test_dizzy(self, session, player):
        self._set_tile_effect(session, player, "dizzy", TileCategory.NEGATIVE_MEDIUM, TileColor.RED)
        result = process_tile_effect(session, player)
        assert player.modifiers["dizzy"] == 1
        assert result["type"] == "dizzy"

    def test_dizzy_blocked_by_protection(self, session, player):
        player.modifiers["protection"] = 1
        self._set_tile_effect(session, player, "dizzy", TileCategory.NEGATIVE_MEDIUM, TileColor.RED)
        result = process_tile_effect(session, player)
        assert result["blocked"] is True
        assert player.modifiers["dizzy"] == 0
        assert player.modifiers["protection"] == 0

    def test_fortune_cookie(self, session, player):
        self._set_tile_effect(session, player, "fortune_cookie", TileCategory.NEUTRAL, TileColor.NEUTRAL)
        result = process_tile_effect(session, player)
        assert result["type"] == "fortune_cookie"
        assert result["message"]  # Should have a fortune message
        assert result.get("visualEffect") is not None

    def test_protection_blocks_red_tile(self, session, player):
        player.modifiers["protection"] = 1
        self._set_tile_effect(session, player, "lose_50_points", TileCategory.NEGATIVE_MEDIUM, TileColor.RED)
        initial_points = player.points
        result = process_tile_effect(session, player)
        assert result["blocked"] is True
        assert player.points == initial_points  # No points lost
        assert player.modifiers["protection"] == 0  # Protection consumed

    def test_auto_marble_conversion(self, session, player):
        player.points = 40  # 40 + 60 = 100 -> 1 marble
        self._set_tile_effect(session, player, "gain_50_points", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        # Another gain to push past 100
        player.points = 60
        initial_marbles = player.marbles
        result = process_tile_effect(session, player)
        # 60 + 50 = 110 -> 1 marble, 10 points remaining
        assert player.marbles == initial_marbles + 1
        assert player.points == 10
        assert result["autoMarbles"] == 1

    def test_steal_points_requires_choice(self, session, player):
        self._set_tile_effect(session, player, "steal_points", TileCategory.POSITIVE_MEDIUM, TileColor.GREEN)
        result = process_tile_effect(session, player)
        assert result["requiresChoice"] is True
        assert result["choiceType"] == "steal_points"
        assert len(result["options"]) == 2  # Other 2 players

    def test_no_board_returns_none(self, session, player):
        session.board = None
        result = process_tile_effect(session, player)
        assert result["type"] == "none"

    def test_tile_effect_reveals_tile(self, session, player):
        """process_tile_effect should reveal the tile (swap is deferred)."""
        tile = session.board.tiles[player.current_tile]
        tile.effect = "gain_10_points"
        tile.category = TileCategory.POSITIVE_MINOR
        tile.color = TileColor.GREEN
        tile.is_revealed = False

        process_tile_effect(session, player)
        # Tile is now revealed; swap happens later via swap_tile_effect
        assert tile.is_revealed is True

    def test_deferred_swap_resets_revealed(self, session, player):
        """swap_tile_effect should swap the tile and reset is_revealed."""
        tile = session.board.tiles[player.current_tile]
        tile.effect = "gain_10_points"
        tile.category = TileCategory.POSITIVE_MINOR
        tile.color = TileColor.GREEN
        tile.is_revealed = True

        swap_tile_effect(session, player.current_tile)
        # After swap, is_revealed should be reset to False
        assert tile.is_revealed is False


class TestApplyChoiceEffect:
    def test_steal_points(self, session, player, opponent):
        opponent.points = 80
        initial_player = player.points
        result = apply_choice_effect(session, player, "steal_points", opponent.id, 30)
        assert opponent.points == 50
        assert player.points == initial_player + 30
        assert result["amount"] == 30

    def test_steal_points_capped(self, session, player, opponent):
        opponent.points = 10
        result = apply_choice_effect(session, player, "steal_points", opponent.id, 50)
        assert opponent.points == 0
        assert result["amount"] == 10

    def test_steal_marble(self, session, player, opponent):
        opponent.marbles = 3
        initial = player.marbles
        result = apply_choice_effect(session, player, "steal_marble", opponent.id)
        assert opponent.marbles == 2
        assert player.marbles == initial + 1

    def test_steal_marble_empty(self, session, player, opponent):
        opponent.marbles = 0
        initial = player.marbles
        result = apply_choice_effect(session, player, "steal_marble", opponent.id)
        assert player.marbles == initial  # No change

    def test_give_points(self, session, player, opponent):
        player.points = 80
        initial_opponent = opponent.points
        result = apply_choice_effect(session, player, "give_points", opponent.id, 25)
        assert player.points == 55
        assert opponent.points == initial_opponent + 25

    def test_give_marble(self, session, player, opponent):
        player.marbles = 3
        initial_opponent = opponent.marbles
        result = apply_choice_effect(session, player, "give_marble", opponent.id)
        assert player.marbles == 2
        assert opponent.marbles == initial_opponent + 1

    def test_give_marble_empty(self, session, player, opponent):
        player.marbles = 0
        result = apply_choice_effect(session, player, "give_marble", opponent.id)
        assert player.marbles == 0

    def test_invalid_target(self, session, player):
        result = apply_choice_effect(session, player, "steal_points", "nonexistent")
        assert "error" in result
