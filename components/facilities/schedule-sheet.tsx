"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, GripVertical, Truck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import type {
  ScheduleSheetRow,
  ScheduleSheetVehicle,
} from "@/lib/queries/route-planning";
import {
  moveSheetAssignment,
  swapSheetAssignments,
  updateSheetPickupTime,
  type SheetMutationState,
} from "@/actions/route-assignment.actions";

type FlatRow = ScheduleSheetRow & {
  vehicleDriverId: string;
  vehicleNumber: string;
  driverName: string;
  contactNumber: string;
};

const byPickupTime = (a: FlatRow, b: FlatRow) =>
  (a.pickupTime || "99:99").localeCompare(b.pickupTime || "99:99");

function flatten(vehicles: ScheduleSheetVehicle[]): FlatRow[] {
  return vehicles.flatMap((v) =>
    v.rows.map((r) => ({
      ...r,
      vehicleDriverId: v.vehicleDriverId,
      vehicleNumber: v.vehicleNumber,
      driverName: v.driverName,
      contactNumber: v.contactNumber,
    }))
  );
}

/**
 * Spreadsheet-style route sheet: every employee is a row with an inline
 * editable pick-up time, grouped under its vehicle — exactly like a
 * spreadsheet row. Drag a full row onto another row to swap the two (vehicle
 * + time), or onto another vehicle's card to move it there keeping its time.
 * Every drop persists immediately.
 */
