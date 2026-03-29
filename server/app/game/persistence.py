"""Database persistence for game sessions.

Saves in-memory game state to PostgreSQL for recovery after server restarts
or player disconnects. State is persisted at key moments:
- Session creation
- Game start
- End of each turn
- Game over
"""

import json
import uuid
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.session import LtmSession
from ..models.player import LtmPlayer
from ..models.tile import LtmTile, LtmTileEdge
from ..models.game_event import LtmGameEvent
from .state import GameSession, PlayerState, SessionManager


async def save_session(db: AsyncSession, session: GameSession):
    """Persist a game session and all its players to the database."""
    db_session = await db.get(LtmSession, uuid.UUID(session.id))
    if not db_session:
        db_session = LtmSession(
            id=uuid.UUID(session.id),
            passphrase=session.passphrase,
            host_player_id=uuid.UUID(session.host_id) if session.host_id else None,
            state=session.state,
            target_marbles=session.target_marbles,
            current_turn_player_id=uuid.UUID(session.current_turn_player_id) if session.current_turn_player_id else None,
            turn_order={"order": session.turn_order, "index": session.current_turn_index},
            board_seed=session.board_seed,
            settings={"turn_number": session.turn_number},
        )
        db.add(db_session)
    else:
        db_session.state = session.state
        db_session.host_player_id = uuid.UUID(session.host_id) if session.host_id else None
        db_session.current_turn_player_id = uuid.UUID(session.current_turn_player_id) if session.current_turn_player_id else None
        db_session.turn_order = {"order": session.turn_order, "index": session.current_turn_index}
        db_session.settings = {"turn_number": session.turn_number}

    # Upsert players
    for player in session.players.values():
        db_player = await db.get(LtmPlayer, uuid.UUID(player.id))
        if not db_player:
            db_player = LtmPlayer(
                id=uuid.UUID(player.id),
                session_id=uuid.UUID(session.id),
                name=player.name,
                role=player.role,
                token_id=player.token["id"] if player.token else None,
                turn_order=player.turn_order,
                current_tile_id=player.current_tile,
                marbles=player.marbles,
                points=player.points,
                is_connected=player.is_connected,
                modifiers=player.modifiers,
            )
            db.add(db_player)
        else:
            db_player.current_tile_id = player.current_tile
            db_player.marbles = player.marbles
            db_player.points = player.points
            db_player.is_connected = player.is_connected
            db_player.modifiers = player.modifiers

    await db.commit()


async def save_board(db: AsyncSession, session: GameSession):
    """Persist the board tiles and edges to the database."""
    if not session.board:
        return

    session_uuid = uuid.UUID(session.id)

    # Clear existing tiles/edges for this session
    await db.execute(
        delete(LtmTileEdge).where(LtmTileEdge.session_id == session_uuid)
    )
    await db.execute(
        delete(LtmTile).where(LtmTile.session_id == session_uuid)
    )

    for tile in session.board.tiles.values():
        db_tile = LtmTile(
            session_id=session_uuid,
            tile_index=tile.id,
            x=tile.x,
            y=tile.y,
            category=tile.category.value,
            color=tile.color.value,
            effect=tile.effect,
            is_fork=tile.is_fork,
            is_merge=tile.is_merge,
        )
        db.add(db_tile)

        for neighbor_id in tile.neighbors:
            db_edge = LtmTileEdge(
                session_id=session_uuid,
                from_tile_index=tile.id,
                to_tile_index=neighbor_id,
            )
            db.add(db_edge)

    await db.commit()


async def load_session(db: AsyncSession, passphrase: str) -> GameSession | None:
    """Load a game session from the database by passphrase."""
    from ..board.generator import generate_board
    from ..board.tokens import TOKENS

    result = await db.execute(
        select(LtmSession).where(
            LtmSession.passphrase == passphrase,
            LtmSession.state != "finished",
        )
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        return None

    session = GameSession(
        id=str(db_session.id),
        passphrase=db_session.passphrase,
        host_id=str(db_session.host_player_id) if db_session.host_player_id else None,
        state=db_session.state,
        target_marbles=db_session.target_marbles,
        board_seed=db_session.board_seed,
    )

    # Restore turn state
    if db_session.turn_order:
        session.turn_order = db_session.turn_order.get("order", [])
        session.current_turn_index = db_session.turn_order.get("index", 0)
    if db_session.settings:
        session.turn_number = db_session.settings.get("turn_number", 0)

    # Restore board from seed
    if db_session.board_seed is not None:
        session.board = generate_board(seed=db_session.board_seed)

    # Restore players
    players_result = await db.execute(
        select(LtmPlayer).where(LtmPlayer.session_id == db_session.id)
    )
    token_map = {t["id"]: t for t in TOKENS}

    for db_player in players_result.scalars():
        player = PlayerState(
            id=str(db_player.id),
            sid="",  # Will be set on reconnect
            name=db_player.name,
            role=db_player.role,
            token=token_map.get(db_player.token_id) if db_player.token_id else None,
            turn_order=db_player.turn_order,
            current_tile=db_player.current_tile_id or 0,
            marbles=db_player.marbles,
            points=db_player.points,
            is_connected=False,  # Not connected until they reconnect
            modifiers=db_player.modifiers or {
                "rerolls": 0, "protection": 0, "double_dice": 0, "worst_dice": 0,
            },
        )
        session.players[player.id] = player

    return session


async def log_event(
    db: AsyncSession, session_id: str, turn_number: int,
    event_type: str, player_id: str | None, data: dict | None
):
    """Log a game event to the database."""
    event = LtmGameEvent(
        session_id=uuid.UUID(session_id),
        turn_number=turn_number,
        event_type=event_type,
        player_id=uuid.UUID(player_id) if player_id else None,
        data=data,
    )
    db.add(event)
    await db.commit()
