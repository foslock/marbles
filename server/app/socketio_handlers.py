"""Socket.IO event handlers for Losing Their Marbles."""

import asyncio
import random
import logging
from collections import deque
import socketio

from .game.state import session_manager, PlayerState
from .game.passphrase import generate_passphrase
from .game.effects import process_tile_effect, apply_choice_effect, swap_tile_effect
from .game.battle import check_for_battle
from .game.minigames.base import (
    select_random_minigame,
    calculate_rankings,
    apply_minigame_prizes,
)
from .game.cpu import run_cpu_turn, cpu_minigame_score
from .board.pathfinding import get_reachable_tiles as _get_reachable_tiles_impl

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
    target_marbles = data.get("targetMarbles", 5)

    # Generate unique passphrase
    for _ in range(100):
        passphrase = generate_passphrase()
        if not session_manager.get_session_by_passphrase(passphrase):
            break

    session = session_manager.create_session(passphrase, target_marbles)

    # Add host as player
    name = data.get("name", "Player 1")[:12]
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
    name = data.get("name", "Player")[:12]
    role = data.get("role", "player")

    session = session_manager.get_session_by_passphrase(passphrase)
    if not session:
        await sio.emit("error", {"message": "Session not found. Check your passphrase!"}, to=sid)
        return

    if role == "player" and session.state != "lobby":
        await sio.emit("error", {"message": "Game already in progress! You can join as a spectator."}, to=sid)
        return

    if role == "player" and len(session.get_players()) >= 10:
        await sio.emit("error", {"message": "Game is full! Maximum 10 players."}, to=sid)
        return

    if role == "spectator" and len(session.get_spectators()) >= 10:
        await sio.emit("error", {"message": "Spectator slots full! Maximum 10 spectators."}, to=sid)
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
async def update_target_marbles(sid, data):
    """Host adjusts the target marble count while in the lobby."""
    lookup = session_manager.sid_to_player.get(sid)
    if not lookup:
        return
    session_id, player_id = lookup
    session = session_manager.sessions.get(session_id)
    if not session or session.state != "lobby":
        return
    if player_id != session.host_id:
        await sio.emit("error", {"message": "Only the host can change settings."}, to=sid)
        return
    value = data.get("targetMarbles")
    if not isinstance(value, int) or value < 3 or value > 25:
        return
    session.target_marbles = value
    await sio.emit("lobby_update", session.to_lobby_dict(), room=session.id)


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

    if len(session.get_players()) >= 10:
        await sio.emit("error", {"message": "Game is full! Maximum 10 players."}, to=sid)
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
async def remove_cpu_player(sid, data):
    """Host removes a CPU player from the lobby."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.host_id != player_id:
        await sio.emit("error", {"message": "Only the host can remove CPU players."}, to=sid)
        return

    if session.state != "lobby":
        await sio.emit("error", {"message": "Can only remove CPU players in the lobby."}, to=sid)
        return

    target_id = data.get("playerId")
    target = session.players.get(target_id)
    if not target or not target.is_cpu:
        await sio.emit("error", {"message": "Player not found or not a CPU."}, to=sid)
        return

    del session.players[target_id]
    await sio.emit("lobby_update", session.to_lobby_dict(), room=session_id)


@sio.event
async def lobby_tap(sid, data):
    """Broadcast a lobby tap to all players for the floating emoji effect."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return
    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session:
        return
    if session.state != "lobby":
        return
    player = session.players.get(player_id)
    if not player:
        return
    # Determine emoji based on role
    if player_id == session.host_id:
        emoji = "\U0001f451"
    elif player.is_cpu:
        emoji = "\U0001f916"
    else:
        emoji = "\U0001f3ae"
    await sio.emit("lobby_tap", {
        "playerId": player_id,
        "emoji": emoji,
        "x": data.get("x", 50),
        "y": data.get("y", 50),
    }, room=session_id, skip_sid=sid)


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


## ── Shared turn-action functions ────────────────────────────────────────────
# These are the core game-logic operations used by both human socket handlers
# and CPU turns.  Handlers validate the caller, then delegate here.