export function ScheduleSheet({
  vehicles,
  unassigned,
}: {
  vehicles: ScheduleSheetVehicle[];
  unassigned: ScheduleSheetRow[];
}) {
  const [rows, setRows] = useState<FlatRow[]>(() => flatten(vehicles));
  const [pool, setPool] = useState<ScheduleSheetRow[]>(() => unassigned);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Server re-render (after a mutation or an unrelated change) is the truth.
  // Derived-state adjustment during render (no effect, no cascading re-render).
  const [synced, setSynced] = useState({ vehicles, unassigned });
  if (synced.vehicles !== vehicles || synced.unassigned !== unassigned) {
    setSynced({ vehicles, unassigned });
    setRows(flatten(vehicles));
    setPool(unassigned);
  }

  const rowsFor = (vehicleDriverId: string) =>
    rows
      .filter((r) =>
        vehicleDriverId === ""
          ? !r.vehicleDriverId
          : r.vehicleDriverId === vehicleDriverId
      )
      .sort(byPickupTime);

  const findRow = (id: string) => rows.find((r) => r.weeklyScheduleDayId === id);

  async function run(
    rowId: string,
    mutation: () => Promise<SheetMutationState>
  ): Promise<boolean> {
    setBusyId(rowId);
    setError(null);
    try {
      const res = await mutation();
      if (res.error) {
        setError(res.error);
        return false;
      }
      return true;
    } catch {
      setError("Something went wrong — the change was not saved.");
      return false;
    } finally {
      setBusyId(null);
      setDragId(null);
      setOverKey(null);
    }
  }

  function handleTimeChange(row: FlatRow, value: string) {
    const previous = row.pickupTime;
    setRows((prev) =>
      prev.map((r) =>
        r.weeklyScheduleDayId === row.weeklyScheduleDayId
          ? { ...r, pickupTime: value }
          : r
      )
    );
    void run(row.weeklyScheduleDayId, () =>
      updateSheetPickupTime(row.weeklyScheduleDayId, value)
    ).then((ok) => {
      if (!ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.weeklyScheduleDayId === row.weeklyScheduleDayId
              ? { ...r, pickupTime: previous }
              : r
          )
        );
      }
    });
  }

  function handleDropOnVehicle(target: {
    vehicleDriverId: string;
    vehicleNumber: string;
    driverName: string;
    contactNumber: string;
  }) {
    if (!dragId) return;
    const dragged = findRow(dragId);
    if (!dragged) return;
    if (dragged.vehicleDriverId === target.vehicleDriverId) return;
    if (!dragged.pickupTime) {
      setError("Set a pick-up time first — then the row can move between vehicles.");
      setDragId(null);
      return;
    }
    const previous = rows;
    setRows((prev) =>
      prev.map((r) =>
        r.weeklyScheduleDayId === dragged.weeklyScheduleDayId
          ? {
              ...r,
              vehicleDriverId: target.vehicleDriverId,
              vehicleNumber: target.vehicleNumber,
              driverName: target.driverName,
              contactNumber: target.contactNumber,
            }
          : r
      )
    );
    void run(dragged.weeklyScheduleDayId, () =>
      moveSheetAssignment(dragged.weeklyScheduleDayId, target.vehicleDriverId)
    ).then((ok) => {
      if (!ok) setRows(previous);
    });
  }

  function handleDropOnRow(target: FlatRow) {
    if (!dragId) return;
    if (dragId === target.weeklyScheduleDayId) return;
    const dragged = findRow(dragId);
    if (!dragged) return;
    if (!dragged.pickupTime || !target.pickupTime) {
      // One of the two has no time yet — move instead of swap.
      if (target.vehicleDriverId) {
        handleDropOnVehicle(target);
        return;
      }
      setError("Both rows need a pick-up time before they can swap.");
      setDragId(null);
      return;
    }
    const previous = rows;
    setRows((prev) =>
      prev.map((r) => {
        if (r.weeklyScheduleDayId === dragged.weeklyScheduleDayId) {
          return {
            ...r,
            vehicleDriverId: target.vehicleDriverId,
            vehicleNumber: target.vehicleNumber,
            driverName: target.driverName,
            contactNumber: target.contactNumber,
            pickupTime: target.pickupTime,
          };
        }
        if (r.weeklyScheduleDayId === target.weeklyScheduleDayId) {
          return {
            ...r,
            vehicleDriverId: dragged.vehicleDriverId,
            vehicleNumber: dragged.vehicleNumber,
            driverName: dragged.driverName,
            contactNumber: dragged.contactNumber,
            pickupTime: dragged.pickupTime,
          };
        }
        return r;
      })
    );
    void run(dragged.weeklyScheduleDayId, () =>
      swapSheetAssignments(dragged.weeklyScheduleDayId, target.weeklyScheduleDayId)
    ).then((ok) => {
      if (!ok) setRows(previous);
    });
  }

  const vehicleCards = useMemo(() => {
    const used = new Set(
      rows.map((r) => r.vehicleDriverId).filter(Boolean) as string[]
    );
    return vehicles.filter((v) => used.has(v.vehicleDriverId) || v.rows.length > 0);
  }, [vehicles, rows]);

  const rowProps = {
    dragId,
    overKey,
    busyId,
    onDragStart: setDragId,
    onDragEnd: () => {
      setDragId(null);
      setOverKey(null);
    },
    onDragOver: setOverKey,
    onDrop: handleDropOnRow,
    onTimeChange: handleTimeChange,
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag a full row onto another row to swap the two (vehicle + pick-up time), or
        onto another vehicle&apos;s card to move it there keeping its time. Pick-up
        times are editable in place and save immediately.
      </p>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {vehicleCards.map((v) => {
          const list = rowsFor(v.vehicleDriverId);
          return (
            <div
              key={v.vehicleDriverId}
              onDragOver={(e) => {
                e.preventDefault();
                setOverKey(v.vehicleDriverId);
              }}
              onDragLeave={() =>
                setOverKey((k) => (k === v.vehicleDriverId ? null : k))
              }
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnVehicle(v);
              }}
              className={`rounded-lg border p-3 transition-colors ${
                overKey === v.vehicleDriverId ? "border-teal/50 bg-teal/5" : "bg-card"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 border-b pb-2">
                <Truck className="size-4 shrink-0 text-teal" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{v.vehicleNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.driverName}
                    {v.contactNumber ? ` · ${v.contactNumber}` : ""}
                  </p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {list.length} rider{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-1.5">
                {list.length === 0 ? (
                  <p className="rounded-md border border-dashed px-2 py-3 text-center text-xs text-muted-foreground">
                    Drop a row here
                  </p>
                ) : (
                  list.map((r) => (
                    <SheetRow key={r.weeklyScheduleDayId} row={r} {...rowProps} />
                  ))
                )}
              </div>
            </div>
          );
        })}
        {pool.length > 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 border-b pb-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm font-semibold">No vehicle yet</p>
              <span className="ml-auto text-xs text-muted-foreground">
                {pool.length} rider{pool.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-1.5">
              {pool.map((r) => (
                <SheetRow
                  key={r.weeklyScheduleDayId}
                  row={{
                    ...r,
                    vehicleDriverId: "",
                    vehicleNumber: "",
                    driverName: "",
                    contactNumber: "",
                  }}
                  {...rowProps}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SheetRow({
  row,
  dragId,
  overKey,
  busyId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onTimeChange,
}: {
  row: FlatRow;
  dragId: string | null;
  overKey: string | null;
  busyId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDrop: (row: FlatRow) => void;
  onTimeChange: (row: FlatRow, value: string) => void;
}) {
  const draggable = Boolean(row.pickupTime) && busyId === null;
  const isDragging = dragId === row.weeklyScheduleDayId;
  const isOver = overKey === row.weeklyScheduleDayId;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        onDragStart(row.weeklyScheduleDayId);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.weeklyScheduleDayId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(row.weeklyScheduleDayId);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(row);
      }}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
        isDragging
          ? "border-teal/50 bg-teal/5 opacity-60"
          : isOver
            ? "border-teal/40 bg-accent/40"
            : "bg-background hover:bg-accent/20"
      }`}
    >
      <GripVertical
        className={`size-4 shrink-0 ${
          draggable ? "text-muted-foreground" : "text-muted-foreground/30"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
          {row.employeeName}
          {row.employeeCode ? (
            <span className="text-xs font-normal text-muted-foreground">
              {row.employeeCode}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.pickupPoint || row.address || "—"}
          {row.requestedArrivalLabel ? ` · needs ${row.requestedArrivalLabel}` : ""}
        </p>
      </div>
      <Input
        type="time"
        step={300}
        value={row.pickupTime}
        disabled={busyId !== null && busyId !== row.weeklyScheduleDayId}
        onChange={(e) => onTimeChange(row, e.target.value)}
        className="h-8 w-24 shrink-0 tabular-nums"
        aria-label={`Pick-up time for ${row.employeeName}`}
      />
    </div>
  );
}
