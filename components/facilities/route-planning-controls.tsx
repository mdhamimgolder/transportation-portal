"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

export function RoutePlanningControls({
  view,
  day,
}: {
  view: "employee" | "day";
  day: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border p-1">
        <Button
          type="button"
          size="sm"
          variant={view === "employee" ? "default" : "ghost"}
          onClick={() => setParams({ view: "employee" })}
        >
          By employee
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "day" ? "default" : "ghost"}
          onClick={() => setParams({ view: "day", day })}
        >
          By day (sheet)
        </Button>
      </div>

      {view === "day" ? (
        <div className="inline-flex flex-wrap rounded-lg border p-1">
          {DAYS.map((d) => (
            <Button
              key={d.value}
              type="button"
              size="sm"
              variant={day === d.value ? "default" : "ghost"}
              onClick={() => setParams({ view: "day", day: d.value })}
            >
              {d.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
