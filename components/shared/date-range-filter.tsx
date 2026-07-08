"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function pushParams(next: { from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  const hasRange = Boolean(searchParams.get("from") || searchParams.get("to"));

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        pushParams({ from, to });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id="to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-40"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Apply range
      </Button>
      {hasRange ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFrom("");
            setTo("");
            pushParams({ from: "", to: "" });
          }}
        >
          Clear range
        </Button>
      ) : null}
    </form>
  );
}
