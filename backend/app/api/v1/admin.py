"""Super Admin: user creation, bulk upload, audit log, system stats."""
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import Pagination, pagination
from app.core.permissions import require_roles
from app.core.security import (
    generate_reset_token,
    generate_temp_password,
    hash_password,
    hash_reset_token,
)
from app.models.address_change import AddressChangeRequest
from app.models.adhoc import AdhocRequest
from app.models.allocation import Allocation
from app.models.audit import AuditLog
from app.models.password_reset_token import PasswordResetToken
from app.models.user import ROLES as VALID_ROLES
from app.models.user import User
from app.models.weekly import WeeklyRequest
from app.schemas.audit import (
    AdminStats,
    AuditLogOut,
    BulkRowResult,
    BulkUploadResult,
)
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserOut
from app.services.audit_service import audit
from app.services.email_service import send_invite
from app.utils.timeutils import next_week_start

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN = ("super_admin",)
REQUIRED_COLUMNS = ["name", "email", "contact_number", "address", "role"]


async def _create_invite_token(db: AsyncSession, user: User) -> str:
    raw = generate_reset_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
        )
    )
    return raw


# ------------------------------ create user ---------------------------------
@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid role.")
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists.")

    temp = payload.password or generate_temp_password()
    user = User(
        name=payload.name, email=payload.email, contact_number=payload.contact_number,
        address=payload.address, role=payload.role, hashed_password=hash_password(temp),
    )
    db.add(user)
    await db.flush()
    raw = await _create_invite_token(db, user)
    await audit(
        db, actor=actor, action="CREATE_USER", entity_type="user", entity_id=user.id,
        after={"email": user.email, "role": user.role},
        description=f"{actor.email} created user {user.email} ({user.role})",
    )
    await db.commit()
    await db.refresh(user)

    background.add_task(send_invite, user.email, user.name, raw, temp)
    return UserOut.model_validate(user)


# ------------------------------ bulk upload ---------------------------------
@router.post("/users/bulk-upload", response_model=BulkUploadResult)
async def bulk_upload(
    file: UploadFile,
    background: BackgroundTasks,
    actor: User = Depends(require_roles(*ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> BulkUploadResult:
    import pandas as pd

    raw = await file.read()
    name = (file.filename or "").lower()
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw), dtype=str)
        elif name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(raw), dtype=str)
        else:
            raise HTTPException(status_code=422, detail="Upload a .csv or .xlsx file.")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}")

    df = df.fillna("")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=422, detail=f"Missing required columns: {', '.join(missing)}."
        )

    results: list[BulkRowResult] = []
    created = skipped = errors = 0
    invites: list[tuple[str, str, str, str]] = []  # email, name, token, temp

    for idx, row in df.iterrows():
        rownum = int(idx) + 2  # header + 1-based
        email = str(row["email"]).strip().lower()
        rname = str(row["name"]).strip()
        role = str(row["role"]).strip().lower()

        if not email or not rname:
            errors += 1
            results.append(BulkRowResult(row=rownum, email=email or None, status="error",
                                         detail="name and email are required"))
            continue
        if role not in VALID_ROLES:
            errors += 1
            results.append(BulkRowResult(row=rownum, email=email, status="error",
                                         detail=f"invalid role '{role}'"))
            continue

        existing = await db.scalar(select(User).where(User.email == email))
        if existing:
            skipped += 1
            results.append(BulkRowResult(row=rownum, email=email, status="skipped",
                                         detail="email already exists"))
            continue

        temp = generate_temp_password()
        user = User(
            name=rname, email=email,
            contact_number=str(row["contact_number"]).strip() or None,
            address=str(row["address"]).strip() or None,
            role=role, hashed_password=hash_password(temp),
        )
        db.add(user)
        await db.flush()
        token = await _create_invite_token(db, user)
        await audit(
            db, actor=actor, action="BULK_CREATE_USER", entity_type="user", entity_id=user.id,
            after={"email": email, "role": role},
            description=f"{actor.email} bulk-created {email} ({role})",
        )
        invites.append((email, rname, token, temp))
        created += 1
        results.append(BulkRowResult(row=rownum, email=email, status="created"))

    await db.commit()
    for email, rname, token, temp in invites:
        background.add_task(send_invite, email, rname, token, temp)

    return BulkUploadResult(created=created, skipped=skipped, errors=errors, rows=results)


# ------------------------------ audit log -----------------------------------
@router.get("/audit-logs", response_model=Page[AuditLogOut])
async def audit_logs(
    actor_id: int | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Page[AuditLogOut]:
    stmt = select(AuditLog)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.options(selectinload(AuditLog.actor))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[AuditLogOut](
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )


# ------------------------------- stats --------------------------------------
@router.get("/stats", response_model=AdminStats)
async def admin_stats(
    _: User = Depends(require_roles(*ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    users_total = await db.scalar(select(func.count()).select_from(User)) or 0
    by_role_rows = (await db.execute(select(User.role, func.count()).group_by(User.role))).all()
    by_role = {r: c for r, c in by_role_rows}

    ws = next_week_start()
    weekly_this_week = await db.scalar(
        select(func.count()).select_from(WeeklyRequest).where(WeeklyRequest.week_start_date == ws)
    )
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    allocs_week = await db.scalar(
        select(func.count()).select_from(Allocation).where(Allocation.allocated_at >= week_ago)
    )
    emails_sent = await db.scalar(
        select(func.count()).select_from(Allocation).where(Allocation.email_sent_at.is_not(None))
    )
    pending_weekly = await db.scalar(
        select(func.count()).select_from(WeeklyRequest).where(WeeklyRequest.status == "submitted")
    )
    open_adhoc = await db.scalar(
        select(func.count()).select_from(AdhocRequest).where(AdhocRequest.status == "open")
    )
    pending_addr = await db.scalar(
        select(func.count()).select_from(AddressChangeRequest).where(AddressChangeRequest.status == "pending")
    )

    return AdminStats(
        users_total=users_total,
        users_by_role={r: by_role.get(r, 0) for r in VALID_ROLES},
        weekly_requests_this_week=weekly_this_week or 0,
        allocations_this_week=allocs_week or 0,
        emails_sent_total=emails_sent or 0,
        pending_weekly_approvals=pending_weekly or 0,
        open_adhoc=open_adhoc or 0,
        pending_address_changes=pending_addr or 0,
    )
