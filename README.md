# Transportation Management Portal (TMP)

Internal, role-based portal that replaces Smartsheet for employee office transport.

**Flow:** employee submits a weekly schedule (Mon–Fri) or an ad-hoc request → Operations
approves weekly schedules → Facilities plans routes, assigns drivers/vehicles and the
pickup schedule is emailed to the employee.

- **Stack:** Next.js 16 (App Router, TypeScript) · React 19 · Prisma 7 + Postgres (Neon) · Tailwind v4 · Leaflet + OSRM for route maps · Nodemailer (Gmail SMTP)
- **Roles:** `EMPLOYEE` · `OPERATIONS` · `FACILITIES` · `SUPER_ADMIN` · `CORPORATE_EMPLOYEE` · `FIXED_ARRIVAL`
- **Timezone:** all business dates are stored as UTC midnight; the app and the business rules run on `Asia/Dhaka`.

## Quick start

```powershell
npm install          # installs deps and regenerates the Prisma client (postinstall)
copy .env.example .env.local     # then fill in the values (see docs/RUNBOOK.md)
npx prisma migrate deploy        # create/update the schema
npm run db:seed                  # optional: seed reference data
npm run dev                      # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (Turbopack) |
| `npm run build` | `prisma generate && next build` — production build (no migrations) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` over the whole repo |
| `npm run lint` / `lint:fix` | ESLint (next/core-web-vitals + TS) |
| `npm run verify` | `typecheck` + `lint` + unit tests — the gate before a commit |
| `npm run db:migrate` / `db:deploy` | Prisma migrate (dev / production) |
| `npm run db:studio` / `db:generate` | Prisma Studio / regenerate the client |
| `npm run clean` | Delete `.next` |

## Where things live

```
app/            Next.js App Router — one folder per role, (auth) group for login flows
actions/        Server actions ("use server") — thin: auth guard, validation, revalidate
lib/            Domain + infrastructure (no React): auth, rbac, db, queries, routing,
                date, constants, validation, mailer, prisma client
components/     ui/ primitives · shared/ cross-role · <role>/ role-specific screens
prisma/         schema.prisma, migrations, seed.ts
scripts/        Standalone tsx tools — diagnostics/ (read-only), maintenance/ (writes),
                destructive/ (guarded). See scripts/README.md
proxy.ts        Edge middleware: JWT-only route/role gate (Next 16 naming)
```

## Documentation

| Document | Purpose |
|---|---|
| `docs/ARCHITECTURE.md` | Layers, roles & permissions, request lifecycle, routing engine, conventions |
| `docs/RUNBOOK.md` | Local setup, env vars, migrations, deploy, restart/troubleshooting |
| `docs/CONTRIBUTING.md` | How to add a feature the way the codebase expects |
| `AGENTS.md` | Rules for AI agents working in this repo |
| `CLAUDE.md` | Active project instructions, business decisions, and coding conventions |
| `SESSION_MEMORY.md` | Live session log — current state, decisions, open threads |
| `docs/archive/` | Historical docs from the retired FastAPI/Vite scaffold |

Legacy scaffolding (`backend/`, `frontend/`, `_archived-fastapi-scaffold-2026-07-27/`)
is kept on disk at `../Transportation-System-archive/` and in git history, but is not
part of the application.
