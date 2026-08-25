# Conventions — Commure Transportation Components

This design system is the 12 shadcn/ui primitives used across the Transportation
Management Portal (`components/ui/*.tsx`), compiled as-is — no reimplementation.
Business components (nav sidebar, data tables tied to server actions, page-specific
dialogs) are intentionally NOT included; only the generic primitives ship here.

## Setup

No provider or wrapper is required. Every component is a plain React function
component — import it from the bundle global and render it directly:

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent } from "<pkg>";

function Example() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Weekly Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>View details</Button>
      </CardContent>
    </Card>
  );
}
```

Compound components (Card, Dialog, DropdownMenu, Select, Sheet, Table) are built
from named sub-parts exported alongside the root — e.g. `CardHeader`,
`CardTitle`, `CardContent`, `CardFooter`, `CardAction` all come from the same
module as `Card`. Compose them together; they aren't meant to render standalone.

## Styling idiom

Every component takes a `className` prop (merged via `cn()`, i.e.
`clsx` + `tailwind-merge`) so consumer overrides always win over the component's
own defaults. Styling is plain Tailwind utility classes — there is no CSS-in-JS
and no separate theme object.

Real token-backed utility classes available in this bundle (verified against
the compiled tokens, not guessed):

- Semantic color pairs (each has a `-foreground` counterpart for text/icons on
  top of it): `bg-primary` / `text-primary-foreground`, `bg-secondary`,
  `bg-muted`, `bg-accent`, `bg-destructive`, `bg-card`, `bg-popover`.
- Brand accents: `bg-ink` / `text-ink-foreground` (the dark sidebar/header
  surface), `bg-amber`, `bg-teal`, `bg-green`, `bg-red`, `bg-graphite`,
  `bg-paper`.
- Borders/inputs/focus ring: `border-border`, `border-input`, `ring-ring`.
- Radius scale: `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` (all
  derived from the single `--radius` custom property, so they stay
  proportional if the base radius ever changes).
- Fonts: `font-display` (headings — Space Grotesk), `font-sans` (body — IBM
  Plex Sans), `font-mono` (data/timestamps — IBM Plex Mono).

Variant props (not className) drive each component's built-in states —
e.g. `<Button variant="destructive" size="sm">`, `<Badge variant="outline">`.
Reach for a variant prop before reaching for utility classes when the axis
already exists on the component (`variant`, `size`); use `className` for
one-off layout (spacing, width, flex/grid placement).

## Where the truth lives

The compiled component code (`_ds_bundle.js`) and this repo's
`components/ui/*.tsx` are byte-equivalent in behavior — this bundle is a
direct esbuild compile of that source, not a reimplementation. If a design
needs a variant or prop that doesn't exist here, it doesn't exist in the
product yet; flag it rather than inventing one.
