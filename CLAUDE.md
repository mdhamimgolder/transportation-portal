# CLAUDE.md — Transportation Management Portal (TMP)

This file describes the active application. Durable architecture and operational details live in `docs/ARCHITECTURE.md` and `docs/RUNBOOK.md`; `SESSION_MEMORY.md` records recent decisions and open work. Read `AGENTS.md` and those sources before changing system boundaries.

## 1. Project Overview

An internal, role-based web portal replacing Smartsheet for employee office-transport management. Flow: **Employee submits schedule → Operations approves → Facilities plans routes & assigns drivers → Automated email to employee.** Ad-hoc (emergency) requests bypass Operations approval and alert Operations + Facilities simultaneously.

## 2. Active Stack

- **Application:** Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4.
- **Database:** Postgres/Neon through Prisma 7; schema and migrations live under `prisma/`.
- **Authentication:** signed jose session JWT in an httpOnly cookie plus a revocable database `Session` row.
- **Email:** Nodemailer through `lib/mailer.ts`; production-only SMTP, `after()` for background sends, and delivery logs where applicable.
- **Routing:** OSRM and Nominatim through server-side clients in `lib/routing/`.
- **Timezone:** week/day keys are UTC midnight; business clock times use `Asia/Dhaka` explicitly.

Do not add a separate API server, client-side query framework, or alternate database layer without approval. See `package.json` and `docs/RUNBOOK.md` for supported commands and setup.

## 3. Repository Layout

```
transport-portal/
├── app/                   # App Router pages, layouts, and route handlers
├── actions/               # guarded Server Actions
├── components/            # ui/, shared/, and role-specific components
├── lib/                   # auth, rbac, queries, routing, date, validation, infrastructure
├── prisma/                # schema, migrations, seed
├── scripts/               # diagnostics, maintenance, guarded destructive tools
└── docs/                  # architecture, runbook, contributing, archived history
```

## 4. Roles & Permissions Matrix

Roles are `EMPLOYEE`, `CORPORATE_EMPLOYEE`, `FIXED_ARRIVAL`, `OPERATIONS`, `FACILITIES`, and `SUPER_ADMIN`. `proxy.ts` is the coarse route gate; every Server Action must also call `requireRole(...)` or `requireAuth()` before I/O. Facilities workflow actions use `[Role.FACILITIES, Role.SUPER_ADMIN]` where appropriate. Never trust UI visibility for authorization.

## 5. Database

`prisma/schema.prisma` is the schema source of truth. Use Prisma Client and add a migration for schema changes; never hand-edit the database. Credential and password-reset fields are globally omitted from normal Prisma reads; auth code should opt in only to fields it needs. See `docs/ARCHITECTURE.md` for current model groups and date conventions.

## 6. Business Rules (critical — implement exactly)

1. **Weekly deadline:** Weekly schedules for next week (Mon–Fri) must be submitted by **Saturday 12:00 AM Asia/Dhaka**. After the deadline the API rejects submission for that week with a clear error; the UI shows a live countdown and disables the form.
2. **Weekly flow:** submitted → Operations approves → becomes visible in Facilities route planning. Rejected requests return to the employee with remarks.
3. **Ad-hoc flow:** on creation, instantly visible to BOTH Operations (tracking only) and Facilities (action). No approval step.
4. **Allocation dispatch:** when Facilities saves pickup details, send transport details through Next.js `after()`; mark delivery as sent only after a successful send.
5. **Copy across week:** Facilities can copy one day's allocations to the remaining days of that week in one action (skip days with no approved request; skip already-allocated days).
6. **Profile changes:** employee address changes currently apply immediately with a 30-day lock and notify Facilities/Operations. This is an explicit product decision; do not replace it with an approval workflow without asking.
7. **Audit everything:** mutations should create an `AuditLog` entry with actor, action, entity, and before/after state in the same transaction. Use `auditEntry()` inside Prisma transactions; `audit()` is best-effort and is not sufficient for atomic compliance logging.
8. **History:** Operations and Facilities can search allocations by employee, date range, driver name, or vehicle number.

## 7. Auth Requirements

- The very first screen of the app is the **Login page**. All routes except login/register/forgot-password/reset-password are protected.
- Login: email + password → signed session cookie plus a database `Session` row. Rate-limit public auth actions, keep reset responses enumeration-safe, and revoke sessions after password/role changes.
- **Forgot password:** user enters email → system emails a one-time reset link (token valid 30 min, single use) → reset page sets new password. Always respond "if the email exists, a link was sent" (don't leak account existence).
- User creation follows the current server-side user-management policy; there is no self-registration route. Password rules are defined in `lib/validation/schemas.ts`.
- Bulk upload (Super Admin): CSV/Excel with columns name,email,contact_number,address,role → creates accounts with a temporary random password and emails each user an invite/reset link. Show a per-row success/error report.
- After login, redirect by role: employee → /employee, operations → /operations, facilities → /facilities, super_admin → /admin.

## 8. Design System

Use the active tokens and component conventions in `app/globals.css`, `components/ui/`, and `docs/ARCHITECTURE.md`. Do not copy the retired scaffold palette or introduce a competing design system.


## 9. Coding Conventions & Security

- No secrets in code. Use `.env.example` and `lib/env.ts`; runtime configuration includes `DATABASE_URL`, `SESSION_SECRET`, SMTP settings, and optional OSRM/geocoder URLs.
- Validate every mutation at runtime with Zod; return sanitized user-facing errors and keep raw diagnostics in server logs.
- Bound list reads and push filtering into Prisma queries; history views must support their intended date filters.
- Use Prisma migrations for schema changes; never edit the database by hand.
- Add focused `node:test` coverage for business rules and regressions. `npm run verify` runs typecheck, ESLint, and the test suite.
- Email is disabled outside production. Never return SMTP details or credentials to clients.
- Before finishing, run `npx tsc --noEmit`, `npx eslint <changed files>`, and relevant tests; use `npm run verify` for the full gate.

## 10. Definition of Done (per feature)

Server Action/API + runtime validation + server-side authorization + transactional audit where applicable + client workflow with loading/empty/error states + focused tests + required verification gates.
