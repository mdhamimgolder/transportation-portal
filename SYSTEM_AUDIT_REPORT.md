# SYSTEM_AUDIT_REPORT.md — Transportation Management Portal (TMP)

| Field | Value |
|---|---|
| Date | 2026-10-08 |
| Scope | Entire Next.js 16 + Prisma 7 codebase (read-only audit; no code was modified) |
| Method | 5 parallel evidence-backed deep-dives (architecture, routing design, performance, security, code quality); every finding re-verified in current source |
| Stack | Next.js 16 App Router · React 19 · strict TS · Tailwind 4 · Prisma 7 + Neon Postgres · OSRM + Nominatim · jose JWT + DB sessions |
| Prior reports | `SYSTEM_AUDIT_REPORT.md` (v1) and `SYSTEM_AUDIT_REPORT2.md` used only as leads; all items re-checked — many are now fixed (see Appendix C) |

**Overall verdict: 3.5 / 5 — solid, well-governed foundation with real engineering discipline (pure routing core, guard-first actions, layered OSRM caching). The remaining debt is concentrated, not systemic: duplicated time/shift helpers, serial bulk loops, untested high-blast-radius actions, and mixed pure+I/O modules.**

### Scorecard

| Pillar | Score | One-line summary |
|---|---|---|
| 1. Architecture & Folder Structure | 3.4 / 5 | Textbook tree and App Router split; 17 oversized files drag modularity down |
| 2. System Design & Routing Logic | 3.2 / 5 | Pure-core/orchestration split is real; same helpers re-implemented 2–5× |
| 3. Performance & Scalability | 3.4 / 5 | Caching, batching, timeouts largely fixed; 4 serial bulk loops remain High severity |
| 4. Security & Best Practices | 4.0 / 5 | 69/69 actions guard-first, no injection/mass-assignment; 2 raw-error leaks to fix |
| 5. Code Quality & Technical Debt | 3.2 / 5 | Zero `any`, zero suppressions, clean lint; duplication (2/5) is the weakest sub-area |

---

## Executive Summary — Top 10 risks (severity-ordered)

| # | Risk | Where | Severity | Effort |
|---|---|---|---|---|
| 1 | Raw DB/driver error messages returned to client | `actions/route-assignment.actions.ts:182-185`, `:456-460` | **High** | S — swap to `sanitizedActionError` + fixed per-row strings |
| 2 | Bulk CSV loops do 100s–1000s of serial DB writes + serial bcrypt | `actions/manual-route-plan.actions.ts:287-342`, `actions/weekly-schedule.actions.ts:677-803`, `actions/user-management.actions.ts:400-633` | **High** | M — `createMany`/`updateMany` + `mapWithConcurrency` |
| 3 | Cold route generation is serial across homes (geocode throttle × N) | `lib/routing/algorithms.ts:707-724` + `resolveHomeAddress` (`:127-166`) | **High** | M — concurrent resolve with preloaded addresses |
| 4 | Arrival-minutes map copied ×4 with divergent invalid-input behavior (one silently maps garbage → 11 PM) | `lib/routing/corridor-core.ts:314-328` vs `lib/constants/route-shifts.ts:76-86` vs `actions/route-generation.actions.ts:148-163` vs `actions/route-learning.actions.ts:60-74` | **High** | S — consolidate on `route-shifts.ts` |
| 5 | Ad-hoc write path skips UTC-midnight normalization (server-TZ day-boundary bug) | `actions/on-behalf.actions.ts:240`, `lib/queries/allocation-history.ts:42` | **Med-High** | S — route through `toUtcMidnight` |
| 6 | Day-sheet / legacy planner paths do serial DB + in-request SMTP per row | `actions/route-assignment.actions.ts:327-384`, `:427-466` | **High** (latency) | M — preload + bounded concurrency + `after()` mail |
| 7 | Highest-blast-radius logic (week state machine, approvals, replicate/copy, role gates) has zero tests | `actions/*` (20 files), `lib/rbac/guards.ts`, `lib/auth/*` | **Med-High** | M — add action-level tests first |
| 8 | Pure helpers trapped in `server-only`+Prisma modules (untestable without DB) | `lib/routing/route-pattern.ts:1-3`, `lib/routing/pickup-schedule.ts:32-33`, `lib/routing/route-analysis.ts:22-24` | **Medium** | S — split `-pure.ts` modules |
| 9 | RBAC role-list drift: some Facilities actions exclude SUPER_ADMIN (fail-closed 403s) + `facilities/layout` vs `proxy.ts` gate mismatch | `actions/facilities-profile.actions.ts:104,145`, `actions/route-assignment.actions.ts:131,298,406,469,500`, `app/facilities/layout.tsx:10` vs `proxy.ts:20,77-79` | **Medium** (functional) | S — unify lists |
| 10 | 17 files >400 lines (2 >990); geo/date math inside client components | `actions/route-override.actions.ts` (1177), `components/facilities/route-map.tsx:113-230`, etc. | **Medium** | L — incremental extraction |

