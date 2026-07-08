import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border bg-card p-5",
        href && "transition-colors hover:border-teal/50"
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-3xl font-medium tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {icon ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          {icon}
        </div>
      ) : null}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
