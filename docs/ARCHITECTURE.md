# Architecture — Transportation Management Portal

Single Next.js 16 application (App Router + Server Actions) backed by Postgres via Prisma.
No separate API server, no client-side data-fetching library: the browser talks to the
server through server components, server actions and forms.

```
Browser ──▶ proxy.ts (edge, JWT only) ──▶ app/(portal)/<role>/layout.tsx (DB-backed guard)
                                        └─▶ page.tsx  (server component, reads via lib/queries)
                                              └─▶ <Form> ──▶ actions/*.ts ("use server")
                                                                    └─▶ lib/* domain helpers
                                                                          └─▶ prisma
```

## 1. Layers

| Layer | Location | Rules |
|---|---|---|
| Routing / UI | `app/**`, `components/**` | Server components by default; `"use client"` only for interaction (forms, dnd, maps). No Prisma calls in components — go through `lib/queries`. |
| Server actions | `actions/*.actions.ts` | `"use server"` + `requireRole(...)` as the first statement + input validation + `revalidatePath(...)`. Thin: orchestration only. |
| Domain | `lib/routing/**`, `lib/date/**`, `lib/constants/**`, `lib/validation/**`, `lib/email-templates.ts` | Pure, framework-free logic. `lib/routing` must stay Prisma-free so it can be unit-tested. |
| Data access | `lib/queries/**` | Every Prisma read that is not trivial. Wrapped in `withDbRetry()` (Neon cold-start resilience). |
| Infrastructure | `lib/prisma.ts`, `lib/db/retry.ts`, `lib/auth/**`, `lib/rbac/**`, `lib/mailer.ts`, `lib/env.ts`, `lib/logger.ts` | `import "server-only"` where the module must never reach the client bundle. |
| Schema | `prisma/schema.prisma` + `prisma/migrations/` | Schema changes always ship with a migration (`npm run db:migrate`). |

`lib/generated/prisma/**` is build output (git-ignored, recreated by `postinstall`).

## 2. Roles, routes and guards

Every role owns a URL prefix; the prefix is the coarse gate and the server action is the
authoritative gate (never trust the client).

| Role | URL prefix | Layout gate | Notes |
|---|---|---|---|
| `EMPLOYEE` | `/employee` | `requireRole([EMPLOYEE])` | Weekly schedule, ad-hoc, profile |
| `CORPORATE_EMPLOYEE` | `/corporate-employee` | `requireRole([CORPORATE_EMPLOYEE])` | Weekly + ad-hoc, no approval step |
| `FIXED_ARRIVAL` | `/fixed-arrival` | `requireRole([FIXED_ARRIVAL])` | One standing arrival time, Facilities-managed |
| `OPERATIONS` | `/operations` | `requireRole([OPERATIONS])` | Approves weekly schedules, monitors ad-hoc |
| `FACILITIES` | `/facilities` | `requireRole([FACILITIES, SUPER_ADMIN])` | Route planning, vehicles/drivers, email log |
| `SUPER_ADMIN` | `/super-admin` | `requireRole([SUPER_ADMIN])` | Users, settings, reports; may open Facilities screens (41 Facilities actions already allow `SUPER_ADMIN`) |

Two-stage authorization:

1. `proxy.ts` (edge) verifies the session JWT signature, redirects anonymous users to
   `/login`, forces `/force-change-password` when `mustChangePassword` is set, and rejects
   a role that does not match the URL prefix with `/403`. Cheap first pass.
2. `app/(portal)/<role>/layout.tsx` calls `requireRole(...)` → `getSession()`, which
   re-verifies the JWT **and** the `Session` row + `User.isActive` in the database. This is
   the final word: it catches revoked sessions and deactivated accounts. `getSession` is
   memoized per request with React `cache()`.

Login sets an httpOnly cookie (`SESSION_COOKIE_NAME`, `secure` in production, `sameSite=lax`,
30-day max age) and creates a `Session` row; expired rows are swept opportunistically on
login. Role changes and forced password changes call `rotateSession()` so the JWT claims
never go stale.

## 3. Roles of the request lifecycle (example: submit a weekly schedule)

1. `app/employee/weekly/page.tsx` (server component) loads the week via `lib/date/week.ts`
   helpers and the settings row via `lib/queries/settings.ts`.
2. The form posts to `submitWeeklySchedule` in `actions/weekly-schedule.actions.ts`:
   `requireRole([EMPLOYEE])` → parse + validate day values → deadline window check
   (`getSubmissionWindow`, Asia/Dhaka) → upsert `WeeklySchedule` + 5 `WeeklyScheduleDay`
   rows in one transaction.
3. Confirmation email is dispatched with `after()` (Vercel-safe background work) through
   `lib/mailer.ts`, which is a no-op unless `NODE_ENV === "production"`.
4. `revalidatePath` refreshes the dashboard, the Operations queue and the Facilities board.

## 4. Data model (Prisma)