---

## Pillar 1 — Architecture & Folder Structure

### Current state (3.4/5)

The top-level tree (`app/`, `actions/`, `components/`, `lib/`, `hooks/`, `prisma/`, `scripts/`, `docs/`) is textbook and discoverable. The App Router split is exemplary where it matters most: only 2 API routes exist (`api/health`, `api/routing/route` — both correctly force-dynamic/authed), everything else is Server Actions, and `proxy.ts` (not legacy `middleware.ts`) implements a clean Edge-safe JWT check with DB authority deferred to layouts/actions. `lib/` shows genuine domain separation (`routing/`, `date/`, `validation/`, `auth/`, `rbac/`, `constants/`, `queries/`, `db/`), `components/` has a correct 3-tier split (`ui/` primitives, `shared/` cross-role, per-role feature folders), and layering is clean in the critical direction: zero Prisma/DB imports in `components/`, zero upward imports (`lib/*` never imports `components`/`app`/`actions`), and `server-only` coverage is complete on all DB-touching modules. The score is held back by modularity, not structure: 17 files exceed 400 lines, geo-math and date-math live inside client components, and 26 `app/` pages query Prisma inline instead of using the `lib/queries/` layer built for that purpose.

Sub-scores: tree/discoverability 4 · App Router implementation 4 · DDD separation 4 · modularity/SoC 2 · layering 3.

### Where and How to Improve

- **Fix the SUPER_ADMIN gate mismatch (functional bug).** `app/facilities/layout.tsx:10` allows only `[Role.FACILITIES]`, but `proxy.ts:20,77-79` explicitly permits SUPER_ADMIN into `/facilities` and `app/facilities/automated-route-planner/page.tsx:22` allows both roles — the layout 403s a user the proxy and page admit. Change the layout guard to `[Role.FACILITIES, Role.SUPER_ADMIN]` to mirror `proxy.ts` (whose own comment at `:13-19` requires exact mirroring).
- **Extract client-embedded domain math into `lib/`.** Move `components/facilities/route-map.tsx:132-230` (`geometryCache`, `fetchRoadGeometry`, `nearestIndex`, `pointAt`, `bearingDeg`, `compassLabel`) to a client-safe `lib/routing/client-geometry.ts` (no `server-only`); hoist the duplicated `toISODate()` (`auto-route-planner-client.tsx:49`, `route-setting-client.tsx:56`) and the inlined `+ days*86400000` week-shift arithmetic (`auto-route-planner-client.tsx:138`, `route-setting-client.tsx:462`) into `lib/date/week.ts` exports.
- **Split the five monoliths, starting with the two clients.** `actions/route-override.actions.ts` (1177 lines), `components/facilities/route-setting/route-setting-client.tsx` (993), `components/facilities/route-map.tsx` (891), `components/facilities/auto-route-planner-client.tsx` (766). Follow the existing `route-breakdown/` precedent (index + `ShiftRow` + `VehicleGroupTable` + `hooks/`): extract per-shift/per-vehicle subcomponents and per-domain action groups. Add a shared `useServerAction` hook (kills the triplicated `useActionState` scaffolding in `resend-credentials-dialog.tsx`, `set-password-dialog.tsx`, `bulk-upload-dialog.tsx`) so `hooks/` grows past its current single file.
- **Route `app/` reads through `lib/queries/`.** 26 pages/layouts import Prisma directly (e.g. `app/operations/weekly-requests/page.tsx:64,68,86`, `app/facilities/layout.tsx:12-14` for a badge count). Move these behind `lib/queries/` functions and apply `withDbRetry` uniformly (today only `app/facilities/dashboard` uses it) for Neon cold-start resilience.
- **Add per-segment loading/error boundaries for the heavy routes.** Only root `app/loading.tsx` and `app/error.tsx` exist; add `loading.tsx` under `app/facilities/route-planning/`, `automated-route-planner/`, and `operations/weekly-requests/` so planning runs stream instead of blank-screening. Consider `forbidden.tsx` + `forbidden()` over the static `app/403/page.tsx` (non-blocking, idiomatic).
- **Housekeeping.** Delete or `.gitignore` the committed `lib/generated/` Prisma output (~55 files); relocate `lib/actions/action-error.ts` to `lib/` root (the `actions/` vs `lib/actions/` name collision confuses imports); group `actions/route-*.actions.ts` (6 files) under `actions/routes/` with a barrel as cross-domain imports grow (`route-breakdown/hooks/useDragActions.ts:10` already spans two domains).