async def _do_roll_dice(session, player_id):
    """Roll dice for player.  Emits dice_rolled to room.

    Returns a dict: {type, roll, dice, reachable, dizzy, shortStop}
    For advantage type, reachable is [] — caller must go through _do_choose_advantage.
    """
    player = session.players[player_id]

    # ── Advantage roll ──────────────────────────────────────────────────────
    if player.modifiers.get("advantage", 0) > 0:
        roll1 = random.randint(1, 6)
        roll2 = random.randint(1, 6)
        player.modifiers["advantage"] -= 1
        dice_info = {"roll": roll1, "dice": [roll1, roll2], "type": "advantage"}

        await sio.emit("dice_rolled", {
            "playerId": player_id,
            "playerName": player.name,
            **dice_info,
            "reachableTiles": [],
        }, room=session.id)
        await _persist_event(session.id, session.turn_number, "roll", player_id, dice_info)
        return {
            "type": "advantage", "roll": roll1, "dice": [roll1, roll2],
            "reachable": [], "dizzy": False, "shortStop": False,
        }

    # ── Double / Normal roll ────────────────────────────────────────────────
    if player.modifiers.get("double_dice", 0) > 0:
        roll1 = random.randint(1, 6)
        roll2 = random.randint(1, 6)
        roll = roll1 + roll2
        player.modifiers["double_dice"] -= 1
        dice_info = {"roll": roll, "dice": [roll1, roll2], "type": "double"}
    else:
        roll = random.randint(1, 6)
        dice_info = {"roll": roll, "dice": [roll], "type": "normal"}

    # Short stop: player can stop on any tile 1..N steps away
    has_short_stop = player.modifiers.get("short_stop", 0) > 0
    if has_short_stop:
        reachable = []
        seen_ids: set[int] = set()
        for dist in range(1, roll + 1):
            for tile_info in _get_reachable_tiles(session, player.current_tile, dist):
                if tile_info["tileId"] not in seen_ids:
                    seen_ids.add(tile_info["tileId"])
                    reachable.append(tile_info)
        player.modifiers["short_stop"] -= 1
        dice_info["shortStop"] = True
    else:
        reachable = _get_reachable_tiles(session, player.current_tile, roll)

    # Dizzy: server auto-picks a random destination
    has_dizzy = player.modifiers.get("dizzy", 0) > 0
    if has_dizzy:
        player.modifiers["dizzy"] -= 1
        dice_info["dizzy"] = True

    await sio.emit("dice_rolled", {
        "playerId": player_id,
        "playerName": player.name,
        **dice_info,
        "reachableTiles": reachable,
    }, room=session.id)

    await _persist_event(session.id, session.turn_number, "roll", player_id, dice_info)

    return {
        "type": dice_info["type"], "roll": dice_info["roll"],
        "dice": dice_info["dice"], "reachable": reachable,
        "dizzy": has_dizzy, "shortStop": has_short_stop,
    }


async def _do_choose_advantage(session, player_id, chosen_roll):
    """Process advantage die choice.  Emits advantage_chosen to room.

    Returns dict: {reachable, dizzy}
    """
    player = session.players[player_id]

    has_short_stop = player.modifiers.get("short_stop", 0) > 0
    if has_short_stop:
        reachable = []
        seen_ids: set[int] = set()
        for dist in range(1, chosen_roll + 1):
            for tile_info in _get_reachable_tiles(session, player.current_tile, dist):
                if tile_info["tileId"] not in seen_ids:
                    seen_ids.add(tile_info["tileId"])
                    reachable.append(tile_info)
        player.modifiers["short_stop"] -= 1
    else:
        reachable = _get_reachable_tiles(session, player.current_tile, chosen_roll)

    has_dizzy = player.modifiers.get("dizzy", 0) > 0
    if has_dizzy:
        player.modifiers["dizzy"] -= 1

    await sio.emit("advantage_chosen", {
        "playerId": player_id,
        "roll": chosen_roll,
        "reachableTiles": reachable,
        "dizzy": has_dizzy,
    }, room=session.id)

    return {"reachable": reachable, "dizzy": has_dizzy}


