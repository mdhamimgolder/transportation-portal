# scripts/ — operational & diagnostics toolbox

Standalone Node scripts (run with `tsx`). They are **not** part of the app build —
nothing in `app/`, `lib/`, `actions/` or `components/` imports them.

## Conventions

- Run with `npx tsx <path>`; every script must start with `import "dotenv/config";`
  (Next.js loads `.env.local` automatically — `tsx` does not).
- Imports use the `@/…` path alias (resolved from `tsconfig.json`).
- Scripts are type-checked by `npm run typecheck` and linted by `npm run lint`.
- **`.env` / `.env.local` must point at the database you actually mean.** There is
  no staging guard — these scripts write to whatever `DATABASE_URL` says.

```powershell
npx tsx scripts/diagnostics/check-preset-sequence.ts     # read-only audit
npx tsx scripts/maintenance/repair-sync-point-times.ts   # writes data
npx tsx scripts/destructive/delete-all-addresses.ts      # refuses without --confirm
```

## diagnostics/ — read-only audits

| Script | What it reports |
|---|---|
| `check-point-times.ts` | Every rider sharing one pickup point (same plan/vehicle/day/shift) must share the same pickup time. Scans all weeks. |
| `check-preset-sequence.ts` | For every `PRESET_10PM` plan, compares stored trip order (`sequenceInTrip`) with the vehicle's saved pickup-point sequence. |
| `check-route-sequence.ts` | Route-sequence sanity check for a specific vehicle/week. |
| `diag-emails.ts` | Employee email-domain audit + which employees received the Sep-7 bulk-upload notices. |
| `diag-point-updated.ts` | When each active pickup point's `baseETA` was last written. |
| `diag-vehicle-anchors.ts` | Per vehicle: anchor (`firstPickupTime` / `baseETA`) + derived values. |
| `verify-week-point-times.ts` | Live-week verifier: one time per pickup point, and point times must match their preset sequence. |
| `provision-sessions.ts` | **Security-sensitive:** mints session rows + prints ready-to-use session cookies for the test accounts. Dev/staging debugging only. |

## maintenance/ — data repairs (write!)

One-off repairs written after the Aug–Sep 2026 preset/timing incidents. Kept for
reference and re-runs on other weeks; each is scoped to the week it was written
for — **read the header comment before running**.

| Script | Repair |
|---|---|
| `repair-preset-sequence.ts` | Repair #1 — re-derive `PRESET_10PM` trip order from the vehicle's pickup-point sequence. |
| `repair-preset-times.ts` | Repair #2 — re-derive pickup times from the (cleaned) learned-leg table. |
| `repair-sync-point-times.ts` | Repair #3 — same-point riders share the point's pickup time. |
| `repair-week-point-schedule.ts` | Repair #4 — one pickup time per pickup point for the whole week. |
| `repair-contiguous-sequence.ts` | Repair #5 — contiguous pickup-stop numbering for the test week. |

## destructive/ — data loss

| Script | What it destroys | Guard |
|---|---|---|
| `delete-all-addresses.ts` | Deletes **every** `Address` row and nulls `user.homeAddressId` / `user.pickupAddressId`. | Refuses to run without `--confirm`. |
| `check-homes.ts` | Nothing today (read-only). Historically flagged in `AGENTS.md` — treat as do-not-run unless a task explicitly asks for it. | Documented in the file header. |
