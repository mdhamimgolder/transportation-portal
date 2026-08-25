"""Shared FastAPI dependencies: current user + pagination."""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise cred_exc
    user_id = payload.get("sub")
    if user_id is None:
        raise cred_exc

    user = await db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise cred_exc
    return user


@dataclass
class Pagination:
    page: int
    size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


def pagination(page: int = 1, size: int = 20) -> Pagination:
    page = max(1, page)
    size = min(max(1, size), 100)
    return Pagination(page=page, size=size)