---

## Pillar 2 — System Design & Routing Logic

### Current state (3.2/5)

The headline design decision — a **pure synchronous decision core** (`lib/routing/corridor-core.ts`, 701 lines, self-declared contract at `:1-48`: no prisma/fetch/await/env/wall-clock) invoked by an **async I/O orchestration layer** (`lib/routing/algorithms.ts`) — is real, one-directional, and working in production: `algorithms.ts` only calls `planCorridorRoutesCore`/`poolForOfficeCore` (`:70-71`), never re-implements grouping. Module boundaries are clean elsewhere too: `matrix-core.ts` (pure OSRM `/table` chunking, zero imports), `side-selection.ts` (post-hoc judging: side Viterbi + order search + scoring), `manual-plan-training.ts` (CSV → leg observations, dependency-free), `schedule-math.ts` + `utils.ts` (pure geo/time math). All six pure modules are deterministic (no `Math.random`/`Date.now`) and unit-testable. The deficit is duplication and colocation: the same constants/parsers/mappers are re-implemented 2–5× with subtly divergent semantics, three modules mix pure helpers with `server-only`+Prisma (making the pure parts unimportable in tests/clients), and ~110 lines of deterministic timing policy sit inside the async orchestration where only DB+OSRM integration can reach them.

Sub-scores: file-role clarity 4 · decision ownership/duplication 3 · pure-vs-I/O separation 3 · testability/coverage 3 · type canonicity 3.

### Where and How to Improve

- **Unify the duplicated primitives behind single owners (highest leverage, small diffs).**
  - 25 km/h great-circle fallback ×3 → one export (owners today: `corridor-core.ts:222,242`, `osrm.ts:73-75`, `algorithms.ts:759-773`).
  - Shift-key mappers ×3–4 → `lib/constants/route-shifts.ts` (today: `route-pattern.ts:62-67`, `manual-plan-training.ts:41-49,58-65`, plus `route-shifts.ts` label maps used at `algorithms.ts:597`).
  - Clock parsers ×5 (`corridor-core.ts:336`, `utils.ts:143`, `pickup-schedule.ts:116,423`, `manual-plan-training.ts:18`) → keep the strict regex-validated variant in one module; `algorithms.ts` currently uses two different parsers in one flow (`:367`, `:870`).
  - `driveLegMinutes` (`pickup-schedule.ts:136`) vs the inline `legMin` closure (`algorithms.ts:901-917`, same gate/rounding, different key construction) → single function, single key builder (kill the ad-hoc `addr:<id>`/`office:<name>` string keys in all three leg vocabularies).
