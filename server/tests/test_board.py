"""Tests for board generation."""

import pytest
from app.board.generator import (
    generate_board,
    TileCategory,
    TileColor,
    TILE_EFFECTS,
    DISTRIBUTION,
)


class TestBoardGeneration:
    def test_generates_correct_tile_count(self):
        board = generate_board(total_tiles=45, seed=1)
        assert len(board.tiles) == 45

    def test_deterministic_with_seed(self):
        b1 = generate_board(seed=42)
        b2 = generate_board(seed=42)
        assert len(b1.tiles) == len(b2.tiles)
        for tid in b1.tiles:
            assert b1.tiles[tid].x == b2.tiles[tid].x
            assert b1.tiles[tid].y == b2.tiles[tid].y
            assert b1.tiles[tid].effect == b2.tiles[tid].effect

    def test_different_seeds_differ(self):
        b1 = generate_board(seed=1)
        b2 = generate_board(seed=2)
        # Effects should differ (extremely unlikely to match by chance)
        effects1 = [t.effect for t in b1.tiles.values()]
        effects2 = [t.effect for t in b2.tiles.values()]
        assert effects1 != effects2

    def test_tiles_have_neighbors(self):
        board = generate_board(seed=1)
        for tile in board.tiles.values():
            assert len(tile.neighbors) >= 1, f"Tile {tile.id} has no neighbors"

    def test_neighbor_edges_are_bidirectional(self):
        board = generate_board(seed=1)
        for tile in board.tiles.values():
            for nid in tile.neighbors:
                assert tile.id in board.tiles[nid].neighbors, (
                    f"Edge {tile.id}->{nid} is not bidirectional"
                )

    def test_has_fork_tiles(self):
        board = generate_board(num_forks=2, seed=1)
        fork_tiles = [t for t in board.tiles.values() if t.is_fork]
        assert len(fork_tiles) >= 1

    def test_fork_tiles_have_3plus_neighbors(self):
        board = generate_board(num_forks=2, seed=1)
        for tile in board.tiles.values():
            if tile.is_fork:
                assert len(tile.neighbors) >= 3, (
                    f"Fork tile {tile.id} has only {len(tile.neighbors)} neighbors"
                )

    def test_all_tiles_have_effects(self):
        board = generate_board(seed=1)
        for tile in board.tiles.values():
            assert tile.effect, f"Tile {tile.id} has no effect"

    def test_tile_colors_match_categories(self):
        board = generate_board(seed=1)
        for tile in board.tiles.values():
            expected_color, _ = TILE_EFFECTS[tile.category]
            assert tile.color == expected_color

    def test_positive_and_negative_tiles_exist(self):
        board = generate_board(seed=1)
        colors = {t.color for t in board.tiles.values()}
        assert TileColor.GREEN in colors
        assert TileColor.RED in colors
        assert TileColor.NEUTRAL in colors

    def test_board_dimensions_positive(self):
        board = generate_board(seed=1)
        assert board.width > 0
        assert board.height > 0

    def test_to_dict(self):
        board = generate_board(seed=1)
        d = board.to_dict()
        assert "width" in d
        assert "height" in d
        assert "tiles" in d
        # Keys should be strings
        for key in d["tiles"]:
            assert isinstance(key, str)
        tile_dict = list(d["tiles"].values())[0]
        assert "id" in tile_dict
        assert "x" in tile_dict
        assert "y" in tile_dict
        assert "color" in tile_dict
        assert "effect" in tile_dict
        assert "neighbors" in tile_dict
        assert "isFork" in tile_dict

    def test_fork_merge_tiles_are_neutral(self):
        """Fork and merge tiles should be neutral category."""
        board = generate_board(seed=1)
        for tile in board.tiles.values():
            if tile.is_fork or tile.is_merge:
                assert tile.category == TileCategory.NEUTRAL

    def test_short_stop_in_positive_medium_pool(self):
        _, effects = TILE_EFFECTS[TileCategory.POSITIVE_MEDIUM]
        assert "short_stop" in effects

    def test_dizzy_in_negative_medium_pool(self):
        _, effects = TILE_EFFECTS[TileCategory.NEGATIVE_MEDIUM]
        assert "dizzy" in effects

    def test_major_tiles_not_adjacent(self):
        """Major tiles should not be adjacent to each other."""
        board = generate_board(seed=1)
        major_cats = {TileCategory.POSITIVE_MAJOR, TileCategory.NEGATIVE_MAJOR}
        for tile in board.tiles.values():
            if tile.category in major_cats:
                for nid in tile.neighbors:
                    neighbor = board.tiles[nid]
                    assert neighbor.category not in major_cats, (
                        f"Major tiles {tile.id} and {nid} are adjacent"
                    )
