# Runbook — local, staging and production

## 1. Requirements

- Node.js **20.9+** (see `engines` in `package.json`) and npm 10+
- Access to the Postgres database (Neon). The app uses the **pooled** connection string at
  runtime; migrations use a **direct** connection (`DIRECT_URL`) because PgBouncer's
  transaction pooling cannot hold the advisory lock Prisma Migrate needs.

## 2. Environment variables

Copy `.env.example` → `.env.local` for local work (Next.js auto-loads `.env.local`; `tsx`
scripts need the explicit `import "dotenv/config"` they already contain).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres URL used by the app at runtime |
| `DIRECT_URL` | recommended | Direct (non-pooled) URL used only by `prisma migrate`; falls back to `DATABASE_URL` |
| `SESSION_SECRET` | yes | HMAC key for session JWTs — long random string, **different per environment** |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | production only | Gmail SMTP (app password). Dev never sends mail |
| `OSRM_SERVER_URL` | optional | Route/distance engine; defaults to the public OSRM demo server |
| `GEOCODER_URL` `GEOCODER_USER_AGENT` `GEOCODER_COUNTRY_CODES` | optional | Nominatim geocoding |
| `FACILITIES_NOTIFICATION_EMAIL` `OPERATIONS_NOTIFICATION_EMAIL` | optional | Ad-hoc alert recipients |

`lib/env.ts` validates these on first use and throws a readable error naming the missing
variable, instead of failing later with `undefined` somewhere deep in a request.

## 3. First run

```powershell
npm install                 # postinstall runs `prisma generate`
copy .env.example .env.local
npm run db:deploy           # apply the committed migrations
npm run db:seed             # optional reference/settings data
npm run dev                 # http://localhost:3000
npm run verify              # typecheck + lint, before you commit
```

## 4. Day-to-day

| Task | Command |
|---|---|
| Change the schema | edit `prisma/schema.prisma` → `npm run db:migrate` (name the migration) → `npm run db:generate` |
| Inspect data | `npm run db:studio` |
| Reset a broken dev server | `npm run clean` then `npm run dev` |
| Standalone ops script | `npx tsx scripts/<bucket>/<name>.ts` — see `scripts/README.md` |
| Read-only DB audits | `scripts/diagnostics/*` |
| Data repairs | `scripts/maintenance/*` (read the header comment first) |

Windows helper — restarting the dev server after a Prisma change:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Stop-Process -Id {OwningProcess} -Force
Remove-Item -Recurse -Force .next
Start-Process cmd -Args '/c npm run dev > .next\dev.log 2>&1' -WindowStyle Hidden
```

## 5. Production (Vercel + Neon)

Build command: `npm run build` → `prisma generate && next build`. **Migrations are not part
of the build** — run them as a deliberate step so a failed migration cannot leave a
half-deployed build (and concurrent builds cannot race each other):

```powershell
npx vercel env pull .env.production.local   # optional, to inspect what the deployment sees
npm run db:deploy                           # apply pending migrations (uses DIRECT_URL)
git push                                    # Vercel builds and promotes
```

Checklist before promoting:

1. `npm run verify` and `npm run build` are green locally.
2. `npx prisma migrate status` reports **"Database schema is up to date"**.
3. Latest local commit is pushed (an uncommitted working tree is invisible to the deploy).
4. `SESSION_SECRET` and the SMTP variables exist in the Vercel project.
5. After deploy: `GET /api/health` returns `{ "status": "ok", "db": "up" }`.
6. Smoke-test each role: log in and land on the right home page —
   `/employee/dashboard`, `/operations/dashboard`, `/facilities/dashboard`,
   `/super-admin/dashboard`, `/corporate-employee/dashboard`, `/fixed-arrival/dashboard` —
   then confirm a wrong-role URL redirects to `/403`.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `[object ErrorEvent]` or "Failed to load …" | Neon compute was asleep / a websocket blip. `lib/db/retry.ts` retries once; a retry in the UI almost always succeeds. |
| First page load takes 60s+ in dev | Same cold start — `lib/prisma.ts` keeps the compute warm with a `SELECT 1` ping every 60s outside production. |
| Login loops back to `/login` | The cookie is valid but the `Session` row is gone (`rotateSession`/sweep) or the user is deactivated — sign in again. |
| Emails not arriving in production | `isEmailEnabled()` is false unless `NODE_ENV=production`; check `/facilities/email-log` for the per-recipient status. |
| Route generation complains about a missing pickup time | The leg has no learned data — run the planner through RUN MAPPING (or "teach from manual plan") so `RouteLegLearning` has samples; the engine deliberately refuses to guess. |
| Migration hangs on deploy | `prisma.config.ts` must use the **direct** URL; a pooled connection cannot take Migrate's advisory lock. |