- **Finish the pure/I/O split in the three mixed modules.** Extract `route-pattern-pure.ts` (`captureRoutePattern`, `patternOrderForMembers`, `reflectPatternOntoAssignments`) and `pickup-schedule-pure.ts` (`computePickupSchedule`, `driveLegMinutes`) from behind `server-only`+Prisma; lift the embeddable helpers out of `route-analysis.ts` (`currentOrder`, `constraintsFor`, `buildCandidate`, `sameOrder`). This unblocks `node:test` coverage of the highest-stakes rules with zero mocks.
- **Extract the finalize-first timing block into a pure function.** `algorithms.ts:866-974` (`finalizedMinutes` map, pattern replay, `prefixCount` scan, tail-leg build, `backCalculatePickupMinutes` + grid realignment) is deterministic math — move to `computeCorridorTimings(order, finalizedMinutes, learned, arrivalMinutes)` and unit-test it.
- **Unify type vocabulary.** Keep the single owners that already work (`corridor-core.ts:106-171` corridor shapes, `route-analysis.types.ts` analysis shapes), but merge the duplicate `BareMatrix`/`BareLocation` (`corridor-core.ts:195-202`) with the OSRM wire types (`osrm.ts:30-47`), and replace stringly-typed shift/leg keys (`"10PM"|"11PM"|"12AM-6AM"`, `addr:<id>`) with one canonical `ShiftKey` + leg-key builder.
- **Close the highest-value test gaps.** Add tests for `poolForOffice` (pinned-exclusive vs fallback), `computePickupSchedule` branches, `patternOrderForMembers`/`reflectPatternOntoAssignments`, `week.getSubmissionWindow` (Sat-noon roll-forward), and `corridor-core` edge paths (no-vehicle error `:625-631`, zigzag guard `:678`, detour-skip `:681-683`). Fix the fragile `side-selection.ts:21` value-import of `./osrm` (safe only because it is `type`-only today) to `import type` explicitly.

---

## Pillar 3 — Performance & Scalability

### Current state (3.4/5)

Much of the previous audit's findings are genuinely fixed and were re-verified: a bounded `mapWithConcurrency` helper (`lib/concurrency.ts:7-22`), concurrent day-level generation (`route-generation.actions.ts:245-261`, cap 2; intra-day 10PM→11PM→12AM correctly serial on the vehicle-reuse dependency), parallel bulk pre-fetches, `Promise.all` day-upserts, pooled SMTP via `after()`, `unstable_cache` + tag invalidation for settings (1 h) and fleet (5 min) with all writers wired, OSRM timeouts (10 s) + retries with jitter, hostname-keyed throttling, ≤100-coordinate matrix chunking with dedup, layered DB+persistent response caches, and correct `cache: no-store` on live OSRM/geocoder fetches (durability comes from the DB caches, not fetch cache). Index coverage in `schema.prisma` (29 models) is broad. What remains is a short list of large, well-located wins: four serial bulk-write loops, one serial geocode chain that dominates cold mapping runs, an oversized corridor warm-key set on the public OSRM host, and near-static planner reference reads with no cache reader.

Sub-scores: I/O concurrency 3 · caching 3 · N+1/batch 3 · schema/indexes 4 · OSRM/external 4.

### Where and How to Improve

- **Batch the four serial bulk loops (largest DB-side win).**
  - `actions/manual-route-plan.actions.ts:287-342`: per-row `upsert` over 100s of CSV rows → batched `createMany` + `updateMany` keyed on the already-computed key set (`:265-286`).
  - `actions/weekly-schedule.actions.ts:677-803`: outer per-row `create` + 5 upserts serial (200 rows ≈ 1,200 sequential writes) → `createMany` schedules then `createMany` days; parallelize the outer loop with `mapWithConcurrency`.
  - `actions/user-management.actions.ts:400-633`: serial bcrypt (~80 ms/row) + address upsert + user write per row → dedupe addresses → `createMany`, bounded-parallel hashing, `createMany` users + targeted `updateMany`.
  - `actions/route-assignment.actions.ts:327-384,427-466,487-546`: per-day/per-row read+write (+ in-request `sendMail`) serial → single `findMany(where: {weeklyScheduleDayId: {in: ids}})` + `Promise.all`/bounded upserts, mail via `after()` like every other path (also fixes the legacy unbounded `Promise.all(sendMail)` at `:384`).
