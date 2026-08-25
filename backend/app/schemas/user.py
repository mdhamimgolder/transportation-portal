"""User & auth-related schemas."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

ROLE = Literal["employee", "operations", "facilities", "super_admin"]

PASSWORD_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d).{8,}$")


def validate_password(v: str) -> str:
    if not PASSWORD_RE.match(v):
        raise ValueError(
            "Password must be at least 8 characters and include 1 uppercase letter and 1 number."
        )
    return v


class UserBase(BaseModel):
    name: str
    email: EmailStr
    contact_number: str | None = None
    address: str | None = None


class UserRegister(UserBase):
    password: str

    _v = field_validator("password")(validate_password)


class UserCreate(UserBase):
    role: ROLE = "employee"
    password: str | None = None  # if None, a temp password is generated


class UserUpdateSelf(BaseModel):
    """Employee editing own profile — name & contact only (never address)."""
    name: str | None = None
    contact_number: str | None = None


class UserUpdateAdmin(BaseModel):
    """Operations/Facilities/Admin editing any profile."""
    name: str | None = None
    contact_number: str | None = None
    address: str | None = None
    role: ROLE | None = None
    is_active: bool | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: ROLE
    is_active: bool
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    _v = field_validator("new_password")(validate_password)
