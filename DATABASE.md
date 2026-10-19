# Transportation Management Portal (TMP) — Database Schema & Flow

## Overview
The Transportation Management Portal uses **SQLAlchemy 2.0 (async)** with **Alembic** migrations for database versioning. The system is database-agnostic and currently runs on **SQLite** for development, with production readiness for **PostgreSQL 16**.

---

## Database Tables & Relationships

### 1. **users** — Core user accounts
```
Table: users
├── id (PK, int)
├── name (varchar 120, NOT NULL)
├── email (varchar 255, UNIQUE, INDEX, NOT NULL)
├── contact_number (varchar 40, nullable)
├── address (varchar 500, nullable)
├── hashed_password (varchar 255, NOT NULL)
├── role (varchar 20, DEFAULT='employee', INDEX) → [employee|operations|facilities|super_admin]
├── is_active (boolean, DEFAULT=True)
├── created_at (DateTime with TZ, server_default=now())
└── updated_at (DateTime with TZ, auto-updated)

Relationships:
  - reset_tokens → PasswordResetToken (1:many, cascade delete)
  - weekly_requests → WeeklyRequest (1:many)
  - adhoc_requests → AdhocRequest (1:many)
  - allocations → Allocation (1:many)
  - address_change_requests → AddressChangeRequest (1:many)
  - audit_logs → AuditLog (1:many)
```

**Purpose:** Stores all user accounts with role-based access control.

---

### 2. **password_reset_tokens** — One-time password reset links
```
Table: password_reset_tokens
├── id (PK, int)
├── user_id (FK → users.id, INDEX, CASCADE DELETE, NOT NULL)
├── token_hash (varchar 255, NOT NULL) ← hashed reset token
├── expires_at (DateTime with TZ, NOT NULL) ← 30 minutes validity
├── used_at (DateTime with TZ, nullable) ← NULL until token used
└── created_at (DateTime with TZ, server_default=now())

Relationships:
  └── user → User (many:1)
```

**Purpose:** Enables secure password reset flow (30 min, single-use tokens).

**Flow:**
1. User clicks "Forgot Password" → enters email
2. System generates token_hash, stores with 30-min expiry
3. Email sent with reset link (contains unhashed token)
4. User clicks link → validates token against token_hash and expiry
5. User sets new password → token marked `used_at`, no reuse

---

### 3. **weekly_requests** — Employee weekly transport schedules
```
Table: weekly_requests
├── id (PK, int)
├── employee_id (FK → users.id, INDEX, NOT NULL)
├── week_start_date (Date, INDEX, NOT NULL) ← Monday of the week
├── status (varchar 20, DEFAULT='submitted', INDEX) → [submitted|approved|rejected]
├── submitted_at (DateTime with TZ, server_default=now(), NOT NULL)
├── reviewed_by (FK → users.id, nullable) ← Operations/Admin who approved/rejected
├── reviewed_at (DateTime with TZ, nullable)
├── remarks (varchar 500, nullable) ← rejection reason if status='rejected'
└── UNIQUE(employee_id, week_start_date) ← one request per employee per week

Relationships:
  ├── employee → User (many:1)
  ├── reviewer → User (many:1)
  └── days → WeeklyRequestDay (1:many, cascade delete)
```

**Purpose:** Stores weekly transport requests (Mon–Fri only).

**Business Rules:**
- Deadline: **Saturday 12:00 AM Asia/Dhaka** (weekly submission cutoff)
- After deadline, API rejects new submissions for that week
- Flow: submitted → Operations reviews → approved/rejected
- If approved, visible to Facilities for route planning

---

### 4. **weekly_request_days** — Per-day entries within a weekly request
```
Table: weekly_request_days
├── id (PK, int)
├── weekly_request_id (FK → weekly_requests.id, CASCADE DELETE, INDEX, NOT NULL)
├── day_date (Date, INDEX, NOT NULL) ← specific date (Mon/Tue/Wed/Thu/Fri)
├── arrival_time (varchar 5, NOT NULL) ← HH:MM format (e.g., "10:00", "11:30")
└── UNIQUE(weekly_request_id, day_date) ← one entry per day per request

Relationships:
  ├── weekly_request → WeeklyRequest (many:1)
  └── allocations → Allocation (1:many)
```

