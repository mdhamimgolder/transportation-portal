"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AllocationHistoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function pushParams(next: { from?: string; to?: string; q?: string; type?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const merged = {
      type: searchParams.get("type") ?? "",
      from,
      to,
      q,
      ...next,
    };

    if (merged.type) params.set("type", merged.type);
    else params.delete("type");

    if (merged.from) params.set("from", merged.from);
    else params.delete("from");

    if (merged.to) params.set("to", merged.to);
    else params.delete("to");

    if (merged.q?.trim()) params.set("q", merged.q.trim());
    else params.delete("q");

    router.replace(params.toString() ? `${pathname}?${params}` : pathname, {
      scroll: false,
    });
  }

  function handleSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: value });
    }, 250);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Report type</Label>
        <Select
          value={searchParams.get("type") ?? ""}
          onValueChange={(value) => pushParams({ type: value })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select report type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly Schedule</SelectItem>
            <SelectItem value="adhoc">Ad-hoc Request</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            pushParams({ from: e.target.value });
          }}
          className="w-40"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            pushParams({ to: e.target.value });
          }}
          className="w-40"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Search</Label>
        <Input
          value={q}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Name or email"
          className="w-64"
        />
      </div>
    </div>
  );
}
