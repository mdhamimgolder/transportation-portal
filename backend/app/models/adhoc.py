"""Ad-hoc (emergency) transport requests — no approval step."""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AdhocRequest(Base):
    __tablename__ = "adhoc_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    request_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    arrival_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    employee = relationship("User", foreign_keys=[employee_id])
