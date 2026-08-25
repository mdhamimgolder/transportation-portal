# 📚 Transportation Management Portal — Complete Documentation Index

## 🎯 What You Have

Your Transportation Management Portal now has:

### ✅ Complete Database Documentation
- **DATABASE.md** — 300+ lines covering every table, relationship, business rule, query pattern, and deployment strategy
- **DATABASE_QUICK_REF.md** — Quick lookup: schema, relationships, API endpoints, SQL queries, environment variables
- Comprehensive data flow diagrams for Weekly, Ad-hoc, and Address Change workflows

### ✅ Feature Development Guide
- **FEATURE_DEVELOPMENT_GUIDE.md** — Full step-by-step example of adding a "Driver Performance Report" feature
- Covers: database changes, Alembic migrations, API implementation, permission checks, audit logging, frontend components, testing, and git commits

### ✅ Git Repository
- Initialized with proper `.gitignore`
- Ready for commits and pushes
- Initial commit documenting the complete scaffold

### ✅ Additional References
- **GIT_COMMANDS_REFERENCE.md** — Git cheat sheet, workflow examples, commit conventions, common issues
- **README_COMPLETE.md** — Project overview, setup instructions, deployment checklist
- **SETUP_COMPLETE.md** — Setup summary and next steps
- **CLAUDE.md** — Original project specification from stakeholders

---

## 📊 Database at a Glance

### 8 Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| **users** | All user accounts (4 roles) | Central hub for all other tables |
| **password_reset_tokens** | Secure password reset (30 min, single-use) | → users |
| **weekly_requests** | Employee weekly schedules (Mon-Fri) | → users, weekly_request_days |
| **weekly_request_days** | Per-day entries (5 per request) | → weekly_requests, allocations |
| **adhoc_requests** | Emergency transport requests | → users, allocations |
| **allocations** | Driver + vehicle assignments | → users, weekly_request_days OR adhoc_requests |
| **address_change_requests** | Address change workflow | → users |
| **audit_logs** | Compliance trail (≥3 years) | → users, all entity types |

### Key Constraints & Indexes

```
Unique Constraints:
  - users.email (email login)
  - weekly_requests(employee_id, week_start_date) — one request per employee per week
  - weekly_request_days(weekly_request_id, day_date) — one day per weekly request

Indexes:
  - users.role (filter by role)
  - weekly_requests.status (filter by approval status)
  - adhoc_requests.status (find open/allocated)
  - allocations.driver_name, vehicle_number (search allocations)
  - address_change_requests.status (track pending)
  - audit_logs.created_at, actor_id, entity_type (compliance queries)
  - All date columns (for range queries)
```

---

## 🔐 Role-Based Access Control

```
EMPLOYEE (self service)
├─ Register & login
├─ Submit weekly schedule (by Sat 12 PM Asia/Dhaka)
├─ Submit ad-hoc request (emergency)
├─ View own transport details
├─ Edit own name/contact
├─ Request address change (not direct edit)
└─ Rate allocations (satisfaction)

OPERATIONS (approve & track)
├─ Review weekly schedules → approve/reject
├─ Review address change requests → approve/reject
├─ View all employee profiles
├─ View allocation history
├─ Track ad-hoc requests (for visibility)
└─ See audit logs (limited scope)

FACILITIES (plan & assign)
├─ View approved weekly requests
├─ View open ad-hoc requests
├─ Assign drivers + vehicles
├─ Copy allocation across week
├─ View allocation history
├─ Search by driver/vehicle/date
└─ View employee addresses

SUPER ADMIN (full system control)
├─ All above permissions +
├─ Bulk upload users (CSV/Excel)
├─ View complete audit log
├─ Archive old audit logs (manual confirm)
├─ Manage all system settings
└─ Create/edit any user
```

---

## 📋 Business Rules (Critical)

### 1. Weekly Submission Deadline
- **When:** Saturday 12:00 PM Asia/Dhaka (UTC+6)
- **What:** After deadline, API rejects new weekly schedule submissions for that week
- **Frontend:** Shows live countdown timer, disables form after deadline
- **Storage:** All times stored in UTC, displayed in Asia/Dhaka

### 2. Request Status Flows

#### Weekly Request Flow
```
Employee submits (Mon-Fri schedule)
        ↓
Operations reviews
        ├─ Approves → visible to Facilities for planning
        └─ Rejects → returned to employee with remarks
```

#### Ad-Hoc Request Flow
```
Employee submits (emergency)
        ↓
INSTANT ALERTS:
├─ Operations (tracking only)
└─ Facilities (action required)
        ↓
Facilities assigns driver + vehicle
        ↓
Email sent to employee
```

#### Address Change Flow
```
Employee requests change
        ↓
Operations reviews
        ├─ Approves → users.address updated → email sent
        └─ Rejects → employee notified
```

### 3. Allocation & Email Dispatch
- When Facilities saves allocation (pickup_time, driver_name, driver_contact, vehicle_number)
- **Immediately:** FastAPI BackgroundTask sends email to employee
- **Stamped:** `email_sent_at` only after successful send
- **Content:** Includes pickup time, driver details, vehicle info

### 4. Audit Everything
- **Every action** creates audit_logs entry: who, what, when, before/after snapshots
- **Immutable:** Logs are never modified (only archived if > 3 years old)
- **Searchable:** Indexed by created_at, actor_id, entity_type for compliance queries

---