**Purpose:** Stores per-day details for a weekly request.

**Typical Data Example:**
```
WeeklyRequest (week_start_date='2026-08-25' Monday)
├─ WeeklyRequestDay (day_date='2026-08-25', arrival_time='10:00')
├─ WeeklyRequestDay (day_date='2026-08-26', arrival_time='11:00')
├─ WeeklyRequestDay (day_date='2026-08-27', arrival_time='10:00')
├─ WeeklyRequestDay (day_date='2026-08-28', arrival_time='12:00')
└─ WeeklyRequestDay (day_date='2026-08-29', arrival_time='11:30')
```

---

### 5. **adhoc_requests** — Emergency transport requests (no approval step)
```
Table: adhoc_requests
├── id (PK, int)
├── employee_id (FK → users.id, INDEX, NOT NULL)
├── request_date (Date, INDEX, NOT NULL) ← date transport needed
├── arrival_time (varchar 5, NOT NULL) ← HH:MM format
├── reason (varchar 500, NOT NULL) ← e.g., "Emergency meeting", "Urgent delivery"
├── status (varchar 20, DEFAULT='open', INDEX) → [open|allocated|cancelled]
└── created_at (DateTime with TZ, server_default=now(), INDEX, NOT NULL)

Relationships:
  ├── employee → User (many:1)
  └── allocations → Allocation (1:many)
```

**Purpose:** Immediate transport requests that skip Operations approval.

**Business Rules:**
- No approval step; instantly visible to both Operations (tracking) and Facilities (action)
- Facilities allocates driver/vehicle immediately
- Flow: created → Facilities assigns → allocated

---

### 6. **allocations** — Driver & vehicle assignments for transport
```
Table: allocations
├── id (PK, int)
├── source_type (varchar 20, NOT NULL) → [weekly_day|adhoc]
├── weekly_request_day_id (FK → weekly_request_days.id, nullable, INDEX)
├── adhoc_request_id (FK → adhoc_requests.id, nullable, INDEX)
├── employee_id (FK → users.id, INDEX, NOT NULL)
├── pickup_time (varchar 5, NOT NULL) ← HH:MM (may differ from arrival_time)
├── driver_name (varchar 120, NOT NULL, INDEX)
├── driver_contact (varchar 40, NOT NULL)
├── vehicle_number (varchar 40, NOT NULL, INDEX) ← license plate or vehicle ID
├── allocated_by (FK → users.id, NOT NULL) ← Facilities/Admin who created
├── allocated_at (DateTime with TZ, server_default=now(), INDEX, NOT NULL)
└── email_sent_at (DateTime with TZ, nullable) ← BackgroundTask stamps this

Relationships:
  ├── employee → User (many:1)
  ├── allocator → User (many:1)
  ├── weekly_day → WeeklyRequestDay (many:1)
  └── adhoc_request → AdhocRequest (many:1)
```

**Purpose:** Links driver/vehicle to an employee's transport request.

**Business Rules:**
- Facilities creates allocation with pickup_time + driver_name + driver_contact + vehicle_number
- On creation, **FastAPI BackgroundTask** sends email to employee immediately
- `email_sent_at` stamped only after successful send
- Supports "copy across week": copy one day's allocation to remaining days

**Typical Flow:**
```
1. Facilities opens weekly request with 5 approved days
2. For Monday (day 1), Facilities assigns:
   - pickup_time='09:45'
   - driver_name='Ahmed'
   - driver_contact='01712345678'
   - vehicle_number='DHA-1234'
   → Allocation created → Email sent → email_sent_at stamped

3. Facilities clicks "Copy to remaining days"
   → Allocations auto-created for Tue–Fri with same details
```

---

