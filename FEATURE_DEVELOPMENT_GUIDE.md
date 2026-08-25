# Feature Development Guide — Transportation Management Portal

## Overview
This guide walks you through adding a new feature to TMP following the established patterns and conventions.

---

## Feature Template: Step-by-Step

### Example: Adding a "Driver Performance Report" Feature

#### 1. Plan the Feature
**Requirement:** Super Admin can view a report showing each driver's number of allocations, average employee satisfaction rating, and cancellation rate over a date range.

**Database Impact:**
- New table? `driver_performance` (if caching needed) OR just query `allocations` + new `allocation_ratings`
- New columns? `allocations.satisfaction_rating` (1-5 stars), `allocations.notes`
- New model? `DriverPerformance` (read-only, computed from allocations)

**API Changes:**
- `GET /api/v1/admin/driver-performance` — list drivers with stats
- `PATCH /api/v1/allocations/{id}/rating` — employee rates allocation

**Frontend Changes:**
- New page: `/admin/driver-performance`
- Rating modal on employee transport details

#### 2. Database Schema Changes

**File: `backend/app/models/allocation.py`**
```python
from sqlalchemy import Integer

class Allocation(Base):
    # ... existing fields ...
    satisfaction_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    rating_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

**Create migration:**
```bash
cd backend
alembic revision --autogenerate -m "Add satisfaction_rating to allocations"
# Review alembic/versions/xxx_add_satisfaction_rating.py
alembic upgrade head
```

#### 3. Create Pydantic Schemas

**File: `backend/app/schemas/allocation.py`**
```python
from pydantic import BaseModel, Field

class AllocationRatingIn(BaseModel):
    satisfaction_rating: int = Field(ge=1, le=5)
    rating_notes: str | None = None

class AllocationOut(BaseModel):
    id: int
    employee_id: int
    driver_name: str
    pickup_time: str
    satisfaction_rating: int | None = None
    rating_notes: str | None = None
    allocated_at: datetime
    
    class Config:
        from_attributes = True

class DriverPerformanceStats(BaseModel):
    driver_name: str
    total_allocations: int
    avg_satisfaction: float | None = None
    cancellation_rate: float
    last_allocated: datetime
```

#### 4. Create API Endpoint

**File: `backend/app/api/v1/admin.py`** (or create new file if it doesn't exist)
```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.core.permissions import require_roles
from app.models.user import User
from app.models.allocation import Allocation
from app.schemas.allocation import DriverPerformanceStats, AllocationRatingIn
from app.services.audit_service import AuditService

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/driver-performance", response_model=list[DriverPerformanceStats])
async def get_driver_performance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    start_date: str = Query(...),  # YYYY-MM-DD
    end_date: str = Query(...),    # YYYY-MM-DD
):
    """Get driver performance stats (Super Admin only)."""
    require_roles(current_user, ["super_admin"])
    
    # Query allocations grouped by driver
    stmt = (
        select(
            Allocation.driver_name,
            func.count(Allocation.id).label("total_allocations"),
            func.avg(Allocation.satisfaction_rating).label("avg_satisfaction"),
            func.max(Allocation.allocated_at).label("last_allocated"),
        )
        .where(
            (Allocation.allocated_at >= start_date)
            & (Allocation.allocated_at <= end_date)
        )
        .group_by(Allocation.driver_name)
        .order_by(func.count(Allocation.id).desc())
    )
    
    result = await db.execute(stmt)
    rows = result.fetchall()
    
    stats = []
    for row in rows:
        stats.append(
            DriverPerformanceStats(
                driver_name=row.driver_name,
                total_allocations=row.total_allocations,
                avg_satisfaction=row.avg_satisfaction,
                cancellation_rate=0.0,  # TODO: calculate from adhoc_requests
                last_allocated=row.last_allocated,
            )
        )
    
    return stats