| Area | Models |
|---|---|
| Identity & access | `User`, `Session`, `Address`, `Zone` |
| Employee requests | `WeeklySchedule`, `WeeklyScheduleDay`, `AdHocRequest` |
| Change requests | `AddressChangeRequest`, `ContactChangeRequest`, `PickupPointChangeRequest` |
| Planning output | `RoutePlan`, `RoutePlanOverride`, `TripAssignment`, `RouteAssignment`, `ManualRoutePlanEntry` |
| Fleet | `Vehicle`, `VehicleDriver`, `VehicleShiftAssignment`, `PickupPoint`, `RouteTemplate`, `RouteTemplateStop` |
| Learning & caches | `RouteLegLearning`, `RoutePolylineCache`, `DistanceMatrixCache` |
| Operations config | `TransportSettings`, `Holiday`, `EmailNotificationLog` |

Dates rule: **week/day dates are stored as UTC midnight** and every screen converts to
`Asia/Dhaka` for display. `WeeklyScheduleDay.arrivalTime` is `"HH:mm"` (`"22:00"`);
`RoutePlan.arrivalTime` is a label (`"10 PM"`, `"11 PM"`, `"12 AM"`…). Shared shifts live in
`lib/constants/route-shifts.ts` / `lib/constants/arrival-times.ts` — never hard-code a shift
label or time inside a page.

## 5. Route planning engine (`lib/routing`)

| Shift | Source of truth for stops | Ordering rule |
|---|---|---|
| 10 PM | `PRESET_POINT` — the pickup points pinned to the vehicle in Route Setting | The saved pickup-point `sequence`, verbatim |
| 11 PM – 6 AM | `HOME_ADDRESS` — the employee's home coordinates | **Far-first anchor** (by road **km**, never minutes), then each next stop is the one **nearest by road time to the previous stop**, walking back toward the office |

Non-negotiables (also recorded in `SESSION_MEMORY.md`): never re-sort an 11 PM route
far→near once it is built; the corridor attach pass may only *append* positions
(`nearestLegInsertion` inspects index 1..n) so it can never displace the far-first anchor;
pickup times require **learned** leg data (`RouteLegLearning` via
`trainRoutePlannerFromHistory`) — untrained legs raise instead of being estimated;
`GROWTH_MAX_DETOUR_KM = 2` stops a new rider from blowing up an existing route.

`algorithms.ts`, `pickup-schedule.ts`, `side-selection.ts`, `route-pattern.ts` and
`manual-plan-training.ts` are pure functions. `osrm.ts` (routing/matrix) and `geocoder.ts`
(Nominatim) are the only network calls, and both are env-configurable so a self-hosted
OSRM/Nominatim can replace the public demo servers in production.

## 6. Email pipeline

`lib/mailer.ts` is the only exit point: `sendMail`, `sendMailBackground`, `trySendMail`
(returns a per-recipient status) plus the account-credentials helpers. `isEmailEnabled()`
is false outside production, so dev never hits SMTP — it logs the skip via the
structured logger instead. Outcomes are recorded in `EmailNotificationLog` and surfaced on
`/facilities/email-log`. Slow sends are scheduled via `after()` rather than blocking the
action response, because serverless platforms have no long-lived background process.

## 7. Design system ("manifest")

Dark ink brand spine against a warm paper canvas, with one teal accent for anything that
moves a request forward. Tokens live in `app/globals.css` — use them instead of raw hex
values in pages.

| Token | Value | Used for |
|---|---|---|
| `--ink` / `--ink-foreground` | `#03120f` / `#eef1ec` | Sidebar, auth hero |
| `--paper` / `--background` | `#f5f3ec` | Content canvas |
| `--card` | `#fdfcf8` | Cards, tables |
| accent | `#70bccc` (+ rgba rims) | Search/upload/export controls, active nav, links, route lines |
| status | amber / rose / emerald families | pending · ad-hoc & route conflicts · approved |

Typography: Inter Variable (`--font-sans`) for UI, JetBrains Mono (`--font-mono`) for times,
plates and codes, `.tabular` for numeric columns. Primitives live in `components/ui/*`
(shadcn-style with CVA variants), role screens in `components/<role>/*`, and anything used by
two roles in `components/shared/*`.

## 8. Conventions that are enforced, not optional

- Server-side permission checks on **every** action (`requireRole`) — the UI gate is decoration.
- Validate every mutation input (zod; shared schemas in `lib/validation/schemas.ts`).
- Dates: build them with `lib/date/week.ts` (`toUtcMidnight`, `getMondayOfWeek`, …) — never
  parse a locale-formatted string into a `Date`.
- Secrets only via env (`lib/env.ts` validates them on first use); `.env*` is git-ignored.
- Schema change ⇒ `npm run db:migrate` (new migration) ⇒ `npm run db:generate` ⇒ restart the
  dev server.
- Before calling work done: `npm run verify` (typecheck + lint), and for anything that renders,
  `npm run build` plus a look at the affected role home page.

## 9. Known debts (deliberately deferred)

- `actions/route-override.actions.ts` (~1.3k lines) and `actions/route-generation.actions.ts`
  still mix orchestration with domain logic; the thin-action/service split is incremental work.
- No test runner is wired up: `lib/routing/__tests__/*.test.ts` exist but `npm test` does not
  run them yet (they were written for a runner that was never added).
- Role folders sit at the top level of `app/` instead of under an `app/(portal)` group, and the
  six role layouts repeat the same shell markup — `components/shared/role-shell.tsx` is the
  intended consolidation.

