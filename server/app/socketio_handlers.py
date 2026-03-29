"""Socket.IO event handlers for Losing Their Marbles."""

import asyncio
import random
import logging
import socketio

from .game.state import session_manager, PlayerState
from .game.passphrase import generate_passphrase
from .game.effects import process_tile_effect, apply_choice_effect
from .game.battle import check_for_battle
from .game.minigames.base import (
    select_random_minigame,
    calculate_rankings,
    apply_minigame_prizes,
)
from .game.cpu import run_cpu_turn, cpu_minigame_score

logger = logging.getLogger("ltm")

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[],  # Allow all for dev; restrict in production
)


async def _persist_session(session):
    """Best-effort persist session to DB. Non-blocking — failures are logged, not raised."""
    try:
        from .database import async_session
        from .game.persistence import save_session
        async with async_session() as db:
            await save_session(db, session)
    except Exception as e:
        logger.warning(f"Failed to persist session {session.id}: {e}")


async def _persist_board(session):
    """Best-effort persist board to DB."""
    try:
        from .database import async_session
        from .game.persistence import save_board
        async with async_session() as db:
            await save_board(db, session)
    except Exception as e:
        logger.warning(f"Failed to persist board {session.id}: {e}")


async def _persist_event(session_id, turn_number, event_type, player_id, data):
    """Best-effort log a game event to DB."""
    try:
        from .database import async_session
        from .game.persistence import log_event
        async with async_session() as db:
            await log_event(db, session_id, turn_number, event_type, player_id, data)
    except Exception as e:
        logger.warning(f"Failed to log event: {e}")


@sio.event
async def connect(sid, environ):
    logger.info(f"[connect] {sid}")


@sio.event
async def disconnect(sid):
    logger.info(f"[disconnect] {sid}")
    result = session_manager.remove_player_by_sid(sid)
    if result:
        session_id, player = result
        session = session_manager.get_session(session_id)
        if session:
            await sio.emit(
                "player_disconnected",
                {"playerId": player.id, "name": player.name},
                room=session_id,
            )
            await sio.emit("lobby_update", session.to_lobby_dict(), room=session_id)
            await _persist_session(session)


@sio.event
async def create_session(sid, data):
    """Host creates a new game session."""
    target_marbles = data.get("targetMarbles", 10)

    # Generate unique passphrase
    for _ in range(100):
        passphrase = generate_passphrase()
        if not session_manager.get_session_by_passphrase(passphrase):
            break

    session = session_manager.create_session(passphrase, target_marbles)

    # Add host as player
    name = data.get("name", "Player 1")
    player = session_manager.add_player(session.id, sid, name, "player")

    await sio.enter_room(sid, session.id)

    await sio.emit("session_created", {
        "sessionId": session.id,
        "passphrase": session.passphrase,
        "playerId": player.id,
        "lobby": session.to_lobby_dict(),
    }, to=sid)

    await _persist_session(session)


@sio.event
async def join_session(sid, data):
    """Player or spectator joins an existing session."""
    passphrase = data.get("passphrase", "").strip().lower()
    name = data.get("name", "Player")
    role = data.get("role", "player")

    session = session_manager.get_session_by_passphrase(passphrase)
    if not session:
        await sio.emit("error", {"message": "Session not found. Check your passphrase!"}, to=sid)
        return

    if role == "player" and session.state != "lobby":
        await sio.emit("error", {"message": "Game already in progress! You can join as a spectator."}, to=sid)
        return

    if role == "player" and len(session.get_players()) >= 8:
        await sio.emit("error", {"message": "Game is full! Maximum 8 players."}, to=sid)
        return

    player = session_manager.add_player(session.id, sid, name, role)

    await sio.enter_room(sid, session.id)

    await sio.emit("joined_session", {
        "sessionId": session.id,
        "playerId": player.id,
        "lobby": session.to_lobby_dict(),
    }, to=sid)

    # Notify others
    await sio.emit("player_joined", {
        "playerId": player.id,
        "name": player.name,
        "role": role,
    }, room=session.id, skip_sid=sid)

    await sio.emit("lobby_update", session.to_lobby_dict(), room=session.id)

    # If spectator joins mid-game, send current game state
    if role == "spectator" and session.state == "playing":
        await sio.emit("game_state", session.to_game_dict(), to=sid)

    await _persist_session(session)


