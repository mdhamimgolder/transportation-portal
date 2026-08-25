"""Employee ad-hoc (emergency) requests — instantly visible to Ops & Facilities."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.adhoc import AdhocRequest
from app.models.user import User
from app.schemas.adhoc import AdhocCreate, AdhocOut
from app.services.audit_service import audit

router = APIRouter(prefix="/adhoc", tags=["adhoc"])


@router.post("", response_model=AdhocOut, status_code=201)
async def create_adhoc(
    payload: AdhocCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdhocOut:
    if payload.arrival_time not in settings.arrival_slots:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid arrival time. Allowed: {', '.join(settings.arrival_slots)}.",
        )
    if not payload.reason.strip():
        raise HTTPException(status_code=422, detail="A reason is required.")

    req = AdhocRequest(
        employee_id=user.id,
        request_date=payload.request_date,
        arrival_time=payload.arrival_time,
        reason=payload.reason.strip(),
        status="open",
    )
    db.add(req)
    await db.flush()
    await audit(
        db, actor=user, action="CREATE_ADHOC", entity_type="adhoc_request", entity_id=req.id,
        after={"date": str(payload.request_date), "time": payload.arrival_time, "reason": req.reason},
        description=f"{user.email} created an ad-hoc request for {payload.request_date}",
    )
    await db.commit()
    await db.refresh(req)
    return AdhocOut.model_validate(req)


@router.get("/mine", response_model=list[AdhocOut])
async def my_adhoc(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdhocOut]:
    rows = (
        await db.scalars(
            select(AdhocRequest)
            .where(AdhocRequest.employee_id == user.id)
            .order_by(AdhocRequest.created_at.desc())
        )
    ).all()
    return [AdhocOut.model_validate(r) for r in rows]
