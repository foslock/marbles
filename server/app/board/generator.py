"""Board generation algorithm for Losing Their Marbles.

Generates a graph-based game board with a main loop path and fork/alternate routes.
Each tile has a position (x, y), a category, and an effect.
"""

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class TileCategory(str, Enum):
    NEUTRAL = "neutral"
    POSITIVE_MINOR = "positive_minor"
    POSITIVE_MEDIUM = "positive_medium"
    POSITIVE_MAJOR = "positive_major"
    NEGATIVE_MINOR = "negative_minor"
    NEGATIVE_MEDIUM = "negative_medium"
    NEGATIVE_MAJOR = "negative_major"


class TileColor(str, Enum):
    GREEN = "green"
    RED = "red"
    NEUTRAL = "neutral"


TILE_EFFECTS: dict[TileCategory, tuple[TileColor, list[str]]] = {
    TileCategory.NEUTRAL: (TileColor.NEUTRAL, [
        "fortune_cookie",
    ]),
    TileCategory.POSITIVE_MINOR: (TileColor.GREEN, [
        "gain_10_points",
        "gain_25_points",
        "reroll",
    ]),
    TileCategory.POSITIVE_MEDIUM: (TileColor.GREEN, [
        "gain_50_points",
        "steal_points",
        "double_dice_next",
        "protection",
    ]),
    TileCategory.POSITIVE_MAJOR: (TileColor.GREEN, [
        "gain_marble",
        "steal_marble",
    ]),
    TileCategory.NEGATIVE_MINOR: (TileColor.RED, [
        "lose_10_points",
        "lose_25_points",
    ]),
    TileCategory.NEGATIVE_MEDIUM: (TileColor.RED, [
        "lose_50_points",
        "give_points",
        "worst_dice_next",
    ]),
    TileCategory.NEGATIVE_MAJOR: (TileColor.RED, [
        "lose_marble",
        "give_marble",
    ]),
}

DISTRIBUTION = {
    TileCategory.NEUTRAL: 0.38,
    TileCategory.POSITIVE_MINOR: 0.20,
    TileCategory.POSITIVE_MEDIUM: 0.10,
    TileCategory.POSITIVE_MAJOR: 0.04,
    TileCategory.NEGATIVE_MINOR: 0.15,
    TileCategory.NEGATIVE_MEDIUM: 0.08,
    TileCategory.NEGATIVE_MAJOR: 0.05,
}

FORTUNE_COOKIES = [
    "A watched pot never boils, but an unwatched one definitely explodes.",
    "You will find what you seek in the last place you look. Obviously.",
    "The cheese stands alone. It prefers it that way.",
    "Today is a good day to avoid geese.",
    "Your lucky number is the one you weren't thinking of.",
    "Beware of falling coconuts and rising expectations.",
    "A bird in the hand is worth two in the bush, but three in the pocket is suspicious.",
    "You are not a drop in the ocean. You are a very confused marble.",
    "The universe is expanding. Your luck is not.",
    "Someone nearby is thinking about sandwiches.",
    "Confidence is the feeling you have before you understand the situation.",
    "A rolling stone gathers no moss, but a rolling marble gathers drama.",
    "You will soon forget this message entirely.",
    "The floor is not lava. Probably.",
    "Time flies like an arrow. Fruit flies like a banana.",
    "Trust the process. The process trusts no one.",
    "Your socks are mismatched. This is your power.",
    "Everything is temporary, especially your lead in this game.",
    "A journey of a thousand miles begins with a single questionable decision.",
    "You have been mildly inconvenienced by fate.",
]


@dataclass
class TileData:
    id: int
    x: float
    y: float
    category: TileCategory
    color: TileColor
    effect: str
    neighbors: list[int] = field(default_factory=list)
    is_fork: bool = False
    is_merge: bool = False
    is_revealed: bool = False


@dataclass
class Fork:
    fork_index: int
    rejoin_index: int
    alt_length: int


@dataclass
class Board:
    tiles: dict[int, TileData]
    width: float
    height: float

    def to_dict(self) -> dict:
        return {
            "width": round(self.width, 1),
            "height": round(self.height, 1),
            "tiles": {
                str(tid): {
                    "id": t.id,
                    "x": round(t.x, 1),
                    "y": round(t.y, 1),
                    "category": t.category.value,
                    "color": t.color.value,
                    "effect": t.effect,
                    "neighbors": t.neighbors,
                    "isFork": t.is_fork,
                    "isMerge": t.is_merge,
                }
                for tid, t in self.tiles.items()
            },
        }


