import uuid

from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class LtmPlayer(Base, TimestampMixin):
    __tablename__ = "ltm_players"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ltm_sessions.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(50))
    role: Mapped[str] = mapped_column(String(20), default="player")  # player, spectator
    token_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    turn_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_tile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    marbles: Mapped[int] = mapped_column(Integer, default=0)
    points: Mapped[int] = mapped_column(Integer, default=0)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=True)

    # Modifiers stored as JSON
    modifiers: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {
            "advantage": 0,
            "protection": 0,
            "double_dice": 0,
            "short_stop": 0,
            "dizzy": 0,
        },
    )

    session: Mapped["LtmSession"] = relationship(  # noqa: F821
        "LtmSession", back_populates="players"
    )