- **Concurrentize home resolution (largest mapping-latency win).** `algorithms.ts:707-724` awaits `resolveHomeAddress` per member; each miss costs a 1.1 s-throttled geocode + `address.upsert` (`:146`) + `user.update` (`:155`). Preload known addresses with one `findMany`, then resolve misses under `mapWithConcurrency(4–5)`. Same treatment for the per-vehicle loop (`:297-453`: hoist `loadLearnedLegs("10PM")` once per day-run) and the 7 late-night shift passes (`:1126-1137`, concurrency 2 like the day loop).
- **Shrink the corridor warm set / prefetch for the public host (largest OSRM-side win, cold-start only).** `prefetchRoutePolylines` no-ops on the public server (`osrm.ts:718`), so cold runs degrade to lazy per-leg fetches through the 350 ms throttle over the `(members+1)²` all-pairs warm set (`algorithms.ts:798-808`, ~3.7 k keys per office per shift, most never inspected). Add spatial pre-filtering of warm keys and a bounded candidate-only prefetch plan for the public host. Add 1–2 retries for 5xx/timeout in the geocoder (`geocoder.ts`, single-attempt today — transient Nominatim blips permanently skip riders for a run).
- **Cache the near-static planner reference reads.** Add `unstable_cache` readers + tag invalidation (same pattern as the existing `settings`/`vehicles` tags) for the active `PickupPoint` set, planner `Vehicle` reads, and week pins (`algorithms.ts:219-227`, `pickup-schedule.ts:373-382,451-460`, `route-pattern.ts:156-180`). Parallelize `getGeneratedRouteDetails` (`route-generation.actions.ts:716-734`: two serial `findMany`) and `select`-trim `routeAnalysis` JSON out of list queries.
- **Schema and transaction nits.** Add `RouteTemplate @@index([arrivalTime, vehicleId])` (lookup at `algorithms.ts:836-851` leads with `arrivalTime`; the unique leads with `vehicleId`); drop the redundant `RoutePlan @@index([vehicleId,dayDate,arrivalTime])` (same column set as the unique, different order) and `Holiday @@index([date])` (unique already indexes); bound or incrementalize the unfiltered full-table learning scans (`route-learning.actions.ts:130,226`); and shrink the 90 s global/batch transactions (`lib/prisma.ts:31-34`, `route-override.actions.ts:336-337`) in favor of smaller batches + `lib/db/retry.ts` under concurrent Facilities editors.

---

## Pillar 4 — Security & Best Practices

### Current state (4.0/5 — strongest pillar)

All 69 exported async functions across the 20 action files were individually checked: **zero missing guards, zero late guards** (no Prisma/fetch/cookies before the guard in any file). Read paths are guarded too (`getVehicleShiftPins`, `getGeneratedRouteDetails`), the 3 public actions (login + 2 reset) are by-design public with rate limiting + dummy-hash timing defense + enumeration-safe responses, and guards run outside `try/catch` so `NEXT_REDIRECT` is never swallowed. The auth core is strong: jose HS256 with pinned `alg` + zod payload, DB-backed `Session` rows giving real revocation, `httpOnly`/`lax`/prod-`secure` cookies, bcrypt-10, hashed single-use 30-min reset tokens consumed atomically with session revocation + audit in one transaction. No SQL injection (one `SELECT 1` health check + parameterized rate-limit upsert; everything else is the query builder), no mass assignment (explicit field lists everywhere), no client secrets (zero `NEXT_PUBLIC_*`), no open API routes. Deductions: two raw-error-to-client leaks, uneven zod coverage (~12/69 actions), role-list drift, and minor hardening gaps.

