"""Ad-hoc request schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserOut


class AdhocCreate(BaseModel):
    request_date: date
    arrival_time: str  # HH:MM
    reason: str


class AdhocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int
    request_date: date
    arrival_time: str
    reason: str
    status: Literal["open", "allocated", "cancelled"]
    created_at: datetime
    employee: UserOut | None = None
