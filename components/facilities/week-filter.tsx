"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type WeekOption = { value: string; label: string };

export function WeekFilter({ weekOptions }: { weekOptions: WeekOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={searchParams.get("week") ?? "all"}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "all") params.delete("week");
        else params.set("week", value);
        router.push(params.toString() ? `${pathname}?${params}` : pathname);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="All weeks" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All weeks</SelectItem>
        {weekOptions.map((week) => (
          <SelectItem key={week.value} value={week.value}>
            {week.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
