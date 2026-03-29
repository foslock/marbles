"""Tests for the minigame framework."""

import pytest
from app.game.minigames.base import (
    MINIGAMES,
    select_random_minigame,
    calculate_rankings,
    apply_minigame_prizes,
    _make_config,
)
from app.game.state import PlayerState


class TestMinigameDefinitions:
    def test_all_minigames_have_required_fields(self):
        required = {"id", "name", "description", "instructions", "duration", "type"}
        for mg in MINIGAMES:
            for field in required:
                assert field in mg, f"Minigame {mg.get('id', '?')} missing '{field}'"

    def test_all_durations_positive(self):
        for mg in MINIGAMES:
            assert mg["duration"] > 0

    def test_unique_ids(self):
        ids = [mg["id"] for mg in MINIGAMES]
        assert len(ids) == len(set(ids))

    def test_unique_types(self):
        types = [mg["type"] for mg in MINIGAMES]
        assert len(types) == len(set(types))

    def test_at_least_10_minigames(self):
        assert len(MINIGAMES) >= 10


class TestSelectRandomMinigame:
    def test_returns_valid_minigame(self):
        mg = select_random_minigame()
        assert "id" in mg
        assert "name" in mg
        assert "config" in mg

    def test_config_is_dict(self):
        mg = select_random_minigame()
        assert isinstance(mg["config"], dict)


class TestMakeConfig:
    def test_rhythm_has_bpm(self):
        config = _make_config("rhythm")
        assert "bpm" in config
        assert 80 <= config["bpm"] <= 160

    def test_reaction_has_delays(self):
        config = _make_config("reaction")
        assert "delays" in config
        assert len(config["delays"]) == 6
        for d in config["delays"]:
            assert 800 <= d <= 2500

    def test_memory_has_sequence(self):
        config = _make_config("memory")
        assert "sequence" in config
        assert len(config["sequence"]) == 12

    def test_size_match_has_sizes(self):
        config = _make_config("size_match")
        assert "targetSizes" in config
        assert len(config["targetSizes"]) == 5

    def test_unknown_type_returns_empty(self):
        config = _make_config("unknown_game")
        assert config == {}


class TestCalculateRankings:
    def test_rankings_ordered_by_score(self):
        scores = {"p1": 100, "p2": 50, "p3": 200}
        names = {"p1": "Alice", "p2": "Bob", "p3": "Charlie"}
        result = calculate_rankings(scores, names)
        assert result.rankings[0]["id"] == "p3"
        assert result.rankings[0]["rank"] == 1
        assert result.rankings[1]["id"] == "p1"
        assert result.rankings[2]["id"] == "p2"

    def test_prizes_distributed(self):
        scores = {"p1": 100, "p2": 50, "p3": 10}
        names = {"p1": "A", "p2": "B", "p3": "C"}
        result = calculate_rankings(scores, names)

        if not result.marble_bonus:
            assert result.rankings[0]["prizePoints"] == 50
            assert result.rankings[1]["prizePoints"] == 25
            assert result.rankings[2]["prizePoints"] == 10
        else:
            # Marble bonus: top 3 get marbles instead
            for r in result.rankings[:3]:
                assert r["prizeMarbles"] == 1
                assert r["prizePoints"] == 0

    def test_four_or_more_players(self):
        scores = {"p1": 10, "p2": 20, "p3": 30, "p4": 5}
        names = {"p1": "A", "p2": "B", "p3": "C", "p4": "D"}
        result = calculate_rankings(scores, names)
        assert len(result.rankings) == 4
        # 4th place gets no prizes
        last = result.rankings[3]
        assert last["prizePoints"] == 0
        assert last["prizeMarbles"] == 0


class TestApplyMinigamePrizes:
    def test_prizes_applied_to_players(self, session):
        scores = {
            "player-0": 100,
            "player-1": 50,
            "player-2": 10,
        }
        names = {pid: session.players[pid].name for pid in scores}
        result = calculate_rankings(scores, names)

        initial_points = {pid: session.players[pid].points for pid in scores}
        initial_marbles = {pid: session.players[pid].marbles for pid in scores}

        apply_minigame_prizes(session, result)

        for ranking in result.rankings:
            pid = ranking["id"]
            assert session.players[pid].points == initial_points[pid] + ranking["prizePoints"]
            assert session.players[pid].marbles == initial_marbles[pid] + ranking["prizeMarbles"]
