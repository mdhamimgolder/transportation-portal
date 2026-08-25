"""Employee 'My Transport' — upcoming weekly days and ad-hoc requests with
their current status and (once allocated) driver/vehicle/pickup details.
"""
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.allocation import Allocation
from app.models.adhoc import AdhocRequest
from app.models.user import User
from app.models.weekly import WeeklyRequest, WeeklyRequestDay
from app.schemas.allocation import AllocationOut
from app.utils.timeutils import now_local

router = APIRouter(prefix="/transport", tags=["transport"])


class TransportItem(BaseModel):
    source: str  # weekly | adhoc
    trip_date: date
    arrival_time: str
    status: str  # pending approval | approved | driver assigned | open | allocated | rejected
    allocation: AllocationOut | None = None


@router.get("/mine", response_model=list[TransportItem])
async def my_transport(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TransportItem]:
    today = now_local().date()
    items: list[TransportItem] = []

    # Weekly days (from non-rejected requests) on/after today.
    reqs = (
        await db.scalars(
            select(WeeklyRequest)
            .where(WeeklyRequest.employee_id == user.id)
            .where(WeeklyRequest.status != "rejected")
            .options(selectinload(WeeklyRequest.days))
        )
    ).all()
    day_ids: list[int] = []
    day_meta: dict[int, tuple[date, str, str]] = {}
    for r in reqs:
        for d in r.days:
            if d.day_date >= today:
                day_ids.append(d.id)
                day_meta[d.id] = (d.day_date, d.arrival_time, r.status)

    alloc_by_day: dict[int, Allocation] = {}
    if day_ids:
        rows = (
            await db.scalars(
                select(Allocation).where(Allocation.weekly_request_day_id.in_(day_ids))
            )
        ).all()
        alloc_by_day = {a.weekly_request_day_id: a for a in rows if a.weekly_request_day_id}

    for day_id, (d_date, a_time, req_status) in day_meta.items():
        alloc = alloc_by_day.get(day_id)
        if alloc:
            status = "driver assigned"
        elif req_status == "approved":
            status = "approved"
        else:
            status = "pending approval"
        items.append(
            TransportItem(
                source="weekly", trip_date=d_date, arrival_time=a_time,
                status=status,
                allocation=AllocationOut.model_validate(alloc) if alloc else None,
            )
        )

    # Ad-hoc on/after today.
    adhocs = (
        await db.scalars(
            select(AdhocRequest)
            .where(AdhocRequest.employee_id == user.id)
            .where(AdhocRequest.request_date >= today)
        )
    ).all()
    adhoc_ids = [a.id for a in adhocs]
    alloc_by_adhoc: dict[int, Allocation] = {}
    if adhoc_ids:
        rows = (
            await db.scalars(
                select(Allocation).where(Allocation.adhoc_request_id.in_(adhoc_ids))
            )
        ).all()
        alloc_by_adhoc = {a.adhoc_request_id: a for a in rows if a.adhoc_request_id}

    for a in adhocs:
        alloc = alloc_by_adhoc.get(a.id)
        items.append(
            TransportItem(
                source="adhoc", trip_date=a.request_date, arrival_time=a.arrival_time,
                status="driver assigned" if alloc else a.status,
                allocation=AllocationOut.model_validate(alloc) if alloc else None,
            )
        )

    items.sort(key=lambda i: i.trip_date)
    return items
