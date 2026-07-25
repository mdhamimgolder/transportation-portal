import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AllocationHistoryRow } from "@/lib/queries/allocation-history";

export function AllocationHistoryTable({
  rows,
  showTypeColumn = true,
}: {
  rows: AllocationHistoryRow[];
  showTypeColumn?: boolean;
}) {
  const columnCount = showTypeColumn ? 9 : 8;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-20 bg-background">Employee</TableHead>
            {showTypeColumn ? <TableHead>Type</TableHead> : null}
            <TableHead>Date</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Driver Contact</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Pickup Time</TableHead>
            <TableHead>Assigned</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                No allocation history yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="sticky left-0 z-10 bg-card">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.employeeName}</span>
                    {row.employeeCode ? (
                      <Badge variant="secondary" className="font-normal">
                        {row.employeeCode}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                {showTypeColumn ? <TableCell>{row.type}</TableCell> : null}
                <TableCell>{row.dateLabel}</TableCell>
                <TableCell>{row.driverName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.driverContactNumber}
                </TableCell>
                <TableCell>{row.vehicleNumber}</TableCell>
                <TableCell className="text-muted-foreground">{row.vendor}</TableCell>
                <TableCell>{row.pickupTime}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    <span>{row.assignedAtLabel}</span>
                    {row.assignedByName ? (
                      <span className="text-xs">by {row.assignedByName}</span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