@router.patch("/allocations/{allocation_id}/rating", response_model=dict)
async def rate_allocation(
    allocation_id: int,
    rating_in: AllocationRatingIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Employee rates their allocation (satisfaction)."""
    # Only the employee who received transport can rate
    allocation = await db.get(Allocation, allocation_id)
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    if allocation.employee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only rate your own allocation")
    
    # Audit before
    before = {
        "satisfaction_rating": allocation.satisfaction_rating,
        "rating_notes": allocation.rating_notes,
    }
    
    # Update
    allocation.satisfaction_rating = rating_in.satisfaction_rating
    allocation.rating_notes = rating_in.rating_notes
    db.add(allocation)
    await db.flush()
    
    # Audit after
    after = {
        "satisfaction_rating": allocation.satisfaction_rating,
        "rating_notes": allocation.rating_notes,
    }
    
    await AuditService.log(
        db=db,
        actor=current_user,
        action="RATE_ALLOCATION",
        entity_type="Allocation",
        entity_id=allocation_id,
        before=before,
        after=after,
        description=f"Employee {current_user.name} rated allocation {allocation_id}",
    )
    
    await db.commit()
    return {"detail": "Allocation rated successfully"}
```

#### 5. Add Permission Checks

**File: `backend/app/core/permissions.py`**
```python
def require_roles(user: User, allowed_roles: list[str]):
    """Enforce role-based access control."""
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Only {', '.join(allowed_roles)} can access this resource",
        )
```

#### 6. Add Tests

**File: `backend/tests/test_driver_performance.py`**
```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.asyncio
async def test_driver_performance_super_admin_only(client: TestClient, db_session):
    """Super Admin can view driver performance."""
    # Create test user (operations role)
    operations_user = User(name="Ops", email="ops@test.com", role="operations")
    db_session.add(operations_user)
    await db_session.commit()
    
    # Try to access as operations → 403
    response = client.get(
        "/api/v1/admin/driver-performance",
        params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert response.status_code == 403
    
    # Try as super_admin → 200
    response = client.get(
        "/api/v1/admin/driver-performance",
        params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_employee_can_rate_own_allocation(client: TestClient, db_session):
    """Employee can rate their own allocation."""
    # Create allocation for employee
    allocation = Allocation(
        employee_id=employee_user.id,
        driver_name="Ahmed",
        vehicle_number="DHA-1234",
        pickup_time="10:00",
        driver_contact="01712345678",
        allocated_by=facilities_user.id,
        source_type="adhoc",
    )
    db_session.add(allocation)
    await db_session.commit()
    
    # Rate allocation
    response = client.patch(
        f"/api/v1/allocations/{allocation.id}/rating",
        json={"satisfaction_rating": 5, "rating_notes": "Great service!"},
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert response.status_code == 200
```

Run tests:
```bash
pytest backend/tests/test_driver_performance.py -v
```

#### 7. Create Frontend Components

**File: `frontend/src/pages/admin/DriverPerformance.tsx`**
```typescript
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { adminApi } from '@/api/admin';
import { Card, Badge, Table } from '@/components';

interface DriverStats {
  driver_name: string;
  total_allocations: number;
  avg_satisfaction: number | null;
  cancellation_rate: number;
  last_allocated: string;
}

export function DriverPerformance() {
  const [startDate, setStartDate] = useState(
    format(subMonths(new Date(), 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['driver-performance', startDate, endDate],
    queryFn: () =>
      adminApi.getDriverPerformance({ start_date: startDate, end_date: endDate }),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
        />
      </div>

      <Card className="p-6">
        <Table
          columns={[
            { header: 'Driver Name', key: 'driver_name' },
            { header: 'Total Allocations', key: 'total_allocations' },
            {
              header: 'Avg Satisfaction',
              key: 'avg_satisfaction',
              render: (val) => val ? `${val.toFixed(1)}/5.0` : '—',
            },
            { header: 'Cancellation Rate', key: 'cancellation_rate', render: (val) => `${(val * 100).toFixed(1)}%` },
          ]}
          data={stats || []}
        />
      </Card>
    </div>
  );
}
```

#### 8. Wire Up Frontend Route

**File: `frontend/src/App.tsx`** (or router config)
```typescript
{
  path: 'driver-performance',
  element: <DriverPerformance />,
  requiredRoles: ['super_admin'],
}
```

#### 9. Code Quality Checks

```bash
# Backend
cd backend
black app/
ruff check app/

# Frontend
cd frontend
prettier --write src/pages/admin/DriverPerformance.tsx
eslint src/pages/admin/DriverPerformance.tsx --fix
```

#### 10. Commit Changes

```bash
cd "D:/Devolopment/Transportation System/_archived-fastapi-scaffold-2026-07-27"

git add backend/app/models/allocation.py
git add backend/alembic/versions/
git add backend/app/api/v1/admin.py
git add backend/tests/test_driver_performance.py
git add backend/app/schemas/allocation.py
git add frontend/src/pages/admin/DriverPerformance.tsx
git add frontend/src/App.tsx

git commit -m "feat: Add driver performance report for Super Admin

- Add satisfaction_rating and rating_notes to allocations table
- Create /admin/driver-performance endpoint for driver stats
- Employees can rate their allocations
- Frontend: Driver performance dashboard with date filtering
- Comprehensive tests for role-based access
- Full audit logging for all changes

Closes: FEATURE-001"

git push origin feature/driver-performance-report
```

---

## Common Patterns

### Pagination
```python
# Backend
from app.schemas.common import PaginationParams

@router.get("/allocations")
async def list_allocations(
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
):
    skip = (pagination.page - 1) * pagination.size
    stmt = select(Allocation).offset(skip).limit(pagination.size)
    result = await db.execute(stmt)
    return result.scalars().all()
```

### Date Range Filtering
```python
from datetime import date
from sqlalchemy import and_

stmt = select(Allocation).where(
    and_(
        Allocation.allocated_at >= start_date,
        Allocation.allocated_at <= end_date,
    )
)
```

### Role-Based Access
```python
# Always check server-side
require_roles(current_user, ["super_admin", "operations"])
```

### Audit Logging
```python
from app.services.audit_service import AuditService

await AuditService.log(
    db=db,
    actor=current_user,
    action="APPROVE_WEEKLY_REQUEST",
    entity_type="WeeklyRequest",
    entity_id=weekly_request.id,
    before={"status": "submitted"},
    after={"status": "approved"},
    description=f"Operations approved weekly request {weekly_request.id}",
)
```

### Background Tasks (Email)
```python
from fastapi import BackgroundTasks

@router.post("/allocations")
async def create_allocation(
    allocation_in: AllocationIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    allocation = Allocation(**allocation_in.dict())
    db.add(allocation)
    await db.flush()
    
    # Send email in background
    background_tasks.add_task(
        send_allocation_email,
        employee_email=allocation.employee.email,
        driver_name=allocation.driver_name,
        vehicle=allocation.vehicle_number,
    )
    
    await db.commit()
    return allocation
```

---

## Checklist for New Features

- [ ] Database models/migrations created and tested
- [ ] Pydantic schemas defined
- [ ] API endpoints implemented with permission checks
- [ ] Audit logging added (before/after snapshots)
- [ ] Unit/integration tests written and passing
- [ ] Frontend components created and styled
- [ ] Loading/empty/error states handled
- [ ] Responsive design tested (mobile/tablet/desktop)
- [ ] `black`, `ruff`, `prettier`, `eslint` run successfully
- [ ] Changes committed with meaningful message
- [ ] Database rollback tested (if applicable)

---

## Ready to Build!

Pick a feature and follow this guide. I'll help you implement it step-by-step with proper git commits and version control.

What feature would you like to add?
