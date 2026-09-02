import { cn } from "@/lib/utils";

/**
 * MiniStat — a small quiet readout used in supporting bands beneath the
 * AttentionBoard. Small mono figure + label, paper card. `accent` tints the
 * figure with the role hue when a value deserves emphasis.
 */
export function MiniStat({
  label,
  value,
  accent = false,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        className
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold leading-none tabular-nums",
            accent && "text-foreground"
          )}
          style={accent ? { color: "var(--role-accent)" } : undefined}
        >
          {value}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </p>
    </div>
  );
}
