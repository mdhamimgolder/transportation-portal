"""User profiles: self-edit, address-change requests, and shared profile
management (view/edit any profile) for Operations/Facilities/Super Admin.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, pagination
from app.core.permissions import require_roles
from app.models.address_change import AddressChangeRequest
from app.models.user import User
from app.schemas.address_change import AddressChangeCreate, AddressChangeOut
from app.schemas.common import Page
from app.schemas.user import UserOut, UserUpdateAdmin, UserUpdateSelf
from app.services.audit_service import audit

router = APIRouter(prefix="/users", tags=["users"])

MANAGERS = ("operations", "facilities", "super_admin")


# ------------------------------- self ---------------------------------------
@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdateSelf,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Employees (and everyone) may edit their own name & contact — never address."""
    before = {"name": user.name, "contact_number": user.contact_number}
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    await audit(
        db, actor=user, action="UPDATE_OWN_PROFILE", entity_type="user", entity_id=user.id,
        before=before, after=data, description=f"{user.email} updated their profile",
    )
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/me/address-change", response_model=AddressChangeOut, status_code=201)
async def request_address_change(
    payload: AddressChangeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AddressChangeOut:
    existing = await db.scalar(
        select(AddressChangeRequest)
        .where(AddressChangeRequest.employee_id == user.id)
        .where(AddressChangeRequest.status == "pending")
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already have a pending address change.")

    req = AddressChangeRequest(
        employee_id=user.id, old_address=user.address, new_address=payload.new_address
    )
    db.add(req)
    await db.flush()
    await audit(
        db, actor=user, action="REQUEST_ADDRESS_CHANGE",
        entity_type="address_change_request", entity_id=req.id,
        before={"address": user.address}, after={"new_address": payload.new_address},
        description=f"{user.email} requested an address change",
    )
    await db.commit()
    await db.refresh(req)
    return AddressChangeOut.model_validate(req)


@router.get("/me/address-changes", response_model=list[AddressChangeOut])
async def my_address_changes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AddressChangeOut]:
    rows = (
        await db.scalars(
            select(AddressChangeRequest)
            .where(AddressChangeRequest.employee_id == user.id)
            .order_by(AddressChangeRequest.created_at.desc())
        )
    ).all()
    return [AddressChangeOut.model_validate(r) for r in rows]


# ---------------------- shared profile management ---------------------------
@router.get("", response_model=Page[UserOut])
async def list_users(
    q: str | None = None,
    role: str | None = None,
    page: Pagination = Depends(pagination),
    _: User = Depends(require_roles(*MANAGERS)),
    db: AsyncSession = Depends(get_db),
) -> Page[UserOut]:
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.email.ilike(like)))
    if role:
        stmt = stmt.where(User.role == role)

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.order_by(User.name).offset(page.offset).limit(page.size)
        )
    ).all()
    return Page[UserOut](
        items=[UserOut.model_validate(r) for r in rows],
        total=total, page=page.page, size=page.size,
        pages=(total + page.size - 1) // page.size,
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    _: User = Depends(require_roles(*MANAGERS)),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserOut.model_validate(target)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdateAdmin,
    actor: User = Depends(require_roles(*MANAGERS)),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    data = payload.model_dump(exclude_unset=True)
    # Only super_admin may change role or active status.
    if actor.role != "super_admin":
        data.pop("role", None)
        data.pop("is_active", None)

    before = {k: getattr(target, k) for k in data}
    for field, value in data.items():
        setattr(target, field, value)
    await audit(
        db, actor=actor, action="EDIT_PROFILE", entity_type="user", entity_id=target.id,
        before=before, after=data,
        description=f"{actor.role} {actor.email} edited profile of {target.email}",
    )
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)
