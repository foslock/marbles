"""CPU player AI for Losing Their Marbles.

The CPU makes decisions at exactly the same points a human player would:
roll → (pick advantage die) → choose tile → (make choice) → turn_complete.

All game logic (dice rolling, movement, effects, swaps, battles) is handled
by the shared _do_* functions in socketio_handlers.py — the CPU never
duplicates that logic.  This ensures CPU and human turns follow identical
code paths.
"""

import asyncio
import random
import logging

logger = logging.getLogger("ltm.cpu")

# Per-type CPU score estimates.  Values are tuned so CPU lands in the middle
# of a normal human score distribution — not dominating, not last.
_CPU_SCORES: dict[str, tuple[int, int]] = {
    "tap_count":     (18, 30),      # TapFrenzy: raw tap count over 5 s
    "tracking":      (350, 600),    # BallTracker: +1 per pointer-move on ball
    "rhythm":        (400, 800),    # RhythmPulse: 0-100 accuracy per tap, ~8-16 taps in 6 s
    "canvas_fill":   (35, 55),      # ColorRush: % filled
    "accelerometer": (40, 140),     # TiltChase: +1/+3 per 100 ms near target over 7 s
    "reaction":      (2500, 5000),  # ReactionSnap: ~700 per round × 5-8 rounds in 12 s
    "size_match":    (2, 6),        # SizeMatters: match count, ~600 ms pause per match
    "memory":        (3, 7),        # MemoryFlash: correct sequence length
    "dodge":         (25, 50),      # SwipeDodge: obstacles dodged over 20 s
    "target_tap":    (4, 10),       # TargetPop: pops
    "tower_builder": (12000, 25000),# TowerBuilder: cumulative block area
    "color_drop":    (60, 140),     # ColorDrop: +10 per catch, ~15-20 marbles in 18 s
    "marble_runner": (1500, 4000),  # MarbleRunner: distance / 10
    "pump_it":       (60, 150),     # PumpIt: air pressure (no cap, leak rate limits)
    "light_switch":  (8, 18),       # LightSwitch: correct toggles in 7 s
}


def cpu_minigame_score(minigame_type: str) -> int:
    lo, hi = _CPU_SCORES.get(minigame_type, (300, 600))
    return random.randint(lo, hi)


_SPEED_OFFSET = {"fast": 0.0, "normal": 1.0, "slow": 2.0}


async def _cpu_sleep(lo: float, hi: float, speed: str):
    """Sleep for a random duration, offset by the CPU speed setting."""
    offset = _SPEED_OFFSET.get(speed, 0.0)
    await asyncio.sleep(random.uniform(lo + offset, hi + offset))


async def run_cpu_turn(session, player, *,
                       do_roll_dice, do_choose_advantage, do_choose_move,
                       do_make_choice, do_turn_complete, end_and_send):
    """Execute a complete CPU turn using the shared handler functions.

    The CPU simply:
      1. Waits a realistic delay
      2. Calls the same _do_* functions that human socket handlers call
      3. Makes decisions (which die, which tile, which target) automatically
    """
    speed = getattr(session, "cpu_speed", "fast")

    # Thinking pause before rolling — must be long enough for the turn banner
    # animation to slide in on the client (~400 ms) plus a visible hold.
    await _cpu_sleep(1.5, 2.5, speed)

    # ── Roll dice ───────────────────────────────────────────────────────────
    roll_result = await do_roll_dice(session, player.id)

    if roll_result["type"] == "advantage":
        # CPU always picks the higher die
        await _cpu_sleep(0.8, 2.5, speed)
        chosen_roll = max(roll_result["dice"])
        adv_result = await do_choose_advantage(session, player.id, chosen_roll)
        reachable = adv_result["reachable"]
        is_dizzy = adv_result["dizzy"]
    else:
        reachable = roll_result["reachable"]
        is_dizzy = roll_result.get("dizzy", False)

    # ── Handle dizzy auto-move ──────────────────────────────────────────────
    if is_dizzy and reachable:
        await _cpu_sleep(0.8, 2.5, speed)
        chosen = random.choice(reachable)
        effect_result = await do_choose_move(
            session, player.id, chosen["tileId"], chosen["path"], dizzy=True,
        )
        if effect_result.get("requiresChoice"):
            await _cpu_sleep(0.8, 2.5, speed)
            _cpu_handle_choice(effect_result, session, player, do_make_choice)
            await _cpu_sleep(0.8, 2.5, speed)
        # Wait for clients to see the effect overlay, then complete turn
        await _cpu_sleep(0.8, 2.5, speed)
        await do_turn_complete(session)
        return

    if not reachable:
        # Edge case: no reachable tiles — just end the turn
        # Set minimal pending state so do_turn_complete can process
        session._pending_turn_player_id = player.id
        session._pending_turn_action = "swap"
        session._pending_swap_tile_id = None
        await do_turn_complete(session)
        return

    # ── Choose a tile ───────────────────────────────────────────────────────
    await _cpu_sleep(0.8, 2.5, speed)

    chosen = _choose_tile(reachable, session, player)
    effect_result = await do_choose_move(
        session, player.id, chosen["tileId"], chosen["path"],
    )

    # ── Handle effects that require a choice ────────────────────────────────
    if effect_result.get("requiresChoice"):
        await _cpu_sleep(0.8, 2.5, speed)
        await _cpu_handle_choice(effect_result, session, player, do_make_choice)

    # ── Wait for clients to see the effect overlay, then complete turn ──────
    await _cpu_sleep(0.8, 2.5, speed)
    await do_turn_complete(session)


# ── CPU decision helpers ────────────────────────────────────────────────────


async def _cpu_handle_choice(effect_result, session, player, do_make_choice):
    """CPU decides on a choice effect and calls the shared handler."""
    choice_type = effect_result["choiceType"]
    options = effect_result.get("options", [])
    target_id = _choose_target(choice_type, options)
    amount = _choose_amount(choice_type)
    await do_make_choice(session, player.id, choice_type, target_id, amount)


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
        return min(options, key=lambda o: o.get("marbles", 0))["id"]
    return options[0]["id"]


def _choose_amount(choice_type: str) -> int | None:
    if choice_type in ("steal_points", "give_points"):
        return random.choice([10, 25])
    return None
