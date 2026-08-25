"""Weekly request schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserOut


class WeeklyDayIn(BaseModel):
    day_date: date
    arrival_time: str  # HH:MM, validated against configured slots in the router


class WeeklyRequestCreate(BaseModel):
    week_start_date: date  # Monday
    days: list[WeeklyDayIn]


class WeeklyDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    day_date: date
    arrival_time: str


class WeeklyRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int
    week_start_date: date
    status: Literal["submitted", "approved", "rejected"]
    submitted_at: datetime
    reviewed_by: int | None
    reviewed_at: datetime | None
    remarks: str | None
    days: list[WeeklyDayOut]
    employee: UserOut | None = None


class WeeklyReview(BaseModel):
    remarks: str | None = None  # required when rejecting (enforced in router)


class DeadlineInfo(BaseModel):
    week_start_date: date
    deadline: datetime
    is_open: bool
    arrival_slots: list[str]
