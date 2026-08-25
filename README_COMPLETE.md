# Transportation Management Portal — Ready to Go! 🚀

## What You Have Now

### ✅ Complete Database Understanding
- **8 core tables** with full documentation
- **All relationships** mapped and explained
- **Business logic** clearly defined
- **Data flows** visualized (Weekly, Ad-hoc, Address Change)
- **Performance indexes** identified
- **Timezone handling** for Asia/Dhaka (UTC storage)

### ✅ Git Repository (Initializing...)
- Local git repository with proper `.gitignore`
- Initial commit with complete history
- Ready for remote pushes to GitHub/GitLab/Bitbucket

### ✅ Documentation Suite
1. **DATABASE.md** — 200+ lines of complete schema documentation
2. **DATABASE_QUICK_REF.md** — Quick lookup and API reference
3. **FEATURE_DEVELOPMENT_GUIDE.md** — Full example of adding a feature
4. **SETUP_COMPLETE.md** — This setup summary
5. **CLAUDE.md** — Original project specification

---

## Database Tables Quick Overview

```
TABLE: users (CORE)
├─ id, name, email*, contact_number, address, hashed_password
├─ role (employee|operations|facilities|super_admin)
├─ is_active, created_at, updated_at
└─ Relationships: reset_tokens, weekly_requests, adhoc_requests, allocations, address_change_requests, audit_logs

TABLE: password_reset_tokens
├─ id, user_id*, token_hash, expires_at (30 min), used_at
└─ Used for secure password reset flow

TABLE: weekly_requests
├─ id, employee_id*, week_start_date (Monday), status*
├─ submitted_at, reviewed_by, reviewed_at, remarks
└─ Status: submitted → approved OR rejected
    └─ Deadline: Saturday 12:00 PM Asia/Dhaka

TABLE: weekly_request_days
├─ id, weekly_request_id*, day_date, arrival_time
└─ 5 rows per weekly request (Mon-Fri)
    └─ Links to allocations for driver assignment

TABLE: adhoc_requests (EMERGENCY)
├─ id, employee_id*, request_date, arrival_time, reason
├─ status (open|allocated|cancelled), created_at
└─ No approval step; instant alert to Operations + Facilities

TABLE: allocations (DRIVER ASSIGNMENT)
├─ id, source_type (weekly_day|adhoc)
├─ weekly_request_day_id OR adhoc_request_id
├─ employee_id*, pickup_time, driver_name, driver_contact, vehicle_number
├─ allocated_by*, allocated_at, email_sent_at (BackgroundTask)
└─ On creation: Email sent immediately to employee

TABLE: address_change_requests
├─ id, employee_id*, old_address, new_address
├─ status (pending|approved|rejected)
├─ reviewed_by, reviewed_at, created_at
└─ Flow: Request → Operations reviews → Approve/Reject → Update users.address

TABLE: audit_logs (COMPLIANCE)
├─ id, actor_id, actor_role, action (verb)
├─ entity_type, entity_id, before_json, after_json
├─ description, created_at
└─ Indexed on: created_at, actor_id, entity_type
    └─ Retention: ≥ 3 years
```

---

## Role-Based Access Matrix

| Feature | Employee | Operations | Facilities | Super Admin |
|---------|----------|-----------|-----------|-------------|
| Submit weekly schedule | ✅ | — | — | — |
| Submit ad-hoc request | ✅ | — | — | — |
| View own details | ✅ | — | — | — |
| Edit own name/contact | ✅ | — | — | — |
| Request address change | ✅ | — | — | — |
| **Approve weekly** | — | ✅ | — | ✅ |
| **Review address change** | — | ✅ | — | ✅ |
| **Plan routes & assign drivers** | — | — | ✅ | ✅ |
| **Copy allocation across week** | — | — | ✅ | ✅ |
| View allocation history | — | ✅ | ✅ | ✅ |
| **Bulk upload users** | — | — | — | ✅ |
| **View audit log** | — | — | — | ✅ |

---

## Critical Business Rules

### 1. Weekly Schedule Deadline
- **Rule:** Submissions close Saturday 12:00 PM Asia/Dhaka
- **Enforcement:** API rejects submissions after deadline
- **UI:** Live countdown timer, disabled form after deadline
- **Timezone:** All times stored in UTC, displayed in Asia/Dhaka

