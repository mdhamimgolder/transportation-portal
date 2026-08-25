"""Audit log + admin stats schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserOut


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: int | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: int | None
    before_json: dict[str, Any] | None
    after_json: dict[str, Any] | None
    description: str | None
    created_at: datetime
    actor: UserOut | None = None


class AdminStats(BaseModel):
    users_total: int
    users_by_role: dict[str, int]
    weekly_requests_this_week: int
    allocations_this_week: int
    emails_sent_total: int
    pending_weekly_approvals: int
    open_adhoc: int
    pending_address_changes: int


class BulkRowResult(BaseModel):
    row: int
    email: str | None
    status: str  # created | skipped | error
    detail: str | None = None


class BulkUploadResult(BaseModel):
    created: int
    skipped: int
    errors: int
    rows: list[BulkRowResult]
