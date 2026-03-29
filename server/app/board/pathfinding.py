"""Pathfinding utilities for the game board."""

from collections import deque


def get_reachable_tiles(board, start_tile: int, steps: int) -> list[dict]:
    """BFS to find all tiles reachable in exactly `steps` moves without revisiting tiles.

    Each candidate path carries the set of tiles it has already visited.
    A neighbor is only followed if it hasn't been visited in the current path,
    which prevents all zigzag/cycle paths and ensures the animation always
    travels in one coherent direction.

    Args:
        board: Board object with a .tiles dict mapping tile IDs to tile objects.
        start_tile: The tile ID to start from.
        steps: Exact number of steps to take.

    Returns:
        List of dicts with 'tileId' and 'path' keys.
    """
    if not board:
        return []

    results = []
    seen_destinations: set[int] = set()
    queue: deque = deque([(start_tile, steps, [start_tile], frozenset([start_tile]))])

    while queue:
        current, remaining, path, path_set = queue.popleft()

        if remaining == 0:
            if current not in seen_destinations:
                seen_destinations.add(current)
                results.append({"tileId": current, "path": path})
            continue

        for neighbor in board.tiles[current].neighbors:
            if neighbor not in path_set:
                queue.append((
                    neighbor,
                    remaining - 1,
                    path + [neighbor],
                    path_set | {neighbor},
                ))

    return results
