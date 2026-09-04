"use client";

import { formatShortDate } from "@/lib/date/week";
import {
  ADHOC_ARRIVAL_TIME_OPTIONS,
  ADHOC_PICKUP_REQUIRED_TIME,
} from "@/lib/constants/adhoc-arrival-times";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AssignmentForm,
  type VehicleDriverOption,
} from "@/components/facilities/assignment-form";
import {
  CopyDetailsButton,
  NoteComposer,
} from "@/components/facilities/adhoc-actions";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

// Dispatch rail colour follows the request's place in the review chain:
// amber while it awaits review, teal once approved, red once declined.
const RAIL_BY_STATUS: Record<string, string> = {
  PENDING: "var(--amber)",
  APPROVED: "var(--teal)",
  REJECTED: "var(--red)",
};

export type AdHocListRequest = {
  id: string;
  status: string;
  rejectReason: string | null;
  facilitiesComment: string | null;
  date: Date;
  arrivalTime: string;
  reason: string | null;
  reviewedById: string | null;
  employee: {
    fullName: string;
    employeeCode: string | null;
    email: string;
    contactNumber: string | null;
    address: string | null;
    pickupPoint: string | null;
  };
  routeAssignment: {
    vehicleDriverId: string;
    pickupTime: string;
    assignedById: string | null;
    vehicleDriver: { driverName: string; vehicleNumber: string };
  } | null;
};

export function AdHocList({
  requests,
  options,
}: {
  requests: AdHocListRequest[];
  options: VehicleDriverOption[];
}) {
  return (
    <div className="space-y-2">
      {requests.map((request) => {
        const pickup = request.employee.pickupPoint;
        const pickupRequired =
          request.arrivalTime === ADHOC_PICKUP_REQUIRED_TIME;
        const pickupCellClass = pickup
          ? "bg-role-accent-soft text-role-accent-deep font-medium"
          : pickupRequired
            ? "bg-amber/15 text-amber-foreground font-semibold"
            : "text-muted-foreground";
        const pickupDisplay = pickup
          ? `Pick-up: ${pickup}`
          : pickupRequired
            ? "Pick-up required"
            : "Pick-up: —";

        return (
          <article
            key={request.id}
            className="relative overflow-hidden rounded-lg border bg-card"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ background: RAIL_BY_STATUS[request.status] ?? "var(--muted)" }}
            />

            <div className="grid h-24 gap-0 overflow-hidden sm:grid-cols-[minmax(0,1fr)_5rem_25rem]">
              {/* Left: identity + required data (fills the box) */}
              <div className="flex min-w-0 flex-col justify-center gap-[3px] overflow-hidden px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
                    {request.employee.fullName}
                  </h3>
                  <StatusBadge status={request.status} />
                </div>

                <p
                  className="min-w-0 truncate text-[13px] font-medium leading-tight text-foreground"
                  title={request.employee.address ?? "—"}
                >
                  {request.employee.address ?? "—"}
                </p>

                <div className="flex min-w-0 items-center gap-2 text-[13px] leading-tight">
                  <span className="shrink-0 text-muted-foreground">
                    {request.employee.contactNumber ?? "—"}
                  </span>
                  <span
                    className={`min-w-0 truncate rounded px-1.5 ${pickupCellClass}`}
                    title={pickupDisplay}
                  >
                    {pickupDisplay}
                  </span>
                </div>
              </div>

              {/* Middle: narrow exact arrival column -- no blank space */}
              <div className="flex items-center justify-center border-t sm:border-t-0 sm:border-l">
                <div className="rounded-md bg-amber/15 px-2 py-1 text-center">
                  <p className="text-[10px] leading-tight tracking-wide text-amber-foreground/70 uppercase whitespace-nowrap">
                    {formatShortDate(request.date)}
                  </p>
                  <p className="font-mono text-sm leading-tight font-semibold tabular-nums text-amber-foreground whitespace-nowrap">
                    {ARRIVAL_TIME_LABELS[request.arrivalTime] ?? request.arrivalTime}
                  </p>
                </div>
              </div>

              {/* Placement tool -- exact 25rem column */}
              <div className="flex flex-col justify-center gap-1.5 border-t bg-muted/40 p-1.5 sm:border-t-0 sm:border-l">
                <AssignmentForm
                  target={{ adHocRequestId: request.id }}
                  options={options}
                  pickupTimeMode="text"
                  variant="panel"
                  existing={
                    request.routeAssignment
                      ? {
                          vehicleDriverId: request.routeAssignment.vehicleDriverId,
                          driverName: request.routeAssignment.vehicleDriver.driverName,
                          vehicleNumber: request.routeAssignment.vehicleDriver.vehicleNumber,
                          pickupTime: request.routeAssignment.pickupTime,
                        }
                      : undefined
                  }
                  existingComment={request.facilitiesComment}
                  actions={(live) => (
                    <div className="flex items-center gap-0.5">
                      <CopyDetailsButton
                        employeeName={request.employee.fullName}
                        address={request.employee.address}
                        pickupTime={
                          live.pickupTime || request.routeAssignment?.pickupTime || ""
                        }
                        driverName={
                          live.driverName ||
                          request.routeAssignment?.vehicleDriver.driverName ||
                          ""
                        }
                      />
                      <NoteComposer
                        adHocRequestId={request.id}
                        existingComment={request.facilitiesComment}
                      />
                    </div>
                  )}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}