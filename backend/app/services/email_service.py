"""Email service.

In dev (MAIL_SUPPRESS_SEND=1) every email is logged to the console. In prod it
is sent via SMTP with fastapi-mail. All send functions are async and safe to run
from FastAPI BackgroundTasks.
"""
import logging

from app.core.config import settings

logger = logging.getLogger("email")


async def _deliver(to: str, subject: str, body: str) -> None:
    if settings.MAIL_SUPPRESS_SEND:
        logger.info(
            "\n"
            "========================= EMAIL (dev, not sent) =========================\n"
            "To:      %s\n"
            "Subject: %s\n"
            "-------------------------------------------------------------------------\n"
            "%s\n"
            "=========================================================================",
            to, subject, body,
        )
        return

    # Real SMTP send (prod).
    from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

    conf = ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USER,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_FROM=settings.SMTP_FROM,
        MAIL_FROM_NAME=settings.SMTP_FROM_NAME,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_SERVER=settings.SMTP_HOST,
        MAIL_STARTTLS=settings.SMTP_STARTTLS,
        MAIL_SSL_TLS=settings.SMTP_SSL_TLS,
        USE_CREDENTIALS=bool(settings.SMTP_USER),
        VALIDATE_CERTS=True,
    )
    message = MessageSchema(
        subject=subject, recipients=[to], body=body, subtype=MessageType.plain
    )
    await FastMail(conf).send_message(message)


# ----------------------------- templates ------------------------------------
async def send_password_reset(to: str, name: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = (
        f"Hi {name},\n\n"
        "We received a request to reset your Transport Portal password.\n"
        f"Click the link below (valid {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes, single use):\n\n"
        f"{link}\n\n"
        "If you didn't request this, you can ignore this email."
    )
    await _deliver(to, "Reset your Transport Portal password", body)


async def send_invite(to: str, name: str, token: str, temp_password: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = (
        f"Hi {name},\n\n"
        "An account has been created for you on the Transport Portal.\n\n"
        f"Email: {to}\n"
        f"Temporary password: {temp_password}\n\n"
        "Please set your own password using this link (valid "
        f"{settings.RESET_TOKEN_EXPIRE_MINUTES} minutes):\n\n"
        f"{link}\n"
    )
    await _deliver(to, "Welcome to the Transport Portal — set your password", body)


async def send_allocation(
    to: str,
    name: str,
    *,
    trip_date: str,
    arrival_time: str,
    pickup_time: str,
    driver_name: str,
    driver_contact: str,
    vehicle_number: str,
) -> None:
    body = (
        f"Hi {name},\n\n"
        "Your office transport has been arranged. Details:\n\n"
        f"  Date:            {trip_date}\n"
        f"  Office arrival:  {arrival_time}\n"
        f"  Pickup time:     {pickup_time}\n"
        f"  Driver:          {driver_name}\n"
        f"  Driver contact:  {driver_contact}\n"
        f"  Vehicle number:  {vehicle_number}\n\n"
        "Please be ready at your pickup point on time.\n"
    )
    await _deliver(to, f"Your transport for {trip_date}", body)


async def send_weekly_rejected(to: str, name: str, week_start: str, remarks: str) -> None:
    body = (
        f"Hi {name},\n\n"
        f"Your weekly transport schedule for the week of {week_start} was not approved.\n\n"
        f"Remarks from Operations: {remarks}\n\n"
        "Please review and resubmit before the deadline."
    )
    await _deliver(to, f"Weekly schedule rejected — week of {week_start}", body)


async def send_address_change_result(
    to: str, name: str, approved: bool, new_address: str
) -> None:
    if approved:
        subject = "Address change approved"
        body = (
            f"Hi {name},\n\nYour address change was approved.\n"
            f"New address on file:\n{new_address}\n"
        )
    else:
        subject = "Address change rejected"
        body = (
            f"Hi {name},\n\nYour address change request was rejected. "
            "Your address on file is unchanged.\n"
        )
    await _deliver(to, subject, body)