@sio.event
async def reconnect_session(sid, data):
    """Player reconnects to an in-progress session."""
    passphrase = data.get("passphrase", "").strip().lower()
    player_id = data.get("playerId", "")

    session = session_manager.get_session_by_passphrase(passphrase)
    if not session:
        await sio.emit("error", {"message": "Session not found."}, to=sid)
        return

    player = session.players.get(player_id)
    if not player:
        await sio.emit("error", {"message": "Player not found in this session."}, to=sid)
        return

    # Update socket mapping
    player.sid = sid
    player.is_connected = True
    session_manager.sid_to_player[sid] = (session.id, player.id)

    await sio.enter_room(sid, session.id)

    # Send current state based on game phase
    if session.state == "lobby":
        await sio.emit("joined_session", {
            "sessionId": session.id,
            "playerId": player.id,
            "lobby": session.to_lobby_dict(),
        }, to=sid)
    else:
        await sio.emit("joined_session", {
            "sessionId": session.id,
            "playerId": player.id,
            "lobby": session.to_lobby_dict(),
        }, to=sid)
        await sio.emit("game_state", session.to_game_dict(), to=sid)

    await sio.emit("player_reconnected", {
        "playerId": player.id,
        "name": player.name,
    }, room=session.id, skip_sid=sid)

    await _persist_session(session)


@sio.event
async def start_game(sid, data):
    """Host starts the game."""
    session_id = data.get("sessionId")
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id_actual, player_id = player_mapping
    session = session_manager.get_session(session_id_actual)
    if not session or session.host_id != player_id:
        await sio.emit("error", {"message": "Only the host can start the game."}, to=sid)
        return

    result = session_manager.start_game(session_id_actual)
    if not result:
        await sio.emit("error", {"message": "Need at least 2 players to start."}, to=sid)
        return

    await sio.emit("game_started", session.to_game_dict(), room=session_id_actual)

    # If the first player is a CPU, schedule their turn
    first_player_id = session.current_turn_player_id
    if first_player_id:
        first_player = session.players.get(first_player_id)
        if first_player and first_player.is_cpu:
            asyncio.create_task(_run_cpu_turn_task(session, first_player))

    # Persist game start
    await _persist_session(session)
    await _persist_board(session)
    await _persist_event(session.id, 0, "game_started", None, {
        "playerCount": len(session.get_players()),
        "targetMarbles": session.target_marbles,
    })


@sio.event
async def add_cpu_player(sid, data):
    """Host adds a CPU player to the lobby."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.host_id != player_id:
        await sio.emit("error", {"message": "Only the host can add CPU players."}, to=sid)
        return

    if session.state != "lobby":
        await sio.emit("error", {"message": "Can only add CPU players in the lobby."}, to=sid)
        return

    if len(session.get_players()) >= 8:
        await sio.emit("error", {"message": "Game is full! Maximum 8 players."}, to=sid)
        return

    cpu_number = sum(1 for p in session.get_players() if p.is_cpu) + 1
    cpu_name = f"CPU {cpu_number}"

    import uuid
    cpu_id = str(uuid.uuid4())
    cpu_player = PlayerState(
        id=cpu_id,
        sid="",
        name=cpu_name,
        role="player",
        is_cpu=True,
        is_connected=True,
    )
    session.players[cpu_id] = cpu_player

    await sio.emit("lobby_update", session.to_lobby_dict(), room=session_id)


@sio.event
async def end_game(sid, data):
    """Host forcibly ends the game, clearing all server state."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.host_id != player_id:
        await sio.emit("error", {"message": "Only the host can end the game."}, to=sid)
        return

    # Notify everyone before tearing down
    await sio.emit("game_ended", {"message": "The host ended the game."}, room=session_id)

    # Remove session and all player mappings
    session_manager.delete_session(session_id)

    # Clear the Socket.IO room
    await sio.close_room(session_id)


