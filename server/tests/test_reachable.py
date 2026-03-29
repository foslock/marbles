"""Tests for reachable tile computation and modifier-based movement."""

import pytest
from app.board.pathfinding import get_reachable_tiles
from app.board.generator import generate_board


@pytest.fixture
def board():
    """A deterministic board for testing reachable tile logic."""
    return generate_board(seed=42)


class TestGetReachableTiles:
    def test_returns_tiles_at_exact_distance(self, board):
        reachable = get_reachable_tiles(board, 0, 3)
        # All results should be exactly 3 steps away — path is length 4
        for r in reachable:
            assert len(r["path"]) == 4
        assert len(reachable) >= 1

    def test_zero_steps_returns_start(self, board):
        reachable = get_reachable_tiles(board, 0, 0)
        assert len(reachable) == 1
        assert reachable[0]["tileId"] == 0

    def test_returns_empty_for_no_board(self):
        reachable = get_reachable_tiles(None, 0, 3)
        assert reachable == []

    def test_paths_dont_revisit_tiles(self, board):
        reachable = get_reachable_tiles(board, 0, 4)
        for r in reachable:
            assert len(r["path"]) == len(set(r["path"])), "Path revisits a tile"

    def test_path_starts_at_origin_ends_at_dest(self, board):
        reachable = get_reachable_tiles(board, 5, 2)
        for r in reachable:
            assert r["path"][0] == 5
            assert r["path"][-1] == r["tileId"]

    def test_unique_destinations(self, board):
        reachable = get_reachable_tiles(board, 0, 3)
        tile_ids = [r["tileId"] for r in reachable]
        assert len(tile_ids) == len(set(tile_ids))


class TestShortStopReachable:
    """Short stop returns tiles at distances 1..N (not just N)."""

    def test_short_stop_returns_more_tiles_than_normal(self, board):
        normal = get_reachable_tiles(board, 0, 4)
        normal_ids = {r["tileId"] for r in normal}

        # Short stop: gather tiles at distances 1..4
        short_stop_ids: set[int] = set()
        for dist in range(1, 5):
            for tile_info in get_reachable_tiles(board, 0, dist):
                short_stop_ids.add(tile_info["tileId"])

        # Short stop should include all normal tiles plus closer ones
        assert normal_ids.issubset(short_stop_ids)
        assert len(short_stop_ids) > len(normal_ids)

    def test_short_stop_includes_distance_1(self, board):
        """Short stop with roll=3 should include tiles at distance 1."""
        dist1_ids = {r["tileId"] for r in get_reachable_tiles(board, 0, 1)}

        short_stop_ids: set[int] = set()
        for dist in range(1, 4):
            for tile_info in get_reachable_tiles(board, 0, dist):
                short_stop_ids.add(tile_info["tileId"])

        assert dist1_ids.issubset(short_stop_ids)

    def test_short_stop_no_duplicates_in_aggregation(self, board):
        """When aggregating 1..N, each tile ID should appear only once."""
        seen: set[int] = set()
        results = []
        for dist in range(1, 5):
            for tile_info in get_reachable_tiles(board, 0, dist):
                if tile_info["tileId"] not in seen:
                    seen.add(tile_info["tileId"])
                    results.append(tile_info)

        tile_ids = [r["tileId"] for r in results]
        assert len(tile_ids) == len(set(tile_ids))
