"""Authentication: register, login, refresh, forgot/reset password, me."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
    verify_reset_token,
)
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.common import Message
from app.schemas.user import (
    AccessToken,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
    UserOut,
    UserRegister,
)
from app.services.audit_service import audit
from app.services.email_service import send_password_reset

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> TokenPair:
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        name=payload.name,
        email=payload.email,
        contact_number=payload.contact_number,
        address=payload.address,
        hashed_password=hash_password(payload.password),
        role="employee",
    )
    db.add(user)
    await db.flush()
    await audit(
        db, actor=user, action="REGISTER", entity_type="user", entity_id=user.id,
        after={"email": user.email, "role": user.role},
        description=f"{user.email} self-registered as employee",
    )
    await db.commit()
    await db.refresh(user)

    return TokenPair(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is deactivated.")

    return TokenPair(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=AccessToken)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> AccessToken:
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token.")
    user = await db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")
    return AccessToken(access_token=create_access_token(user.id, user.role))


@router.post("/forgot-password", response_model=Message)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> Message:
    # Never reveal whether the email exists.
    generic = Message(detail="If the email exists, a reset link was sent.")
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.is_active:
        return generic

    raw = generate_reset_token()
    token_row = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_reset_token(raw),
        expires_at=datetime.now(timezone.utc)
        + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token_row)
    await db.commit()

    background.add_task(send_password_reset, user.email, user.name, raw)
    return generic


@router.post("/reset-password", response_model=Message)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> Message:
    now = datetime.now(timezone.utc)
    candidates = (
        await db.scalars(
            select(PasswordResetToken)
            .where(PasswordResetToken.used_at.is_(None))
            .where(PasswordResetToken.expires_at > now)
            .order_by(PasswordResetToken.created_at.desc())
        )
    ).all()

    matched = next(
        (t for t in candidates if verify_reset_token(payload.token, t.token_hash)), None
    )
    if not matched:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user = await db.get(User, matched.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user.hashed_password = hash_password(payload.new_password)
    matched.used_at = now
    await audit(
        db, actor=user, action="RESET_PASSWORD", entity_type="user", entity_id=user.id,
        description=f"{user.email} reset their password",
    )
    await db.commit()
    return Message(detail="Password updated. You can now log in.")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