## 🛠️ Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | Python 3.12, FastAPI | Async HTTP server |
| **Database** | SQLAlchemy 2.0 async | ORM with async support |
| **Migrations** | Alembic | Version-controlled schema changes |
| **Auth** | JWT (access + refresh tokens) | Access: 30 min, Refresh: 7 days |
| **Email** | FastAPI-mail | Async email with BackgroundTasks |
| **Database (Dev)** | SQLite + aiosqlite | No Docker needed |
| **Database (Prod)** | PostgreSQL 16 + asyncpg | Drop-in replacement, code unchanged |
| **Frontend** | React 18 + Vite + TypeScript | Component-based UI |
| **Data Fetching** | TanStack Query | Caching & sync with server |
| **Styling** | TailwindCSS | Dark theme ("Midnight Neon") |
| **HTTP Client** | Axios | HTTP requests with interceptors |

---

## 📖 Documentation Files

### Core Documentation
1. **DATABASE.md** (300+ lines)
   - Complete schema with SQL examples
   - All relationships explained
   - Performance indexes
   - Timezone handling (Asia/Dhaka)
   - Alembic migration examples
   - Development & production setup

2. **DATABASE_QUICK_REF.md** (200+ lines)
   - Schema summary table
   - Entity relationships diagram
   - Business rules matrix
   - API endpoints by role
   - Common SQL queries
   - Environment variables

3. **FEATURE_DEVELOPMENT_GUIDE.md** (400+ lines)
   - Step-by-step example feature ("Driver Performance Report")
   - Database model changes
   - Alembic migration creation
   - Pydantic schema design
   - API endpoint implementation
   - Permission enforcement
   - Audit logging
   - Frontend component example
   - Testing patterns
   - Code quality (black, ruff, prettier, eslint)
   - Git commit workflow
   - Common patterns (pagination, filtering, background tasks)

4. **GIT_COMMANDS_REFERENCE.md** (250+ lines)
   - Git cheat sheet (status, history, staging, committing)
   - Branch workflow
   - Remote management
   - Undoing changes
   - Feature branch workflow
   - Commit message conventions
   - Typical development cycle
   - Common issues & solutions
   - Best practices

5. **README_COMPLETE.md** (300+ lines)
   - Project overview
   - Database tables summary
   - Role-based access matrix
   - Critical business rules
   - API endpoints by role
   - Git commands
   - Environment setup
   - Common development tasks
   - Production checklist
   - Next steps

6. **SETUP_COMPLETE.md**
   - Setup summary
   - Key documentation overview
   - Ready-to-build checklist

### Reference Files
- **CLAUDE.md** — Original project specification from stakeholders
- **.gitignore** — Standard Python/Node.js ignores (no secrets, no venv, no build files)

---

## 🚀 Getting Started with Your First Feature

### Step 1: Understand the Feature
Define what you want to build. Example:
- "Add driver performance reporting to Super Admin dashboard"
- "Send SMS alerts to drivers when allocated"
- "Add vehicle maintenance tracking"

### Step 2: Design Database Changes (if needed)
- Update SQLAlchemy models
- Plan Alembic migrations
- Consider relationships and constraints

### Step 3: Implement Backend
```bash
cd backend

# 1. Update models
# 2. Create migration: alembic revision --autogenerate -m "..."
# 3. Test locally: alembic upgrade head
# 4. Create Pydantic schemas
# 5. Implement API endpoints with permission checks
# 6. Add audit logging
# 7. Write tests: pytest tests/
# 8. Code quality: black app/ && ruff check app/ --fix
```

### Step 4: Implement Frontend
```bash
cd frontend

# 1. Create components/pages
# 2. Wire with TanStack Query
# 3. Add error/loading/empty states
# 4. Test responsive design
# 5. Code quality: prettier src/ --write && eslint src/ --fix
```

### Step 5: Commit & Push
```bash
git add .
git commit -m "feat: Your feature

- Key changes
- Business impact"

git push origin feature/your-feature-name
```

---

## 📝 Before You Build

### Checklist
- [ ] Read **CLAUDE.md** (project specification)
- [ ] Review **DATABASE.md** (understand schema)
- [ ] Skim **FEATURE_DEVELOPMENT_GUIDE.md** (see the pattern)
- [ ] Understand your target feature (requirements, users, impact)
- [ ] Git initialized locally ✓

### Environment Setup
```bash
# Copy environment template
cp backend/.env.example backend/.env

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install

# Apply database migrations
cd ../backend
alembic upgrade head

# Run backend
uvicorn app.main:app --reload

# Run frontend (separate terminal)
cd ../frontend
npm run dev
```

---

## 🎯 Ready to Build!

Your Transportation Management Portal is **fully documented and git-ready**.

**Next step:** Tell me what feature you want to build, and I'll:
1. ✅ Design the database changes
2. ✅ Implement the backend API
3. ✅ Implement the frontend UI
4. ✅ Write comprehensive tests
5. ✅ Commit all changes with clear messages
6. ✅ Push to your git repository

**Example Features:**
- Driver performance dashboard
- Vehicle maintenance tracking
- SMS driver alerts
- Route optimization
- Bulk address import
- Calendar view for schedules
- Automated weekly reminders
- Late pickup notifications
- Employee satisfaction surveys
- Expense tracking per allocation

**What would you like to build?**

---

## 📞 Quick Links

- **Database Schema:** DATABASE.md or DATABASE_QUICK_REF.md
- **Add a Feature:** FEATURE_DEVELOPMENT_GUIDE.md
- **Git Workflow:** GIT_COMMANDS_REFERENCE.md
- **Project Spec:** CLAUDE.md
- **API Reference:** DATABASE_QUICK_REF.md → "API Endpoints by Role"
- **Common Queries:** DATABASE_QUICK_REF.md → "Database Queries"

---

## ✨ You've Got This!

Everything is documented. Everything is ready. Now let's build something awesome! 🚀
