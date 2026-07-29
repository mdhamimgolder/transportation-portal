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
}: {
  status: string | null;
  hint: string;
  className?: string;
}) {
  const label = toTitleCase(status ?? "not submitted");

  return (
    <div
      className={cn(
        "flex h-full min-h-56 flex-col rounded-xl border border-transparent bg-black p-5",
        className
      )}
    >
      <p className="font-mono text-xs font-medium tracking-[0.12em] text-white/70 uppercase">
        This week&apos;s schedule
      </p>
      <div className="flex justify-center pt-3">
        <span className="rounded-full bg-[#aef2ff] px-4 py-1 text-xl font-semibold text-[#001014]">
          {label}
        </span>
      </div>
      <div className="flex-1" />
      <p className="text-xs text-white/50">{hint}</p>
      <Button
        asChild
        className="mt-4 w-full rounded-full bg-[#aef2ff] text-[#001014] hover:bg-[#d3f8ff]"
      >
        <Link href="/employee/weekly">View schedule</Link>
      </Button>
    </div>
  );
}
