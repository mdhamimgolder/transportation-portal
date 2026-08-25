"""Facilities dashboard: weekly route planning, allocation + email dispatch,
copy-to-rest-of-week, and ad-hoc allocation.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import require_roles
from app.models.adhoc import AdhocRequest
from app.models.allocation import Allocation
from app.models.user import User
from app.models.weekly import WeeklyRequest, WeeklyRequestDay
from app.schemas.adhoc import AdhocOut
from app.schemas.allocation import (
    AdhocAllocate,
    AllocationIn,
    AllocationOut,
    CopyWeekRequest,
    CopyWeekResult,
    DayBulkAllocate,
    WeeklyDayAllocate,
)
from app.services.audit_service import audit
from app.services.email_service import send_allocation
from app.utils.timeutils import monday_of, week_days

router = APIRouter(prefix="/facilities", tags=["facilities"])

ROLES = ("facilities", "super_admin")


# ------------------------------- board schemas ------------------------------
class BoardEntry(BaseModel):
    weekly_request_day_id: int
    employee_id: int
    employee_name: str
    employee_email: str
    arrival_time: str
    allocation: AllocationOut | None = None


class BoardDay(BaseModel):
    day_date: date
    entries: list[BoardEntry]


class WeekBoard(BaseModel):
    week_start_date: date
    days: list[BoardDay]


# ------------------------------- helpers ------------------------------------
async def _dispatch_allocation(
    db: AsyncSession,
    background: BackgroundTasks,
    actor: User,
    *,
    source_type: str,
    employee: User,
    data: AllocationIn,
    trip_date: date,
    arrival_time: str,
    weekly_request_day_id: int | None = None,
    adhoc_request_id: int | None = None,
) -> Allocation:
    """Create or update an allocation, audit it, and queue the email."""
    if data.pickup_time not in settings.arrival_slots and not data.pickup_time:
        pass  # pickup_time is free-form (driver ETA), no slot restriction

    existing = None
    if weekly_request_day_id is not None:
        existing = await db.scalar(
            select(Allocation).where(Allocation.weekly_request_day_id == weekly_request_day_id)
        )
    elif adhoc_request_id is not None:
        existing = await db.scalar(
            select(Allocation).where(Allocation.adhoc_request_id == adhoc_request_id)
        )

    now = datetime.now(timezone.utc)
    if existing:
        before = {
            "pickup_time": existing.pickup_time, "driver_name": existing.driver_name,
            "driver_contact": existing.driver_contact, "vehicle_number": existing.vehicle_number,
        }
        existing.pickup_time = data.pickup_time
        existing.driver_name = data.driver_name
        existing.driver_contact = data.driver_contact
        existing.vehicle_number = data.vehicle_number
        existing.allocated_by = actor.id
        existing.allocated_at = now
        existing.email_sent_at = now
        alloc = existing
        action = "UPDATE_ALLOCATION"
    else:
        alloc = Allocation(
            source_type=source_type,
            weekly_request_day_id=weekly_request_day_id,
            adhoc_request_id=adhoc_request_id,
            employee_id=employee.id,
            pickup_time=data.pickup_time,
            driver_name=data.driver_name,
            driver_contact=data.driver_contact,
            vehicle_number=data.vehicle_number,
            allocated_by=actor.id,
            email_sent_at=now,
        )
        db.add(alloc)
        before = None
        action = "CREATE_ALLOCATION"

    await db.flush()
    await audit(
        db, actor=actor, action=action, entity_type="allocation", entity_id=alloc.id,
        before=before,
        after={"pickup_time": data.pickup_time, "driver_name": data.driver_name,
               "vehicle_number": data.vehicle_number, "employee": employee.email},
        description=f"{actor.email} allocated transport for {employee.email} on {trip_date}",
    )

    background.add_task(
        send_allocation, employee.email, employee.name,
        trip_date=str(trip_date), arrival_time=arrival_time, pickup_time=data.pickup_time,
        driver_name=data.driver_name, driver_contact=data.driver_contact,
        vehicle_number=data.vehicle_number,
    )
    return alloc


# ------------------------------- board --------------------------------------
@router.get("/board", response_model=WeekBoard)
async def board(
    week_start: date = Query(...),
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> WeekBoard:
    ws = monday_of(week_start)
    reqs = (
        await db.scalars(
            select(WeeklyRequest)
            .where(WeeklyRequest.week_start_date == ws)
            .where(WeeklyRequest.status == "approved")
            .options(selectinload(WeeklyRequest.days), selectinload(WeeklyRequest.employee))
        )
    ).all()

    # Map existing allocations for these days.
    day_ids = [d.id for r in reqs for d in r.days]
    allocs: dict[int, Allocation] = {}
    if day_ids:
        rows = (
            await db.scalars(
                select(Allocation).where(Allocation.weekly_request_day_id.in_(day_ids))
            )
        ).all()
        allocs = {a.weekly_request_day_id: a for a in rows if a.weekly_request_day_id}

    by_date: dict[date, list[BoardEntry]] = {d: [] for d in week_days(ws)}
    for r in reqs:
        for d in r.days:
            if d.day_date not in by_date:
                continue
            a = allocs.get(d.id)
            by_date[d.day_date].append(
                BoardEntry(
                    weekly_request_day_id=d.id,
                    employee_id=r.employee_id,
                    employee_name=r.employee.name if r.employee else "",
                    employee_email=r.employee.email if r.employee else "",
                    arrival_time=d.arrival_time,
                    allocation=AllocationOut.model_validate(a) if a else None,
                )
            )

    return WeekBoard(
        week_start_date=ws,
        days=[BoardDay(day_date=d, entries=by_date[d]) for d in week_days(ws)],
    )


# ---------------------------- allocate weekly -------------------------------
@router.post("/allocate/weekly", response_model=AllocationOut, status_code=201)
async def allocate_weekly(
    payload: WeeklyDayAllocate,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> AllocationOut:
    day = await db.scalar(
        select(WeeklyRequestDay).where(WeeklyRequestDay.id == payload.weekly_request_day_id)
        .options(selectinload(WeeklyRequestDay.weekly_request))
    )
    if not day:
        raise HTTPException(status_code=404, detail="Weekly day not found.")
    req = day.weekly_request
    if req.status != "approved":
        raise HTTPException(status_code=400, detail="The weekly request is not approved.")
    employee = await db.get(User, req.employee_id)

    alloc = await _dispatch_allocation(
        db, background, actor, source_type="weekly_day", employee=employee,
        data=payload, trip_date=day.day_date, arrival_time=day.arrival_time,
        weekly_request_day_id=day.id,
    )
    await db.commit()
    await db.refresh(alloc)
    return AllocationOut.model_validate(alloc)


@router.post("/allocate/weekly/bulk", response_model=list[AllocationOut])
async def allocate_weekly_bulk(
    payload: DayBulkAllocate,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> list[AllocationOut]:
    """Save a whole day's allocations at once."""
    results: list[Allocation] = []
    for item in payload.items:
        day = await db.scalar(
            select(WeeklyRequestDay).where(WeeklyRequestDay.id == item.weekly_request_day_id)
            .options(selectinload(WeeklyRequestDay.weekly_request))
        )
        if not day or day.weekly_request.status != "approved":
            continue
        employee = await db.get(User, day.weekly_request.employee_id)
        alloc = await _dispatch_allocation(
            db, background, actor, source_type="weekly_day", employee=employee,
            data=item, trip_date=day.day_date, arrival_time=day.arrival_time,
            weekly_request_day_id=day.id,
        )
        results.append(alloc)
    await db.commit()
    for a in results:
        await db.refresh(a)
    return [AllocationOut.model_validate(a) for a in results]


