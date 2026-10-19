# BUILD-GUIDE.md — Building the Transportation Portal with Claude Code

Follow this guide top to bottom. Each phase is a prompt you paste into Claude Code. Build one phase at a time, test it, then move to the next — this gives far better results than one giant prompt.

---

## Step 0 — Prerequisites

You need:
- A **Claude Pro or Max subscription** (or an Anthropic API key with billing) — the free plan does not include Claude Code
- **Python 3.12+**, **Node.js 20+**, and **Docker Desktop** (for PostgreSQL) installed
- **Git** installed (on Windows, install Git for Windows)

## Step 1 — Install Claude Code

Official docs: https://code.claude.com/docs/en/setup

**macOS / Linux / WSL (terminal):**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://claude.ai/install.ps1 | iex
```

Then verify and log in:
```bash
claude --version
claude          # first run opens a browser to log in with your Claude account
```

If anything fails, run `claude doctor` for diagnostics.

## Step 2 — Create the project and add the spec

```bash
mkdir transport-portal && cd transport-portal
git init
```

Now copy the **CLAUDE.md** file (provided alongside this guide) into this folder. Claude Code automatically reads `CLAUDE.md` from the project root on every session — it contains the full requirements, database design, business rules, and the black + neon design system, so you never have to re-explain the project.

Start Claude Code inside the folder:
```bash
claude
```

Tip: for each phase below, you can type `/clear` first to start with fresh context, since CLAUDE.md is always reloaded automatically.

---

## Phase 1 — Scaffold (paste into Claude Code)

```
Read CLAUDE.md fully. Scaffold the project exactly per the repository layout in section 3:
- FastAPI backend with async SQLAlchemy 2.0, Alembic configured, settings loaded from .env (create .env.example), CORS enabled for the frontend dev URL, /api/v1/health endpoint.
- docker-compose.yml with PostgreSQL 16 (and Mailhog for catching dev emails).
- React 18 + Vite + TypeScript frontend with TailwindCSS configured using the "Midnight Neon" design tokens from section 8 (put them in tailwind.config as theme colors), React Router, TanStack Query, and an axios client with base URL from env.
- README.md with exact run commands for backend, frontend, and docker.
Then give me the commands to run everything and verify the health endpoint works.
```

Run what it tells you, confirm `http://localhost:8000/api/v1/health` and the Vite dev server both work.

## Phase 2 — Authentication (login-first, forgot password)

```
Implement the full auth system per CLAUDE.md sections 5 and 7:
- users and password_reset_tokens tables with an Alembic migration.
- Endpoints: POST /auth/register, /auth/login, /auth/refresh, /auth/forgot-password, /auth/reset-password, GET /auth/me. JWT access (30 min) + refresh (7 days). bcrypt hashing. Forgot-password emails a reset link via Mailhog in dev, token valid 30 minutes, single-use, and the response never reveals whether the email exists.
- require_roles() dependency for route protection.
- Frontend: the app opens on the Login page (all other routes protected). Build Login, Register, Forgot Password, and Reset Password pages using the full-screen black design with lime radial glow from section 8. AuthContext stores the user + role, axios interceptor auto-refreshes tokens, and after login redirect by role per section 7.
- Seed script that creates one user of each role for testing (print their credentials).
Write pytest tests for login success/failure and role denial.
```

Test: log in as each seeded role and confirm you land on a different (placeholder) dashboard.

## Phase 3 — User management + bulk upload (Super Admin)

```
Build Super Admin user management per CLAUDE.md:
- CRUD endpoints for users (super_admin only) with pagination and search by name/email/role.
- POST /admin/users/bulk-upload accepting CSV or Excel (openpyxl/pandas) with columns name,email,contact_number,address,role. Create accounts with temporary passwords, email each new user a set-password link, and return a per-row report (created / skipped-duplicate / error with reason).
- Frontend /admin pages: users table (dark table style, status badges, search, pagination), create-user modal, and a bulk-upload page with drag-and-drop file input showing the per-row result report.
- Every create/edit/deactivate writes an audit log entry per section 6 rule 7 (create the audit_logs table and reusable audit() service now).
```

## Phase 4 — Employee portal (weekly + ad-hoc)

