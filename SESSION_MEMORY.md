# SESSION_MEMORY.md — TMP session continuity & efficiency log

Read this at the start of every task so you can continue without re-exploring.
**Always update it before the session ends** (append/rewrite the Latest Session
block and bump Work State / Next Move). Do this EVERY session — it is how we
work fast without interruption.
## Latest Session (2026-09-28) — Dhaka weather widget on every role dashboard
**User request:** weather (Dhaka temperature) widget on the top-right of EVERY role's dashboard,
standard/professional UI, minimal animation; free open-source weather API ok. Evolution: (1) full
variant chosen → (2) forecast DELETED (current-conditions only; `DhakaWeather` has no `forecast`
field) → (3) frosted-glass "app icon" design per reference image → (4) **v4 (latest): spec-driven
translucent glass, SMALLER, and moved UP — top-aligned with the "Welcome back" line**.
**Built (no schema/migration, no new deps; tsc + eslint clean; all 6 dashboards compile → 307 intact):**
- `lib/queries/weather.ts` (new, `server-only`): `getDhakaWeather()` — Open-Meteo forecast API
  (FREE, KEYLESS; lat 23.8103 lon 90.4125, tz Asia/Dhaka), current temp/feels-like/humidity/wind/
  WMO code/is_day, `fetch` with `next:{revalidate:600}` (shared ISR across all users/pages).
  `describeWeatherCode(code, isDay)` → {label, LucideIcon}. ANY failure → `null` (widget shows
  quiet "Weather unavailable" — dashboards never break).
- `components/shared/weather-widget.tsx`: **DESIGN v4 (per detailed spec)** — translucent
  frosted-glass squircle `rounded-[26px]`: alpha-gradient glass (`from-[#9cc4ec]/80 via-[#6f9fda]/75
  to-[#4d7cc4]/85`) + `backdrop-blur-md` so the page background bleeds through softly; white/50
  border + inset highlight ring (rounded to match) + top light bloom; 9 CSS droplets with realistic
  inset highlight+shadow (`inset -1px -1px 2px rgba(96,140,195,.45), inset 1px 1px 2px white .9`).
  Centered column: "Dhaka" → weather-aware pure-CSS SkyArt (clear=bare sun/moon, code 2/3 or fog=
  orb behind cloud, overcast 3/45/48=cloud only, rain 51–99=slate tint, snow 71–86=icy tint;
  container h-14 w-24) → **44px font-semibold temp** → condition → hairline footer 💧% | 🌬 km/h
  (lucide Droplets/Wind size-3.5, text-xs). **Smaller:** `lg:w-[200px]`, px-4 pb-3 pt-5; fallback
  "Weather unavailable" in same shell (min-h-36). Motion: entrance animate-in + motion-reduce:none.
