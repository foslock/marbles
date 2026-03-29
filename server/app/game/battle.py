"""Battle system for when players land on the same tile."""

import random
from .state import GameSession, PlayerState


PRIZE_DIE_OPTIONS = [10, 15, 20, 25, 30, 50]


def check_for_battle(session: GameSession, player: PlayerState) -> dict | None:
    """Check if the player's tile has other players, triggering a battle or minigame."""
    others_on_tile = [
        p for p in session.get_players()
        if p.current_tile == player.current_tile and p.id != player.id
    ]

    if not others_on_tile:
        return None

    total_players = len(session.get_players())

    # If game has only 2 players, always minigame
    if total_players == 2:
        return {
            "type": "minigame",
            "participants": [player.id] + [p.id for p in others_on_tile],
            "message": "Battle! Time for a minigame!",
        }

    # If more than 1 other player on tile (3+ total on tile), minigame
    if len(others_on_tile) >= 2:
        return {
            "type": "minigame",
            "participants": [player.id] + [p.id for p in others_on_tile],
            "message": f"Crowded tile! {len(others_on_tile) + 1} players face off in a minigame!",
        }

    # Exactly 1 other player, game has 3+ players: dice battle
    opponent = others_on_tile[0]
    return {
        "type": "dice_battle",
        "participants": [player.id, opponent.id],
        "opponent": {"id": opponent.id, "name": opponent.name},
        "message": f"Battle! Roll-off against {opponent.name}!",
    }


def resolve_dice_battle(
    session: GameSession, player_id: str, opponent_id: str
) -> dict:
    """Resolve a dice battle between two players."""
    player = session.players[player_id]
    opponent = session.players[opponent_id]

    player_roll = random.randint(1, 6)
    opponent_roll = random.randint(1, 6)

    # Re-roll on ties
    while player_roll == opponent_roll:
        player_roll = random.randint(1, 6)
        opponent_roll = random.randint(1, 6)

    if player_roll > opponent_roll:
        winner, loser = player, opponent
    else:
        winner, loser = opponent, player

    # Prize die
    prize = random.choice(PRIZE_DIE_OPTIONS)
    actual_prize = min(prize, loser.points)  # Can't steal more than they have
    loser.points = max(0, loser.points - prize)
    winner.points += actual_prize

    return {
        "type": "dice_battle_result",
        "playerRoll": player_roll,
        "opponentRoll": opponent_roll,
        "winnerId": winner.id,
        "winnerName": winner.name,
        "loserId": loser.id,
        "loserName": loser.name,
        "prizeRoll": prize,
        "actualPrize": actual_prize,
        "message": f"{winner.name} wins! Rolled {max(player_roll, opponent_roll)} vs {min(player_roll, opponent_roll)}. Stole {actual_prize} points!",
    }