Sub-scores: authN/authZ coverage 4.5 · auth implementation 4.5 · error sanitization 3.5 · input validation 3 · injection/secrets/API 4.5.

### Where and How to Improve

- **Plug the two raw-error leaks (do first).** `route-assignment.actions.ts:182-185` returns `error.message` (Prisma `P2002`/FK internals reachable by any Facilities caller) → replace with `sanitizedActionError("assignRoute", error)`. `route-assignment.actions.ts:456-460` pushes `error.message` per row into `skipped[].reason` (a per-row error oracle) → return a fixed string (`"Could not save this row."`) and `logActionError` server-side. Harden `resendRouteAssignmentEmail` (`:263` returns `outcome.error` verbatim — safe today only because `mailer.ts:128` emits a generic string; pin that contract with a comment or hard-code the generic).
- **Unify Facilities role lists.** Standardize on `[Role.FACILITIES, Role.SUPER_ADMIN]` per the repo invariant (`proxy.ts:17-18`): fix `facilities-profile.actions.ts:104,145`, `route-assignment.actions.ts:131,298,406,469,500`, and `app/facilities/layout.tsx:10`. All current mismatches fail closed (403s), so this is a functional fix, not a bypass — confirm intent per action and comment any deliberate exception.
- **Extend zod to the remaining ~57 action boundaries.** Replicate the good examples (`pickup-point.actions.ts:67,153,228`, `route-analysis.actions.ts:58-59`, API `app/api/routing/route/route.ts:26-33`) with shared schemas in `lib/validation/schemas.ts`: capped ID strings, `HH:mm`, date-only, and small-int quantity schemas. Priority: the 5 `route-override` ID-bearing args, `assignRoute`/`saveDaySheetAssignments` payloads, `updateVehicle`/`toggleVehicleShiftPin`, and `updateProfile` length caps (over-long strings currently surface as noisy sanitized DB errors).
- **Harden the auth edges.** Promote `Role` to a Prisma native enum or DB check constraint (`User.role` is a plain string; only the TS zod layer rejects strays — `lib/constants/enums.ts:1-18`); raise the `SESSION_SECRET` minimum from 16 chars (`lib/env.ts:27-29`) to ≥32 random bytes and verify the deployed value; add `__Host-` cookie prefix; redact email `to`/`subject` from server logs (`lib/mailer.ts:57,71,73-77,91-95,113-116,123-127`).
- **Keep the patterns that work.** Guard-first-outside-`try` ordering, `P2002`-to-generic mapping in `action-error.ts`, atomic reset-consume + session-revoke + audit transactions, `APP_URL` from env (never Host header), and rate-limiting all 3 public actions are exemplary — encode them in `docs/` contribution guidance so new actions inherit them.

---

## Pillar 5 — Code Quality & Technical Debt

### Current state (3.2/5)

The compiler story is exemplary: `strict: true`, **zero `any`** in first-party code, **zero `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`**, only 3 non-null assertions (one risky: `pickup-schedule.ts:508-509` chained `!` on a nullable relation + nullable float in the production routing path), and 10 inventoried `as unknown as` casts of which only `osrm.ts:370` (`null` stuffed into a non-nullable element type) needs a type change. Naming/casing conventions are consistent, commented-out code is ~zero, and there are no TODOs. The debt is duplication (weakest sub-area, 2/5): the arrival-minutes literal in 4 places with 2 different invalid-input contracts under the same function name, `hhmmToMinutes` ×2 (`0` vs `null` on invalid — a latent midnight-misroute), byte-identical `parseDayString` ×2, 3 competing time-shape policies, and scattered ms literals. Tests (6 files via `npm run verify`) cover pure routing math/date/schemas well but nothing with blast radius: zero tests for actions, guards, session/JWT, queries, or components.

Sub-scores: TS strictness 4 · dead code 4 · duplication 2 · consistency 3 · lint/test health 3.

