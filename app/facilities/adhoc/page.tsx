import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { getUserNamesByIds } from "@/lib/queries/user-names";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { AssignmentForm } from "@/components/facilities/assignment-form";
import { cn } from "@/lib/utils";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

const BORDER_BY_STATUS: Record<string, string> = {
  PENDING: "border-l-amber",
  APPROVED: "border-l-teal",
  REJECTED: "border-l-red",
};

export default async function FacilitiesAdHocPage() {
  await requireRole([Role.FACILITIES]);

  // Visible as soon as an employee submits -- only assigned (or cancelled)
  // requests drop off, since those have already moved to Allocation History.
  const [requests, vehicleDrivers] = await Promise.all([
    prisma.adHocRequest.findMany({
      where: {
        status: {
          in: [AdHocStatus.PENDING, AdHocStatus.APPROVED, AdHocStatus.REJECTED],
        },
      },
      include: {
        employee: true,
        routeAssignment: { include: { vehicleDriver: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vehicleDriver.findMany({
      where: { isActive: true },
      orderBy: { driverName: "asc" },
    }),
  ]);

  const options = vehicleDrivers.map((v) => ({
    id: v.id,
    driverName: v.driverName,
    vehicleNumber: v.vehicleNumber,
    vendor: v.vendor,
  }));

  const reviewerNames = await getUserNamesByIds(requests.map((r) => r.reviewedById));
  const assignerNames = await getUserNamesByIds(
    requests.map((r) => r.routeAssignment?.assignedById)
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          All same-day requests, as submitted -- assign a vehicle right away.
          Assigned requests move to Allocation History.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ad-hoc requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            return (
              <Card
                key={request.id}
                className={cn("border-l-4", BORDER_BY_STATUS[request.status])}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {request.employee.fullName}{" "}
                      {request.employee.employeeCode ? (
                        <Badge variant="secondary" className="font-normal">
                          {request.employee.employeeCode}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {request.employee.email} &middot; {request.employee.contactNumber ?? "—"}
                  </p>
                  <p className="text-xs font-bold text-black dark:text-white">
                    {request.employee.address ?? "No address on file"}
                    {request.employee.pickupPoint
                      ? ` · Pick-up: ${request.employee.pickupPoint}`
                      : ""}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{formatShortDate(request.date)}</span>{" "}
                    &middot; requested{" "}
                    {ARRIVAL_TIME_LABELS[request.arrivalTime] ?? request.arrivalTime}
                  </p>
                  {request.reason ? (
                    <p className="text-sm text-muted-foreground">
                      Reason: {request.reason}
                    </p>
                  ) : null}

                  {request.status === AdHocStatus.REJECTED ? (
                    <p className="text-sm text-destructive">
                      Declined
                      {request.reviewedById && reviewerNames.get(request.reviewedById)
                        ? ` by ${reviewerNames.get(request.reviewedById)}`
                        : " by Operation-Admin"}
                      {request.rejectReason ? `: ${request.rejectReason}` : "."}
                    </p>
                  ) : null}

                  {request.status !== AdHocStatus.PENDING &&
                  request.status !== AdHocStatus.REJECTED &&
                  request.reviewedById &&
                  reviewerNames.get(request.reviewedById) ? (
                    <p className="text-xs text-muted-foreground">
                      Approved by {reviewerNames.get(request.reviewedById)}
                    </p>
                  ) : null}

                  <AssignmentForm
                    target={{ adHocRequestId: request.id }}
                    options={options}
                    pickupTimeMode="text"
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

                  {request.routeAssignment &&
                  assignerNames.get(request.routeAssignment.assignedById) ? (
                    <p className="text-xs text-muted-foreground">
                      Assigned by {assignerNames.get(request.routeAssignment.assignedById)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
