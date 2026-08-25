"""Weekly transport requests and their per-day entries."""
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WeeklyRequest(Base):
    __tablename__ = "weekly_requests"
    __table_args__ = (
        UniqueConstraint("employee_id", "week_start_date", name="uq_weekly_employee_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)  # Monday
    status: Mapped[str] = mapped_column(String(20), default="submitted", nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remarks: Mapped[str | None] = mapped_column(String(500), nullable=True)

    employee = relationship("User", foreign_keys=[employee_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    days = relationship(
        "WeeklyRequestDay",
        back_populates="weekly_request",
        cascade="all, delete-orphan",
        order_by="WeeklyRequestDay.day_date",
    )


class WeeklyRequestDay(Base):
    __tablename__ = "weekly_request_days"
    __table_args__ = (
        UniqueConstraint("weekly_request_id", "day_date", name="uq_weekly_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    weekly_request_id: Mapped[int] = mapped_column(
        ForeignKey("weekly_requests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    day_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    arrival_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM

    weekly_request = relationship("WeeklyRequest", back_populates="days")
