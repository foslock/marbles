import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class LtmGameEvent(Base):
    __tablename__ = "ltm_game_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ltm_sessions.id", ondelete="CASCADE")
    )
    turn_number: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(50))  # roll, move, tile_effect, battle, minigame
    player_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["LtmSession"] = relationship(  # noqa: F821
        "LtmSession", back_populates="events"
    )
