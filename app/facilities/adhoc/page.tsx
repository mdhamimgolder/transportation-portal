import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { AssignmentForm } from "@/components/facilities/assignment-form";
import { cn } from "@/lib/utils";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function FacilitiesAdHocPage() {
  await requireRole([Role.FACILITIES]);

  const [requests, vehicleDrivers] = await Promise.all([
    prisma.adHocRequest.findMany({
      where: { status: { not: "CANCELLED" } },
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          Urgent, single-day requests. These bypass Operations approval --
          assign a vehicle & driver and pickup time as soon as possible.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ad-hoc requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isPending = request.status === "PENDING";
            return (
              <Card
                key={request.id}
                className={cn(
                  "border-l-4",
                  isPending ? "border-l-red bg-red/5" : "border-l-green"
                )}
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
