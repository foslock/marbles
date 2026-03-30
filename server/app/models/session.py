import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class LtmSession(Base, TimestampMixin):
    __tablename__ = "ltm_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    passphrase: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    host_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    state: Mapped[str] = mapped_column(
        String(20), default="lobby"
    )  # lobby, playing, finished
    target_marbles: Mapped[int] = mapped_column(Integer, default=5)
    current_turn_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    turn_order: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    board_seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    players: Mapped[list["LtmPlayer"]] = relationship(  # noqa: F821
        "LtmPlayer", back_populates="session", cascade="all, delete-orphan"
    )
    tiles: Mapped[list["LtmTile"]] = relationship(  # noqa: F821
        "LtmTile", back_populates="session", cascade="all, delete-orphan"
    )
    events: Mapped[list["LtmGameEvent"]] = relationship(  # noqa: F821
        "LtmGameEvent", back_populates="session", cascade="all, delete-orphan"
    )
