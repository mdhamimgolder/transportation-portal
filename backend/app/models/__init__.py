"""Import all models so Alembic autogenerate and Base.metadata see them."""
from app.models.address_change import AddressChangeRequest
from app.models.adhoc import AdhocRequest
from app.models.allocation import Allocation
from app.models.audit import AuditLog
from app.models.password_reset_token import PasswordResetToken
from app.models.user import ROLES, User
from app.models.weekly import WeeklyRequest, WeeklyRequestDay

__all__ = [
    "User",
    "ROLES",
    "PasswordResetToken",
    "WeeklyRequest",
    "WeeklyRequestDay",
    "AdhocRequest",
    "Allocation",
    "AddressChangeRequest",
    "AuditLog",
]
