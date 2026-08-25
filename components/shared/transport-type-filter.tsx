"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TransportTypeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={searchParams.get("type") ?? "all"}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "all") params.delete("type");
        else params.set("type", value);
        router.push(params.toString() ? `${pathname}?${params}` : pathname);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="All types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All types</SelectItem>
        <SelectItem value="weekly">Weekly Schedule</SelectItem>
        <SelectItem value="adhoc">Ad-hoc Request</SelectItem>
      </SelectContent>
    </Select>
  );
}
