import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  /** Big mono figure — the thing that needs attention. */
  value: string | number;
  /** One-line label, e.g. "Weekly requests to review". */
  label: string;
  /** A short action verb shown as the link text ("Review", "Plan routes"...). */
  action?: string;
  href?: string;
  icon?: LucideIcon;
  /** Optional progress denominator for a "x of y" hint under the figure. */
  of?: string | number;
  /** Marks the row as the top priority — draws the strongest accent. */
  urgent?: boolean;
};

/**
 * AttentionBoard — the signature dashboard hero.
 *
 * Not a row of equal stat cards: it's the role's *attention queue*, ordered
 * most-urgent-first, each row a left-accent-bordered band with one large mono
 * figure and a single action verb. Reads like a shift handover note: "start
 * here, then here, then here."
 *
 * Renders as a dark ink panel on desktop (rows stack right-aligned) and
 * collapses to stacked full-width bands on mobile.
 */
export function AttentionBoard({
  subline,
  items,
  accent,
  className,
}: {
  /** caption line under the head block — string or richer node (progress bar). */
  subline?: ReactNode;
  items: AttentionItem[];
  /** Tailwind text color class for the accent figures (role hue). */
  accent: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-ink/90 bg-ink text-ink-foreground",
        "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        className
      )}
    >
      {/* Head block */}
      <div className="border-b border-ink-foreground/10 px-5 py-4 sm:px-7">
        {subline ? (
          <div className="max-w-2xl text-sm text-ink-foreground/55">
            {typeof subline === "string" ? <p>{subline}</p> : subline}
          </div>
        ) : null}
      </div>

      {/* Attention queue */}
      <div className="grid grid-cols-1 gap-px bg-ink-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Row key={item.label} item={item} accent={accent} />
        ))}
      </div>
    </section>
  );
}

function Row({ item, accent }: { item: AttentionItem; accent: string }) {
  const Icon = item.icon;
  const inner = (
    <div className="relative flex h-full flex-col gap-4 bg-ink p-5 transition-colors hover:bg-ink-foreground/5 sm:p-6">
      {/* left accent rail — the persistent scoreboard mark */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-r"
        style={{ background: "var(--role-accent)" }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--role-accent-soft)" }}
            >
              <Icon
                className="size-4.5"
                style={{ color: "var(--role-accent)" }}
              />
            </span>
          ) : null}
          <p className="text-sm font-medium leading-snug text-ink-foreground/80">
            {item.label}
          </p>
        </div>
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            item.urgent ? "bg-amber" : "bg-ink-foreground/25"
          )}
        />
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
        <p className="font-mono text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-5xl">
          <span className={accent}>{item.value}</span>
          {item.of ? (
            <span className="ml-1 text-lg font-normal text-ink-foreground/40">
              {" "}
              / {item.of}
            </span>
          ) : null}
        </p>
        {item.action ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-foreground/70 transition-colors group-hover:opacity-100">
            {item.action}
            <ArrowUpRight
              className="size-3.5"
              style={{ color: "var(--role-accent)" }}
            />
          </span>
        ) : null}
      </div>
    </div>
  );

  return item.href ? (
    <Link
      href={item.href}
      className={cn("group contents", "focus-visible:outline-none")}
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}
