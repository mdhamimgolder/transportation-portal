import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAssignmentReportRows } from "@/lib/queries/reports";
import { excelSafeText } from "@/lib/csv";
import { SearchBox } from "@/components/shared/search-box";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { TransportTypeFilter } from "@/components/shared/transport-type-filter";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SuperAdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; type?: string }>;
}) {
  await requireRole([Role.SUPER_ADMIN]);
  const { q, from, to, type } = await searchParams;

  const allRows = await getAssignmentReportRows(q, from, to);
  const assignmentRows =
    type === "weekly"
      ? allRows.filter((r) => r.type === "Weekly")
      : type === "adhoc"
        ? allRows.filter((r) => r.type === "Ad-hoc")
        : allRows;

  const assignmentCsvRows = assignmentRows.map((r) => [
    r.type,
    r.employeeName,
    r.address ?? "—",
    r.contactNumber ? excelSafeText(r.contactNumber) : "—",
    r.dateLabel,
    r.pickupTime,
    r.driverName,
    excelSafeText(r.driverContactNumber),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Reports
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every driver assignment across the portal, filterable by transport
          type and date range, and exportable as CSV.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchBox placeholder="Search by employee name or employee ID" />
        <div className="flex flex-wrap items-end gap-2">
          <TransportTypeFilter />
          <DateRangeFilter />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium">
            Transport assignments
          </h2>
          <ExportCsvButton
            filename="transport-assignments-report.csv"
            headers={[
              "Type",
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
                <TableHead>Type</TableHead>
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
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No driver assignments in this range.
                  </TableCell>
                </TableRow>
              ) : (
                assignmentRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.type}</TableCell>
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
    </div>
  );
}
