"""Tile effect processing for Losing Their Marbles."""

import random
from .state import GameSession, PlayerState
from ..board.generator import FORTUNE_COOKIES, TileCategory, TileColor, TILE_EFFECTS


POINTS_PER_MARBLE = 100


def check_marble_conversion(player: PlayerState) -> int:
    """Convert every full 100 points into a marble. Returns number of new marbles."""
    if player.points < POINTS_PER_MARBLE:
        return 0
    new_marbles = player.points // POINTS_PER_MARBLE
    player.marbles += new_marbles
    player.points %= POINTS_PER_MARBLE
    return new_marbles


def process_tile_effect(
    session: GameSession, player: PlayerState
) -> dict:
    """Process the effect of the tile the player landed on. Returns effect result dict."""
    if not session.board:
        return {"type": "none"}

    tile = session.board.tiles.get(player.current_tile)
    if not tile:
        return {"type": "none"}

    tile.is_revealed = True
    result = {"type": tile.effect, "category": tile.category.value, "color": tile.color.value}

    # Check protection for negative tiles
    if tile.color.value == "red" and player.modifiers.get("protection", 0) > 0:
        player.modifiers["protection"] -= 1
        result["blocked"] = True
        result["message"] = "Your protection shield blocked this negative effect!"
        return result

    match tile.effect:
        # === POSITIVE EFFECTS ===
        case "gain_10_points":
            player.points += 10
            result["message"] = "Gained 10 points!"
            result["pointsGained"] = 10

        case "gain_25_points":
            player.points += 25
            result["message"] = "Gained 25 points!"
            result["pointsGained"] = 25

        case "gain_50_points":
            player.points += 50
            result["message"] = "Gained 50 points!"
            result["pointsGained"] = 50

        case "reroll":
            player.modifiers["advantage"] = player.modifiers.get("advantage", 0) + 1
            result["message"] = f"Advantage Roll! Next turn you roll two dice and pick one. (You have {player.modifiers['advantage']} saved)"

        case "protection":
            player.modifiers["protection"] = player.modifiers.get("protection", 0) + 1
            result["message"] = "Gained protection! Next negative tile is blocked."

        case "double_dice_next":
            player.modifiers["double_dice"] = player.modifiers.get("double_dice", 0) + 1
            result["message"] = "Next roll uses two dice (summed)!"

        case "short_stop":
            player.modifiers["short_stop"] = player.modifiers.get("short_stop", 0) + 1
            result["message"] = "Short Stop! Next turn you can stop on any tile along the way."

        case "gain_marble":
            player.marbles += 1
            result["message"] = "🎉 You found a marble!"
            result["marblesGained"] = 1

        case "steal_points":
            eligible = [p for p in session.get_players() if p.id != player.id and p.points > 0]
            if eligible:
                result["requiresChoice"] = True
                result["choiceType"] = "steal_points"
                result["message"] = "Choose a player to steal points from!"
                result["options"] = [{"id": p.id, "name": p.name, "marbles": p.marbles, "points": p.points} for p in eligible]
            else:
                result["message"] = "No one has points to steal... tough luck."
                result["type"] = "steal_points_empty"

        case "steal_marble":
            eligible = [p for p in session.get_players() if p.id != player.id and p.marbles > 0]
            if eligible:
                result["requiresChoice"] = True
                result["choiceType"] = "steal_marble"
                result["message"] = "Choose a player to steal a marble from!"
                result["options"] = [{"id": p.id, "name": p.name, "marbles": p.marbles} for p in eligible]
            else:
                result["message"] = "No one has marbles to steal... awkward."
                result["type"] = "steal_marble_empty"

        # === NEGATIVE EFFECTS ===
        case "lose_10_points":
            player.points = max(0, player.points - 10)
            result["message"] = "Lost 10 points!"
            result["pointsLost"] = 10

        case "lose_25_points":
            player.points = max(0, player.points - 25)
            result["message"] = "Lost 25 points!"
            result["pointsLost"] = 25

        case "lose_50_points":
            player.points = max(0, player.points - 50)
            result["message"] = "Lost 50 points!"
            result["pointsLost"] = 50

        case "dizzy":
            player.modifiers["dizzy"] = player.modifiers.get("dizzy", 0) + 1
            result["message"] = "Dizzy! Next turn you move in a random direction!"

        case "lose_marble":
            if player.marbles > 0:
                player.marbles -= 1
                result["message"] = "You lost a marble! 😱"
                result["marblesLost"] = 1
            else:
                result["message"] = "You'd lose a marble, but you have none. Lucky!"

        case "give_points":
            result["requiresChoice"] = True
            result["choiceType"] = "give_points"
            result["message"] = "Choose a player to give points to!"
            result["options"] = _get_other_player_options(session, player)

        case "give_marble":
            if player.marbles > 0:
                result["requiresChoice"] = True
                result["choiceType"] = "give_marble"
                result["message"] = "Choose a player to give a marble to!"
                result["options"] = _get_other_player_options(session, player)
            else:
                result["message"] = "You'd have to give a marble, but you have none."

        # === NEUTRAL ===
        case "fortune_cookie":
            saying = random.choice(FORTUNE_COOKIES)
            result["message"] = saying
            result["visualEffect"] = random.choice([
                "rainbow_shimmer", "size_pulse", "spin", "ghost_mode", "sparkle_trail",
            ])

        case _:
            result["message"] = "Nothing happened. The tile stares at you blankly."

    # Convert excess points to marbles
    new_marbles = check_marble_conversion(player)
    if new_marbles:
        result["autoMarbles"] = new_marbles

    return result


