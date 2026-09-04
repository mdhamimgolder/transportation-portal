"use client";

import * as React from "react";
import { Search, Check, ChevronsUpDown } from "lucide-react";
import { Popover } from "radix-ui";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ComboboxOption = {
  value: string;
  label: React.ReactNode;
  searchText: string;
};

type SearchableComboboxProps = {
  value?: string;
  onChange?: (value: string) => void;
  onOpenAutoFocus?: () => void;
  placeholder?: string;
  emptyText?: string;
  options: ComboboxOption[];
  className?: string;
  id?: string;
};

/**
 * A searchable dropdown built on Radix Popover.
 * Type in the filter box to narrow a long list of options.
 */
export function SearchableCombobox({
  value,
  onChange,
  onOpenAutoFocus,
  placeholder = "Select an option",
  emptyText = "No options found.",
  options,
  className,
  id,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.value === value);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchText.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between gap-2 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="line-clamp-1 text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={onOpenAutoFocus}
          className="z-50 max-h-[320px] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            )}
            {filtered.map((option) => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-none select-none",
                    "focus:bg-accent focus:text-accent-foreground",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className="line-clamp-1 flex-1">{option.label}</span>
                  {isActive && <Check className="size-4 shrink-0 text-accent-foreground" />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
