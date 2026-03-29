"""Tile-collision check for Losing Their Marbles.

When a player lands on a tile that already has other players, a minigame
is triggered.  If three or more players share the tile the minigame prizes
are doubled (bonus round).
"""

from .state import GameSession, PlayerState


def check_for_battle(session: GameSession, player: PlayerState) -> dict | None:
    """Return a minigame descriptor if another player occupies the same tile.

    Returns None if the tile is unoccupied by other players.
    The returned dict always has type "minigame".  When three or more players
    share the tile the "bonus" flag is set so the prize pool is doubled.
    """
    others_on_tile = [
        p for p in session.get_players()
        if p.current_tile == player.current_tile and p.id != player.id
    ]

    if not others_on_tile:
        return None

    # 3+ players on the same tile → double prizes
    bonus = len(others_on_tile) >= 2
    count = len(others_on_tile) + 1

    if bonus:
        message = f"{count} players on the same tile — BONUS ROUND! 2× prizes!"
    else:
        message = "Someone's already here! Time for a minigame!"

    return {
        "type": "minigame",
        "participants": [player.id] + [p.id for p in others_on_tile],
        "message": message,
        "bonus": bonus,
    }
