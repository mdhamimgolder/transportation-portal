"""Retention management script.

Exports audit_logs and allocations older than RETENTION_YEARS (default 3) to
CSV, then deletes them. Requires an explicit --confirm flag. Logs its run to
the audit log. NEVER run automatically / on a schedule.

Usage:
    python -m scripts.archive_old_data                 # dry run (reports only)
    python -m scripts.archive_old_data --confirm       # export + delete
    python -m scripts.archive_old_data --years 3 --confirm
"""
import argparse
import asyncio
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.models.allocation import Allocation
from app.models.audit import AuditLog

ARCHIVE_DIR = Path("archives")


async def _export(db, model, cutoff, date_col, name: str) -> int:
    rows = (await db.scalars(select(model).where(date_col < cutoff))).all()
    if not rows:
        print(f"  {name}: nothing older than cutoff.")
        return 0
    ARCHIVE_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = ARCHIVE_DIR / f"{name}_{stamp}.csv"
    cols = [c.name for c in model.__table__.columns]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        for r in rows:
            writer.writerow([getattr(r, c) for c in cols])
    print(f"  {name}: exported {len(rows)} rows -> {path}")
    return len(rows)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Archive & purge data older than N years.")
    parser.add_argument("--years", type=int, default=3)
    parser.add_argument("--confirm", action="store_true", help="actually export and delete")
    args = parser.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=365 * args.years)
    print(f"Retention cutoff: {cutoff.isoformat()} (older than {args.years} years)")

    async with AsyncSessionLocal() as db:
        # Report counts.
        audit_count = len((await db.scalars(select(AuditLog).where(AuditLog.created_at < cutoff))).all())
        alloc_count = len((await db.scalars(select(Allocation).where(Allocation.allocated_at < cutoff))).all())
        print(f"Would archive: audit_logs={audit_count}, allocations={alloc_count}")

        if not args.confirm:
            print("\nDry run. Re-run with --confirm to export and delete.")
            return

        print("\nExporting...")
        n_audit = await _export(db, AuditLog, cutoff, AuditLog.created_at, "audit_logs")
        n_alloc = await _export(db, Allocation, cutoff, Allocation.allocated_at, "allocations")

        await db.execute(delete(Allocation).where(Allocation.allocated_at < cutoff))
        await db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))

        # Log the run itself.
        db.add(AuditLog(
            actor_id=None, actor_role="system", action="ARCHIVE_OLD_DATA",
            entity_type="maintenance", entity_id=None,
            after={"years": args.years, "audit_logs": n_audit, "allocations": n_alloc},
            description=f"Archived+deleted rows older than {args.years}y "
                        f"(audit_logs={n_audit}, allocations={n_alloc})",
        ))
        await db.commit()
        print(f"\nDone. Deleted audit_logs={n_audit}, allocations={n_alloc}.")


if __name__ == "__main__":
    asyncio.run(main())
