# Transportation Management Portal — Quick Database Reference

## Database Schema at a Glance

```
users (id, name, email*, contact_number, address, hashed_password, role*, is_active, created_at, updated_at)
├── password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
├── weekly_requests (id, employee_id, week_start_date, status, submitted_at, reviewed_by, reviewed_at, remarks)
│   └── weekly_request_days (id, weekly_request_id, day_date, arrival_time)
│       └── allocations (id, weekly_request_day_id, employee_id, pickup_time, driver_name, driver_contact, vehicle_number, allocated_by, allocated_at, email_sent_at)
├── adhoc_requests (id, employee_id, request_date, arrival_time, reason, status, created_at)
│   └── allocations (id, adhoc_request_id, employee_id, pickup_time, driver_name, driver_contact, vehicle_number, allocated_by, allocated_at, email_sent_at)
├── address_change_requests (id, employee_id, old_address, new_address, status, reviewed_by, reviewed_at, created_at)
└── audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, description, created_at)
```

## Entity Relationship Summary

### 1. Users & Authentication
- **users**: All system users (employee, operations, facilities, super_admin)
- **password_reset_tokens**: One-time reset links (30 min validity, single-use)

### 2. Weekly Transport Requests
- **weekly_requests**: Employee submits schedule for Mon–Fri (deadline: Sat 12:00 PM Asia/Dhaka)
  - Status flow: `submitted` → `approved` OR `rejected`
  - Only approved requests visible to Facilities for planning
- **weekly_request_days**: Per-day entries (5 rows per request, one per weekday)
  - Each has an arrival_time (10:00, 11:00, 12:00, etc.)

### 3. Ad-Hoc (Emergency) Requests
- **adhoc_requests**: Immediate transport requests (skip Operations approval)
  - Status: `open` → `allocated` OR `cancelled`
  - Visible to both Operations (tracking) and Facilities (action)