def generate_board(
    total_tiles: int = 45,
    num_forks: int = 2,
    seed: Optional[int] = None,
) -> Board:
    if seed is not None:
        random.seed(seed)

    alt_tiles_per_fork = [random.randint(4, 7) for _ in range(num_forks)]
    total_alt_tiles = sum(alt_tiles_per_fork)
    main_path_count = total_tiles - total_alt_tiles

    main_positions = _generate_main_loop_positions(main_path_count)

    forks = _choose_fork_points(main_path_count, num_forks, alt_tiles_per_fork)

    tiles: dict[int, TileData] = {}
    for i, (x, y) in enumerate(main_positions):
        tiles[i] = TileData(
            id=i, x=x, y=y,
            category=TileCategory.NEUTRAL,
            color=TileColor.NEUTRAL,
            effect="",
        )

    # Wire main loop
    for i in range(main_path_count):
        next_i = (i + 1) % main_path_count
        tiles[i].neighbors.append(next_i)
        tiles[next_i].neighbors.append(i)

    # Add fork alternate routes
    next_id = main_path_count
    for fork in forks:
        fork_node = fork.fork_index
        merge_node = fork.rejoin_index
        tiles[fork_node].is_fork = True
        tiles[merge_node].is_merge = True

        alt_positions = _generate_alt_route_positions(
            start_pos=(tiles[fork_node].x, tiles[fork_node].y),
            end_pos=(tiles[merge_node].x, tiles[merge_node].y),
            count=fork.alt_length,
            main_positions=main_positions,
        )

        alt_ids = []
        for ax, ay in alt_positions:
            tiles[next_id] = TileData(
                id=next_id, x=ax, y=ay,
                category=TileCategory.NEUTRAL,
                color=TileColor.NEUTRAL,
                effect="",
            )
            alt_ids.append(next_id)
            next_id += 1

        # Wire fork -> alt route -> merge
        tiles[fork_node].neighbors.append(alt_ids[0])
        tiles[alt_ids[0]].neighbors.append(fork_node)

        for j in range(len(alt_ids) - 1):
            tiles[alt_ids[j]].neighbors.append(alt_ids[j + 1])
            tiles[alt_ids[j + 1]].neighbors.append(alt_ids[j])

        tiles[alt_ids[-1]].neighbors.append(merge_node)
        tiles[merge_node].neighbors.append(alt_ids[-1])

    _assign_tile_types(tiles)

    # Compute bounding box and normalize
    all_x = [t.x for t in tiles.values()]
    all_y = [t.y for t in tiles.values()]
    margin = 80
    x_off = min(all_x) - margin
    y_off = min(all_y) - margin
    for t in tiles.values():
        t.x -= x_off
        t.y -= y_off

    board = Board(
        tiles=tiles,
        width=max(all_x) - min(all_x) + 2 * margin,
        height=max(all_y) - min(all_y) + 2 * margin,
    )
    return board


def _generate_main_loop_positions(
    count: int,
    base_radius_x: float = 400.0,
    base_radius_y: float = 300.0,
) -> list[tuple[float, float]]:
    num_harmonics = 4
    amplitudes = [random.uniform(20, 60) for _ in range(num_harmonics)]
    phases = [random.uniform(0, 2 * math.pi) for _ in range(num_harmonics)]

    positions = []
    for i in range(count):
        t = 2 * math.pi * i / count
        perturb = sum(
            amplitudes[k] * math.sin((k + 2) * t + phases[k])
            for k in range(num_harmonics)
        )
        rx = base_radius_x + perturb
        ry = base_radius_y + perturb * 0.7
        x = rx * math.cos(t)
        y = ry * math.sin(t)
        positions.append((x, y))

    return positions


def _choose_fork_points(
    main_count: int,
    num_forks: int,
    alt_lengths: list[int],
) -> list[Fork]:
    spacing = main_count // num_forks
    forks = []
    for i in range(num_forks):
        base = (i * spacing + random.randint(-2, 2)) % main_count
        skip = random.randint(6, min(12, spacing - 2))
        rejoin = (base + skip) % main_count
        forks.append(Fork(
            fork_index=base,
            rejoin_index=rejoin,
            alt_length=alt_lengths[i],
        ))
    return forks