### 2. Weekly Request Flow
```
Employee submits (Mon-Fri schedule)
    ↓
Operations reviews & approves/rejects
    ↓ (if approved)
Visible to Facilities for planning
    ↓
Facilities assigns driver + vehicle
    ↓
Email sent to employee (BackgroundTask)
    ↓ (stamped email_sent_at)
Complete
```

### 3. Ad-Hoc Request Flow
```
Employee submits (emergency)
    ↓
INSTANT: Alert to Operations (tracking)
INSTANT: Alert to Facilities (action)
    ↓
Facilities assigns driver + vehicle
    ↓
Email sent to employee
    ↓
Complete
```

### 4. Address Change Flow
```
Employee requests new address
    ↓
Operations reviews & approves/rejects
    ↓ (if approved)
users.address auto-updated
    ↓
Audit log created
    ↓
Email notification sent
    ↓
Complete
```

### 5. Allocation & Email Dispatch
- When Facilities saves: pickup_time, driver_name, driver_contact, vehicle_number
- FastAPI BackgroundTask sends email immediately to employee
- `email_sent_at` stamped only after successful send
- Email includes: employee name, pickup time, driver name/contact, vehicle number

### 6. Audit Everything
- **Who:** actor_id, actor_role (cached at time of action)
- **What:** action (verb), entity_type, entity_id
- **Before/After:** before_json, after_json (JSON snapshots)
- **When:** created_at (UTC, indexed)
- **Description:** Human-readable summary

---

## API Endpoints by Role

### 🔐 Authentication (Public)
- `POST /api/v1/auth/register` — Employee self-signup
- `POST /api/v1/auth/login` — Email + password
- `POST /api/v1/auth/forgot-password` — Reset link
- `POST /api/v1/auth/reset-password` — Set new password
- `POST /api/v1/auth/refresh` — Refresh token

### 👤 Employee Routes
- `GET /api/v1/users/me` — View own profile
- `PATCH /api/v1/users/me` — Edit name/contact (NOT address)
- `POST /api/v1/weekly` — Submit weekly schedule
- `GET /api/v1/weekly/{id}` — View my request
- `POST /api/v1/adhoc` — Submit emergency request
- `GET /api/v1/transport/my-details` — View my allocations
- `POST /api/v1/address-change` — Request address update

### 📋 Operations Routes
- `GET /api/v1/weekly` — List all weekly requests
- `PATCH /api/v1/weekly/{id}` — Approve/reject with remarks
- `GET /api/v1/adhoc` — List ad-hoc requests
- `GET /api/v1/address-change` — List pending changes
- `PATCH /api/v1/address-change/{id}` — Approve/reject
- `GET /api/v1/users` — List/edit employee profiles
- `GET /api/v1/history` — Allocations by date/employee

### 🚗 Facilities Routes
- `GET /api/v1/weekly/approved` — Approved requests for planning
- `GET /api/v1/adhoc/open` — Open ad-hoc requests
- `POST /api/v1/allocations` — Assign driver + vehicle
- `POST /api/v1/allocations/{id}/copy-week` — Copy to remaining days
- `GET /api/v1/history` — Search allocations
- `GET /api/v1/users` — View employee addresses

### 👑 Super Admin Routes (All above +)
- `POST /api/v1/admin/users/bulk-upload` — CSV/Excel bulk create
- `GET /api/v1/admin/audit-logs` — Full audit trail
- `POST /api/v1/admin/cleanup-audit` — Archive old logs (manual confirm)

---

## Git Commands You'll Need

### Basic Git Workflow
```bash
# Check status
git status

# View changes
git diff

# Stage specific files
git add backend/app/models/user.py
git add frontend/src/pages/

# Commit changes
git commit -m "feat: Add new feature

- Description of changes
- Business impact
- Any breaking changes"

# View commit history
git log --oneline -n 10

# Push to remote
git push origin main

# Create feature branch
git checkout -b feature/my-new-feature
git commit -m "..."
git push -u origin feature/my-new-feature
```

### Setting Up Remote
```bash
# Add GitHub (example)
git remote add origin https://github.com/yourusername/transport-portal.git

# Rename branch to main
git branch -M main

# Push initial code
git push -u origin main

# Verify
git remote -v
```

---

## Environment Setup (.env)

```env
# Database
DATABASE_URL=sqlite+aiosqlite:///./transport.db

# JWT Tokens
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Email (Dev: logs to console; Prod: real SMTP)
MAIL_FROM=noreply@transport.local
MAIL_SUPPRESS_SEND=1
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Frontend
FRONTEND_URL=http://localhost:3000

# Timezone
TZ=Asia/Dhaka
```

