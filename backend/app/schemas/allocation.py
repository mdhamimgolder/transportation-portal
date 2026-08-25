"""Allocation schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserOut


class AllocationIn(BaseModel):
    pickup_time: str  # HH:MM
    driver_name: str
    driver_contact: str
    vehicle_number: str


class WeeklyDayAllocate(AllocationIn):
    weekly_request_day_id: int


class AdhocAllocate(AllocationIn):
    adhoc_request_id: int


class DayBulkAllocate(BaseModel):
    """Save a whole day's allocations at once."""
    items: list[WeeklyDayAllocate]


class CopyWeekRequest(BaseModel):
    source_day_date: date
    week_start_date: date


class AllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_type: Literal["weekly_day", "adhoc"]
    weekly_request_day_id: int | None
    adhoc_request_id: int | None
    employee_id: int
    pickup_time: str
    driver_name: str
    driver_contact: str
    vehicle_number: str
    allocated_by: int
    allocated_at: datetime
    email_sent_at: datetime | None
    employee: UserOut | None = None


class CopyWeekResult(BaseModel):
    copied: int
    skipped_no_request: int
    skipped_already_allocated: int
    details: list[str]
