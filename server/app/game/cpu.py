"""CPU player AI for Losing Their Marbles.

The CPU plays a simple but reasonable game:
- Rolls dice (applying saved modifiers)
- Prefers green/unrevealed tiles, avoids red when possible
- Makes sensible steal/give target choices (take from leader, give to trailer)
- Scores roughly average on minigames (40–60 % of a human top score)
"""

import asyncio
import random
import logging

from .effects import process_tile_effect, apply_choice_effect, swap_tile_effect
from .battle import check_for_battle

logger = logging.getLogger("ltm.cpu")

# Per-type CPU score estimates.  Values are tuned so CPU lands in the middle
# of a normal human score distribution — not dominating, not last.
_CPU_SCORES: dict[str, tuple[int, int]] = {
    "tap_count":     (18, 30),      # TapFrenzy: raw tap count over 5 s
    "tracking":      (350, 600),    # BallTracker: contact ms
    "rhythm":        (300, 550),    # RhythmPulse: timing accuracy points
    "canvas_fill":   (35, 55),      # ColorRush: % filled
    "accelerometer": (300, 550),    # TiltChase
    "reaction":      (300, 600),    # ReactionSnap: ms-based score
    "size_match":    (300, 600),    # SizeMatters
    "memory":        (3, 7),        # MemoryFlash: correct sequence length
    "dodge":         (300, 600),    # SwipeDodge: survival score
    "target_tap":    (4, 10),       # TargetPop: pops
    "tower_builder": (12000, 25000),# TowerBuilder: cumulative block area
    "color_drop":    (300, 550),    # ColorDrop: +10 per catch, up to 800
    "marble_runner": (1500, 4000),  # MarbleRunner: distance / 10
    "pump_it":       (60, 150),     # PumpIt: air pressure (no cap, leak rate limits)
    "light_switch":  (8, 18),       # LightSwitch: correct toggles in 7 s
}


def cpu_minigame_score(minigame_type: str) -> int:
    lo, hi = _CPU_SCORES.get(minigame_type, (300, 600))
    return random.randint(lo, hi)


