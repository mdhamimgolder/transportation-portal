# AGENTS.md — Transportation Management Portal (TMP)

Auto-loaded every session. Files to read before any task, in order:

1. `CLAUDE.md` — the project spec / single source of truth (architecture, roles, database schema, business rules, design system, coding conventions).
2. `SESSION_MEMORY.md` — session continuity: what we built, current state, conventions, recipes, open threads. **Update it at the end of every session** so the next session resumes without re-exploration.

## Source of truth for ingesting this repo
- `README_COMPLETE.md`, `PRD.md`, `DATABASE.md`, `FEATURE_DEVELOPMENT_GUIDE.md`, `START_HERE.md` (repo root). Ignore the `_archived-fastapi-scaffold-2026-07-27/` and `.claude/worktrees/` copies — they are stale.

## Non-negotiable commands before finishing a task
- Backend/verify: `npx tsc --noEmit` and `npx eslint <changed files>`
- Prisma schema change: `npx prisma migrate dev --name <name>` then `npx prisma generate`
- Server restart after a Prisma/schema change (Neon/Postgres via Prisma 7):
  - kill the port-3000 listener: `Get-NetTCPConnection -LocalPort 3000 -State Listen | Stop-Process -Id {OwningProcess} -Force`
  - delete `.next`, relaunch hidden: `Start-Process cmd -Args '/c npm run dev > C:\Users\HAMIM~1.GOL\AppData\Local\Temp\opencode\next-dev.log 2>&1' -WindowStyle Hidden`
- tsx standalone scripts need `import "dotenv/config"` first (Next auto-loads `.env.local`; tsx does not).

## Hard constraints
- Machine timezone is Asia/Dhaka; DB stores day/week dates as UTC midnight. Test data week: `2026-08-24`.
- Role gate is `requireRole([Role.FACILITIES, Role.SUPER_ADMIN])` for all Facilities actions.
- Never run the destructive scripts `_delete-all-addresses.ts` / `_check-homes.ts`.