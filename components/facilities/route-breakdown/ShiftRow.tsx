"use client";

import { useState } from "react";
import { GripVertical, Clock, AlertCircle } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { GeneratedRouteTrip } from "@/actions/route-generation.actions";

interface ShiftRowProps {
  trip: GeneratedRouteTrip;
  routeId: string;
  vehicleId: string;
  isEditable: boolean;
  isFixedArrival: boolean;
  isLateNightShift: boolean;
  /** Shift arrival — drag metadata only (same-arrival validation), never displayed. */
  arrivalTime: string;
  /** When set (first row of a shift), the row renders a merged Arrival cell
   *  spanning every rider so the arrival time is shown once, in the middle. */
  arrivalRowSpan?: number;
  selected: boolean;
  onSelectTrip: (tripId: string | null) => void;
  onTimeChange: (tripId: string, newTime: string) => void;
}

export function ShiftRow({
  trip,
  routeId,
  vehicleId,
  isEditable,
  isFixedArrival,
  isLateNightShift,
  arrivalTime,
  arrivalRowSpan,
  selected,
  onSelectTrip,
  onTimeChange,
}: ShiftRowProps) {
  const [timeDraft, setTimeDraft] = useState(trip.pickupTime ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Unified drag system: the row is BOTH draggable (grip) and a drop target
  // (insertion point). All drag state flows through the single DndContext in
  // RouteBreakdown — no useSortable, so nothing fights over the transform.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id: `trip-${trip.id}`,
      data: {
        type: "trip",
        tripId: trip.id,
        routeId,
        vehicleId,
        arrivalTime,
        employeeName: trip.employeeName,
      },
      disabled: !isEditable,
    });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `trip-${trip.id}`,
    data: { type: "trip", tripId: trip.id, routeId, vehicleId },
    disabled: !isEditable,
  });

  function setRefs(node: HTMLTableRowElement | null) {
    setDragRef(node);
    setDropRef(node);
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizeTimeInput(e.target.value);
    setIsEditing(false);
    if (!normalized || normalized === trip.pickupTime) {
      // Invalid or unchanged — revert to the saved value.
      setTimeDraft(trip.pickupTime ?? "");
      return;
    }
    // Keep showing the typed value while the save + refresh completes; the
    // parent remounts this row (key includes pickupTime) once fresh data lands.
    setTimeDraft(normalized);
    setSaving(true);
    void Promise.resolve(onTimeChange(trip.id, normalized)).finally(() => {
      setSaving(false);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setTimeDraft(trip.pickupTime ?? "");
      setIsEditing(false);
      e.currentTarget.blur();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Accept partial HH:mm (or Hmm) input as the user types ("2", "21", "21:",
    // "21:0", "2105"…); full validity is enforced in normalizeTimeInput on blur.
    if (/^\d{0,2}:?\d{0,2}$/.test(value)) {
      setTimeDraft(value);
    }
  };

  const isFixed = trip.employeeRole === "FIXED_ARRIVAL" || isFixedArrival;
  const showDropHint = isOver && !isDragging;

  return (
    <tr
      ref={setRefs}
      className={`transition-all duration-150 animate-in fade-in duration-200 ${
        isDragging ? "opacity-40" : ""
      } ${selected ? "bg-teal/10" : ""} ${
        showDropHint ? "bg-teal/10 outline outline-2 outline-teal/50" : ""
      }`}
    >
      <td className="px-3 py-2 whitespace-nowrap">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="p-1 hover:bg-accent rounded cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag to reorder or move to another vehicle"
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectTrip(selected ? null : trip.id)}
            title={isFixed ? "Fixed-arrival employee — highlight on route map" : "Highlight on route map"}
            className={`truncate max-w-[280px] text-left ${isFixed ? "font-medium" : ""}`}
            style={{
              backgroundColor: isFixed ? "rgb(254 243 199)" : "transparent",
              borderRadius: "4px",
              padding: "2px 6px",
              outline: selected ? "2px solid #14b8a6" : "none",
            }}
          >
            {trip.employeeName}
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        {trip.pickupLocationLabel ? (
          <span
            className={`block ${isLateNightShift ? "max-w-none whitespace-normal text-sm" : "max-w-none whitespace-normal text-sm"}`}
          >
            {trip.pickupLocationLabel}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-1">
          {isEditable ? (
            <>
              <Input
                value={isEditing || saving ? timeDraft : trip.pickupTime ?? ""}
                onChange={handleChange}
                onFocus={() => setIsEditing(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="HH:mm"
                className="h-7 w-20 min-w-0 rounded-md px-1.5 text-right text-xs tabular-nums"
                aria-label="Pickup time (HH:mm)"
                disabled={!isEditable || saving}
              />
              {saving ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  Saving…
                </span>
              ) : (
                trip.pickupTime &&
                !isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                    aria-label="Edit pickup time"
                  >
                    <Clock className="size-3.5" />
                  </button>
                )
              )}
            </>
          ) : (
            <span className={trip.pickupTime ? "tabular-nums font-mono text-xs" : "text-muted-foreground text-xs"}>
              {trip.pickupTime ?? "—"}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-center">
        {showDropHint && (
          <span className="inline-flex items-center gap-1 text-xs text-teal bg-teal/10 px-2 py-0.5 rounded-full">
            <span className="size-1.5 rounded-full bg-teal animate-pulse" />
            Drop here
          </span>
        )}
        {isDragging && (
          <span className="inline-flex items-center gap-1 text-xs text-teal bg-teal/10 px-2 py-0.5 rounded-full">
            <span className="size-1.5 rounded-full bg-teal animate-pulse" />
            Moving…
          </span>
        )}
        {!trip.pickupTime && isEditable && (
          <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
            <AlertCircle className="size-2.5 mr-0.5" />
            No time
          </Badge>
        )}
      </td>
      {arrivalRowSpan ? (
        <td
          rowSpan={arrivalRowSpan}
          className="px-3 py-2 text-right align-middle whitespace-nowrap"
        >
          <span className="inline-block rounded bg-black px-2 py-0.5 font-mono text-xs font-medium text-white">
            {arrivalTime}
          </span>
        </td>
      ) : null}
    </tr>
  );
}

function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;

  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
