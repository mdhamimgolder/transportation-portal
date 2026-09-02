"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type VehicleDriverOption = {
  id: string;
  driverName: string;
  vehicleNumber: string;
  vendor: string;
};

function labelFor(option: VehicleDriverOption): string {
  return `${option.driverName} · ${option.vehicleNumber} (${option.vendor})`;
}

export function VehicleDriverCombobox({
  name,
  options,
  defaultValue,
  placeholder = "Search vehicle or driver",
  className,
}: {
  name: string;
  options: VehicleDriverOption[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const initialOption = options.find((o) => o.id === defaultValue);
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [query, setQuery] = useState(initialOption ? labelFor(initialOption) : "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.driverName.toLowerCase().includes(needle) ||
        o.vehicleNumber.toLowerCase().includes(needle) ||
        o.vendor.toLowerCase().includes(needle)
    );
  }, [options, query]);

  // Every matching driver is listed; the box shows a window of rows
  // and scrolls when there are more.
  const rows = useMemo(() => filtered, [filtered]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input type="hidden" name={name} value={selectedId} />
      <div className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground">
        <Search className="size-4" />
      </div>
      <Input
        value={query}
        placeholder={placeholder}
        className="pl-8"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-[10rem] w-full min-w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {rows.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</p>
          ) : (
            rows.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  option.id === selectedId && "bg-accent"
                )}
                onClick={() => {
                  setSelectedId(option.id);
                  setQuery(labelFor(option));
                  setOpen(false);
                }}
              >
                <span className="truncate">{labelFor(option)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
