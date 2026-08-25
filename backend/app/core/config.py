"""Application settings loaded from environment (.env)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./transport.db"

    # JWT
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Frontend / CORS
    FRONTEND_URL: str = "http://localhost:5173"

    # Email
    MAIL_SUPPRESS_SEND: bool = True
    SMTP_HOST: str = "smtp.example.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@transport.local"
    SMTP_FROM_NAME: str = "Transport Portal"
    SMTP_STARTTLS: bool = True
    SMTP_SSL_TLS: bool = False

    # Timezone & deadlines
    TIMEZONE: str = "Asia/Dhaka"
    ARRIVAL_SLOTS: str = "10:00,11:00,12:00"
    WEEKLY_DEADLINE_WEEKDAY: int = 5  # Saturday (Mon=0)
    WEEKLY_DEADLINE_HOUR: int = 12
    WEEKLY_DEADLINE_MINUTE: int = 0

    @property
    def arrival_slots(self) -> list[str]:
        return [s.strip() for s in self.ARRIVAL_SLOTS.split(",") if s.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [self.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