async def _do_choose_move(session, player_id, target_tile, path, dizzy=False):
    """Move player to tile, check battle, process tile effect.

    Emits player_moved and tile_effect.  Sets pending state for turn_complete.
    Does NOT emit awaiting_choice — caller must handle that.
    Returns the effect_result dict.
    """
    player = session.players[player_id]
    from_tile = player.current_tile
    player.current_tile = target_tile

    move_payload = {
        "playerId": player_id,
        "playerName": player.name,
        "tileId": target_tile,
        "fromTile": from_tile,
        "path": path,
    }
    if dizzy:
        move_payload["dizzy"] = True

    await sio.emit("player_moved", move_payload, room=session.id)

    # ── Battle check ────────────────────────────────────────────────────────
    battle = check_for_battle(session, player)
    if battle:
        await sio.emit("tile_effect", {
            "playerId": player_id,
            "playerName": player.name,
            "type": "battle",
            "category": "neutral",
            "color": "neutral",
            "message": battle["message"],
        }, room=session.id)

        await _persist_event(session.id, session.turn_number, "move", player_id, {
            "from": from_tile, "to": target_tile, "effect": "battle",
        })

        session._pending_swap_tile_id = None
        session._pending_turn_player_id = player_id
        session._pending_turn_action = "battle"
        session._pending_battle = battle
        return {"type": "battle", "requiresChoice": False}

    # ── Tile effect ─────────────────────────────────────────────────────────
    effect_result = process_tile_effect(session, player)
    await sio.emit("tile_effect", {
        "playerId": player_id,
        "playerName": player.name,
        **effect_result,
    }, room=session.id)

    await _persist_event(session.id, session.turn_number, "move", player_id, {
        "from": from_tile, "to": target_tile, "effect": effect_result.get("type"),
    })

    session._pending_swap_tile_id = target_tile
    session._pending_turn_player_id = player_id
    session._pending_turn_action = "swap"

    return effect_result


async def _do_make_choice(session, player_id, choice_type, target_id, amount=None):
    """Apply a choice effect.  Emits choice_resolved to room.  Returns result dict."""
    player = session.players[player_id]
    result = apply_choice_effect(session, player, choice_type, target_id, amount)

    await sio.emit("choice_resolved", {
        "playerId": player_id,
        "playerName": player.name,
        **result,
    }, room=session.id)

    return result


async def _do_turn_complete(session):
    """Process pending turn completion: swap / battle / advance.

    Called by the turn_complete socket handler and by CPU turns.
    """
    pending_player_id = getattr(session, "_pending_turn_player_id", None)
    if not pending_player_id:
        return

    player = session.players.get(pending_player_id)
    if not player:
        return

    action = getattr(session, "_pending_turn_action", None)

    # Clear pending state
    session._pending_turn_player_id = None
    session._pending_turn_action = None

    if action == "swap":
        await _perform_tile_swap(session, pending_player_id)
        await _end_and_send(session)
    elif action == "battle":
        pending_battle = getattr(session, "_pending_battle", None)
        session._pending_battle = None
        if pending_battle:
            await _start_minigame(session, pending_battle)
        else:
            _end_turn(session)
            await _send_turn_update(session)
            await _persist_session(session)
    elif action == "advance":
        await _end_and_send(session)


# ── Socket event handlers (thin wrappers around shared functions) ──────────


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

    result = await _do_roll_dice(session, player_id)

    if result["type"] == "advantage":
        return  # Wait for choose_advantage event

    # If dizzy, auto-move to a random reachable tile
    if result["dizzy"] and result["reachable"]:
        await asyncio.sleep(1.5)
        chosen = random.choice(result["reachable"])
        effect_result = await _do_choose_move(
            session, player_id, chosen["tileId"], chosen["path"], dizzy=True,
        )
        if effect_result.get("requiresChoice"):
            await sio.emit("awaiting_choice", {
                "playerId": player_id,
                **effect_result,
            }, to=sid)