### 7. **address_change_requests** — Employee address change requests
```
Table: address_change_requests
├── id (PK, int)
├── employee_id (FK → users.id, INDEX, NOT NULL)
├── old_address (varchar 500, nullable)
├── new_address (varchar 500, NOT NULL)
├── status (varchar 20, DEFAULT='pending', INDEX) → [pending|approved|rejected]
├── reviewed_by (FK → users.id, nullable) ← Operations/Admin who reviewed
├── reviewed_at (DateTime with TZ, nullable)
└── created_at (DateTime with TZ, INDEX, server_default=now(), NOT NULL)

Relationships:
  ├── employee → User (many:1)
  └── reviewer → User (many:1)
```

**Purpose:** Handles address change workflows.

**Business Rules:**
- Employee submits new address (cannot edit directly; only request)
- Operations/Admin reviews → approves/rejects
- If approved: `users.address` updated, audit log created, notification email sent
- Employees can edit name/contact directly but never address

**Flow:**
```
1. Employee submits address_change_request (new_address='New St, Dhaka')
2. Operations reviews → approves
3. System updates users.address = new_address
4. AuditLog entry created
5. Email sent to employee confirming change
```

---

### 8. **audit_logs** — Complete audit trail for compliance
```
Table: audit_logs
├── id (PK, int)
├── actor_id (FK → users.id, nullable) ← who performed the action
├── actor_role (varchar 20, nullable) ← cached role at time of action
├── action (varchar 60, NOT NULL) → verb, e.g., APPROVE_ADDRESS_CHANGE, ALLOCATE_DRIVER
├── entity_type (varchar 60, NOT NULL) → e.g., AddressChangeRequest, Allocation
├── entity_id (int, nullable) ← ID of the entity affected
├── before_json (JSON, nullable) ← state before change
├── after_json (JSON, nullable) ← state after change
├── description (varchar 500, nullable) ← human-readable, e.g., "Operations approved Employee X's address change"
├── created_at (DateTime with TZ, server_default=now(), NOT NULL)
│
└── Indexes:
    ├── ix_audit_created_at (created_at)
    ├── ix_audit_actor_id (actor_id)
    └── ix_audit_entity_type (entity_type)
```

**Purpose:** Immutable audit trail for every significant action.

**Typical Actions:**
- `SUBMIT_WEEKLY_REQUEST` — employee submits schedule
- `APPROVE_WEEKLY_REQUEST` — operations approves
- `REJECT_WEEKLY_REQUEST` — operations rejects
- `SUBMIT_ADHOC_REQUEST` — employee submits emergency request
- `ALLOCATE_DRIVER` — facilities assigns driver
- `SUBMIT_ADDRESS_CHANGE` — employee requests address update
- `APPROVE_ADDRESS_CHANGE` — operations approves address
- `EDIT_USER_PROFILE` — user/admin edits profile

**Retention Policy:**
- Keep all rows ≥ 3 years
- Provide cleanup script for archiving rows older than 3 years (manual confirmation)
- Never auto-delete without user confirmation

---

## Data Flow Diagrams

### Weekly Request Flow
```
┌──────────────┐
│   Employee   │
└──────┬───────┘
       │ Submits weekly schedule
       │ (Mon–Fri, by Sat 12:00 AM)
       ▼
┌──────────────────────────────┐
│  WeeklyRequest (submitted)   │
│  + WeeklyRequestDay × 5      │
└──────┬───────────────────────┘
       │ Operations reviews
       ├─ Approves ───────┐
       └─ Rejects ────┐   │
                      │   │
                      ▼   ▼
              (rejected) (approved)
                      │   │
                      │   └──────────────┐
                      │                  │ Visible to Facilities
                      ▼                  ▼
        Notify Employee           ┌──────────────┐
        (rejected_reason)         │  Allocations │
                                  │ (assign driver│
                                  │  + vehicle)  │
                                  └──────┬───────┘
                                         │ BackgroundTask
                                         ▼
                                   Send Email
                                   to Employee
                                   (pickup_time,
                                    driver, vehicle)
```

### Ad-Hoc Request Flow
```
┌──────────────┐
│   Employee   │
└──────┬───────┘
       │ Submits ad-hoc request
       │ (emergency/urgent)
       ▼
┌──────────────────────────────┐
│  AdhocRequest (open)         │
│  + Instant alert to:         │
│    - Operations (tracking)   │
│    - Facilities (action)     │
└──────┬───────────────────────┘
       │ Facilities assigns immediately
       │ (no approval step)
       ▼
┌──────────────┐
│  Allocation  │
│  (driver +   │
│   vehicle)   │
└──────┬───────┘
       │ BackgroundTask
       ▼
 Send Email
 to Employee
```

