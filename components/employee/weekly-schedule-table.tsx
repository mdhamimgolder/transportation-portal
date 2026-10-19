"use client";

/**
 * WeeklyScheduleTable — the employee's weekly office-transport schedule as a
 * clean, scannable table. One row per weekday (Mon–Fri).
 *
 * This is a deliberate departure from any timeline/visualization: it is a
 * classic professional table — each day its own row, the arrival time a quiet
 * "ticket" chip, and the status (transport required or not) a small badge.
 *
 * Interaction is light-touch "review": hover highlights a row, and clicking a
 * row expands a single detail line beneath it with the assigned driver name,
 * vehicle number, and pick-up time. No modals, no motion noise — just a table
 * that's pleasant to read and easy to verify the day after.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Clock } from "lucide-react";

export type ScheduleDay = {
  label: string;
  dateLabel: string;
  /** ISO weekday number 1–5 (Monday–Friday). */
  dayOfWeek: number;
  needsTransport: boolean;
  arrivalTime: string | null;
  /** Route-assignment detail shown when the row is expanded. */
  assignment?: {
    driverName: string;
    vehicleNumber: string;
    pickupTime: string;
  } | null;
};

/** Format "HH:mm" (24h) as a friendly "10:00 PM" label. */
export function arrivalLabel(arrivalTime: string): string {
  const [h, m] = arrivalTime.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

type TableProps = {
  days: ScheduleDay[];
  /** Heading row above the table (e.g. "This week's schedule"). */
  title?: string;
  subtitle?: string;
  statusNode?: ReactNode;
  /** Show a compact per-week variant with no expandable detail. */
  compact?: boolean;
  /** Show only day and arrival time for the dashboard summary. */
  summary?: boolean;
};

export function WeeklyScheduleTable({
  days,
  title,
  subtitle,
  statusNode,
  compact = false,
  summary = false,
}: TableProps) {
  const [open, setOpen] = useState<number | null>(null);

  const withTransport = days.filter(
    (d) => d.needsTransport && d.arrivalTime
  ).length;
  const earliest = days
    .filter((d) => d.needsTransport && d.arrivalTime)
    .map((d) => ({ label: arrivalLabel(d.arrivalTime!), raw: d.arrivalTime! }))
    .sort((a, b) => a.raw.localeCompare(b.raw))[0];

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      {(title || statusNode) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div>
            {title ? (
              <h2 className="font-display text-base font-semibold text-foreground">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {statusNode}
        </div>
      )}

      {summary ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
          <tbody>
            <tr className="border-b border-border/60">
              <th
                scope="row"
                className="w-28 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-36 sm:px-5"
              >
                Days
              </th>
              {days.map((day) => (
                <td
                  key={day.dayOfWeek}
                  className="px-2 py-3 text-center font-display text-[13px] font-semibold text-foreground"
                >
                  {day.label.slice(0, 3)}
                </td>
              ))}
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-5"
              >
                Arrival time
              </th>
              {days.map((day) => {
                const active = day.needsTransport && day.arrivalTime !== null;
                return (
                  <td key={day.dayOfWeek} className="px-2 py-3 text-center">
                    {active ? (
                      <span className="font-mono text-[13px] font-medium text-foreground">
                        {arrivalLabel(day.arrivalTime!)}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">Off</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              <th className="px-4 py-2 font-medium sm:px-5">Day</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                Status
              </th>
              <th className="px-3 py-2 text-right font-medium">Arrival time</th>
              <th className="w-8" aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const active = d.needsTransport && d.arrivalTime !== null;
              const isOpen = open === d.dayOfWeek;
              return (
                <DayRow
                  key={d.dayOfWeek}
                  day={d}
                  active={active}
                  isOpen={isOpen}
                  compact={compact}
                  onToggle={() => setOpen(isOpen ? null : d.dayOfWeek)}
                />
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Quiet summary footer — the one place the data is condensed. */}
      {!compact && days.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-2.5 text-xs sm:px-5"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {withTransport} of {days.length} days with transport
          </span>
          {earliest ? (
            <span>
              Earliest ride{" "}
              <span
                className="font-mono font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {earliest.label}
              </span>
            </span>
          ) : null}
          <span className="ml-auto hidden sm:inline">
            Select a row to see the driver and pick-up details
          </span>
        </div>
      )}
    </div>
  );
}

function DayRow({
  day,
  active,
  isOpen,
  compact,
  onToggle,
}: {
  day: ScheduleDay;
  active: boolean;
  isOpen: boolean;
  compact: boolean;
  onToggle: () => void;
}) {
  const timeChip = active ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[13px] font-medium"
      style={{
        borderColor: "color-mix(in srgb, var(--amber) 45%, transparent)",
        background: "color-mix(in srgb, var(--amber) 12%, transparent)",
        color: "var(--amber-foreground)",
      }}
    >
      {arrivalLabel(day.arrivalTime!)}
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-[13px]"
      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
    >
      Off
    </span>
  );

  return (
    <>
      <tr
        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
        style={{ cursor: compact ? "default" : "pointer" }}
        onClick={compact ? undefined : onToggle}
        onKeyDown={
          compact
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
        }
        tabIndex={compact ? undefined : 0}
        role={compact ? undefined : "button"}
        aria-expanded={compact ? undefined : isOpen}
        aria-label={`${day.label} driver and pick-up details`}
      >
        <td className="px-4 py-3 sm:px-5">
          <div className="font-display text-[13px] font-semibold text-foreground">
            {day.label}
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-[13px]" style={{ color: "var(--muted-foreground)" }}>
          {day.dateLabel}
        </td>
        <td className="hidden px-3 py-3 sm:table-cell">
          <StatusPill active={active} />
        </td>
        <td className="px-3 py-3 text-right">{timeChip}</td>
        <td className="px-2 py-3 text-right">
          {!compact && (
            <ChevronDown
              className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              style={{ color: "var(--muted-foreground)" }}
            />
          )}
        </td>
      </tr>

      {/* Expandable detail line — date, driver, vehicle, pick-up time only. */}
      {!compact && isOpen && (
        <tr
          className="border-b border-border/60 last:border-0"
          style={{ background: "var(--muted)" }}
        >
          <td colSpan={5} className="px-4 py-2.5 sm:px-5">
            {day.assignment ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium text-foreground">
                    {day.dateLabel}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Driver:</span>
                  <span className="font-medium text-foreground">
                    {day.assignment.driverName}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Vehicle:</span>
                  <span className="font-mono font-medium text-foreground">
                    {day.assignment.vehicleNumber}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Pick-up:</span>
                  <span className="font-mono font-medium text-foreground">
                    {day.assignment.pickupTime}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium text-foreground">
                    {day.dateLabel}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: active ? "var(--amber)" : "var(--border)" }}
                  />
                  <span className="text-muted-foreground">
                    {active ? "Not assigned yet" : "No transport"}
                  </span>
                </span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={
        active
          ? {
              background: "color-mix(in srgb, var(--green) 14%, transparent)",
              color: "var(--green)",
            }
          : {
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }
      }
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ background: active ? "var(--green)" : "var(--border)" }}
      />
      {active ? "On" : "Off"}
    </span>
  );
}
