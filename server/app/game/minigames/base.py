"""Minigame definitions and framework."""

import random
from dataclasses import dataclass


@dataclass
class MinigameResult:
    scores: dict[str, int]  # player_id -> score
    rankings: list[dict]  # [{id, name, score, rank, prize}]
    marble_bonus: bool  # True if winners get marbles instead of points


MINIGAMES = [
    {
        "id": "tap_frenzy",
        "name": "Tap Frenzy",
        "description": "Tap as fast as you can!",
        "instructions": "Tap the screen as many times as possible in 5 seconds.",
        "duration": 5000,
        "type": "tap_count",
    },
    {
        "id": "ball_tracker",
        "name": "Ball Tracker",
        "description": "Keep your finger on the ball!",
        "instructions": "A ball bounces around the screen. Hold your finger on it to score points.",
        "duration": 7000,
        "type": "tracking",
    },
    {
        "id": "rhythm_tap",
        "name": "Rhythm Pulse",
        "description": "Feel the beat!",
        "instructions": "The screen pulses to a rhythm. Tap in sync with the beat as accurately as possible.",
        "duration": 6000,
        "type": "rhythm",
    },
    {
        "id": "canvas_fill",
        "name": "Color Rush",
        "description": "Paint it all!",
        "instructions": "Draw with your finger to fill as much of the canvas as possible.",
        "duration": 5000,
        "type": "canvas_fill",
    },
    {
        "id": "tilt_chase",
        "name": "Tilt Chase",
        "description": "Tilt to follow!",
        "instructions": "Tilt your device to guide your dot to follow the target dot.",
        "duration": 7000,
        "type": "accelerometer",
    },
    {
        "id": "reaction_snap",
        "name": "Reaction Snap",
        "description": "Wait for it... TAP!",
        "instructions": "Wait for the screen to turn green, then tap as fast as possible. Fastest reaction wins!",
        "duration": 5000,
        "type": "reaction",
    },
    {
        "id": "size_judge",
        "name": "Size Matters",
        "description": "Match the size!",
        "instructions": "A circle appears — pinch/spread to match its size exactly. Closest match wins!",
        "duration": 6000,
        "type": "size_match",
    },
    {
        "id": "memory_flash",
        "name": "Memory Flash",
        "description": "Remember the sequence!",
        "instructions": "Colored tiles flash in a sequence. Repeat the sequence from memory. Longest correct streak wins!",
        "duration": 8000,
        "type": "memory",
    },
    {
        "id": "swipe_dodge",
        "name": "Swipe Dodge",
        "description": "Dodge the obstacles!",
        "instructions": "Swipe left/right to dodge falling obstacles. Survive the longest to win!",
        "duration": 6000,
        "type": "dodge",
    },
    {
        "id": "target_pop",
        "name": "Target Pop",
        "description": "Pop the targets!",
        "instructions": "Targets appear randomly on screen. Tap them before they disappear. Most pops wins!",
        "duration": 5000,
        "type": "target_tap",
    },
]


def select_random_minigame() -> dict:
    """Select a random minigame."""
    return random.choice(MINIGAMES)


def calculate_rankings(
    scores: dict[str, int], player_names: dict[str, str]
) -> MinigameResult:
    """Calculate rankings and prizes from minigame scores."""
    sorted_players = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    marble_bonus = random.random() < 0.10  # 10% chance

    point_prizes = [50, 25, 10]  # 1st, 2nd, 3rd

    rankings = []
    for i, (player_id, score) in enumerate(sorted_players):
        rank = i + 1
        if rank <= 3:
            prize_points = point_prizes[i] if i < len(point_prizes) else 0
        else:
            prize_points = 0

        rankings.append({
            "id": player_id,
            "name": player_names.get(player_id, "Unknown"),
            "score": score,
            "rank": rank,
            "prizePoints": prize_points if not marble_bonus else 0,
            "prizeMarbles": 1 if marble_bonus and rank <= 3 else 0,
        })

    return MinigameResult(
        scores=scores,
        rankings=rankings,
        marble_bonus=marble_bonus,
    )


def apply_minigame_prizes(session, result: MinigameResult):
    """Apply minigame prizes to player states."""
    for ranking in result.rankings:
        player = session.players.get(ranking["id"])
        if not player:
            continue
        player.points += ranking["prizePoints"]
        player.marbles += ranking["prizeMarbles"]
