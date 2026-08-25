"""Role-based access control. Never trust the frontend for authorization."""
from collections.abc import Callable

from fastapi import Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.user import User


def require_roles(*roles: str) -> Callable:
    """Dependency factory: allow only the given roles.

    Usage:  Depends(require_roles("operations", "super_admin"))
    """
    allowed = set(roles)

    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return _checker
