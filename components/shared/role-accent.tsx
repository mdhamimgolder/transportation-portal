import type { Role } from "@/lib/constants/enums";

/**
 * Role accent metadata -- the portal uses one system-wide highlight hue
 * (`#70BCCC`) for every role. These values mirror the CSS tokens in
 * `app/globals.css` (`--role-accent`, `--role-accent-soft`, `--role-accent-deep`).
 * When inline styles are needed (e.g. inside a client component where the CSS
 * variable is inherited), read the token directly with
 * `getComputedStyle`/`var()`. These class strings are used where Tailwind
 * arbitrary values are awkward -- e.g. on the dark ink sidebar.
 */
export const ROLE_ACCENT: Record<
  Role,
  { text: string; dot: string; avatarBg: string; hero: string; rim: string }
> = {
  EMPLOYEE: {
    text: "text-[#70bccc]",
    dot: "bg-[#70bccc]",
    avatarBg: "bg-[#0f3038]",
    hero: "from-[#0f3038]",
    rim: "border-[#70bccc]/40",
  },
  CORPORATE_EMPLOYEE: {
    text: "text-[#70bccc]",
    dot: "bg-[#70bccc]",
    avatarBg: "bg-[#0f3038]",
    hero: "from-[#0f3038]",
    rim: "border-[#70bccc]/40",
  },
  OPERATIONS: {
    text: "text-[#70bccc]",
    dot: "bg-[#70bccc]",
    avatarBg: "bg-[#0f3038]",
    hero: "from-[#0f3038]",
    rim: "border-[#70bccc]/40",
  },
  FACILITIES: {
    text: "text-[#70bccc]",
    dot: "bg-[#70bccc]",
    avatarBg: "bg-[#0f3038]",
    hero: "from-[#0f3038]",
    rim: "border-[#70bccc]/40",
  },
  SUPER_ADMIN: {
    text: "text-[#70bccc]",
    dot: "bg-[#70bccc]",
    avatarBg: "bg-[#0f3038]",
    hero: "from-[#0f3038]",
    rim: "border-[#70bccc]/40",
  },
  FIXED_ARRIVAL: {
    text: "text-[#f59e0b]",
    dot: "bg-[#f59e0b]",
    avatarBg: "bg-[#78350f]",
    hero: "from-[#78350f]",
    rim: "border-[#f59e0b]/40",
  },
};
