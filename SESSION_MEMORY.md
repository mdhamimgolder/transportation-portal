# SESSION_MEMORY.md — TMP session continuity & efficiency log

Read this at the start of every task so you can continue without re-exploring.
**Always update it before the session ends** (append/rewrite the Latest Session
block and bump Work State / Next Move). Do this EVERY session — it is how we
work fast without interruption.

## Design preferences (the human, gathered from feedback)
- **LOVES clean / classic / minimal / professional layouts.** Rejected a `data-viz`
  timeline ("overnight rail" with nodes) as **messy/confusing** — wanted **"just a
  classic grid"**.
- Ask clarifying questions FIRST when a design/branding choice feels open (the human
  explicitly invited this). Use the `question` tool to nail direction before building.
- Keep interactivity light-touch (hover / expand-a-row to review), not gimmicky.
- UI/interaction notes: mono timestamps + chips are fine; avoid needing a timeline.
- Use `#...`/**`frontend-design` skill** for new UI, grounding in the real data/roles.

---

## Project snapshot
- Next.js 16.2.10 (App Router, Turbopack), React 19, Prisma 7.8.0, Postgres (Neon),
  Tailwind + shadcn-style UI (`components/ui/*`), Leaflet route map, OSRM routing.
- Offices: `Regnum` and `Spectra` (`lib/constants/office-locations.ts`).
- Roles gating Facilities UI: `requireRole([Role.FACILITIES, Role.SUPER_ADMIN])`.
- Machine TZ = Asia/Dhaka; DB stores week/day dates as UTC midnight. Test week: `2026-08-24`.

## Key conventions / decisions (source of truth)
- **Pickup-time rule (5-minute rule)** — `lib/routing/pickup-schedule.ts` is the ONLY source
  of the schedule math; generation + route-setting sync + auto-calc all use it:
  - 5 min/km (Math.ceil(km × 5)) per leg.
  - All pickup times on a **5-minute grid** (`10:25, 10:30…`); forward anchor rounds UP,
    backward rounds DOWN.
  - Consecutive pickups (and last pickup → office arrival) are always **≥ 5 min apart**
    (enforced in both `computePickupSchedule` backward path and corridor builder).
  - Anchor: FORWARD from `Vehicle.firstPickupTime`; else BACKWARD from `Vehicle.baseETA`
    (only `"22:00"`/`"23:00"` allowed — `BASE_ETA_ALLOWED`).
  - **Learned legs** (`RouteLegLearning`, min 3 observations) override the distance/OSRM
    estimate. Shift keys: `"10PM" | "11PM" | "12AM-6AM"`. Keys are `addr:<addressId>` /
    `office:<officeName>`.
- **10 PM routes** (`generate10PMRoutes` in `lib/routing/algorithms.ts`): preset pickup-point
  sequences; employees attach to the vehicle owning their active pickup point
  (`User.pickupAddressId`). Missing point ⇒ per-employee error, never a silent empty route.
- **11 PM / 12 AM–6 AM** (`generateCorridorRoutes`): density clustering, cap 4,
  `GROUPING_RADIUS_KM = 2.0`, `GROUPING_OFFICE_DIRECTION_SLACK_KM = 1.0`; farthest-from-office
  picked up first, route walks back to office. Back-calc pickup times anchored on arrival,
  then snapped to 5-min grid with ≥5 min gaps (wraps past midnight for late shifts).
- `RoutePlan.arrivalTime` stores labels (`"10 PM"`, `"11 PM"`, `"12 AM"`, …, `"6 AM"`);
  `weeklyScheduleDay.arrivalTime` stores `"HH:mm"` (`"22:00"`, `"23:00"`, …).
  `ARRIVAL_REF_MINUTES`: 10 PM=1320 … 6 AM=1800 (in `lib/constants/arrival-times.ts`).

## Recipes
- **Finish a task:** `npx tsc --noEmit` + `npx eslint <changed files>` (must pass).
- **Schema change:** `npx prisma migrate dev --name <x>` → `npx prisma generate` → restart server.
- **Server restart** (after Prisma/schema change): kill port-3000 listener →
  delete `.next` → relaunch hidden cmd → log at
  `C:\Users\HAMIM~1.GOL\AppData\Local\Temp\opencode\next-dev.log`.
- **tsx scripts** need `import "dotenv/config"` at top; no top-level await (use `async main()`);
  temp scripts live in repo root (`_name.ts`) and are deleted after verifying.

## Latest Session (2026-09-03i) — Account creation: credentials email + validation + facilities role lock; immediate address/contact changes; delete profile-approval module
**Built; tsc + eslint clean; schema migrated + client regen; build OK; dev server restarted (clean). Committed + pushed (b50751b, plus c9f6ae2 for prior task).**
1. **New-user credentials email** — `lib/mailer.ts` gained `sendCredentialsEmail({to, fullName, password})`
   (HTML table of email+password, cyan brand). `createUserAction` fires it via `after()` (matches existing pattern).
2. **Bulk upload individual emails** — `bulkCreateUsersAction` collects `createdCredentials[]` in the loop, then
   `after(() => Promise.allSettled(createdCredentials.map(sendCredentialsEmail)))` — ONE email per created user.
   Also: Facilities cannot bulk-create SUPER_ADMIN rows (skipped).
3. **Field validation (both server + client `pattern`/`type`)** for create-user form: employeeCode = exactly 9 digits
   (`/^\d{9}$/`), contactNumber = exactly 11 digits (`/^\d{11}$/`), email = basic regex; email placeholder `name@commure.com`.
4. **Facilities cannot create Super Admin** — `createUserAction` rejects role=SUPER_ADMIN when session.role===FACILITIES;
   UI `AddEmployeeDialog` takes `allowAllRoles?: boolean`: Facilities page passes nothing (SUPER_ADMIN filtered out of
   the role dropdown), Super-Admin page passes `allowAllRoles`.
5. **Rename "Route Planning" → "Pick Schedule"** — `app/facilities/layout.tsx` nav label + `route-planning/page.tsx` h1.
6. **Address change = immediate + notify + 30-day lock** (per user; keep pickup-point approval):
   - Prisma `User.addressChangedAt DateTime?` (migration `20260903154601_employee_address_changed_at`).
   - `actions/profile.actions.ts` `updateProfile`: address writes directly (no AddressChangeRequest), sets
     `addressChangedAt=now`, blocks if within `ADDRESS_CHANGE_LOCK_DAYS=30`; fires notification email (old→new address)
     to Facilities + Operations via `after()` + `Promise.allSettled`. Contact number also writes directly now.
   - Recipient emails in NEW `lib/constants/notification-recipients.ts`: `FACILITIES_NOTIFICATION_EMAIL`
     (default `ax-facilities-bd@commure.com`, env-overridable) + `OPERATIONS_NOTIFICATION_EMAIL` (env, empty default —
     **user will share the operations address later; set as `OPERATIONS_NOTIFICATION_EMAIL` env or constant**).
   - **NOTE: this file is under gitignored `lib/`** — must `git add -f` it (like mailer.ts). Already done & pushed.
7. **Deleted profile-approval module (address+contact) everywhere**; kept pickup-point approval:
   - Deleted `app/operations/profile-approvals/`, `components/operations/{address,contact}-approval-card.tsx`,
     `actions/{address,contact}-change.actions.ts`; removed "Profile Approvals" nav+badge from `app/operations/layout.tsx`.
   - `app/facilities/profile-approvals` (pickup-point only) + `PickupPointApprovalCard` + `pickup-point-change.actions.ts` KEPT.
   - Employee/corporate profile pages now only fetch `pickupPointChangeRequest`; address/contact fields no longer
     pending-disabled; `ProfileUpdateForm` dropped all disabled props; `ProfileHeroCard` dropped pending props.
   - `AddressChangeRequest`/`ContactChangeRequest` Prisma models left in schema (unused, harmless) — no destructive migration.

## Latest Session (2026-09-03h) — Background email dispatch for Vercel (`after()`); dev-server cache corruption fix
**Built; tsc + eslint clean; dev server restarted (clean Turbopack cache); /facilities/dashboard /login 200; log clean. NOT committed.**
1. **Motivation:** Vercel checklist — allocation emails were all `await sendMail()` BLOCKING the server action
   (sequential in loops) → would timeout (10s hobby/60s pro) on Vercel for bulk day-sheet saves; `emailSentAt`
   was stamped BEFORE send (DB lies on failure). Moved ALL email dispatch to Next.js `after()` so the response
   returns instantly and emails fire after the response.
2. **`lib/mailer.ts`** — added `sendMailBackground(params)` (non-throwing wrapper: catches, logs, never rejects).
   `sendMail` unchanged for any caller needing errors.
3. **`actions/route-assignment.actions.ts`** — `upsertAssignmentForWeeklyDay` + `upsertAssignmentForAdHoc`:
   removed premature `emailSentAt: new Date()` from create/update; replaced `await sendMail(...)` with
   `after(async () => { await sendMailBackground(...); await prisma.routeAssignment.update({ emailSentAt }) })`.
   `saveDaySheetAssignments`/`replicateAcrossWeek`/`copyLastWeekRoutes` need NO further change (they delegate to
   the upsert, which now self-handles `after()`). Also dropped the pre-existing unused `WeeklyScheduleStatus` import.
4. **`actions/route-override.actions.ts`** — `finalizeRoute`: route marked `FINALIZED` immediately; emails moved
   into ONE `after()` callback using `Promise.allSettled(sendMailBackground)` (one failure doesn't block others),
   then `tripAssignment.updateMany({ emailSentAt })` only if ≥1 fulfilled. Message text: "Emails sending…".
5. **`actions/password-reset.actions.ts`** — reset email moved into `after()` (edge already returns "if the email
   exists, a link was sent" instantly).
6. **Dev-server cache corruption gotcha:** after killing port-3000, `.next` had a corrupted Turbopack SST cache
   (navbar of `Unable to open static sorted file … .sst` + `Compaction failed`) that persisted recompile errors.
   Fix: stop process → `Remove-Item .next -Recurse -Force` (parent dir must be fully unlocked — kill the actual
   OwningProcess PID, not just the port listener) → delete the log file → relaunch. Clean Ready in 665ms.
7. **Vercel note:** SMTP env vars (`SMTP_HOST/PORT/USER/PASS/FROM`) must be set in Vercel dashboard. With
   `after()`, allocations return instantly and emails run in background (Vercel keeps the fn alive for them).

## Latest Session (2026-09-02g) — Schedule-submission email notice to employees (auto-approve flows)
**Built; tsc + eslint clean (only pre-existing `editWeeklySchedule` unused-`session` warning). NOT committed.**
1. **New requirement:** when a schedule is submitted (and auto-approved), the employee whose schedule was
   submitted gets an email: "Your schedule has been submitted" + log in → view current week schedule → find
   day-wise assignment.
2. **Added a shared helper** `sendScheduleSubmittedNotice()` (inline, duplicated in two files since no shared
   email-template module exists) — emails via `sendMailBackground` in an `after()` callback (matches the existing
   route-assignment pattern). HTML table lists Monday–Friday day rows with arrival time / "No transport".
3. **Patched the 3 auto-approve paths** (all collect day data then fire the notice):
   - `actions/weekly-schedule.actions.ts` `submitMySchedule` — to `session.email`/`session.fullName` (Operations self).
   - `actions/on-behalf.actions.ts` `createWeeklyScheduleOnBehalf` — to the target `employee.email`/`employee.fullName`.
   - `actions/weekly-schedule.actions.ts` `bulkUploadWeeklySchedules` — to each uploaded employee.
   - Imported `after` from `next/server`, `sendMailBackground`, `DAY_LABELS`, `formatShortDate`, added
     `ARRIVAL_VALUE_TO_LABEL`.
4. Note: corporate-employee self-submit (PENDING, needs review) intentionally NOT emailed on submit — only the
   auto-approved paths, per the request.

## Latest Session (2026-09-02f) — Band value-driven; combobox shows 3 driver rows; driver/time 50–50
**Built; tsc + eslint clean; dev server restarted; /facilities/adhoc 200; log clean. NOT committed.**
1. **Ad-hoc band left column reworked** (`components/facilities/adhoc-list.tsx`):
   - **Employee code chip removed** (no more employee id in the row).
   - **Email sits beside the name** (truncated, muted, flex), name truncates, StatusBadge at end.
   - Values only (labels stripped): **Address** now `text-[13px] text-foreground` (black, slightly larger, truncated);
     Contact (muted) + Pick-up chip on one line; pick-up still cyan when set / amber `Pick-up required` at 10 PM / muted otherwise.
2. **Driver picker dropdown** (`components/facilities/vehicle-driver-combobox.tsx`):
   - `ROWS_VISIBLE = 3` — list capped at 3 rows (`max-h-[7.5rem]` scroll); **search pads to 3**: top matches first,
     then next available drivers, so the list never collapses to 1; row labels `truncate`.
3. **Panel row 1 is 50/50 with a gap** (`components/facilities/assignment-form.tsx`):
   - Row `flex items-center gap-1.5`; driver combobox `min-w-0 flex-1` + pick-up time `min-w-0 flex-1` (text Input full
     width / SelectTrigger `w-full px-2`); second row note + Save + X-cancel unchanged.
4. Note: dev-server restart this round needed `Start-Process cmd -ArgumentList '/c','npm','run','dev','>','log','2>&1'`
   (tokenized) — had one silent no-op restart after a port kill.

## Latest Session (2026-09-02e) — Ad-hoc band now shows full data; 10 PM pick-up required; one-line panel
**Built; tsc + eslint clean; server restarted; /facilities/adhoc + /operations/adhoc compile 200. NOT committed.**
1. **Ad-hoc band left space now carries the required routing data** (`components/facilities/adhoc-list.tsx`):
   - Left column = name+code+StatusBadge row + a 2x2 grid `text-[11px]` of `Addr` / `Contact` / `Pick-up` / `Email`
     (truncated, full values in `title`). **Pick-up** cell emphasised: cyan-soft chip when set, amber
     `Pick-up required` when 10 PM arrival & missing, muted otherwise.
   - **10 PM pick-up rule** (new): `ADHOC_PICKUP_REQUIRED_TIME = "22:00"` in
     `lib/constants/adhoc-arrival-times.ts`; for a 10:00 PM arrival the employee MUST have a pick-up point.
   - Enforced server-side in `actions/adhoc.actions.ts` `submitAdHocRequest`: `"22:00"` + no `User.pickupPoint`
     ⇒ error "Pick-up Point is required for a 10:00 PM arrival. Update your pick-up point in your profile first."
   - **Arrival column shrunk** `10rem → 7rem`, outer padding removed (no blank space).
   - Dropped the reason / "Approved by · Assigned by" / Declined lines from the band (data grid took the space).
     Removed now-unused `reviewerNames`/`assignerNames` props (+ `getUserNamesByIds` calls) from
     `app/facilities/adhoc/page.tsx`; `AdHocStatus` import dropped from adhoc-list.
2. **Assignment panel = two rows** (`components/facilities/assignment-form.tsx`, `variant="panel"`):
   row 1 = driver combobox (flex-1) + pick-up time (`w-24`); row 2 = comment Input (flex-1) + Save + X-cancel.
   Fits `h-20` band unchanged (`space-y-1`).
3. Verified: `npx tsc --noEmit` clean; `npx eslint` on 5 changed files clean; fresh SSR chunks contain no stale
   `reviewerNames` (log had one stale dev-overlay line from the pre-restart session — noise only).

## Latest Session (2026-09-02) — Accent #70BCCC system, Refined Inter, ad-hoc rules + redesigns
**All built; tsc + eslint clean; dev server restarted + routes compile 200; CSS verified. NOT committed.**
1. **Typography — "Refined Inter"** (user confirmed to replace earlier Bricolage/Instrument/Plex round):
   - `app/layout.tsx`: Inter Variable (`--font-sans`, subsets latin+latin-ext) + JetBrains Mono 400/500/600 (`--font-mono`).
   - `app/globals.css`: `--font-sans-bn` (Hind Siliguri/Noto Sans Bengali) + `--font-sans-stack`/`--font-mono-stack`;
     `html` rule (cv11/ss03/ss07/tnum/zero + optical-sizing + antialiasing); `.tabular` utility; `@theme inline` font keys → stacks;
     fixed 9-step `@theme` type scale (text-display-xl … text-mono-s). Verified compiled CSS: Inter+JetBrains in, old faces out.
2. **Accent unification → `#70BCCC` for every role/system** (user asked for it):
   - `globals.css`: role-accent tokens unified (`#70bccc` / `rgba(112,188,204,0.15)` / `#0f3038`); deleted per-role `[data-role]` overrides;
     light+dark `--ring`/`--teal` (and dark `--primary`/`--accent-foreground`) → `#70bccc`.
   - All 5 role layouts (active nav = `bg-[rgba(112,188,204,0.15)] text-[#70bccc]`, dot `bg-[#70bccc]`, avatar `bg-[#0f3038]`/`text-[#70bccc]`),
     5 dashboards, `role-accent.tsx`, `dashboard-hero.tsx` default, auth layout, login-form, refresh-button, profile-hero-card.
   - Added `@source not "../_archived-fastapi-scaffold-2026-07-27/**";` (also frontend/, .claude/worktrees/) so stale dirs stop emitting dead utilities.
3. **Ad-hoc 3-hour rule** (submission → arrival gap ≥ 3h; enforcement + UI gating):
   - `lib/constants/adhoc-arrival-times.ts`: `ADHOC_MIN_ADVANCE_HOURS = 3`; `resolveAdhocArrival(baseDate, time)` (22/23 same night, 0–6 next morning);
     `earliestAdhocArrival(now)`; `isAdhocArrivalEligible()`; `eligibleAdhocArrivalOptions()`.
   - Enforced in `submitAdHocRequest` (base `startOfToday()`) and `createAdHocRequestOnBehalf` (base = picked date) — server returns the 3h message.
   - `AdHocRequestForm` filters options (empty ⇒ dashed "window inside notice period" note). `CreateAdHocOnBehalfDialog` filters by selected date
     (dropdown shows "select a date first"); reset of an ineligible picked time moved into the date `onChange` (no setState-in-effect).
4. **AttentionBoard head block removed** (`components/shared/attention-board.tsx`): dropped `eyebrow`+`headline`; slim header now shows only `subline`.
   Dashboards (operations/facilities/super-admin) stop passing them.
5. **DashboardHero eyebrow color**: removed `accentClassName` prop entirely; eyebrow text + dot now **amber** (`text-amber`, `bg-amber`) — the cyan
   "Operation-Admin · Wed Sep 2" line was flagged by user as not-fresh. All 5 dashboards updated (9 usages gone).
6. **Accent surfaces** — new unlayered CSS in `globals.css`: `.surface-accent` (soft `rgb(112 188 204 / .16)` fill + cyan border, hover/.24,
   focus-visible/.22 + .85 border; wins over Tailwind bg-/border- utilities). Applied to `SearchBox` input, `ExportCsvButton`,
   all 3 upload-trigger Buttons ("Bulk upload"/"Upload CSV"), and the 3 `<Input type="file">` dropzones. Verified present in compiled CSS.
7. **Facilities ad-hoc redesigned** (frontend-design, "dispatch requisition slips"): new `components/facilities/adhoc-list.tsx` replaces the oversized
   Card stack — compact hairline-bordered bands, 3px status rail (`--amber`/`--teal`/`--red`), name + mono code chip, one-line contact/address meta,
   dl row (date·arrival mono + reason), review trail, assignment tool on `bg-muted/40` footer. Page `app/facilities/adhoc/page.tsx` slimmed.
8. **Operations ad-hoc table** (`components/operations/adhoc-table.tsx`): **Employee ID column deleted**; emailed+contact folded into a two-line
   Employee cell (code · email, contact via title); arrival = mono chip; removed card-scale hover → `hover:bg-muted/50`; colSpan 9→6.
9. **Lint fix**: `create-on-behalf-dialog.tsx` EmployeePicker setState-in-effect resolved (dropdown select sets query; no sync effect).
- Note: `--teal` also became `#70BCCC` (flagged judgment call; no user objection yet). Pre-existing lint errors elsewhere: `route-assignment.actions.ts:7`
  unused `WeeklyScheduleStatus`; `edit-employee-profile-dialog.tsx:60` setState-in-effect.

## Latest Session (2026-09-02b) — Near-white inputs, ad-hoc dispatch panel, ops approval selects, weekly export moves
**All built; tsc + eslint clean; dev server restarted; all touched routes compile 200; compiled CSS verified. NOT committed.**
1. **Input surfaces → near-white (user override: "almost white, not fully white")**:
   - `globals.css`: new `--surface` token — light `#faf9f4`, dark `#131a1f`; registered `--color-surface` in `@theme inline`.
   - `.surface-accent` REDEFINED: no more cyan fill — near-white `var(--surface)` + thin cyan rim (`rgb(112 188 204 / 0.55)`; hover `.75` + fee-tint `.08`,
     focus-visible `.9`). Still wins over Tailwind (unlayered).
   - Base `Input`/`SelectTrigger`/`Textarea` now `bg-surface` (was `bg-transparent`/`dark:bg-input`); dropped the `dark:bg-input/30` variants.
   - Verified compiled `app_globals_css_*.single.css`: `.bg-surface`, new `.surface-accent`, both `--surface` values present.
2. **Dashboard period dot**: removed `<span style={{color:"var(--role-accent)"}}>.</span>` from all 5 dashboard Hero titles — period now renders
   in foreground/welcome color.
3. **Vehicle driver combobox** (`vehicle-driver-combobox.tsx`): Search icon (absolute, left) + `pl-8` + default placeholder "Search vehicle or driver"
   (query filtering already existed for driverName/vehicleNumber/vendor).
4. **AssignmentForm `variant="panel"`** (default `"inline"`, unchanged for schedule-card):
   - Panel = stacked: row 1 `VehicleDriverCombobox (flex-1) + time control`, row 2 ad-hoc comment `w-full`, row 3 `justify-between` error(left)/Save+Cancel(right).
   - Also fixed pre-existing `setState-in-effect` (assignment-form.tsx:63) with the render-time prev-value pattern
     (`if (state.success && !prevSuccess) { setPrevSuccess(true); setEditing(false); }`) — this rule (react-hooks/set-state-in-effect) now flags it.
5. **Facilities ad-hoc rows → compact 2-col** (`adhoc-list.tsx`): `grid sm:grid-cols-[minmax(0,1fr)_auto]` —
   - LEFT: name + code chip + email/contact line, then highlight chips: **amber** mono chip `date · arrival` (`bg-amber/15`
     `text-amber-foreground`), **cyan-soft** address chip + Pick-up chip (`bg-role-accent-soft` `text-role-accent-deep`, truncated w/ title),
     reason line, review trail. `sm:pl-[13px]` aligns text right of the 3px rail.
   - RIGHT: `sm:w-96` panel `border-l bg-muted/40` hosting `<AssignmentForm variant="panel" pickupTimeMode="text">`.
6. **Operations ad-hoc table** (`adhoc-table.tsx`): selection is now controlled state (`selectedIds: Set<string>`); bulk
   `form#adhoc-bulk-approve-form` carries hidden `requestId` inputs (pays real hidden inputs — Radix form-association was unreliable);
   selection cleared `onSubmit`. Header "Employee" cell gains a **select-all pending** Checkbox; every row gets a Checkbox
   (disabled for APPROVED/REJECTED so the column is uniform — "all select options for approving submitted requests"); Employee cell
   narrowed `min-w-40 max-w-52`.
7. **Weekly Export moved into Route Planning** (per user: "Delete 'Weekly report' menu; set weekly export in route planning top-right with a week selector"):
   - `app/facilities/layout.tsx`: "Weekly Export" nav item removed; `app/facilities/weekly-export/page.tsx` left in place (now orphaned).
   - `app/facilities/route-planning/page.tsx`: computes `distinctWeeks`/`weekOptions` (same as old page, via `getWeekDays`), export schedules
     (APPROVED + optional `?week=` filter, `take: MAX_UNFILTERED_ROWS`), reassembles `csvRows` (same headers as old page). Renders
     `WeekFilter + ExportCsvButton` top-right in BOTH views (employee + day-sheet) via a shared `exportToolbar`; `searchParams` now `{view,day,week}`.
   - `route-planning-controls.tsx`: "By employee" toggle deleted per user ("Only the 'By employee' button"). Toggle now reads contextually:
     employee view → "By day (sheet)"; day view → "Back to employees". Day-pill group unchanged.
- Note: weekly-export page kept (orphaned) unless user says delete; not in nav. Search icon still the only combobox adornment — fine for now.

### 2026-09-02c (same session, follow-up refinements) — verified tsc/eslint/200/restart, NOT committed
1. **Ad-hoc band → 3-col compact** per clarifications (arrival = "middle col between info & panel"; save = "one-row panel"):
   - `adhoc-list.tsx` grid `sm:grid-cols-[minmax(0,1fr)_auto_auto]`: LEFT = name+code(+badge), email·contact, **FULL address (no truncate, wraps, text-xs)** + inline Pick-up chip;
     MIDDLE = `border-l` + vertically centered amber chip (date small uppercase / arrival mono sm semibold, `bg-amber/15 text-amber-foreground`); RIGHT = `sm:w-96 border-l bg-muted/40 px-2.5 py-2` panel.
   - `assignment-form.tsx` **panel variant = one compact row**: `[combobox flex-1]+[pickup w-28 text]+[Save]+[Cancel]` with `gap-1.5`; comment textarea second row `w-full min-h-9` (tailwind-merge overrides base min-h-16); error below. Inline variant now shares the same row layout (Save next to time) — schedule-card look changed slightly, acceptable.
   - Height reduced: left `py-2` (was py-2.5/3), panels `py-2`.
2. **Route Planning → Day-sheet ONLY** (user: "By employee totally not require. keep only Day wise"):
   - `route-planning-controls.tsx`: signature now just `{ day }` — renders only the Mon–Fri pill group (`setParams` keeps other params incl. week). No toggle at all.
   - `app/facilities/route-planning/page.tsx`: `view` param gone (searchParams `{day, week}`), employee-card branch + ScheduleCard import deleted; page always computes `getDaySheet(dayOfWeek)` once and renders RouteDaySheet; week-export toolbar (WeekFilter+ExportCsvButton) stays top-right.
- Note: `ScheduleCard` component still exists (unused by route-planning now) — kept for potential re-use; a stray `view=day` URL param is harmless.

### 2026-09-02d (same session) — ad-hoc band pinned h-20, fixed exact columns, one-line comment+time+save
User: "use one line for comment box and arrival time box; arrival time box fixed exact column size (no reflect with left data); reduce box height to h-20."
- `adhoc-list.tsx` band: `grid h-20 overflow-hidden sm:grid-cols-[minmax(0,1fr)_10rem_20rem]` — heights AND widths now fixed/exact, no longer driven by left content.
  LEFT (flex-col justify-center, 3 lines max, overflow-hidden): name(truncate,flex-1)+code chip+StatusBadge (email·contact moved to h3 title); address·pickup truncated line (full in title); 3rd line = declined / approved·assigned / reason. MIDDLE: exact `10rem` column, `border-l`, centered amber chip (date small, arrival mono semibold, whitespace-nowrap). RIGHT: exact `20rem` `bg-muted/40 p-1 border-l` panel.
- `assignment-form.tsx` panel variant: `space-y-1`; row1 = driver combobox full-width `[&_input]:h-8`; row2 = **comment (Input, one line, `h-8 min-w-0 flex-1`) + time (`h-8 w-24`) + Save + Cancel-to-X icon button (`size-8 px-0`, lucide X)**; error truncated below. All rows h-8 → panel height ≈ 76px inside the h-20 band. Comment is now a single-line Input in panel (textarea kept for inline/schedule-card).
- Cancel button in panel became an icon-only ✕ (aria-label) to fit the tight row; inline variant unchanged.
- Verified tsc/eslint clean; server restarted; /facilities/adhoc 200; no log errors. NOT committed.

## Latest Session (2026-08-31c) — Employee schedule grid: PIVOT to classic table
- **User rejected the timeline/rail design** ("looked messy or confusing, just want a classic grid").
- **Redesigned as a clean, professional TABLE** (no timeline):
  - New `components/employee/weekly-schedule-table.tsx` (replaces & deleted
    `weekly-schedule-board.tsx`). One row per weekday (Mon–Fri), columns:
    Day | Date | Status (On/Off pill) | Pickup (time ~chip~) | chevron.
  - **Light-touch interactivity (review/explore):** hover highlights row; clicking a row
    expands ONE detail line (day,date, transport-required note, 24h time). Keyboard accessible
    (row `role=button`, Enter/Space). Single-open (only one expanded at a time).
  - Paper palette via tokens (`--card`/`--border`/`--amber` time chip/`--green` status pill).
    Space Grotesk days, IBM Plex Mono times/dates. Footer summary: "N of 5 days with
    transport · Earliest ride HH:MM PM".
  - `compact` variant for history weeks (no expand, no footer, Off chip stays).
- Page `app/employee/weekly/page.tsx` updated: latest = featured table + status badge;
  older weeks = compact table under "Previous weeks". `dayOfWeek` now passed.
- Verified: tsc + eslint clean; SSR dump (5 rows, 10:00 PM + Off chips, Earliest footer);
  route serves 200. No schema change → no server restart.

## Latest Session (2026-08-31b) — Frontend design: employee weekly schedule board
**Built (lint + tsc clean; SERVER COMPONENT page, no schema change / no restart needed):**
- Redesigned the **regular-EMPLOYEE weekly schedule view** (`app/employee/weekly/page.tsx` + new
  `components/employee/weekly-schedule-board.tsx`) as an **overnight timetable RAIL** 18:00→06:00.
- **Signature idea ("night shift as a time band"):** each weekday is a full-width lane; the day's
  arrival time is a small amber node at its REAL clock position on a shared 12h rail. Midnight sits
  exactly at 50% (a hairline dashed divider); AM/PM halves read positionally. 5 lanes = 5 rows, each
  with a left day-label + mono date and a mono pickup timestamp under each lit node.
- Interactive: nodes are buttons — hover/click grows the glow + highlights timestamp; "Not Required"
  days render a muted "–" node. Legend explains amber dot vs not-required vs midnight seam.
- **Design system honored** (manifest system): paper canvas, `--card`/`--border`/`--amber` tokens,
  Space Grotesk (font-display) day/headline + IBM Plex Mono (font-mono) times. No new fonts; reduced
  motion respected; mobile-responsive (5 rows stack; legend hides on xs).
- Page structure: latest week = featured board (larger, + status badge, "This week's pickups" header);
  older weeks = compact boards under "Previous weeks"; empty state preserved.
- **Bug caught during build critique:** HourTick used `left: pos%` but pos was a 0–1 fraction → all
  ticks crammed left. Fixed to `pos*100`. Verified via SSR dump: ticks at 0/16.7/33.3/50/66.7/83.3/100,
  nodes at 33.3%,58.3%,45.8%,87.5% on the shared rail. `overnightPosition("HH:MM")` exported pure fn
  (22:00=33%, 00:00=50%, 06:00=100%).
- Note: `CORPORATE_EMPLOYEE` self-submit grid (`components/corporate-employee/weekly-schedule-form.tsx`,
  `/corporate-employee/my-schedule`) was NOT changed — brief targeted the employee *view* grid.

## Latest Session (2026-08-31)
**Built (all done, lint + tsc clean, server restarted):**
1. **Route-learning / "skill-up" feature** (the current priority, fully implemented):
   - New Prisma model `RouteLegLearning` (migration `20260831032735_route_leg_learning`);
     unique `(fromKey, toKey, shiftKey)`, stores `sampleCount/avgMin/min/max` + labels.
   - `actions/route-learning.actions.ts`: `trainRoutePlannerFromHistory()` (dry-run shows ~95
     plans, ~74 pickup observations, ~9 leg slots) + `getRouteLearningStats()`.
   - `lib/routing/pickup-schedule.ts` rewritten: `MINUTES_PER_KM = 5`, `PICKUP_GRID_MINUTES = 5`,
     `LEARN_MIN_SAMPLES = 3`; snaps + min-gap enforced; `loadLearnedLegs(shiftKey)`; sync uses
     learned 10PM set.
   - `lib/routing/algorithms.ts`: `generate10PMRoutes` passes address keys + learned map;
     `generateCorridorRoutes` uses learned legs + 5-min grid/gap back-calc
     (throws per-group error if a route exceeds the shift window).
   - UI: "Route memory" card + **"Learn from history"** button on
     `components/facilities/auto-route-planner-client.tsx`.
   - Copy/comments 6.5 → 5 min/km in route-setting client, vehicle manager, actions, schema.
2. **Verified with temp tsx script** (deleted): both 10 PM vehicles now
   `20:40 20:50 21:00 21:05 21:10 → office 21:40` (Cha-19-9425) and
   `20:50 21:05 21:10 21:20 → office 21:45` (Cha-56-0177); corridor + late-night sim all on
   5-min grid with ≥5 min gaps.

### Work State
- **This session (2026-09-02) fully built + verified** (see Latest Session blocks 09-02 → 09-02e): Refined Inter; #70BCCC accent system;
  ad-hoc 3-hour rule (actions + both forms); AttentionBoard head removed; hero eyebrow now amber; near-white `.surface-accent` +
  `--surface` on Search/Upload/Export + all Inputs/Selects; Facilities ad-hoc band = compact h-20 ledger rows (2x2 data grid:
  address/contact/pickup/email, 10 PM pick-up required, narrow 7rem arrival column, two-row driver+time / note+save panel);   Operations
  ad-hoc table select-all; Route Planning day-sheet-only with top-right weekly export.
  **2026-09-02g**: schedule-submission email notice ("Your schedule has been submitted" → view week schedule +
  day-wise assignment) on the 3 auto-approve paths (`submitMySchedule`, `createWeeklyScheduleOnBehalf`,
  `bulkUploadWeeklySchedules`) via `sendMailBackground` + `after()`.
  Nothing committed (branch `main`, last commit `809d81c`, ~50 modified/untracked files).
- **Completed** (prior sessions): BASE ETA scheduling; firstPickupTime; pickup-time math in `lib/routing/pickup-schedule.ts`
  (5 min/km, 5-min grid, ≥5 min gap); route-learning (`RouteLegLearning`, Learn-from-history action); corridor algorithms;
  sync-after-mutation; route-map OSRM; address geocoding.
- **Not yet done — user action required:** "Learn from history" button NOT clicked yet (learned set empty in DB), and
  RUN MAPPING NOT re-run since the 5-min grid change, so existing RoutePlans still hold old 6.5-based times.

### Open threads / next steps
1. Human should click **Learn from history**, then **RUN MAPPING** on the auto route planner to see 5-min grid + learned legs live.
2. Unassigned: "Erin Employee" and "Sabrina Ferdous" have approved 10 PM schedules but no active 10 PM point.
3. Honest limit (say it when relevant): training learns from historical planned pickup gaps, not GPS clock-ins.
4. Open follow-ups from today: confirm the amber hero eyebrow + `.surface-accent` tint look right in browser;
   confirm `--teal = #70BCCC` stays; commit the ~50-file changeset once the human is happy.

## Gotchas / do-nots
- Don't run `_delete-all-addresses.ts` / `_check-homes.ts` (destructive).
- Ignore `_archived-fastapi-scaffold-2026-07-27/` and `.claude/worktrees/*` (stale dupes).
- Don't regenerate Prisma client inside a running dev server and expect it hot-reload —
  restart the server (recipe above).
- Generated visitors: existing RoutePlans pre-5-min-grid still used 6.5 min/km and no snap —
  regenerate after any rule change for consistency.
- **UI/positional fn gotcha:** when mapping a 0–1 fraction to a CSS `%`, multiply by 100
  (`${pos*100}%`) — caught this twice now (rail ticks).