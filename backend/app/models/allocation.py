"""Route/driver allocations for weekly-day and ad-hoc requests."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Allocation(Base):
    __tablename__ = "allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)  # weekly_day | adhoc
    weekly_request_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("weekly_request_days.id"), nullable=True, index=True
    )
    adhoc_request_id: Mapped[int | None] = mapped_column(
        ForeignKey("adhoc_requests.id"), nullable=True, index=True
    )
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    pickup_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    driver_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    driver_contact: Mapped[str] = mapped_column(String(40), nullable=False)
    vehicle_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)

    allocated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    allocated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee = relationship("User", foreign_keys=[employee_id])
    allocator = relationship("User", foreign_keys=[allocated_by])
    weekly_day = relationship("WeeklyRequestDay")
    adhoc_request = relationship("AdhocRequest")
