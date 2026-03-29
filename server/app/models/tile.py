import uuid

from sqlalchemy import String, Integer, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class LtmTile(Base):
    __tablename__ = "ltm_tiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ltm_sessions.id", ondelete="CASCADE")
    )
    tile_index: Mapped[int] = mapped_column(Integer)  # board-local tile ID
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(30))  # neutral, positive_minor, etc.
    color: Mapped[str] = mapped_column(String(10))  # green, red, neutral
    effect: Mapped[str] = mapped_column(String(50))
    is_fork: Mapped[bool] = mapped_column(Boolean, default=False)
    is_merge: Mapped[bool] = mapped_column(Boolean, default=False)
    is_revealed: Mapped[bool] = mapped_column(Boolean, default=False)

    session: Mapped["LtmSession"] = relationship(  # noqa: F821
        "LtmSession", back_populates="tiles"
    )


class LtmTileEdge(Base):
    __tablename__ = "ltm_tile_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ltm_sessions.id", ondelete="CASCADE")
    )
    from_tile_index: Mapped[int] = mapped_column(Integer)
    to_tile_index: Mapped[int] = mapped_column(Integer)
