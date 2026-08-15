import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ThisWeekScheduleCard({
  status,
  hint,
  className,
  href = "/employee/weekly",
  buttonLabel = "View schedule",
}: {
  status: string | null;
  hint: string;
  className?: string;
  href?: string;
  buttonLabel?: string;
}) {
  const label = toTitleCase(status ?? "not set");

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-transparent bg-black p-5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-medium tracking-[0.12em] text-white/70 uppercase">
          This week&apos;s schedule
        </p>
        <span className="shrink-0 rounded-full bg-[#aef2ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#001014]">
          {label}
        </span>
      </div>
      <div className="flex-1" />
      <p className="text-xs text-white/50">{hint}</p>
      <Button
        asChild
        className="mt-4 w-full rounded-full bg-[#aef2ff] text-[#001014] hover:bg-[#d3f8ff]"
      >
        <Link href={href}>{buttonLabel}</Link>
      </Button>
    </div>
  );
}