```
Build the Employee portal per CLAUDE.md sections 5 and 6:
- Weekly Transport: form showing next week Mon–Fri, each day with a time picker limited to allowed office arrival slots (10:00, 11:00, 12:00 — make the slot list configurable) and an option to skip a day. Enforce the Saturday 12:00 AM Asia/Dhaka deadline server-side; the UI shows a live countdown to the deadline and disables the form after it passes. One submission per employee per week (allow editing until deadline).
- Ad-Hoc Transport: form with date, arrival time, and reason. On submit it becomes instantly visible to Operations and Facilities (no approval).
- "My Transport" page: employee sees their upcoming days with status (pending approval / approved / driver assigned) and, once allocated, the pickup time, driver name, driver contact, and vehicle number.
- Profile page: employee can edit name and contact directly, but the Address field is read-only with a "Request Address Change" button opening a modal (old vs new address). Show status of pending requests.
- Everything responsive; tables collapse to stacked cards on mobile. Audit-log all writes.
```

## Phase 5 — Operations dashboard

```
Build the Operations dashboard per CLAUDE.md:
- Weekly Requests tab: list of submitted schedules grouped by week and employee, expandable to see each day/time, with Approve / Reject (rejection requires remarks). Approval forwards the data to Facilities automatically (status change), and emails the employee on rejection.
- Ad-Hoc tab: read-only tracking view of active ad-hoc requests with status.
- Profile Approval Hub tab: pending address-change requests showing old vs new address side by side, Approve (updates users.address) or Reject. Both audited and both notify the employee by email.
- Employee Profiles: searchable list, Operations can view and directly edit any profile (audited with before/after values).
- Allocation History: search past allocations by employee, date range, driver name, or vehicle number, paginated.
- Top of dashboard: stat cards (pending weekly approvals, open ad-hoc, pending profile changes) in the lime/cyan accent style.
```

## Phase 6 — Facilities dashboard (route planning + email dispatch)

```
Build the Facilities dashboard per CLAUDE.md:
- Weekly Route Planning: pick a week, see a day-by-day board (Mon–Fri) of approved employees with their arrival times. For each employee-day, Facilities enters Pickup Time, Driver Name, Driver Contact Number, Vehicle Number, then Save & Notify — which stores the allocation and immediately sends the transport-details email to that employee via BackgroundTasks, stamping email_sent_at. Support saving a whole day's allocations at once.
- "Copy to rest of week" action per CLAUDE.md rule 5: replicate one day's driver/vehicle/pickup assignments to the remaining days, skipping days without approved requests and days already allocated; show a summary of what was copied/skipped.
- Ad-Hoc Transport tab: urgent-styled (rose accent) list of open ad-hoc requests with the same allocation form + email dispatch.
- Employee Profiles: view and edit (audited), same as Operations.
- Allocation History with the same search filters as Operations.
```

## Phase 7 — Super Admin audit logs + retention

```
Finish the Super Admin area per CLAUDE.md:
- Audit Log page: master log with columns time, actor (name + role), action, entity, human-readable description, and an expandable before/after JSON diff. Filters: date range, actor, action type, entity type. Paginated, newest first.
- Admin overview page with system stats (total users by role, requests this week, allocations this week, emails sent).
- Retention (section 5): confirm indexes on all history/date columns exist; add a documented management script scripts/archive_old_data.py that exports rows older than 3 years to CSV before deleting, requires an explicit --confirm flag, and logs its run to the audit log. Do not schedule it automatically.
```

## Phase 8 — Polish, tests, and production readiness

```
Final pass:
1. Review every page against the Midnight Neon design system in CLAUDE.md section 8 — consistent spacing, skeleton loaders on all queries, toasts on every mutation, empty states, and full mobile responsiveness (sidebar → mobile nav, tables → cards).
2. Run and fix: ruff + black on backend, eslint + prettier on frontend.
3. Ensure the pytest suite covers: Saturday-deadline rejection, role-permission denial for each dashboard, address-change approval updating the address, allocation email trigger, and audit rows being written. Run the suite and fix failures.
4. Add production notes to README: building the frontend, running FastAPI with uvicorn workers behind nginx, real SMTP env vars, and a docker-compose.prod.yml example.
```

---

## Working tips for Claude Code

- **One phase per session.** `/clear` between phases; CLAUDE.md keeps the context.
- **Always test before moving on.** If something's broken, paste the exact error into Claude Code — it will fix it.
- **Use Plan Mode for big phases:** press Shift+Tab (or ask "make a plan first, don't write code yet"), review the plan, then say "go".
- **Commit after every working phase:** ask Claude Code to `git add -A && git commit` with a good message so you can always roll back.
- **Change requests later?** Update CLAUDE.md first, then ask Claude Code to implement the change — the spec and code stay in sync.