### Address Change Flow
```
┌──────────────┐
│   Employee   │
└──────┬───────┘
       │ Requests address change
       │ (cannot edit directly)
       ▼
┌──────────────────────────────┐
│ AddressChangeRequest (pending)│
└──────┬───────────────────────┘
       │ Operations reviews
       ├─ Approves ───────┐
       └─ Rejects ────┐   │
                      │   │
                      ▼   ▼
        Notify Employee   Update users.address
                              │
                              ├─ AuditLog entry
                              ├─ Email notification
                              └─ Done
```

---

## Key Indexes for Performance

| Table | Column(s) | Purpose |
|-------|-----------|---------|
| users | email | Unique constraint for login |
| users | role | Filter by role (role-based dashboards) |
| weekly_requests | employee_id, week_start_date | Check duplicate submissions |
| weekly_requests | status | Filter approved requests |
| weekly_request_days | day_date | Query by date |
| adhoc_requests | employee_id, request_date | Filter by employee/date |
| adhoc_requests | status | Find open/allocated requests |
| allocations | employee_id, allocated_at | History queries |
| allocations | driver_name, vehicle_number | Search allocations |
| allocations | weekly_request_day_id, adhoc_request_id | Link to source |
| address_change_requests | employee_id, status | Track pending requests |
| audit_logs | created_at, actor_id, entity_type | Compliance queries |

---

## Timezone Handling

**Rule:** Store all timestamps in **UTC**, display in **Asia/Dhaka** (UTC+6).

**Implementation:**
- All `DateTime` columns use `DateTime(timezone=True)`
- Backend receives request with user's local time
- Convert to UTC before storing
- When returning to frontend, convert back to Asia/Dhaka

**Weekly Deadline Example:**
```python
# Deadline: Saturday 12:00 AM Asia/Dhaka
deadline_dhaka = datetime(2026, 8, 29, 12, 0, 0, tzinfo=dhaka_tz)
deadline_utc = deadline_dhaka.astimezone(UTC)  # 2026-08-29 06:00:00 UTC

# Check if submission is before deadline
now_utc = datetime.now(UTC)
if now_utc > deadline_utc:
    raise HTTPException(detail="Weekly deadline passed")
```

---

## Migration Strategy (Alembic)

All schema changes must go through Alembic migrations:

```bash
# Generate migration (auto-detect changes in models)
alembic revision --autogenerate -m "Add new_column to users"

# Review generated migration in alembic/versions/

# Apply to local DB
alembic upgrade head

# Rollback if needed
alembic downgrade -1
```

**Never edit the database by hand.** Always version-control schema changes.

---

## Development Setup

```bash
# 1. Create .env from .env.example
cp .env.example .env

# 2. Set DATABASE_URL (default: SQLite)
DATABASE_URL=sqlite+aiosqlite:///./transport.db

# 3. Install dependencies
pip install -r requirements.txt

# 4. Apply migrations
alembic upgrade head

# 5. Run FastAPI server
uvicorn app.main:app --reload

# 6. Create superuser (optional CLI command)
python -m app.scripts.create_superuser
```

---

## Production Readiness

To switch to **PostgreSQL 16** for production:

```bash
# 1. Update .env
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/tmp_db

# 2. Create database
createdb tmp_db

# 3. Apply migrations
alembic upgrade head

# All SQLAlchemy models remain unchanged—schema is database-agnostic.
```

---

## Summary

The database is designed for **security, auditability, and scalability**:
- ✅ Role-based access control (4 roles)
- ✅ Complete audit trail (every action logged)
- ✅ Timezone-aware (Asia/Dhaka)
- ✅ Database-agnostic (SQLite ↔ PostgreSQL)
- ✅ Async-ready (SQLAlchemy 2.0 async)
- ✅ Migration-first (Alembic versioning)
