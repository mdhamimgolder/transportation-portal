import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DashboardHero — top-of-dashboard greeting used across every role dashboard
 * for a consistent, role-aware header. Renders a warm amber mono eyebrow (the
 * date or a context line), the role display title, an optional subline, and
 * optional action buttons on the right.
 */
export function DashboardHero({
  eyebrow,
  title,
  subline,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subline?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
            <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-amber">
              {eyebrow}
            </p>
          </div>
        ) : null}
        <h1 className="font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl">
          {title}
        </h1>
        {subline ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subline}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}
