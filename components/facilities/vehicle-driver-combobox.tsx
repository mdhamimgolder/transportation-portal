"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  onSelect,
}: {
  name: string;
  options: VehicleDriverOption[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  onSelect?: (option: VehicleDriverOption) => void;
}) {
  const initialOption = options.find((o) => o.id === defaultValue);
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [query, setQuery] = useState(initialOption ? labelFor(initialOption) : "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() {
      if (open) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  // Position the (portaled) dropdown right below the input so it can escape
  // any overflow-clipping ancestor (fixed-height band rows).
  useLayoutEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open]);

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
      {open && coords
        ? createPortal(
            <div
              ref={dropdownRef}
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
                minWidth: 256,
                maxWidth: "calc(100vw - 1rem)",
              }}
              className="absolute z-50 max-h-[10rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
            >
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
                      onSelect?.(option);
                    }}
                  >
                    <span className="truncate">{labelFor(option)}</span>
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