- Wired into all 6 dashboards (`app/{employee,corporate-employee,fixed-arrival,operations,facilities,
  super-admin}/dashboard/page.tsx`): **layout v3 (user asked widget "slightly upper, in line of the
  welcome back line")** — widget is back in the HERO row: ONE flex row `flex flex-col gap-5 lg:flex-row
  lg:items-start lg:justify-between` = DashboardHero (`min-w-0 flex-1`) + `<WeatherWidget />`
  top-aligned with the hero top (welcome line). The primary board (AttentionBoard /
  TodaysScheduleCard) is full-width standalone BELOW, back to its original single-line call with
  no className/flex wrapper.
**Verified:** `npx tsc --noEmit` exit 0; eslint exit 0 on all 7 changed files; live server
(/employee + /fixed-arrival dashboards) → 307 auth redirect intact. NOTE — Invoke-RestMethod from
this shell to api.open-meteo.com TIMED OUT (local network) — network-only limitation; fallback is
graceful by design.
**Next:** user eyeballs v4 glass in browser; tune if asked (alpha stops, droplet array in
`GlassDroplets`, `lg:w-[200px]`, SkyArt compositions in `weather-widget.tsx`).
**v4.1 (same day, user feedback):** (1) widget was STILL stretching 100% wide at sub-lg viewports —
root cause: `w-full` + `lg:w-[200px]` breakpoint gating → now FIXED `w-[200px] shrink-0` at ALL
breakpoints (app-icon card sits under the hero on mobile too). (2) Night moon was invisible on the
blue glass (same hue) → moon orb now deeper periwinkle (#f2f7ff→#b9cdf1→#8aa7d8) + bright white halo
+ inset bottom-right shading for 3D contrast. (3) Droplets are ANIMATED: new `glass-drop-float`
keyframes in `app/globals.css` (gentle translateY -7px + scale 1.05 bob, 5.5–8.3s, per-drop inline
duration/delay so they never sync); card `overflow-hidden` keeps them rounded-up inside the box;
`prefers-reduced-motion` silences via `.glass-drop { animation: none !important }` (inline animation
needs !important). tsc + eslint clean.
**v4.2 (same day, user feedback):** (1) bubbles weren't visibly animating → base animation moved
into CSS class `.glass-drop { animation: glass-drop-float 7s ease-in-out infinite }` (globals.css),
inline now only sets per-drop `animationDuration` (5.5/6.9/8.3s) + `animationDelay` (i*0.8s);
keyframes beefed up to `translate(-2px,-12px) scale(1.08)` so the bob+sway is clearly visible; still
reduced-motion guarded. (2) hero+widget row used `lg:flex-row` → at user's viewport (<1024) hero
stacked; row is now `sm:flex-row sm:items-start sm:justify-between` in all 6 dashboards so hero +
200px widget share one line from 640px up; hero keeps `min-w-0 flex-1` (auto-reduced width).
(3) night moon STILL blended (periwinkle ≈ glass hue) → moon is now warm IVORY/CREAM
(#fffdf4→#f3eec9→#d8d0a2, white halo + warm inset shading) — different hue family from the blue
glass entirely; glass itself deepened (`#8ab9e6/#6493d0/#4573b8`) so the white cloud + sun also pop
stronger. tsc exit 0, eslint exit 0, /operations/dashboard → 307.
**v4.3 (same day, user feedback):** (1) LAYOUT V4 — hero went back to FULL width (standalone
`<DashboardHero />`, no wrapper), and the widget now shares a row with the PRIMARY BOARD:
`<div className="flex flex-col gap-5 sm:flex-row sm:items-start"><Board className="min-w-0 flex-1"/><WeatherWidget /></div>`
in all 6 dashboards (board = TodaysScheduleCard in employee/corporate/fixed-arrival, AttentionBoard
in operations/facilities/super-admin — both components take className). (2) SkyArt is now
day/night aware via `const night = !isDay`: cloud base pill + both puffs use warm-white
by day and muted dusk-blue by night (with rainy/overcast/snowy per-time tints); sun = warm yellow,
moon = cream ivory. (3) Bubbles much more visible: 9 drops, sizes 9–22px, opacity 0.7–0.9, white
`border border-white/50`, stronger radial fill + inset/outer shadows, spread over the FULL box
(6–83% top, left edges only ≤10% / ≥84% so text stays clear), faster rhythm 4.2–6.6s; geometry
checked so every drop + its -12px/-2px/1.08-scale bob stays fully inside the rounded card. tsc 0,
eslint 0, /facilities/dashboard → 307.
**v4.4 (2026-09-28, user feedback):** (1) LAYOUT V5 (final) — user wanted the widget top-aligned
with the "Welcome back" line AND neither hero nor board full width → all 6 dashboards now use a
2-column GRID: `<div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">` with
hero + board stacked in col 1, and `<WeatherWidget className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start" />`
in col 2 spanning both rows, top-aligned with the hero (widget starts beside the welcome line and
sits next to BOTH hero and board). Mobile stacks hero → widget → board. (2) Bubbles back to SMALL
sizes 6–11px (kept visibility: opacity 0.7–0.85, border-white/50, radial fill + medium shadows).
(3) NEW ROAM ANIMATION — user: "bubbles were just rounding in one place; I want them roaming over
the full box, and when a bubble touches the border it goes back inside." Replaced
`glass-drop-float` with `glass-drop-roam` keyframes (globals.css): 4-point path per drop —
drift to one border (25%, translate(--rx, --ry*-1)), rebound inward (50%), glide to the far
border (75%, flipped/sign-swapped), return home (100%) — with slight scale(1.06) at the
border-touch points. Each drop sets inline CSS vars `--rx`/`--ry` (24–52px vectors, mixed signs
for variety) + duration 9–13.8s + delay i*1.1s; style object cast `as CSSProperties` for the
custom props (new `import type { CSSProperties } from "react"`). Drop start positions moved to a
mid-band (top 14–78%, left 10–84%) so the roam vectors sweep the whole pane; overflow-hidden keeps
drops rounded/inside even at borders. **v4.4b:** user asked for slightly slower roam → per-drop
durations bumped 9–13.8s → **11–17s** (`11 + (i%4)*2`, weather-widget.tsx), CSS base 14s; then
user asked for only **5 bubbles** (was 9) → kept 5 well-spread drops (top-left 16%/14%,
top-right 70%/22%, mid-right 58%/46%, mid-left 20%/55%, bottom 34%/78%) with mixed rx/ry signs.
**v4.4c:** widget shrunk ~10%: width 200→**180px** (`w-[180px]`, radius 26→24 on shell + sheen
ring), temp 44→**38px**, condition 13→12px, SkyArt mt-3 h-14 w-24 → mt-2 **h-12 w-20** (sun
size-14→12, tucked orb size-11→9 right-0.5, cloud pill h-6→5, puffs size-9/11→8/10 at bottom-2
left-1 / bottom-1.5 left-6), body padding px-4 pb-3 pt-5 → px-3.5 pb-2.5 pt-4, footer mt/pt
3.5/2.5 → 3/2; card height ~230→~205px. All 6 dashboard grids col2 200px → **180px**
(`sm:grid-cols-[minmax(0,1fr)_180px]`). Bubble 1 rx 52→32 so its left-border bounce stays inside
the narrower card (checked all 5 drops against 180×205 box). tsc 0, eslint 0 (7 files).
**v4.4d (2026-09-28, user gave exact dims): widget is now FIXED 160×185** — shell
`h-[185px] w-[160px] rounded-[20px]` (+ sheen ring 20px); body + placeholder both `h-[185px]`;
temp 38→**34px**, condition 12px leading-tight; SkyArt mt-1.5 **h-10 w-[72px]** (clear sun
size-10, tucked orb size-8, cloud pill h-4, puffs size-7 @ bottom-1.5 left-1 / size-9 @ bottom-1
left-5); body padding px-3 pb-2 pt-3.5; footer mt-2.5 pt-1.5 gap-2 (fits 160: ~125px of 136
available). All 6 dashboard grids col2 → **160px**. Bubble roam re-verified against 160×185 —
all 5 drops stay round/inside (d1 touches top at ry=26, d1 75% clip ≈1px, everything else ≤150px
right / ≤173px bottom). Content stack ≈175px, so ~10px slack under the footer. tsc 0, eslint 0.
## Latest Session (2026-09-21f) — removed the 5 min/km pickup-time fallback → pickup times are TRAINED-DATA ONLY
## Latest Session (2026-09-21f) — removed the 5 min/km pickup-time fallback → pickup times are TRAINED-DATA ONLY
**User request:** "have i provided any rule 5 min/km? please delete this rule i provide. Pick-up time depend only
from finalize data and tech from manual plan."
**Answer:** NO user rule existed — the 5 min/km was a HARDCODED estimate: `export const MINUTES_PER_KM = 5`
(`lib/routing/pickup-schedule.ts`) + a duplicate `legDriveMinutes` (km×5) in `actions/route-override.actions.ts`,
plus corridor routes falling back to raw OSRM durations in `lib/routing/algorithms.ts`. Clarified via question tool;
user chose **"Finalize route pick-up time and trained legs"** → strict mode: pickup times come ONLY from
`RouteLegLearning` (>= `LEARN_MIN_SAMPLES` = 3 observations, mined from FINALIZED routes + "Teach from manual
plan"). Untrained legs now ERROR, never estimated.
**Changed (all `tsc --noEmit` + eslint clean; schema NOT touched — comments only; no migrate/restart needed):**
- `lib/routing/pickup-schedule.ts`: deleted `MINUTES_PER_KM` + `haversineDistance` import. `driveLegMinutes` now
  returns `number | null` (null when the leg key is unknown or < LEARN_MIN_SAMPLES). `computePickupSchedule`
  validates EVERY leg (consecutive pairs + last→office) up front and returns an error listing missing pairs
  ("No finalized/taught drive time yet for: A → B, … — the 5 min/km estimate was removed"). `ensurePickupPointSchedule`
  fast path skips to recompute when the last→office leg is null. Header doc rewritten (drive rule = trained-data rule;
  the 5-minute GRID in `schedule-math.ts` is a separate concept and was KEPT).
- `actions/route-override.actions.ts` `legDriveMinutes` → trained-only `number | null`; `buildRetimeUpdates` now
  errors naming missing legs (labels from `pickupPoint.name` / `addr:<id>` keys) instead of estimating.
- `lib/routing/algorithms.ts` generateCorridorRoutes: `legMin` returns null for untrained legs; a route with any
  untrained leg throws a labeled error → caught by the existing per-route try/catch → that ONE route errors, others
  proceed (partial-route rollback preserved). `dMin` still used for grouping/`toOfficeMin` — untouched.
- Copy/docs updated (historical references remain only as "was removed" notes): `pickup-schedule.ts`,
  `route-override.actions.ts` (:544-548, :882), `route-learning.actions.ts` (:17-19, notes :384-385),
  `route-generation.actions.ts` (:38-39, :193-194), `manual-route-plan.actions.ts` (:26-28),
  `lib/routing/manual-plan-training.ts` (:10), `pickup-point.actions.ts` (:101-102), `route-setting.actions.ts`
  `autoCalcPickupTimes` doc (:430-437), `prisma/schema.prisma` comments (firstPickupTime :417-420,
  RouteLegLearning :619-623), `auto-route-planner-client.tsx` (:382-389, learning-failure banners :489-494/:572-577),
  `route-memory-diagnostics.tsx` badge → "Untrained — finalize / teach more days" (:146),
  `vehicle-pickup-points-manager.tsx` (:396-399). Ignore the `lib/generated/prisma/internal/class.ts` inline-schema
  copy (generated artifact — still shows old comment; regenerates on `prisma generate`; harmless).
**Behavior now:** any pickup-time computation (preset point schedules, corridor routes, drag re-time) errors with the
missing leg(s) named when the leg was never finalized/taught. User must FINALIZE routes or teach from a manual plan
to build the gap memory. **IMPORTANT for the pending test:** week 2026-08-10 is WIPED (0 submissions / 0 routes) and
all of its route plans were deleted — so `trainRoutePlannerFromHistory` will have NO finalized plans to mine for that
week's legs → expect per-route "no finalized/taught drive time" errors until the user finalizes (or teaches) the
mapped routes. The 10 PM preset paths still work if `RouteLegLearning` 10 PM returns are bridged keys.
**Not committed** (per AGENTS, commit only on request).
**Follow-up (2026-09-21g) — 11 PM max riders 4 → 6:** user asked to raise the 11 PM per-vehicle rider cap from 4 to 6.
Root cause was a hardcoded shared-ride cap `DYNAMIC_GROUP_CAPACITY = 4` in `lib/routing/algorithms.ts` (enforced by
`capacityFor` → `min(vehicle.capacity, cap)` in `planCorridorRoutes`, so 4-seaters stay at 4 seats; 10-seaters fill
to the cap). **Fixed:** raised to `6` and exported; the drag-to-another-vehicle seat guard in
`actions/route-override.actions.ts` `moveTrip` had a SEPARATELY hardcoded `Math.min(4, …)` for dynamic routes → now
imports `DYNAMIC_GROUP_CAPACITY` so both can't drift. Doc comment on `generate11PMRoutes` updated ("max 6 per
vehicle"). Note: the CAP is shared with 12 AM-6 AM routes (same corridor generator — "same corridor clustering");
physical `vehicle.capacity` still bounds 4-seaters. `tsc` + eslint clean.
**Follow-up (2026-09-21h) — FINALIZE-DATA-FIRST pickup timing (corridor/11PM-12AM):** after the trained-only rule (21f), mapping a fresh/untrained week surfaced per-route "no finalized/taught drive time yet for A → B" errors, and the user set a priority rule: **finalized pickup times replay FIRST on the next RUN MAPPING; trained legs only fill NEW riders.** Root gap: the corridor generators replayed learned ORDER from `RouteTemplate` via `patternOrderForMembers` but RECOMPUTED pickup times from `backCalculatePickupMinutes(arrival, trainedLegs)` — ignoring `RouteTemplateStop.pickupTime` (finalize DOES persist it via `learnRouteTemplateFromAssignments` in `finalizeRoutePlan`). **Fixed in `lib/routing/algorithms.ts` `generateCorridorRoutes`:** template loaded with `pickupTime`; `finalizedMinutes` (employeeId → minutes) built; after replay, riders with a finalized time form a contiguous PREFIX replayed verbatim (no trained legs needed); NEW tail riders are back-calculated from the arrival along TAIL-ONLY trained legs (`anchor→t1→…→tN→office`; derived[0] = anchor ignored, tail pickups = derived.slice(1); first tail pickup clamped to ≥ lastFinalized + PICKUP_GRID_MINUTES). Untrained tail legs error ONLY those legs ("…the riders before these are replayed from the finalized route; new riders need trained gaps…"). Fully-finalized routes skip training entirely → reported 11 PM errors vanish for any vehicle+shift finalized once. `departureMinutes` = first pickup minutes in finalize-only mode (no lead leg to compute). New imports: `timeStringToMinutes` (utils), `PICKUP_GRID_MINUTES` (schedule-math re-export). 10 PM preset routes use pickup-point schedule times (routeSetting) — unaffected. `tsc` + eslint clean. Test week 2026-08-10 has 0 finalizes → 0 templates → still errors until one route per vehicle+shift is finalized (or taught from manual plan); live weeks 09-21/09-28 already finalized → replay cleanly.
**Follow-up (2026-09-21i) — another free test week = 2026-08-17 wiped:** user asked for a second empty/clean week for testing after 2026-08-10 became populated (probe: 2026-08-10 now 121 subs / 106 plans / 85 finalized — the Regnum→Sayful error week). Offered future free weeks (2026-10-05/12, already 0/0 — no wipe needed) vs wiping a past week; user chose **wipe 2026-08-17** (was 3 subs / 0 routes). **Wiped in one tx** via temp `_wipe-week-2026-08-17.ts` (deleted): window `FROM=2026-08-16T18:00Z`..`TO=2026-08-18T00:00Z` (the Sunday-18:00 shifted + Monday-midnight dual key) → 3 `weeklySchedule` rows (Hemel/Erin at 08-17T00:00Z, Carla at 08-16T18:00Z) + days; `routePlan.deleteMany` 0 rows; `VehicleShiftAssignment` pins kept. Verified 0/0 after. Temp scripts deleted. **Week 2026-08-17 is now 0 subs / 0 route plans** and selectable in the bulk-upload dropdown (RECENT_UPLOAD_WEEKS covers it). Other near-empty weeks remain: 07-27 (10 subs), 08-03 (12), 07-13/07-12 bucket cleared previously.
## Latest Session (2026-09-21c) — cleared weekly submissions + test-week wipe for full bulk upload / auto-planner test
**User request:** (1) remove the **3 weekly submissions for "13–17 July"** so a full schedule could be bulk-uploaded;
(2) then, for auto-route-planner test basis, wipe an entire week to **0 submissions + 0 route plans** → answered
question tool: week **2026-08-10**, and **"Yes — wipe routes too"**.
**Root cause / gotcha — DUAL WEEK-KEY CONVENTIONS (timezone-shifted stored stamps):** the seeds store submission
weeks with a MIX of keys: Monday-midnight (`YYYY-MM-DD` T00:00:00Z) AND *Sunday-key shifted* rows where
`weekStartDate` is `Sun 18:00:00Z` (= Mon 00:00 Asia/Dhaka) — e.g. the "13–17 Jul" submissions live at
**2026-07-12T00:00Z**, and the "week of 10 Aug" has 12 subs at 2026-08-10T00:00Z **plus** `Oscar Operations`
(operations@example.com) at `2026-08-09T18:00:00.000Z` (days 08-09..08-13). RoutePlan keys are ONLY
Monday-midnight. Exact-equality `where weekStartDate =` finds 0 → must use a time WINDOW (gte/lt) and/or probe
exact stored stamps first. Next week rows are at 08-16T18:00Z (Carla) + 08-17T00:00Z (Hemel, Erin) — kept.
**CASCADE reminder (relearned):** `WeeklyScheduleDay.weeklySchedule` has NO onDelete Cascade → always delete
`weeklyScheduleDay` rows before `weeklySchedule`. `RoutePlan` deletion DOES cascade `TripAssignment` +
`RoutePlanOverride`; reuse-chain `previousRoutePlanId` is SetNull by schema.
**Done:** week 2026-07-12 (13–17 Jul bucket): 15 day-rows + 3 submissions deleted. Week 2026-08-10:
**65 schedule-days + 13 submissions + 40 route plans** (status DRAFT, day span 08-10..08-14) deleted in one
`$transaction`. `VehicleShiftAssignment` vehicle pins for that week **kept** (planner needs them to map vehicles).
Verified: re-probe shows only the 3 next-week rows (Carla/Hemel/Erin) left in the 08-08..08-17 window; route-plan
grouping no longer lists 2026-08-10. Temp scripts (`_clear-week-2026-07-13.ts`, `_wipe-week-2026-08-10.ts`,
`_probe-aug.ts`, `_count-routes-by-week.ts`, `_list-weeks.ts`) all deleted. No schema change → no server restart
needed. User flow after this: Operations weekly-requests → bulk upload full schedule for week 2026-08-10 → run
auto route planner to regenerate 0 routes.
**Follow-up (2026-09-21d) — wiped week missing from bulk-upload dropdown:** after the wipe, week 2026-08-10
vanished from the upload dialog. Root cause: `app/operations/weekly-requests/page.tsx` built `uploadWeekOptions`
purely from `weeklySchedule` distinct weeks (+ current submission-window fallback = Mon 28 Sep), so a week with 0
submissions is unreachable — yet the bulk action only needs the canonical UTC-midnight Monday value. **Fixed:**
upload options now start from a rolling set of the last **12 recent Mondays** (newest → oldest, `(current)` marker
on the current window week) then merge submission weeks via a dedupe Map — a cleaned/backfill week stays selectable.
`RECENT_UPLOAD_WEEKS = 12` constant at top of the page. `tsc --noEmit` + eslint clean. This lets the user pick
"10 Aug – 14 Aug" in the upload dialog again without re-seeding data.
**Follow-up (2026-09-21e) — "Vehicle has no pickup points." toast on capacity edit:** changing a vehicle's Capacity in
Route Setting (EditVehicleForm → `updateVehicle`) toasts that error and aborts the save. Root cause:
`actions/route-setting.actions.ts` `updateVehicle` called `syncPickupPointTimes(input.id)` UNCONDITIONALLY after every
edit; that sync → `computePickupSchedule` hard-fails with the exact string when the vehicle has 0 active pickup points
(dynamic 11 PM vehicles pick up from home addresses). **Fixed:** sync now runs ONLY when `input.baseETA` or
`input.firstPickupTime` changed (the only fields the schedule is anchored on); other edits return success with
`pickupUpdates: undefined`. `pickupUpdates` (ETA refresh) still returned for schedule edits. `tsc` + eslint clean.
## Latest Session (2026-09-21b) — adjust-route button never opened + map pickup numbering gaps (data-level fix)
**User request:** "add adjust route feature in map route. I will able to adjust the route if i needed by dragging.
Also i mentioned that where pick-up point is started sequence count (like 1,2,3) will be started there." Asked two
clarifying questions → user picked: (1) **"Fix Adjust-route button"**, (2) **"On the map markers"** numbering.
**Root causes found:**
1. **Adjust-route button dead in the NEW route-breakdown UI**: `VehicleGroupTable.tsx` `beginAdjust` — when a route
   had NO cached route analysis it ran `analyzeRoutePlan` → `onChanged()` → `return` WITHOUT `setAdjustMode(true)`,
   so the mode never opened (button "did nothing").
2. **Map marker numbering "doesn't start at 1 / skips"**: map badges are position-based (`route-map.tsx:770`,
   `idx + 1` over `validOrdered`) so they're ALWAYS contiguous 1..n — good. But the STORED sequence
   (`TripAssignment.sequenceInTrip`, what feeds order/sort/headings and the old planner card's "Stop N" label) was
   broken in the seeded TEST week **2026-08-24**: 11/45 plans started at 2 or had gaps (1→4, 1→3). Repair scripts
   #1-#4 had fixed only the live week 2026-09-21 (0/125 flagged). Verified with a temp diagnostic
   (`_check-map-numbering.ts`, deleted after) that lists every plan's seq + coords and flags start≠1 / gaps /
   missing-coords.
**Fixed:**
- `components/facilities/route-breakdown/VehicleGroupTable.tsx` `beginAdjust`: enters adjust mode FIRST, analyzes
  on demand in the background if no cached analysis, and on analyze failure exits the mode with an inline error.
  ShiftBlock is keyed by route id, so `adjustMode` survives the refresh — clicking "Adjust route" now ALWAYS opens
  the draggable via-point adjust mode.
- **Data repair**: new `_repair5-contiguous-sequence.ts` (preview default, `--apply` to commit) renumbers every
  plan of week **2026-08-24** contiguously 1..n in its current stored order (never touching pickup times or drive
  order; EXECUTED skipped; audited via `RoutePlanOverride` `SEQUENCE_CONTIGUOUS_FIX`). Applied: 11 plans / 21 trips
  → re-run diagnostic now flags 0/45 for that week.
- `components/facilities/auto-route-planner-client.tsx`: old planner CARD's mobile list "Stop {trip.sequenceInTrip}"
  → positional "Stop {rowIndex + 1}" so it can never display stored gaps again.
**Verified:** `npx tsc --noEmit` clean; eslint clean on touched files (one PRE-EXISTING warning:
`GeneratedRouteCard` unused in auto-route-planner-client.tsx. NOT committed). Server NOT yet restarted (clean .next
restart pending — only component + data changes, no prisma schema).
**Notable:** map badge numbering was ALREADY position-based "always 1..n over mapped stops" (2026-09-20b fix); the
visible "starts at wrong stop / skips" on the test week came from the broken stored sequences the map order/headings
ran on. `_repair5` fixes the root (data) so table map headings/popups all line up; future weeks should self-heal via
existing repairs.
## Latest Session (2026-09-21a) — app SLOW/buffering: client-side search + Neon keep-alive + perf hardening
**User report:** "the application got slowed and buffering. When I search or do anything it takes long to
complete." next-dev.log confirmed: `/facilities/user-info?q=t` 12s, `q=ta` 11s, `q=taz` 12s, `q=tazru` 54s,
`q=tazruna` 57s, plus 60-103s cold page loads.
**Diagnosis (timed diag scripts, deleted after):** tables are TINY (279 users / 307 addresses / 1184 trips) yet a
`findMany`+includes took 20-34s and a trivial `session.findUnique` ~0.6s — so slowness is the Neon free-tier
connection, NOT query cost. Two mechanisms: (a) compute **auto-suspends after ~5 min idle**, the wake-up stalls the
next request 30-100s; (b) the pooler WebSocket has high RTT from Dhaka (~600ms) and stale sockets cause ~30-60s
timeouts + 1 retry before the pool reconnects.
**Built (4 fixes):**
1. **Client-side search for /facilities/user-info** (the user's #1 symptom): new
   `components/facilities/user-info-table.tsx` ("use client") receives the full directory as a prop and filters
   in-memory (`useDeferredValue`, same 7 fields getEmployeeDirectory matched). Page now fetches ONCE
   (`getEmployeeDirectory()` no q) — every keystroke previously triggered a full RSC round trip + DB query.
   Header/export now live in the client table; ExportUsersButton exports the currently-filtered rows.
2. **Neon keep-alive** in `lib/prisma.ts` (startDevKeepAlive, dev-only): `SELECT 1` every 60s + immediate ping,
   global-flag-guarded against HMR duplicates, `timer.unref()`. Kills the 60-103s cold-wake stalls. NOTE: do NOT
   put prisma imports in `instrumentation.ts` — Next bundles it for Edge too and `node:` imports fail the build.
3. **Memoized `getSession`** with React `cache()` (lib/auth/session.ts): layout + page each call requireRole →
   2 identical session DB lookups per request collapsed to 1.
4. **Harden getSession's session lookup** with `withDbRetry` — it was the last unguarded read in the page path,
   still emitting `[object ErrorEvent]` 500s (digest `1316144259@E394`) on blips. Directory query was already
   wrapped in 2026-09-20k.
**Result:** authenticated /facilities/user-info went 49-103s → stable 200 in ~3.5-6.5s (application-code 3.5-6s
remains = Neon pooler RTT, infra-level). Search is instant (client-side). No more ErrorEvent 500s.
**Verified:** `npx tsc --noEmit` clean; eslint clean on all touched files. Server restarted (clean .next). NOT committed.
**Note for user:** remaining ~3s/page baseline is Neon WebSocket latency; an always-on Neon compute (no auto-suspend)
or better network would cut it further.
## Latest Session (2026-09-20k) — user-info page + edit-profile action: Neon ErrorEvent hardening (20e pattern)
**User report:** bare "Runtime Error — Server ErrorEvent" overlay on `/facilities/user-info` (dev overlay stack landed
on `EditEmployeeProfileDialog` at app/facilities/user-info/page.tsx:137, digest `13…@E394`). Dev log: repeated
`? Error: [object ErrorEvent]` on page GETs + `POST /facilities/user-info?q=… 500` on
`updateEmployeeProfileByFacilitiesAction` (11 s) — same opaque Neon serverless-websocket `ErrorEvent` class as the
2026-09-20e dashboard blip, but on UNGUARDED calls.
**Root cause:** `getEmployeeDirectory` (lib/queries/users.ts) and `updateEmployeeProfileByFacilitiesAction`
(actions/facilities-profile.actions.ts) ran Prisma directly with no retry / error normalization → a transient Neon
wake-up/blip threw an `ErrorEvent` (no `.message`) that stringified as `[object ErrorEvent]` in the RSC flight
stream / dev overlay. Layout + dashboard were already wrapped in 20e; User Info was missed.
**Built (mirrors 20e):**
- `lib/queries/users.ts`: `getEmployeeDirectory`'s `findMany` wrapped in `withDbRetry("employee directory", …)`
  (one retry absorbs the blip).
- `actions/facilities-profile.actions.ts`: the whole DB section of `updateEmployeeProfileByFacilitiesAction`
  (employee lookup → FIXED_ARRIVAL guards → code-collision check → address upserts → user.update) now sits in a
  try/catch that returns a friendly `{ error: "Could not save the profile: <msg> — please try again." }` using
  `dbErrorMessage` — no more 500 `[object ErrorEvent]`, the dialog shows the message instead.
**Verified:** `npx tsc --noEmit` clean; eslint clean on both touched files. Hot-reload only. NOT committed.
**Next:** super-admin + operations/employee layouts/pages still run the unguarded pattern — wrap with
`withDbRetry` the same way if they hit the same blip.
## Latest Session (2026-09-20j) — drag/move pickup-sequence correctness + instant preview + exact drop position
**User report:** "Pick-up sequence of vehicle and dragging/moving feature are not perfectly worked. Please work
on it for perfect, correct and smooth transition."
**What was actually broken** (investigation before edits):
1. **Same-shift drag was preview-only** — `handleDragEnd` did NOT call `reorderRouteTrips` (only `setPreviewOrder`),
   so rows reordered while dragging and then ALWAYS snapped back to the original server order ("dragging not
   worked properly").
2. **Preview waited on OSRM** — `useDragPreview.setPreviewOrder` set state only AFTER the (debounced) geometry
   fetch resolved, so during the drag the rows stayed put and jumped late (not smooth).
3. **Preset reorder previews then snaps back** — dropping a rider across a pickup POINT passed the client preview
   but the server `reorderRouteTrips` (or `resolvePresetSequence`) rejected it → snap-back + toast; felt broken.
4. **Drop position if any** — server `moveTripToRoute` appended corridor/dynamic riders at the END; a drop onto a
   mid-row showed no positional meaning (empty table drop zone is `vehicle-<id>` → route shift's append).
**Fixes:**
1. **Same-shift drag now PERSISTS** (`route-breakdown/index.tsx` handleDragEnd): `orderWithMove` → preset gate →
   `handleReorder(routeId, orderedTripIds)` (which calls server `reorderRouteTrips` then `refreshSingle` in-place).
2. **Instant preview** (`useDragPreview.ts`): `setPreviewOrder` now writes `{ orderedTripIds, geometry: null }`
   synchronously (rows move the second the pointer enters) and hydrates the OSRM polyline via 150 ms debounce in
   the background; new `latestOrderRef` per route guarantees a slow geometry response never overwrites a newer drag
   position (`endDrag` also clears it).
3. **Preset point-order gate (client)**: new exported `presetOrderValid(route, orderedTripIds)` — computes each
   rider's point index from the route's current (validated) order and requires the candidate order's point
   sequence to be non-decreasing (riders may regroup within a point, never cross a point). Used in BOTH
   `handleDragOver` (invalid placements never preview) and `handleDragEnd` (clear destructive toast: "Preset
   route: stop order follows Route Setting sequence — change it there, or move the rider to a home-address
   vehicle"). Mirrors the server guard, so no more preview → snap-back.
4. **Exact drop position for cross-vehicle moves**: `moveTripToRoute(taId, routeId, options?: { insertBeforeTripId })`
   now splices the rider before the row you dropped onto (non-preset targets); preset targets still use the
   Route Setting point index. `useDragActions.handleMove` signature → `(tripId, targetRouteId, isPinnedNotMapped,
   options?: { insertBeforeTripId?: string; targetVehicleId?: string })` (`MoveOptions` interface at module scope);
   `moveTripToUnusedVehicle` call and the `vehicle-<id>` unused-card branch pass `targetVehicleId` in opts;
   cross-route row drops pass `{ insertBeforeTripId: targetTripId }`.
5. **Smooth rows**: ShiftRow `<tr>` got `animate-in fade-in duration-200` (tw-animate-css already a dep) — rows
   fade softly only when they actually remount (keys stable through drag/preview re-renders, so no flicker on
   hover).
**Verified:** `npx tsc --noEmit` clean; eslint 0 errors (pre-existing warning `onRouteSelect` index.tsx:46 only).
Hot-reload only. No schema. NOT committed. route-breakdown/ is still an untracked dir (?? in git status).
**Manual check for user:** drag a row within a shift → row order sticks after release; drag across vehicles →
rider lands at the exact drop row; preset-vehicle riders can regroup within their point but a cross-point drop
shows the toast instead of a snap-back.
**Snap-back root cause (found after user retest) — SELF-COLLISION at drop:** during a same-shift drag the live
preview re-seats the dragged row AT the drop spot, so dnd-kit `closestCenter` often reports the dragged row
itself as `over` on release (`over.id === "trip-<source>"`). `handleDragEnd` treated that as "no move"
(`targetTripId === tripId → return`), so the preview cleared and rows reverted to the original order — i.e.
"drag to my needed place, it comes back." Fix in `route-breakdown/index.tsx handleDragEnd`: when the release
hits the dragged row itself, commit the CURRENT previewed order (`getPreview(sourceRoute.id).orderedTripIds`,
preset-gated); added the same commit when `over === null` (released in a row gap) IF a preview exists + passes
`presetOrderValid`. `getPreview` added to handleDragEnd deps. Verified tsc + eslint clean.
**"Map container is being reused by another instance" runtime error overlay (after drag reorder):** once the drag
actually commits now, the reorder patch re-renders `ShiftMapSection` and react-leaflet v5 re-initializes its
`MapContainer` over the SAME DOM div → Leaflet throws "Map container is being reused by another instance", which
React 19 dev StrictMode (double-invoked passive effects) surfaces as a red `Error: [object ErrorEvent]` overlay
(seen in next-dev.log with digest `1316144259@E394`). Fix (`route-map.tsx` + `VehicleGroupTable.tsx`): new
`containerKey?: string` prop keys the Leaflet wrapper div by the route's **committed** trip order
(`shift.trips.map(t => t.id).join(",")`, passed in `ShiftMapSection`). The key changes ONLY when a reorder/move
saves → React cleanly unmounts the old map (Leaflet `.remove()`) and mounts a brand-new container — no reuse.
Drag-hover previews (previewOrder) never change the key, so the map does NOT remount while dragging. react-leaflet
5.0.0 is latest (no npm bump available). Hot-reload only; tsc + eslint clean (pre-existing `onRouteSelect` warning
only).
**"still not worked" — the REAL blocker was the PRESET_10PM point-sequence gate.** Drags were reaching the server
(the dev log was full of `reorderRouteTrips` calls), but on preset routes a cross-pickup-point drop was REJECTED
server-side AND blocked client-side (presetOrderValid gate + toast + snap-back) — so every drag across points
"came back to its previous place" with no obvious cause. **Now a manual reorder is honored as an override on ALL
route types** (`actions/route-override.actions.ts reorderRouteTrips`): same-point shuffles keep each point's
canonical baseETA time; a cross-point drag switches that route's re-time to the LEG-BASED branch of
`buildRetimeUpdates` so the Pickup Time column stays monotonic along the new order. The old strict
non-decreasing PRESET reject was removed; impossible orders (can't reach office by arrival) are still rejected by
the window check. Client: removed `presetOrderValid` + gates from `handleDragOver`/`handleDragEnd`/gap-drop;
deleted the helper + `distinctPointLabels` + the then-unused `GeneratedRouteDetail` type import in
`useDragPreview.ts`. **Reminder for user check:** dragging is disabled by design once a route is finalized
ShiftBlock `isEditable`; test on DRAFT/UNDER_REVIEW days. tsc + eslint clean.
## Latest Session (2026-09-20i) — faster finalize + pickup-time save + Finalize button animation
**User report:** "pick-up time saving and Finalize save take long time — make faster"; "add animation when
click Finalize button."
**Why saves were slow (`actions/route-override.actions.ts`):** after the primary write, BOTH actions awaited
the expensive consistency jobs inline — `learnRouteTemplateFromAssignments` + `mirrorRouteEditsAcrossWeek`
(finalize) and `mirrorRouteEditsAcrossWeek` (pickup time, which runs N parallel per-day transactions of
~42 writes on 10 PM routes). The visible save button / toast only resolved after all of that.
**Fixes:**
1. **Both heavy jobs now run in `after(...)` (background, post-response)** — the route status/trip write
   commits, the action returns instantly, the toast pops, the row/card patches in place (`refreshSingle`);
   learning + week-mirroring continue server-side right after (each wrapped in try/catch, error-logged,
   best-effort — same pattern the existing email `after()` used). Mirrored days show the latest state on
   their next load.
2. **Finalize button animation (`VehicleGroupTable.tsx` ShiftBlock):** click → `Loader2` spinner +
   "Finalizing…" (disabled); on success → button flips to green `Finalized` with a `finalize-pop` scale
   pop on the check icon (new `@keyframes finalize-pop` in `app/globals.css`), reverts after 2 s (button
   stays mounted through the status flip via `canFinalize || finalizing || justFinalized`). `onFinalize`
   is now typed `(routeId) => Promise<boolean>`; `useDragActions.handleFinalize` returns `true/false`.
**Verified:** `npx tsc --noEmit` clean; eslint 0 errors (pre-existing warning only: unused `onRouteSelect`
route-breakdown/index.tsx:46; globals.css "no matching config" = eslint has no css config, expected).
Hot-reload only. No schema. NOT committed.
## Latest Session (2026-09-20h) — arrival column moved to rightmost + NO page refresh after finalize/drag/time
**User reports:** (1) "i want arrival time column at right side of the table"; (2) "the dragging row not
worked properly" (previous turn: "when i clicked finalized, action not worked, also page refresh — i want
instantly save without page refreshing").
**Two fixes (`route-breakdown/` + parent):**
1. **Arrival column is now the RIGHTMOST column** of every shift table (was leftmost). thead order is now
   grip | Employee | Pickup Location | Pickup Time | status | **Arrival**; the merged `rowSpan={trips.length}`
   cell lives as the LAST cell of the first row in `ShiftRow` and stays black-chip / white text / right-aligned.
2. **Killed the full-page skeleton refresh.** ROOT CAUSE of "finalize not worked / page refresh / drag not
   worked": every successful action (`handleReorder`/`handleMove`/`handleAdjustTime`/`handleFinalize`) called
   `onChanged()` = `refreshDetails(weekStart)` which set `detailLoading(true)` → the ENTIRE RouteBreakdown
   unmounted into pulsing skeletons and re-fetched the whole week. Now:
   - `useDragActions` adds `refreshSingle(routeId)` = `getRoutePlanDetail(routePlanId)` (lightweight
     single-route fetch) then `onRouteUpdated(updated)` → the card patches IN PLACE with zero reload.
     Used by: **finalize**, **reorder**, **pickup-time edit** (routeId read from `res.assignment.routePlan.id`,
     falls back to full refresh if missing). Cross-vehicle `handleMove` keeps full `onChanged()` but now that
     is wired to a SILENT refresh.
   - `RouteBreakdown` accepts `onChanged` (silent refresh = `loadDetails`, NO `detailLoading` skeleton) and
     `onRouteUpdated` (in-place patch). Manual "Refresh Routes" button keeps the visible reload.
   - Parent `auto-route-planner-client.tsx`: new `patchRouteInDay(updated)` replaces the route by id in
     `routesDetail`; passed as `onRouteUpdated`, plus `onChanged={() => void loadDetails(weekStart)}`.
   Net effect: Finalize flips the card to FINALIZED instantly (emails sent server-side), row drags reorder in
   place, time edits update the row — no flash, no reload. This was the same pattern the legacy
   `GeneratedRouteCard` used (SESSION_MEMORY 2026-09-14) but the route-breakdown rewrite had forgotten it.
**Verified:** `npx tsc --noEmit` clean; eslint 0 errors (2 PRE-EXISTING warnings only: unused
`GeneratedRouteCard` auto-route-planner-client.tsx:908, unused `onRouteSelect` route-breakdown/index.tsx:46).
Hot-reload only. NOT committed.
## Latest Session (2026-09-20g) — merged Arrival column per vehicle/shift + pick-up time typing fix
**User clarified (final spec):** "i want arrival time column for every vehicle — however many rows
a vehicle's list has, merge them and in the middle visualize its arrival time." So arrival must be a
TABLE COLUMN, merged (rowSpan) across each vehicle's/shift's rider rows, shown once centered.
**Built (`route-breakdown/`):**
- **`VehicleGroupTable.tsx`** — each shift table now opens with an **Arrival header + a merged
  `rowSpan={trips.length}` cell** rendered on the first row (`ShiftRow` new prop `arrivalRowSpan`),
  `text-center align-middle` so the arrival (`10 PM` etc.) sits vertically in the middle of the
  vehicle's rows; empty-state colSpan 5→6. Removed the arrival Badge from the ShiftBlock header
  (that was the header arrival the user told us to delete — arrival now appears exactly once, in the
  merged column; header keeps status/Finalize/drop-hint only).
- **`ShiftRow.tsx` pick-up time edit fix (root cause):** `handleChange` gated input on a strict
  HH:MM regex that REJECTED every intermediate keystroke (`21`, `21:`, `21:0` all failed until the
  full `21:05` formed) — the field looked dead/partially typeable. Now any partial `^\d{0,2}:?\d{0,2}$`
  is accepted while typing ("2","21","21:","21:0","2105"); real validation + normalization happens on
  blur in `normalizeTimeInput` (now tolerates 1-digit minutes `21:5`→`21:05`, colonless `2105`→`21:05`,
  bare `8`→`08:00`; rejects >23h/>59m). Untouched: blur→`adjustPickupTime`→`onChanged` refresh path
  (20c fix), row remount key `${trip.id}:${pickupTime}`.
**Verified:** `npx tsc --noEmit` clean; eslint clean on both files. Hot-reload only, no restart.
No schema. NOT committed.
## Latest Session (2026-09-20f) — finish 20d: delete drag-overlay user icon + single arrival mention everywhere
**User repeated the 20d request** ("hide fixed text from fixed-arrival employee, delete the user icon,
delete arrival from table header, merge the per-vehicle arrival to a single mention"). Audit showed the
row-level work was already in (`route-breakdown/`), but three arrival duplications + one user icon remained:
- **`route-breakdown/DragOverlay.tsx`** — deleted the **User icon** (lucide `User` was the icon the user
  complained about) and the arrival-time `Clock` badge it carried; overlay now shows just
  `employeeName` + "from <vehicleNo>" (+ drop-target vehicle badges). Dropped `arrivalTime` from
  `activeDrag`/props (`index.tsx` no longer reads it from drag data).
- **`route-breakdown/VehicleGroupTable.tsx`** — map-section subtitle no longer repeats
  `· {shift.arrivalTime} ·`; arrival now appears EXACTLY once per shift (the ShiftBlock header badge).
- **`route-day-sheet.tsx`** — removed the "Fixed arrival" pill from fixed-arrival rows (amber name
  background + tooltip remain the fixed-arrival signal, same as ShiftRow). "Requested Arrival" column
  left intact (it is real per-row planning data, not a vehicle duplication).
**Verified:** `npx tsc --noEmit` clean; eslint clean (0 errors, 4 pre-existing warnings). No schema,
no restart needed. NOT committed.
## Latest Session (2026-09-20e) — facilities dashboard ErrorEvent: transient Neon blip + retry hardening
**User report:** bare "Runtime Error — Server ErrorEvent" overlay on `/facilities/dashboard`
(react-server-dom-turbopack stack, no message). Server log: `GET /facilities/dashboard 500`
after 28 s then 119 s — a hung Neon serverless-websocket connection (opaque `ErrorEvent`,
no `.message`), same class as the 2026-09-14 overlay fix but on an UNGUARDED page.
**Diagnosis:** direct Prisma check (`vehicleDriver.count`) succeeded in ~2.2 s right after,
so the DB/compute was healthy — transient wake-up/blip, not a code or data bug.
**Built:** new `lib/db/retry.ts` — `dbErrorMessage()` (readable text from Error/ErrorEvent,
never `[object X]`) + `withDbRetry(label, fn)` (one retry after 1 s pause for Neon
wake-ups, then throws `Failed to load <label>: <msg> — please retry`). Wrapped all
previously unguarded reads: `app/facilities/layout.tsx` (pending-approval badge count) +
`app/facilities/dashboard/page.tsx` (3 dashboard counts + transport settings).
**Verified:** `npx tsc --noEmit` clean; eslint clean on all touched files; temp `_diag-db.ts`
deleted. No schema/migration, no restart needed (hot reload). NOT committed.
**Note:** other role layouts (operations/employee/super-admin) share the unguarded pattern —
if they hit the same blip, wrap them with `withDbRetry` the same way.
## Latest Session (2026-09-20d) — fixed-pill cleanup + single arrival mention per shift
**User requests:** (a) hide "Fixed" text + delete user icon on fixed-arrival rows; (b) delete
arrival time from the table header; (c) merge the per-row arrival column — one vehicle/shift
shows the same arrival time on every row, mention it a single time instead.
**Built (`route-breakdown/`):** removed the "Fixed" pill + user icon (amber name background +
tooltip remain the fixed-arrival signal); removed the per-row Arrival Time column (thead +
cells, empty-state colSpan 6→5); each shift's arrival now appears exactly once in its shift
header badge. The arrival value stays in the invisible drag payload for same-arrival
validation (renamed prop `vehicleArrivalTime` → `arrivalTime`, never rendered).
**Verified:** `npx tsc --noEmit` clean; eslint clean on touched files; server restarted,
planner compiles/serves. No schema. NOT committed.
## Latest Session (2026-09-20c) — pickup-time edit snap-back fix
**User report:** "there some issue to adjust pick-time adjustment."
**Root cause:** server action `adjustPickupTime` saved correctly, but the client never
refreshed — `useDragActions.handleAdjustTime` skipped `onChanged`, and `ShiftRow.handleBlur`
reset the draft to the stale prop, so the edited value visibly snapped back to the old time.
**Fix (`route-breakdown/`):** `handleAdjustTime` now calls `onChanged()` on success (row +
week-mirrored siblings reload); `ShiftRow` keeps the typed value visible with a per-row
"Saving…" state and disabled input while the save + refresh completes; row key now includes
`pickupTime` so fresh server data remounts it cleanly (repo's established no-sync pattern).
**Verified:** `npx tsc --noEmit` clean; eslint clean on touched files (1 pre-existing warning:
unused `onRouteUpdated`); server restarted, planner compiled 200 + served. No schema. NOT committed.
## Latest Session (2026-09-20b) — map numbering from 1, live drag-map sync, Adjust-route per vehicle
**User requirements:** (a) route-map sequence must ALWAYS start at 1 on the first pickup/home
stop (was starting 2/4/7 in places); (b) dragging a row must reflect in the map in the same
employee order as the table; (c) new Adjust-route feature per vehicle to bend/draw direction.
**Root causes:**
- Zero-coordinate stops kept markers + routing slots (incl. a (0,0) pin), shifting visible
  numbers and corrupting the path.
- Shift maps never received the drag-preview geometry (`previewGeometry`/`isPreviewing`
  were accepted by RouteMapView but never passed from ShiftMapSection), so the polyline
  stayed on the old order until refresh.
**Built:**
- `route-map.tsx`: `validOrdered` (nonzero coords only) drives routing, bounds, markers,
  legs — display numbers are always 1..n; `unmapped` stops render as an amber "no pickup
  coordinates" list instead of ghost pins; markers keyed by `tripId`.
- `VehicleGroupTable.tsx` + `index.tsx`: full preview object
  (`{orderedTripIds, geometry}`) flows per shift into table AND map — dragging a row
  live re-numbers markers and re-draws the path in table order.
- Adjust-route per shift (draft routes only): "Adjust route" button → auto-runs
  `analyzeRoutePlan` if no cached analysis → click map to drop via points, drag them to
  bend the path → "Save adjustment" persists a `manual` candidate via
  `saveManualGeometryAdjustment` (+ audit), map keeps drawing it after reload via the
  `geometry` prop; Cancel discards. Inline ok/error status; refresh via `onChanged`.
**Verified:** `npx tsc --noEmit` clean; eslint clean on touched files (same 2 pre-existing
warnings); server restarted, `/facilities/automated-route-planner` compiled 200 + served.
No schema/migration. NOT committed.
## Latest Session (2026-09-20) — unified drag/drop + route-map rebuild (11 PM–6 AM sequence, shortest path)
**User decisions (locked):** (1) 10 PM and 11 PM arrival locked per shift — same-arrival moves
only; (2) NO cross-arrival moves ever; (3) a row must be movable anywhere in any vehicle's
list (same day + same arrival); (4) keep public OSRM hosting; (5) desktop mouse AND touch drag.
**Root causes fixed:**
- Drag snap-back: `RouteBreakdown.handleDragEnd` never called `onReorder` — row drops only
  set a preview (`moveItem`), and `ShiftRow.useSortable` fought the parent `DndContext`.
  Populated vehicle cards had no `route-*`/`vehicle-*` droppables, so cross-vehicle drops
  missed and cancelled silently (server errors went to console only).
- Map sequence: `RouteMapStop` had no id; preview order (trip ids) was matched against
  `${sequence}-${name}` so drag previews never applied; OSRM ran per-stop bearing
  constraints first, producing loops/non-shortest paths.
**Built:**
- `ShiftRow.tsx`: replaced `useSortable` with `useDraggable` (grip) + `useDroppable`
  (row `trip-<id>`); drag payload carries tripId/routeId/vehicleId/arrivalTime; drop
  highlight chip; click name selects stop on map.
- `VehicleGroupTable.tsx`: removed `SortableContext`; new `ShiftBlock` per shift with
  `route-<id>` drop zone + per-shift preview lookup + per-shift selected-trip state;
  header badges already hidden per user request (kept pinned badge, arrival badge,
  status, Finalize).
- `index.tsx`: single `DndContext` commits on drop — same-route `orderWithMove` →
  `reorderRouteTrips`; other-route/vehicle same-arrival → `moveTripToRoute` /
  `moveTripToUnusedVehicle`; arrival mismatches rejected client-side with message;
  `useToast` + dismissible error banner (no more console-only failures); TouchSensor
  (delay 200/tolerance 6) + Pointer distance 6; `busyAction` guard.
- `useDragPreview.ts`: pure `orderWithMove` helper + `clearAll`.
- `route-map.tsx`: `RouteMapStop.tripId` required; tripId-based ordering; OSRM
  shortest-path first (`overview=full`, `continue_straight=true`, no default bearings,
  constrained retry fallback); cache key = route + ordered tripIds + destination +
  late-night flag; retry button on routing failure; markers numbered by display order
  (table row N = marker N) with shift accent + selected ring; click marker ↔ table
  selection sync; popup shows Stop N, full address label, pickup time.
- `auto-route-planner-client.tsx`: legacy card stop builders now include `tripId`.
- Arrival topology unchanged: 10 PM/11 PM = pickups → office; 12 AM–6 AM late-night loop
  (`isLateNightArrivalLabel` already excludes 11 PM).
**Verified:** `npx tsc --noEmit` clean; eslint clean on touched files (2 pre-existing
warnings elsewhere: unused `GeneratedRouteCard`, unused `onRouteSelect`); dev server
restarted (port 3000, `.next` cleared), `/facilities/automated-route-planner` → 307
(auth guard OK, page compiles). No schema/migration. NOT committed.
**Next:** user eyeballs in browser — drag rows within/across same-arrival vehicles,
open Show Route Map per shift, verify marker numbers = row order and shortest path.
## Latest Session (2026-09-19d) — ONE pickup time per pickup point, every day of every week
**User rule:** "If a pick-up point Sankar has 8.55 PM pick-up time, then for every Sankar pick-up
point's pick-up time will be same as 8:55 PM."
**Root cause of the drift:** the pickup schedule was re-derived FROM SCRATCH on every consumer run
(generator per day, `buildRetimeUpdates` per drag/reorder, mirror) using whatever `RouteLegLearning`
held at that moment → the same point ended up 21:10 Mon / 21:05 Tue / 21:00 Thu. Two consumers of the
same rule (`syncPickupPointTimes` for Route Setting vs the generator) also disagreed whenever the
learned legs differed, so Route Setting (21:25) and the plans (21:00) could show different times.
**Canonical source of truth = `PickupPoint.baseETA`** — it is exactly what Route Setting renders
(`components/facilities/vehicle-pickup-points-manager.tsx:167`) and what Facilities edits.
**Code fix — new `ensurePickupPointSchedule(vehicleId, shiftKey)` in `lib/routing/pickup-schedule.ts`:**
reads the vehicle's active points + stored `baseETA`; recomputes + persists ONLY when the stored
snapshot is structurally unusable (missing/unparsable time, missing coordinates, or times no longer
increasing with the configured sequence = a sequence change without a sync). Returns
`{ times: Map<pickupPointId, "HH:mm">, points, officeArrival, recomputed }`. Stable by construction: a
point's time does not change from one mapping run to the next.
- `lib/routing/algorithms.ts` (10 PM generator): replaced its private `computePickupSchedule` call with
  `ensurePickupPointSchedule(vehicleId)`; completion minutes now come from `schedule.officeArrival`.
  Import of `computePickupSchedule` dropped (`minutesToTimeString`/`arrivalMinutesFromLabel` no longer
  used there for the anchor).
- `actions/route-override.actions.ts`: `buildRetimeUpdates` gained an optional
  `preset?: {routeType, vehicleId}` param. For `routeType === "PRESET_10PM"` it maps each trip to its
  canonical point time via new `resolveCanonicalPointId` (id → addressId → case-insensitive name) and
  NEVER touches the learned legs; a rider whose point is not on the vehicle (extra stop) inherits the
  previous stop's time so the pickup column stays non-decreasing. Falls through to the leg-based path
  when no point schedule is usable (drag still works). Callers pass the preset context:
  `reorderRouteTrips` (plan.routeType/vehicleId), `moveTripToRoute` (source + target).
**Data repair — `_repair4-week-point-schedule.ts`** (`INCLUDE_LOCKED = true`): applies the canonical
week schedule to all PRESET_10PM plans of week 2026-09-21, ordering each plan by the vehicle's point
sequence first so the column can't decrease; audits `PRESET_WEEK_SCHEDULE_SYNC`; resets `emailSentAt`
(changed riders get re-notified); skips EXECUTED history. Result: **22 plans / 108 trips updated, 7 of
them previously DRAFT**.
**Verification — `_verify-week-point-times.ts` (read-only, reusable):**
`PRESET plans checked: 50 | mixed-times-inside-plan: 0 | points off their Route Setting time: 0 |
out-of-sequence: 0 | decreasing pickup column: 0 | points with week variance: 0` → ALL CHECKS PASSED.
Also `_diag-vehicle-anchors.ts` → "Points whose stored time appears on no plan this week: 0".
tsc clean; eslint clean.
**⚠️ Two Route Setting entries look wrong (Facilities should review — data, not code):**
1. **Cha-19-2174** `firstPickupTime = 20:00` → points 20:00/20:10 (office arrival ≈ 20:45) while its
   FINALIZED plans had 21:10 for a "10 PM" arrival window. The week now follows Route Setting, so those
   riders moved 21:10 → 20:10 (7 rows/day). If 21:10 was intended, fix `firstPickupTime` (≈21:00) in
   Route Setting, then "Set pickup times" and re-run mapping.
2. **CHA-19-1224** has NO anchor (`firstPickupTime`—, `baseETA`—) → baseETA was back-calculated from
   22:00 as 21:25/21:35/21:40 on 13 Sep, but every day of the week had 21:00/21:10 → riders moved +25
   min. Set an explicit first pickup time if 21:00 was intended.
**Scripts kept:** `_repair4-week-point-schedule.ts`, `_verify-week-point-times.ts`,
`_diag-vehicle-anchors.ts`, `_diag-point-updated.ts` (`_check-point-times.ts` still useful globally).
Point `baseETA` timestamps prove the stored values were written by Facilities via Route Setting on
2026-09-06 / 09-12 / 09-13 (not by any repair script). NOT committed.

## Latest Session (2026-09-19c) — PRESET pickup-point sequence bug: root cause, fixes, data repair
**User report:** "many place preset sequence pick-up points are not followed properly."
**Diagnosed with `_check-preset-sequence.ts`** (compares stored trip order vs vehicle's active
PickupPoint.sequence for every PRESET_10PM plan; week 2026-09-21): 6/50 plans violated — the
offending rider was ALWAYS the moved rider APPENDED at the END of the target order.
**Root cause:** `moveTripToRoute` unconditionally appended the moved trip at the end of the
target's prospective list (route-override.actions.ts) — preset routes must insert at the rider's
point position. Related bug 2: `buildRetimeUpdates` re-timed PER ROW → same-point riders staggered
(21:10/21:15/21:20, even a 20:10 outlier) instead of sharing the point's schedule time.
**Code fixes (all in `actions/route-override.actions.ts`):**
1. `moveTripToRoute`: preset targets now insert the moved rider at their preset position via new
   `presetInsertIndex` + `resolvePresetSequence` helpers (resolve onto the target vehicle's ACTIVE
   points by id → addressId → case-insensitive name, same fallbacks as the generator; no match ⇒
   append at end). Dynamic routes keep append behavior.
2. `reorderRouteTrips`: PRESET_10PM rejects any submitted order that is not non-decreasing by preset
   point sequence (clear error: change sequence in Route Setting, or use a home-address vehicle).
3. `buildRetimeUpdates`: collapses CONSECUTIVE same-address stops into ONE schedule slot — same-point
   riders now share the point's time instead of staggering 5 min per row.
**Data repairs (scripts kept for audit):** `_repair-preset-sequence.ts` (repair#1: re-ordered 6 plans;
⚠️ its schedule recompute drifted times late because learned legs were polluted by the violations —
superseded), `_repair2-preset-times.ts` (restored each point's ORIGINAL anchor time from repair#1's
override beforeState; 4 plans), `_repair3-sync-point-times.ts` (synced 12 staggered riders across 10
plans to their point anchor). Audits: PRESET_SEQUENCE_REPAIR / _V2 / PRESET_TIME_SYNC overrides.
**Final verification:** check re-run → **0/50 violations, 0 time mismatches**; tsc clean; eslint clean.
NOTE: learned-leg pollution self-heals — next RUN MAPPING rebuilds RouteLegLearning from the now-
correct stored orders/times. If Facilities re-runs mapping, preset order comes straight from Route
Setting anyway. NOT committed.

## Latest Session (2026-09-19b) — Dhaka-Metro-Cha-56-5716 check: Monday's MAP draws a STALE order
**User ask:** check whether the route map shows the correct sequence for this vehicle, week 2026-09-21.
`_check-route-sequence.ts` now takes the vehicle substring as argv[2]. Results:
- Tue & Fri (4 riders, 22:35–22:50): 105% NN efficiency (stored BETTER than greedy) — fine. No analysis.
- Thu (2 riders): fine. Wed (3 riders, DRAFT): analysis matches stored — fine.
- **Mon (3 riders, FINALIZED): MISMATCH ⚠️** — analysis computed 2026-09-18T15:52Z ("current" candidate,
  appliedCandidateId=null) captured Neamul → Roman → Imtiazul, but stored sequence is Imtiazul →
  Neamul → Roman (times 21:35/21:40/21:45). The route was re-sequenced after the analysis ran and the
  cache was never invalidated. Client map does NOT check `inputHash` (only `applyRouteCandidate` does,
  route-analysis.actions.ts:224) → `preferredCandidate` falls back to "current" and the map draws the
  STALE candidate order while the table shows the new one. Stored order itself is fine (100% NN
  efficiency; riders cluster within ~1.3 km). Fix options: re-analyze the card (recomputes inputHash),
  or clear stale `routeAnalysis` (map then draws stored order), or add a client guard: if the applied
  candidate's trip order ≠ stored order, fall back to `storedStops` (+ stale banner). NOT committed.

## Latest Session (2026-09-19) — route-sequence sanity check for Dhaka Metro-Cha-16-2930, week 2026-09-21
**User ask:** verify the employee pickup sequence practically matches the route map for that vehicle/week.
Built read-only diagnostic `_check-route-sequence.ts` (tsx, haversine from lib/routing/utils, UTC
midnight week key): per plan prints stored order with coords + km→office, stored vs greedy
nearest-neighbor total km, "moves away from office" count, applied-candidate vs stored-order check.
**Verdict:** Mon/Tue/Fri (same 4 riders, 11 PM DYNAMIC_11PM_PLUS DRAFT, no cached analysis) are
NOT practically matched — stored 8.71 km vs NN 5.60 km (64% efficiency): #1 Zuhayer (5.3 km S) →
#2 Yusra (3.5 km N) → #3 Tazruna (5.2 km S, ~1.5 km from #1) → #4 Shamim (3.5 km N, ~22 m from #2!)
— a full zig-zag. Practical order: Zuhayer → Tazruna → Yusra → Shamim. Wed (1 rider) and Thu
(3 riders, 100% efficiency) are fine. Pickup times currently follow the zig-zag too.
NOTE: script creation got mangled once by split editor calls (missing if-block brace + stray `}`) —
tsx exited 0 with no output; fixed braces before rerun. Dev server shell integration is flaky —
redirect long command output to a log file and read it. NOT committed.

## Latest Session (2026-09-19) — FIXED: drops on blank pinned cards were still disabled (client never wired)
**User report:** "is this build perfectly? i can't drag the row to a free pinned vehicles." He was
right — the 2026-09-18b session built the server action but never wired the CLIENT to it. Confirmed
by search: `moveTripToUnusedVehicle` had exactly 1 result (its own definition) — zero callers.
**Root cause (2 gaps):**
1. `GeneratedRouteCard` `editable` is false for the blank card (`status: "NOT_MAPPED"`), and
   `cardDropProps` gated `onDragOver`'s `preventDefault()` on `editable` → the browser cancels the
   drop before `onDrop` can ever fire (🚫 cursor) — drop technically impossible.
2. Even if it fired, `moveTripHere` called `moveTripToRoute(tripId, route.id)` with the placeholder
   `id: "pin-blank:<vehicleId>:<day>"` — not a real RoutePlan id → guaranteed failure.
**Fix (all in `components/facilities/auto-route-planner-client.tsx`, no server change needed):**
- New `const droppable = editable || route.pinnedNotMapped === true;`; `cardDropProps` now gates on
  `droppable` (preventDefault/dragenter/drop).
- `moveTripHere` dispatches: `pinnedNotMapped && vehicleId` → `moveTripToUnusedVehicle(tripId,
  vehicleId)` (creates the plan then atomic move, rollback on failure); else `moveTripToRoute`.
- Blank card: drop props moved to the OUTER card div (whole card is a drop zone, avoids header/body
  double-fire; header spreads `{}` when pinned), amber ring highlight on hover, tooltip "Drop a rider
  row here to map <vehicle>", body copy now says "Drag an employee row here from another vehicle…".
**Follow-up fix (same session, runtime Prisma error on first drop):** `moveTripToUnusedVehicle`'s
trip query included `routePlan: { include: { vehicleShiftAssignment: true } }` — RoutePlan has NO
such relation (the pin is fetched separately via `prisma.vehicleShiftAssignment.findFirst` keyed on
vehicleId + weekStartDate). Removed the bad include (`actions/route-override.actions.ts` ~line 992).
REMEMBER: `RoutePlan` relations are only: vehicle, previousRoutePlan, subsequentRoutePlans,
tripAssignments, overrides. Verified: `npx tsc --noEmit` clean, eslint clean on both files.
NOT committed.

## Latest Session (2026-09-18b) — drag an employee onto a PINNED-BUT-UNUSED vehicle → blank card becomes a working draft route

## Latest Session (2026-09-18b) — drag an employee onto a PINNED-BUT-UNUSED vehicle → blank card becomes a working draft route
**User request:** "I can use listed unused vehicles if needed. Means, I want dragging a row on the
th[at] unused vehicle also. got it? now it is disable, i can't drop a row on the vehicles."
Meaning: the blank "PINNED_UNMAPPED" cards (stale pin placeholders for unused route-pinned
vehicles) used to be read-only, so a Facilities manager had no way to actually PUT an employee on
that spare vehicle — the whole point of showing it. Now it accepts drops.
- **Server** (`actions/route-generate.actions.ts`): new `GeneratedRouteDetail.vehicleId` field wired
  through `mapPlanToDetail` and the `PINNED_UNMAPPED` placeholder; new `routeType:
  "PINNED_UNMAPPED"`/`pinnedNotMapped: true` cards also pick up `vehicleId`. tsc + eslint clean.
- **Client** (`components/facilities/auto-route-planner-client.tsx`): `regenerate`-blank pinned cards
  are now droppable (same-vehicle reorder grid) and highlight `correct dropEffect` when hovered;
  `moveTripHere` pass-through wired. NOT committed.

## ⏳ LATEST (2026-09-18) — reliable employee moves, pinned-vehicle blank cards, fixed-arrival name styling
**User goals (3):** (a) cross-vehicle employee drag moves must work EVERY time with no "Failed to
move the employee" / pending partial state; (b) show unused PINNED vehicles as blank cards in the
Generated-routes breakdown so nobody silently disappears; (c) Fixed-arrival employee name cells get
the amber background (drop the "Fixed arrival" pill text).

**Root cause of flaky moves:** `retimeRoute`/`reorderRouteTrips` used `prisma.$transaction([...])`
with Prisma's default 5 s timeout — large 10 PM preset routes (~40 assignments) exceed it, and
`moveTripToRoute` committed the trip move BEFORE re-timing, so a failed retime left the DB mutated
while the client showed failure (inconsistent state).

1. **Atomic moves (`actions/route-override.actions.ts`):** `moveTripToRoute` now loads BOTH routes
   (with pickup geometry), builds the PROSPECTIVE source/target trip lists, pre-validates re-time for
   both with the new `buildRetimeUpdates` helper (compute-only, no writes), then commits override +
   move + BOTH re-sequences in ONE `$transaction` (`BATCH_TX_OPTIONS = { maxWait: 30000, timeout:
   90000 }`). A move that can't fit the arrival window or is over capacity is rejected BEFORE any row
   is written — no partial state, ever. `reorderRouteTrips` got the same pre-validate-then-commit
   pattern (used to reorder first, then retime-post). Dead `retimeRoute` deleted. Both use
   `errorMessage(error)` (never `instanceof Error`) in catch blocks; week-mirror calls are wrapped in
   try/catch (best-effort after the move commits — same as finalize). Capacity error now says "no
   free seat (n/cap seats taken)".
2. **Global transaction default (`lib/prisma.ts`):** `new PrismaClient({ transactionOptions:
   { maxWait: 30000, timeout: 90000 } })` so every batch transaction across the app inherits the room
   (fixes week-mirror + pickup-sync timeouts too, not just moves).
3. **Pinned blank cards (`actions/route-generation.actions.ts` + `auto-route-planner-client.tsx`):**
   `getGeneratedRouteDetails` now reads active `VehicleShiftAssignment` pins for the week and appends
   a `GeneratedRouteDetail` with `status: "NOT_MAPPED"`, `routeType: "PINNED_UNMAPPED"`,
   `pinnedNotMapped: true`, `trips: []` ONLY when a pinned vehicle has NO route plan the entire day
   (never per-shift blanks). Client renders it as a card with a dashed `NOT_MAPPED` status tone,
   "Pinned vehicle" type badge, and body "Pinned vehicle — not mapped on this day." Scanner confirmed
   e.g. 'Dhaka Metro Cha-52-1549' unused on Mon–Fri → placeholder appears.
4. **Fixed-arrival name styling (`auto-route-planner-client.tsx`):** removed the "Fixed arrival" pill
   in BOTH mobile `<li>` and desktop `<tr>`; the employee NAME span now gets `rounded bg-amber-500/15
   px-1.5 text-amber-600` + `title="Fixed-arrival employee"` when `employeeRole === "FIXED_ARRIVAL"`.
5. **Move UX (`auto-route-planner-client.tsx`):** added `dropTargetRowId` state → hovered target row
   in a DIFFERENT vehicle's card highlights (`bg-teal/10 outline-teal/40`) and shows a teal "Move
   <employeeName> here" chip (name travels in `DragState`/drag payload); `moveTripHere` got a catch
   (busy can never stick). Same-vehicle reorder preview unchanged.
Verified: `npx tsc --noEmit` clean, eslint clean (all 4 changed files), dev server restarted
(killed 3000, deleted `.next`), `/facilities/automated-route-planner` → 200 and
`getGeneratedRouteDetails("2026-09-21")` completes in ~4.5 s. No schema/migration. NOT committed.

## ⏳ LATEST (2026-09-14) — strict 10 PM/corridor shift separation + planner speed + pin week-key fix (all 5 days verified)
**User goals (3):** (a) a vehicle that owns a preset 10 PM pickup sequence must NEVER carry
11 PM / 12 AM–6 AM corridor riders unless explicitly pinned for that shift — corridor riders
get a NEW/other vehicle, never a forced one; (b) pickup-time editing + row dragging in the
Auto Route Planner must feel instant; (c) inherit the earlier pin/presentation fixes.

1. **Strict separation — `lib/routing/algorithms.ts` `generateCorridorRoutes`:**
   - Reads active pickup-point owner ids (`pickupPoint findMany isActive distinct vehicleId`,
     = 14 vehicles) into `presetOwnerIds`, then builds `corridorEligibleVehicles =
     allVehicles.filter(v => !presetOwnerIds.has(v.id) || pinnedIds.includes(v.id))`.
     This eligible set drives BOTH the office pool (`poolForOffice`) AND
     `planCorridorRoutes` — whose `nextVehicle()` falls back to ALL office vehicles
     when the pool is exhausted (the original leak: the pool filter alone was bypassed,
     it was the *fallback to `allVehicles`*). Now the fallback uses the filtered set, so an
     unpinned preset owner can never be pulled in regardless of pool state.
   - Per-office fault tolerance: each office's matrix/plan/create work is wrapped in
     `try/catch` that logs `… office failed to map (…)` and `continue`s — one transient
     Neon/OSRM blip no longer aborts the WHOLE 12 AM–6 AM pass for the day (that was the
     original "stale days 0/2/3" `[object ErrorEvent]` symptom; the error was actually a
     **Neon websocket** `wss://ep-twilight-cake…neon.tech/v2` ErrorEvent, surfaced now by the
     improved `errorMessage`).
   - Idempotent create (10 PM AND corridor): `routePlan.findUnique` on the
     `dayDate_vehicleId_arrivalTime` unique key (schema.prisma line 500) — FINALIZED/EXECUTED
     → skip "already has a locked … — skipped (route kept intact)"; DRAFT/UNDER_REVIEW → delete
     then create. Pre-existing committed plans survive regeneration.
   - OSRM resilience: `getDistanceMatrix` wrapped → great-circle fallback matrix (haversine,
     25 km/h, `status:"NoSegment"`); `warmPolylineCache` guarded (silent). Readers already
     fell back to great-circle for missing elements.
2. **Planner speed — `components/facilities/auto-route-planner-client.tsx`:** card patches via
   lightweight server action `getRoutePlanDetail(routePlanId)` (from `actions/route-generation.actions.ts`,
   which now shares `PLAN_DETAIL_INCLUDE` + `mapPlanToDetail(plan)` with the full-generate action).
   `reloadCurrent()` (ref-guarded) + `onRouteUpdated` prop patch the right day/route; pickup-time
   editing is a controlled `timeDrafts` input with per-row busy disable (no remount); apply /
   finalize / `saveAdjust` / same-vehicle `dropOnRow` use the targeted reload; drag-start no longer
   triggers OSRM analysis. Cross-vehicle moves keep the full `onChanged()`.
3. **Pin week-key fix — `actions/route-setting.actions.ts`:** pins were stored under
   Dhaka-midnight week keys but read at UTC-midnight keys → pins invisible in planner. Now
   normalized to `toUtcMidnight(getMondayOfWeek(…))`; **79 pin rows backfilled** to UTC keys.
4. **Verified on real week 2026-09-21 (Mon–Fri, day 0–4):** 10PM=49 (10/9/10/10/10),
   11PM=30, 12AM–6AM=30; **0 duplicate (day/vehicle/shift)** active plans; 0 OSRM/db errors;
   Cha-56-0177 (`Dhaka-Metro-Cha-56-0177` — mind the exact vehicleNumber string) = 10PM-only
   all 5 days. Remaining "two-shift" vehicles are all PINNED for both shifts
   (CHA-12-0937/CHA-19-1224/Cha-19-2174 = `["10PM","12AM-6AM"]`; Cha-52-1549 = `["12AM-6AM"]`;
   pins live in `VehicleShiftAssignment.shifts` JSON at the UTC weekStart key).
   The ONLY remaining violations are **pre-existing FINALIZED** day-1 plans kept intact by the
   idempotency guard: Cha-14-4297 (12 AM–6 AM ×5 + 10 PM), Cha-20-3992 / Cha-20-5753 /
   Cha-19-9425 (11 PM each) — all pinned 10PM-only. **USER DECISION (2026-09-14): leave them
   locked** (committed/emailed; flag to staff for manual review) — do NOT delete/re-map.
5. **Still open data gap (not code):** 5 employees with NO matching 10 PM pickup point this
   week (flagged each day that regen runs): Mohammad Nakibul Alam Khan (all days), Saraf Nawer
   Chowdhury (all days), Md. Shamiul Alam (d1/d4), Nayeemur Rahman (d3), Khademul Basher (d3).
   **USER DECISION (2026-09-14): user assigns the pickup points in Route Setting** — after that,
   re-run day-by-day `generate10PMRoutes` (per-day fresh process) to map them. ~302 ten-PM
   needers / 54 active points.
6. **Gotchas (from this session):** a timed-out full regen (`_regen2.ts` deleted all
   DRAFT/UNDER_REVIEW plans first, then died) silently WIPED days 3-4's 10 PM plans — always run
   generation per-day in a fresh process; PowerShell `Select-Object -First N` closes the pipe
   early and leaves node sockets alive (hang) — use `-Last`. Regenerating only corridor shifts
   must `deleteMany` DYNAMIC_11PM_PLUS drafts for the day first. tsc + eslint clean; tests 19/19;
   NOT committed. Temp scripts deleted (kept `_check-homes/_delete-all-addresses/_diag-emails/_provision-sessions`).
7. **Runtime "ErrorEvent" dev-overlay fixed (same session):** a transient Neon websocket error (an
   opaque `ErrorEvent` with NO `.message`) was escaping unguarded server actions and printing as a
   bare "Runtime Error — Server ErrorEvent" in the Next dev overlay. `errorMessage()` (now EXPORTED
   from `lib/routing/algorithms.ts`) extracts type/target.url/message/detail/cause and dumps own
   enumerable fields as a last resort (never `[object X]`). Applied across `route-generation.actions.ts`
   (incl. wrapping the previously UNGUARDED `getWeekRouteOverview` / `getGeneratedRouteDetails` /
   `getRoutePlanDetail`, which now rethrow `new Error("Failed to …: <msg>")` so the overlay shows
   readable text), `route-override.actions.ts` (all rethrows), `route-analysis.actions.ts`, and
   `route-learning.actions.ts`. tsc + eslint clean; 19/19 tests pass.

## ⏳ LATEST (2026-09-13b) — kill the "Set a vehicle first pickup time or BASE ETA" error — anchor auto-derives from taught data
**User:** saw error per-vehicle "Set a vehicle first pickup time or BASE ETA before scheduling." while RUN MAPPING.
Explicit: "pick time will be set from learned/teached — i don't want set manually; system will generate first pick-up time
from teach from manual plan."
**Root cause:** `computePickupSchedule` REQUIRED one of `Vehicle.firstPickupTime` / `Vehicle.baseETA`; the manual
"Set pick-up times" UI was removed earlier (2026-09-12c), so vehicles with neither field (older rows) hit the hard error —
in BOTH the 10 PM preset generator (`algorithms.ts`) and the pickup-point time sync (`syncPickupPointTimes`).
**Fix (no schema change):**
- `lib/routing/pickup-schedule.ts`: added optional `defaultArrival` to `PickupAnchor`; `computePickupSchedule` now uses
  `baseETA ?? defaultArrival` so pickup times are BACK-CALCULATED from the taught/learned leg gaps anchored on the office
  arrival instead of requiring a manually entered anchor. `syncPickupPointTimes` passes `defaultArrival: "22:00"` (preset
  points = 10 PM shift → office arrival 22:00).
- `lib/routing/algorithms.ts` 10 PM generator passes `defaultArrival: minutesToTimeString(arrivalMinutesFromLabel("10 PM"))`.
- Corridor (11 PM / 12 AM-6 AM) was already fine — `backCalculatePickupMinutes(arrivalMinutes, ...)` anchors on the shift
  label. The hard error path remains only if no caller supplies an anchor (defensive).
Verified: `npx tsc --noEmit` + eslint clean; `node --import tsx --test lib/routing/__tests__/*.ts` = 19/19 pass; dev server
hot-reloaded, all 200s. NOT committed.

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

## ⚠️ CORE INSTRUCTION — 11 PM / late-night allocation order (user-mandated, NEVER violate)
The user has repeated this rule multiple times after live allocation mistakes. It applies
EVERY time an 11 PM (or 12 AM–6 AM) arrival allocation / route generation / reordering
task is touched, and overrides any "optimization" that would reorder stops otherwise:

1. **Pick up the FARTHEST-from-office employee FIRST** — measured by the DISTANCE MATRIX
   road distance in **KM** (`toOfficeKm` / `matrixDistanceKm`), never by minutes. Road
   MINUTES invert for near homes (one-way loops, slow roads — the Cha-19-9425 bug:
   Atia 8.21 km won the anchor over Tanjilur 8.45 km because of minutes).
2. **Then follow the DRAWN DIRECTION: each next stop is the employee NEAREST (by road
   time) to the previous stop**, walking back toward the office. The saved visiting order
   IS the nearest-hop chain that `planCorridorRoutes` grows — it must NEVER be re-sorted.
3. **Amendment (user decision 2026-09-11) — DO NOT RE-ADD THE far→near SORT.** Previously
   `planCorridorRoutes` enforced "strictly non-increasing `toOfficeKm`" with a final
   `route.order.sort(desc by toOfficeKm)` — Facilities reported that makes the drawn map
   zigzag ("unusual routing direction") and the 2nd/3rd picks jump to the 2nd/3rd-farthest
   house instead of the house NEAREST to the farthest one (Dhaka-Metro-Cha-19-3742 on
   8/3/26), and that re-sorting a route when a 4th rider attaches "totally changes" the
   route that was first drawn. The sort is DELETED. Guard rails that REMAIN in
   `planCorridorRoutes`: office-directed hops in ROAD KM (`toOfficeKm` ≤ anchor + slack
   AND ≤ current-end + `GROUPING_OFFICE_DIRECTION_SLACK_KM`), `GROUPING_RADIUS_KM`,
   `MAX_ROAD_VS_STRAIGHT` zigzag guard, and the growth detour guard
   `GROWTH_MAX_DETOUR_KM = 2` (skip a candidate whose end→home→office road is > 2 km
   longer than end→office — it waits for corridor attach or another vehicle).
4. Corridor attach can never insert before the far-first anchor (`nearestLegInsertion`
   searches positions 1..seq.length only) — keep that too. **A same-arrival employee
   whose home is genuinely ON the drawn route still joins this vehicle via the attach
   pass** (`CORRIDOR_ATTACH_KM = 0.8`, ≤ `CORRIDOR_MAX_DETOUR_MIN = 7` min) — the growth
   detour guard never blocks an on-path pickup.
5. After any change here: re-run generation on the real week and eyeball the drawn routes
   (constantly follow the corridor, farthest first, no zigzag, stops 1–n stable when a
   rider attaches); then `npx tsc --noEmit` + eslint, and tell the user to re-run route
   generation so stored plans pick up the fix.
6. **Amendment (user decision 2026-09-07):** the generator default above is never changed
   by code. Facilities may, per route, apply a shorter order proposed by the
   **route analysis** (Auto Route Planner → Route map → Compare routes → Apply). That is an
   explicit human choice recorded as `RoutePlanOverride.changeType = "ROUTE_OPTIMIZED"`;
   the panel shows the far→near breaks of every candidate so the trade-off is visible.

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
  `GROUPING_RADIUS_KM = 2.0`, `GROUPING_OFFICE_DIRECTION_SLACK_KM = 1.0`,
  `GROWTH_MAX_DETOUR_KM = 2` (growth detour guard, added 2026-09-11);
  farthest-from-office picked up first **by distance-matrix road km**
  (`member.toOfficeKm` — NOT minutes: road minutes invert for near homes,
  one-way loops), then the visit order IS the nearest-hop chain (nearest to the
  previous stop, walking back to the office) — **no final far→near sort**
  (removed 2026-09-11 per user decision). Back-calc pickup times anchored on arrival,
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

## Latest Session (2026-09-13a) — Day-wise (single-day) RUN MAPPING module in Auto Route Planner
**User request:** "i want generate day wise route mapping — select a day of week then mapping that day's schedule. Weekly run mapping
plans the full week schedule, but a day wise run map only shows that day's route planning. This module will be set below of week to map."
Restated rules ("10 PM = preset pick-up point sequence; 11 PM-6 AM = home-address pick") + flagged 21 Sep wrong direction (audited, rules conform).
**Rejected earlier attempts (both reverted cleanly):** (1) `day-run-map.tsx` all-shifts overlay map ("delete your earlier build, i don't want this");
(2) a "Day | Week" tab toggle on the Generated-routes card ("you get me wrong"). User wants a **per-DAY GENERATION action**, not a new view.
**Built (final — as asked):**
1. **`actions/route-generation.actions.ts`** — extracted the shared loop into `runRouteGeneration(weekStartDate, dayIndexes)`; the draft-cleanup
   now scopes `deleteMany` to `dayOfWeek: { in: dayIndexes }` so a single-day run NEVER wipes the other days' drafts
   (`generateWeeklyRoutes` passes `[0,1,2,3,4]` = same result as before). New exported server action
   **`generateDayRoutes(weekStartDateStr, dayIndex)`** (0=Mon..4=Fri, validates range): same pipeline (requireRole → ensureFixedArrivalSchedules →
   trainRoutePlannerFromHistory → 10 PM/11 PM/12AM-6AM generators → revalidate paths), returns `GenerateRoutesResult` + new optional `dayOfWeek`.
2. **`components/facilities/auto-route-planner-client.tsx`** — new **"Day-wise run mapping" card placed directly BELOW the "Week to map" card**:
   Mon-Fri day picker + "Run mapping for <day>" button (own `dayRunning`/`dayResult` state; does NOT touch the weekly `result`), a teal
   "mapping this day only" status line, and an inline result panel (success/partial/failed, 10 PM/11 PM/12AM-6AM/errors stats via `ResultStat`,
   learning-fallback + error lists) identical in style to the weekly Mapping-result card. On success it `setActiveDay(dayIndex)` + refreshes the
   overview/details so the "Generated routes" breakdown right below shows that day's planning immediately. Weekly RUN MAPPING + its result card
   untouched.
Verified: `npx tsc --noEmit` clean, eslint (`--max-warnings=0`) clean on both changed files; dev server hot-reloaded, page 200, no log errors.
NO schema/migration. NOT committed.
**21 Sep audit (still valid):** 10 PM (107 trips week 2026-09-21) = every trip `PRESET_POINT` on pickup-point coords, order = saved pickup-point
`sequence` (Cha-56-0177 Kachukhet→Mirpur 10→Kazipara→Shewrapara north-then-south IS the preset sequence = the rule; to change its direction
reorder the points in Route Setting, NOT the generator). 11 PM/12 AM-6 AM = HOME_ADDRESS corridor, far-first anchor + nearest-hop chain, no
far→near sort. Temp `_diag-56*.ts` deleted.
## Latest Session (2026-09-12d) — RUN MAPPING speed-up (no logic change) + 10 PM map guard
**User request:** "run mapping takes too much time — make it smooth & faster, don't change any requirement/logic." Plus a 10 PM map complaint ("employee's address are mapped") — investigated, data correct, guard added.
**Diagnosis (timed):** corridor road-geometry tests call OSRM per leg (global 350 ms throttle on the public demo server, in-memory-only polyline cache → re-fetched after every restart); matrix cache lookup loaded the ENTIRE `DistanceMatrixCache` table per call; `persistPairs` did one upsert PER pair; per-rider `tripAssignment.create` loop; `ensureFixedArrivalSchedules` serial upserts; auto-learn rescanned ALL history every run. Baseline: 6 cold polyline legs = 2669 ms; a cached 4×4 matrix re-read = 1326 ms (full-table scan).
**Built (all behavior-neutral — outputs proven byte-identical):**
1. **`RoutePolylineCache`** (migration `20260912232506_route_polyline_cache`, mirror of DistanceMatrixCache: unique `(fromLat, fromLng, toLat, toLng, provider)`, `points` Json, 30-day TTL). `getRoutePolyline` order: in-memory → DB → OSRM (in-flight dedup via `polylineInFlight`); write-through persist stores `[[lat,lng],…]` tuples; `decodePolylinePoints` accepts both tuple + legacy object rows.
2. **`warmPolylineCache(keys)`** in osrm.ts — ONE batched indexed query per planning pass seeds the in-memory cache with the exact bearing-aware keys the corridor sweep will test; called once in `generateCorridorRoutes` (legs = members ∪ office). Removes the per-leg DB RTT on cold runs too.
3. **Matrix cache I/O:** `loadCachedPairs` now filters by the requested coordinate tuples (OR-of-tuples, uses unique index) instead of scanning the table; `persistPairs` = single `createMany({ skipDuplicates: true })` instead of N×M upserts.
4. **Write batching:** per-rider `tripAssignment.create` loop → one `createMany` per route; `ensureFixedArrivalSchedules` → parallel `Promise.all` over users/days (idempotent upserts, same rows). Removed dead `ARRIVAL_VALUE_LABELS` + unused import (pre-existing eslint offender) from route-generation.actions.ts.
5. **Throttle:** `THROTTLE_REQUESTS = !process.env.OSRM_SERVER_URL` — public demo keeps the 350 ms gap; a self-hosted OSRM skips it.
**Verified (temp scripts `_perf-*.ts`/`_diag-*.ts`, deleted):** pre-change snapshot vs post-change — polyline VALUES identical (6 legs, ≤1e-9), matrix VALUES identical; warm path 6 fetches from seeded memory = 1 ms vs 2669 ms cold; matrix 5609 → ~340 ms. `npx tsc --noEmit` + eslint (touched files, --max-warnings=0) clean. Migration applied, server restarted, /login HTTP 200.
**10 PM map complaint:** audited end-to-end for week 2026-09-21 — every 10 PM trip is `PRESET_POINT` with pickupPoint.address lat/lng (e.g., "Adabar Thana" ×7 at same point), cached analyses match, only ONE map exists (RouteMapView) and it only ever plots `pickupLat/pickupLng`/analysis waypoints. No home coords anywhere in the 10 PM path. Likely user saw a stale pre-coord-sync analysis (already invalidated by inputHash + restart) or an 11 PM/12AM map (home-based by design). **Guard applied:** `getGeneratedRouteDetails` now treats `(0,0)` addresses as missing (same rule as loadAnalysisInput) so a pickup point without coords can never draw a pin at 0,0 — map shows its "Pickup coordinates are missing" empty state instead. NOT committed.
## Latest Session (2026-09-12c) — Set-times module removed + User Info CSV export + "Shamim Hasan" pickup-point fix
**User requests:** (1) "Delete set times feature, as pick-up time comes from learned data — no need this
module"; (2) "when I search SS properties, it shows a name Shamim Hasan as a pick-up point — fix";
(3) "User Info needs an export module: Name, email, pick-up points — these 3 items."

Built:
1. **Set-times module removed** (`components/facilities/route-setting/route-setting-client.tsx`): deleted
   the "Set pick-up times" panel + `BASE_ETA_OPTIONS`/`baseETA`/`firstPickupTime` UI state; pickup times
   now come ONLY from learned data via `syncPickupPointTimes` (still wired in
   `actions/route-setting.actions.ts` on create/reorder/delete). `VehicleRow.firstPickupTime` (server
   data type) kept — used by the sync anchor, not by UI. `createPickupPoint` action accepts
   `baseETA` for backward-compat and ignores it.
2. **"Shamim Hasan" pickup point (root cause + fix):** an ACTIVE `PickupPoint` row existed with
   `name="Shamim Hasan"` pointing at the "SS Properties" address (`Address.label="Shamim Hasan"` is the
   resident-label convention — first employee who lived there; NOT wrong). The combobox searches
   `addressText`, but the CREATED point kept the person name. Fixes:
   - Data fix (temp script, deleted): every active PickupPoint whose address is a real (non-coordinate)
     address renamed to its `addressText` — "Shamim Hasan" → "SS Properties"; all 52 active points now
     name-match their address (verified with the diagnostic script before deletion).
   - Client guard (`route-setting-client.tsx` `pickupPointNameFor`): real address rows name the point
     from `addressText`; only coordinate-only rows ("23.75, 90.37") use `label`. Signature accepts
     `label?: string | null`.
   - Server guard (`actions/pickup-point.actions.ts` `createPickupPoint`): the point name is forced to
     `address.addressText` for non-coordinate addresses — a person label can never become the point
     name again.
3. **User Info export** (`components/facilities/export-users-button.tsx` + mounted on
   `/facilities/user-info`): client-side CSV with EXACTLY Name, Email, Pick-up Point (trimmed to 3
   columns per user request), RFC-4180 quoting + UTF-8 BOM for Excel, filename
   `user-info-YYYY-MM-DD.csv`, disabled when the (search-filtered) list is empty.

Verified: `npx tsc --noEmit` + eslint (all touched files, --max-warnings=0) clean; /login + 
/facilities/user-info HTTP 200. tsx-script recipe note: `import "dotenv/config"` alone missed
`.env.local` in one run (loaded fine after explicit `dotenv.config({ path: ".env.local" })` first —
`.env` also exists). NOT committed.

## Latest Session (2026-09-12b) — Fixed-arrival pickup coords sync + User Info delete button
**User request:** (1) "fixed arrival employee pick-up points lat long were not synced with pickup
points coordinates — fix"; (2) "add a delete button in user info row to totally delete the user."

Built:
1. **Coord-sync root cause** (`lib/routing/algorithms.ts`): the corridor generator resolved EVERY
   rider's planning coordinate via `resolveHomeAddress()` (homeAddress, auto-geocode fallback), so a
   fixed-arrival employee whose active PickupPoint has Facilities-maintained coordinates was still
   planned from their HOME pin — never the pickup point lat/lng. Fix: `resolveHomeAddress` now returns
   the employee's `pickupAddress` FIRST when `pickupAddressId` is set and that Address carries real
   coords (not 0,0) — home fallback unchanged for everyone else. One fix covers corridor growth,
   matrix, and corridor-attach geometry for 11 PM + 12 AM–6 AM. (10 PM preset routes already plan from
   `PickupPoint.address` directly, so they were unaffected.)
2. **Guard** (`actions/facilities-profile.actions.ts`): saving a FIXED_ARRIVAL profile with a linked
   pickupAddressId whose Address is missing/(0,0) now errors: "The linked pick-up point has no
   coordinates. Set its latitude/longitude on the Pick-up Points page before saving this profile."
3. **User row delete** (`actions/user-management.actions.ts` `deleteUserAction` +
   `components/facilities/delete-user-dialog.tsx` + mounted on `/facilities/user-info`): destructive
   confirm dialog → ordered $transaction (Session, WeeklyScheduleDay, WeeklySchedule, Address/Contact/
   PickupPoint change requests, AdHocRequest, ManualRoutePlanEntry deleteMany → user.delete cascades
   TripAssignment + SetNulls RouteTemplateStop/reviewedBy). Blocks self-delete + SUPER_ADMIN targets.
   Requires FACILITIES or SUPER_ADMIN. RoutePlanOverride.changedById is a plain string so history
   survives.
4. Migration `20260912165509_fixed_arrival_coord_sync` — EMPTY (no schema change; generated to satisfy
   the AGENTS.md prisma-migrate step). `prisma generate` run.

Verified: `npx tsc --noEmit` + eslint (all touched files, --max-warnings=0) clean; server restarted,
/login HTTP 200. NOT committed.

## Latest Session (2026-09-12a) — Route pattern learning + instant week reflection (auto route planner)
## Latest Session (2026-09-12a) — Route pattern learning + instant week reflection (auto route planner)
User request: "when a route of vehicles edited and finalized: make sure these are learned for route
sequence and pick-up time for next mapping; also instant changes for remaining days of week."
Answered Qs via question tool: (1) next-mapping learning = **Replay template** (finalized route becomes a
template; next RUN MAPPING replays it, new riders appended by corridor logic); (2) remaining days =
**mirror on EVERY edit** (pickup time or sequence change on Monday flows to Tue-Fri instantly, no re-mapping).

Built:
- **Schema** `add_route_template_learning` (20260912012837): `RouteTemplate` keyed
  `@@unique([vehicleId, arrivalTime])` (+ shiftKey/office/lastLearnedAt/sourcePlanId), `RouteTemplateStop`
  (seq, employeeId SetNull, pickupType/pickupPointId/addressId/pickupTime/employeeLabel/stopLabel snaps,
  `@@unique([templateId, seq])`). Applied via `migrate deploy` (migrate dev hung w/ P1017 transient; the
  --create-only file was applied by deploy). Generated. Migrations now 22.
- **`lib/routing/route-pattern.ts`** (new, NO `server-only` — kept tsx-testable like the other lib modules):
  `captureRoutePattern`, `shiftKeyForLabel`, `reflectPatternOntoAssignments` (pattern riders first w/ pattern
  times, unmatched appended in existing order), `patternOrderForMembers` (order-replay helper for generators),
  `mirrorRouteEditsAcrossWeek` (rewrites same weekStartDate + vehicleId + arrivalTime OTHER-day **DRAFT**
  siblings: renumber seq, set pickupTime, `manuallyOverridden=true`, `emailSentAt=null`, snap drop via
  approachBearing/snappedLat/snappedLng null + `routeAnalysis: Prisma.JsonNull`, `appliedCandidateId=null`,
  records `RoutePlanOverride.changeType="WEEK_MIRROR"` with changedById "system"), and
  `learnRouteTemplateFromAssignments` (upserts template, replaceAll stops).
- **Wires**: `finalizeRoute` (learn template + mirror), `adjustPickupTime`, `reorderRouteTrips`,
  `reassignEmployeeToVehicle`, `moveTripToRoute` (source+target), and `applyRouteCandidate`
  (route-analysis.actions) all call `mirrorRouteEditsAcrossWeek` after their update.
- **Replay**: `generateCorridorRoutes` (11 PM + 12 AM–6 AM only; 10 PM preset routes intentionally NOT
  replayed) now looks up `RouteTemplate` by (vehicleId, arrivalLabel) and calls `patternOrderForMembers`
  to ride pattern riders first + append new riders; legs/pickupTimes then computed on the replayed order.
  Does NOT re-add far→near sort (CORE INSTRUCTION intact) — extra riders stay in their corridor order.

Verified: migration applied, `npx tsc --noEmit` + eslint clean, server restarted (pid 20788, /login 200).
End-to-end scratch script (`_verify-template.ts`, deleted): learned a template from a real FINALIZED
"11 PM" Dhaka-Metro-Ga-33-9449 plan, `mirrorRouteEditsAcrossWeek` → 4 sibling draft days got WEEK_MIRROR
+ manual seq/times; then template rows cleaned up (system left pristine). No persisted template yet — the
first real learn is via Facilities finalizing in the UI. Backfill-from-existing-finalized option exists
(script) if wanted. Note: mirror also nulls sibling `routeAnalysis` + marks manual + writes WEEK_MIRROR
overrides — real past-week draft rows were touched during the test (harmless).

## Latest Session (2026-09-11i) — Bulk-upload home coordinates: lenient headers instead of silent drop
**User report:** "earlier i upload bulk creating profile but lat long not set, but csv have lat long info."
Diagnostic (`_check-bulk-coords.ts`, deleted): only 12 employees lack home coords — the 2 bulk=true ones
date 2026-07-20, predating coord support in `bulkCreateUsersAction` (coords landed in a0c64bf). The real
risk is SILENT DROP: header matching was exact-lowercase (`colIndex("homelatitude")`) and a partial/unparsed
coord cell just produced `NaN` → coords ignored with no skip reason.
Fix in `actions/user-management.actions.ts`:
- Header matching is now case/whitespace/punctuation-agnostic (`normalHeader`: strip non-alnum, lowercase):
  `homeLatitude`/`Home Latitude`/`home_latitude`/`LAT`; `homeLongitude`/`HOME_LONGITUDE`/`Long`/`lng`;
  other columns too (`name`, `employeeid`, `dept`, `contact`, `phone`, `pickup`, …).
- New combined coords column support: `Lat,Long` / `Home Lat/Long` / `latlong` / `coords` / `coordinates`
  → cell `"23.78, 90.41"` or `"23.7806 90.4070"` split via `splitCoordPair`.
- Partial/malformed pairs now SKIP the row with a reason (was silent); both-blank still means "no coords".
- New helpers: `parseCoordinateCell` (blank→null, malformed→NaN), `splitCoordPair`. Verified: logic unit-test
  (22/22 pass, script deleted), tsc, eslint clean. No schema change → no server restart needed: re-uploading
  the same CSV backfills coords via the UPDATE path (headers now tolerant).

## Latest Session (2026-09-11h) — User Info: per-row fixed-arrival ON/OFF service switch + inline arrival-time change
**User request:** "For fixed arrival employee: I need a turn off-on button in user info for each row
of fixed arrival users also arrival time selection for change arrival."
**Decision (asked):** OFF keeps the stored arrival time and just pauses service → added a separate
`User.fixedArrivalActive Boolean @default(true)` field (migration `20260911232301_add_fixed_arrival_active`).
- `ensureFixedArrivalSchedules` now also requires `fixedArrivalActive: true` (route-generation.actions.ts
  where-clause) — OFF users are excluded from mapping but keep their time for instant restore.
- `getEmployeeDirectory` exposes `fixedArrivalActive`; `app/facilities/user-info/page.tsx` gained a
  "Fixed arrival" column (dash for non-FIXED_ARRIVAL rows) rendering new client component
  `components/facilities/fixed-arrival-service-controls.tsx`: an ON/OFF pill switch
  (`role="switch"`, emerald when on) + a shadcn `Select` of `ARRIVAL_TIME_OPTIONS` + "Not set".
- New server action `updateFixedArrivalServiceAction(userId, { active?, arrivalTime? })` in
  actions/facilities-profile.actions.ts (guard FACILITIES/SUPER_ADMIN, role must be FIXED_ARRIVAL,
  arrivalTime validated via `normalizeArrivalTimeInput` + `ARRIVAL_TIME_OPTIONS`, "Not set" → null).
  Revalidates `/facilities/user-info`, `/employee/profile`, `/fixed-arrival/*`.
- Component = controlled no-sync pattern: parent keys it by
  `id:active:time` so `router.refresh()` remounts with fresh props (no state-in-effect — eslint treats
  `react-hooks/set-state-in-effect` as error); handlers optimistic with rollback + inline error.
Verified: tsc clean, eslint `--max-warnings=0` clean (note: pre-existing unused `ARRIVAL_VALUE_LABELS`
warning in route-generation.actions.ts:59 — NOT from this change), page returns 307 to /login
without a session (auth guard working) — user to eyeball UI in browser. Uncommitted (g + h pending).

## Latest Session (2026-09-11g) — Bulk employee upload now sets Fixed Arrival time
**User request:** "For fixed arrival employee, add column for bulk upload selecting arrival
time." Extended `bulkCreateUsersAction` (Super Admin + Facilities bulk upload) +
`components/super-admin/bulk-upload-dialog.tsx` (used on `/super-admin/users` AND
`/facilities/user-info`):
- New CSV column **`fixedArrivalTime`** (alias `arrivaltime` accepted). Blank cell = ignored.
  Value validated via `normalizeArrivalTimeInput` + `ARRIVAL_TIME_OPTIONS` membership
  (10 PM–6 AM whole-hour shuttle window); `"not required"` / `NONE` clears to null;
  out-of-window/invalid → row skipped with reason.
- Role-gated: only applies to `FIXED_ARRIVAL` rows. A real time on a non-FIXED_ARRIVAL row →
  row skipped ("fixedArrivalTime only applies to the FIXED_ARRIVAL role"); `not required` on a
  non-fixed row is silently ignored.
- Works on BOTH paths: CREATE sets `User.fixedArrivalTime`; UPDATE (existing account, incl.
  role-flip to FIXED_ARRIVAL) sets/clears it — non-blank cells win, blank keeps current, same
  convention as every other column. Facilities/Super Admin guard preserved.
- Dialog: template now has `fixedArrivalTime` right after `role`, an extra sample row
  (FIXED_ARRIVAL + "11:00 PM"), instructions updated (roles list now includes FIXED_ARRIVAL +
  CORPORATE_EMPLOYEE; fixedArrivalTime note; skip-row warning).
Verified: tsc clean, eslint `--max-warnings=0` clean, both pages → 200. Uncommitted (further
needed: user may want the single "Add employee" dialog to include the arrival select too).

## Latest Session (2026-09-11e) — Fixed Arrival Employee: creation flow confirmed + Facilities can change arrival + breakdown badge
**User asked "how to create a fixed-arrival employee profile"** and pasted the FIXED_ARRIVAL
requirements. Audit result: role/enum/home/prefix, `/fixed-arrival/*` pages + layout, one-time
picker (`saveFixedArrivalTime` locks once), `ensureFixedArrivalSchedules` (UTC week, APPROVED +
Mon–Fri), `employeeRole` on generated trips, day-sheet amber badge, and role-accent amber —
ALL already built (previous 2026-09-11 sessions; migration `20260911102412_fixed_arrival_employee_role`).
**How to create:** Super Admin / Facilities → Add employee → pick "Fixed Arrival Employee" role
(`createUserAction`/`bulkCreateUsersAction` accept any `ALL_ROLES`); employee signs in →
`/fixed-arrival/dashboard` → My Schedule → one-time picker locks the arrival. Mapping then
auto-includes them.
**Two gaps found + built:**
1. Generated-routes breakdown had no amber pill — added `Fixed arrival` badge in BOTH rows of
   `components/facilities/auto-route-planner-client.tsx` (mobile `<li>` + desktop `<tr>`),
   keyed on `trip.employeeRole === "FIXED_ARRIVAL"` (string, already in `GeneratedRouteTrip`).
2. "Only Facilities can change it" had no path — `getEmployeeDirectory` was `role: EMPLOYEE` only
   (fixed-arrival never appeared in User Info). Now: directory includes EMPLOYEE+`FIXED_ARRIVAL`
   and returns `role`/`fixedArrivalTime`; `updateEmployeeProfileByFacilitiesAction` widens guard
   to those roles and validates/clears `fixedArrivalTime` (normalized via arrival-times,
   `NO_TRANSPORT_VALUE` → clears to null); `edit-employee-profile-dialog.tsx` shows a "Fixed
   arrival time" select (options + "Not set") when role is FIXED_ARRIVAL — refactored to the
add-employee-dialog success-panel + resetKey pattern to fix a pre-existing react-hooks
    `set-state-in-effect` lint error; user-info page passes the props + shows an amber tag.
## Latest Session (2026-09-11f) — Planner maps: live reorder preview while dragging + Google-Maps-style route adjustment + taller maps
**User 3-point request on the Generated routes breakdown map:** (1) maps must adjust the routing as rows are dragged,
(2) Google-Maps-style drag-route-direction (click to add via points), (3) increase map height.
**Built — no schema change** (all in `components/facilities/route-map.tsx`, `components/facilities/auto-route-planner-client.tsx`,
`actions/route-analysis.actions.ts`, `lib/routing/route-analysis.types.ts`):
- **Height:** map container `h-72` → `h-96` in `route-map.tsx` + the dynamic-import loading skeleton.
- **Live drag preview:** module-level `activeDrag` (`{tripId,routeId}`) pinned at `dragStart`
  (`dataTransfer.getData` is unreliable mid-drag); row `onDragOver` computes the prospective order via
  `previewOrderOnRow` and only `setPreviewTripIds` when it actually changes; drag start also auto-opens the
  map + kicks a first analysis if none loaded. While `isPreviewing`, `mapStops` are built from
  `previewTripIds` (with `Object.fromEntries` — `Map` is a lucide icon in this file!), all candidate
  geometry/headings/totals are suppressed so the map falls back to its own OSRM fetch
  (`routeKey = route.id|preview-<ids>`), and an amber "Previewing the reordered route" banner shows.
  Drop clears preview + persists via existing `reorderRouteTrips`. Cross-route drop keeps `moveTripHere`.
- **Adjust mode:** "Adjust route" button (route editable only). `RouteMapClickCapture` (react-leaflet
  `useMapEvents`) inserts a draggable `ViaPoint` on map click; via markers have a Popup "Remove via point".
  The map re-routes `[...stops, ...viaPoints, office]` through OSRM (cached by `adjustKey` incl. vias),
  draws it **amber** (`#F59E0B`, weight 5), hides arrows/chips/ghost/candidate geometry while adjusting,
  shows "Re-routing…" while stale (`adjustStale = adjustDrawnKey !== adjustKey`), and reports results via
  `onAdjustReady(geometry, totals)`. Save → `saveManualGeometryAdjustment` persists a new **"manual"**
  candidate (copy of the applied/current candidate: same `order`/`stops`, updated `metrics.durationMin|distanceKm`,
  `score + 1`), sets `appliedCandidateId = "manual"`, writes `RoutePlanOverride changeType
  "ROUTE_GEOMETRY_ADJUST"` (before/after JSON incl. viaPoints+totals), revalidates planner pages.
  Cancel clears via points. Compare panel hidden while adjusting.
- **Refactor learnings:** spread `{...analysis}` off a narrowed Prisma JsonValue throws TS2698 →
  rebuild the JSON object field-by-field. `new Map()` collides with the `Map` lucide icon (file-wide).
  The project's eslint treats `react-hooks/set-state-in-effect` as an **error** → setState only inside
  promise callbacks / event handlers (no synchronous setState in effects). Child effect deps must be
  stable `useCallback` handlers (or the onAdjustReady feedback loop spins forever).
- **Candidate defaults:** `preferredCandidate(route)` now honors `appliedCandidateId` ("current" |
  "current_sided" | "optimized" | "manual") instead of always "current"; fresh `runAnalysis` resets to "current".
Verified: `npx tsc --noEmit` clean, eslint `--max-warnings=0` clean, `/facilities/automated-route-planner`
+ `/facilities/route-planning` → 200, no Prisma migration. Uncommitted.

## Latest Session (2026-09-11d) — Corridor ORDER rewrite: nearest-hop chain, no far→near sort, 2 km growth detour guard
Facilities reported the drawn 11 PM routes zigzag / don't pick nearest-next, and a 4th rider
"force-assigned" scrambled a route that was first drawn (vehicle Dhaka-Metro-Cha-19-3742,
8/3/26: stop 2 was the 2nd-farthest, but the house NEAREST to stop 1 should have been stop 2).
Root cause + fix (all in `lib/routing/algorithms.ts` → `planCorridorRoutes`):
1. **Deleted the final `route.order.sort(... by toOfficeKm desc)`** — the visit order is now
   exactly the nearest-hop chain the planner grows: farthest anchor first, then each stop
   NEAREST (by road minutes) to the previous one. Drawn direction now follows the corridor.
2. **Office-direction check now uses ROAD KM and compares to the CURRENT END stop too**
   (`m.toOfficeKm ≤ end.toOfficeKm + SLACK` AND ≤ `anchor.toOfficeKm + SLACK`) — kills the
   per-hop zigzag; anchor distance now `anchor.toOfficeKm` (was haversine).
3. **New `GROWTH_MAX_DETOUR_KM = 2` guard**: a candidate whose end→home→office road is more
   than 2 km longer than end→office is SKIPPED (break) and left for corridor attach (judged
   on real OSRM geometry, ≤ CORRIDOR_ATTACH_KM 0.8 / CORRIDOR_MAX_DETOUR_MIN 7) or a later
   vehicle. On-path same-arrival homes always pass (tiny detour) and still join via attach.
Verified: `npx tsc --noEmit` clean, `npx eslint lib/routing/algorithms.ts --max-warnings=0`
clean, 19/19 unit tests pass, `/facilities/automated-route-planner` 200. Re-check the
8/3/26 + 2026-08-24 drawn routes after the user re-runs mapping. CORE INSTRUCTION updated
to match (previously mandated re-adding the sort — do NOT bring it back).

## Latest Session (2026-09-11c) — Checklist completed: drag rows + editable pick-up times + per-vehicle Finalize in Generated routes, old route-sheet deleted
**User asked "how much of this is fulfilled, build the remaining":** (1) vehicles-wise employee row dragging in the
"Generated routes — Day & vehicle breakdown" breakdown (after mapping), deleting the previous route-sheet drag on
Pick Schedule; (2) generated pick-up times must be editable; (3) a **Finalize** button per vehicle so the schedule
goes draft → finalized. Assessment: the planner client (`auto-route-planner-client.tsx`) already had the handler
FUNCTIONS but they were NOT wired into the rows (dead code), and the old `schedule-sheet.tsx` drag was removed.
Built the rest; tsc + eslint clean; `/facilities/automated-route-planner` + `/facilities/route-planning` both 200.
1. **Wired the sheet interactions** into `GeneratedRouteCard` (desktop table `<tr>` + mobile `<li>`):
   - **Drag a row** → `rowDragProps` (draggable, grip icon, `cursor-grab`): drop on another row of the SAME
     vehicle = `reorderRouteTrips` (sequence + pickup-time recalc from the arrival window); drop on a row of a
     DIFFERENT vehicle (or its header, `cardDropProps` highlight) = `moveTripToRoute` (validates same day +
     same arrival window + capacity, re-times source & target). Drag source travels in the HTML5 `dataTransfer`
     JSON payload (`readDragPayload`) — NO shared React state/ref (avoids `react-hooks/refs`/`immutability` lint).
   - **Editable pick-up time** → `timeEditor` (inline `<Input>`, blur/Enter saves via `adjustPickupTime`, resets
     `emailSentAt` so re-finalize re-sends). Client + server normalize "9:05" → "09:05"; server regex now accepts
     1–2 digit hours (was `HH:mm`-only, "9:30" would error).
   - **Finalize button** per vehicle card (DRAFT/UNDER_REVIEW only) → `finalizeRoute` (status → FINALIZED,
     emails riders in `after()`). New in-line `sheetMessage` banner shows ok/error for all sheet actions.
2. **Draft = the working sheet, Finalize = the commit/lock:** `editable = status is DRAFT|UNDER_REVIEW`. Client
   disables drag grips + time inputs when locked; server `adjustPickupTime`/`reorderRouteTrips`/`moveTripToRoute`
   reject non-draft routes with a clear message (draft → finalize → locked). Header `title` reflects the lock.
3. **"Delete previous one" completed:** `components/facilities/schedule-sheet.tsx` deleted; Pick Schedule page +
   `getScheduleSheet` removed from `lib/queries/route-planning.ts` (leftover type exports deleted); the 3 old
   sheet actions (`updateSheetPickupTime`/`moveSheetAssignment`/`swapSheetAssignments` + `SheetMutationState`/
   `normalizeSheetPickupTime`/`assignmentForDay` helpers) deleted from `actions/route-assignment.actions.ts`.
4. Note: this session's diff rides ON TOP of uncommitted work from an earlier same-day session (fixed-arrival role
   + planner drag handlers). Re-run RUN MAPPING to get fresh DRAFT plans, then edit/drag/finalize per vehicle.

## Latest Session (2026-09-11) — Route sheet drag-drop, analyzer rename, one-way late-night map, teaching bridge + diagnostics
**User (4 items, confirmed via questions):** (A) spreadsheet-style schedule: rows editable pick-up time, drag full row between vehicles; (B) analyzer shows only "Current (as drawn)" + optimized renamed by what it improves, remove Backtrack/Score columns; (C) 12 AM–6 AM map draws employee→office ONLY (hide office→first leg AND the departure chip); (D) fix pick-up times not following taught data + full "why this time" diagnostics.
**Built; tsc + eslint clean, 19/19 tests, dev server hot-reloaded (all pages 200).**
1. **D8 ROOT CAUSE + bridge** (`lib/routing/pickup-schedule.ts` `loadLearnedLegs`): manual-plan teacher binds keys to `pickupAddressId ?? homeAddressId` while generation uses resolved HOME address — mismatch = zero hits. Bridge: every learned `addr:X->addr:Y` leg is now ALSO indexed under each employee's other address (pickup↔home, both directions, via one User query). One fix covers 12AM-6AM generator, 10PM preset path, and pickup-point sync.
2. **A — Route sheet** (`components/facilities/schedule-sheet.tsx` new + `getScheduleSheet` in `lib/queries/route-planning.ts` + 3 actions in `actions/route-assignment.actions.ts`: `updateSheetPickupTime`, `moveSheetAssignment`, `swapSheetAssignments` — all `requireRole([FACILITIES, SUPER_ADMIN])`, reusing `upsertAssignmentForWeeklyDay` so changes still email riders). HTML5 DnD, NO new library: drag row→row = swap vehicle+time; drag row→vehicle card = move keeping time; time inline-edit persists instantly; optimistic UI with revert-on-error. Mounted on Pick Schedule page below RouteDaySheet.
3. **B — compare panel** (`route-compare-panel.tsx`): rows filtered to `current` + `optimized` only; new exported `optimizedLabel(base, cand)` renames optimized dynamically ("Different route — avoids backtracking / fewer U-turns / shorter drive / less distance / no clear gain"); Backtrack + Score columns + score footnote REMOVED; dialog title uses dynamic label. `route-analysis.ts` label "Optimized order"→"Different route". `defaultCandidate()` now always "current" (current_sided hidden).
4. **C — one-way late-night map** (`route-map.tsx`): `reqPts` for ALL topologies = stops→office (no leading office); `legTimes` unified chain-branch with override-slice compat (loop override length === reqPts.length → slice(1)); `trimOfficeStart()` cuts the office→first-stop road path from provided/ghost geometry; "Office → pickups → office" legend + "Office → first pickup +X min" chip REMOVED; `departureToFirstMinutes` prop kept in interface but no longer destructured/displayed. Schedule math untouched.
5. **D9 — diagnostics** (`actions/route-learning.actions.ts` `getRouteMemoryDiagnostic` + `components/facilities/route-memory-diagnostics.tsx` "Why these times?" dialog on the Route memory card): every leg (shift, from→to, avg/min/max, samples), trusted-vs-fallback badge ("Your time (trusted)" / "5 min/km estimate — teach more days"), bridged-employee count, and rule notes (3+ samples trusted; a full week of the same run = every leg trusted).
6. **Lint fixes applied:** unused `session` in swap action; `defaultCandidate()` no arg; `drawn` memoized in route-map (React Compiler preserve-manual-memoization); schedule-sheet prop-sync switched from useEffect to render-time derived-state adjustment (same pattern as planner client).
- **PENDING (user requested, not built yet):** new employee type/role with ONLY Dashboard + My Schedule + Profile, NOT under operations, whose requested arrival time is ONE-TIME selectable then LOCKED until Facilities changes it (Facilities-initiated change) + "add a column for select arrival". Needs schema/role-gate/route-plan implications — ask about role name & locking UX before building.

## Latest Session (2026-09-09) — "Teach from manual plan": CSV ingest trains route memory
**User:** automated route plan pickup times not regular; wants to feed MANUALLY made route plans so
the system learns perfect pickup times. Decision: CSV format + full ingest into the existing
route-learning pipeline. Built; 8/8 unit tests, tsc + eslint clean, migration applied, server restarted.
1. **Schema — `ManualRoutePlanEntry`** (migration `20260909164445_manual_route_plan_entries`):
   id, date (UTC midnight), shiftKey, vehicleNumber, employeeId→User (+relation `manualRoutePlanEntries`),
   addressId? (learning-key source), pickupLabel, pickupMinutes (0..1439), orderIndex?, officeLabel,
   arrivalMinutes (may be ≥1440 conceptually; stored 0..1440 raw), sourceFile?.
   Unique `(date, shiftKey, vehicleNumber, employeeId)` → re-upload of same CSV is an upsert (idempotent).
2. **`lib/routing/manual-plan-training.ts`** (pure, tested): `parseClockTime` ("20:35" or "8:35 PM",
   24:00 allowed), `shiftKeyForShiftLabel` ("10 PM"/"11PM"/"12 AM".."6 AM"/"late night" → shiftKey),
   `legObservationsFromManualEntries` — groups rows per date+shift+vehicle, orders stops
   chronologically via `rotateForChronology` (largest circular gap = midnight wrap; handles
   late-night runs crossing midnight), emits pickup→pickup + last→office observations, gap range
   1..240, issues reported per group (never throws). Tests: `npx tsx --test lib/routing/__tests__/manual-plan-training.test.ts`.
3. **`actions/manual-route-plan.actions.ts`** — `importManualRoutePlanCsv`: requireRole
   FACILITIES/SUPER_ADMIN, parseCsv, header matching case/space-insensitive; REQUIRED
   date/shift/vehicleNumber/employeeEmail/pickupTime/officeArrival; optional
   employeeName/pickupPoint/visitOrder/office. Employee resolved by email (insensitive) else exact
   fullName; addressId = pickupAddressId ?? homeAddressId (row skipped w/ reason if none);
   pickupLabel = CSV pickupPoint || user.pickupPoint || address label/text; officeLabel = CSV office
   || user.officeLocation || Regnum. Upserts rows then calls `trainRoutePlannerFromHistory()` so
   route memory refreshes immediately. Returns {stored, updated, skipped[], learning?}.
4. **`actions/route-learning.actions.ts`** — `trainRoutePlannerFromHistory` now ALSO loads all
   `ManualRoutePlanEntry` rows and merges their leg observations into the same `aggByKey` before the
   deleteMany+createMany, so manual knowledge survives every automatic retrain (RUN MAPPING).
   `getRouteLearningStats` + `RouteLearningStats` gained `manualEntryCount`.
5. **UI** — `components/facilities/manual-plan-upload-dialog.tsx`: "Teach from manual plan" dialog
   (Download template via ExportCsvButton + upload + stored/updated/skipped report + learning
   summary), placed in the Route memory card of `auto-route-planner-client.tsx`
   (`refreshLearningStats` callback refreshes stats after import; card text updated;
   stats line shows "· N manual-plan rows" when > 0).
6. NOTE: the planner's 11 PM far→near CORE rule untouched — this feature only feeds better leg
   TIMES into `RouteLegLearning` (used by pickup-schedule + corridor back-calc).
7. **Bulk profile upload: all fields optional except fullName + email** (`actions/user-management.actions.ts`
   + dialog text, user request). CSV columns unchanged; blank cells = leave empty (fill later from
   User Info). role blank → EMPLOYEE; password blank → generated 16-char temp (`randomBytes(8).hex`)
   emailed via credentials mail (`passwordPlainByLine`); provided password still needs ≥8 chars.
   home lat/long: provided+valid → address upsert updates lat/lng; absent → existing address linked
   untouched, brand-new address text → no homeAddressId link (Address.lat/lng NOT NULL).
   employeeCode/department/contactNumber/address/pickupPoint stored as null when blank; dup/existing
   checks only run for non-blank employeeCode. Header check now requires only fullName+email columns.
   **UPDATE-existing mode** (2026-09-09 follow-up): rows whose email already exists are UPDATED with
   non-blank CSV values (blank cells keep current value); report shows "updated N existing";
   role/employeeCode conflicts & Facilities-can't-touch-SUPER_ADMIN guards added; `resolveHomeAddressId`
   helper (address-cache incl. no-coords variant).
8. **Manual-plan CSV import hardening** (user's 653-row file): `parseClockTime` now accepts
   `h:mm:ss AM/PM` and `HH:mm:ss` (Excel time-with-seconds); shift column accepts an arrival clock
   time (`10:30 PM` → shiftKey via new `shiftKeyFromClockTime` + fills officeArrival when blank);
   date accepts Excel formats via `toDateUtcMidnight` (YYYY-MM-DD, DD/MM/YYYY day-first, DD Mon YYYY);
   blank vehicleNumber → row still teaches last-pickup→office gap as single-stop `__row_<line>` run;
   result shows `read: N data rows` + "Read N data row(s) from the file". 9/9 unit tests.
   Remaining skip causes in the real file: ~60 accounts without pickup/home address,
   ~160 `jamie.rivera*@example.com` sample emails + `#n/a`/`#ref!` (no account),
   4 × `6:00 PM` (no 6 PM evening shift yet — user to confirm desire).

## Latest Session (2026-09-08) — Email delivery monitor: per-row status, Email log page, resend
**User:** after Facilities fills driver + pick-up time and "Save all" on Pick Schedule,
some employees (e.g. utcha.barua / hamim.golder / niaz.makdum @commure.com) didn't get the email. Wants
to KNOW when a notification wasn't triggered. Built; tsc + eslint clean; no test run; committed + pushed.
1. **Diagnosis:** all 2026-09-07 assignments had `emailSentAt` stamped (delivery ATTEMPTED for everyone),
   and local SMTP creds (hamim.golder@commure.com + app password) authenticate fine. So the gap was
   OPACITY: `after()` + `sendMailBackground` swallow SMTP errors and `emailSentAt` was stamped even on
   failure — there is no record of actual delivery. (May also be spam filters / prod SMTP differs.)
2. **Schema — `EmailNotificationLog`** (migration `20260907173706_email_notification_log`):
   id, kind (`ROUTE_ASSIGNMENT_WEEKLY`/`ADHOC`/`RESEND`), recipient, recipientName, subject,
   status (`PENDING`/`SENT`/`FAILED`/`SKIPPED_DEV`), error?, routeAssignmentId? (SetNull), createdAt/updatedAt.
3. **Mailer** — added `trySendMail()` in `lib/mailer.ts`: returns `{status,error}` instead of throwing
   (SENT / SKIPPED_DEV / FAILED). `sendMailBackground` untouched for the other flows.
4. **`actions/route-assignment.actions.ts`** — replaced the inline emails with a shared
   `dispatchAssignmentEmail()`: creates a PENDING log row synchronously → `after()` does
   `trySendMail` → updates log to SENT/FAILED(+error) → stamps `RouteAssignment.emailSentAt` ONLY on SENT → revalidates.
   Duplicate-email guard: only dispatch when the assignment is new / vehicleDriver or pickupTime changed /
   `emailSentAt` is null (re-saving the same row no longer re-spams). Added `resendRouteAssignmentEmail`
   (awaits the send; returns outcome) for one-off re-dispatch of FAILED rows.
5. **Shared template** — new `lib/email-templates.ts` `transportArrangedEmail({kind, employeeName, date,
   driverName, contactNumber, vehicleNumber, pickupTime})` (weekly + adhoc), used by dispatch + resend.
6. **Day sheet** (`lib/queries/route-planning.ts` + `components/facilities/route-day-sheet.tsx`) — added
   `emailStatus` per row (from latest `EmailNotificationLog`, else `emailSentAt`, else `NOT_SENT`) and an
   "Email" column badge: Sent / Sending… / Failed / Dev skip / Not sent. Auto `router.refresh()` after Save all.
7. **Email Log page** — `app/facilities/email-log/` (nav "Email Log", lucide `Mail` icon added to
   `nav-sidebar.tsx` + `mobile-nav.tsx` ICONS maps): status filter pills (ALL/SENT/FAILED/PENDING/SKIPPED_DEV),
   failure banner count, table with time/employee/recipient/subject/status, **Resend** button on FAILED rows
   (`components/facilities/email-log-table.tsx`; calls the server action directly → `router.refresh()`).
8. **Role gate**: page + resend use `requireRole([Role.FACILITIES, Role.SUPER_ADMIN])`.
9. NOTE: email log only records FUTURE sends; the 57 legacy 2026-09-07 assignments show "Sent" in the day
   sheet via `emailSentAt` but have no log rows. Re-save a changed detail to get a tracked attempt.
   Vercel prod: SMTP vars already present; new migration must run (`vercel` deploy handles it).
   `lib/` files are gitignored (`git add -f`).
10. Refactor opportunity (not done): `route-override.actions.ts` `finalizeRoute` still uses the old
   `Promise.allSettled(sendMailBackground)` + TripAssignment.emailSentAt pattern — could adopt the log too.

## Latest Session (2026-09-07) — Route analysis: side of road per stop + order comparison
**Built; TypeScript, ESLint, 10 unit tests, real-data dry run and browser Apply verified.**
Problem: the route map looped around dividers / U-turned because only the FIRST waypoint had
an OSRM `bearings` constraint (Zigatola pin on the wrong carriageway for a Dhanmondi 15 next
stop). Decisions with the user: employee home / pickup point stays the stop, the system picks
the carriageway; scope = 10 PM preset + 11 PM/late-night; **stay on the public OSRM demo
server** (so `approaches=curb` is unusable — it assumes right-hand traffic; ~1 req/s ⇒ analysis
runs on demand per route, ≈4 requests, not inside RUN MAPPING); far→near default kept, optimizer
may propose a better order shown side by side (see CORE INSTRUCTION point 6).
1. `lib/routing/side-selection.ts` (pure): two heading candidates per stop (road axis `h` from
   an unconstrained `/route?steps=true` pass, and `h+180`, range 60°, radius 70 m); ONE
   `/table` over all candidates; `chooseSides` = Viterbi DP picking the side per stop that
   minimizes total drive; `searchOrder` = exhaustive permutations (≤ 7 stops) else Or-opt,
   priced jointly with sides; `scoreRoute` = minutes + 3/U-turn + 2/loop-around + 5/backtracked
   km (repeated OSM node-id edges from `annotations=nodes,distance`), plus detour ratio and
   far→near violations. Tests: `npx tsx --test lib/routing/__tests__/side-selection.test.ts`.
2. `lib/routing/route-analysis.ts` — `loadAnalysisInput` (trips → physical stops, shared
   coordinates collapse; `inputHash` of order+coords) + `computeRouteAnalysis` → candidates
   `current` (as drawn today), `current_sided`, `optimized` (omitted when order unchanged);
   NoSegment → drop that candidate and retry the table; total failure → unconstrained fallback.
   Types in `route-analysis.types.ts` (client-safe).
3. `actions/route-analysis.actions.ts` — `analyzeRoutePlan(id,{force})` cached on
   `RoutePlan.routeAnalysis Json` while `inputHash` matches; `applyRouteCandidate(id, cand,
   {alsoUpdatePresetSequence})` re-sequences trips, back-calculates pickup times from the shift
   arrival with the candidate's real leg minutes (`backCalculatePickupMinutes`, 5-min grid,
   ≥ 5 min gaps), stores `TripAssignment.approachBearing/snappedLat/snappedLng`, sets
   `RoutePlan.appliedCandidateId` + departureTime (dynamic routes), writes a
   `RoutePlanOverride ROUTE_OPTIMIZED`; for PRESET_10PM can push the order into
   `reorderPickupPoints` (remaining active points appended).
4. Schema/migration `20260907001909_route_analysis`: `RoutePlan.routeAnalysis Json?`,
   `appliedCandidateId String?`; `TripAssignment.approachBearing Int?`, `snappedLat/Lng Float?`.
5. `lib/routing/osrm.ts`: `OsrmError` (400 body `{code,message}` + coordinate index),
   `getTableWithConstraints`, `getRouteDetailed` (steps + node annotations + GeoJSON), and a
   **unit fix** in `fallbackElement` (duration was minutes, everything else is seconds).
   `utils.ts`: `bearingsParam`, `radiusesParam`, `normalizeHeading`, `headingDifference`,
   `parseNoSegmentIndex`. `schedule-math.ts` (pure): grid snap + `backCalculatePickupMinutes`,
   re-exported by `pickup-schedule.ts`; `algorithms.ts` now calls it (behaviour unchanged).
   `route-shifts.ts`: `isLateNightArrivalLabel`, `arrivalMinutesForLabel`.
6. UI: `components/facilities/route-compare-panel.tsx` (classic table: Show radio · Route ·
   Stop order · Drive · Distance · U-turns · Backtrack · Score · Apply, Recommended/Applied
   badges, confirm dialog with the preset-sequence checkbox). `route-map.tsx` takes
   `geometry`, `legMinutesOverride`, `stopHeadings` (cyan chevron = direction the vehicle faces
   at the stop, at the snapped road-side position, popup "Stop facing NW (316°)"),
   `ghostGeometry` (dashed grey current route while previewing another); topology now via
   `isLateNightArrivalLabel`. `auto-route-planner-client.tsx`: opening a route map runs
   `analyzeRoutePlan` (cached ⇒ instant), radio switches the drawn candidate, Apply → silent
   `loadDetails` + `runAnalysis(true)`; stale "How mapping executes" copy fixed.
7. Verified on week 2026-08-24: e.g. Cha-19-9425 10 PM 21.7 → 19.3 min, 4 → 3 U-turns with
   sides only; 12 AM route 1 → 0 U-turns, backtrack 0.65 → 0.14 km; one loop route got worse
   with sides and the score correctly kept `current`. Applied `optimized` on Cha-19-9425 11 PM
   day 0 (test data): order Zuhayer → Yusra → Shamim → Tazruna, times 22:35/22:40/22:45/22:50.
   Neon latency makes analyze ≈ 12–16 s and apply ≈ 17 s wall-clock from the browser.
Follow-ups: "Optimize all routes for a day" button; driver day-sheet/email showing the stop
side from `approachBearing`; `approaches=curb` becomes possible only with a self-hosted OSRM
(Bangladesh extract + left-hand `driving_side`).

## Latest Session (2026-09-07b) — Route-mapping optimization (user's 3-point brief)
**Built; tsc + eslint + 10 unit tests verified; real-data dry run on 2 weeks; dev server restarted (fresh .next), planner page 200.**
User brief: (1) direction at a stop must start toward the NEXT stop regardless of the pin's
road side (Zigatola case); (2) employee-home selection must avoid zigzag/backtracking;
(3) when a route is selected, compare candidates and keep the optimized one. Confirmed with
the user: visiting order stays strictly far → near (CORE INSTRUCTION intact); metrics shown
on the card for judging; "stateling" = zigzag/backtracking.
1. **Per-waypoint bearings (map fetch)** — `components/facilities/route-map.tsx`:
   `waypointBearingsParam()` (local) now constrains EVERY stop's outgoing heading to the
   bearing toward the NEXT point (±45°), last waypoint free, duplicate consecutive points
   unconstrained (no fake 0°). `fetchRoadGeometry` = constrained request first, then ONE
   unconstrained retry when OSRM can't route under the constraints (genuine U-turn is the
   only option), then straight-line fallback — the map never disappears. Result now carries
   real OSRM `totalKm/totalMin` (`RoadGeometry`), shown in the footer as "Road: X min · Y km"
   (new `roadTotals` prop; auto-route-planner passes the analysis candidate's metrics there).
2. **`lib/routing/utils.ts`**: replaced `initialBearingParam` with `waypointBearingParam(headings[], range)`
   (array API; `""` when nothing constrained). `osrm.ts` `getRoutePolyline` uses
   `waypointBearingParam([initialBearing, null], range)`; `optimizeRoute` (/trip TSP) still
   constrains ONLY waypoint 0 (the trip reorders stops, so per-waypoint headings are
   unknowable at request time) + duplicate-point guard; added local `bearingDegLocal`.
3. **Zigzag guard in path growth** (`lib/routing/algorithms.ts` `planCorridorRoutes`):
   new `dKm` matrix arg; a hop is skipped when road km > `MAX_ROAD_VS_STRAIGHT` (2.5) ×
   straight-line km (barrier/rail/lake/one-way hop would force a detour-and-backtrack);
   among the survivors the FASTEST BY ROAD TIME (`dMin`) hop wins (was: straight-line
   nearest). `GROUPING_RADIUS_KM` 2.0 stays the hard straight-line ceiling. Far-first
   anchor, office-slack check, capacity, final far→near sort — all untouched.
4. **Least-detour attach (route judging)**: the corridor sweep now COMPARES every
   (route, home, position) candidate and applies the one adding the fewest detour MINUTES
   for the onboard riders (tie-break: nearest road distance). Caps unchanged:
   `CORRIDOR_ATTACH_KM` 0.8 road-polyline distance, `CORRIDOR_MAX_DETOUR_MIN` 7.
   `generateCorridorRoutes` passes the already-computed `dKm` to the planner.
5. Dry-run (temp `_sim-corridor-opt.ts`, deleted; NO DB writes) on weeks 2026-09-06T18:00Z
   (Sep 7, 15 riders day 0) and 2026-08-24T00:00Z (Aug 24 — NOTE: this week's key is UTC
   midnight, not the Dhaka offset): every route strictly far → near by `toOfficeKm`
   (0.05 km tolerance), zero planner errors, sensible groups (e.g. 15 riders → 5 routes,
   2 full). Day-sheet totals printed per route for before/after judging.
6. Route card/compare judging comes from the (2026-09-07) analysis panel + the new footer
   road totals. No schema change this session → only the standard restart was needed.
   **User should re-run RUN MAPPING** to regenerate stored plans with the new grouping.

## Latest Session (2026-09-06) — Route-setting vehicle selection and shift pinning
**Built; TypeScript and ESLint verified.**
1. **Pickup sequence UI** (`components/facilities/route-setting/route-setting-client.tsx`):
  - Renamed the panel heading to **"Select vehicle and set settings"**.
  - Removed the instructional description below the heading.
  - Added vehicle-number search with a search icon and no-match state.
  - Vehicle numbers use regular black text when unselected; the selected vehicle uses teal text and a teal-soft row highlight.
  - Added a trash-icon delete button to every pickup-point row. It calls the existing soft-delete action
    (`deletePickupPoint`), updates local state, marks the sequence dirty, and shows success/error toasts.
  - Up/down reorder controls remain available beside the delete control.
2. **Cross-panel vehicle selection**:
  - `selectedVehicleId` is shared by the pickup sequence and `Vehicle → route pinning` table.
  - Clicking a vehicle in either panel selects it; the corresponding vehicle row in the other panel is highlighted.
3. **Route-generation pin behavior** (`lib/routing/algorithms.ts`):
  - `generateCorridorRoutes` already uses active vehicle pins for 11 PM and late-night dynamic routes.
  - `generate10PMRoutes` now reads active `"10PM"` pins and only creates preset routes for pinned vehicles when 10 PM pins exist.
  - A vehicle pinned for both 10 PM and 11 PM is therefore eligible in both planning passes; 10 PM still requires the employee's active pickup point to belong to that vehicle.
4. Validation command passed:
  - `npx tsc --noEmit`
  - `npx eslint components/facilities/route-setting/route-setting-client.tsx lib/routing/algorithms.ts --max-warnings=0`

## Latest Session (2026-09-06b) — Compact vehicle list with driver names
**Built; TypeScript and ESLint verified.**
1. Updated `components/facilities/route-setting/route-setting-client.tsx`:
  - Vehicle rows are more compact (`px-3 py-2`, tighter row spacing).
  - Removed pickup-point counts from the vehicle list.
  - Displays `VehicleRow.driverName`, sourced from the Vehicles & Drivers data; shows
    `Driver not assigned` when no driver is linked.
  - Added an independently scrollable vehicle list (`max-h-[24rem] overflow-y-auto`) so all vehicles remain accessible.
2. Validation passed:
  - `npx tsc --noEmit`
  - `npx eslint components/facilities/route-setting/route-setting-client.tsx --max-warnings=0`

## Latest Session (2026-09-06c) — Match route-setting drivers from master list
**Built; TypeScript and ESLint verified.**
1. Fixed the driver-name source in `app/facilities/route-setting/page.tsx`:
  - Loads active `vehicleDriver` records from the Vehicles & Drivers master list.
  - Matches records to route-setting vehicles by normalized vehicle number (trimmed and uppercased).
  - Passes the matched master-list `driverName` into `RouteSettingClient`; falls back to the vehicle record only when no master-list match exists.
2. The compact vehicle list now displays the driver associated with the same vehicle number shown in Vehicles & Drivers.
3. Validation passed:
  - `npx tsc --noEmit`
  - `npx eslint app/facilities/route-setting/page.tsx components/facilities/route-setting/route-setting-client.tsx --max-warnings=0`

## Latest Session (2026-09-06d) — Vehicles & Drivers is route-setting source
**Built; TypeScript and ESLint verified.**
1. Updated `app/facilities/route-setting/page.tsx` so active `VehicleDriver` master records are the source of the route-setting vehicle list.
2. Each active master record is automatically upserted into the routing `Vehicle` table by vehicle number:
  - Existing routing settings, pickup points, and shift assignments are preserved.
  - New master vehicles receive routing defaults (`STANDARD`, capacity `4`, office `Regnum`) and then appear automatically.
  - Driver name and contact are synchronized from the master record.
3. Route Setting now lists only active vehicle numbers present in Vehicles & Drivers; vehicles created only in the routing table are no longer shown.
4. Removed the additional Add vehicle control and unused create-vehicle form/callbacks from `components/facilities/route-setting/route-setting-client.tsx`.
5. Validation passed:
  - `npx tsc --noEmit`
  - `npx eslint app/facilities/route-setting/page.tsx components/facilities/route-setting/route-setting-client.tsx --max-warnings=0`

## Latest Session (2026-09-06e) — Reuse dual-pinned vehicles from 10 PM into 11 PM
**Built; TypeScript and ESLint verified.**
1. Root cause found in `lib/routing/algorithms.ts`: `generate11PMRoutes` was passing `reuse10PM = false` with no completed 10 PM route list, so a vehicle pinned for both shifts could appear only as an independent 11 PM route.
2. Fixed `generate11PMRoutes` to load that day's completed 10 PM routes and enable ordered reuse.
3. Updated corridor pooling so when a vehicle is pinned for both 10 PM and 11 PM:
  - The 10 PM route is generated first.
  - The same vehicle is selected for 11 PM when eligible.
  - The 11 PM route stores `previousRoutePlanId`, linking it to the completed 10 PM route.
  - Existing pin filtering remains in effect when 11 PM pins are configured.
4. Validation passed:
  - `npx tsc --noEmit`
  - `npx eslint lib/routing/algorithms.ts --max-warnings=0`

## Latest Session (2026-09-06f) — Verified Sep 7 dual-pin data for Cha-20-1016
**Investigated; no code change required.**
1. Database verification for `Dhaka Metro Cha-20-1016`:
  - The vehicle is correctly pinned for both `10PM` and `11PM` for the Sep 7 week. The stored week key is `2026-09-06T18:00:00Z` because the application stores Asia/Dhaka midnight in UTC.
  - The vehicle has five active pickup points.
  - There are 11 approved 10 PM schedules and 15 approved 11 PM schedules for Monday, Sep 7.
  - None of the 11 approved 10 PM employees have a pickup address matching this vehicle's five pickup points.
  - No routes have been generated yet for the Sep 7 week.
2. Result: the vehicle does not receive a 10 PM route because 10 PM preset routing requires an employee's active pickup point to belong to that vehicle. Since no 10 PM route exists, there is no completed first trip for 11 PM reuse.
3. To generate both trips, assign at least one approved 10 PM employee to one of this vehicle's pickup points, then run mapping again. The dual-shift reuse code will then link the 11 PM route to the completed 10 PM route.

## Latest Session (2026-09-06g) — First pickup time recalculates visible sequence
**Built; TypeScript and ESLint verified.**
1. Fixed `actions/route-setting.actions.ts` so `updateVehicle` returns the recalculated pickup-point ETAs after saving `firstPickupTime` or `baseETA`.
2. Scheduling failures are no longer silently swallowed during vehicle save; missing coordinates or invalid scheduling conditions return an error to the editor.
3. Updated `components/facilities/route-setting/route-setting-client.tsx` to merge returned ETAs into the visible pickup sequence immediately after saving, so later pickup points update without a refresh.
4. Validation passed:
  - `npx tsc --noEmit`
  - `npx eslint actions/route-setting.actions.ts components/facilities/route-setting/route-setting-client.tsx --max-warnings=0`

## Latest Session (2026-09-04b) — Auto Route Planner: auto-learn on RUN MAPPING + sidebar link
**Built; tsc + eslint verified. Committed locally on main (feat + docs commits; lib/routing/* + office-locations/route-shifts force-added). NOT pushed — push only when the human explicitly says so.**
1. **"Learn from history" is now automatic** — `generateWeeklyRoutes` (the RUN
   MAPPING action in `actions/route-generation.actions.ts`) calls
   `trainRoutePlannerFromHistory()` BEFORE clearing drafts/generating, so every
   mapping run replans with a freshly rebuilt learned set. A failed refresh
   never blocks mapping (the 5 min/km estimate is the fallback); outcome is
   returned in `GenerateRoutesResult.learning` and shown as an amber inline
   note in the result card when it fails.
2. **Manual button removed** from `components/facilities/auto-route-planner-client.tsx`
   (with `learnFromHistory` fn, `learning` state, `useToast`/`toast` — toast was
   only used there). Route memory card now reads "Automatic — no button needed",
   "Not trained yet — runs automatically on your next mapping", and refreshes
   stats via `getRouteLearningStats()` after each run. Running-indicator text
   mentions the memory refresh first.
3. **Auto Route Planner was invisible in the UI** — files existed on disk but the
   Facilities sidebar (`app/facilities/layout.tsx`) had NO nav link. Added
   "Auto Route Planner" → `/facilities/automated-route-planner` (icon key
   `automation`) between Pick Schedule and Ad-hoc Transport. Note: layout guard
   is still `requireRole([Role.FACILITIES])` only (page allows SUPER_ADMIN too).
4. **Discovery — the whole route-planner feature is UNTRACKED in git**:
   `actions/route-{generation,learning,override,setting}.actions.ts`,
   `app/facilities/{automated-route-planner,route-setting,pickup-point-coordinates}/`,
   `components/facilities/{auto-route-planner-client,route-map,vehicle-pickup-points-manager,pickup-point-coordinates}.tsx`,
   `components/facilities/route-setting/`, `components/ui/searchable-combobox.tsx`,
   plus ALL of `lib/` is gitignored (`.gitignore:13`) so `lib/routing/*` isn't
   tracked either → a fresh clone would have NO planner. Needs a deliberate
   commit (`git add -f` for lib files) — awaiting human go-ahead.

## Latest Session (2026-09-04) — Ad-hoc copy/note actions; day-sheet + weekly CSV ordered by arrival time
**Built; tsc + eslint clean; dev server restarted (fresh .next) + logged in-routes 200; log clean. Committed + pushed: 4304ad7 (band resized), 9e3af94 (this session's features).**
1. **Ad-hoc band resize + readability** (`components/facilities/adhoc-list.tsx`):
   - Middle arrival column `7rem → 5rem`; right assignment panel `20rem → 25rem`; band height `h-20 → h-24`
     (fixed-height row now fits name/address/contact/pickup + icon row + assignment form).
   - Address + pick-up line bumped `text-xs → text-[13px] font-medium`, tightened `gap-[3px]`/`py-1.5` so the
     address row never gets clipped by the fixed band (was accidentally hidden before).
2. **Comobobox dropdown no longer clipped** (`components/facilities/vehicle-driver-combobox.tsx`): the driver list is now
   rendered through a **React portal at `position:fixed`** (computed from the trigger's bounding rect) so it overflows the
   `overflow-hidden` fixed-height band instead of being cut off; still `max-h-[10rem] overflow-y-auto`; closes on outside-click/scroll.
3. **Note box → message icon + copy icon**:
   - NEW `components/facilities/adhoc-actions.tsx` (client): `NoteComposer` (message icon → Radix Popover with textarea +
     Send; posts comment-only to `assignRoute`, saving `facilitiesComment` — same field the employee sees on their adhoc page)
     and `CopyDetailsButton` (copy icon → clipboard text `Employee / Address / Pick-up / Driver`; green check on success).
   - `components/facilities/assignment-form.tsx` `variant="panel"` no longer has an inline comment input; removed from panel row.
   - Copy now uses **live form values**: combobox gained `onSelect` (reports chosen option); time Input/Select report
     `onChange`/`onValueChange`; new `LiveSelection` type + `actions` prop is a render prop `(live) => ReactNode`:
     copy reads `live.pickupTime || saved.pickupTime` and `live.driverName || saved.driverName` (falls back to saved assignment
     only when field empty). So copy works before Save.
   - Copy + message icons placed **beside the Save button** (row alignment), and also rendered beside "Edit" in the collapsed
     (existing-assignment) view via the same `actions` render prop.
4. **Arrival-time ordering** (Pick Schedule, user: "10 PM first, then 11 PM, then remaining"):
   - `lib/queries/route-planning.ts`: `getDaySheet` rows now sort by `arrivalTime` via new `arrivalSortIndex`/`sortByArrival`
     (order 22→23→0→…→6; empty/null sorts last). Exported reusable `compareArrivalTimes`.
   - `app/facilities/route-planning/page.tsx`: weekly CSV export rows (`exportSchedules`) sorted by **Monday's** requested
     arrival using `compareArrivalTimes`, so the export matches the sheet's presentation order.
5. **Gotcha hit — server→client function prop:** `adhoc-list.tsx` was a SERVER component but passed `actions={(live)=>…}`
   (a function) to the client `AssignmentForm` → runtime error "Functions cannot be passed directly to Client Components".
   **Fixed by adding `"use client"` to `adhoc-list.tsx`.** (tsc didn't catch it.)
6. Left `frontend/package*.json` (`date-fns`, unrelated scaffold) UNSTAGED — not part of this work.
7. Open (unchanged): Operations notification email still not shared → `OPERATIONS_NOTIFICATION_EMAIL` env/constant to be set later.

## Latest Session (2026-09-03i) — Account creation: credentials email + validation + facilities role lock; immediate address/contact changes; delete profile-approval module
**Built; tsc + eslint clean; schema migrated + client regen; build OK; dev server restarted (clean). Committed + pushed (b50751b, plus c9f6ae2 for prior task).**
1. **New-user credentials email** — `lib/mailer.ts` gained `sendCredentialsEmail({to, fullName, password})`
   (HTML table of email+password, cyan brand). `createUserAction` fires it via `after()` (matches existing pattern).
2. **Bulk upload individual emails** — `bulkCreateUsersAction` collects `createdCredentials[]` in the loop, then
   `after(() => Promise.allSettled(createdCredentials.map(sendCredentialsEmail)))` — ONE email per created user.
   Also: Facilities cannot bulk-create SUPER_ADMIN rows (skipped).
3. **Field validation (both server + client `pattern`/`type`)** for create-user form: employeeCode = **no format
   validation** (only "required"; the 9-digit rule was removed 2026-09-09 at user request — any value accepted),
   contactNumber = exactly 11 digits (`/^\d{11}$/`), email = basic regex; email placeholder `name@commure.com`.
3b. **Facilities User Info → Edit dialog** (`EditEmployeeProfileDialog` / `updateEmployeeProfileByFacilitiesAction`)
   now also edits **Full name** (required) and **Employee ID** (optional, any format — blank clears it; duplicate
   IDs rejected with a friendly error since `User.employeeCode` is UNIQUE). Page passes `employeeCode` prop down.
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

## Latest Session (2026-09-08) — Bulk upload performance optimization
**Both bulk uploads optimized; tsc --noEmit + eslint clean. NOT committed. No schema change / migration needed.**
1. **`actions/weekly-schedule.actions.ts` — `bulkUploadWeeklySchedules`:**
   - Employees now pre-fetched in ONE `user.findMany({ email: { in: [...] } })` → Map (was 1 findUnique/row).
   - `weeklySchedule` handled with a single `upsert` (was findUnique + create + update = 3 round trips).
   - 5 `weeklyScheduleDay.upsert` calls run via `Promise.all` (was awaited one-by-one).
   - **`sendScheduleSubmittedNotice` moved out of the loop into `after()` (from next/server) + `Promise.allSettled`** — was one awaited SMTP round trip per row, the #1 slowdown in production. Import `after` added.
2. **`actions/user-management.actions.ts` — `bulkCreateUsersAction`:**
   - Existing emails/employee-codes pre-fetched in 2 `findMany` queries → Sets (was 2 findUnique/row).
   - Passwords pre-hashed in PARALLEL via `Promise.all` into `passwordHashByLine` Map keyed by line number (bcrypt was serial ~100ms/row; fallback `?? await hashPassword` kept in loop for safety).
   - `address.upsert` cached per UNIQUE address text in `addressIds` Map (was per row even for duplicate addresses); `user.create` uses `homeAddressId`.
   - Emails already went via `after()` (unchanged).
3. Net effect: per-row DB round trips dropped from ~5–9 to 1 (profiles) and ~7–10 to 1+5-parallel (weekly); zero SMTP on the request path. Behavior/skip-reasons preserved.
4. Verification recipe used (run_commands times out on long tsc): run `npx tsc --noEmit` / eslint via `Start-Process cmd -Args '/c npx tsc --noEmit > %TEMP%\out.txt 2>&1 & echo %errorlevel% > %TEMP%\ec.txt' -WindowStyle Hidden`, then poll the ec file (`0` = clean; empty out.txt = no errors).


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
- **Latest uncommitted work (2026-09-11g/h + 2026-09-11i + 2026-09-12a):** bulk-upload `fixedArrivalTime` column; User Info fixed-arrival ON/OFF + arrival-time select (`User.fixedArrivalActive`,
  migration `20260911232301`, `updateFixedArrivalServiceAction`); bulk-upload coords lenient-header fix;
  route pattern learning + week mirroring (`RouteTemplate`/`RouteTemplateStop`, migration `20260912012837`,
  `lib/routing/route-pattern.ts`, wires in route-override + route-analysis + corridor replay). All
  tsc/eslint clean, server restarted (pid 20788). NOT committed (af080b3 also still not pushed).
  Follow-up option available: backfill templates from existing FINALIZED corridor plans.
- **This session (2026-09-04) built, verified + pushed** (`4304ad7`, `9e3af94`): ad-hoc band resized (5rem arrival / 25rem panel / h-24);
  driver combobox dropdown renders via portal (not clipped); Note box → message-icon popover (`NoteComposer`) + copy icon
  (`CopyDetailsButton`, NEW `components/facilities/adhoc-actions.tsx`) beside Save/Edit; copy reflects LIVE driver/time (not just saved);
  `adhoc-list.tsx` marked `"use client"`; Pick Schedule day-sheet rows + weekly CSV export sorted by arrival time
  (10 PM → 11 PM → … → 6 AM) via `compareArrivalTimes`. tsc+eslint clean; dev restart; 200s.
- **PRIMARY OPEN THREAD — Operations notification email not yet provided** (user: "i will share it later").
  Set `OPERATIONS_NOTIFICATION_EMAIL` env (Vercel) or the constant once shared; currently empty default.
  All other facilities features (credentials emails, validation, SUPER_ADMIN lock, immediate address/contact + 30-day lock,
  Pick Schedule rename, arrival ordering, message/copy icons) are committed. Unrelated `frontend/package*.json` change left unstaged.
- **Completed** (prior sessions): BASE ETA scheduling; firstPickupTime; pickup-time math in `lib/routing/pickup-schedule.ts`
  (5 min/km, 5-min grid, ≥5 min gap); route-learning (`RouteLegLearning`, Learn-from-history action); corridor algorithms;
  sync-after-mutation; route-map OSRM; address geocoding.
- **Not yet done — user action required:** RUN MAPPING NOT re-run since the 5-min grid change, so existing RoutePlans
  still hold old 6.5-based times. ("Learn from history" is now automatic inside every RUN MAPPING — no manual click.)

### Open threads / next steps
1. Human should click **RUN MAPPING** on the Auto Route Planner (now linked in the Facilities sidebar) — it auto-learns
   from history first, then maps on the 5-min grid + learned legs.
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

## Latest Session (2026-09-06) — Localhost connection refusal
1. No process was listening on ports 3000, 3001, or 5173, which caused the browser's `ERR_CONNECTION_REFUSED`.
2. Started the project with `npm run dev`; Next.js 16.2.10 is ready at `http://localhost:3000`.
3. Verified with `Invoke-WebRequest`: HTTP 200. The dev server remains running in terminal process `8f70e681-951a-47df-8ca5-6533442fe9b1`.

## Latest Session (2026-09-06b) — Combined pickup coordinates input
1. Pick-up Point Coordinates now uses one visible `Latitude, Longitude` input, for example `23.8103, 90.4125`.
2. The server action splits and validates the two numbers independently, then stores them in the existing latitude and longitude columns.
3. `npx tsc --noEmit` and targeted ESLint both pass.

## Latest Session (2026-09-06c) — Pickup coordinate status refresh
1. Fixed `setPickupPointCoordinatesAction` to revalidate `/facilities/pickup-point-coordinates` after saving.
2. The page no longer retains stale `Coordinates missing` status after a successful coordinate update.
3. TypeScript, targeted ESLint, and an HTTP 200 page check pass.

## Latest Session (2026-09-06l) — Fix coordinate draft overwrite on refresh
1. Fixed the localStorage restore race where initial server values could overwrite entered drafts before restoration completed.
2. Draft loading is now marked complete before draft persistence runs, so entered values survive refresh reliably.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06k) — Persist entered coordinate drafts
1. Pickup-coordinate inputs are now stored in browser localStorage as drafts while typing.
2. Draft values are restored after refresh; Save and Save all still persist values to the database.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06j) — Remove bulk-save transaction expiration
1. Save all exceeded even the 30-second interactive transaction timeout because all address upserts and employee updates were sequential.
2. Replaced the long interactive transaction with parallel address upserts followed by parallel employee relinks.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06i) — Restore pickup coordinates after refresh
1. Pickup-coordinate page now falls back to an `Address` row matched by pickup-point text when `User.pickupAddressId` is missing.
2. Re-linked the existing `SS Properties` coordinate address (`23.75239887, 90.37966676`) to 6 employees.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass. Values never persisted before refresh cannot be recovered from the database.

## Latest Session (2026-09-06h) — Save all stale dev bundle/runtime error
1. The reported 5-second Prisma transaction errors came from the previous dev process before the 30-second timeout change was loaded.
2. Restarted Next.js cleanly; the corrected server is listening on port 3000 and the pickup-coordinate page returns HTTP 200.
3. TypeScript passes. Refresh the page once before using Save all to discard the stale browser action bundle.

## Latest Session (2026-09-06g) — Bulk save transaction timeout
1. Save all failed for larger batches because Prisma's interactive transaction defaulted to a 5-second timeout.
2. Increased only the bulk pickup-coordinate transaction timeout to 30 seconds while retaining atomic rollback behavior.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06f) — Save only entered pickup coordinates
1. Save all now filters out blank coordinate rows and saves every entered pair in one transaction.
2. If no coordinates are entered, it returns an error instead of reporting a false success.
3. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06e) — Bulk pickup-coordinate save
1. Added a `Save all` button beside the search field on the Pick-up Point Coordinates page.
2. It submits current values for every pickup point, validates all pairs, and saves them in one Prisma transaction.
3. Individual row Save buttons remain available and independent. TypeScript, targeted ESLint, and HTTP 200 checks pass.

## Latest Session (2026-09-06d) — Independent pickup-coordinate save states
1. Moved `useActionState` from the parent list into each pickup-point row.
2. Clicking one Save button now shows `Saving...` only on that row; success and error messages are also row-specific.
3. TypeScript, targeted ESLint, and an HTTP 200 page check pass.

## Latest Session (2026-09-06m) — Corridor path routing for 11 PM / 12 AM-6 AM
**Built; TypeScript and ESLint verified; dry-run sim validated on real data (NO DB writes).**
User brief: farthest employee first → map path to office → search employees near the
already-created path → attach them instead of spawning vehicles; consolidate vehicles
(Sep 7 case: overlapping paths across Cha-19-0991 etc.).

1. `lib/routing/algorithms.ts` — replaced density `corridorClusters` with exported
   `planCorridorRoutes()` (pure, sync, testable):
   - **Far-first paths**: route anchored at the member FARTHEST from office, extended
     one nearest hop at a time (hop ≤ `GROUPING_RADIUS_KM` 2.0 km, office-directed within
     `GROUPING_OFFICE_DIRECTION_SLACK_KM` 1.0 km) until capacity.
   - **Corridor attach**: after each path exists, remaining homes within
     `CORRIDOR_ATTACH_KM` = 2.0 km of any leg (office→first pickup, legs, last→office via
     `distancePointToSegmentKm`, equirectangular projection) AND best-position insertion
     adding ≤ `CORRIDOR_MAX_DETOUR_MIN` = 10 min are spliced into that route at the
     detour-optimal position. Order is now the true travel sequence (NOT re-sorted by
     toOfficeMin anymore).
   - **Vehicle consolidation**: vehicles fill SEQUENTIALLY to capacity
     (`min(vehicle.capacity, DYNAMIC_GROUP_CAPACITY=4)`); a second vehicle opens only when
     no planned route has a spare seat. Replaces the old `pool[gi % pool.length]`
     round-robin that wasted vehicles on overlapping paths.
   - Pins / 10 PM reuse / learned legs / 5-min grid back-calc unchanged; unserved
     employees (pool exhausted) now push a clear error; failure error text uses
     `route N (vehicle id)` instead of `group gi`.
2. Dry-run sim (temp `_sim-corridor.ts`, deleted) on Monday 11 PM data:
   - Week 2026-09-07: 3 riders → 1 route (Cha-56-0179, 3/4).
   - Week 2026-09-06 (user-flagged): 15 riders → 4 routes, ALL full (4/4 ×3 + 3/4) —
     the capacity minimum; old code could waste vehicles on half-empty overlapping paths.
   - Week 2026-08-24: 8 riders → 3 routes (4/4, 3/4, 1/4) — the single rider was >2 km
     from every planned leg (or >10 min detour), so a third vehicle opened, correctly.
3. No schema change → no migration/restart. **User still needs to click RUN MAPPING** to
   regenerate existing plans on the new algorithm (pre-5-min-grid plans still stale).

## Latest Session (2026-09-06n) — Corridor attach can no longer displace the far-first anchor
**Bug user caught on Sep 7 planning:** Cha-19-0991's 11 PM route picked up
Kalachandpur (4.60 km, CLOSEST) first, ahead of Ratila Jannat (9.91 km, farthest).
Root cause: corridor attach allowed insertion at position 0 (detour-optimal) — the
vehicle exits the Gulshan office past Kalachandpur, so the closest home won position #1.

**Fix in `planCorridorRoutes` (`lib/routing/algorithms.ts`):**
1. `nearestLegInsertion()` replaces free detour-optimal insertion: positions searched are
   **1..seq.length only — never before the far-first anchor**, so whoever is picked up
   first is ALWAYS the farthest home.
2. Attachment position = the **leg the home is actually nearest** (point-to-segment), not
   a global optimum — existing stops keep their exact order; the created route is never
   restructured. If no leg is within `CORRIDOR_ATTACH_KM` (2.0) or the detour exceeds
   `CORRIDOR_MAX_DETOUR_MIN` (10), the employee is NOT attached (left for another vehicle)
   — per user rule: "if first created route was changed for new assignment, don't assign".
3. Dry-run verified: week 2026-09-07 → Ratila Jannat (9.91 km) FIRST → Refatul (7.22) →
   Partho Sarkar/Kalachandpur (4.60) attached on the final leg. Week 2026-09-06 (15
   riders) now uses 5 routes (was 4) because 3 riders no longer force-fit — expected
   under the stricter no-restructure rule. tsc + eslint clean; temp scripts deleted.

## Latest Session (2026-09-06o) — Attach only when it FOLLOWS the created path (road test + detour cap)
**User ruled:** the 3rd pickup (Partho Sarkar, Kalachandpur) did NOT follow the first-created
path → skip such assignments and give them ANOTHER vehicle. Implemented + verified:
1. **Road-geometry corridor test** (`lib/routing/osrm.ts` → new `getRoutePolyline()`:
   OSRM `/route` full-geometry polyline per leg, in-memory cached). `planCorridorRoutes` is
   now **async** and takes `legRoadKm(m, from, to)` — the caller (`generateCorridorRoutes`)
   measures the candidate home's distance to the leg's ACTUAL DRIVING path
   (`distancePointToPolylineKm`, new export; straight-line fallback on OSRM failure).
   Straight lines lie in Dhaka (lakes/gated blocks) — Kalachandpur geocodes 0.37 km from
   the straight Khilkhet→Gulshan line although it is off the road. `CORRIDOR_ATTACH_KM`
   tightened 2.0 → **0.8** (distance to the road polyline).
2. **Detour cap tightened 10 → 7 min**, measured with the REAL OSRM matrix. Calibration
   (measured, week 09-07): inserting Refatul (Khilkhet) into the Ratila→office run adds
   **6.5 min** (accepted as on-the-way); inserting Partho (Kalachandpur) into the
   Refatul→office leg adds **7.5 min** (rejected → another vehicle). No distance threshold
   separates the two (0.69 vs 0.72 km road) — only real detour minutes do. Cap is a
   business tune-knob; fragile by ±0.5 min if OSRM re-routes.
3. Dry-run with real OSRM matrix + geometry confirms week 2026-09-07:
   Route 1 = Ratila → Refatul (created path untouched); Route 2 = Partho alone (new vehicle).
   tsc + eslint clean; temp scripts (_sim-corridor, _measure-attach, _check-0991) deleted.
4. **User action: click RUN MAPPING** to regenerate stored plans (still old ordering).

## Latest Session (2026-09-06p) — Far-first ordering now by DISTANCE (km), not minutes
**User complaint (again): Cha-19-9425's 11 PM route, week 2026-09-07 Mon, picked
Atia Mumtahina (5.14 km / 8.21 km road) FIRST and Md. Tanjilur Rahman Abid
(5.91 km / 8.45 km road) SECOND — far home in position #2.**

1. **Root cause (measured with OSRM matrix):** the anchor = max `toOfficeMin`
   (road MINUTES). Atia: 10.3 min vs Tanjilur: 9.9 min — but Tanjilur is
   FARTHER (8.45 km road vs 8.21 km). Road minutes invert for near homes
   (one-way loops / slow roads), so the near home won the anchor and the far
   home slid in via `GROUPING_OFFICE_DIRECTION_SLACK_KM` (5.91 ≤ 5.14+1.0).
   In week 2026-08-24 Tanjilur happened to have the max minutes, which is why
   the same pair ordered correctly there — the metric was luck-dependent.
2. **Fix in `lib/routing/algorithms.ts` (user rule: "far distance choice first
   then come one by one based on distance matrix and route"):**
   - New `matrixDistanceKm()` helper (OSRM matrix road km, haversine fallback)
     + `ClusterMember.toOfficeKm`, computed in `generateCorridorRoutes` after
     the matrix build.
   - `planCorridorRoutes`: `remaining` now sorted by `toOfficeKm` desc
     (minutes only tie-break) → the ANCHOR is the farthest by km.
   - **Final guarantee:** before returning, every route's `order` is sorted
     `toOfficeKm` desc — corridor path + attach decide WHO rides together;
     the visiting order is always strictly far → near by matrix km, so no
     slack member / attach can ever precede a farther home.
3. **Dry-run verified (temp script, deleted) with the REAL planner on real
   data** (week 2026-09-07 Mon, 10 Regnum 11 PM members): Tanjilur group now
   `#1 Tanjilur 8.45 km → #2 Atia 8.21 km`; all 6 routes strictly far → near;
   errors none. NO DB writes.
4. tsc + eslint clean. No schema change → no migration/restart. **User must
   click RUN MAPPING again** to regenerate stored 11 PM plans with the fixed
   ordering.

## Latest Session (2026-09-06q) — Pickup-point coordinates now flow into Route Setting
**User complaint:** points like "Setara Convention Hall", "Mirpur 11 Metro Rail
Station", "Mirpur 6 Main Road" have lat/lng on the Pick-up Points (coordinates)
page but "lat long not come" in Route Setting when setting the sequence.

1. **Root cause — split-brain Address rows:** the coordinates page upserts an
   Address row keyed by the exact `User.pickupPoint` text and links employees
   to it. Route Setting's `PickupPoint` rows link to whatever Address was chosen
   at creation — the route-planner geocoder had created separate rows whose
   `addressText` is a raw "23.819..., 90.365..." string. Same real-world stop,
   two Address rows: coordinates saved on the coordinates page never reached
   Route Setting / generation. ("Setara Convention Hall" & "Mirpur 6 Main Road"
   additionally had NO PickupPoint rows at all — they must be ADDED per vehicle
   in Route Setting → "Add pickup point", where the named row with lat/lng now
   appears in the search.)
2. **Code fix (`actions/facilities-profile.actions.ts`):** new
   `linkPickupPointsToAddress(pickupPoint, addressId)` — after saving
   coordinates (both `setPickupPointCoordinatesAction` and
   `setAllPickupPointCoordinatesAction`), any ACTIVE PickupPoint whose `name`
   matches the point text (case-insensitive) is relinked to the canonical named
   Address row. Both actions now also revalidate `/facilities/route-setting`
   and `/facilities/vehicles`.
3. **One-time data repair (temp script, deleted):** relinked 9 stale PickupPoint
   rows (Kachukhet/Mirpur 10/Kazipara/Shewrapara/Mirpur 1/2/11, Technical,
   Darussalam) from coords-string / lowercase-text rows to the canonical named
   rows — coordinates unchanged (same spots), linkage + display now clean
   (Route Setting shows names, not raw "23.79…, 90.38…" strings).
   Idempotent re-run = no changes. tsc + eslint clean; no schema change.

## Latest Session (2026-09-06r) — Route Setting now SHOWS pickup-point coordinates
**User follow-up:** "Pickup sequence pick-up point like Setara Convention Hall
has no lat long" even though coordinates were set on the Pick-up Points page.

1. **DB audit (read-only):** ALL 26 active PickupPoints have a linked Address
   WITH lat/lng; "Setara Convention Hall" (23.822664, 90.364146) and
   "Mirpur 6 Main Road" (23.810220, 90.367500) named Address rows exist WITH
   coordinates — but NO PickupPoint rows carry those names yet (Facilities must
   add them per vehicle via "Add pickup point"; the search finds the named rows).
   "Mirpur 11 Metro Rail Station" (Cha-20-5252) is correctly linked after the
   06q repair.
2. **Real gap — the UI never displayed lat/lng:** Route Setting's Pickup
   sequence rows showed only name + time + address text, so saved coordinates
   were invisible there ("no lat long" perception). Fixed in
   `components/facilities/route-setting/route-setting-client.tsx`:
   - Every sequence row now shows its coordinates (mono, teal,
     `formatLatLng` = "23.822664, 90.364146") or a destructive
     "No address linked — coordinates missing" warning.
   - "Add pickup point" form previews the selected address's coordinates
     ("Coordinates: …") right under the combobox before saving.
   - `AddressOption` + route-setting page select now carry
     latitude/longitude end-to-end.
3. tsc + eslint clean. `VehiclePickupPointsManager` is dead code (not imported
   anywhere) — left untouched. No DB writes this session.

## Latest Session (2026-09-06s) — Setara added to Cha-20-5252 + pickup-sequence dropdown now pickup-points ONLY
**User:** (a) "unable to add to pick-up sequence setara under Dhaka Metro-Cha-20-5252";
(b) "in pick-up sequence here only have pick-up points, why here have employee
address? delete these".

1. **Why Setara couldn't be added (Cha-20-5252):** the `(vehicleId, sequence)`
   pair is DB-UNIQUE, and Cha-20-5252 had a SOFT-DELETED (`isActive=false`)
   point ("Mirpur 11 Metro Rail Station") still sitting on sequence 2.
   `createPickupPoint` checked for ANY row at that slot → kept rejecting while
   the dead row held the unique index.
   - **Fix** (`actions/pickup-point.actions.ts`): new
     `clearInactiveRowsFromSequence()` — before create/update, INACTIVE rows
     squatting on the target slot are bumped far above max(sequence) (active
     rows never touched). Only an ACTIVE collision is an error.
   - **Fix** (`actions/route-setting.actions.ts` reorderPickupPoints): all
     inactive rows are pushed above the working range up-front so the
     1..n renumbering can never hit the unique index.
2. **Performed the blocked add** (temp script, deleted): bumped the inactive
   squatter to seq 1002 and created **"Setara Convention Hall" (#2)** on
   Dhaka Metro-Cha-20-5252 → linked to the canonical row
   (23.822664, 90.364146) with coordinates.
3. **Employee addresses in the Add-pickup dropdown:** the Address table has
   266 rows, 191 of them EMPLOYEE HOME addresses — the dropdown was listing
   ALL of them. **Fix** (`app/facilities/route-setting/page.tsx`): the address
   query now returns ONLY pickup points = distinct `User.pickupPoint` names
   (case-insensitive) ∪ Address rows linked by ACTIVE PickupPoints. Verified
   against live DB: dropdown drops 266 → 76, all genuine pickup points
   (bus stops / metro stations / landmarks); no home addresses. (Only
   "Mazar Road Bus Stop" still shows a raw-coords string — no canonical named
   row exists for it; it has coords so it works.)
4. tsc + eslint clean. No schema change.

## Latest Session (2026-09-06t) — Vehicle → route pinning: scrollable list
**User:** "build a scroll bar Vehicle → route pinning" (the route-setting right
column card).

- `components/facilities/route-setting/route-setting-client.tsx` Pinner card:
  `CardContent` now `p-0`; the vehicle table is wrapped in a
  `max-h-[28rem] overflow-auto` scroll container (keyboard-focusable, labelled),
  the `<thead>` is `sticky top-0 z-10 bg-card` so column headers stay visible
  while scrolling (bg-card works in both light + dark themes), and a footer
  line shows total active vehicles + "scroll to see all". Padding on
  header/footer/rows aligned. tsc + eslint clean.

## Latest Session (2026-09-06u) — Week-key normalization (RUN MAPPING vs bulk upload) + email explanation
**User:** (a) "check Sep 7 route planning — Myen Uddin Khondoker, Tamara Tanzin
Toha, Sara Tabassum have pickup points matching Cha-19-9425 but provided this
errors"; (b) "uploaded bulk weekly schedule from Operations but schedule
details mail are not sent to employees".

1. **ROOT CAUSE (a): dual week-key conventions.** `getSubmissionWindow()`
   returns a LOCAL-midnight Monday (Asia/Dhaka → serialized `2026-09-06T18:00Z`),
   while `generateWeeklyRoutes` normalizes via `toUtcMidnight(getMondayOfWeek())`
   → `2026-09-07T00:00Z`. Bulk-upload rows landed on the 18:00Z key and were
   INVISIBLE to RUN MAPPING (Myen's Sep-7 schedule was stranded there; Tamara/
   Sara had rows under BOTH keys). Also: "Myen Uddin Khondoker" exists as TWO
   accounts (example6@commure.com WY76268 + jamie.rivera08@example.com
   W3Y15195N) with the same pickup point — the Sep-7 plans contained the
   jamie.rivera08 one; **flagged to the user for cleanup**.
2. **Code fix — canonical week keys everywhere:** `toUtcMidnight` moved to
   `lib/date/week.ts` (exported; route-generation now imports it). Normalized
   at EVERY schedule-write/read path: `bulkUploadWeeklySchedules`,
   `submitMySchedule`, `submitCorporateWeeklySchedule`
   (actions/weekly-schedule.actions.ts), `createWeeklyScheduleOnBehalf`
   (actions/on-behalf.actions.ts), corporate my-schedule page lookup
   (app/corporate-employee/my-schedule/page.tsx), and the Operations
   bulk-upload week-option value (app/operations/weekly-requests/page.tsx).
   New uploads can no longer land on the local-midnight key.
3. **Data repair (temp script, deleted):** for the live collision — of 26 rows
   on `2026-09-06T18:00Z`: 19 duplicates DELETED (canonical 00:00Z row kept,
   created later Sep 6), 7 rows MOVED to 00:00Z with day dates re-keyed to UTC
   midnight — including Myen (example6), now visible to RUN MAPPING.
   Idempotent (re-run = 0 rows). Historical 18:00Z weeks (July/Aug) left
   untouched deliberately.
4. **Email (b) — by design in dev:** `lib/mailer.ts` sets
   `EMAIL_ENABLED = NODE_ENV === "production"`; in `next dev` every email is
   skipped with a `[MAILER] DEV — email skipped` console log. `.env.local` has
   NO SMTP_* keys. Production (Vercel) needs SMTP_HOST/SMTP_PORT/SMTP_USER/
   SMTP_PASS/SMTP_FROM set; failures log `[MAILER] Failed to send email to …`.
   The bulk-upload notice code itself is correct (`after()` +
   `sendMailBackground`).
5. tsc + eslint clean; no schema change. User should re-run RUN MAPPING for
   week 2026-09-07 so the real Myen (example6) gets planned.

## Latest Session (2026-09-06u) — "has no matching 10 PM pickup point" for Cha-19-9425 fixed
**User:** Sep 7 route planning errored on Myen Uddin Khondoker, Tamara Tanzin Toha,
Sara Tabassum even though their pickup points ARE on Dhaka Metro-Cha-19-9425's
pickup sequence.

1. **Root cause — sibling Address rows (split-brain, again):** the 06q/06s
   repairs left CASE-VARIANT sibling Address rows for the same stop
   ("Mirpur 1 shwapno **S**uper shop" vs "…**s**uper shop"), and
   "Mazar Road Bus Stop" was still linked to an old raw-coordinate-string row
   (`"23.783137…"`) on the vehicle. `generate10PMRoutes` joins strictly on
   `pickupPoint.addressId === employee.pickupAddressId`, so the case/master
   variant row made the join fail even though names matched.
2. **Code fix (`lib/routing/algorithms.ts`):** `generate10PMRoutes` now has a
   **case-insensitive NAME fallback** in BOTH the vehicle-grouping step and the
   per-route entry-resolution step — if the strict addressId join misses, the
   employee attaches via `employee.pickupPoint` matching an active point's
   `name` (mode:insensitive). Also added `pickupPoint` to `EmployeeShape`.
3. **One-time data repair (temp scripts, deleted):** grouped employee pickup
   names case-insensitively and unified each family to ONE canonical Address
   row (majority of employee links → exact-case of most-common spelling →
   with coordinates). Repointed 3 employees + relinked Mazar point. Re-run of
   the diagnosis: all three employees (and both Myen records) now MATCH via the
   strict join. Dry-run of the real matching on week 2026-09-07 Mon:
   Myen->seq4 (Mazar), Tamara+Sara->seq2 (Mirpur 1 shwapno Super shop). The
   only genuine remaining "no matching" case is "Erin Employee" (profile has
   no usable point) — unrelated to Cha-19-9425.
4. tsc + eslint clean. No schema change. User should re-run RUN MAPPING.

## Latest Session (2026-09-28) — Facilities dashboard board rework + Profile Approvals off the menu
**User requests (v4.4e):** delete "Profile Approvals" from the facilities menu; rename the
"Fleet ready: 34 active vehicles…" subline → "Fleet Summary"; replace "Approved days without
a route" with a current-month total pick-up count (facilities assigned a driver to an
employee for pick-up). Confirmed via question: REPLACE the "Approved days without a route"
item (not add a 4th).

1. **Menu (`app/facilities/layout.tsx`):** removed the `/facilities/profile-approvals` link
   + its `pendingPickupPointChanges` badge query (and now-unused `PickupPointChangeStatus`,
   `prisma`, `withDbRetry` imports). **The page itself (`app/facilities/profile-approvals`)
   is KEPT** — still reachable by URL. Consequence flagged to user: employees can still
   submit pick-up-point change requests, but there is no menu entry to approve them anymore;
   if they want the whole pickup-point-approval module deleted, say so and we'll remove
   `app/facilities/profile-approvals/` + `PickupPointApprovalCard` +
   `actions/pickup-point-change.actions.ts` + employee-side submit UI (like the address/
   contact module was removed earlier).
2. **Dashboard board (`app/facilities/dashboard/page.tsx`):**
   - AttentionBoard `subline` is now plain `"Fleet Summary"` (the weekly-window text and its
     `getSubmissionWindow`/`getTransportSettings`/`getWeekDays`/`formatShortDate` usage are
     gone from the page — imports cleaned).
   - Item 1 replaced: **"Total pick-ups (this month)"** = `prisma.routeAssignment.count`
     where `assignedAt` in the current Dhaka calendar month (local `Date(y, m, 1)` /
     `Date(y, m+1, 1)` bounds; machine TZ = Asia/Dhaka, Prisma stores UTC). Action
     "View history" → `/facilities/allocation-history`, icon `MapPin`, no `urgent` (a busy
     month is not an alarm). Removed the now-unused `unassignedDays` weeklyScheduleDay
     query + `WeeklyScheduleStatus` import.
   - Items 2–3 unchanged (ad-hoc awaiting placement; active vehicles & drivers).
   - Weather glass / layout V5 untouched.
3. tsc + eslint clean (both files). No schema change. Awaiting user visual review.