@sio.event
async def roll_dice(sid, data):
    """Player rolls the dice on their turn."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.state != "playing":
        return

    if session.current_turn_player_id != player_id:
        await sio.emit("error", {"message": "It's not your turn!"}, to=sid)
        return

    use_reroll = data.get("useReroll", False)
    player = session.players[player_id]

    if use_reroll and player.modifiers.get("rerolls", 0) <= 0:
        await sio.emit("error", {"message": "No re-rolls available!"}, to=sid)
        return

    # Determine dice behavior based on modifiers
    if player.modifiers.get("double_dice", 0) > 0:
        roll1 = random.randint(1, 6)
        roll2 = random.randint(1, 6)
        roll = roll1 + roll2
        player.modifiers["double_dice"] -= 1
        dice_info = {"roll": roll, "dice": [roll1, roll2], "type": "double"}
    elif player.modifiers.get("worst_dice", 0) > 0:
        roll1 = random.randint(1, 6)
        roll2 = random.randint(1, 6)
        roll = min(roll1, roll2)
        player.modifiers["worst_dice"] -= 1
        dice_info = {"roll": roll, "dice": [roll1, roll2], "type": "worst"}
    else:
        roll = random.randint(1, 6)
        dice_info = {"roll": roll, "dice": [roll], "type": "normal"}

    if use_reroll:
        player.modifiers["rerolls"] -= 1

    # Get reachable tiles for the player to choose direction
    reachable = _get_reachable_tiles(session, player.current_tile, roll)

    await sio.emit("dice_rolled", {
        "playerId": player_id,
        "playerName": player.name,
        **dice_info,
        "reachableTiles": reachable,
    }, room=session_id)

    await _persist_event(session_id, session.turn_number, "roll", player_id, dice_info)


@sio.event
async def choose_move(sid, data):
    """Player chooses which tile to move to after rolling."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.state != "playing":
        return

    target_tile = data.get("tileId")
    path = data.get("path", [])
    player = session.players[player_id]
    from_tile = player.current_tile
    player.current_tile = target_tile

    await sio.emit("player_moved", {
        "playerId": player_id,
        "playerName": player.name,
        "tileId": target_tile,
        "fromTile": from_tile,
        "path": path,
    }, room=session_id)

    # Process tile effect
    effect_result = process_tile_effect(session, player)
    await sio.emit("tile_effect", {
        "playerId": player_id,
        "playerName": player.name,
        **effect_result,
    }, room=session_id)

    await _persist_event(session_id, session.turn_number, "move", player_id, {
        "from": from_tile, "to": target_tile, "effect": effect_result.get("type"),
    })

    # If effect requires a choice, wait for it
    if effect_result.get("requiresChoice"):
        await sio.emit("awaiting_choice", {
            "playerId": player_id,
            **effect_result,
        }, to=sid)
        return

    # Check for battles
    await _check_battle_and_end_turn(session, player)


@sio.event
async def make_choice(sid, data):
    """Player makes a choice for an effect that requires one."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session:
        return

    player = session.players[player_id]
    choice_type = data.get("choiceType")
    target_id = data.get("targetId")
    amount = data.get("amount")

    result = apply_choice_effect(session, player, choice_type, target_id, amount)

    await sio.emit("choice_resolved", {
        "playerId": player_id,
        **result,
    }, room=session_id)

    # Now check for battles
    await _check_battle_and_end_turn(session, player)


@sio.event
async def submit_minigame_score(sid, data):
    """Player submits their minigame score."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session:
        return

    score = data.get("score", 0)
    minigame_id = data.get("minigameId")

    # Store score in a temp dict on the session
    if not hasattr(session, "_minigame_scores"):
        session._minigame_scores = {}
    if not hasattr(session, "_minigame_participants"):
        session._minigame_participants = []

    session._minigame_scores[player_id] = score

    # Check if all participants have submitted
    if set(session._minigame_scores.keys()) >= set(session._minigame_participants):
        player_names = {pid: session.players[pid].name for pid in session._minigame_scores}
        bonus = getattr(session, '_minigame_bonus', False)
        result = calculate_rankings(session._minigame_scores, player_names, bonus=bonus)
        apply_minigame_prizes(session, result)

        await sio.emit("minigame_results", {
            "rankings": result.rankings,
            "marbleBonus": result.marble_bonus,
            "bonus": bonus,
        }, room=session_id)

        await _persist_event(session_id, session.turn_number, "minigame", None, {
            "minigameId": minigame_id,
            "rankings": result.rankings,
            "marbleBonus": result.marble_bonus,
            "bonus": bonus,
        })

        # Clean up
        session._minigame_scores = {}
        session._minigame_participants = []
        session._minigame_bonus = False

        # End turn
        _end_turn(session)
        await _send_turn_update(session)


