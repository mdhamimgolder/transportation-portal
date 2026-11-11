"use client";

import { useState } from "react";
import {
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Copy,
  Inbox,
  MapPin,
  Search,
} from "lucide-react";
import { formatShortDate } from "@/lib/date/week";
import {
  ADHOC_ARRIVAL_TIME_OPTIONS,
  ADHOC_PICKUP_REQUIRED_TIME,
} from "@/lib/constants/adhoc-arrival-times";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";
import {
  AssignmentForm,
  type VehicleDriverOption,
} from "@/components/facilities/assignment-form";
import {
  CopyDetailsButton,
  NoteComposer,
} from "@/components/facilities/adhoc-actions";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((option) => [option.value, option.label])
);

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

function initials(fullName: string): string {
  return getInitials(fullName);
}

function CopyPhoneButton({ phone }: { phone: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-7 shrink-0 text-muted-foreground"
      disabled={!phone}
      aria-label={copied ? "Phone number copied" : "Copy phone number"}
      title={copied ? "Copied" : "Copy phone number"}
      onClick={copyPhone}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

export function AdHocList({
  requests,
  options,
  resolvedThisWeekCount,
  declinedCount,
}: {
  requests: AdHocListRequest[];
  options: VehicleDriverOption[];
  resolvedThisWeekCount: number;
  declinedCount: number;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();

  const filteredRequests = requests.filter((request) => {
    if (!query) return true;

    return [
      request.employee.fullName,
      request.employee.employeeCode,
      request.employee.contactNumber,
      request.employee.email,
      request.employee.address,
      request.employee.pickupPoint,
      request.reason,
      request.routeAssignment?.vehicleDriver.driverName,
      request.routeAssignment?.vehicleDriver.vehicleNumber,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(query));
  });

  return (
    <div className="space-y-4">
      <section aria-label="Ad-hoc queue summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Today in Queue</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
              {requests.length}
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
            <Inbox className="size-4" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">This week (Resolved)</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-emerald-700">
              {resolvedThisWeekCount}
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-md bg-emerald-500/10 text-emerald-700">
            <CircleCheck className="size-4" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Declined</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
              {declinedCount}
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
            <CircleX className="size-4" />
          </span>
        </div>
      </section>

      <div className="flex justify-end">
        <label className="relative block w-full md:max-w-sm">
          <span className="sr-only">Search ad-hoc requests</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee, phone, address, pickup point..."
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card" aria-label="Ad-hoc request assignments">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="min-w-[220px] px-4 py-3">Employee</th>
                <th scope="col" className="min-w-[260px] px-3 py-3">Address &amp; pick-up point</th>
                <th scope="col" className="min-w-[130px] px-3 py-3">Arrival time</th>
                <th scope="col" className="min-w-[350px] px-3 py-3">Vehicle assignment</th>
                <th scope="col" className="min-w-[90px] px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">
                      {requests.length === 0 ? "No active ad-hoc requests" : "No requests match these filters"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {requests.length === 0
                        ? "New employee requests will appear here."
                        : "Try another filter or search term."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => {
                  const pickup = request.employee.pickupPoint;
                  const pickupRequired = request.arrivalTime === ADHOC_PICKUP_REQUIRED_TIME;
                  const pickupClass = pickup
                    ? "border-role-accent/20 bg-role-accent-soft text-role-accent-deep"
                    : pickupRequired
                      ? "border-amber/30 bg-amber/10 text-amber-foreground"
                      : "border-border bg-muted/50 text-muted-foreground";
                  const pickupLabel = pickup
                    ? `Pick-up: ${pickup}`
                    : pickupRequired
                      ? "Pick-up point required"
                      : "Pick-up: not provided";

                  return (
                    <tr
                      key={request.id}
                      className="group transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted font-mono text-[11px] font-semibold text-muted-foreground"
                          >
                            {initials(request.employee.fullName)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-foreground" title={request.employee.fullName}>
                                {request.employee.fullName}
                              </p>
                              <StatusBadge status={request.status} />
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="truncate font-mono tabular-nums">
                                {request.employee.contactNumber ?? "No phone"}
                              </span>
                              <CopyPhoneButton phone={request.employee.contactNumber} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <div className="max-w-sm space-y-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full bg-role-accent" />
                            <span className={`truncate rounded border px-2 py-0.5 text-xs font-medium ${pickupClass}`} title={pickupLabel}>
                              {pickupLabel}
                            </span>
                          </div>
                          <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground" title={request.employee.address ?? "No address on file"}>
                            <MapPin className="mt-0.5 size-3.5 shrink-0" />
                            <span className="truncate">{request.employee.address ?? "No address on file"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <div className="inline-flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
                            <Clock3 className="size-3 text-muted-foreground" />
                            {ARRIVAL_TIME_LABELS[request.arrivalTime] ?? request.arrivalTime}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatShortDate(request.date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
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
                        />
                      </td>
                      <td className="px-3 py-3.5 text-right align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <CopyDetailsButton
                            employeeName={request.employee.fullName}
                            address={request.employee.address}
                            pickupTime={request.routeAssignment?.pickupTime ?? ""}
                            driverName={request.routeAssignment?.vehicleDriver.driverName ?? ""}
                          />
                          <NoteComposer
                            adHocRequestId={request.id}
                            existingComment={request.facilitiesComment}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <strong className="font-semibold text-foreground">{filteredRequests.length}</strong> of{" "}
            <strong className="font-semibold text-foreground">{requests.length}</strong> requests
          </span>
          <span className="text-emerald-700">Assigned rides remain available in the Assigned filter today.</span>
        </div>
      </section>
    </div>
  );
}