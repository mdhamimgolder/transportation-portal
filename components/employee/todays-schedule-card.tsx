import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TodaysScheduleEntry = {
  id: string;
  pickupTime: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  requestType: string;
};

/** Facilities' pickup-time field isn't format-enforced, so real data includes
 *  things like "10.00" or "2.20 AM" alongside proper "HH:mm" -- only compact
 *  the ones that actually match, and leave anything else exactly as stored. */
function formatCompactTime(raw: string): string {
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour < 12 ? "a" : "p";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute}${period}`;
}

export function TodaysScheduleCard({
  entries,
  className,
}: {
  entries: TodaysScheduleEntry[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <MapPin className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground">Today&apos;s schedule</p>
        </div>
        {entries.length > 0 ? (
          <span className="font-mono text-xs text-muted-foreground">
            {entries.length} trip{entries.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pick-up scheduled today.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Pick-up Time</TableHead>
                <TableHead>Driver Name</TableHead>
                <TableHead>Contact No</TableHead>
                <TableHead>Vehicle No</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono font-semibold tabular-nums text-black">
                    {formatCompactTime(entry.pickupTime)}
                  </TableCell>
                  <TableCell className="font-medium text-black">{entry.driverName}</TableCell>
                  <TableCell className="text-black">{entry.contactNumber}</TableCell>
                  <TableCell className="text-black">{entry.vehicleNumber}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {entry.requestType}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
