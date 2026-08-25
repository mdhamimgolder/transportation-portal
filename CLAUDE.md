# CLAUDE.md — Transportation Management Portal (TMP)

This file is the single source of truth for this project. Read it before every task. Follow the spec, conventions, and design system exactly.

## 1. Project Overview

An internal, role-based web portal replacing Smartsheet for employee office-transport management. Flow: **Employee submits schedule → Operations approves → Facilities plans routes & assigns drivers → Automated email to employee.** Ad-hoc (emergency) requests bypass Operations approval and alert Operations + Facilities simultaneously.

## 2. Tech Stack (do not deviate without asking)

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic migrations, Pydantic v2
- **Database:** SQLite for local development (SQLAlchemy async via `aiosqlite`; `DATABASE_URL=sqlite+aiosqlite:///./transport.db`). No Docker required. **Production note:** the code must stay database-agnostic (SQLAlchemy models + Alembic migrations only, no raw SQL) so we can switch to PostgreSQL 16 later for production by changing `DATABASE_URL` and the async driver.
- **Auth:** JWT (access + refresh tokens), passlib[bcrypt] for password hashing
- **Email:** fastapi-mail (SMTP config via .env). In dev, all emails are logged to the console (no Mailhog / mail server needed); real SMTP in prod.
- **Frontend:** React 18 + Vite, TypeScript, TailwindCSS, React Router v6, TanStack Query, axios
- **File parsing:** openpyxl + pandas for CSV/Excel bulk upload
- **Timezone:** All deadline logic uses `Asia/Dhaka`. Store timestamps in UTC, display in local time.

## 3. Repository Layout

```
transport-portal/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/          # config, security (JWT), deps, permissions
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── api/v1/        # routers: auth, users, weekly, adhoc, operations, facilities, admin
│   │   ├── services/      # business logic, email service, audit service
│   │   └── utils/
│   ├── alembic/
│   ├── tests/
│   └── .env.example
├── frontend/
│   └── src/
│       ├── api/           # axios client + endpoint wrappers
│       ├── components/    # shared UI (Button, Card, Table, Modal, Badge…)
│       ├── layouts/       # AuthLayout, DashboardLayout (sidebar per role)
│       ├── pages/
│       │   ├── auth/      # Login, Register, ForgotPassword, ResetPassword
│       │   ├── employee/
│       │   ├── operations/
│       │   ├── facilities/
│       │   └── admin/
│       ├── hooks/
│       └── context/       # AuthContext (role-aware)
└── README.md
```

## 4. Roles & Permissions Matrix

| Capability | Employee | Operations | Facilities | Super Admin |
|---|---|---|---|---|
| Register self / login / reset password | ✅ | ✅ | ✅ | ✅ |
| Submit weekly schedule (Mon–Fri) | ✅ | — | — | — |
| Submit ad-hoc request | ✅ | — | — | — |
| View own transport details | ✅ | — | — | — |
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Edit own address directly | ❌ (request only) | — | — | — |
| Approve/reject weekly schedules | — | ✅ | — | ✅ |
| Approve/reject address-change requests | — | ✅ | — | ✅ |
| View & edit ANY employee profile | — | ✅ | ✅ | ✅ |
| Plan routes / assign drivers & vehicles | — | — | ✅ | ✅ |
| Copy route plan across the week | — | — | ✅ | ✅ |
| View allocation history | — | ✅ | ✅ | ✅ |
| Create users / bulk upload CSV-Excel | — | — | — | ✅ |
| View full audit log | — | — | — | ✅ |

Enforce permissions server-side with a FastAPI dependency (`require_roles(...)`). Never trust the frontend for authorization.

## 5. Database Schema (minimum required tables)

