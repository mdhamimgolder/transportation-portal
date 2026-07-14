import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { StatusBadge } from "@/components/shared/status-badge";
import { AdHocApprovalActions } from "@/components/operations/adhoc-approval-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function OperationsAdHocPage() {
  await requireRole([Role.OPERATIONS]);

  const requests = await prisma.adHocRequest.findMany({
    include: { employee: true, routeAssignment: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          Approve or decline single-day requests. Approved requests go to
          Facilities for vehicle assignment.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Contact Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Arrival Time</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No ad-hoc requests yet.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {request.employee.fullName}
                  </TableCell>
                  <TableCell>{request.employee.employeeCode ?? "—"}</TableCell>
                  <TableCell>{request.employee.email}</TableCell>
                  <TableCell>{request.employee.contactNumber ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatShortDate(request.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ARRIVAL_TIME_LABELS[request.arrivalTime] ?? request.arrivalTime}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {request.reason ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                    {request.status === AdHocStatus.REJECTED && request.rejectReason ? (
                      <p className="mt-1 max-w-40 text-xs text-muted-foreground">
                        {request.rejectReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {request.status === AdHocStatus.PENDING ? (
                      <AdHocApprovalActions
                        requestId={request.id}
                        employeeName={request.employee.fullName}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
