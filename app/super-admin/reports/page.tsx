import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import {
  getWeeklyReportRows,
  getAdHocReportRows,
  getAssignmentReportRows,
} from "@/lib/queries/reports";
import { SearchBox } from "@/components/shared/search-box";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "APPROVED" || status === "ASSIGNED") return "secondary";
  if (status === "REJECTED" || status === "CANCELLED") return "destructive";
  return "outline";
}

export default async function SuperAdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  await requireRole([Role.SUPER_ADMIN]);
  const { q, from, to } = await searchParams;

  const [weeklyRows, adHocRows, assignmentRows] = await Promise.all([
    getWeeklyReportRows(q, from, to),
    getAdHocReportRows(q, from, to),
    getAssignmentReportRows(q, from, to),
  ]);

  const weeklyCsvRows = weeklyRows.map((r) => [
    r.employeeName,
    r.employeeCode ?? "—",
    r.weekLabel,
    r.status,
    String(r.daysNeedingTransport),
    r.submittedAtLabel,
  ]);

  const adHocCsvRows = adHocRows.map((r) => [
    r.employeeName,
    r.employeeCode ?? "—",
    r.dateLabel,
    r.arrivalTime,
    r.status,
    r.reason ?? "—",
  ]);

  const assignmentCsvRows = assignmentRows.map((r) => [
    r.employeeName,
    r.address ?? "—",
    r.contactNumber ?? "—",
    r.dateLabel,
    r.pickupTime,
    r.driverName,
    r.driverContactNumber,
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Reports
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every weekly schedule, ad-hoc request, and driver assignment across
          the portal, filterable by date range and exportable as CSV.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchBox placeholder="Search by employee name or employee ID" />
        <DateRangeFilter />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium">
            Transport assignments
          </h2>
          <ExportCsvButton
            filename="transport-assignments-report.csv"
            headers={[
              "Employee Name",
              "Address",
              "Contact Number",
              "Date",
              "Pick-up Time",
              "Assigned Driver Name",
              "Driver Contact Number",
            ]}
            rows={assignmentCsvRows}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Pick-up Time</TableHead>
                <TableHead>Assigned Driver Name</TableHead>
                <TableHead>Driver Contact Number</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignmentRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No driver assignments in this range.
                  </TableCell>
                </TableRow>
              ) : (
                assignmentRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {r.address ?? "—"}
                    </TableCell>
                    <TableCell>{r.contactNumber ?? "—"}</TableCell>
                    <TableCell>{r.dateLabel}</TableCell>
                    <TableCell className="font-mono">{r.pickupTime}</TableCell>
                    <TableCell>{r.driverName}</TableCell>
                    <TableCell>{r.driverContactNumber}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium">Weekly schedules</h2>
          <ExportCsvButton
            filename="weekly-schedules-report.csv"
            headers={[
              "Employee",
              "Employee ID",
              "Week",
              "Status",
              "Days needing transport",
              "Submitted",
            ]}
            rows={weeklyCsvRows}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Days needing transport</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No weekly schedules yet.
                  </TableCell>
                </TableRow>
              ) : (
                weeklyRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell>{r.employeeCode ?? "—"}</TableCell>
                    <TableCell>{r.weekLabel}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {r.daysNeedingTransport}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.submittedAtLabel}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium">Ad-hoc requests</h2>
          <ExportCsvButton
            filename="adhoc-requests-report.csv"
            headers={[
              "Employee",
              "Employee ID",
              "Date",
              "Arrival Time",
              "Status",
              "Reason",
            ]}
            rows={adHocCsvRows}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Arrival time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adHocRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No ad-hoc requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                adHocRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell>{r.employeeCode ?? "—"}</TableCell>
                    <TableCell>{r.dateLabel}</TableCell>
                    <TableCell className="font-mono">{r.arrivalTime}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {r.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
