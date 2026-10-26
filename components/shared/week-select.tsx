"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type WeekSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** Week picker that navigates via the `week` search param (no form submit). */
export function WeekSelect({
  value,
  options,
  label,
}: {
  value: string;
  options: WeekSelectOption[];
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="shrink-0 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-44 rounded-md border border-input bg-background px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
