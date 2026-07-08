"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AllocationHistorySearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams(searchParams.toString());
        if (q.trim()) params.set("q", q.trim());
        else params.delete("q");
        router.push(params.toString() ? `${pathname}?${params}` : pathname);
      }}
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by employee, driver, or vehicle"
        className="w-72"
      />
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  );
}
