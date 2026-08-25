"""Timezone-aware helpers for the weekly submission deadline (Asia/Dhaka).

All logic works in the configured local timezone but timestamps are stored in
UTC elsewhere. The "week" is Mon-Fri; week_start is the Monday.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

TZ = ZoneInfo(settings.TIMEZONE)


def now_local() -> datetime:
    return datetime.now(TZ)


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def next_week_start(reference: date | None = None) -> date:
    """Monday of the week following the reference date (default: today, local)."""
    ref = reference or now_local().date()
    return monday_of(ref) + timedelta(days=7)


def week_days(week_start: date) -> list[date]:
    """The five weekdays (Mon-Fri) of the given week."""
    return [week_start + timedelta(days=i) for i in range(5)]


def deadline_for_week(week_start: date) -> datetime:
    """The submission deadline for schedules of `week_start`.

    Deadline = the configured weekday/time (default Saturday 12:00) of the
    week *before* week_start, in Asia/Dhaka.
    """
    saturday_before = week_start - timedelta(days=7 - settings.WEEKLY_DEADLINE_WEEKDAY)
    return datetime(
        saturday_before.year,
        saturday_before.month,
        saturday_before.day,
        settings.WEEKLY_DEADLINE_HOUR,
        settings.WEEKLY_DEADLINE_MINUTE,
        tzinfo=TZ,
    )


def is_past_deadline(week_start: date, at: datetime | None = None) -> bool:
    current = at or now_local()
    if current.tzinfo is None:
        current = current.replace(tzinfo=TZ)
    return current > deadline_for_week(week_start)
