"""Operations dashboard: weekly approvals, ad-hoc tracking, address-change hub."""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import Pagination, pagination
from app.core.permissions import require_roles
from app.models.address_change import AddressChangeRequest
from app.models.adhoc import AdhocRequest
from app.models.user import User
from app.models.weekly import WeeklyRequest
from app.schemas.address_change import AddressChangeOut
from app.schemas.adhoc import AdhocOut
from app.schemas.common import Page
from app.schemas.weekly import WeeklyRequestOut, WeeklyReview
from app.services.audit_service import audit
from app.services.email_service import send_address_change_result, send_weekly_rejected
from app.utils.timeutils import next_week_start

router = APIRouter(prefix="/operations", tags=["operations"])

ROLES = ("operations", "super_admin")


@router.get("/stats")
async def stats(
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    pending_weekly = await db.scalar(
        select(func.count()).select_from(WeeklyRequest).where(WeeklyRequest.status == "submitted")
    )
    open_adhoc = await db.scalar(
        select(func.count()).select_from(AdhocRequest).where(AdhocRequest.status == "open")
    )
    pending_addr = await db.scalar(
        select(func.count()).select_from(AddressChangeRequest).where(AddressChangeRequest.status == "pending")
    )
    return {
        "pending_weekly_approvals": pending_weekly or 0,
        "open_adhoc": open_adhoc or 0,
        "pending_address_changes": pending_addr or 0,
    }


# ------------------------------ weekly --------------------------------------
@router.get("/weekly", response_model=Page[WeeklyRequestOut])
async def list_weekly(
    status: str = Query(default="submitted"),
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> Page[WeeklyRequestOut]:
    stmt = select(WeeklyRequest).where(WeeklyRequest.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.options(selectinload(WeeklyRequest.days), selectinload(WeeklyRequest.employee))
            .order_by(WeeklyRequest.week_start_date.desc(), WeeklyRequest.submitted_at.desc())
            .offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[WeeklyRequestOut](
        items=[WeeklyRequestOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )


@router.post("/weekly/{req_id}/approve", response_model=WeeklyRequestOut)
async def approve_weekly(
    req_id: int,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> WeeklyRequestOut:
    req = await db.scalar(
        select(WeeklyRequest).where(WeeklyRequest.id == req_id).options(selectinload(WeeklyRequest.days))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted requests can be approved.")

    req.status = "approved"
    req.reviewed_by = actor.id
    req.reviewed_at = datetime.now(timezone.utc)
    await audit(
        db, actor=actor, action="APPROVE_WEEKLY", entity_type="weekly_request", entity_id=req.id,
        before={"status": "submitted"}, after={"status": "approved"},
        description=f"{actor.email} approved weekly request #{req.id}",
    )
    await db.commit()
    await db.refresh(req)
    return WeeklyRequestOut.model_validate(req)


@router.post("/weekly/{req_id}/reject", response_model=WeeklyRequestOut)
async def reject_weekly(
    req_id: int,
    payload: WeeklyReview,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> WeeklyRequestOut:
    if not payload.remarks or not payload.remarks.strip():
        raise HTTPException(status_code=422, detail="Remarks are required when rejecting.")

    req = await db.scalar(
        select(WeeklyRequest).where(WeeklyRequest.id == req_id)
        .options(selectinload(WeeklyRequest.days), selectinload(WeeklyRequest.employee))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted requests can be rejected.")

    req.status = "rejected"
    req.remarks = payload.remarks.strip()
    req.reviewed_by = actor.id
    req.reviewed_at = datetime.now(timezone.utc)
    await audit(
        db, actor=actor, action="REJECT_WEEKLY", entity_type="weekly_request", entity_id=req.id,
        before={"status": "submitted"}, after={"status": "rejected", "remarks": req.remarks},
        description=f"{actor.email} rejected weekly request #{req.id}",
    )
    await db.commit()
    await db.refresh(req)

    if req.employee:
        background.add_task(
            send_weekly_rejected, req.employee.email, req.employee.name,
            str(req.week_start_date), req.remarks,
        )
    return WeeklyRequestOut.model_validate(req)


# ------------------------------ ad-hoc --------------------------------------
@router.get("/adhoc", response_model=Page[AdhocOut])
async def list_adhoc(
    status: str | None = Query(default=None),
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> Page[AdhocOut]:
    stmt = select(AdhocRequest)
    if status:
        stmt = stmt.where(AdhocRequest.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.options(selectinload(AdhocRequest.employee))
            .order_by(AdhocRequest.created_at.desc())
            .offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[AdhocOut](
        items=[AdhocOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )


# ------------------------- address changes ----------------------------------
@router.get("/address-changes", response_model=Page[AddressChangeOut])
async def list_address_changes(
    status: str = Query(default="pending"),
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> Page[AddressChangeOut]:
    stmt = select(AddressChangeRequest).where(AddressChangeRequest.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.options(selectinload(AddressChangeRequest.employee))
            .order_by(AddressChangeRequest.created_at.desc())
            .offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[AddressChangeOut](
        items=[AddressChangeOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )


@router.post("/address-changes/{req_id}/approve", response_model=AddressChangeOut)
async def approve_address_change(
    req_id: int,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> AddressChangeOut:
    req = await db.scalar(
        select(AddressChangeRequest).where(AddressChangeRequest.id == req_id)
        .options(selectinload(AddressChangeRequest.employee))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed.")

    employee = req.employee or await db.get(User, req.employee_id)
    old_address = employee.address
    employee.address = req.new_address
    req.status = "approved"
    req.reviewed_by = actor.id
    req.reviewed_at = datetime.now(timezone.utc)
    await audit(
        db, actor=actor, action="APPROVE_ADDRESS_CHANGE",
        entity_type="address_change_request", entity_id=req.id,
        before={"address": old_address}, after={"address": req.new_address},
        description=f"{actor.role} {actor.email} approved {employee.email}'s address change",
    )
    await db.commit()
    await db.refresh(req)

    background.add_task(send_address_change_result, employee.email, employee.name, True, req.new_address)
    return AddressChangeOut.model_validate(req)


@router.post("/address-changes/{req_id}/reject", response_model=AddressChangeOut)
async def reject_address_change(
    req_id: int,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ROLES)),
    db: AsyncSession = Depends(get_db),
) -> AddressChangeOut:
    req = await db.scalar(
        select(AddressChangeRequest).where(AddressChangeRequest.id == req_id)
        .options(selectinload(AddressChangeRequest.employee))
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed.")

    employee = req.employee or await db.get(User, req.employee_id)
    req.status = "rejected"
    req.reviewed_by = actor.id
    req.reviewed_at = datetime.now(timezone.utc)
    await audit(
        db, actor=actor, action="REJECT_ADDRESS_CHANGE",
        entity_type="address_change_request", entity_id=req.id,
        before={"status": "pending"}, after={"status": "rejected"},
        description=f"{actor.role} {actor.email} rejected {employee.email}'s address change",
    )
    await db.commit()
    await db.refresh(req)

    background.add_task(send_address_change_result, employee.email, employee.name, False, req.new_address)
    return AddressChangeOut.model_validate(req)