### Where and How to Improve

- **Deduplicate time/shift helpers (same fix as Pillar 2 — single highest-value cleanup).** Consolidate all callers (`route-analysis.actions.ts:255`, `route-override.actions.ts:527`) onto `arrivalMinutesForLabel` (`route-shifts.ts:76-86`, the `null`-returning canonical) and delete the `23*60` garbage-fallback twin in `corridor-core.ts:327`. Keep the regex-validated `hhmmToMinutes` (`route-generation.actions.ts:165-170`), move `parseDayString` (`route-generation.actions.ts:58-61` ≡ `route-setting.actions.ts:14-17`) into `lib/date/week.ts` next to `toUtcMidnight`, and unify on the strict zod `pickupPointTimeSchema` (`schemas.ts:101-103`) over the hand-rolled `normalizeHHmm` (`route-setting.actions.ts:23-30`). Export `MS_PER_DAY`/`MS_PER_WEEK` from `lib/date/week.ts` (canonical exists at `:10`; `rate-limit.ts:76`, `route-assignment.actions.ts:511`, `operations/weekly-requests/page.tsx:134` inline their own).
- **Fix the UTC-midnight write paths.** `on-behalf.actions.ts:240` stores `new Date(`${dateValue}T00:00:00`)` (local parse) directly to `AdHocRequest.date` — wrap in `toUtcMidnight`; same for the read filter in `allocation-history.ts:42`. Add `getMondayOfWeekUtc`/`getWeekDaysUtc` (current `week.ts:43-60` helpers are host-TZ-dependent while the docstring at `:63-67` mandates UTC keys — every caller must currently remember to wrap), migrate writers, and pin all `scripts/` to one `WEEK_START` constant (today Aug-24 vs Sep-21 vs Sep-07 across scripts). Display dates with `timeZone: "Asia/Dhaka"` (as `audit.ts:81` already does) instead of server-locale `toLocaleDateString()` (`fixed-arrival/dashboard/page.tsx:54`, `employee/dashboard/page.tsx:99`, `super-admin/dashboard/page.tsx:42`).
- **Remove or mount the dead UI.** `components/facilities/copy-week-buttons.tsx` (`ReplicateAcrossWeekButton`, `CopyLastWeekButton`) has zero importers while its actions (`route-assignment.actions.ts:468,499`) stay live-but-unreachable — delete the file or wire it into the route-planning UI. Either ignore `.design-sync/previews/` in `eslint.config.mjs` or delete it.
- **Tighten the compiler and pipeline.** Enable `noUncheckedIndexedAccess` (catches the `pickup-schedule.ts:508-509` class of bug at compile time), `noUnusedLocals`/`noUnusedParameters` (the `_prevState` convention survives via `_`-prefix), and `noFallthroughCasesInSwitch`; fix `osrm.ts:370` → `DistanceElement | null` and type `DragOverlay.tsx:99` as `ReactNode`; route `logActionError` (`action-error.ts:34`) and the raw `console.*` in `route-override`/`route-generation` actions through `lib/logger.ts`; add Prettier + `format:check` (mis-indented `settings.actions.ts:24-62` proves formatting isn't gated); replace 4 `no-img-element` suppressions with `next/image`; review the 2 `exhaustive-deps` suppressions (`route-map.tsx:451`, `manual-plan-upload-dialog.tsx:62`).
- **Test where blast radius lives.** Before touching routing math again, add action-level tests: weekly-schedule submit→approve→reject transitions, replicate/copy no-overwrite guards, approval-status guards, RBAC gate matrix (`requireRole` per role), and CSV bulk-upload row accounting. Confirm CI runs `npm run verify` (workflow exists under `.github/` — verify it executes typecheck + lint + tests on PRs).

---

## Consolidated Remediation Backlog

**P0 — fix this week (security/correctness, all small diffs):** raw-error leaks (`route-assignment.actions.ts:182-185,456-460`) · arrival-map consolidation + kill `23*60` fallback (`corridor-core.ts:314-328`) · UTC-midnight ad-hoc write (`on-behalf.actions.ts:240`) + filter (`allocation-history.ts:42`) · Facilities role-list unification (5 action sites + `facilities/layout.tsx:10`) · `osrm.ts:370` nullable type + `pickup-schedule.ts:508-509` guard.

**P1 — fix this month (performance/scale, medium diffs):** batch 3 CSV bulk loops (`manual-route-plan`, `weekly-schedule`, `user-management`) · concurrent home resolution (`algorithms.ts:707-724`) · day-sheet/legacy planner concurrency + `after()` mail (`route-assignment.actions.ts:327-546`) · corridor warm-set shrink + public-host prefetch · pure-module splits (`route-pattern-pure`, `pickup-schedule-pure`) + `computeCorridorTimings` extraction · action-level test suite for state machine/approvals/RBAC.

**P2 — steady-state hygiene (ongoing):** monolith decomposition (route-override, route-setting-client, route-map, auto-planner) · `app/` reads via `lib/queries/` + uniform `withDbRetry` · per-segment `loading.tsx` · planner reference-read caching · `RouteTemplate` index + redundant-index drops + incremental learning · compiler flags (`noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`) + Prettier gate · `next/image` migration · dead-UI decision (`copy-week-buttons.tsx`) · DB-native Role enum + 32-char secret + log redaction.

---

## Appendix A — Action auth coverage (condensed)

Full per-action table (69 functions across 20 files): **65 guarded-first, 0 late, 0 missing.** Public-by-design (3): `loginAction` (`auth.actions.ts:36`), `requestPasswordResetAction` + `resetPasswordAction` (`password-reset.actions.ts:29,103`) — all rate-limited, enumeration-safe, zod-validated. Harmless unguarded: `logoutAction` (idempotent cookie destroy). Module-private helpers (`upsertAssignmentForWeeklyDay/AdHoc`) correctly rely on caller guards with `actor: session` threading. **Only defect: role-list drift** — `route-assignment.*` (except resend), `facilities-profile` single-set/update-employee use `[FACILITIES]` where siblings use `[FACILITIES, SUPER_ADMIN]` (fail-closed 403s; see Pillar 4 §2 table rows 11–12, 28, 30–33).

## Appendix B — Test inventory (`npm run test`: 6 files, 28 tests)

Well covered: matrix batching/dedup · side-selection (Viterbi, Or-opt, scoring) · manual-plan training (clock/shift/leg observations) · corridor-core happy paths (radius-skip, anchor-preserve) · Dhaka wall-clock arithmetic · `manualRouteGeometrySchema`. **Zero coverage:** all 20 action files · RBAC/session/JWT/rate-limit · Prisma queries/audit/mailer/concurrency · all components · `getSubmissionWindow`, `computePickupSchedule`, `patternOrder*`, `poolForOffice` edge paths, remaining zod schemas.

## Appendix C — Status of prior-report items (re-verified)

**Confirmed fixed since v1/v2:** corridor-core integration + duplicate planner removal · OSRM timeout/retry/throttle path · authed `/api/routing/route` proxy (no client-side public-OSRM calls) · matrix ≤100-coord chunking + dedup · expired-cache-row refresh bug · render-time `vehicle.upsert` on GET · `adjustPickupTime` credential leak · atomic user-create/reset audit + reset session-revoke · bounded user directories with pagination · `unstable_cache` settings/fleet + invalidation wiring · approval/transport/allocation guards · CI + `npm run verify` gate · orphan-component removals.
**Carried forward (still open, folded into the backlog above):** serial bulk loops · mixed pure+I/O modules · zod boundary coverage · duplicate time/shift helpers · monolith decomposition · DB-native Role enum · incremental learning.

---
*Teams: start with P0 (all ≤1-day fixes, two close an information leak), then P1 item-by-item; each P1 fix should ship with the regression test Pillar 5 requests. Line numbers are HEAD readings from the audit session — re-grep before editing.*