def apply_choice_effect(
    session: GameSession, player: PlayerState, choice_type: str, target_id: str, amount: int | None = None
) -> dict:
    """Apply an effect that required player choice (steal/give)."""
    target = session.players.get(target_id)
    if not target:
        return {"error": "Player not found"}

    result = {"type": choice_type, "targetId": target_id, "targetName": target.name}

    match choice_type:
        case "steal_points":
            steal_amount = amount or random.choice([10, 25, 50])
            actual = min(steal_amount, target.points)
            target.points -= actual
            player.points += actual
            result["amount"] = actual
            result["message"] = f"Stole {actual} points from {target.name}!"

        case "steal_marble":
            if target.marbles > 0:
                target.marbles -= 1
                player.marbles += 1
                result["message"] = f"Stole a marble from {target.name}!"
            else:
                result["message"] = f"{target.name} has no marbles to steal!"

        case "give_points":
            give_amount = amount or random.choice([10, 25, 50])
            actual = min(give_amount, player.points)
            player.points -= actual
            target.points += actual
            result["amount"] = actual
            result["message"] = f"Gave {actual} points to {target.name}."

        case "give_marble":
            if player.marbles > 0:
                player.marbles -= 1
                target.marbles += 1
                result["message"] = f"Gave a marble to {target.name}."
            else:
                result["message"] = "You have no marbles to give!"

    # Check marble conversion for both players after point transfers
    player_new = check_marble_conversion(player)
    target_new = check_marble_conversion(target)
    if player_new:
        result["autoMarbles"] = player_new
    if target_new:
        result["targetAutoMarbles"] = target_new

    return result


def _get_other_player_options(session: GameSession, player: PlayerState) -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "marbles": p.marbles, "points": p.points}
        for p in session.get_players()
        if p.id != player.id
    ]


def swap_tile_effect(session: GameSession, tile_id: int) -> list[dict]:
    """Move a positive/negative tile's effect to a random unoccupied neutral tile.

    The original tile becomes neutral. The target neutral tile gets a randomly
    chosen effect from the same positive/negative group, keeping the board
    unpredictable while preserving the overall balance of tile types.
    Neutral fortune-cookie tiles are left untouched.

    Returns a list of dicts describing each tile whose color/category/effect changed,
    so callers can push the updates to connected clients.
    """
    if not session.board:
        return []

    tile = session.board.tiles[tile_id]

    # Only relocate positive/negative tiles; neutral tiles stay as-is
    if tile.color == TileColor.NEUTRAL:
        return []

    # Identify occupied tile IDs so we don't hide an effect under a player
    occupied_tiles = {p.current_tile for p in session.get_players()}

    # Find unoccupied, unrevealed neutral tiles to receive the relocated effect
    neutral_targets = [
        t for t in session.board.tiles.values()
        if t.color == TileColor.NEUTRAL
        and t.id != tile_id
        and not t.is_revealed
        and t.id not in occupied_tiles
    ]

    changed = []

    if neutral_targets:
        target = random.choice(neutral_targets)

        # Pick a random category from the same positive/negative group
        if tile.color == TileColor.GREEN:
            candidates = [
                TileCategory.POSITIVE_MINOR,
                TileCategory.POSITIVE_MEDIUM,
                TileCategory.POSITIVE_MAJOR,
            ]
        else:
            candidates = [
                TileCategory.NEGATIVE_MINOR,
                TileCategory.NEGATIVE_MEDIUM,
                TileCategory.NEGATIVE_MAJOR,
            ]

        new_cat = random.choice(candidates)
        new_color, new_effects = TILE_EFFECTS[new_cat]
        target.category = new_cat
        target.color = new_color
        target.effect = random.choice(new_effects)
        changed.append({"id": target.id, "color": target.color.value, "category": target.category.value, "effect": target.effect})

    # Reset original tile to neutral regardless of whether a target was found.
    # If all neutral tiles were occupied, the effect simply disappears.
    neutral_color, neutral_effects = TILE_EFFECTS[TileCategory.NEUTRAL]
    tile.category = TileCategory.NEUTRAL
    tile.color = neutral_color
    tile.effect = random.choice(neutral_effects)
    tile.is_revealed = False
    changed.append({"id": tile.id, "color": tile.color.value, "category": tile.category.value, "effect": tile.effect})

    return changed
