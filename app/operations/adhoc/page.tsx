import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { StatusBadge } from "@/components/shared/status-badge";
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
          Read-only oversight of single-day requests. These bypass Operations
          approval and go straight to Facilities for assignment.
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
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
