# design-sync notes — Transportation System

## Scope

This repo has no dedicated design-system package — it's the 12 shadcn/ui
primitives in `components/ui/*.tsx`, synced as-is. Business/page components
(`components/shared`, `components/employee`, etc.) are out of scope by design
(user's explicit choice on first sync).

## Required local setup before any build

1. **Self-package junction.** This repo isn't installed as a dependency of
   itself, so `node_modules/transportation-system` doesn't exist by default —
   `dts.mjs`'s `projectFor()` crashes without it (no try/catch around its
   `package.json` read). Fixed with a Windows **junction** (not a symlink —
   `ln -s` produced a broken circular result on this machine):
   ```powershell
   New-Item -ItemType Junction -Path "node_modules\transportation-system" -Target "."
   ```
   Must be recreated after any fresh clone. Verified safe against infinite
   recursion for the converter's own directory walkers (`.ds-sync/lib/common.mjs`
   and `.ds-sync/lib/detect.mjs` both skip `node_modules`; ts-morph's glob in
   `dts.mjs` excludes `**/node_modules/**`) — **but see the esbuild caveat
   below, where it is NOT safe.**

2. **Compile the CSS before every build.** `app/globals.css` uses Tailwind v4's
   `@import "tailwindcss"` / `@import "tw-animate-css"` — these are build-time
   directives, not literal files, so the converter can't read them directly.
   Run this first (regenerates the gitignored `.design-sync/.cache/compiled-globals.css`
   that `cfg.cssEntry` points at):
   ```bash
   node .design-sync/compile-css.mjs
   ```

## Hard rule: no npm-package imports inside `.design-sync/previews/*.tsx`

**Never `import` a real node_modules package (e.g. `lucide-react`) directly in
a preview file.** Doing so crashed esbuild outright (Go panic, infinite
resolver recursion — `dirInfoCached`/`dirInfoUncached`/`ReadDirectory` looping
until "the service was stopped") the one time it was tried (Button.tsx
originally imported `Plus`/`Trash2`/`ChevronRight` from `lucide-react`). The
likely cause: `lucide-react` resolution needs a real `node_modules` directory
walk, and walking into the `node_modules/transportation-system` junction
(which maps back to the repo root, which contains the same junction again)
is a circular symlink esbuild's Go resolver doesn't handle.

The DS package's own bare-specifier import (`import { Button } from
"transportation-system"`) is fine — `story-imports.mjs`'s `pkgRx` intercepts
that specifier lexically via `onResolve` before any filesystem walk happens.
The danger is any OTHER real package imported inside a preview file. **Use
inline SVG (or plain markup) instead of icon libraries in preview `.tsx`
files.** All 12 authored previews follow this rule.

## Playwright / automated grading — not installed, asked 3x, no response

The render check in `package-validate.mjs` and the per-story grading capture
in `package-capture.mjs` both need Playwright + Chromium (~200MB), which
isn't installed anywhere on this machine. The user was asked via
`AskUserQuestion` three times across the run (once about the render check,
twice reframing the ask once it became clear grading itself needs it too) and
never responded either time. Per the operator's own safety rules (explicit
permission required before downloading files; silence isn't consent), the
sync proceeded WITHOUT installing it:

- `package-validate.mjs` ran with `--no-render-check` (documented bypass,
  downgrades to a non-blocking `[RENDER_SKIPPED]` warning).
- `package-capture.mjs` (the absolute-rubric grading step) has no bypass — it
  exits immediately if `playwright` isn't importable. **No component in this
  sync has a machine-graded verdict.**
- As a substitute, all 12 authored previews were manually inspected via a
  live browser (DOM text extraction + console-error check per component,
  using a local static server: `node .ds-sync/storybook/http-serve.mjs
  ./ds-bundle`) — confirmed each renders complete, non-placeholder content
  with no console errors. This is NOT equivalent to the automated
  Styled/Complete/Plausible screenshot grading and should be treated as a
  lighter-weight check.

**Re-sync risk:** a future sync should re-ask about installing Playwright
before assuming this gap is permanent — until it's installed, no component
here will ever get a real graded verdict, only this manual DOM-level check.

## Preview scope

Only the 12 top-level primitives have authored previews (Button, Input,
Label, Card, Badge, Select, Table, Checkbox, Dialog, Textarea, Sheet,
DropdownMenu). Their compound sub-parts (`CardHeader`, `DialogTrigger`,
`SelectItem`, etc. — 52 of the 64 total exported components) intentionally
ship as unauthored floor cards: they're exercised compositionally inside their
parent's preview but don't get a dedicated preview file, per the user's
explicit scope decision on first sync. This is expected, not a gap to close.

## cardMode overrides

`Dialog`, `DropdownMenu`, `Select`, and `Sheet` are portal/overlay components
— rendering multiple `defaultOpen` stories in the default grid would stack
overlays on top of each other. `.design-sync/config.json`'s
`overrides.<Name>.cardMode = "single"` makes each show only its `primaryStory`
("Default") in the live grid; all authored exports remain individually
capturable via `?story=<Export>` once grading is possible.