- **users**: id, name, email (unique), contact_number, address, hashed_password, role (`employee|operations|facilities|super_admin`), is_active, created_at, updated_at
- **password_reset_tokens**: id, user_id FK, token_hash, expires_at (30 min), used_at
- **weekly_requests**: id, employee_id FK, week_start_date (Monday), status (`submitted|approved|rejected`), submitted_at, reviewed_by FK, reviewed_at, remarks
- **weekly_request_days**: id, weekly_request_id FK, day_date, arrival_time (e.g. 10:00/11:00/12:00), unique(weekly_request_id, day_date)
- **adhoc_requests**: id, employee_id FK, request_date, arrival_time, reason, status (`open|allocated|cancelled`), created_at
- **allocations**: id, source_type (`weekly_day|adhoc`), weekly_request_day_id FK nullable, adhoc_request_id FK nullable, employee_id FK, pickup_time, driver_name, driver_contact, vehicle_number, allocated_by FK, allocated_at, email_sent_at
- **address_change_requests**: id, employee_id FK, old_address, new_address, status (`pending|approved|rejected`), reviewed_by FK, reviewed_at, created_at
- **audit_logs**: id, actor_id FK, actor_role, action (verb, e.g. `APPROVE_ADDRESS_CHANGE`), entity_type, entity_id, before_json, after_json (use SQLAlchemy's cross-dialect `JSON` type — maps to TEXT/JSON on SQLite and can become JSONB on PostgreSQL), description (human-readable, e.g. "Operations approved Employee X's address change"), created_at — **indexed on created_at, actor_id, entity_type**

Retention: keep all rows ≥ 3 years. Add indexes on all date columns used in history queries. Provide an optional cleanup script that archives rows older than 3 years (never auto-delete without confirmation).

## 6. Business Rules (critical — implement exactly)

1. **Weekly deadline:** Weekly schedules for next week (Mon–Fri) must be submitted by **Saturday 12:00 PM Asia/Dhaka**. After the deadline the API rejects submission for that week with a clear error; the UI shows a live countdown and disables the form.
2. **Weekly flow:** submitted → Operations approves → becomes visible in Facilities route planning. Rejected requests return to the employee with remarks.
3. **Ad-hoc flow:** on creation, instantly visible to BOTH Operations (tracking only) and Facilities (action). No approval step.
4. **Allocation dispatch:** when Facilities saves pickup_time + driver_name + driver_contact + vehicle_number, immediately send an email to the employee with full transport details (use FastAPI BackgroundTasks), then stamp `email_sent_at`.
5. **Copy across week:** Facilities can copy one day's allocations to the remaining days of that week in one action (skip days with no approved request; skip already-allocated days).
6. **Address change:** employee submits new address → Operations approves → users.address updates → audit log entry → notification email to the employee. Employees can edit name/contact directly but never address.
7. **Audit everything:** every create/update/approve/reject/edit by any role writes an audit_logs row (who, what, when, before/after). Use a reusable `audit()` service called inside the same DB transaction.
8. **History:** Operations and Facilities can search allocations by employee, date range, driver name, or vehicle number.

## 7. Auth Requirements

- The very first screen of the app is the **Login page**. All routes except login/register/forgot-password/reset-password are protected.
- Login: email + password → access token (30 min) + refresh token (7 days, httpOnly cookie or secure storage). Auto-refresh in axios interceptor.
- **Forgot password:** user enters email → system emails a one-time reset link (token valid 30 min, single use) → reset page sets new password. Always respond "if the email exists, a link was sent" (don't leak account existence).
- Registration (employee self-signup) collects name, email, contact, address, password. Password rules: min 8 chars, 1 uppercase, 1 number.
- Bulk upload (Super Admin): CSV/Excel with columns name,email,contact_number,address,role → creates accounts with a temporary random password and emails each user an invite/reset link. Show a per-row success/error report.
- After login, redirect by role: employee → /employee, operations → /operations, facilities → /facilities, super_admin → /admin.

## 8. Design System — "Midnight Neon" (black + eye-catching accents)

The UI must be **fast, clean, responsive, and dark**. No default-Bootstrap look.

- **Backgrounds:** page `#0A0A0B`, surface/cards `#131316`, elevated `#1A1A1F`, borders `#26262C`
- **Accent (primary):** electric lime `#C6F432` — buttons, active nav, focus rings, key numbers
- **Accent (secondary):** cyan `#22D3EE` — links, info states, secondary highlights
- **Status colors:** approved/success `#34D399`, pending/warning `#FBBF24`, rejected/danger `#F87171`, ad-hoc/urgent `#FB7185`
- **Text:** primary `#F4F4F5`, secondary `#A1A1AA`
- **Typography:** Inter (Google Fonts); page titles bold 24–28px, generous whitespace
- **Components:** rounded-2xl cards with subtle borders (no heavy shadows), pill-shaped status badges, sticky dark sidebar with lime active indicator, tables with hover rows and zebra `#0F0F12`, skeleton loaders for all data fetches
- **Login page:** full-screen black with a subtle lime radial glow, centered glassy card, logo, and a one-line tagline
- **Responsive:** sidebar collapses to a bottom nav / hamburger on mobile; tables become stacked cards under 768px; all forms single-column on mobile
- **Micro-interactions:** 150ms transitions on hover/focus; toast notifications (top-right) for every success/error

## 9. Coding Conventions & Security

- No secrets in code. Everything via `.env` (provide `.env.example`): DATABASE_URL, JWT_SECRET, SMTP_*, FRONTEND_URL.
- Validate every input with Pydantic; return consistent error shape `{ "detail": ... }`.
- All list endpoints paginated (`?page=&size=`), history endpoints filterable by date range.
- Write Alembic migrations for every schema change; never edit the DB by hand.
- Add pytest tests for: deadline enforcement, role permission denial, address-change flow, audit log creation.
- Log emails to console in dev (`MAIL_SUPPRESS_SEND=1` style flag); real SMTP in prod.
- Run `ruff` + `black` on backend, `eslint` + `prettier` on frontend before finishing a task.

## 10. Definition of Done (per feature)

Backend endpoint + schema + migration + permission check + audit log + frontend page wired with TanStack Query + loading/empty/error states + responsive check + at least one test.
