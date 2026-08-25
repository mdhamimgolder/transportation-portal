"""Address-change request schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserOut


class AddressChangeCreate(BaseModel):
    new_address: str


class AddressChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int
    old_address: str | None
    new_address: str
    status: Literal["pending", "approved", "rejected"]
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_at: datetime
    employee: UserOut | None = None
