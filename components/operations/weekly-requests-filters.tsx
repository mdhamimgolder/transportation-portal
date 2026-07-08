"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type WeekOption = {
  value: string;
  label: string;
};

export function WeeklyRequestsFilters({
  weekOptions,
}: {
  weekOptions: WeekOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: q.trim() || undefined });
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="w-64"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      <Select
        value={searchParams.get("week") ?? "all"}
        onValueChange={(value) =>
          updateParams({ week: value === "all" ? undefined : value })
        }
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

      {searchParams.get("q") || searchParams.get("week") ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
