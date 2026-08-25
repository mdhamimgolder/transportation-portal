"""Employee weekly transport schedule (Mon-Fri) with deadline enforcement."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.weekly import WeeklyRequest, WeeklyRequestDay
from app.schemas.weekly import (
    DeadlineInfo,
    WeeklyRequestCreate,
    WeeklyRequestOut,
)
from app.services.audit_service import audit
from app.utils.timeutils import (
    deadline_for_week,
    is_past_deadline,
    monday_of,
    next_week_start,
    week_days,
)

router = APIRouter(prefix="/weekly", tags=["weekly"])


def _validate_days(payload: WeeklyRequestCreate) -> None:
    if monday_of(payload.week_start_date) != payload.week_start_date:
        raise HTTPException(status_code=422, detail="week_start_date must be a Monday.")
    valid_days = set(week_days(payload.week_start_date))
    slots = set(settings.arrival_slots)
    seen: set[date] = set()
    for d in payload.days:
        if d.day_date not in valid_days:
            raise HTTPException(status_code=422, detail=f"{d.day_date} is not in the selected week (Mon-Fri).")
        if d.arrival_time not in slots:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid arrival time {d.arrival_time}. Allowed: {', '.join(sorted(slots))}.",
            )
        if d.day_date in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate entry for {d.day_date}.")
        seen.add(d.day_date)


@router.get("/deadline", response_model=DeadlineInfo)
async def deadline(
    week_start: date | None = Query(default=None),
    _: User = Depends(get_current_user),
) -> DeadlineInfo:
    ws = week_start or next_week_start()
    return DeadlineInfo(
        week_start_date=ws,
        deadline=deadline_for_week(ws),
        is_open=not is_past_deadline(ws),
        arrival_slots=settings.arrival_slots,
    )


@router.get("/mine", response_model=list[WeeklyRequestOut])
async def my_weekly(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WeeklyRequestOut]:
    rows = (
        await db.scalars(
            select(WeeklyRequest)
            .where(WeeklyRequest.employee_id == user.id)
            .options(selectinload(WeeklyRequest.days))
            .order_by(WeeklyRequest.week_start_date.desc())
        )
    ).all()
    return [WeeklyRequestOut.model_validate(r) for r in rows]


@router.post("", response_model=WeeklyRequestOut, status_code=201)
async def submit_weekly(
    payload: WeeklyRequestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyRequestOut:
    _validate_days(payload)

    if is_past_deadline(payload.week_start_date):
        raise HTTPException(
            status_code=400,
            detail="The submission deadline for this week has passed.",
        )
    if not payload.days:
        raise HTTPException(status_code=422, detail="Select at least one day.")

    existing = await db.scalar(
        select(WeeklyRequest)
        .where(WeeklyRequest.employee_id == user.id)
        .where(WeeklyRequest.week_start_date == payload.week_start_date)
        .options(selectinload(WeeklyRequest.days))
    )

    if existing:
        # Editing allowed until deadline; resets an approved/rejected one to submitted.
        for d in list(existing.days):
            await db.delete(d)
        existing.status = "submitted"
        existing.remarks = None
        existing.reviewed_by = None
        existing.reviewed_at = None
        existing.days = [
            WeeklyRequestDay(day_date=d.day_date, arrival_time=d.arrival_time)
            for d in payload.days
        ]
        req = existing
        action = "UPDATE_WEEKLY"
    else:
        req = WeeklyRequest(
            employee_id=user.id,
            week_start_date=payload.week_start_date,
            status="submitted",
            days=[
                WeeklyRequestDay(day_date=d.day_date, arrival_time=d.arrival_time)
                for d in payload.days
            ],
        )
        db.add(req)
        action = "SUBMIT_WEEKLY"

    await db.flush()
    await audit(
        db, actor=user, action=action, entity_type="weekly_request", entity_id=req.id,
        after={"week_start": str(payload.week_start_date),
               "days": [{"date": str(d.day_date), "time": d.arrival_time} for d in payload.days]},
        description=f"{user.email} {action.lower().replace('_', ' ')} for week {payload.week_start_date}",
    )
    await db.commit()

    req = await db.scalar(
        select(WeeklyRequest)
        .where(WeeklyRequest.id == req.id)
        .options(selectinload(WeeklyRequest.days))
    )
    return WeeklyRequestOut.model_validate(req)


@router.get("/{req_id}", response_model=WeeklyRequestOut)
async def get_weekly(
    req_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyRequestOut:
    req = await db.scalar(
        select(WeeklyRequest)
        .where(WeeklyRequest.id == req_id)
        .options(selectinload(WeeklyRequest.days))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.employee_id != user.id and user.role not in ("operations", "facilities", "super_admin"):
        raise HTTPException(status_code=403, detail="Not permitted.")
    return WeeklyRequestOut.model_validate(req)
