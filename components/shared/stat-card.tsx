import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  className,
  valueClassName,
  labelClassName,
  hintClassName,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border bg-card p-5",
        href && "transition-colors hover:border-teal/50",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className={cn("text-sm text-muted-foreground", labelClassName)}>{label}</p>
        <p
          className={cn(
            "font-mono text-3xl font-medium tracking-tight tabular-nums",
            valueClassName
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className={cn("truncate text-xs text-muted-foreground", hintClassName)}>
            {hint}
          </p>
        ) : null}
      </div>
      {icon ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          {icon}
        </div>
      ) : null}
    </div>
  );

  // display:contents so the <Link> itself doesn't become the grid/flex item --
  // the inner div (which carries `className`, e.g. col-span/row-span) does.
  return href ? (
    <Link href={href} className="contents">
      {body}
    </Link>
  ) : (
    body
  );
}
