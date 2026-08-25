import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { AdHocRequestForm } from "@/components/employee/adhoc-request-form";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { formatShortDate } from "@/lib/date/week";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function AdHocPage() {
  const session = await requireRole([Role.EMPLOYEE]);

  const requests = await prisma.adHocRequest.findMany({
    where: { employeeId: session.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit a Request</CardTitle>
        </CardHeader>
        <CardContent>
          <AdHocRequestForm />
        </CardContent>
      </Card>

      {requests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatShortDate(request.date)} —{" "}
                    {ARRIVAL_TIME_LABELS[request.arrivalTime] ??
                      request.arrivalTime}
                  </p>
                  {request.reason ? (
                    <p className="text-xs text-muted-foreground">
                      {request.reason}
                    </p>
                  ) : null}
                  {request.facilitiesComment ? (
                    <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                      Note from Facilities: {request.facilitiesComment}
                    </p>
                  ) : null}
                  {request.status === AdHocStatus.REJECTED && request.rejectReason ? (
                    <p className="mt-1 text-xs text-destructive">
                      Declined: {request.rejectReason}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={request.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