### 4. Route Planning & Allocations
- **allocations**: Facilities assigns driver + vehicle
  - Links to either a `weekly_request_day` OR `adhoc_request`
  - On creation: BackgroundTask sends email to employee, stamps `email_sent_at`
  - Supports "copy across week" (replicate one day's allocation to remaining days)

### 5. Address Management
- **address_change_requests**: Employee requests address update
  - Status: `pending` → `approved` OR `rejected`
  - On approval: `users.address` updated, audit logged, email sent

### 6. Compliance & Audit
- **audit_logs**: Every significant action logged (immutable)
  - Indexed on: `created_at`, `actor_id`, `entity_type`
  - Retention: ≥ 3 years
  - Supports cleanup script (manual confirmation only)

---

## Key Business Rules

| Rule | Enforcement |
|------|-------------|
| Weekly deadline | Sat 12:00 PM Asia/Dhaka; API rejects after deadline |
| Weekly flow | submitted → Operations approves → Facilities plans |
| Ad-hoc flow | No approval; instant alert to Ops + Facilities |
| Allocation dispatch | Email sent on driver assignment (BackgroundTask) |
| Address change | Request → Operations approval → auto-update → email |
| Role permissions | Enforced server-side via FastAPI dependency |
| Audit trail | Every create/update/approve/reject logged |
| Timezone | All stored as UTC, displayed as Asia/Dhaka (UTC+6) |

---

## API Endpoints (by Role)

### Employee
- `POST /api/v1/auth/register` — Self-signup
- `POST /api/v1/auth/login` — Email + password
- `POST /api/v1/auth/forgot-password` — Reset link via email
- `POST /api/v1/auth/reset-password` — Set new password
- `POST /api/v1/weekly` — Submit weekly schedule (by Sat 12:00 PM)
- `POST /api/v1/adhoc` — Submit emergency request
- `GET /api/v1/transport/my-details` — View own allocations
- `GET /api/v1/users/me` — View own profile
- `PATCH /api/v1/users/me` — Edit name/contact (NOT address)
- `POST /api/v1/address-change` — Request address update

### Operations
- `GET /api/v1/weekly` — List all weekly requests (filter by status)
- `PATCH /api/v1/weekly/{id}` — Approve/reject with remarks
- `GET /api/v1/adhoc` — List all ad-hoc requests
- `GET /api/v1/address-change` — List pending address changes
- `PATCH /api/v1/address-change/{id}` — Approve/reject
- `GET /api/v1/users` — View/edit any employee profile
- `GET /api/v1/history` — View allocations by date/employee/driver

### Facilities
- `GET /api/v1/weekly/approved` — List approved weekly requests
- `GET /api/v1/adhoc` — List open ad-hoc requests
- `POST /api/v1/allocations` — Assign driver + vehicle
- `POST /api/v1/allocations/{id}/copy-week` — Copy allocation to remaining days
- `GET /api/v1/history` — View allocation history
- `GET /api/v1/users` — View/edit employee addresses

### Super Admin
- All of the above +
- `POST /api/v1/admin/users/bulk-upload` — CSV/Excel bulk user creation
- `GET /api/v1/admin/audit-logs` — Full audit trail (filterable)
- `POST /api/v1/admin/cleanup-audit` — Archive logs > 3 years (manual confirm)

---

## Database Queries for Common Operations

### Find approved weekly requests for next week
```sql
SELECT wr.* FROM weekly_requests wr
WHERE wr.status = 'approved'
  AND wr.week_start_date = '2026-08-25'  -- next Monday
ORDER BY wr.employee_id;
```

### Get allocation history for an employee
```sql
SELECT a.*, u.name, u.email 
FROM allocations a
JOIN users u ON a.employee_id = u.id
WHERE a.employee_id = ?
  AND a.allocated_at BETWEEN ? AND ?
ORDER BY a.allocated_at DESC;
```

### Check if employee has pending address change
```sql
SELECT * FROM address_change_requests
WHERE employee_id = ? AND status = 'pending'
LIMIT 1;
```

### Audit trail for a specific entity
```sql
SELECT * FROM audit_logs
WHERE entity_type = 'Allocation' AND entity_id = ?
ORDER BY created_at DESC;
```

### Find all open ad-hoc requests
```sql
SELECT * FROM adhoc_requests
WHERE status = 'open'
  AND request_date = CURRENT_DATE
ORDER BY created_at;
```

---

## Development Workflow

### To add a new feature:

1. **Define database changes** (if needed)
   - Update SQLAlchemy model in `backend/app/models/`
   - Create Alembic migration: `alembic revision --autogenerate -m "..."`
   - Test migration locally: `alembic upgrade head`

2. **Create API endpoint**
   - Add router in `backend/app/api/v1/`
   - Add Pydantic schema in `backend/app/schemas/`
   - Add permission check: `require_roles(...)`
   - Add audit logging: `await audit_service.log(...)`

3. **Add tests**
   - Test deadline enforcement, role denials, audit creation
   - Run: `pytest backend/tests/`

4. **Update frontend**
   - Create component/page
   - Wire with TanStack Query
   - Add loading/empty/error states

5. **Commit & push**
   - All changes versioned in git
   - Meaningful commit messages
   - Run `black` + `ruff` (backend) and `prettier` + `eslint` (frontend)

---

## Environment Variables (.env)

```env
# Database
DATABASE_URL=sqlite+aiosqlite:///./transport.db

# JWT
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Email (dev: logs to console; prod: real SMTP)
MAIL_FROM=noreply@transport.local
MAIL_SUPPRESS_SEND=1  # Dev only
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASSWORD=your-password

# Frontend URL (for reset links, etc.)
FRONTEND_URL=http://localhost:3000

# Timezone
TZ=Asia/Dhaka
```

---

## Ready for Feature Development!

Database is fully documented and git repository initialized. You can now:

1. ✅ Understand the complete data model
2. ✅ Commit changes with version control
3. ✅ Push to remote when ready

**What feature would you like to build?** Just tell me and I'll help you implement it following the TMP conventions.