# ------------------------- copy to rest of week -----------------------------
@router.post("/copy-week", response_model=CopyWeekResult)
async def copy_week(
    payload: CopyWeekRequest,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> CopyWeekResult:
    ws = monday_of(payload.week_start_date)
    source_date = payload.source_day_date

    # Source allocations (weekly) on the source day.
    source_allocs = (
        await db.scalars(
            select(Allocation)
            .join(WeeklyRequestDay, Allocation.weekly_request_day_id == WeeklyRequestDay.id)
            .where(WeeklyRequestDay.day_date == source_date)
            .options(selectinload(Allocation.weekly_day))
        )
    ).all()
    # employee_id -> allocation template
    template = {a.employee_id: a for a in source_allocs}

    copied = skipped_no_req = skipped_alloc = 0
    details: list[str] = []

    for target_date in week_days(ws):
        if target_date == source_date:
            continue
        # Approved weekly days on this target date, per employee.
        days = (
            await db.scalars(
                select(WeeklyRequestDay)
                .join(WeeklyRequest, WeeklyRequestDay.weekly_request_id == WeeklyRequest.id)
                .where(WeeklyRequestDay.day_date == target_date)
                .where(WeeklyRequest.status == "approved")
                .options(selectinload(WeeklyRequestDay.weekly_request))
            )
        ).all()
        day_by_emp = {d.weekly_request.employee_id: d for d in days}

        for emp_id, tmpl in template.items():
            day = day_by_emp.get(emp_id)
            if not day:
                skipped_no_req += 1
                continue
            existing = await db.scalar(
                select(Allocation).where(Allocation.weekly_request_day_id == day.id)
            )
            if existing:
                skipped_alloc += 1
                continue
            employee = await db.get(User, emp_id)
            await _dispatch_allocation(
                db, background, actor, source_type="weekly_day", employee=employee,
                data=AllocationIn(
                    pickup_time=tmpl.pickup_time, driver_name=tmpl.driver_name,
                    driver_contact=tmpl.driver_contact, vehicle_number=tmpl.vehicle_number,
                ),
                trip_date=day.day_date, arrival_time=day.arrival_time,
                weekly_request_day_id=day.id,
            )
            copied += 1
            details.append(f"Copied {employee.email} → {target_date}")

    await db.commit()
    return CopyWeekResult(
        copied=copied, skipped_no_request=skipped_no_req,
        skipped_already_allocated=skipped_alloc, details=details,
    )


# ------------------------------- ad-hoc -------------------------------------
@router.get("/adhoc", response_model=list[AdhocOut])
async def open_adhoc(
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> list[AdhocOut]:
    rows = (
        await db.scalars(
            select(AdhocRequest).where(AdhocRequest.status == "open")
            .options(selectinload(AdhocRequest.employee))
            .order_by(AdhocRequest.request_date, AdhocRequest.created_at)
        )
    ).all()
    return [AdhocOut.model_validate(r) for r in rows]


@router.post("/allocate/adhoc", response_model=AllocationOut, status_code=201)
async def allocate_adhoc(
    payload: AdhocAllocate,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> AllocationOut:
    req = await db.scalar(
        select(AdhocRequest).where(AdhocRequest.id == payload.adhoc_request_id)
        .options(selectinload(AdhocRequest.employee))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Ad-hoc request not found.")
    employee = req.employee or await db.get(User, req.employee_id)

    alloc = await _dispatch_allocation(
        db, background, actor, source_type="adhoc", employee=employee,
        data=payload, trip_date=req.request_date, arrival_time=req.arrival_time,
        adhoc_request_id=req.id,
    )
    req.status = "allocated"
    await db.commit()
    await db.refresh(alloc)
    return AllocationOut.model_validate(alloc)