def _generate_alt_route_positions(
    start_pos: tuple[float, float],
    end_pos: tuple[float, float],
    count: int,
    main_positions: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    sx, sy = start_pos
    ex, ey = end_pos
    mx, my = (sx + ex) / 2, (sy + ey) / 2
    dx, dy = ex - sx, ey - sy
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length

    cx = sum(p[0] for p in main_positions) / len(main_positions)
    cy = sum(p[1] for p in main_positions) / len(main_positions)
    dot = (cx - mx) * nx + (cy - my) * ny
    if dot > 0:
        nx, ny = -nx, -ny

    bulge = length * 0.5 + random.uniform(20, 60)

    positions = []
    for i in range(count):
        frac = (i + 1) / (count + 1)
        lx = sx + frac * (ex - sx)
        ly = sy + frac * (ey - sy)
        offset = bulge * math.sin(math.pi * frac)
        lx += nx * offset
        ly += ny * offset
        positions.append((lx, ly))

    return positions


def _assign_tile_types(tiles: dict[int, TileData]) -> None:
    n = len(tiles)
    bag: list[TileCategory] = []
    for cat, frac in DISTRIBUTION.items():
        count = round(frac * n)
        if cat in (TileCategory.POSITIVE_MAJOR, TileCategory.NEGATIVE_MAJOR):
            count = max(1, min(2, count))
        bag.extend([cat] * count)

    while len(bag) < n:
        bag.append(TileCategory.NEUTRAL)
    while len(bag) > n:
        try:
            bag.remove(TileCategory.NEUTRAL)
        except ValueError:
            bag.pop()

    random.shuffle(bag)

    fork_merge_ids = {tid for tid, t in tiles.items() if t.is_fork or t.is_merge}

    neutral_bag = [c for c in bag if c == TileCategory.NEUTRAL]
    non_neutral_bag = [c for c in bag if c != TileCategory.NEUTRAL]

    neutral_iter = iter(neutral_bag)
    non_neutral_iter = iter(non_neutral_bag)

    # Shuffle the non-fork/merge IDs so alt-route tiles get a fair share of
    # non-neutral categories (without shuffling, they always fall at the end
    # of the insertion-order iteration and exhaust the non-neutral bag).
    other_ids = [tid for tid in tiles if tid not in fork_merge_ids]
    random.shuffle(other_ids)

    for tid in fork_merge_ids:
        cat = next(neutral_iter, TileCategory.NEUTRAL)
        color, effects = TILE_EFFECTS[cat]
        tiles[tid].category = cat
        tiles[tid].color = color
        tiles[tid].effect = random.choice(effects)

    for tid in other_ids:
        cat = next(non_neutral_iter, None) or next(neutral_iter, TileCategory.NEUTRAL)
        color, effects = TILE_EFFECTS[cat]
        tiles[tid].category = cat
        tiles[tid].color = color
        tiles[tid].effect = random.choice(effects)

    _separate_major_tiles(tiles)


def _separate_major_tiles(tiles: dict[int, TileData]) -> None:
    major_cats = {TileCategory.POSITIVE_MAJOR, TileCategory.NEGATIVE_MAJOR}
    major_ids = [tid for tid, t in tiles.items() if t.category in major_cats]
    fork_merge_ids = {tid for tid, t in tiles.items() if t.is_fork or t.is_merge}

    for mid in major_ids:
        for neighbor_id in tiles[mid].neighbors:
            if tiles[neighbor_id].category in major_cats:
                for tid, t in tiles.items():
                    if (
                        t.category == TileCategory.NEUTRAL
                        and tid not in major_ids
                        and tid not in fork_merge_ids  # keep fork/merge tiles neutral
                    ):
                        neighbor_cats = {tiles[n].category for n in t.neighbors}
                        if not (neighbor_cats & major_cats):
                            # Swap
                            tiles[neighbor_id].category, tiles[tid].category = tiles[tid].category, tiles[neighbor_id].category
                            tiles[neighbor_id].color, tiles[tid].color = tiles[tid].color, tiles[neighbor_id].color
                            tiles[neighbor_id].effect, tiles[tid].effect = tiles[tid].effect, tiles[neighbor_id].effect
                            break
