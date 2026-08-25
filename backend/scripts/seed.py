"""Seed one user of each role for testing. Prints their credentials.

Run:  python -m scripts.seed
"""
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User

SEED_PASSWORD = "Password1"

SEED_USERS = [
    ("Emma Employee", "employee@example.com", "employee", "+8801700000001", "House 1, Road 1, Dhaka"),
    ("Omar Operations", "operations@example.com", "operations", "+8801700000002", "House 2, Road 2, Dhaka"),
    ("Farah Facilities", "facilities@example.com", "facilities", "+8801700000003", "House 3, Road 3, Dhaka"),
    ("Adam Admin", "admin@example.com", "super_admin", "+8801700000004", "House 4, Road 4, Dhaka"),
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        created = []
        for name, email, role, contact, address in SEED_USERS:
            existing = await db.scalar(select(User).where(User.email == email))
            if existing:
                continue
            db.add(User(
                name=name, email=email, role=role, contact_number=contact,
                address=address, hashed_password=hash_password(SEED_PASSWORD),
            ))
            created.append((email, role))
        await db.commit()

    print("\nSeed complete. Test credentials (password for all):", SEED_PASSWORD)
    print("-" * 60)
    for name, email, role, *_ in SEED_USERS:
        print(f"  {role:<12} {email}")
    if not created:
        print("\n(all seed users already existed)")
    print()


if __name__ == "__main__":
    asyncio.run(main())
