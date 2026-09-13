"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { updateFixedArrivalServiceAction } from "@/actions/facilities-profile.actions";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
} from "@/lib/constants/arrival-times";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FixedArrivalServiceControlsProps = {
  userId: string;
  active: boolean;
  arrivalTime: string | null;
};

export function FixedArrivalServiceControls({
  userId,
  active,
  arrivalTime,
}: FixedArrivalServiceControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentActive, setCurrentActive] = useState(active);
  const [currentTime, setCurrentTime] = useState<string | null>(arrivalTime);
  const [error, setError] = useState<string | null>(null);

  const disabled = isPending;

  function handleToggle() {
    if (disabled) return;
    const next = !currentActive;
    setCurrentActive(next);
    setError(null);
    startTransition(async () => {
      const result = await updateFixedArrivalServiceAction(userId, { active: next });
      if (result.error) {
        setCurrentActive(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleTimeChange(value: string) {
    if (disabled) return;
    const nextTime = value === NO_TRANSPORT_VALUE ? null : value;
    const prevTime = currentTime;
    setCurrentTime(nextTime);
    setError(null);
    startTransition(async () => {
      const result = await updateFixedArrivalServiceAction(userId, {
        arrivalTime: value === NO_TRANSPORT_VALUE ? null : value,
      });
      if (result.error) {
        setCurrentTime(prevTime);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={currentActive}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition-colors",
          currentActive
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-border bg-muted text-muted-foreground",
          disabled && "opacity-50"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            currentActive ? "bg-emerald-500" : "bg-muted-foreground/50"
          )}
        />
        {currentActive ? "On" : "Off"}
      </button>
      <Select
        value={currentTime ?? NO_TRANSPORT_VALUE}
        onValueChange={handleTimeChange}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-7 w-fit gap-1 text-xs"
          title={
            currentActive
              ? "Change fixed arrival time"
              : "Arrival time kept while service is off"
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TRANSPORT_VALUE}>Not set</SelectItem>
          {ARRIVAL_TIME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="max-w-40 text-xs text-destructive" title={error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}