---

## Common Development Tasks

### Database Migrations
```bash
cd backend

# Generate migration from model changes
alembic revision --autogenerate -m "Add new_field to users table"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# View migration status
alembic current
```

### Running Tests
```bash
cd backend

# Run all tests
pytest tests/ -v

# Run specific test
pytest tests/test_weekly_requests.py::test_deadline_enforcement -v

# With coverage
pytest tests/ --cov=app
```

### Code Quality
```bash
# Backend
cd backend
black app/  # Format code
ruff check app/  # Lint
ruff check app/ --fix  # Auto-fix

# Frontend
cd frontend
prettier src/ --write  # Format
eslint src/ --fix  # Lint
```

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` in production `.env`
- [ ] Switch `DATABASE_URL` to PostgreSQL 16
- [ ] Configure real SMTP email (remove `MAIL_SUPPRESS_SEND`)
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Enable HTTPS/TLS
- [ ] Set up database backups
- [ ] Configure logging/monitoring
- [ ] Run security audit
- [ ] Test all role-based permissions
- [ ] Test email delivery
- [ ] Load test the system
- [ ] Create super admin user

---

## Next Steps

### When Git Initialization Completes:

1. **Verify git setup:**
   ```bash
   cd "D:/Devolopment/Transportation System/_archived-fastapi-scaffold-2026-07-27"
   git log --oneline -n 1
   git status
   ```

2. **Add remote (optional):**
   ```bash
   git remote add origin https://github.com/yourusername/transport-portal.git
   git branch -M main
   git push -u origin main
   ```

3. **Tell me what feature to build!**
   - Example: "Add driver performance reporting"
   - Example: "Add email notifications to Operations when ad-hoc request submitted"
   - Example: "Add vehicle maintenance tracking"
   - Example: "Add SMS alerts for drivers"

4. **I will:**
   - Design the feature with database changes
   - Implement backend (models, API, audit logging)
   - Implement frontend (pages, components, queries)
   - Write tests
   - Commit all changes to git with meaningful messages
   - Push to your remote repository

---

## Documentation Structure

```
Project Root/
├── DATABASE.md                      ← Complete schema reference
├── DATABASE_QUICK_REF.md            ← Quick lookup guide
├── FEATURE_DEVELOPMENT_GUIDE.md     ← How to add features
├── SETUP_COMPLETE.md                ← This file
├── CLAUDE.md                        ← Original project spec
├── .gitignore                       ← Git ignore rules
├── backend/
│   ├── alembic/                     ← Migrations
│   ├── app/
│   │   ├── models/                  ← SQLAlchemy ORM
│   │   ├── schemas/                 ← Pydantic validation
│   │   ├── api/v1/                  ← API routers
│   │   ├── services/                ← Business logic
│   │   └── core/                    ← Config, auth, deps
│   ├── tests/                       ← Unit/integration tests
│   └── .env.example                 ← Environment template
├── frontend/
│   └── src/
│       ├── api/                     ← Axios client
│       ├── components/              ← Reusable UI
│       ├── pages/                   ← Page components
│       ├── hooks/                   ← Custom hooks
│       └── context/                 ← Auth context
└── README.md
```

---

## Ready to Develop! 🎯

Your Transportation Management Portal is fully documented and git-ready. 

**Current Status:**
- ✅ Database schema analyzed and documented
- ✅ All business rules extracted and explained
- ✅ API endpoints outlined by role
- ✅ Feature development guide created
- ✅ Git repository initialized (in progress...)

**What's Next:**
Tell me what feature you'd like to build, and I'll implement it with:
- ✅ Database schema changes (with Alembic migrations)
- ✅ Backend API endpoints (with permission checks and audit logging)
- ✅ Frontend components (with TanStack Query and error handling)
- ✅ Tests (role-based, business logic, edge cases)
- ✅ Git commits (with clear, meaningful messages)
- ✅ Push to your remote repository

**Example Features You Could Add:**
1. Driver performance reporting
2. Vehicle maintenance tracking
3. SMS alerts for drivers
4. Route optimization
5. Bulk address import
6. Calendar view for schedules
7. Driver availability calendar
8. Employee transport history export
9. Automated weekly reminders
10. Late pickup notifications

**What feature would you like to build next?**
