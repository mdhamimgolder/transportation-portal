"""Allocation history — searchable by employee, date range, driver, vehicle.
Shared by Operations, Facilities, and Super Admin.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import Pagination, pagination
from app.core.permissions import require_roles
from app.models.allocation import Allocation
from app.models.user import User
from app.models.weekly import WeeklyRequestDay
from app.schemas.allocation import AllocationOut
from app.schemas.common import Page

router = APIRouter(prefix="/history", tags=["history"])

ROLES = ("operations", "facilities", "super_admin")


@router.get("/allocations", response_model=Page[AllocationOut])
async def allocation_history(
    employee: str | None = Query(default=None, description="name or email"),
    driver: str | None = None,
    vehicle: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> Page[AllocationOut]:
    stmt = select(Allocation).join(User, Allocation.employee_id == User.id)

    if employee:
        like = f"%{employee}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.email.ilike(like)))
    if driver:
        stmt = stmt.where(Allocation.driver_name.ilike(f"%{driver}%"))
    if vehicle:
        stmt = stmt.where(Allocation.vehicle_number.ilike(f"%{vehicle}%"))
    if date_from or date_to:
        # Filter by the trip date via the linked weekly day (ad-hoc use allocated_at date).
        stmt = stmt.outerjoin(
            WeeklyRequestDay, Allocation.weekly_request_day_id == WeeklyRequestDay.id
        )
        if date_from:
            stmt = stmt.where(
                or_(
                    WeeklyRequestDay.day_date >= date_from,
                    func.date(Allocation.allocated_at) >= date_from,
                )
            )
        if date_to:
            stmt = stmt.where(
                or_(
                    WeeklyRequestDay.day_date <= date_to,
                    func.date(Allocation.allocated_at) <= date_to,
                )
            )

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.options(selectinload(Allocation.employee))
            .order_by(Allocation.allocated_at.desc())
            .offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[AllocationOut](
        items=[AllocationOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )
