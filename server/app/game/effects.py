"""Tile effect processing for Losing Their Marbles."""

import random
from .state import GameSession, PlayerState
from ..board.generator import FORTUNE_COOKIES, TileCategory, TILE_EFFECTS


POINTS_PER_MARBLE = 100


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
        _swap_tile_effect(session, tile.id)
        return result

    match tile.effect:
        # === POSITIVE EFFECTS ===
        case "gain_10_points":
            player.points += 10
            result["message"] = f"Gained 10 points! (10% of a marble)"
            result["pointsGained"] = 10

        case "gain_25_points":
            player.points += 25
            result["message"] = f"Gained 25 points! (25% of a marble)"
            result["pointsGained"] = 25

        case "gain_50_points":
            player.points += 50
            result["message"] = f"Gained 50 points! (Half a marble!)"
            result["pointsGained"] = 50

        case "reroll":
            player.modifiers["rerolls"] = player.modifiers.get("rerolls", 0) + 1
            result["message"] = f"Gained a re-roll! (You have {player.modifiers['rerolls']} saved)"

        case "protection":
            player.modifiers["protection"] = player.modifiers.get("protection", 0) + 1
            result["message"] = "Gained protection! Next negative tile is blocked."

        case "double_dice_next":
            player.modifiers["double_dice"] = player.modifiers.get("double_dice", 0) + 1
            result["message"] = "Next roll uses two dice (summed)!"

        case "gain_marble":
            player.marbles += 1
            result["message"] = "🎉 You found a marble!"
            result["marblesGained"] = 1

        case "steal_points":
            result["requiresChoice"] = True
            result["choiceType"] = "steal_points"
            result["message"] = "Choose a player to steal points from!"
            result["options"] = _get_other_player_options(session, player)

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

        case "worst_dice_next":
            player.modifiers["worst_dice"] = player.modifiers.get("worst_dice", 0) + 1
            result["message"] = "Next roll uses two dice — you take the WORST!"

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
    if player.points >= POINTS_PER_MARBLE:
        new_marbles = player.points // POINTS_PER_MARBLE
        player.marbles += new_marbles
        player.points %= POINTS_PER_MARBLE
        result["autoMarbles"] = new_marbles
        result["message"] += f" +{new_marbles} marble(s) from points!"

    # Swap tile effect with another of the same type
    _swap_tile_effect(session, tile.id)

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

    return result


def _get_other_player_options(session: GameSession, player: PlayerState) -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "marbles": p.marbles, "points": p.points}
        for p in session.get_players()
        if p.id != player.id
    ]


def _swap_tile_effect(session: GameSession, tile_id: int):
    """Swap a revealed tile's effect with another unrevealed tile of the same category type."""
    if not session.board:
        return

    tile = session.board.tiles[tile_id]
    same_color_tiles = [
        t for t in session.board.tiles.values()
        if t.color == tile.color and t.id != tile_id and not t.is_revealed
    ]

    if same_color_tiles:
        swap_target = random.choice(same_color_tiles)
        tile.effect, swap_target.effect = swap_target.effect, tile.effect
        tile.category, swap_target.category = swap_target.category, tile.category
        tile.is_revealed = False