async def _check_battle_and_end_turn(session, player):
    """Check for tile collisions triggering a minigame, then end turn."""
    battle = check_for_battle(session, player)

    if battle:
        minigame = select_random_minigame()
        bonus = battle.get("bonus", False)
        session._minigame_participants = battle["participants"]
        session._minigame_scores = {}
        session._minigame_bonus = bonus

        await sio.emit("minigame_start", {
            "minigame": minigame,
            "participants": battle["participants"],
            "message": battle["message"],
            "bonus": bonus,
        }, room=session.id)

        # Auto-submit scores for any CPU participants immediately
        for pid in battle["participants"]:
            p = session.players.get(pid)
            if p and p.is_cpu:
                session._minigame_scores[pid] = cpu_minigame_score(minigame["type"])

        # If all participants are CPU, resolve immediately
        if set(session._minigame_scores.keys()) >= set(session._minigame_participants):
            player_names = {pid: session.players[pid].name for pid in session._minigame_scores}
            result = calculate_rankings(session._minigame_scores, player_names, bonus=bonus)
            apply_minigame_prizes(session, result)
            await sio.emit("minigame_results", {
                "rankings": result.rankings,
                "marbleBonus": result.marble_bonus,
                "bonus": bonus,
            }, room=session.id)
            session._minigame_scores = {}
            session._minigame_participants = []
            session._minigame_bonus = False
            _end_turn(session)
            await _send_turn_update(session)

        return  # Turn ends after minigame completes

    # Check for winner
    winner = session.check_winner()
    if winner:
        await sio.emit("game_over", {
            "winnerId": winner.id,
            "winnerName": winner.name,
            "players": session.to_game_dict()["players"],
        }, room=session.id)

        await _persist_event(session.id, session.turn_number, "game_over", winner.id, {})
        await _persist_session(session)
        return

    # Advance turn
    _end_turn(session)
    await _send_turn_update(session)

    # Persist at end of every turn
    await _persist_session(session)


def _end_turn(session):
    session.advance_turn()


async def _send_turn_update(session):
    await sio.emit("turn_update", {
        "currentTurnPlayerId": session.current_turn_player_id,
        "currentTurnIndex": session.current_turn_index,
        "turnNumber": session.turn_number,
        "players": session.to_game_dict()["players"],
    }, room=session.id)

    # If the next player is a CPU, schedule their turn automatically
    player_id = session.current_turn_player_id
    if player_id:
        player = session.players.get(player_id)
        if player and player.is_cpu:
            asyncio.create_task(_run_cpu_turn_task(session, player))


async def _run_cpu_turn_task(session, player):
    """Wrapper that runs a CPU turn as a background task."""
    try:
        await run_cpu_turn(
            sio,
            session,
            player,
            _get_reachable_tiles,
            _check_battle_and_end_turn,
        )
    except Exception as e:
        logger.error(f"CPU turn error for {player.name}: {e}", exc_info=True)


def _get_reachable_tiles(session, start_tile: int, steps: int) -> list[dict]:
    """BFS to find all tiles reachable in exactly `steps` moves (forward or backward).

    Once a direction is chosen, the player cannot backtrack to the tile they just
    came from. This ensures the player travels exactly `steps` tiles in a chosen
    direction rather than zig-zagging to reach closer tiles.
    """
    if not session.board:
        return []

    # BFS tracking: (current_tile, steps_remaining, path, came_from_tile)
    # came_from prevents backtracking to the immediately previous tile
    results = []
    visited = set()
    queue = [(start_tile, steps, [start_tile], None)]

    while queue:
        current, remaining, path, came_from = queue.pop(0)

        if remaining == 0:
            if current != start_tile:  # Can't stay in place
                results.append({
                    "tileId": current,
                    "path": path,
                })
            continue

        for neighbor in session.board.tiles[current].neighbors:
            if neighbor == came_from:
                continue  # No backtracking to the tile we just came from
            state = (neighbor, remaining - 1, current)
            if state not in visited:
                visited.add(state)
                queue.append((neighbor, remaining - 1, path + [neighbor], current))

    # Deduplicate by tile ID, keeping shortest path
    seen_tiles = {}
    for r in results:
        tid = r["tileId"]
        if tid not in seen_tiles or len(r["path"]) < len(seen_tiles[tid]["path"]):
            seen_tiles[tid] = r

    return list(seen_tiles.values())