async def run_cpu_turn(sio, session, player, get_reachable_fn, check_battle_fn):
    """Execute a complete CPU turn: roll → move → handle effect → swap → end turn."""
    # Thinking pause before rolling — feels like the CPU is deciding
    await asyncio.sleep(random.uniform(1.8, 3.0))

    # ── Roll dice ────────────────────────────────────────────────────────────
    if player.modifiers.get("advantage", 0) > 0:
        r1, r2 = random.randint(1, 6), random.randint(1, 6)
        roll = max(r1, r2)  # CPU always picks the higher die
        player.modifiers["advantage"] -= 1
        dice_info = {"roll": roll, "dice": [r1, r2], "type": "advantage"}
    elif player.modifiers.get("double_dice", 0) > 0:
        r1, r2 = random.randint(1, 6), random.randint(1, 6)
        roll = r1 + r2
        player.modifiers["double_dice"] -= 1
        dice_info = {"roll": roll, "dice": [r1, r2], "type": "double"}
    else:
        roll = random.randint(1, 6)
        dice_info = {"roll": roll, "dice": [roll], "type": "normal"}

    # Check short_stop modifier: CPU can stop on any tile 1..N steps
    has_short_stop = player.modifiers.get("short_stop", 0) > 0
    if has_short_stop:
        reachable = []
        seen_ids: set[int] = set()
        for dist in range(1, roll + 1):
            for tile_info in get_reachable_fn(session, player.current_tile, dist):
                if tile_info["tileId"] not in seen_ids:
                    seen_ids.add(tile_info["tileId"])
                    reachable.append(tile_info)
        player.modifiers["short_stop"] -= 1
        dice_info["shortStop"] = True
    else:
        reachable = get_reachable_fn(session, player.current_tile, roll)

    # Check dizzy modifier: auto-pick random tile
    has_dizzy = player.modifiers.get("dizzy", 0) > 0
    if has_dizzy:
        player.modifiers["dizzy"] -= 1
        dice_info["dizzy"] = True

    await sio.emit(
        "dice_rolled",
        {
            "playerId": player.id,
            "playerName": player.name,
            **dice_info,
            "reachableTiles": reachable,
        },
        room=session.id,
    )

    if not reachable:
        # Edge case: no reachable tiles — just end the turn
        await check_battle_fn(session, player)
        return

    # Pause while "considering" which tile to move to
    await asyncio.sleep(random.uniform(1.5, 2.5))

    # ── Choose a tile ────────────────────────────────────────────────────────
    if has_dizzy:
        chosen = random.choice(reachable)
    else:
        chosen = _choose_tile(reachable, session, player)
    from_tile = player.current_tile
    player.current_tile = chosen["tileId"]

    await sio.emit(
        "player_moved",
        {
            "playerId": player.id,
            "playerName": player.name,
            "tileId": chosen["tileId"],
            "fromTile": from_tile,
            "path": chosen["path"],
        },
        room=session.id,
    )

    # Give clients time to register and start the move animation before the
    # tile-effect popup arrives.  The animation itself takes ~350 ms per tile,
    # so 0.5 s ensures even a 1-tile hop is partially visible first.
    await asyncio.sleep(0.5)

    # ── Check for battle first — skip tile effect if occupied ────────────────
    battle = check_for_battle(session, player)
    if battle:
        await sio.emit(
            "tile_effect",
            {
                "playerId": player.id,
                "playerName": player.name,
                "type": "battle",
                "category": "neutral",
                "color": "neutral",
                "message": battle["message"],
            },
            room=session.id,
        )
        await asyncio.sleep(2.5)
        # Go straight to minigame — check_battle_fn will find the battle
        await check_battle_fn(session, player)
        return

    # ── Process tile effect (swap deferred) ──────────────────────────────────
    effect_result = process_tile_effect(session, player)

    await sio.emit(
        "tile_effect",
        {"playerId": player.id, "playerName": player.name, **effect_result},
        room=session.id,
    )

    # ── Handle effects that need a choice ────────────────────────────────────
    if effect_result.get("requiresChoice"):
        # Pause while "thinking about" who to target
        await asyncio.sleep(random.uniform(1.5, 2.5))
        choice_type = effect_result["choiceType"]
        options = effect_result.get("options", [])
        target_id = _choose_target(choice_type, options)
        amount = _choose_amount(choice_type)

        result = apply_choice_effect(session, player, choice_type, target_id, amount)

        await sio.emit(
            "choice_resolved",
            {"playerId": player.id, **result},
            room=session.id,
        )

    # ── Wait for clients to see the effect overlay ───────────────────────────
    await asyncio.sleep(random.uniform(3.0, 4.0))

    # ── Perform deferred tile swap ───────────────────────────────────────────
    tile_id = chosen["tileId"]
    if session.board:
        tile = session.board.tiles.get(tile_id)
        original_color = tile.color.value if tile else "neutral"
        board_updates = swap_tile_effect(session, tile_id)
        if board_updates:
            target_tile_id = None
            for update in board_updates:
                if update["id"] != tile_id and update["color"] != "neutral":
                    target_tile_id = update["id"]
                    break
            await sio.emit("tile_swap", {
                "sourceTileId": tile_id,
                "targetTileId": target_tile_id,
                "color": original_color,
                "boardUpdates": board_updates,
            }, room=session.id)
            await asyncio.sleep(2.0)  # Wait for swap animation (3s client-side)

    # ── End turn (no battle — already checked above) ─────────────────────────
    await check_battle_fn(session, player)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _choose_tile(reachable: list[dict], session, player) -> dict:
    """Pick a tile with a preference for green/unrevealed and away from red."""
    board = session.board
    has_protection = player.modifiers.get("protection", 0) > 0

    scored: list[tuple[int, dict]] = []
    for tile_info in reachable:
        tile = board.tiles.get(tile_info["tileId"]) if board else None
        score = 0
        if tile:
            if not tile.is_revealed:
                score += 1
            if tile.color.value == "green":
                score += 3
            elif tile.color.value == "red":
                # Avoid red unless shielded
                score -= 2 if not has_protection else 0
        scored.append((score, tile_info))

    # Weighted random selection: higher score → more likely
    min_s = min(s for s, _ in scored)
    weights = [s - min_s + 1 for s, _ in scored]
    total = sum(weights)
    r = random.uniform(0, total)
    cumulative = 0.0
    for w, tile_info in zip(weights, [t for _, t in scored]):
        cumulative += w
        if r <= cumulative:
            return tile_info
    return scored[-1][1]


def _choose_target(choice_type: str, options: list[dict]) -> str:
    """Select which player to target for a choice effect."""
    if not options:
        return ""
    if choice_type == "steal_points":
        return max(options, key=lambda o: o.get("points", 0))["id"]
    if choice_type == "steal_marble":
        return max(options, key=lambda o: o.get("marbles", 0))["id"]
    if choice_type in ("give_points", "give_marble"):
        # Give to the player trailing in marbles (least threatening)
        return min(options, key=lambda o: o.get("marbles", 0))["id"]
    return options[0]["id"]


def _choose_amount(choice_type: str) -> int | None:
    if choice_type in ("steal_points", "give_points"):
        return random.choice([10, 25])
    return None