@sio.event
async def choose_advantage(sid, data):
    """Player picks which die to use from an advantage roll."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.state != "playing":
        return

    if session.current_turn_player_id != player_id:
        return

    chosen_roll = data.get("roll")
    if not isinstance(chosen_roll, int) or chosen_roll < 1 or chosen_roll > 6:
        return

    result = await _do_choose_advantage(session, player_id, chosen_roll)

    # If dizzy, auto-move to a random reachable tile
    if result["dizzy"] and result["reachable"]:
        await asyncio.sleep(1.5)
        chosen = random.choice(result["reachable"])
        effect_result = await _do_choose_move(
            session, player_id, chosen["tileId"], chosen["path"], dizzy=True,
        )
        if effect_result.get("requiresChoice"):
            await sio.emit("awaiting_choice", {
                "playerId": player_id,
                **effect_result,
            }, to=sid)


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

    effect_result = await _do_choose_move(session, player_id, target_tile, path)

    if effect_result.get("requiresChoice"):
        await sio.emit("awaiting_choice", {
            "playerId": player_id,
            **effect_result,
        }, to=sid)


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

    choice_type = data.get("choiceType")
    target_id = data.get("targetId")
    amount = data.get("amount")

    await _do_make_choice(session, player_id, choice_type, target_id, amount)


@sio.event
async def turn_complete(sid, data):
    """Client signals that the turn's overlays are dismissed. Perform swap + advance."""
    player_mapping = session_manager.sid_to_player.get(sid)
    if not player_mapping:
        return

    session_id, player_id = player_mapping
    session = session_manager.get_session(session_id)
    if not session or session.state != "playing":
        return

    await _do_turn_complete(session)


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
    if set(session._minigame_participants) <= set(session._minigame_scores.keys()):
        participant_scores = {pid: session._minigame_scores[pid] for pid in session._minigame_participants if pid in session._minigame_scores}
        player_names = {pid: session.players[pid].name for pid in participant_scores}
        bonus = getattr(session, '_minigame_bonus', False)
        result = calculate_rankings(participant_scores, player_names, bonus=bonus)
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

        # Don't advance turn yet — wait for client to dismiss results overlay
        session._pending_turn_player_id = session.current_turn_player_id
        session._pending_turn_action = "advance"


async def _perform_tile_swap(session, player_id):
    """Perform the deferred tile swap and emit tile_swap animation event."""
    swap_tile_id = getattr(session, "_pending_swap_tile_id", None)
    if swap_tile_id is None or not session.board:
        return

    session._pending_swap_tile_id = None

    tile = session.board.tiles.get(swap_tile_id)
    if not tile:
        return

    # Remember the tile color before swap for animation
    original_color = tile.color.value

    board_updates = swap_tile_effect(session, swap_tile_id)
    if not board_updates:
        return

    # Find the target tile (the one that changed to a non-neutral color)
    target_tile_id = None
    for update in board_updates:
        if update["id"] != swap_tile_id and update["color"] != "neutral":
            target_tile_id = update["id"]
            break

    await sio.emit("tile_swap", {
        "sourceTileId": swap_tile_id,
        "targetTileId": target_tile_id,
        "color": original_color,
        "boardUpdates": board_updates,
    }, room=session.id)


async def _start_minigame(session, battle):
    """Start a minigame from a battle. ALL players participate, not just those on the tile."""
    minigame = select_random_minigame()
    bonus = battle.get("bonus", False)

    # All non-spectator players participate in every minigame
    all_players = [p.id for p in session.get_players()]
    session._minigame_participants = all_players
    session._minigame_scores = {}
    session._minigame_bonus = bonus

    await sio.emit("minigame_start", {
        "minigame": minigame,
        "participants": all_players,
        "message": battle["message"],
        "bonus": bonus,
    }, room=session.id)

    # Auto-submit scores for any CPU participants immediately
    for pid in all_players:
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

        # Check if any human players are in the session to dismiss results
        has_human = any(
            not p.is_cpu and p.role == "player"
            for p in session.players.values()
        )
        if has_human:
            session._pending_turn_player_id = session.current_turn_player_id
            session._pending_turn_action = "advance"
        else:
            await asyncio.sleep(3.0)
            _end_turn(session)
            await _send_turn_update(session)


async def _end_and_send(session):
    """Check for winner, then advance turn and notify clients."""
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
    _end_turn(session)
    await _send_turn_update(session)
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
            session,
            player,
            do_roll_dice=_do_roll_dice,
            do_choose_advantage=_do_choose_advantage,
            do_choose_move=_do_choose_move,
            do_make_choice=_do_make_choice,
            do_turn_complete=_do_turn_complete,
            end_and_send=_end_and_send,
        )
    except Exception as e:
        logger.error(f"CPU turn error for {player.name}: {e}", exc_info=True)


def _get_reachable_tiles(session, start_tile: int, steps: int) -> list[dict]:
    """BFS wrapper — delegates to board.pathfinding."""
    return _get_reachable_tiles_impl(session.board, start_tile, steps)
